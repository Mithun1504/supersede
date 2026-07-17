import "server-only";

import { createHash } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";

import {
  caseRetirements,
  divergenceCases,
  divergenceCaseVersions,
  divergences,
  exercises,
  exerciseVersions,
  people,
  personWorkRoles,
  probeAssessments,
  probeAssignments,
  probeDeliveryEvents,
  probeResponses,
  notifications,
  remediationAssignments,
  releaseBatches,
  releaseCases,
  releaseExercises,
  releaseTargetPeople,
  releaseTargets,
  reviewTasks,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { recordApprovalDecision } from "@/modules/audit/approval-policy";
import { recordMembershipEvent } from "@/modules/audit/service";
import { getAuthenticationAssurance } from "@/modules/identity/auth";
import { authorize, type CurrentActor } from "@/modules/identity/policy";
import type { z } from "zod";
import type { prepareReleaseInput } from "@/modules/releases/contracts";

type PrepareReleaseInput = z.infer<typeof prepareReleaseInput>;

function requireDisplace(actor: CurrentActor) {
  if (actor.organization.productConfiguration !== "displace")
    throw new AppError({
      code: "NOT_FOUND",
      message: "Releases are available only in Displace.",
      status: 404,
    });
}

function hashPersonIds(ids: string[]): string {
  return createHash("sha256")
    .update([...ids].sort().join("\n"))
    .digest("hex");
}

export async function prepareRelease(
  actor: CurrentActor,
  input: PrepareReleaseInput,
): Promise<string> {
  authorize(actor, "release.prepare");
  requireDisplace(actor);
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`release:${actor.organization.id}:${input.idempotencyKey}`}, 0))`,
      );
      const [existing] = await transaction
        .select({ id: releaseBatches.id })
        .from(releaseBatches)
        .where(eq(releaseBatches.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (existing) return existing.id;

      const [divergence] = await transaction
        .select({ id: divergences.id })
        .from(divergences)
        .where(
          and(
            eq(divergences.changeEventVersionId, input.changeEventVersionId),
            eq(divergences.status, "approved"),
          ),
        )
        .limit(1);
      if (!divergence)
        throw new AppError({
          code: "CONFLICT",
          message: "Release requires an approved divergence for this change.",
          status: 409,
        });

      const caseRows = await transaction
        .select({
          id: divergenceCaseVersions.id,
          caseId: divergenceCaseVersions.divergenceCaseId,
          supersedesId: divergenceCaseVersions.supersedesCaseVersionId,
          retiredId: caseRetirements.id,
        })
        .from(divergenceCaseVersions)
        .innerJoin(
          divergenceCases,
          eq(divergenceCases.id, divergenceCaseVersions.divergenceCaseId),
        )
        .leftJoin(
          caseRetirements,
          eq(caseRetirements.caseVersionId, divergenceCaseVersions.id),
        )
        .where(
          and(
            eq(divergenceCases.divergenceId, divergence.id),
            eq(divergenceCaseVersions.recordStatus, "approved"),
          ),
        );
      const supersededCaseIds = new Set(
        caseRows
          .map((row) => row.supersedesId)
          .filter((id): id is string => Boolean(id)),
      );
      const currentCases = caseRows.filter(
        (row) => !row.retiredId && !supersededCaseIds.has(row.id),
      );
      if (currentCases.length < 3)
        throw new AppError({
          code: "CONFLICT",
          message:
            "Approve at least three distinct current cases before release so the initial, 30-day, and 90-day probes never reuse a case.",
          status: 409,
        });

      const exerciseRows = await transaction
        .select({
          id: exerciseVersions.id,
          supersedesId: exerciseVersions.supersedesExerciseVersionId,
        })
        .from(exerciseVersions)
        .innerJoin(exercises, eq(exercises.id, exerciseVersions.exerciseId))
        .where(
          and(
            eq(exercises.divergenceId, divergence.id),
            eq(exerciseVersions.recordStatus, "approved"),
            isNull(exercises.retiredAt),
          ),
        );
      const supersededExerciseIds = new Set(
        exerciseRows
          .map((row) => row.supersedesId)
          .filter((id): id is string => Boolean(id)),
      );
      const currentExercises = exerciseRows.filter(
        (row) => !supersededExerciseIds.has(row.id),
      );
      if (currentExercises.length === 0)
        throw new AppError({
          code: "CONFLICT",
          message: "Release requires an approved correction exercise.",
          status: 409,
        });

      const resolvedPeople = await transaction
        .select({ id: people.id })
        .from(people)
        .innerJoin(personWorkRoles, eq(personWorkRoles.personId, people.id))
        .where(
          and(
            eq(personWorkRoles.workRoleId, input.workRoleId),
            isNull(personWorkRoles.effectiveTo),
            eq(people.status, "active"),
          ),
        );
      const personIds = [
        ...new Set(resolvedPeople.map((row) => row.id)),
      ].sort();
      if (personIds.length === 0)
        throw new AppError({
          code: "CONFLICT",
          message: "The selected role has no active people.",
          status: 409,
        });
      const audienceHash = hashPersonIds(personIds);
      const [batch] = await transaction
        .insert(releaseBatches)
        .values({
          organizationId: actor.organization.id,
          changeEventVersionId: input.changeEventVersionId,
          status: "awaiting_authorization",
          requestedByMembershipId: actor.membership.id,
          resolvedPersonCount: personIds.length,
          resolvedPersonIdsHash: audienceHash,
          idempotencyKey: input.idempotencyKey,
        })
        .returning({ id: releaseBatches.id });
      if (!batch)
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "The release snapshot could not be created.",
          status: 500,
        });
      await transaction.insert(releaseCases).values(
        currentCases.map((row) => ({
          organizationId: actor.organization.id,
          releaseBatchId: batch.id,
          caseVersionId: row.id,
        })),
      );
      await transaction.insert(releaseExercises).values(
        currentExercises.map((row) => ({
          organizationId: actor.organization.id,
          releaseBatchId: batch.id,
          exerciseVersionId: row.id,
        })),
      );
      const [target] = await transaction
        .insert(releaseTargets)
        .values({
          organizationId: actor.organization.id,
          releaseBatchId: batch.id,
          workRoleId: input.workRoleId,
          resolvedPersonCount: personIds.length,
          resolvedPersonIdsHash: audienceHash,
        })
        .returning({ id: releaseTargets.id });
      if (!target)
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "The audience snapshot could not be created.",
          status: 500,
        });
      await transaction.insert(releaseTargetPeople).values(
        personIds.map((personId) => ({
          organizationId: actor.organization.id,
          releaseBatchId: batch.id,
          releaseTargetId: target.id,
          personId,
          resolvedVia: "work_role",
        })),
      );
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "release.prepared",
        objectType: "release_batch",
        objectId: batch.id,
        objectVersionId: batch.id,
        payload: {
          caseVersionIds: currentCases.map((row) => row.id),
          exerciseVersionIds: currentExercises.map((row) => row.id),
          audienceCount: personIds.length,
          audienceHash,
        },
      });
      return batch.id;
    },
  );
}

export async function authorizeRelease(
  actor: CurrentActor,
  releaseBatchId: string,
): Promise<void> {
  authorize(actor, "release.authorize");
  requireDisplace(actor);
  const assurance = await getAuthenticationAssurance();
  await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`release-authorize:${releaseBatchId}`}, 0))`,
      );
      const [batch] = await transaction
        .select()
        .from(releaseBatches)
        .where(eq(releaseBatches.id, releaseBatchId))
        .limit(1);
      if (!batch || batch.status !== "awaiting_authorization")
        throw new AppError({
          code: "CONFLICT",
          message: "Only an awaiting release can be authorized.",
          status: 409,
        });
      const targetPeople = await transaction
        .select({ id: releaseTargetPeople.personId })
        .from(releaseTargetPeople)
        .where(eq(releaseTargetPeople.releaseBatchId, batch.id));
      const personIds = [...new Set(targetPeople.map((row) => row.id))].sort();
      if (
        personIds.length !== batch.resolvedPersonCount ||
        hashPersonIds(personIds) !== batch.resolvedPersonIdsHash
      )
        throw new AppError({
          code: "CONFLICT",
          message: "The release audience snapshot failed integrity validation.",
          status: 409,
        });
      const cases = await transaction
        .select({
          id: releaseCases.caseVersionId,
          divergenceId: divergenceCases.divergenceId,
        })
        .from(releaseCases)
        .innerJoin(
          divergenceCaseVersions,
          eq(divergenceCaseVersions.id, releaseCases.caseVersionId),
        )
        .innerJoin(
          divergenceCases,
          eq(divergenceCases.id, divergenceCaseVersions.divergenceCaseId),
        )
        .where(eq(releaseCases.releaseBatchId, batch.id));
      if (cases.length < 3)
        throw new AppError({
          code: "CONFLICT",
          message: "The release no longer contains sufficient case coverage.",
          status: 409,
        });
      const decision = await recordApprovalDecision(transaction, actor, {
        objectType: "release_batch",
        objectId: batch.id,
        objectVersionId: batch.id,
        action: "authorize",
        requesterMembershipId: batch.requestedByMembershipId,
        authenticationAgeSeconds: assurance.authenticationAgeSeconds,
        mfaVerified: assurance.mfaVerified,
        metadata: {
          audienceHash: batch.resolvedPersonIdsHash,
          audienceCount: batch.resolvedPersonCount,
          caseVersionIds: cases.map((row) => row.id),
        },
      });
      if (!decision.satisfied) return;
      const now = new Date();
      const dueAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      await transaction.insert(probeAssignments).values(
        personIds.map((personId, index) => {
          const selectedCase = cases[index % cases.length]!;
          return {
            organizationId: actor.organization.id,
            personId,
            caseVersionId: selectedCase.id,
            divergenceId: selectedCase.divergenceId,
            changeEventVersionId: batch.changeEventVersionId,
            releaseBatchId: batch.id,
            assignmentKind: "initial",
            dueAt,
            idempotencyKey: `release:${batch.id}:person:${personId}:initial`,
          };
        }),
      );
      const assignments = await transaction
        .select({
          id: probeAssignments.id,
          personId: probeAssignments.personId,
        })
        .from(probeAssignments)
        .where(eq(probeAssignments.releaseBatchId, batch.id));
      if (assignments.length) {
        await transaction.insert(probeDeliveryEvents).values(
          assignments.map((assignment) => ({
            organizationId: actor.organization.id,
            probeAssignmentId: assignment.id,
            eventType: "assigned" as const,
            channel: "in_app",
            providerTimestamp: now,
            metadata: { releaseBatchId: batch.id },
          })),
        );
        await transaction.insert(notifications).values(
          assignments.map((assignment) => ({
            organizationId: actor.organization.id,
            personId: assignment.personId,
            type: "probe_assigned",
            title: "New workplace scenario",
            bodySummary: "A short private decision task is ready.",
            actionPath: `/app/learning/probes/${assignment.id}`,
            objectType: "probe_assignment",
            objectId: assignment.id,
          })),
        );
      }
      await transaction
        .update(releaseBatches)
        .set({ status: "released", authorizedAt: now, releasedAt: now })
        .where(eq(releaseBatches.id, batch.id));
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "release.authorized",
        objectType: "release_batch",
        objectId: batch.id,
        objectVersionId: batch.id,
        payload: {
          audienceCount: personIds.length,
          assignmentsCreated: personIds.length,
        },
      });
    },
  );
}

