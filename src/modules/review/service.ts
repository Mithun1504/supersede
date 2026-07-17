import "server-only";

import { and, eq, inArray, or, sql } from "drizzle-orm";

import {
  claimVersions,
  dependencyEdgeVersions,
  evidenceSpans,
  exercises,
  exerciseVersions,
  graphNodes,
  notifications,
  probeAssessments,
  probeAssignments,
  probeResponses,
  recheckAssignments,
  releaseExercises,
  remediationAssignments,
  remediationAttempts,
  reviewActions,
  reviewSessions,
  reviewTasks,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { recordMembershipEvent } from "@/modules/audit/service";
import type { ReviewDecisionInput } from "@/modules/review/contracts";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

export async function decideReviewTask(
  actor: CurrentActor,
  input: ReviewDecisionInput,
): Promise<void> {
  authorize(actor, "edge.review");
  await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`review:${input.reviewTaskId}`}, 0))`,
      );
      const [task] = await transaction
        .select()
        .from(reviewTasks)
        .where(
          and(
            eq(reviewTasks.id, input.reviewTaskId),
            inArray(reviewTasks.status, ["open", "assigned", "in_progress"]),
          ),
        )
        .limit(1);
      if (!task)
        throw new AppError({
          code: "CONFLICT",
          message: "This review task was already resolved or is unavailable.",
          status: 409,
        });
      if (
        !task.subjectVersionId ||
        !["claim", "dependency_edge"].includes(task.taskType)
      ) {
        throw new AppError({
          code: "CONFLICT",
          message:
            "This task requires the dedicated evidence-verification workflow.",
          status: 409,
        });
      }

      let resultingVersionId = task.subjectVersionId;
      if (task.taskType === "claim") {
        const [candidate] = await transaction
          .select()
          .from(claimVersions)
          .where(eq(claimVersions.id, task.subjectVersionId))
          .limit(1);
        if (!candidate)
          throw new AppError({
            code: "NOT_FOUND",
            message: "The claim candidate no longer exists.",
            status: 404,
          });
        if (
          input.action === "accepted" &&
          !(
            await transaction
              .select({ status: evidenceSpans.verificationStatus })
              .from(evidenceSpans)
              .where(eq(evidenceSpans.id, candidate.primaryEvidenceSpanId))
              .limit(1)
          ).some((row) =>
            ["exact", "fuzzy_verified", "human_verified"].includes(row.status),
          )
        ) {
          throw new AppError({
            code: "CONFLICT",
            message: "A claim cannot be accepted without verified evidence.",
            status: 409,
          });
        }
        if (input.action === "edited") {
          const [successorAlreadyExists] = await transaction
            .select({ id: claimVersions.id })
            .from(claimVersions)
            .where(eq(claimVersions.supersedesClaimVersionId, candidate.id))
            .limit(1);
          if (successorAlreadyExists)
            throw new AppError({
              code: "CONFLICT",
              message: "This claim version already has a successor.",
              status: 409,
            });

          const [successor] = await transaction
            .insert(claimVersions)
            .values({
              organizationId: actor.organization.id,
              claimId: candidate.claimId,
              artifactVersionId: candidate.artifactVersionId,
              versionNumber: candidate.versionNumber + 1,
              text: input.editedText,
              normalizedText: input.editedText
                .toLocaleLowerCase("en")
                .replace(/\s+/g, " ")
                .trim(),
              primaryEvidenceSpanId: candidate.primaryEvidenceSpanId,
              confidence: candidate.confidence,
              loadBearingScore: candidate.loadBearingScore,
              loadBearingRationale: candidate.loadBearingRationale,
              reviewStatus: "edited",
              extractionRunId: candidate.extractionRunId,
              aiModelRunId: candidate.aiModelRunId,
              supersedesClaimVersionId: candidate.id,
              createdByMembershipId: actor.membership.id,
            })
            .returning({ id: claimVersions.id });
          if (!successor)
            throw new AppError({
              code: "INTERNAL_ERROR",
              message: "The edited claim version could not be created.",
              status: 500,
            });
          resultingVersionId = successor.id;
          const [successorNode] = await transaction
            .insert(graphNodes)
            .values({
              organizationId: actor.organization.id,
              nodeType: "claim_version",
              claimVersionId: successor.id,
            })
            .returning({ id: graphNodes.id });
          const [candidateNode] = await transaction
            .select({ id: graphNodes.id })
            .from(graphNodes)
            .where(eq(graphNodes.claimVersionId, candidate.id))
            .limit(1);
          if (!successorNode || !candidateNode)
            throw new AppError({
              code: "CONFLICT",
              message: "The claim graph node is unavailable.",
              status: 409,
            });

          const connected = await transaction
            .select()
            .from(dependencyEdgeVersions)
            .where(
              or(
                eq(dependencyEdgeVersions.fromNodeId, candidateNode.id),
                eq(dependencyEdgeVersions.toNodeId, candidateNode.id),
              ),
            );
          const supersededIds = new Set(
            connected
              .map((edge) => edge.supersedesEdgeVersionId)
              .filter((id): id is string => Boolean(id)),
          );
          for (const edge of connected.filter(
            (value) => !supersededIds.has(value.id),
          )) {
            const [edgeSuccessor] = await transaction
              .insert(dependencyEdgeVersions)
              .values({
                organizationId: actor.organization.id,
                dependencyEdgeId: edge.dependencyEdgeId,
                versionNumber: edge.versionNumber + 1,
                fromNodeId:
                  edge.fromNodeId === candidateNode.id
                    ? successorNode.id
                    : edge.fromNodeId,
                toNodeId:
                  edge.toNodeId === candidateNode.id
                    ? successorNode.id
                    : edge.toNodeId,
                edgeType: edge.edgeType,
                evidenceSpanId: edge.evidenceSpanId,
                confidence: edge.confidence,
                loadBearingScore: edge.loadBearingScore,
                loadBearingRationale: edge.loadBearingRationale,
                reviewStatus:
                  edge.edgeType === "contains" ? "accepted" : "needs_review",
                extractionRunId: edge.extractionRunId,
                aiModelRunId: edge.aiModelRunId,
                supersedesEdgeVersionId: edge.id,
                createdByMembershipId: actor.membership.id,
              })
              .returning({ id: dependencyEdgeVersions.id });
            if (!edgeSuccessor) continue;
            await transaction
              .update(dependencyEdgeVersions)
              .set({ reviewStatus: "edited" })
              .where(eq(dependencyEdgeVersions.id, edge.id));
            if (edge.edgeType !== "contains") {
              const updated = await transaction
                .update(reviewTasks)
                .set({
                  subjectVersionId: edgeSuccessor.id,
                  reasonCode: "claim_text_edited",
                  status: "open",
                  assignedToMembershipId: null,
                })
                .where(
                  and(
                    eq(reviewTasks.taskType, "dependency_edge"),
                    eq(reviewTasks.subjectVersionId, edge.id),
                    inArray(reviewTasks.status, [
                      "open",
                      "assigned",
                      "in_progress",
                    ]),
                  ),
                )
                .returning({ id: reviewTasks.id });
              if (updated.length === 0)
                await transaction.insert(reviewTasks).values({
                  organizationId: actor.organization.id,
                  taskType: "dependency_edge",
                  subjectType: "dependency_edge",
                  subjectId: edge.dependencyEdgeId,
                  subjectVersionId: edgeSuccessor.id,
                  reasonCode: "claim_text_edited",
                  priority: 90,
                });
            }
          }
          await transaction
            .update(claimVersions)
            .set({ reviewStatus: "edited" })
            .where(eq(claimVersions.id, candidate.id));
        } else if (input.action !== "deferred") {
          await transaction
            .update(claimVersions)
            .set({ reviewStatus: input.action })
            .where(eq(claimVersions.id, candidate.id));
          const [claimNode] = await transaction
            .select({ id: graphNodes.id })
            .from(graphNodes)
            .where(eq(graphNodes.claimVersionId, candidate.id))
            .limit(1);
          if (claimNode) {
            await transaction
              .update(dependencyEdgeVersions)
              .set({ reviewStatus: input.action })
              .where(
                and(
                  eq(dependencyEdgeVersions.toNodeId, claimNode.id),
                  eq(dependencyEdgeVersions.edgeType, "contains"),
                ),
              );
          }
        }
      } else {
        if (input.action === "edited")
          throw new AppError({
            code: "VALIDATION_FAILED",
            message: "Dependency edges cannot be edited as claim text.",
            status: 400,
          });
        const [candidate] = await transaction
          .select({
            id: dependencyEdgeVersions.id,
            evidenceStatus: evidenceSpans.verificationStatus,
          })
          .from(dependencyEdgeVersions)
          .innerJoin(
            evidenceSpans,
            eq(evidenceSpans.id, dependencyEdgeVersions.evidenceSpanId),
          )
          .where(eq(dependencyEdgeVersions.id, task.subjectVersionId))
          .limit(1);
        if (!candidate)
          throw new AppError({
            code: "NOT_FOUND",
            message: "The dependency candidate no longer exists.",
            status: 404,
          });
        if (
          input.action === "accepted" &&
          !["exact", "fuzzy_verified", "human_verified"].includes(
            candidate.evidenceStatus,
          )
        ) {
          throw new AppError({
            code: "CONFLICT",
            message:
              "A dependency cannot be accepted without verified evidence.",
            status: 409,
          });
        }
        if (input.action !== "deferred")
          await transaction
            .update(dependencyEdgeVersions)
            .set({ reviewStatus: input.action })
            .where(eq(dependencyEdgeVersions.id, candidate.id));
      }

      const now = new Date();
      const [session] = await transaction
        .insert(reviewSessions)
        .values({
          organizationId: actor.organization.id,
          membershipId: actor.membership.id,
          reviewTaskType: task.taskType,
          startedAt: new Date(now.getTime() - input.activeSeconds * 1_000),
          endedAt: now,
          activeSeconds: input.activeSeconds,
          itemsReviewed: 1,
        })
        .returning({ id: reviewSessions.id });
      if (!session)
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "Review evidence could not be recorded.",
          status: 500,
        });
      await transaction.insert(reviewActions).values({
        organizationId: actor.organization.id,
        reviewSessionId: session.id,
        reviewTaskId: task.id,
        action: input.action,
        resultingVersionId:
          input.action === "deferred" ? null : resultingVersionId,
        reason: input.reason || null,
      });
      await transaction
        .update(reviewTasks)
        .set(
          input.action === "deferred"
            ? { status: "open", assignedToMembershipId: null }
            : {
                status: "resolved",
                resolvedAt: now,
                assignedToMembershipId: actor.membership.id,
              },
        )
        .where(eq(reviewTasks.id, task.id));
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: `review.${input.action}`,
        objectType: task.subjectType,
        objectId: task.subjectId,
        ...(resultingVersionId ? { objectVersionId: resultingVersionId } : {}),
        payload: {
          reviewTaskId: task.id,
          activeSeconds: input.activeSeconds,
          reason: input.reason || null,
          supersededVersionId:
            input.action === "edited" ? task.subjectVersionId : null,
        },
      });
    },
  );
}

export async function classifyProbeResponse(
  actor: CurrentActor,
  input: {
    reviewTaskId: string;
    label: "old" | "new" | "other";
    rationale: string;
  },
): Promise<void> {
  authorize(actor, "edge.review");
  await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`review:${input.reviewTaskId}`}, 0))`,
      );
      const [task] = await transaction
        .select()
        .from(reviewTasks)
        .where(
          and(
            eq(reviewTasks.id, input.reviewTaskId),
            eq(reviewTasks.taskType, "probe_assessment"),
            inArray(reviewTasks.status, ["open", "assigned", "in_progress"]),
          ),
        )
        .limit(1);
      if (!task?.subjectVersionId)
        throw new AppError({
          code: "CONFLICT",
          message:
            "This probe assessment was already resolved or is unavailable.",
          status: 409,
        });
      const [lineage] = await transaction
        .select({
          assessmentId: probeAssessments.id,
          responseId: probeResponses.id,
          assignmentId: probeAssignments.id,
          personId: probeAssignments.personId,
          divergenceId: probeAssignments.divergenceId,
          releaseBatchId: probeAssignments.releaseBatchId,
          revision: probeAssessments.revision,
        })
        .from(probeAssessments)
        .innerJoin(
          probeResponses,
          eq(probeResponses.id, probeAssessments.probeResponseId),
        )
        .innerJoin(
          probeAssignments,
          eq(probeAssignments.id, probeResponses.probeAssignmentId),
        )
        .where(eq(probeAssessments.id, task.subjectVersionId))
        .limit(1);
      if (!lineage)
        throw new AppError({
          code: "NOT_FOUND",
          message: "The probe response lineage is incomplete.",
          status: 404,
        });
      const [successorExists] = await transaction
        .select({ id: probeAssessments.id })
        .from(probeAssessments)
        .where(
          eq(
            probeAssessments.supersedesProbeAssessmentId,
            lineage.assessmentId,
          ),
        )
        .limit(1);
      if (successorExists)
        throw new AppError({
          code: "CONFLICT",
          message: "This assessment already has a human revision.",
          status: 409,
        });
      const now = new Date();
      const [revision] = await transaction
        .insert(probeAssessments)
        .values({
          organizationId: actor.organization.id,
          probeResponseId: lineage.responseId,
          revision: lineage.revision + 1,
          label: input.label,
          source: "human",
          confidence: null,
          matchedRationale: input.rationale,
          ambiguityReason: input.label === "other" ? input.rationale : null,
          assessedByMembershipId: actor.membership.id,
          supersedesProbeAssessmentId: lineage.assessmentId,
          assessedAt: now,
        })
        .returning({ id: probeAssessments.id });
      if (!revision)
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "The human assessment revision could not be created.",
          status: 500,
        });
      if (input.label === "old") {
        if (!lineage.releaseBatchId)
          throw new AppError({
            code: "CONFLICT",
            message: "The probe is not bound to a release snapshot.",
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
              eq(releaseExercises.releaseBatchId, lineage.releaseBatchId),
              eq(exercises.divergenceId, lineage.divergenceId),
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
        await transaction
          .insert(remediationAssignments)
          .values({
            organizationId: actor.organization.id,
            personId: lineage.personId,
            triggerProbeAssessmentId: revision.id,
            exerciseVersionId: exercise.id,
            dueAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000),
          })
          .onConflictDoNothing();
      }
      const [session] = await transaction
        .insert(reviewSessions)
        .values({
          organizationId: actor.organization.id,
          membershipId: actor.membership.id,
          reviewTaskType: "probe_assessment",
          startedAt: now,
          endedAt: now,
          activeSeconds: 0,
          itemsReviewed: 1,
        })
        .returning({ id: reviewSessions.id });
      if (!session)
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "The assessment review record could not be created.",
          status: 500,
        });
      await transaction.insert(reviewActions).values({
        organizationId: actor.organization.id,
        reviewSessionId: session.id,
        reviewTaskId: task.id,
        action: "reclassified",
        resultingVersionId: revision.id,
        reason: input.rationale,
      });
      await transaction
        .update(reviewTasks)
        .set({
          status: "resolved",
          resolvedAt: now,
          assignedToMembershipId: actor.membership.id,
        })
        .where(eq(reviewTasks.id, task.id));
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "probe.human_reclassified",
        objectType: "probe_response",
        objectId: lineage.responseId,
        objectVersionId: revision.id,
        payload: {
          reviewTaskId: task.id,
          label: input.label,
          supersedesAssessmentId: lineage.assessmentId,
        },
      });
    },
  );
}

