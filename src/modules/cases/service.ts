import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@/db/client";
import {
  approvalRecords,
  auditEvents,
  changeImpacts,
  changeEventVersions,
  divergenceCases,
  divergenceCaseVersions,
  membershipRoles,
  outboxEvents,
  people,
  probeAssignments,
  probeDeliveryEvents,
  roleArtifactExposures,
} from "@/db/schema";
import { type TenantContext, withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { assertIdempotencyActor } from "@/lib/security/idempotency";
import {
  assertCaseApprovalAllowed,
  assertReleaseAuthorizationAllowed,
} from "@/modules/cases/policy";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type CaseIds = { caseId: string; caseVersionId: string };

const uuidSchema = z.string().uuid();
const idempotencyKeySchema = z.string().trim().min(8).max(255);

async function requireRole(
  transaction: Transaction,
  actor: TenantContext,
  roleCode: "change_owner" | "case_approver" | "release_authorizer",
) {
  const [role] = await transaction
    .select({ code: membershipRoles.roleCode })
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
    caseId: string;
    caseVersionId: string;
    actorMembershipId: string;
    payload?: Record<string, unknown>;
  },
) {
  const payload = {
    caseId: input.caseId,
    caseVersionId: input.caseVersionId,
    actorMembershipId: input.actorMembershipId,
    ...input.payload,
  };
  const [event] = await transaction
    .insert(outboxEvents)
    .values({
      organizationId: input.organizationId,
      idempotencyKey: input.idempotencyKey,
      eventName: input.eventName,
      aggregateType: "divergence_case",
      aggregateId: input.caseId,
      payload,
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

function existingCaseIds(payload: Record<string, unknown>): CaseIds {
  return {
    caseId: uuidSchema.parse(payload.caseId),
    caseVersionId: uuidSchema.parse(payload.caseVersionId),
  };
}

export async function draftCaseVersion(
  actor: TenantContext,
  input: {
    idempotencyKey: string;
    changeEventId: string;
    changeEventVersionId: string;
    versionLabel: string;
    scenario: string;
    oldAnswer: string;
    newAnswer: string;
    rationale: string;
    oldCitation: Record<string, unknown>;
    newCitation: Record<string, unknown>;
    ambiguityNote?: string | null;
    now?: Date;
  },
): Promise<CaseIds> {
  const caseId = randomUUID();
  const caseVersionId = randomUUID();
  const now = input.now ?? new Date();

  return withTenantContext(actor, async (transaction) => {
    await requireRole(transaction, actor, "change_owner");
    const reservation = await reserveEvent(transaction, {
      organizationId: actor.organizationId,
      idempotencyKey: idempotencyKeySchema.parse(input.idempotencyKey),
      eventName: "case.drafted",
      caseId,
      caseVersionId,
      actorMembershipId: actor.actorMembershipId,
    });
    if (reservation.duplicate) {
      assertIdempotencyActor(reservation.payload, actor.actorMembershipId);
      return existingCaseIds(reservation.payload);
    }

    const [changeVersion] = await transaction
      .select({ changeEventId: changeEventVersions.changeEventId })
      .from(changeEventVersions)
      .where(
        and(
          eq(changeEventVersions.organizationId, actor.organizationId),
          eq(
            changeEventVersions.id,
            uuidSchema.parse(input.changeEventVersionId),
          ),
          eq(
            changeEventVersions.changeEventId,
            uuidSchema.parse(input.changeEventId),
          ),
        ),
      )
      .limit(1);
    if (!changeVersion) {
      throw new AppError({
        code: "VALIDATION_FAILED",
        message: "The case must reference a version of its ChangeEvent.",
        status: 422,
      });
    }

    await transaction.insert(divergenceCases).values({
      id: caseId,
      organizationId: actor.organizationId,
      changeEventId: uuidSchema.parse(input.changeEventId),
      createdAt: now,
      updatedAt: now,
    });
    await transaction.insert(divergenceCaseVersions).values({
      id: caseVersionId,
      organizationId: actor.organizationId,
      caseId,
      changeEventVersionId: uuidSchema.parse(input.changeEventVersionId),
      versionLabel: z.string().trim().min(1).max(128).parse(input.versionLabel),
      scenario: z.string().trim().min(1).parse(input.scenario),
      oldAnswer: z.string().trim().min(1).parse(input.oldAnswer),
      newAnswer: z.string().trim().min(1).parse(input.newAnswer),
      rationale: z.string().trim().min(1).parse(input.rationale),
      oldCitation: input.oldCitation,
      newCitation: input.newCitation,
      authoredByMembershipId: actor.actorMembershipId,
      ambiguityNote: input.ambiguityNote,
      createdAt: now,
      updatedAt: now,
    });
    await transaction.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      eventType: "case.version.authored",
      objectType: "divergence_case",
      objectId: caseId,
      objectVersionId: caseVersionId,
      payload: { changeEventVersionId: input.changeEventVersionId },
      occurredAt: now,
    });

    return { caseId, caseVersionId };
  });
}

async function getCaseVersion(
  transaction: Transaction,
  organizationId: string,
  caseId: string,
  caseVersionId: string,
) {
  const [row] = await transaction
    .select({
      status: divergenceCaseVersions.status,
      ambiguityNote: divergenceCaseVersions.ambiguityNote,
      authoredByMembershipId: divergenceCaseVersions.authoredByMembershipId,
      approvedByMembershipId: divergenceCaseVersions.approvedByMembershipId,
      changeEventVersionId: divergenceCaseVersions.changeEventVersionId,
    })
    .from(divergenceCaseVersions)
    .where(
      and(
        eq(divergenceCaseVersions.organizationId, organizationId),
        eq(divergenceCaseVersions.caseId, caseId),
        eq(divergenceCaseVersions.id, caseVersionId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Divergence case version not found.",
      status: 404,
    });
  }
  return row;
}

export async function approveCaseVersion(
  actor: TenantContext,
  input: {
    idempotencyKey: string;
    caseId: string;
    caseVersionId: string;
    now?: Date;
  },
): Promise<CaseIds> {
  const ids = {
    caseId: uuidSchema.parse(input.caseId),
    caseVersionId: uuidSchema.parse(input.caseVersionId),
  };
  const now = input.now ?? new Date();

  return withTenantContext(actor, async (transaction) => {
    await requireRole(transaction, actor, "case_approver");
    const reservation = await reserveEvent(transaction, {
      organizationId: actor.organizationId,
      idempotencyKey: idempotencyKeySchema.parse(input.idempotencyKey),
      eventName: "case.approved",
      ...ids,
      actorMembershipId: actor.actorMembershipId,
    });
    if (reservation.duplicate) {
      assertIdempotencyActor(reservation.payload, actor.actorMembershipId);
      return existingCaseIds(reservation.payload);
    }

    const version = await getCaseVersion(
      transaction,
      actor.organizationId,
      ids.caseId,
      ids.caseVersionId,
    );
    assertCaseApprovalAllowed({
      authoredByMembershipId: version.authoredByMembershipId,
      approverMembershipId: actor.actorMembershipId,
      status: version.status,
      ambiguityNote: version.ambiguityNote,
    });

    const [approved] = await transaction
      .update(divergenceCaseVersions)
      .set({
        status: "approved",
        approvedByMembershipId: actor.actorMembershipId,
        approvedAt: now,
        lockedAt: now,
        lockedByMembershipId: actor.actorMembershipId,
        updatedAt: now,
      })
      .where(
        and(
          eq(divergenceCaseVersions.organizationId, actor.organizationId),
          eq(divergenceCaseVersions.id, ids.caseVersionId),
          eq(divergenceCaseVersions.status, "draft"),
        ),
      )
      .returning({ id: divergenceCaseVersions.id });
    if (!approved) {
      throw new AppError({
        code: "CONFLICT",
        message: "Only a draft case version can be approved.",
        status: 409,
      });
    }
    await transaction.insert(approvalRecords).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      actorRoleCode: "case_approver",
      objectType: "divergence_case",
      objectId: ids.caseId,
      objectVersionId: ids.caseVersionId,
      action: "case_approved",
    });
    await transaction.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      actorRoleCode: "case_approver",
      eventType: "case.approved",
      objectType: "divergence_case",
      objectId: ids.caseId,
      objectVersionId: ids.caseVersionId,
      payload: { changeEventVersionId: version.changeEventVersionId },
      occurredAt: now,
    });

    return ids;
  });
}

