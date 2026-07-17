import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@/db/client";
import {
  approvalRecords,
  auditEvents,
  dependencyEdges,
  dependencyEdgeVersions,
  membershipRoles,
  outboxEvents,
} from "@/db/schema";
import { type TenantContext, withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { assertIdempotencyActor } from "@/lib/security/idempotency";
import { GOVERNED_AI_THRESHOLDS } from "@/ai/contracts/tasks";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const uuidSchema = z.string().uuid();
const idempotencyKeySchema = z.string().trim().min(8).max(255);
const rationaleSchema = z.string().trim().min(1);
const confidenceSchema = z.number().min(0).max(1);

export type EdgeOverrideClass = "load_bearing" | "peripheral";

export type EdgeReviewResult = {
  edgeId: string;
  edgeVersionId: string;
  reviewStatus: "reviewed";
  decision: "accepted" | "overridden";
  ai: {
    confidence: number;
    rationale: string;
    loadBearingScore: number;
  };
  impact: {
    class: "rewrite_required" | "line_edit";
    humanReviewed: true;
    overrideClass?: EdgeOverrideClass;
    overrideReason?: string;
  };
};

export function resolveReviewedEdgeImpact(input: {
  decision: "accepted" | "overridden";
  loadBearingScore: number;
  overrideClass?: EdgeOverrideClass;
}) {
  if (input.decision === "overridden") {
    return input.overrideClass === "load_bearing"
      ? ("rewrite_required" as const)
      : ("line_edit" as const);
  }

  return input.loadBearingScore >= GOVERNED_AI_THRESHOLDS.rewriteRequired
    ? ("rewrite_required" as const)
    : ("line_edit" as const);
}

async function requireEdgeReviewer(
  transaction: Transaction,
  actor: TenantContext,
) {
  const [role] = await transaction
    .select({ roleCode: membershipRoles.roleCode })
    .from(membershipRoles)
    .where(
      and(
        eq(membershipRoles.organizationId, actor.organizationId),
        eq(membershipRoles.membershipId, actor.actorMembershipId),
        eq(membershipRoles.roleCode, "edge_reviewer"),
      ),
    )
    .limit(1);

  if (!role) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "The edge_reviewer role is required.",
      status: 403,
    });
  }
}

