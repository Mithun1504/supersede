import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@/db/client";
import {
  approvalRecords,
  artifacts,
  artifactVersions,
  auditEvents,
  changeImpacts,
  memberships,
  membershipRoles,
  outboxEvents,
} from "@/db/schema";
import { type TenantContext, withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { assertIdempotencyActor } from "@/lib/security/idempotency";
import { requireDistinctActors } from "@/lib/security/separation-of-duties";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const idempotencyKeySchema = z.string().trim().min(8).max(255);
const uuidSchema = z.string().uuid();
const labelSchema = z.string().trim().min(1).max(128);
const requiredTextSchema = z.string().trim().min(1);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i);

type ArtifactVersionIds = { artifactId: string; artifactVersionId: string };
type ArtifactIds = { artifactId: string };

async function requireRole(transaction: Transaction, actor: TenantContext) {
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
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
  },
) {
  const [event] = await transaction
    .insert(outboxEvents)
    .values(input)
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

function existingArtifactIds(payload: Record<string, unknown>): ArtifactIds {
  return { artifactId: uuidSchema.parse(payload.artifactId) };
}

function existingArtifactVersionIds(
  payload: Record<string, unknown>,
): ArtifactVersionIds {
  return {
    artifactId: uuidSchema.parse(payload.artifactId),
    artifactVersionId: uuidSchema.parse(payload.artifactVersionId),
  };
}

async function getArtifact(
  transaction: Transaction,
  organizationId: string,
  artifactId: string,
) {
  const [artifact] = await transaction
    .select({ ownerMembershipId: artifacts.ownerMembershipId })
    .from(artifacts)
    .where(
      and(
        eq(artifacts.organizationId, organizationId),
        eq(artifacts.id, artifactId),
      ),
    )
    .limit(1);
  if (!artifact) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Artifact not found.",
      status: 404,
    });
  }
  return artifact;
}

async function getArtifactVersion(
  transaction: Transaction,
  organizationId: string,
  artifactId: string,
  artifactVersionId: string,
) {
  const [version] = await transaction
    .select({
      artifactId: artifactVersions.artifactId,
      lockedAt: artifactVersions.lockedAt,
      ownerMembershipId: artifacts.ownerMembershipId,
    })
    .from(artifactVersions)
    .innerJoin(artifacts, eq(artifacts.id, artifactVersions.artifactId))
    .where(
      and(
        eq(artifactVersions.organizationId, organizationId),
        eq(artifactVersions.artifactId, artifactId),
        eq(artifactVersions.id, artifactVersionId),
      ),
    )
    .limit(1);
  if (!version) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Artifact version not found.",
      status: 404,
    });
  }
  return version;
}

export async function triageArtifactImpact(
  actor: TenantContext,
  input: {
    idempotencyKey: string;
    artifactId: string;
    artifactVersionId: string;
    changeEventVersionId: string;
    decision: "requires_correction" | "no_change_required";
    rationale: string;
    now?: Date;
  },
): Promise<ArtifactVersionIds> {
  const ids = {
    artifactId: uuidSchema.parse(input.artifactId),
    artifactVersionId: uuidSchema.parse(input.artifactVersionId),
    changeEventVersionId: uuidSchema.parse(input.changeEventVersionId),
  };
  const decision = z
    .enum(["requires_correction", "no_change_required"])
    .parse(input.decision);
  const rationale = requiredTextSchema.parse(input.rationale);
  const now = input.now ?? new Date();

  return withTenantContext(actor, async (transaction) => {
    await requireRole(transaction, actor);
    const reservation = await reserveEvent(transaction, {
      organizationId: actor.organizationId,
      idempotencyKey: idempotencyKeySchema.parse(input.idempotencyKey),
      eventName: "artifact.triaged",
      aggregateType: "artifact",
      aggregateId: ids.artifactId,
      payload: { ...ids, actorMembershipId: actor.actorMembershipId },
    });
    if (reservation.duplicate) {
      assertIdempotencyActor(reservation.payload, actor.actorMembershipId);
      return existingArtifactVersionIds(reservation.payload);
    }

    await getArtifactVersion(
      transaction,
      actor.organizationId,
      ids.artifactId,
      ids.artifactVersionId,
    );
    const [impact] = await transaction
      .select({ id: changeImpacts.id })
      .from(changeImpacts)
      .where(
        and(
          eq(changeImpacts.organizationId, actor.organizationId),
          eq(changeImpacts.changeEventVersionId, ids.changeEventVersionId),
          eq(changeImpacts.impactedObjectType, "artifact_version"),
          eq(changeImpacts.impactedObjectId, ids.artifactVersionId),
        ),
      )
      .limit(1);
    if (!impact) {
      throw new AppError({
        code: "VALIDATION_FAILED",
        message: "Triage must reference an impacted artifact version.",
        status: 422,
      });
    }

    await transaction.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      actorRoleCode: "edge_reviewer",
      eventType: "artifact.triaged",
      objectType: "artifact",
      objectId: ids.artifactId,
      objectVersionId: ids.artifactVersionId,
      payload: {
        changeEventVersionId: ids.changeEventVersionId,
        decision,
        rationale,
      },
      occurredAt: now,
    });

    return {
      artifactId: ids.artifactId,
      artifactVersionId: ids.artifactVersionId,
    };
  });
}

