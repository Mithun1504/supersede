import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { getDatabase, type Database } from "@/db/client";
import {
  auditEvents,
  divergenceCaseVersions,
  membershipRoles,
  outboxEvents,
  people,
  probeAssignments,
  probeResponses,
  recheckAssignments,
  remediationAssignments,
  remediationAttempts,
} from "@/db/schema";
import { type TenantContext, withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { assertIdempotencyActor } from "@/lib/security/idempotency";
import { reserveLearningEvent } from "@/modules/learning/events";
import {
  planRechecks,
  releaseBlockedRecheck,
} from "@/modules/learning/rechecks";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const uuidSchema = z.string().uuid();
const idempotencyKeySchema = z.string().trim().min(8).max(255);

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function enqueue(
  transaction: Transaction,
  input: {
    organizationId: string;
    idempotencyKey: string;
    eventName: string;
    aggregateId: string;
    payload: Record<string, unknown>;
  },
) {
  await transaction
    .insert(outboxEvents)
    .values({ ...input, aggregateType: "recheck_assignment" })
    .onConflictDoNothing({
      target: [outboxEvents.organizationId, outboxEvents.idempotencyKey],
    });
}

export async function completeRemediation(
  actor: TenantContext,
  input: {
    idempotencyKey: string;
    remediationAssignmentId: string;
    submittedPatch: string;
    feedback: string;
    passed: boolean;
    now?: Date;
  },
) {
  const remediationAssignmentId = uuidSchema.parse(
    input.remediationAssignmentId,
  );
  const now = input.now ?? new Date();

  return withTenantContext(actor, async (transaction) => {
    const reservation = await reserveLearningEvent(transaction, {
      organizationId: actor.organizationId,
      idempotencyKey: idempotencyKeySchema.parse(input.idempotencyKey),
      eventName: "remediation.completed",
      aggregateType: "remediation_assignment",
      aggregateId: remediationAssignmentId,
      payload: {
        remediationAssignmentId,
        passed: input.passed,
        actorMembershipId: actor.actorMembershipId,
      },
    });
    if (reservation.duplicate) {
      assertIdempotencyActor(reservation.payload, actor.actorMembershipId);
      return reservation.payload;
    }

    const [remediation] = await transaction
      .select({
        personId: remediationAssignments.personId,
        learnerMembershipId: people.membershipId,
        status: remediationAssignments.status,
        probeResponseId: remediationAssignments.probeResponseId,
        changeEventVersionId: probeAssignments.changeEventVersionId,
        originalCaseVersionId: probeAssignments.caseVersionId,
      })
      .from(remediationAssignments)
      .innerJoin(
        probeResponses,
        eq(probeResponses.id, remediationAssignments.probeResponseId),
      )
      .innerJoin(people, eq(people.id, remediationAssignments.personId))
      .innerJoin(
        probeAssignments,
        eq(probeAssignments.id, probeResponses.assignmentId),
      )
      .where(
        and(
          eq(remediationAssignments.organizationId, actor.organizationId),
          eq(remediationAssignments.id, remediationAssignmentId),
        ),
      )
      .limit(1);
    if (!remediation) {
      throw new AppError({
        code: "NOT_FOUND",
        message: "Remediation assignment not found.",
        status: 404,
      });
    }
    if (remediation.learnerMembershipId !== actor.actorMembershipId) {
      throw new AppError({
        code: "FORBIDDEN",
        message: "Only the assigned learner may complete this remediation.",
        status: 403,
      });
    }
    const [learnerRole] = await transaction
      .select({ roleCode: membershipRoles.roleCode })
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
    if (remediation.status === "passed") {
      throw new AppError({
        code: "CONFLICT",
        message: "The remediation assignment is already complete.",
        status: 409,
      });
    }

    await transaction.insert(remediationAttempts).values({
      organizationId: actor.organizationId,
      remediationAssignmentId,
      submittedPatch: z.string().trim().min(1).parse(input.submittedPatch),
      feedback: z.string().trim().min(1).parse(input.feedback),
      passed: input.passed,
      createdAt: now,
    });
    const [completed] = await transaction
      .update(remediationAssignments)
      .set({
        status: input.passed ? "passed" : "failed",
        completedAt: now,
      })
      .where(
        and(
          eq(remediationAssignments.organizationId, actor.organizationId),
          eq(remediationAssignments.id, remediationAssignmentId),
          ne(remediationAssignments.status, "passed"),
        ),
      )
      .returning({ id: remediationAssignments.id });
    if (!completed) {
      throw new AppError({
        code: "CONFLICT",
        message: "The remediation assignment is already complete.",
        status: 409,
      });
    }
    await transaction.insert(auditEvents).values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.actorMembershipId,
      eventType: "remediation.completed",
      objectType: "remediation_assignment",
      objectId: remediationAssignmentId,
      payload: { passed: input.passed },
      occurredAt: now,
    });

    if (!input.passed) return { remediationAssignmentId, passed: false };

    const alternatives = await transaction
      .select({ id: divergenceCaseVersions.id })
      .from(divergenceCaseVersions)
      .where(
        and(
          eq(divergenceCaseVersions.organizationId, actor.organizationId),
          eq(
            divergenceCaseVersions.changeEventVersionId,
            remediation.changeEventVersionId,
          ),
          eq(divergenceCaseVersions.status, "approved"),
        ),
      );
    const plans = planRechecks({
      remediationCompletedAt: now,
      originalCaseVersionId: remediation.originalCaseVersionId,
      approvedAlternativeCaseVersionIds: alternatives.map(({ id }) => id),
    });

    for (const plan of plans) {
      const recheckId = randomUUID();
      await transaction.insert(recheckAssignments).values({
        id: recheckId,
        organizationId: actor.organizationId,
        personId: remediation.personId,
        changeEventVersionId: remediation.changeEventVersionId,
        caseVersionId: plan.caseVersionId,
        dueOn: isoDate(plan.dueAt),
        status: plan.status,
        createdAt: now,
      });
      await transaction.insert(auditEvents).values({
        organizationId: actor.organizationId,
        eventType:
          plan.status === "scheduled"
            ? "recheck.scheduled"
            : "recheck.blocked_case_required",
        objectType: "recheck_assignment",
        objectId: recheckId,
        payload: {
          dueOn: isoDate(plan.dueAt),
          caseVersionId: plan.caseVersionId,
          originalCaseVersionId: remediation.originalCaseVersionId,
        },
        occurredAt: now,
      });
      if (plan.status === "blocked_case_required") {
        await enqueue(transaction, {
          organizationId: actor.organizationId,
          idempotencyKey: `recheck:${recheckId}:case-required`,
          eventName: "case-review.required",
          aggregateId: recheckId,
          payload: {
            recheckAssignmentId: recheckId,
            changeEventVersionId: remediation.changeEventVersionId,
            originalCaseVersionId: remediation.originalCaseVersionId,
          },
        });
      }
    }

    return { remediationAssignmentId, passed: true };
  });
}

