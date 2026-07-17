import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { gradeProbeResponse } from "@/ai/workflows/governed";
import {
  auditEvents,
  changeImpacts,
  divergenceCaseVersions,
  membershipRoles,
  outboxEvents,
  people,
  probeAssignments,
  probeDeliveryEvents,
  probeResponses,
  remediationAssignments,
  roleArtifactExposures,
} from "@/db/schema";
import { type TenantContext, withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { assertIdempotencyActor } from "@/lib/security/idempotency";
import {
  findLearningEvent,
  reserveLearningEvent,
} from "@/modules/learning/events";

const uuidSchema = z.string().uuid();
const idempotencyKeySchema = z.string().trim().min(8).max(255);
const responseTextSchema = z.string().trim().min(1).max(20_000);

const openResultSchema = z.object({
  probeAssignmentId: uuidSchema,
  opened: z.literal(true),
  actorMembershipId: uuidSchema,
});

const completionResultSchema = z.object({
  probeAssignmentId: uuidSchema,
  probeResponseId: uuidSchema,
  answeredWith: z.enum(["old", "new", "other"]),
  reviewRequired: z.boolean(),
  remediationAssignmentId: uuidSchema.nullable(),
  actorMembershipId: uuidSchema,
});

type LearnerAssignment = Awaited<ReturnType<typeof loadLearnerAssignment>>;

export async function openProbeAssignment(
  actor: TenantContext,
  input: { idempotencyKey: string; probeAssignmentId: string; now?: Date },
) {
  const idempotencyKey = idempotencyKeySchema.parse(input.idempotencyKey);
  const probeAssignmentId = uuidSchema.parse(input.probeAssignmentId);
  const now = input.now ?? new Date();

  return withTenantContext(actor, async (transaction) => {
    const replay = await findLearningEvent(transaction, {
      organizationId: actor.organizationId,
      idempotencyKey,
      eventName: "probe.opened",
    });
    if (replay) {
      assertIdempotencyActor(replay, actor.actorMembershipId);
      return openResultSchema.parse(replay);
    }

    await requireLearnerAssignment(transaction, actor, probeAssignmentId);
    const [opened] = await transaction
      .select({ id: probeDeliveryEvents.id })
      .from(probeDeliveryEvents)
      .where(
        and(
          eq(probeDeliveryEvents.organizationId, actor.organizationId),
          eq(probeDeliveryEvents.assignmentId, probeAssignmentId),
          eq(probeDeliveryEvents.status, "opened"),
        ),
      )
      .limit(1);
    if (opened) {
      return {
        probeAssignmentId,
        opened: true as const,
        actorMembershipId: actor.actorMembershipId,
      };
    }

    const result = {
      probeAssignmentId,
      opened: true as const,
      actorMembershipId: actor.actorMembershipId,
    };
    await reserveLearningEvent(transaction, {
      organizationId: actor.organizationId,
      idempotencyKey,
      eventName: "probe.opened",
      aggregateType: "probe_assignment",
      aggregateId: probeAssignmentId,
      payload: result,
    });
    await transaction.insert(probeDeliveryEvents).values({
      organizationId: actor.organizationId,
      assignmentId: probeAssignmentId,
      status: "opened",
      evidence: { channel: "in_app" },
      occurredAt: now,
    });
    await transaction.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      eventType: "probe.opened",
      objectType: "probe_assignment",
      objectId: probeAssignmentId,
      payload: { channel: "in_app" },
      occurredAt: now,
    });
    return result;
  });
}

