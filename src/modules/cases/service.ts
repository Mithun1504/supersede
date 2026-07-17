import "server-only";

import { and, eq, sql } from "drizzle-orm";

import {
  caseVersionCitations,
  caseRetirements,
  changeEventVersionCitations,
  changeEventVersions,
  divergenceCases,
  divergenceCaseVersions,
  divergences,
  exercises,
  exerciseVersions,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { recordApprovalDecision } from "@/modules/audit/approval-policy";
import { recordMembershipEvent } from "@/modules/audit/service";
import type { CreateCaseInput } from "@/modules/cases/contracts";
import { getAuthenticationAssurance } from "@/modules/identity/auth";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

function requireDisplace(actor: CurrentActor) {
  if (actor.organization.productConfiguration !== "displace")
    throw new AppError({
      code: "NOT_FOUND",
      message: "Divergence cases are available only in Displace.",
      status: 404,
    });
}

export async function createDivergenceCase(
  actor: CurrentActor,
  input: CreateCaseInput,
): Promise<string> {
  authorize(actor, "case.read");
  requireDisplace(actor);
  const options = input.optionsText.split(/\r?\n/).map((line, index) => {
    const separator = line.indexOf("|");
    if (separator < 1)
      throw new AppError({
        code: "VALIDATION_FAILED",
        message: `Option row ${index + 1} must use id|label.`,
        status: 422,
      });
    return {
      id: line.slice(0, separator).trim(),
      label: line.slice(separator + 1).trim(),
    };
  });
  if (
    options.length < 2 ||
    new Set(options.map((option) => option.id)).size !== options.length
  )
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "Provide at least two options with unique IDs.",
      status: 422,
    });
  if (
    ![input.oldAnswer, input.newAnswer].every((answer) =>
      options.some((option) => option.id === answer),
    ) ||
    input.oldAnswer === input.newAnswer
  )
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "Old and new answers must be different valid option IDs.",
      status: 422,
    });
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [change] = await transaction
        .select()
        .from(changeEventVersions)
        .where(eq(changeEventVersions.id, input.changeEventVersionId))
        .limit(1);
      if (!change || change.status !== "validated")
        throw new AppError({
          code: "CONFLICT",
          message: "Cases require a validated ChangeEvent.",
          status: 409,
        });
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`divergence:${change.id}`}, 0))`,
      );
      let [divergence] = await transaction
        .select({ id: divergences.id })
        .from(divergences)
        .where(eq(divergences.changeEventVersionId, change.id))
        .limit(1);
      if (!divergence)
        [divergence] = await transaction
          .insert(divergences)
          .values({
            organizationId: actor.organization.id,
            changeEventVersionId: change.id,
            oldRule: change.oldRule,
            newRule: change.newRule,
            affectedPopulation: change.affectedPopulation,
            status: "in_review",
            createdByMembershipId: actor.membership.id,
          })
          .returning({ id: divergences.id });
      if (!divergence)
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "Divergence could not be created.",
          status: 500,
        });
      const [identity] = await transaction
        .insert(divergenceCases)
        .values({
          organizationId: actor.organization.id,
          divergenceId: divergence.id,
        })
        .returning({ id: divergenceCases.id });
      if (!identity)
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "Case identity could not be created.",
          status: 500,
        });
      const [version] = await transaction
        .insert(divergenceCaseVersions)
        .values({
          organizationId: actor.organization.id,
          divergenceCaseId: identity.id,
          versionNumber: 1,
          scenario: input.scenario,
          answerFormat: "single_choice",
          options,
          oldAnswer: input.oldAnswer,
          newAnswer: input.newAnswer,
          rationale: input.rationale,
          gradingRubric: {
            kind: "exact_option",
            oldAnswer: input.oldAnswer,
            newAnswer: input.newAnswer,
          },
          recordStatus: "in_review",
          createdByMembershipId: actor.membership.id,
        })
        .returning({ id: divergenceCaseVersions.id });
      if (!version)
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "Case version could not be created.",
          status: 500,
        });
      const citations = await transaction
        .select()
        .from(changeEventVersionCitations)
        .where(eq(changeEventVersionCitations.changeEventVersionId, change.id));
      if (citations.length < 2)
        throw new AppError({
          code: "CONFLICT",
          message: "The ChangeEvent citations are incomplete.",
          status: 409,
        });
      await transaction.insert(caseVersionCitations).values(
        citations.map((citation) => ({
          organizationId: actor.organization.id,
          caseVersionId: version.id,
          citationSide: citation.citationSide,
          sourceVersionId: citation.sourceVersionId,
          evidenceSpanId: citation.evidenceSpanId,
          position: citation.position,
        })),
      );
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "case.created",
        objectType: "divergence_case",
        objectId: identity.id,
        objectVersionId: version.id,
      });
      return version.id;
    },
  );
}

export async function approveDivergenceCase(
  actor: CurrentActor,
  caseVersionId: string,
): Promise<void> {
  authorize(actor, "case.approve");
  requireDisplace(actor);
  const assurance = await getAuthenticationAssurance();
  await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`case-approval:${caseVersionId}`}, 0))`,
      );
      const [row] = await transaction
        .select({
          id: divergenceCaseVersions.id,
          caseId: divergenceCaseVersions.divergenceCaseId,
          status: divergenceCaseVersions.recordStatus,
          creatorId: divergenceCaseVersions.createdByMembershipId,
          scenario: divergenceCaseVersions.scenario,
          divergenceId: divergenceCases.divergenceId,
        })
        .from(divergenceCaseVersions)
        .innerJoin(
          divergenceCases,
          eq(divergenceCases.id, divergenceCaseVersions.divergenceCaseId),
        )
        .where(eq(divergenceCaseVersions.id, caseVersionId))
        .limit(1);
      if (!row || row.status !== "in_review")
        throw new AppError({
          code: "CONFLICT",
          message: "Only an in-review case can be approved.",
          status: 409,
        });
      const decision = await recordApprovalDecision(transaction, actor, {
        objectType: "divergence_case",
        objectId: row.caseId,
        objectVersionId: row.id,
        action: "approve",
        ...(row.creatorId ? { creatorMembershipId: row.creatorId } : {}),
        authenticationAgeSeconds: assurance.authenticationAgeSeconds,
        mfaVerified: assurance.mfaVerified,
      });
      if (!decision.satisfied) return;
      await transaction
        .update(divergenceCaseVersions)
        .set({ recordStatus: "approved" })
        .where(eq(divergenceCaseVersions.id, row.id));
      await transaction
        .update(divergences)
        .set({ status: "approved" })
        .where(eq(divergences.id, row.divergenceId));
      const [citation] = await transaction
        .select({ evidenceSpanId: caseVersionCitations.evidenceSpanId })
        .from(caseVersionCitations)
        .where(
          and(
            eq(caseVersionCitations.caseVersionId, row.id),
            eq(caseVersionCitations.citationSide, "new"),
          ),
        )
        .limit(1);
      if (!citation)
        throw new AppError({
          code: "CONFLICT",
          message: "The case has no new-rule evidence.",
          status: 409,
        });
      const [exercise] = await transaction
        .insert(exercises)
        .values({
          organizationId: actor.organization.id,
          divergenceId: row.divergenceId,
        })
        .returning({ id: exercises.id });
      if (exercise)
        await transaction.insert(exerciseVersions).values({
          organizationId: actor.organization.id,
          exerciseId: exercise.id,
          versionNumber: 1,
          title: "Apply the updated rule",
          instructions:
            "Revise the work product so it follows the updated rule. Cite the changed decision point.",
          artifactKind: "other",
          starterContent: row.scenario,
          gradingRubric: { requiresUpdatedRule: true },
          newRuleEvidenceSpanId: citation.evidenceSpanId,
          recordStatus: "in_review",
          createdByMembershipId: actor.membership.id,
        });
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "case.approved",
        objectType: "divergence_case",
        objectId: row.caseId,
        objectVersionId: row.id,
      });
    },
  );
}

