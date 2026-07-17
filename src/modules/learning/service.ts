import "server-only";

import { createHash } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import {
  divergenceCaseVersions,
  exercises,
  exerciseVersions,
  notifications,
  people,
  probeAssessments,
  probeAssignments,
  probeDeliveryEvents,
  probeResponses,
  recheckAssignments,
  releaseExercises,
  remediationAssignments,
  reviewTasks,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { recordMembershipEvent } from "@/modules/audit/service";
import type { z } from "zod";
import type { submitProbeInput } from "@/modules/learning/contracts";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

type SubmitProbeInput = z.infer<typeof submitProbeInput>;

export async function submitLearnerProbe(
  actor: CurrentActor,
  input: SubmitProbeInput,
): Promise<"old" | "new" | "other"> {
  authorize(actor, "learning.complete");
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [person] = await transaction
        .select({ id: people.id })
        .from(people)
        .where(
          and(
            eq(people.membershipId, actor.membership.id),
            eq(people.status, "active"),
          ),
        )
        .limit(1);
      if (!person)
        throw new AppError({
          code: "NOT_FOUND",
          message: "Your learner profile is unavailable.",
          status: 404,
        });
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`probe:${input.probeAssignmentId}`}, 0))`,
      );
      const [assignment] = await transaction
        .select({
          id: probeAssignments.id,
          personId: probeAssignments.personId,
          status: probeAssignments.status,
          caseVersionId: probeAssignments.caseVersionId,
          divergenceId: probeAssignments.divergenceId,
          releaseBatchId: probeAssignments.releaseBatchId,
          recheckAssignmentId: probeAssignments.recheckAssignmentId,
          options: divergenceCaseVersions.options,
          answerFormat: divergenceCaseVersions.answerFormat,
          oldAnswer: divergenceCaseVersions.oldAnswer,
          newAnswer: divergenceCaseVersions.newAnswer,
        })
        .from(probeAssignments)
        .innerJoin(
          divergenceCaseVersions,
          eq(divergenceCaseVersions.id, probeAssignments.caseVersionId),
        )
        .where(
          and(
            eq(probeAssignments.id, input.probeAssignmentId),
            eq(probeAssignments.personId, person.id),
          ),
        )
        .limit(1);
      if (!assignment)
        throw new AppError({
          code: "NOT_FOUND",
          message: "This probe assignment was not found.",
          status: 404,
        });
      if (!["assigned", "opened"].includes(assignment.status))
        throw new AppError({
          code: "CONFLICT",
          message: "This probe has already been submitted or is unavailable.",
          status: 409,
        });
      if (assignment.answerFormat !== "single_choice")
        throw new AppError({
          code: "CONFLICT",
          message: "This probe requires an unsupported response format.",
          status: 409,
        });
      const optionIds = Array.isArray(assignment.options)
        ? assignment.options
            .filter(
              (option): option is { id: string } =>
                typeof option === "object" &&
                option !== null &&
                "id" in option &&
                typeof option.id === "string",
            )
            .map((option) => option.id)
        : [];
      if (!optionIds.includes(input.selectedOptionId))
        throw new AppError({
          code: "VALIDATION_FAILED",
          message: "Choose one of the available responses.",
          status: 422,
        });
      const contentSha256 = createHash("sha256")
        .update(JSON.stringify([input.selectedOptionId]))
        .digest("hex");
      const now = new Date();
      const [response] = await transaction
        .insert(probeResponses)
        .values({
          organizationId: actor.organization.id,
          probeAssignmentId: assignment.id,
          answerFormat: "single_choice",
          selectedOptionIds: [input.selectedOptionId],
          submittedAt: now,
          clientSubmissionId: input.clientSubmissionId,
          contentSha256,
        })
        .returning({ id: probeResponses.id });
      if (!response)
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "The response could not be recorded.",
          status: 500,
        });
      const label =
        input.selectedOptionId === assignment.oldAnswer
          ? "old"
          : input.selectedOptionId === assignment.newAnswer
            ? "new"
            : "other";
      const [assessment] = await transaction
        .insert(probeAssessments)
        .values({
          organizationId: actor.organization.id,
          probeResponseId: response.id,
          revision: 1,
          label,
          source: "deterministic",
          confidence: label === "other" ? "0.0000" : "1.0000",
          matchedRationale:
            label === "other"
              ? "The selected option is neither the governed old nor new answer."
              : `The selected option exactly matches the governed ${label}-rule answer.`,
          ambiguityReason:
            label === "other" ? "Response requires human assessment." : null,
          assessedAt: now,
        })
        .returning({ id: probeAssessments.id });
      if (!assessment)
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "The response assessment could not be recorded.",
          status: 500,
        });
      await transaction
        .update(probeAssignments)
        .set({ status: "completed", completedAt: now })
        .where(eq(probeAssignments.id, assignment.id));
      await transaction.insert(probeDeliveryEvents).values({
        organizationId: actor.organization.id,
        probeAssignmentId: assignment.id,
        eventType: "completed",
        channel: "in_app",
        occurredAt: now,
      });

      if (label === "old") {
        if (!assignment.releaseBatchId)
          throw new AppError({
            code: "CONFLICT",
            message: "The assignment is not bound to a release snapshot.",
            status: 409,
          });
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
              eq(releaseExercises.releaseBatchId, assignment.releaseBatchId),
              eq(exercises.divergenceId, assignment.divergenceId),
              eq(exerciseVersions.recordStatus, "approved"),
            ),
          )
          .limit(1);
        if (!exercise)
          throw new AppError({
            code: "CONFLICT",
            message: "The release has no approved correction exercise.",
            status: 409,
          });
        const [remediation] = await transaction
          .insert(remediationAssignments)
          .values({
            organizationId: actor.organization.id,
            personId: person.id,
            triggerProbeAssessmentId: assessment.id,
            exerciseVersionId: exercise.id,
            dueAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          })
          .returning({ id: remediationAssignments.id });
        if (remediation)
          await transaction.insert(notifications).values({
            organizationId: actor.organization.id,
            personId: person.id,
            type: "remediation_assigned",
            title: "Correction activity ready",
            bodySummary: "Apply the updated rule to a realistic work product.",
            actionPath: `/app/learning/remediations/${remediation.id}`,
            objectType: "remediation_assignment",
            objectId: remediation.id,
          });
      } else if (label === "other") {
        await transaction.insert(reviewTasks).values({
          organizationId: actor.organization.id,
          taskType: "probe_assessment",
          subjectType: "probe_response",
          subjectId: response.id,
          subjectVersionId: assessment.id,
          reasonCode: "deterministic_other",
          priority: 90,
        });
      }
      if (assignment.recheckAssignmentId)
        await transaction
          .update(recheckAssignments)
          .set({ status: "completed", completedAt: now })
          .where(eq(recheckAssignments.id, assignment.recheckAssignmentId));
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "probe.submitted",
        objectType: "probe_assignment",
        objectId: assignment.id,
        objectVersionId: assessment.id,
        payload: {
          assessmentLabel: label,
          assessmentSource: "deterministic",
          responseSha256: contentSha256,
        },
      });
      return label;
    },
  );
}
