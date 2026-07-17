import "server-only";

import { asc, desc, eq, inArray } from "drizzle-orm";

import {
  claimVersions,
  dependencyEdgeVersions,
  evidenceSpans,
  divergenceCaseVersions,
  probeAssessments,
  probeAssignments,
  probeResponses,
  remediationAttempts,
  reviewTasks,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { decryptField } from "@/lib/security/field-encryption";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

export type ReviewQueueItem = {
  id: string;
  taskType: string;
  priority: number;
  reasonCode: string;
  createdAt: Date;
  subjectVersionId: string | null;
  text: string;
  confidence: number | null;
  loadBearingScore: number | null;
  rationale: string;
  quote: string;
  verificationStatus: string;
  submission: string | null;
};

export async function listReviewQueue(
  actor: CurrentActor,
): Promise<ReviewQueueItem[]> {
  authorize(actor, "edge.review");
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const tasks = await transaction
        .select()
        .from(reviewTasks)
        .where(inArray(reviewTasks.status, ["open", "assigned", "in_progress"]))
        .orderBy(desc(reviewTasks.priority), asc(reviewTasks.createdAt))
        .limit(200);
      const claimIds = tasks
        .filter((task) => task.taskType === "claim" && task.subjectVersionId)
        .map((task) => task.subjectVersionId!);
      const edgeIds = tasks
        .filter(
          (task) =>
            task.taskType === "dependency_edge" && task.subjectVersionId,
        )
        .map((task) => task.subjectVersionId!);
      const remediationAttemptIds = tasks
        .filter(
          (task) =>
            task.taskType === "artifact_remediation" && task.subjectVersionId,
        )
        .map((task) => task.subjectVersionId!);
      const probeAssessmentIds = tasks
        .filter(
          (task) =>
            task.taskType === "probe_assessment" && task.subjectVersionId,
        )
        .map((task) => task.subjectVersionId!);
      const [claimRows, edgeRows, remediationRows, probeRows] =
        await Promise.all([
          claimIds.length
            ? transaction
                .select({
                  id: claimVersions.id,
                  text: claimVersions.text,
                  confidence: claimVersions.confidence,
                  loadBearingScore: claimVersions.loadBearingScore,
                  rationale: claimVersions.loadBearingRationale,
                  quote: evidenceSpans.exactQuote,
                  verificationStatus: evidenceSpans.verificationStatus,
                })
                .from(claimVersions)
                .innerJoin(
                  evidenceSpans,
                  eq(evidenceSpans.id, claimVersions.primaryEvidenceSpanId),
                )
                .where(inArray(claimVersions.id, claimIds))
            : [],
          edgeIds.length
            ? transaction
                .select({
                  id: dependencyEdgeVersions.id,
                  confidence: dependencyEdgeVersions.confidence,
                  loadBearingScore: dependencyEdgeVersions.loadBearingScore,
                  rationale: dependencyEdgeVersions.loadBearingRationale,
                  quote: evidenceSpans.exactQuote,
                  verificationStatus: evidenceSpans.verificationStatus,
                })
                .from(dependencyEdgeVersions)
                .innerJoin(
                  evidenceSpans,
                  eq(evidenceSpans.id, dependencyEdgeVersions.evidenceSpanId),
                )
                .where(inArray(dependencyEdgeVersions.id, edgeIds))
            : [],
          remediationAttemptIds.length
            ? transaction
                .select({
                  id: remediationAttempts.id,
                  submission: remediationAttempts.submissionTextCiphertext,
                  rationale: remediationAttempts.feedback,
                  quote: evidenceSpans.exactQuote,
                })
                .from(remediationAttempts)
                .innerJoin(
                  evidenceSpans,
                  eq(
                    evidenceSpans.id,
                    remediationAttempts.feedbackEvidenceSpanId,
                  ),
                )
                .where(inArray(remediationAttempts.id, remediationAttemptIds))
            : [],
          probeAssessmentIds.length
            ? transaction
                .select({
                  id: probeAssessments.id,
                  selectedOptionIds: probeResponses.selectedOptionIds,
                  options: divergenceCaseVersions.options,
                  rationale: probeAssessments.matchedRationale,
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
                .innerJoin(
                  divergenceCaseVersions,
                  eq(divergenceCaseVersions.id, probeAssignments.caseVersionId),
                )
                .where(inArray(probeAssessments.id, probeAssessmentIds))
            : [],
        ]);
      const claimsById = new Map(claimRows.map((row) => [row.id, row]));
      const edgesById = new Map(edgeRows.map((row) => [row.id, row]));
      const remediationById = new Map(
        remediationRows.map((row) => [row.id, row]),
      );
      const probesById = new Map(probeRows.map((row) => [row.id, row]));
      return tasks.map((task) => {
        const claim = task.subjectVersionId
          ? claimsById.get(task.subjectVersionId)
          : undefined;
        const edge = task.subjectVersionId
          ? edgesById.get(task.subjectVersionId)
          : undefined;
        const remediation = task.subjectVersionId
          ? remediationById.get(task.subjectVersionId)
          : undefined;
        const probe = task.subjectVersionId
          ? probesById.get(task.subjectVersionId)
          : undefined;
        const probeOptionLabels = probe
          ? (Array.isArray(probe.options) ? probe.options : [])
              .filter(
                (option): option is { id: string; label: string } =>
                  typeof option === "object" &&
                  option !== null &&
                  "id" in option &&
                  "label" in option &&
                  typeof option.id === "string" &&
                  typeof option.label === "string",
              )
              .filter((option) => probe.selectedOptionIds?.includes(option.id))
              .map((option) => option.label)
              .join(", ")
          : null;
        const detail = claim ?? edge;
        return {
          id: task.id,
          taskType: task.taskType,
          priority: task.priority,
          reasonCode: task.reasonCode,
          createdAt: task.createdAt,
          subjectVersionId: task.subjectVersionId,
          text:
            claim?.text ??
            (edge
              ? "Proposed dependency support"
              : remediation
                ? "Learner correction awaiting independent assessment"
                : probe
                  ? "Learner response requires human classification"
                  : "Quote requires manual verification"),
          confidence: detail ? Number(detail.confidence) : null,
          loadBearingScore: detail ? Number(detail.loadBearingScore) : null,
          rationale:
            remediation?.rationale ??
            probe?.rationale ??
            detail?.rationale ??
            "The model output could not be promoted because its quote did not match immutable text.",
          quote: remediation?.quote ?? detail?.quote ?? "",
          verificationStatus:
            detail?.verificationStatus ??
            (remediation ? "human_review" : "failed"),
          submission: remediation?.submission
            ? decryptField(remediation.submission)
            : probeOptionLabels,
        };
      });
    },
  );
}
