import "server-only";

import { createHash } from "node:crypto";

import { and, count, eq, gte, sql, sum } from "drizzle-orm";

import {
  aiModelRuns,
  aiPromptVersions,
  divergences,
  evidenceSpans,
  exercises,
  exerciseVersions,
  notifications,
  organizationSettings,
  people,
  probeAssessments,
  probeAssignments,
  probeResponses,
  recheckAssignments,
  remediationAssignments,
  remediationAttempts,
  reviewTasks,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { inngest } from "@/inngest/client";
import { getConfigurationStatus, getServerEnv } from "@/lib/env/server";
import { AppError } from "@/lib/errors/app-error";
import { encryptField } from "@/lib/security/field-encryption";
import { recordMembershipEvent } from "@/modules/audit/service";
import { estimateOpenAiCostMinor } from "@/modules/ai/cost";
import { authorize, type CurrentActor } from "@/modules/identity/policy";
import {
  gradeRemediation,
  remediationPromptSha256,
} from "@/modules/learning/grading";

function releaseSha() {
  const value =
    getServerEnv().APPLICATION_RELEASE_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA;
  return value && /^[0-9a-f]{40}$/.test(value) ? value : "0".repeat(40);
}

async function loadContext(
  actor: CurrentActor,
  remediationAssignmentId: string,
) {
  const saved = await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [item] = await transaction
        .select({
          id: remediationAssignments.id,
          status: remediationAssignments.status,
          personId: remediationAssignments.personId,
          exerciseVersionId: remediationAssignments.exerciseVersionId,
          instructions: exerciseVersions.instructions,
          starterContent: exerciseVersions.starterContent,
          gradingRubric: exerciseVersions.gradingRubric,
          evidenceSpanId: exerciseVersions.newRuleEvidenceSpanId,
          evidenceQuote: evidenceSpans.exactQuote,
          divergenceId: exercises.divergenceId,
          newRule: divergences.newRule,
          originalCaseVersionId: probeAssignments.caseVersionId,
          membershipId: people.membershipId,
        })
        .from(remediationAssignments)
        .innerJoin(people, eq(people.id, remediationAssignments.personId))
        .innerJoin(
          exerciseVersions,
          eq(exerciseVersions.id, remediationAssignments.exerciseVersionId),
        )
        .innerJoin(exercises, eq(exercises.id, exerciseVersions.exerciseId))
        .innerJoin(divergences, eq(divergences.id, exercises.divergenceId))
        .innerJoin(
          evidenceSpans,
          eq(evidenceSpans.id, exerciseVersions.newRuleEvidenceSpanId),
        )
        .innerJoin(
          probeAssessments,
          eq(
            probeAssessments.id,
            remediationAssignments.triggerProbeAssessmentId,
          ),
        )
        .innerJoin(
          probeResponses,
          eq(probeResponses.id, probeAssessments.probeResponseId),
        )
        .innerJoin(
          probeAssignments,
          eq(probeAssignments.id, probeResponses.probeAssignmentId),
        )
        .where(eq(remediationAssignments.id, remediationAssignmentId))
        .limit(1);
      return item ?? null;
    },
  );
  return saved;
}