export async function retireCaseVersion(
  actor: TenantContext,
  input: {
    idempotencyKey: string;
    caseId: string;
    caseVersionId: string;
    reason: string;
    now?: Date;
  },
): Promise<CaseIds> {
  const ids = {
    caseId: uuidSchema.parse(input.caseId),
    caseVersionId: uuidSchema.parse(input.caseVersionId),
  };
  const now = input.now ?? new Date();

  return withTenantContext(actor, async (transaction) => {
    await requireRole(transaction, actor, "case_approver");
    const reservation = await reserveEvent(transaction, {
      organizationId: actor.organizationId,
      idempotencyKey: idempotencyKeySchema.parse(input.idempotencyKey),
      eventName: "case.retired",
      ...ids,
      actorMembershipId: actor.actorMembershipId,
      payload: { reason: z.string().trim().min(1).parse(input.reason) },
    });
    if (reservation.duplicate) {
      assertIdempotencyActor(reservation.payload, actor.actorMembershipId);
      return existingCaseIds(reservation.payload);
    }

    const version = await getCaseVersion(
      transaction,
      actor.organizationId,
      ids.caseId,
      ids.caseVersionId,
    );
    if (version.status !== "approved") {
      throw new AppError({
        code: "CONFLICT",
        message: "Only an approved case version can be retired.",
        status: 409,
      });
    }
    const [retired] = await transaction
      .update(divergenceCaseVersions)
      .set({ status: "retired", updatedAt: now })
      .where(
        and(
          eq(divergenceCaseVersions.organizationId, actor.organizationId),
          eq(divergenceCaseVersions.id, ids.caseVersionId),
          eq(divergenceCaseVersions.status, "approved"),
        ),
      )
      .returning({ id: divergenceCaseVersions.id });
    if (!retired) {
      throw new AppError({
        code: "CONFLICT",
        message: "Only an approved case version can be retired.",
        status: 409,
      });
    }
    await transaction.insert(approvalRecords).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      actorRoleCode: "case_approver",
      objectType: "divergence_case",
      objectId: ids.caseId,
      objectVersionId: ids.caseVersionId,
      action: "case_retired",
      metadata: { reason: input.reason },
    });
    await transaction.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      actorRoleCode: "case_approver",
      eventType: "case.retired",
      objectType: "divergence_case",
      objectId: ids.caseId,
      objectVersionId: ids.caseVersionId,
      payload: { reason: input.reason },
      occurredAt: now,
    });

    return ids;
  });
}