export async function completeProbeResponse(
  actor: TenantContext,
  input: {
    idempotencyKey: string;
    probeAssignmentId: string;
    responseText: string;
    now?: Date;
  },
) {
  const idempotencyKey = idempotencyKeySchema.parse(input.idempotencyKey);
  const probeAssignmentId = uuidSchema.parse(input.probeAssignmentId);
  const responseText = responseTextSchema.parse(input.responseText);
  const replay = await withTenantContext(actor, (transaction) =>
    findLearningEvent(transaction, {
      organizationId: actor.organizationId,
      idempotencyKey,
      eventName: "probe.completed",
    }),
  );
  if (replay) {
    assertIdempotencyActor(replay, actor.actorMembershipId);
    return completionResultSchema.parse(replay);
  }

  const assignment = await loadLearnerAssignment(actor, probeAssignmentId);
  const grade = await gradeProbeResponse(
    {
      responseText,
      approvedCaseRationale: assignment.rationale,
      oldAnswer: assignment.oldAnswer,
      newAnswer: assignment.newAnswer,
      caseVersionHash: caseVersionHash(assignment),
    },
    { idempotencyKey },
  );
  const now = input.now ?? new Date();
  const probeResponseId = randomUUID();

  return withTenantContext(actor, async (transaction) => {
    const reservation = await reserveLearningEvent(transaction, {
      organizationId: actor.organizationId,
      idempotencyKey,
      eventName: "probe.completed",
      aggregateType: "probe_assignment",
      aggregateId: probeAssignmentId,
      payload: {
        probeAssignmentId,
        probeResponseId,
        answeredWith: grade.answeredWith,
        reviewRequired: grade.reviewRequired,
        remediationAssignmentId: null,
        actorMembershipId: actor.actorMembershipId,
      },
    });
    if (reservation.duplicate) {
      assertIdempotencyActor(reservation.payload, actor.actorMembershipId);
      return completionResultSchema.parse(reservation.payload);
    }

    const current = await requireLearnerAssignment(
      transaction,
      actor,
      probeAssignmentId,
    );
    if (current.responseId) {
      throw new AppError({
        code: "CONFLICT",
        message: "The probe assignment already has a completed response.",
        status: 409,
      });
    }

    await transaction.insert(probeResponses).values({
      id: probeResponseId,
      organizationId: actor.organizationId,
      assignmentId: probeAssignmentId,
      answeredWith: grade.answeredWith,
      responseText,
      gradingConfidence: grade.confidence.toFixed(3),
      gradingRationale: grade.matchedApprovedCaseRationale,
      gradingEvidenceQuote: grade.exactQuote,
      reviewRequired: grade.reviewRequired,
      assessedAt: now,
    });
    await transaction.insert(probeDeliveryEvents).values({
      organizationId: actor.organizationId,
      assignmentId: probeAssignmentId,
      status: "completed",
      evidence: { channel: "in_app" },
      occurredAt: now,
    });
    await auditProbeCompletion(
      transaction,
      actor,
      probeAssignmentId,
      probeResponseId,
      grade,
      now,
    );

    let remediationAssignmentId: string | null = null;
    if (grade.answeredWith === "old") {
      remediationAssignmentId = await assignRemediation(
        transaction,
        actor,
        current,
        probeResponseId,
        now,
      );
    } else if (grade.reviewRequired) {
      await routeToHumanReview(
        transaction,
        actor,
        idempotencyKey,
        probeResponseId,
        now,
      );
    }

    const result = {
      probeAssignmentId,
      probeResponseId,
      answeredWith: grade.answeredWith,
      reviewRequired: grade.reviewRequired,
      remediationAssignmentId,
      actorMembershipId: actor.actorMembershipId,
    };
    await transaction
      .update(outboxEvents)
      .set({ payload: result })
      .where(
        and(
          eq(outboxEvents.organizationId, actor.organizationId),
          eq(outboxEvents.idempotencyKey, idempotencyKey),
        ),
      );
    return result;
  });
}

async function loadLearnerAssignment(
  actor: TenantContext,
  probeAssignmentId: string,
) {
  return withTenantContext(actor, (transaction) =>
    requireLearnerAssignment(transaction, actor, probeAssignmentId),
  );
}

type Transaction = Parameters<Parameters<typeof withTenantContext>[1]>[0];

async function requireLearnerAssignment(
  transaction: Transaction,
  actor: TenantContext,
  probeAssignmentId: string,
) {
  const [assignment] = await transaction
    .select({
      responseId: probeResponses.id,
      personId: probeAssignments.personId,
      learnerMembershipId: people.membershipId,
      professionalRoleId: people.professionalRoleId,
      changeEventVersionId: probeAssignments.changeEventVersionId,
      caseVersionId: probeAssignments.caseVersionId,
      caseStatus: divergenceCaseVersions.status,
      caseLockedAt: divergenceCaseVersions.lockedAt,
      ambiguityNote: divergenceCaseVersions.ambiguityNote,
      rationale: divergenceCaseVersions.rationale,
      oldAnswer: divergenceCaseVersions.oldAnswer,
      newAnswer: divergenceCaseVersions.newAnswer,
    })
    .from(probeAssignments)
    .innerJoin(people, eq(people.id, probeAssignments.personId))
    .innerJoin(
      divergenceCaseVersions,
      eq(divergenceCaseVersions.id, probeAssignments.caseVersionId),
    )
    .leftJoin(
      probeResponses,
      eq(probeResponses.assignmentId, probeAssignments.id),
    )
    .where(
      and(
        eq(probeAssignments.organizationId, actor.organizationId),
        eq(probeAssignments.id, probeAssignmentId),
      ),
    )
    .limit(1);
  if (!assignment) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Probe assignment not found.",
      status: 404,
    });
  }
  if (assignment.learnerMembershipId !== actor.actorMembershipId) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "Only the assigned learner may access this probe.",
      status: 403,
    });
  }
  const [learnerRole] = await transaction
    .select({ code: membershipRoles.roleCode })
    .from(membershipRoles)
    .where(
      and(
        eq(membershipRoles.organizationId, actor.organizationId),
        eq(membershipRoles.membershipId, actor.actorMembershipId),
        eq(membershipRoles.roleCode, "learner"),
      ),
    )
    .limit(1);
  if (!learnerRole) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "The learner role is required.",
      status: 403,
    });
  }
  if (
    assignment.caseStatus !== "approved" ||
    !assignment.caseLockedAt ||
    assignment.ambiguityNote
  ) {
    throw new AppError({
      code: "CONFLICT",
      message: "Only a locked, approved, unambiguous case can be completed.",
      status: 409,
    });
  }
  return assignment;
}