async function reserveEvent(
  transaction: Transaction,
  input: {
    organizationId: string;
    idempotencyKey: string;
    eventName: string;
    edgeId: string;
    payload: Record<string, unknown>;
  },
) {
  const [event] = await transaction
    .insert(outboxEvents)
    .values({
      organizationId: input.organizationId,
      idempotencyKey: input.idempotencyKey,
      eventName: input.eventName,
      aggregateType: "dependency_edge",
      aggregateId: input.edgeId,
      payload: input.payload,
    })
    .onConflictDoNothing({
      target: [outboxEvents.organizationId, outboxEvents.idempotencyKey],
    })
    .returning({
      eventName: outboxEvents.eventName,
      payload: outboxEvents.payload,
    });
  if (event) return { duplicate: false, payload: event.payload };

  const [existing] = await transaction
    .select({
      eventName: outboxEvents.eventName,
      payload: outboxEvents.payload,
    })
    .from(outboxEvents)
    .where(
      and(
        eq(outboxEvents.organizationId, input.organizationId),
        eq(outboxEvents.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Idempotency reservation disappeared.");
  if (existing.eventName !== input.eventName) {
    throw new AppError({
      code: "CONFLICT",
      message: "The idempotency key was already used for another operation.",
      status: 409,
    });
  }
  return { duplicate: true, payload: existing.payload };
}

function parseExistingResult(payload: Record<string, unknown>) {
  const result = edgeReviewResultSchema.parse(payload.result);
  const impact: EdgeReviewResult["impact"] = {
    class: result.impact.class,
    humanReviewed: true,
  };
  if (result.impact.overrideClass) {
    impact.overrideClass = result.impact.overrideClass;
  }
  if (result.impact.overrideReason) {
    impact.overrideReason = result.impact.overrideReason;
  }

  return { ...result, impact };
}

async function getEdgeVersion(
  transaction: Transaction,
  organizationId: string,
  edgeId: string,
  edgeVersionId: string,
) {
  const [row] = await transaction
    .select({
      edgeId: dependencyEdges.id,
      edgeVersionId: dependencyEdgeVersions.id,
      confidence: dependencyEdgeVersions.confidence,
      reviewStatus: dependencyEdgeVersions.reviewStatus,
      lockedAt: dependencyEdgeVersions.lockedAt,
    })
    .from(dependencyEdges)
    .innerJoin(
      dependencyEdgeVersions,
      eq(dependencyEdgeVersions.edgeId, dependencyEdges.id),
    )
    .where(
      and(
        eq(dependencyEdges.organizationId, organizationId),
        eq(dependencyEdges.id, edgeId),
        eq(dependencyEdgeVersions.organizationId, organizationId),
        eq(dependencyEdgeVersions.id, edgeVersionId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Dependency edge version not found.",
      status: 404,
    });
  }
  if (row.lockedAt || row.reviewStatus === "reviewed") {
    throw new AppError({
      code: "CONFLICT",
      message: "Dependency edge version is already reviewed.",
      status: 409,
    });
  }

  return row;
}

function buildResult(input: {
  edgeId: string;
  edgeVersionId: string;
  confidence: string;
  decision: "accepted" | "overridden";
  aiRationale: string;
  loadBearingScore: number;
  overrideClass?: EdgeOverrideClass;
  overrideReason?: string;
}): EdgeReviewResult {
  const impact: EdgeReviewResult["impact"] = {
    class: resolveReviewedEdgeImpact(input),
    humanReviewed: true,
  };
  if (input.overrideClass) impact.overrideClass = input.overrideClass;
  if (input.overrideReason) impact.overrideReason = input.overrideReason;

  return {
    edgeId: input.edgeId,
    edgeVersionId: input.edgeVersionId,
    reviewStatus: "reviewed",
    decision: input.decision,
    ai: {
      confidence: Number(input.confidence),
      rationale: input.aiRationale,
      loadBearingScore: input.loadBearingScore,
    },
    impact,
  };
}

async function reviewDependencyEdge(
  actor: TenantContext,
  input: {
    idempotencyKey: string;
    edgeId: string;
    edgeVersionId: string;
    decision: "accepted" | "overridden";
    aiRationale: string;
    loadBearingScore: number;
    overrideClass?: EdgeOverrideClass;
    overrideReason?: string;
    now?: Date;
  },
): Promise<EdgeReviewResult> {
  const ids = {
    edgeId: uuidSchema.parse(input.edgeId),
    edgeVersionId: uuidSchema.parse(input.edgeVersionId),
  };
  const parsed = {
    idempotencyKey: idempotencyKeySchema.parse(input.idempotencyKey),
    aiRationale: rationaleSchema.parse(input.aiRationale),
    loadBearingScore: confidenceSchema.parse(input.loadBearingScore),
    overrideReason: input.overrideReason
      ? rationaleSchema.parse(input.overrideReason)
      : undefined,
  };
  const now = input.now ?? new Date();
  const eventName =
    input.decision === "accepted" ? "edge.accepted" : "edge.overridden";
  const approvalAction =
    input.decision === "accepted" ? "edge_accepted" : "edge_overridden";

  return withTenantContext(actor, async (transaction) => {
    await requireEdgeReviewer(transaction, actor);
    const reservation = await reserveEvent(transaction, {
      organizationId: actor.organizationId,
      idempotencyKey: parsed.idempotencyKey,
      eventName,
      edgeId: ids.edgeId,
      payload: {
        ...ids,
        actorMembershipId: actor.actorMembershipId,
        result: null,
      },
    });
    if (reservation.duplicate) {
      assertIdempotencyActor(reservation.payload, actor.actorMembershipId);
      return parseExistingResult(reservation.payload);
    }

    const edgeVersion = await getEdgeVersion(
      transaction,
      actor.organizationId,
      ids.edgeId,
      ids.edgeVersionId,
    );
    const result = buildResult({
      ...ids,
      confidence: edgeVersion.confidence,
      decision: input.decision,
      aiRationale: parsed.aiRationale,
      loadBearingScore: parsed.loadBearingScore,
      ...(input.overrideClass ? { overrideClass: input.overrideClass } : {}),
      ...(parsed.overrideReason
        ? { overrideReason: parsed.overrideReason }
        : {}),
    });
    const metadata = {
      ai: result.ai,
      impact: result.impact,
    };

    const [reviewed] = await transaction
      .update(dependencyEdgeVersions)
      .set({
        reviewStatus: "reviewed",
        reviewedByMembershipId: actor.actorMembershipId,
        lockedAt: now,
        lockedByMembershipId: actor.actorMembershipId,
        updatedAt: now,
      })
      .where(
        and(
          eq(dependencyEdgeVersions.organizationId, actor.organizationId),
          eq(dependencyEdgeVersions.id, ids.edgeVersionId),
          isNull(dependencyEdgeVersions.lockedAt),
        ),
      )
      .returning({ id: dependencyEdgeVersions.id });
    if (!reviewed) {
      throw new AppError({
        code: "CONFLICT",
        message: "Dependency edge version is already reviewed.",
        status: 409,
      });
    }
    await transaction.insert(approvalRecords).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      actorRoleCode: "edge_reviewer",
      objectType: "dependency_edge",
      objectId: ids.edgeId,
      objectVersionId: ids.edgeVersionId,
      action: approvalAction,
      metadata,
    });
    await transaction.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      actorRoleCode: "edge_reviewer",
      eventType: eventName,
      objectType: "dependency_edge",
      objectId: ids.edgeId,
      objectVersionId: ids.edgeVersionId,
      payload: metadata,
      occurredAt: now,
    });
    await transaction
      .update(outboxEvents)
      .set({ payload: { ...reservation.payload, result } })
      .where(
        and(
          eq(outboxEvents.organizationId, actor.organizationId),
          eq(outboxEvents.idempotencyKey, parsed.idempotencyKey),
        ),
      );

    return result;
  });
}