export async function authorizeCaseRelease(
  actor: TenantContext,
  input: {
    idempotencyKey: string;
    caseId: string;
    caseVersionId: string;
    now?: Date;
  },
): Promise<CaseIds> {
  const ids = {
    caseId: uuidSchema.parse(input.caseId),
    caseVersionId: uuidSchema.parse(input.caseVersionId),
  };
  const now = input.now ?? new Date();

  return withTenantContext(actor, async (transaction) => {
    await requireRole(transaction, actor, "release_authorizer");
    const reservation = await reserveEvent(transaction, {
      organizationId: actor.organizationId,
      idempotencyKey: idempotencyKeySchema.parse(input.idempotencyKey),
      eventName: "case.release_authorized",
      ...ids,
      actorMembershipId: actor.actorMembershipId,
    });
    if (reservation.duplicate) {
      assertIdempotencyActor(reservation.payload, actor.actorMembershipId);
      return existingCaseIds(reservation.payload);
    }

    const version = await getCaseVersion(
      transaction,
      actor.organizationId,
      ids.caseId,
      ids.caseVersionId,
    );
    if (!version.approvedByMembershipId) {
      throw new AppError({
        code: "CONFLICT",
        message: "Case approval is missing.",
        status: 409,
      });
    }
    assertReleaseAuthorizationAllowed({
      caseApproverMembershipId: version.approvedByMembershipId,
      releaseAuthorizerMembershipId: actor.actorMembershipId,
      caseStatus: version.status,
      ambiguous: Boolean(version.ambiguityNote),
    });
    await transaction.insert(approvalRecords).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      actorRoleCode: "release_authorizer",
      objectType: "divergence_case",
      objectId: ids.caseId,
      objectVersionId: ids.caseVersionId,
      action: "release_authorized",
    });
    await transaction.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      actorRoleCode: "release_authorizer",
      eventType: "case.release_authorized",
      objectType: "divergence_case",
      objectId: ids.caseId,
      objectVersionId: ids.caseVersionId,
      payload: {},
      occurredAt: now,
    });
    await createProbeAssignments(
      transaction,
      actor,
      ids.caseVersionId,
      version.changeEventVersionId,
      now,
    );
    return ids;
  });
}