export async function approveCorrectionExercise(
  actor: CurrentActor,
  exerciseVersionId: string,
): Promise<void> {
  authorize(actor, "case.approve");
  requireDisplace(actor);
  const assurance = await getAuthenticationAssurance();
  await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`exercise-approval:${exerciseVersionId}`}, 0))`,
      );
      const [row] = await transaction
        .select({
          id: exerciseVersions.id,
          exerciseId: exerciseVersions.exerciseId,
          status: exerciseVersions.recordStatus,
          creatorId: exerciseVersions.createdByMembershipId,
        })
        .from(exerciseVersions)
        .where(eq(exerciseVersions.id, exerciseVersionId))
        .limit(1);
      if (!row || row.status !== "in_review")
        throw new AppError({
          code: "CONFLICT",
          message: "Only an in-review exercise can be approved.",
          status: 409,
        });
      const decision = await recordApprovalDecision(transaction, actor, {
        objectType: "correction_exercise",
        objectId: row.exerciseId,
        objectVersionId: row.id,
        action: "approve",
        ...(row.creatorId ? { creatorMembershipId: row.creatorId } : {}),
        authenticationAgeSeconds: assurance.authenticationAgeSeconds,
        mfaVerified: assurance.mfaVerified,
      });
      if (!decision.satisfied) return;
      await transaction
        .update(exerciseVersions)
        .set({ recordStatus: "approved" })
        .where(eq(exerciseVersions.id, row.id));
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "exercise.approved",
        objectType: "correction_exercise",
        objectId: row.exerciseId,
        objectVersionId: row.id,
      });
    },
  );
}

export async function retireDivergenceCase(
  actor: CurrentActor,
  input: {
    caseVersionId: string;
    reason:
      | "ambiguous"
      | "citation_invalid"
      | "content_error"
      | "source_superseded"
      | "policy_change"
      | "other";
    rationale: string;
    excludesHistoricalMetrics: boolean;
  },
): Promise<void> {
  authorize(actor, "case.approve");
  requireDisplace(actor);
  const assurance = await getAuthenticationAssurance();
  await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`case-retirement:${input.caseVersionId}`}, 0))`,
      );
      const [row] = await transaction
        .select({
          id: divergenceCaseVersions.id,
          caseId: divergenceCaseVersions.divergenceCaseId,
          status: divergenceCaseVersions.recordStatus,
        })
        .from(divergenceCaseVersions)
        .where(eq(divergenceCaseVersions.id, input.caseVersionId))
        .limit(1);
      if (!row || row.status !== "approved")
        throw new AppError({
          code: "CONFLICT",
          message: "Only an approved case version can be retired.",
          status: 409,
        });
      const [existing] = await transaction
        .select({ id: caseRetirements.id })
        .from(caseRetirements)
        .where(eq(caseRetirements.caseVersionId, row.id))
        .limit(1);
      if (existing)
        throw new AppError({
          code: "CONFLICT",
          message: "This case version is already retired.",
          status: 409,
        });
      const decision = await recordApprovalDecision(transaction, actor, {
        objectType: "divergence_case",
        objectId: row.caseId,
        objectVersionId: row.id,
        action: "retire",
        authenticationAgeSeconds: assurance.authenticationAgeSeconds,
        mfaVerified: assurance.mfaVerified,
        metadata: {
          reason: input.reason,
          excludesHistoricalMetrics: input.excludesHistoricalMetrics,
        },
      });
      if (!decision.satisfied) return;
      const [retirement] = await transaction
        .insert(caseRetirements)
        .values({
          organizationId: actor.organization.id,
          caseVersionId: row.id,
          reason: input.reason,
          excludesHistoricalMetrics: input.excludesHistoricalMetrics,
          rationale: input.rationale,
          retiredByMembershipId: actor.membership.id,
          approvalRecordId: decision.approvalRecordId,
        })
        .returning({ id: caseRetirements.id });
      if (!retirement)
        throw new Error("Case retirement insert returned no row.");
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "case.retired",
        objectType: "divergence_case",
        objectId: row.caseId,
        objectVersionId: row.id,
        payload: {
          reason: input.reason,
          excludesHistoricalMetrics: input.excludesHistoricalMetrics,
        },
      });
    },
  );
}
