import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@/db/client";
import {
  approvalRecords,
  auditEvents,
  changeEvents,
  changeEventVersions,
  membershipRoles,
  outboxEvents,
  reportBundles,
  sourceVersions,
} from "@/db/schema";
import { type TenantContext, withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { assertIdempotencyActor } from "@/lib/security/idempotency";
import {
  assertChangeValidationAllowed,
  measureChangeLatency,
} from "@/modules/changes/policy";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type ChangeIds = { changeEventId: string; changeEventVersionId: string };

const idempotencyKeySchema = z.string().trim().min(8).max(255);
const uuidSchema = z.string().uuid();

async function requireRole(
  transaction: Transaction,
  actor: TenantContext,
  roleCode: "change_owner" | "change_validator",
) {
  const [role] = await transaction
    .select({ roleCode: membershipRoles.roleCode })
    .from(membershipRoles)
    .where(
      and(
        eq(membershipRoles.organizationId, actor.organizationId),
        eq(membershipRoles.membershipId, actor.actorMembershipId),
        eq(membershipRoles.roleCode, roleCode),
      ),
    )
    .limit(1);

  if (!role) {
    throw new AppError({
      code: "FORBIDDEN",
      message: `The ${roleCode} role is required.`,
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
    aggregateId: string;
    payload: Record<string, unknown>;
  },
): Promise<{
  duplicate: boolean;
  id: string;
  payload: Record<string, unknown>;
}> {
  const [event] = await transaction
    .insert(outboxEvents)
    .values({
      organizationId: input.organizationId,
      idempotencyKey: input.idempotencyKey,
      eventName: input.eventName,
      aggregateType: "change_event",
      aggregateId: input.aggregateId,
      payload: input.payload,
    })
    .onConflictDoNothing({
      target: [outboxEvents.organizationId, outboxEvents.idempotencyKey],
    })
    .returning({
      id: outboxEvents.id,
      eventName: outboxEvents.eventName,
      payload: outboxEvents.payload,
    });

  if (event) return { duplicate: false, ...event };

  const [existing] = await transaction
    .select({
      id: outboxEvents.id,
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
  return { duplicate: true, ...existing };
}

function existingChangeIds(payload: Record<string, unknown>): ChangeIds {
  return {
    changeEventId: uuidSchema.parse(payload.changeEventId),
    changeEventVersionId: uuidSchema.parse(payload.changeEventVersionId),
  };
}

export async function enterChangeEvent(
  actor: TenantContext,
  input: {
    idempotencyKey: string;
    sourceId: string;
    oldSourceVersionId: string;
    newSourceVersionId: string;
    versionLabel: string;
    oldRule: string;
    newRule: string;
    affectedPopulation: string;
    diffSummary: Record<string, unknown>;
    now?: Date;
  },
): Promise<ChangeIds> {
  const idempotencyKey = idempotencyKeySchema.parse(input.idempotencyKey);
  const changeEventId = randomUUID();
  const changeEventVersionId = randomUUID();
  const now = input.now ?? new Date();
  const payload = { changeEventId, changeEventVersionId };
  const sourceId = uuidSchema.parse(input.sourceId);
  const oldSourceVersionId = uuidSchema.parse(input.oldSourceVersionId);
  const newSourceVersionId = uuidSchema.parse(input.newSourceVersionId);
  if (oldSourceVersionId === newSourceVersionId) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "Old and new source versions must be different.",
      status: 422,
    });
  }

  return withTenantContext(actor, async (transaction) => {
    await requireRole(transaction, actor, "change_owner");
    const reservation = await reserveEvent(transaction, {
      organizationId: actor.organizationId,
      idempotencyKey,
      eventName: "change.submitted",
      aggregateId: changeEventId,
      payload: { ...payload, actorMembershipId: actor.actorMembershipId },
    });
    if (reservation.duplicate) {
      assertIdempotencyActor(reservation.payload, actor.actorMembershipId);
      return existingChangeIds(reservation.payload);
    }

    const versionSources = await transaction
      .select({ sourceId: sourceVersions.sourceId })
      .from(sourceVersions)
      .where(
        and(
          eq(sourceVersions.organizationId, actor.organizationId),
          inArray(sourceVersions.id, [oldSourceVersionId, newSourceVersionId]),
        ),
      );
    if (
      versionSources.length !== 2 ||
      versionSources.some((version) => version.sourceId !== sourceId)
    ) {
      throw new AppError({
        code: "VALIDATION_FAILED",
        message: "Both source versions must belong to the ChangeEvent source.",
        status: 422,
      });
    }

    await transaction.insert(changeEvents).values({
      id: changeEventId,
      organizationId: actor.organizationId,
      sourceId,
      enteredByMembershipId: actor.actorMembershipId,
      createdAt: now,
      updatedAt: now,
    });
    await transaction.insert(changeEventVersions).values({
      id: changeEventVersionId,
      organizationId: actor.organizationId,
      changeEventId,
      oldSourceVersionId,
      newSourceVersionId,
      versionLabel: z.string().trim().min(1).max(128).parse(input.versionLabel),
      oldRule: z.string().trim().min(1).parse(input.oldRule),
      newRule: z.string().trim().min(1).parse(input.newRule),
      affectedPopulation: z
        .string()
        .trim()
        .min(1)
        .parse(input.affectedPopulation),
      diffSummary: input.diffSummary,
      createdAt: now,
      updatedAt: now,
    });
    await transaction.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      actorRoleCode: "change_owner",
      eventType: "change.submitted",
      objectType: "change_event",
      objectId: changeEventId,
      objectVersionId: changeEventVersionId,
      payload: { sourceId: input.sourceId },
      occurredAt: now,
    });

    return payload;
  });
}