async function createProbeAssignments(
  transaction: Transaction,
  actor: TenantContext,
  caseVersionId: string,
  changeEventVersionId: string,
  now: Date,
) {
  const affectedPeople = await transaction
    .selectDistinct({ personId: people.id })
    .from(changeImpacts)
    .innerJoin(
      roleArtifactExposures,
      and(
        eq(
          roleArtifactExposures.artifactVersionId,
          changeImpacts.impactedObjectId,
        ),
        eq(roleArtifactExposures.organizationId, changeImpacts.organizationId),
      ),
    )
    .innerJoin(
      people,
      and(
        eq(people.professionalRoleId, roleArtifactExposures.professionalRoleId),
        eq(people.organizationId, changeImpacts.organizationId),
      ),
    )
    .where(
      and(
        eq(changeImpacts.organizationId, actor.organizationId),
        eq(changeImpacts.changeEventVersionId, changeEventVersionId),
        eq(changeImpacts.impactedObjectType, "artifact_version"),
      ),
    );

  for (const { personId } of affectedPeople) {
    const [assignment] = await transaction
      .insert(probeAssignments)
      .values({
        organizationId: actor.organizationId,
        personId,
        caseVersionId,
        changeEventVersionId,
        assignedByMembershipId: actor.actorMembershipId,
        createdAt: now,
      })
      .onConflictDoNothing({
        target: [probeAssignments.personId, probeAssignments.caseVersionId],
      })
      .returning({ id: probeAssignments.id });
    if (!assignment) continue;

    await transaction.insert(probeDeliveryEvents).values({
      organizationId: actor.organizationId,
      assignmentId: assignment.id,
      status: "assigned",
      evidence: { channel: "in_app", releaseAuthorized: true },
      occurredAt: now,
    });
    await transaction.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      actorRoleCode: "release_authorizer",
      eventType: "probe.assigned",
      objectType: "probe_assignment",
      objectId: assignment.id,
      objectVersionId: caseVersionId,
      payload: { personId, changeEventVersionId },
      occurredAt: now,
    });
    await transaction.insert(outboxEvents).values({
      organizationId: actor.organizationId,
      eventName: "probe.assigned",
      aggregateType: "probe_assignment",
      aggregateId: assignment.id,
      idempotencyKey: `probe.assigned:${assignment.id}`,
      payload: {
        probeAssignmentId: assignment.id,
        actorMembershipId: actor.actorMembershipId,
        caseVersionId,
        changeEventVersionId,
      },
    });
  }
}