export async function assessLearnerCorrection(
  actor: CurrentActor,
  input: {
    reviewTaskId: string;
    outcome: "passed" | "failed";
    feedback: string;
  },
): Promise<void> {
  authorize(actor, "edge.review");
  await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`review:${input.reviewTaskId}`}, 0))`,
      );
      const [task] = await transaction
        .select()
        .from(reviewTasks)
        .where(
          and(
            eq(reviewTasks.id, input.reviewTaskId),
            eq(reviewTasks.taskType, "artifact_remediation"),
            inArray(reviewTasks.status, ["open", "assigned", "in_progress"]),
          ),
        )
        .limit(1);
      if (!task?.subjectVersionId)
        throw new AppError({
          code: "CONFLICT",
          message:
            "This correction review was already resolved or is unavailable.",
          status: 409,
        });
      const [lineage] = await transaction
        .select({
          attemptId: remediationAttempts.id,
          remediationId: remediationAssignments.id,
          personId: remediationAssignments.personId,
          originalCaseVersionId: probeAssignments.caseVersionId,
          divergenceId: probeAssignments.divergenceId,
        })
        .from(remediationAttempts)
        .innerJoin(
          remediationAssignments,
          eq(
            remediationAssignments.id,
            remediationAttempts.remediationAssignmentId,
          ),
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
        .where(eq(remediationAttempts.id, task.subjectVersionId))
        .limit(1);
      if (!lineage)
        throw new AppError({
          code: "NOT_FOUND",
          message: "The correction attempt lineage is incomplete.",
          status: 404,
        });
      const now = new Date();
      await transaction
        .update(remediationAttempts)
        .set({
          outcome: input.outcome,
          feedback: input.feedback,
          reviewedByMembershipId: actor.membership.id,
          assessedAt: now,
        })
        .where(eq(remediationAttempts.id, lineage.attemptId));
      await transaction
        .update(remediationAssignments)
        .set({
          status: input.outcome,
          ...(input.outcome === "passed" ? { completedAt: now } : {}),
        })
        .where(eq(remediationAssignments.id, lineage.remediationId));
      await transaction.insert(notifications).values({
        organizationId: actor.organization.id,
        personId: lineage.personId,
        type:
          input.outcome === "passed"
            ? "correction_passed"
            : "correction_revision_requested",
        title:
          input.outcome === "passed"
            ? "Correction activity passed"
            : "Correction revision requested",
        bodySummary: input.feedback.slice(0, 500),
        actionPath: `/app/learning/remediations/${lineage.remediationId}`,
        objectType: "remediation_assignment",
        objectId: lineage.remediationId,
        objectVersionId: lineage.attemptId,
      });
      if (input.outcome === "passed") {
        await transaction
          .insert(recheckAssignments)
          .values(
            [30, 90].map((intervalDays) => ({
              organizationId: actor.organization.id,
              remediationAssignmentId: lineage.remediationId,
              divergenceId: lineage.divergenceId,
              personId: lineage.personId,
              intervalDays,
              dueAt: new Date(
                now.getTime() + intervalDays * 24 * 60 * 60 * 1_000,
              ),
              originalCaseVersionId: lineage.originalCaseVersionId,
            })),
          )
          .onConflictDoNothing();
      }
      const [session] = await transaction
        .insert(reviewSessions)
        .values({
          organizationId: actor.organization.id,
          membershipId: actor.membership.id,
          reviewTaskType: "artifact_remediation",
          startedAt: now,
          endedAt: now,
          activeSeconds: 0,
          itemsReviewed: 1,
        })
        .returning({ id: reviewSessions.id });
      if (!session)
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "The correction review record could not be created.",
          status: 500,
        });
      await transaction.insert(reviewActions).values({
        organizationId: actor.organization.id,
        reviewSessionId: session.id,
        reviewTaskId: task.id,
        action: input.outcome === "passed" ? "accepted" : "rejected",
        resultingVersionId: lineage.attemptId,
        reason: input.feedback,
      });
      await transaction
        .update(reviewTasks)
        .set({
          status: "resolved",
          resolvedAt: now,
          assignedToMembershipId: actor.membership.id,
        })
        .where(eq(reviewTasks.id, task.id));
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: `learning.remediation_${input.outcome}`,
        objectType: "remediation_assignment",
        objectId: lineage.remediationId,
        objectVersionId: lineage.attemptId,
        payload: {
          reviewTaskId: task.id,
          rechecksScheduled: input.outcome === "passed" ? [30, 90] : [],
        },
      });
    },
  );
}

export async function dismissQuoteFailure(
  actor: CurrentActor,
  input: { reviewTaskId: string; reason: string },
): Promise<void> {
  authorize(actor, "edge.review");
  await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`review:${input.reviewTaskId}`}, 0))`,
      );
      const [task] = await transaction
        .select()
        .from(reviewTasks)
        .where(
          and(
            eq(reviewTasks.id, input.reviewTaskId),
            eq(reviewTasks.taskType, "quote_verification"),
            inArray(reviewTasks.status, ["open", "assigned", "in_progress"]),
          ),
        )
        .limit(1);
      if (!task)
        throw new AppError({
          code: "CONFLICT",
          message: "This quote failure was already resolved or is unavailable.",
          status: 409,
        });
      const now = new Date();
      const [session] = await transaction
        .insert(reviewSessions)
        .values({
          organizationId: actor.organization.id,
          membershipId: actor.membership.id,
          reviewTaskType: "quote_verification",
          startedAt: now,
          endedAt: now,
          activeSeconds: 0,
          itemsReviewed: 1,
        })
        .returning({ id: reviewSessions.id });
      if (!session)
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "The review record could not be created.",
          status: 500,
        });
      await transaction.insert(reviewActions).values({
        organizationId: actor.organization.id,
        reviewSessionId: session.id,
        reviewTaskId: task.id,
        action: "rejected",
        reason: input.reason,
      });
      await transaction
        .update(reviewTasks)
        .set({
          status: "resolved",
          resolvedAt: now,
          assignedToMembershipId: actor.membership.id,
        })
        .where(eq(reviewTasks.id, task.id));
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "review.quote_failure_dismissed",
        objectType: task.subjectType,
        objectId: task.subjectId,
        ...(task.subjectVersionId
          ? { objectVersionId: task.subjectVersionId }
          : {}),
        payload: { reviewTaskId: task.id, reason: input.reason },
      });
    },
  );
}