export function acceptDependencyEdge(
  actor: TenantContext,
  input: {
    idempotencyKey: string;
    edgeId: string;
    edgeVersionId: string;
    aiRationale: string;
    loadBearingScore: number;
    now?: Date;
  },
) {
  return reviewDependencyEdge(actor, { ...input, decision: "accepted" });
}

export function overrideDependencyEdge(
  actor: TenantContext,
  input: {
    idempotencyKey: string;
    edgeId: string;
    edgeVersionId: string;
    aiRationale: string;
    loadBearingScore: number;
    overrideClass: EdgeOverrideClass;
    reason: string;
    now?: Date;
  },
) {
  return reviewDependencyEdge(actor, {
    ...input,
    decision: "overridden",
    overrideReason: input.reason,
  });
}

const edgeReviewResultSchema = z.object({
  edgeId: uuidSchema,
  edgeVersionId: uuidSchema,
  reviewStatus: z.literal("reviewed"),
  decision: z.enum(["accepted", "overridden"]),
  ai: z.object({
    confidence: confidenceSchema,
    rationale: rationaleSchema,
    loadBearingScore: confidenceSchema,
  }),
  impact: z.object({
    class: z.enum(["rewrite_required", "line_edit"]),
    humanReviewed: z.literal(true),
    overrideClass: z.enum(["load_bearing", "peripheral"]).optional(),
    overrideReason: rationaleSchema.optional(),
  }),
});