export async function assignArtifactOwner(
  actor: TenantContext,
  input: {
    idempotencyKey: string;
    artifactId: string;
    ownerMembershipId: string;
    reason: string;
    now?: Date;
  },
): Promise<ArtifactIds> {
  const ids = {
    artifactId: uuidSchema.parse(input.artifactId),
    ownerMembershipId: uuidSchema.parse(input.ownerMembershipId),
  };
  const reason = requiredTextSchema.parse(input.reason);
  const now = input.now ?? new Date();

  return withTenantContext(actor, async (transaction) => {
    await requireRole(transaction, actor);
    const reservation = await reserveEvent(transaction, {
      organizationId: actor.organizationId,
      idempotencyKey: idempotencyKeySchema.parse(input.idempotencyKey),
      eventName: "artifact.owner_assigned",
      aggregateType: "artifact",
      aggregateId: ids.artifactId,
      payload: { ...ids, actorMembershipId: actor.actorMembershipId },
    });
    if (reservation.duplicate) {
      assertIdempotencyActor(reservation.payload, actor.actorMembershipId);
      return existingArtifactIds(reservation.payload);
    }

    await getArtifact(transaction, actor.organizationId, ids.artifactId);
    const [owner] = await transaction
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, actor.organizationId),
          eq(memberships.id, ids.ownerMembershipId),
          eq(memberships.status, "active"),
        ),
      )
      .limit(1);
    if (!owner) {
      throw new AppError({
        code: "VALIDATION_FAILED",
        message: "Artifact owner must be an active member of the tenant.",
        status: 422,
      });
    }

    await transaction
      .update(artifacts)
      .set({ ownerMembershipId: ids.ownerMembershipId, updatedAt: now })
      .where(
        and(
          eq(artifacts.organizationId, actor.organizationId),
          eq(artifacts.id, ids.artifactId),
        ),
      );
    await transaction.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      actorRoleCode: "edge_reviewer",
      eventType: "artifact.owner_assigned",
      objectType: "artifact",
      objectId: ids.artifactId,
      payload: { ownerMembershipId: ids.ownerMembershipId, reason },
      occurredAt: now,
    });

    return { artifactId: ids.artifactId };
  });
}

export async function submitCorrectedArtifactVersion(
  actor: TenantContext,
  input: {
    idempotencyKey: string;
    artifactId: string;
    parentArtifactVersionId: string;
    versionLabel: string;
    bodyText: string;
    fileSha256: string;
    storageObjectKey?: string | null | undefined;
    now?: Date;
  },
): Promise<ArtifactVersionIds> {
  const artifactId = uuidSchema.parse(input.artifactId);
  const parentArtifactVersionId = uuidSchema.parse(
    input.parentArtifactVersionId,
  );
  const artifactVersionId = randomUUID();
  const now = input.now ?? new Date();

  return withTenantContext(actor, async (transaction) => {
    const reservation = await reserveEvent(transaction, {
      organizationId: actor.organizationId,
      idempotencyKey: idempotencyKeySchema.parse(input.idempotencyKey),
      eventName: "artifact.version_submitted",
      aggregateType: "artifact",
      aggregateId: artifactId,
      payload: {
        artifactId,
        artifactVersionId,
        actorMembershipId: actor.actorMembershipId,
      },
    });
    if (reservation.duplicate) {
      assertIdempotencyActor(reservation.payload, actor.actorMembershipId);
      return existingArtifactVersionIds(reservation.payload);
    }

    const artifact = await getArtifact(
      transaction,
      actor.organizationId,
      artifactId,
    );
    if (artifact.ownerMembershipId !== actor.actorMembershipId) {
      throw new AppError({
        code: "FORBIDDEN",
        message: "Only the assigned artifact owner may submit a correction.",
        status: 403,
      });
    }
    await getArtifactVersion(
      transaction,
      actor.organizationId,
      artifactId,
      parentArtifactVersionId,
    );

    await transaction.insert(artifactVersions).values({
      id: artifactVersionId,
      organizationId: actor.organizationId,
      artifactId,
      versionLabel: labelSchema.parse(input.versionLabel),
      bodyText: requiredTextSchema.parse(input.bodyText),
      storageObjectKey: input.storageObjectKey ?? null,
      fileSha256: sha256Schema.parse(input.fileSha256),
      createdAt: now,
      updatedAt: now,
    });
    await transaction.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      eventType: "artifact.version_submitted",
      objectType: "artifact",
      objectId: artifactId,
      objectVersionId: artifactVersionId,
      payload: { parentArtifactVersionId },
      occurredAt: now,
    });

    return { artifactId, artifactVersionId };
  });
}