export async function releaseBlockedRechecksForApprovedCase(
  actor: TenantContext,
  input: { approvedCaseVersionId: string; now?: Date },
) {
  const approvedCaseVersionId = uuidSchema.parse(input.approvedCaseVersionId);
  const now = input.now ?? new Date();

  return withTenantContext(actor, async (transaction) => {
    const [approved] = await transaction
      .select({
        status: divergenceCaseVersions.status,
        changeEventVersionId: divergenceCaseVersions.changeEventVersionId,
      })
      .from(divergenceCaseVersions)
      .where(
        and(
          eq(divergenceCaseVersions.organizationId, actor.organizationId),
          eq(divergenceCaseVersions.id, approvedCaseVersionId),
        ),
      )
      .limit(1);
    if (!approved || approved.status !== "approved") {
      throw new AppError({
        code: "CONFLICT",
        message: "A blocked recheck requires an approved case version.",
        status: 409,
      });
    }

    const result = await transaction.execute<{
      id: string;
      due_on: string;
      person_id: string;
      original_case_version_id: string;
    }>(sql`
      SELECT
        recheck.id,
        recheck.due_on,
        recheck.person_id,
        original.case_version_id AS original_case_version_id
      FROM recheck_assignment recheck
      JOIN LATERAL (
        SELECT assignment.case_version_id
        FROM probe_assignment assignment
        WHERE assignment.organization_id = recheck.organization_id
          AND assignment.person_id = recheck.person_id
          AND assignment.change_event_version_id = recheck.change_event_version_id
        ORDER BY assignment.created_at ASC
        LIMIT 1
      ) original ON true
      WHERE recheck.organization_id = ${actor.organizationId}
        AND recheck.change_event_version_id = ${approved.changeEventVersionId}
        AND recheck.status = 'blocked_case_required'
        AND original.case_version_id <> ${approvedCaseVersionId}
        AND NOT EXISTS (
          SELECT 1
          FROM probe_assignment used_case
          WHERE used_case.organization_id = recheck.organization_id
            AND used_case.person_id = recheck.person_id
            AND used_case.change_event_version_id = recheck.change_event_version_id
            AND used_case.case_version_id = ${approvedCaseVersionId}
        )
      ORDER BY recheck.person_id, recheck.due_on ASC
      FOR UPDATE OF recheck SKIP LOCKED
    `);

    let released = 0;
    const releasedPeople = new Set<string>();
    for (const row of result.rows) {
      if (releasedPeople.has(row.person_id)) continue;
      const plan = releaseBlockedRecheck({
        dueAt: new Date(`${row.due_on}T00:00:00.000Z`),
        now,
        originalCaseVersionId: row.original_case_version_id,
        approvedCaseVersionId,
      });
      const overdue = plan.dueAt.getTime() === now.getTime();
      await transaction
        .update(recheckAssignments)
        .set({
          caseVersionId: approvedCaseVersionId,
          dueOn: isoDate(plan.dueAt),
          status: overdue ? "assigned" : "scheduled",
        })
        .where(
          and(
            eq(recheckAssignments.organizationId, actor.organizationId),
            eq(recheckAssignments.id, row.id),
            eq(recheckAssignments.status, "blocked_case_required"),
          ),
        );
      await transaction.insert(auditEvents).values({
        organizationId: actor.organizationId,
        eventType: overdue
          ? "recheck.assigned_after_case_approval"
          : "recheck.scheduled_after_case_approval",
        objectType: "recheck_assignment",
        objectId: row.id,
        objectVersionId: approvedCaseVersionId,
        payload: { originalCaseVersionId: row.original_case_version_id },
        occurredAt: now,
      });
      if (overdue) {
        await enqueue(transaction, {
          organizationId: actor.organizationId,
          idempotencyKey: `recheck:${row.id}:dispatch`,
          eventName: "recheck.dispatch.requested",
          aggregateId: row.id,
          payload: {
            recheckAssignmentId: row.id,
            caseVersionId: approvedCaseVersionId,
          },
        });
      }
      releasedPeople.add(row.person_id);
      released += 1;
    }
    return { released };
  });
}

export async function dispatchDueRechecks(now = new Date()) {
  const result = await getDatabase().execute<{ id: string }>(
    sql`select * from app.claim_due_rechecks(${100})`,
  );
  return { dispatched: result.rows.length, at: now.toISOString() };
}