export async function validateChangeEvent(
  actor: TenantContext,
  input: {
    idempotencyKey: string;
    changeEventId: string;
    changeEventVersionId: string;
    now?: Date;
  },
): Promise<ChangeIds> {
  const parsed = {
    idempotencyKey: idempotencyKeySchema.parse(input.idempotencyKey),
    changeEventId: uuidSchema.parse(input.changeEventId),
    changeEventVersionId: uuidSchema.parse(input.changeEventVersionId),
  };
  const now = input.now ?? new Date();

  return withTenantContext(actor, async (transaction) => {
    await requireRole(transaction, actor, "change_validator");
    const reservation = await reserveEvent(transaction, {
      organizationId: actor.organizationId,
      idempotencyKey: parsed.idempotencyKey,
      eventName: "change.validated",
      aggregateId: parsed.changeEventId,
      payload: { ...parsed, actorMembershipId: actor.actorMembershipId },
    });
    if (reservation.duplicate) {
      assertIdempotencyActor(reservation.payload, actor.actorMembershipId);
      return existingChangeIds(reservation.payload);
    }

    const [row] = await transaction
      .select({
        enteredByMembershipId: changeEvents.enteredByMembershipId,
        lockedAt: changeEventVersions.lockedAt,
      })
      .from(changeEvents)
      .innerJoin(
        changeEventVersions,
        eq(changeEventVersions.changeEventId, changeEvents.id),
      )
      .where(
        and(
          eq(changeEvents.organizationId, actor.organizationId),
          eq(changeEvents.id, parsed.changeEventId),
          eq(changeEventVersions.id, parsed.changeEventVersionId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new AppError({
        code: "NOT_FOUND",
        message: "ChangeEvent not found.",
        status: 404,
      });
    }
    assertChangeValidationAllowed({
      enteredByMembershipId: row.enteredByMembershipId,
      validatorMembershipId: actor.actorMembershipId,
      versionLockedAt: row.lockedAt,
    });

    await transaction
      .update(changeEvents)
      .set({
        validatedByMembershipId: actor.actorMembershipId,
        validatedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(changeEvents.organizationId, actor.organizationId),
          eq(changeEvents.id, parsed.changeEventId),
        ),
      );
    const [locked] = await transaction
      .update(changeEventVersions)
      .set({
        lockedAt: now,
        lockedByMembershipId: actor.actorMembershipId,
        updatedAt: now,
      })
      .where(
        and(
          eq(changeEventVersions.organizationId, actor.organizationId),
          eq(changeEventVersions.id, parsed.changeEventVersionId),
          isNull(changeEventVersions.lockedAt),
        ),
      )
      .returning({ id: changeEventVersions.id });
    if (!locked) {
      throw new AppError({
        code: "CONFLICT",
        message: "This ChangeEvent version is already locked.",
        status: 409,
      });
    }
    await transaction.insert(approvalRecords).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      actorRoleCode: "change_validator",
      objectType: "change_event",
      objectId: parsed.changeEventId,
      objectVersionId: parsed.changeEventVersionId,
      action: "change_validated",
    });
    await transaction.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      actorRoleCode: "change_validator",
      eventType: "change.validated",
      objectType: "change_event",
      objectId: parsed.changeEventId,
      objectVersionId: parsed.changeEventVersionId,
      payload: {},
      occurredAt: now,
    });

    return {
      changeEventId: parsed.changeEventId,
      changeEventVersionId: parsed.changeEventVersionId,
    };
  });
}