function caseVersionHash(assignment: LearnerAssignment) {
  return `sha256:${createHash("sha256")
    .update(
      JSON.stringify({
        caseVersionId: assignment.caseVersionId,
        rationale: assignment.rationale,
        oldAnswer: assignment.oldAnswer,
        newAnswer: assignment.newAnswer,
      }),
    )
    .digest("hex")}`;
}

async function auditProbeCompletion(
  transaction: Transaction,
  actor: TenantContext,
  probeAssignmentId: string,
  probeResponseId: string,
  grade: Awaited<ReturnType<typeof gradeProbeResponse>>,
  now: Date,
) {
  await transaction.insert(auditEvents).values([
    {
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      eventType: "probe.completed",
      objectType: "probe_assignment",
      objectId: probeAssignmentId,
      objectVersionId: probeResponseId,
      payload: { channel: "in_app" },
      occurredAt: now,
    },
    {
      organizationId: actor.organizationId,
      eventType: "probe.assessed",
      objectType: "probe_response",
      objectId: probeResponseId,
      payload: {
        answeredWith: grade.answeredWith,
        confidence: grade.confidence,
        exactQuoteMatched: Boolean(grade.exactQuote),
        reviewRequired: grade.reviewRequired,
      },
      occurredAt: now,
    },
  ]);
}

async function assignRemediation(
  transaction: Transaction,
  actor: TenantContext,
  assignment: LearnerAssignment,
  probeResponseId: string,
  now: Date,
) {
  const [target] = await transaction
    .select({ artifactVersionId: changeImpacts.impactedObjectId })
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
    .where(
      and(
        eq(changeImpacts.organizationId, actor.organizationId),
        eq(changeImpacts.changeEventVersionId, assignment.changeEventVersionId),
        eq(changeImpacts.impactedObjectType, "artifact_version"),
        eq(
          roleArtifactExposures.professionalRoleId,
          assignment.professionalRoleId,
        ),
      ),
    )
    .orderBy(
      sql`CASE WHEN ${changeImpacts.rewriteRequired} = 'yes' THEN 0 ELSE 1 END`,
    )
    .limit(1);
  if (!target) {
    throw new AppError({
      code: "CONFLICT",
      message: "No affected artifact is available for remediation.",
      status: 409,
    });
  }

  const remediationAssignmentId = randomUUID();
  await transaction.insert(remediationAssignments).values({
    id: remediationAssignmentId,
    organizationId: actor.organizationId,
    personId: assignment.personId,
    probeResponseId,
    artifactVersionId: target.artifactVersionId,
    status: "assigned",
    assignedAt: now,
  });
  await transaction.insert(auditEvents).values({
    organizationId: actor.organizationId,
    eventType: "remediation.assigned",
    objectType: "remediation_assignment",
    objectId: remediationAssignmentId,
    objectVersionId: target.artifactVersionId,
    payload: { personId: assignment.personId, probeResponseId },
    occurredAt: now,
  });
  return remediationAssignmentId;
}

async function routeToHumanReview(
  transaction: Transaction,
  actor: TenantContext,
  idempotencyKey: string,
  probeResponseId: string,
  now: Date,
) {
  await transaction.insert(auditEvents).values({
    organizationId: actor.organizationId,
    eventType: "probe.review_requested",
    objectType: "probe_response",
    objectId: probeResponseId,
    payload: { reason: "ambiguous_or_unsupported_assessment" },
    occurredAt: now,
  });
  await transaction
    .insert(outboxEvents)
    .values({
      organizationId: actor.organizationId,
      eventName: "probe.review_required",
      aggregateType: "probe_response",
      aggregateId: probeResponseId,
      idempotencyKey: `${idempotencyKey}:review`,
      payload: { probeResponseId },
    })
    .onConflictDoNothing({
      target: [outboxEvents.organizationId, outboxEvents.idempotencyKey],
    });
}