export async function simulateSeededPersonaResponses(
  actor: CurrentActor,
  releaseBatchId: string,
): Promise<{ old: number; new: number; other: number }> {
  authorize(actor, "release.prepare");
  requireDisplace(actor);
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`seeded-runner:${releaseBatchId}`}, 0))`,
      );
      const [batch] = await transaction
        .select({ id: releaseBatches.id, status: releaseBatches.status })
        .from(releaseBatches)
        .where(eq(releaseBatches.id, releaseBatchId))
        .limit(1);
      if (!batch || batch.status !== "released")
        throw new AppError({
          code: "CONFLICT",
          message: "Only a released batch can run fictional personas.",
          status: 409,
        });
      const assignments = await transaction
        .select({
          id: probeAssignments.id,
          personId: probeAssignments.personId,
          divergenceId: probeAssignments.divergenceId,
          status: probeAssignments.status,
          externalKey: people.externalPersonKey,
          oldAnswer: divergenceCaseVersions.oldAnswer,
          newAnswer: divergenceCaseVersions.newAnswer,
          options: divergenceCaseVersions.options,
        })
        .from(probeAssignments)
        .innerJoin(people, eq(people.id, probeAssignments.personId))
        .innerJoin(
          divergenceCaseVersions,
          eq(divergenceCaseVersions.id, probeAssignments.caseVersionId),
        )
        .where(
          and(
            eq(probeAssignments.releaseBatchId, batch.id),
            eq(people.isSeededPersona, true),
            sql`${probeAssignments.status} in ('assigned', 'opened')`,
          ),
        );
      const totals = { old: 0, new: 0, other: 0 };
      const now = new Date();
      for (const assignment of assignments) {
        const suffix = Number(assignment.externalKey?.split("-").at(-1));
        const intended: "old" | "new" | "other" =
          suffix <= 3 ? "old" : suffix === 4 ? "other" : "new";
        const options = Array.isArray(assignment.options)
          ? (assignment.options as Array<{ id?: unknown }>)
          : [];
        const otherAnswer = options.find(
          (option) =>
            option.id !== assignment.oldAnswer &&
            option.id !== assignment.newAnswer,
        )?.id;
        const selected =
          intended === "old"
            ? assignment.oldAnswer
            : intended === "new"
              ? assignment.newAnswer
              : typeof otherAnswer === "string"
                ? otherAnswer
                : assignment.newAnswer;
        const label =
          intended === "other" && selected === assignment.newAnswer
            ? "new"
            : intended;
        const clientSubmissionId = `seeded:${assignment.id}:v1`;
        const [response] = await transaction
          .insert(probeResponses)
          .values({
            organizationId: actor.organization.id,
            probeAssignmentId: assignment.id,
            answerFormat: "single_choice",
            selectedOptionIds: [selected],
            submittedAt: now,
            clientSubmissionId,
            contentSha256: createHash("sha256")
              .update(JSON.stringify([selected]))
              .digest("hex"),
          })
          .onConflictDoNothing()
          .returning({ id: probeResponses.id });
        if (!response) continue;
        const [assessment] = await transaction
          .insert(probeAssessments)
          .values({
            organizationId: actor.organization.id,
            probeResponseId: response.id,
            revision: 1,
            label,
            source: "deterministic",
            confidence: "1.0000",
            matchedRationale:
              "Deterministic fictional persona pattern for the declared hackathon demonstration.",
            ambiguityReason:
              label === "other" ? "Seeded escalation pattern." : null,
          })
          .returning({ id: probeAssessments.id });
        if (!assessment) continue;
        await transaction.insert(probeDeliveryEvents).values([
          {
            organizationId: actor.organization.id,
            probeAssignmentId: assignment.id,
            eventType: "opened",
            channel: "simulated",
            providerEventId: `${clientSubmissionId}:opened`,
            providerTimestamp: now,
            metadata: { fictionalPersona: true },
          },
          {
            organizationId: actor.organization.id,
            probeAssignmentId: assignment.id,
            eventType: "completed",
            channel: "simulated",
            providerEventId: `${clientSubmissionId}:completed`,
            providerTimestamp: now,
            metadata: { fictionalPersona: true },
          },
        ]);
        await transaction
          .update(probeAssignments)
          .set({
            status: "completed",
            ...(assignment.status === "assigned" ? { openedAt: now } : {}),
            completedAt: now,
          })
          .where(eq(probeAssignments.id, assignment.id));
        if (label === "old") {
          const [exercise] = await transaction
            .select({ id: releaseExercises.exerciseVersionId })
            .from(releaseExercises)
            .innerJoin(
              exerciseVersions,
              eq(exerciseVersions.id, releaseExercises.exerciseVersionId),
            )
            .innerJoin(exercises, eq(exercises.id, exerciseVersions.exerciseId))
            .where(
              and(
                eq(releaseExercises.releaseBatchId, batch.id),
                eq(exercises.divergenceId, assignment.divergenceId),
              ),
            )
            .limit(1);
          if (exercise)
            await transaction.insert(remediationAssignments).values({
              organizationId: actor.organization.id,
              personId: assignment.personId,
              triggerProbeAssessmentId: assessment.id,
              exerciseVersionId: exercise.id,
              dueAt: new Date(now.getTime() + 7 * 86_400_000),
            });
        } else if (label === "other") {
          await transaction.insert(reviewTasks).values({
            organizationId: actor.organization.id,
            taskType: "probe_assessment",
            subjectType: "probe_response",
            subjectId: response.id,
            subjectVersionId: assessment.id,
            reasonCode: "seeded_other_response",
            priority: 50,
          });
        }
        totals[label] += 1;
      }
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "demo.seeded_personas_assessed",
        objectType: "release_batch",
        objectId: batch.id,
        objectVersionId: batch.id,
        payload: { ...totals, fictional: true },
      });
      return totals;
    },
  );
}