export async function recordReportCompleted(
  actor: TenantContext,
  input: {
    idempotencyKey: string;
    changeEventId: string;
    changeEventVersionId: string;
    reportBundleId: string;
    completedAt?: Date;
  },
) {
  const ids = {
    changeEventId: uuidSchema.parse(input.changeEventId),
    changeEventVersionId: uuidSchema.parse(input.changeEventVersionId),
    reportBundleId: uuidSchema.parse(input.reportBundleId),
  };
  const completedAt = input.completedAt ?? new Date();

  return withTenantContext(actor, async (transaction) => {
    const reservation = await reserveEvent(transaction, {
      organizationId: actor.organizationId,
      idempotencyKey: idempotencyKeySchema.parse(input.idempotencyKey),
      eventName: "report.completed",
      aggregateId: ids.changeEventId,
      payload: { ...ids, actorMembershipId: actor.actorMembershipId },
    });
    if (reservation.duplicate) {
      assertIdempotencyActor(reservation.payload, actor.actorMembershipId);
      return reservation.payload;
    }

    const [change] = await transaction
      .select({
        enteredAt: changeEvents.createdAt,
        validatedAt: changeEvents.validatedAt,
      })
      .from(changeEvents)
      .innerJoin(
        changeEventVersions,
        eq(changeEventVersions.changeEventId, changeEvents.id),
      )
      .innerJoin(
        reportBundles,
        eq(reportBundles.changeEventVersionId, changeEventVersions.id),
      )
      .where(
        and(
          eq(changeEvents.organizationId, actor.organizationId),
          eq(changeEvents.id, ids.changeEventId),
          eq(changeEventVersions.id, ids.changeEventVersionId),
          eq(reportBundles.id, ids.reportBundleId),
        ),
      )
      .limit(1);
    if (!change?.validatedAt) {
      throw new AppError({
        code: "CONFLICT",
        message: "The ChangeEvent must be validated before reporting.",
        status: 409,
      });
    }
    const latency = measureChangeLatency({
      enteredAt: change.enteredAt,
      validatedAt: change.validatedAt,
      reportCompletedAt: completedAt,
    });
    const result = { ...ids, ...latency };
    await transaction
      .update(outboxEvents)
      .set({ payload: result })
      .where(eq(outboxEvents.id, reservation.id));
    await transaction.insert(auditEvents).values({
      organizationId: actor.organizationId,
      eventType: "report.completed",
      objectType: "change_event",
      objectId: ids.changeEventId,
      objectVersionId: ids.changeEventVersionId,
      payload: { reportBundleId: ids.reportBundleId, ...latency },
      occurredAt: completedAt,
    });
    return result;
  });
}