export async function approveArtifactVersion(
  actor: TenantContext,
  input: {
    idempotencyKey: string;
    artifactId: string;
    artifactVersionId: string;
    now?: Date;
  },
): Promise<ArtifactVersionIds> {
  const ids = {
    artifactId: uuidSchema.parse(input.artifactId),
    artifactVersionId: uuidSchema.parse(input.artifactVersionId),
  };
  const now = input.now ?? new Date();

  return withTenantContext(actor, async (transaction) => {
    await requireRole(transaction, actor);
    const reservation = await reserveEvent(transaction, {
      organizationId: actor.organizationId,
      idempotencyKey: idempotencyKeySchema.parse(input.idempotencyKey),
      eventName: "artifact.version_approved",
      aggregateType: "artifact",
      aggregateId: ids.artifactId,
      payload: { ...ids, actorMembershipId: actor.actorMembershipId },
    });
    if (reservation.duplicate) {
      assertIdempotencyActor(reservation.payload, actor.actorMembershipId);
      return existingArtifactVersionIds(reservation.payload);
    }

    const version = await getArtifactVersion(
      transaction,
      actor.organizationId,
      ids.artifactId,
      ids.artifactVersionId,
    );
    if (version.lockedAt) {
      throw new AppError({
        code: "CONFLICT",
        message: "This artifact version is already locked.",
        status: 409,
      });
    }
    if (version.ownerMembershipId) {
      requireDistinctActors(
        version.ownerMembershipId,
        actor.actorMembershipId,
        "Artifact correction approval must be performed by a different actor than the assigned owner.",
      );
    }

    const [locked] = await transaction
      .update(artifactVersions)
      .set({
        lockedAt: now,
        lockedByMembershipId: actor.actorMembershipId,
        updatedAt: now,
      })
      .where(
        and(
          eq(artifactVersions.organizationId, actor.organizationId),
          eq(artifactVersions.id, ids.artifactVersionId),
          isNull(artifactVersions.lockedAt),
        ),
      )
      .returning({ id: artifactVersions.id });
    if (!locked) {
      throw new AppError({
        code: "CONFLICT",
        message: "This artifact version is already locked.",
        status: 409,
      });
    }
    await transaction.insert(approvalRecords).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      actorRoleCode: "edge_reviewer",
      objectType: "artifact_version",
      objectId: ids.artifactId,
      objectVersionId: ids.artifactVersionId,
      action: "artifact_version_approved",
    });
    await transaction.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      actorRoleCode: "edge_reviewer",
      eventType: "artifact.version_approved",
      objectType: "artifact",
      objectId: ids.artifactId,
      objectVersionId: ids.artifactVersionId,
      payload: {},
      occurredAt: now,
    });

    return ids;
  });
}

export async function publishArtifactVersion(
  actor: TenantContext,
  input: {
    idempotencyKey: string;
    artifactId: string;
    artifactVersionId: string;
    now?: Date;
  },
): Promise<ArtifactVersionIds> {
  const ids = {
    artifactId: uuidSchema.parse(input.artifactId),
    artifactVersionId: uuidSchema.parse(input.artifactVersionId),
  };
  const now = input.now ?? new Date();

  return withTenantContext(actor, async (transaction) => {
    await requireRole(transaction, actor);
    const reservation = await reserveEvent(transaction, {
      organizationId: actor.organizationId,
      idempotencyKey: idempotencyKeySchema.parse(input.idempotencyKey),
      eventName: "artifact.version_published",
      aggregateType: "artifact",
      aggregateId: ids.artifactId,
      payload: { ...ids, actorMembershipId: actor.actorMembershipId },
    });
    if (reservation.duplicate) {
      assertIdempotencyActor(reservation.payload, actor.actorMembershipId);
      return existingArtifactVersionIds(reservation.payload);
    }

    const version = await getArtifactVersion(
      transaction,
      actor.organizationId,
      ids.artifactId,
      ids.artifactVersionId,
    );
    if (!version.lockedAt) {
      throw new AppError({
        code: "CONFLICT",
        message: "Only an approved locked artifact version can be published.",
        status: 409,
      });
    }

    const [approval] = await transaction
      .select({ id: approvalRecords.id })
      .from(approvalRecords)
      .where(
        and(
          eq(approvalRecords.organizationId, actor.organizationId),
          eq(approvalRecords.objectType, "artifact_version"),
          eq(approvalRecords.objectId, ids.artifactId),
          eq(approvalRecords.objectVersionId, ids.artifactVersionId),
          eq(approvalRecords.action, "artifact_version_approved"),
        ),
      )
      .limit(1);
    if (!approval) {
      throw new AppError({
        code: "CONFLICT",
        message:
          "Artifact publication requires an artifact-version approval record.",
        status: 409,
      });
    }

    await transaction.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      actorRoleCode: "edge_reviewer",
      eventType: "artifact.version_published",
      objectType: "artifact",
      objectId: ids.artifactId,
      objectVersionId: ids.artifactVersionId,
      payload: {},
      occurredAt: now,
    });

    return ids;
  });
}