export async function submitRemediation(
  actor: CurrentActor,
  input: { remediationAssignmentId: string; submissionText: string },
): Promise<"passed" | "failed" | "needs_review"> {
  authorize(actor, "learning.complete");
  const context = await loadContext(actor, input.remediationAssignmentId);
  if (!context || context.membershipId !== actor.membership.id)
    throw new AppError({
      code: "NOT_FOUND",
      message: "The correction activity was not found.",
      status: 404,
    });
  if (!["assigned", "opened", "failed"].includes(context.status))
    throw new AppError({
      code: "CONFLICT",
      message: "This correction activity is not accepting submissions.",
      status: 409,
    });
  if (!context.starterContent)
    throw new AppError({
      code: "CONFLICT",
      message:
        "This exercise requires a file workflow that is not available in this activity.",
      status: 409,
    });

  const model = getServerEnv().OPENAI_PRIMARY_MODEL;
  const modelRunId = await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [settings] = await transaction
        .select({
          monthlyAiBudgetMinor: organizationSettings.monthlyAiBudgetMinor,
        })
        .from(organizationSettings)
        .where(eq(organizationSettings.organizationId, actor.organization.id))
        .limit(1);
      const monthStart = new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
      );
      const [usage] = await transaction
        .select({ value: sum(aiModelRuns.costMinor) })
        .from(aiModelRuns)
        .where(
          and(
            eq(aiModelRuns.organizationId, actor.organization.id),
            gte(aiModelRuns.createdAt, monthStart),
          ),
        );
      if (
        settings &&
        settings.monthlyAiBudgetMinor > 0 &&
        Number(usage?.value ?? 0) >= settings.monthlyAiBudgetMinor
      )
        throw new AppError({
          code: "CONFLICT",
          message: "The organization AI budget is exhausted.",
          status: 409,
        });
      const [prompt] = await transaction
        .select({
          id: aiPromptVersions.id,
          sourcePath: aiPromptVersions.sourcePath,
          promptSha256: aiPromptVersions.promptSha256,
        })
        .from(aiPromptVersions)
        .where(
          and(
            eq(aiPromptVersions.taskType, "artifact_feedback"),
            eq(aiPromptVersions.promptVersion, "artifact_feedback_v1"),
            eq(aiPromptVersions.schemaVersion, "1.0.0"),
            eq(aiPromptVersions.status, "approved"),
          ),
        )
        .limit(1);
      if (
        !prompt ||
        prompt.sourcePath !== "src/modules/learning/grading.ts" ||
        prompt.promptSha256 !== remediationPromptSha256
      )
        throw new AppError({
          code: "DEPENDENCY_UNAVAILABLE",
          message:
            "The approved artifact-feedback prompt does not match this release.",
          status: 503,
        });
      const [run] = await transaction
        .insert(aiModelRuns)
        .values({
          organizationId: actor.organization.id,
          taskType: "artifact_feedback",
          provider: "openai",
          model,
          resolvedModel: model,
          aiPromptVersionId: prompt.id,
          subjectType: "remediation_assignment",
          subjectId: context.id,
          subjectVersionId: context.exerciseVersionId,
          applicationReleaseSha: releaseSha(),
          reasoningSetting: "medium",
          status: "running",
          startedAt: new Date(),
        })
        .returning({ id: aiModelRuns.id });
      if (!run)
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "The assessment run could not be started.",
          status: 500,
        });
      return run.id;
    },
  );

  let grade: Awaited<ReturnType<typeof gradeRemediation>>;
  try {
    grade = await gradeRemediation({
      instructions: context.instructions,
      starterContent: context.starterContent,
      gradingRubric: context.gradingRubric,
      newRule: context.newRule,
      evidenceQuote: context.evidenceQuote,
      submissionText: input.submissionText,
    });
  } catch (error) {
    await withTenantContext(
      {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
      },
      async (transaction) =>
        transaction
          .update(aiModelRuns)
          .set({
            status: "failed",
            errorCode: "provider_error",
            errorSummary:
              error instanceof Error
                ? error.message.slice(0, 2_000)
                : "Unknown provider error",
            completedAt: new Date(),
          })
          .where(eq(aiModelRuns.id, modelRunId)),
    );
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message:
        "The correction could not be assessed right now. Your work was not submitted; try again.",
      status: 503,
    });
  }

  const saved = await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`remediation-attempt:${context.id}`}, 0))`,
      );
      const [current] = await transaction
        .select({ status: remediationAssignments.status })
        .from(remediationAssignments)
        .where(eq(remediationAssignments.id, context.id))
        .limit(1);
      if (
        !current ||
        !["assigned", "opened", "failed"].includes(current.status)
      )
        throw new AppError({
          code: "CONFLICT",
          message:
            "This correction activity was completed while it was being assessed.",
          status: 409,
        });
      const [attemptCount] = await transaction
        .select({ value: count() })
        .from(remediationAttempts)
        .where(eq(remediationAttempts.remediationAssignmentId, context.id));
      const now = new Date();
      await transaction
        .update(aiModelRuns)
        .set({
          status: "completed",
          resolvedModel: grade.resolvedModel,
          externalResponseId: grade.responseId,
          inputTokens: grade.inputTokens,
          outputTokens: grade.outputTokens,
          costMinor: estimateOpenAiCostMinor(
            model,
            grade.inputTokens,
            grade.outputTokens,
          ),
          latencyMs: grade.latencyMs,
          validationOutcome: grade.outcome,
          outputJson: { outcome: grade.outcome, feedback: grade.feedback },
          completedAt: now,
        })
        .where(eq(aiModelRuns.id, modelRunId));
      const [attempt] = await transaction
        .insert(remediationAttempts)
        .values({
          organizationId: actor.organization.id,
          remediationAssignmentId: context.id,
          attemptNumber: (attemptCount?.value ?? 0) + 1,
          submissionTextCiphertext: encryptField(input.submissionText),
          submittedAt: now,
          aiModelRunId: modelRunId,
          outcome: grade.outcome,
          feedback: grade.feedback,
          feedbackEvidenceSpanId: context.evidenceSpanId,
          assessedAt: now,
        })
        .returning({ id: remediationAttempts.id });
      if (!attempt)
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "The correction attempt could not be recorded.",
          status: 500,
        });
      await transaction
        .update(remediationAssignments)
        .set({
          status: grade.outcome,
          ...(grade.outcome === "passed" ? { completedAt: now } : {}),
        })
        .where(eq(remediationAssignments.id, context.id));
      if (grade.outcome === "passed") {
        for (const intervalDays of [30, 90] as const)
          await transaction
            .insert(recheckAssignments)
            .values({
              organizationId: actor.organization.id,
              remediationAssignmentId: context.id,
              divergenceId: context.divergenceId,
              personId: context.personId,
              intervalDays,
              dueAt: new Date(now.getTime() + intervalDays * 86_400_000),
              status: "scheduled",
              originalCaseVersionId: context.originalCaseVersionId,
            })
            .onConflictDoNothing();
      } else if (grade.outcome === "needs_review") {
        await transaction
          .insert(reviewTasks)
          .values({
            organizationId: actor.organization.id,
            taskType: "artifact_remediation",
            subjectType: "remediation_assignment",
            subjectId: context.id,
            subjectVersionId: attempt.id,
            reasonCode: "artifact_feedback_needs_review",
            priority: 50,
          })
          .onConflictDoNothing();
      }
      await transaction.insert(notifications).values({
        organizationId: actor.organization.id,
        personId: context.personId,
        type:
          grade.outcome === "passed"
            ? "correction_passed"
            : grade.outcome === "failed"
              ? "correction_revision_requested"
              : "correction_under_review",
        title:
          grade.outcome === "passed"
            ? "Correction activity passed"
            : grade.outcome === "failed"
              ? "Correction revision requested"
              : "Correction sent for human review",
        bodySummary: grade.feedback.slice(0, 500),
        actionPath: `/app/learning/remediations/${context.id}`,
        objectType: "remediation_assignment",
        objectId: context.id,
        objectVersionId: attempt.id,
      });
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "remediation.attempted",
        objectType: "remediation_assignment",
        objectId: context.id,
        objectVersionId: attempt.id,
        payload: {
          outcome: grade.outcome,
          submissionSha256: createHash("sha256")
            .update(input.submissionText)
            .digest("hex"),
        },
        ...(grade.outcome === "passed"
          ? {
              publish: {
                eventName: "remediation/passed",
                payload: {
                  organizationId: actor.organization.id,
                  actorMembershipId: actor.membership.id,
                  remediationAssignmentId: context.id,
                  passedAt: now.toISOString(),
                },
              },
            }
          : {}),
      });
      return { outcome: grade.outcome, completedAt: now };
    },
  );
  if (saved.outcome === "passed" && getConfigurationStatus().inngest) {
    try {
      await inngest.send({
        name: "remediation/passed",
        data: {
          organizationId: actor.organization.id,
          actorMembershipId: actor.membership.id,
          remediationAssignmentId: context.id,
          passedAt: saved.completedAt.toISOString(),
        },
      });
    } catch {
      // The transactional outbox remains pending for replay by the publisher.
    }
  }
  return saved.outcome;
}
