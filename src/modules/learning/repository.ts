import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import {
  caseVersionCitations,
  divergenceCases,
  divergenceCaseVersions,
  divergences,
  evidenceSpans,
  exerciseVersions,
  people,
  probeAssessments,
  probeAssignments,
  probeResponses,
  remediationAssignments,
  remediationAttempts,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

export type LearnerOption = { id: string; label: string };

function safeOptions(value: unknown): LearnerOption[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is LearnerOption => {
    if (!item || typeof item !== "object") return false;
    const option = item as Record<string, unknown>;
    return typeof option.id === "string" && typeof option.label === "string";
  });
}

function assertDisplace(actor: CurrentActor) {
  authorize(actor, "learning.complete");
  if (actor.organization.productConfiguration !== "displace")
    throw new AppError({
      code: "NOT_FOUND",
      message: "Learning is not enabled for this workspace.",
      status: 404,
    });
}

export async function listMyLearning(actor: CurrentActor) {
  assertDisplace(actor);
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) =>
      transaction
        .select({
          id: probeAssignments.id,
          kind: probeAssignments.assignmentKind,
          status: probeAssignments.status,
          dueAt: probeAssignments.dueAt,
          assignedAt: probeAssignments.assignedAt,
        })
        .from(probeAssignments)
        .innerJoin(people, eq(people.id, probeAssignments.personId))
        .where(eq(people.membershipId, actor.membership.id))
        .orderBy(asc(probeAssignments.dueAt)),
  );
}

export async function getMyProbe(actor: CurrentActor, assignmentId: string) {
  assertDisplace(actor);
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [item] = await transaction
        .select({
          id: probeAssignments.id,
          kind: probeAssignments.assignmentKind,
          status: probeAssignments.status,
          dueAt: probeAssignments.dueAt,
          scenario: divergenceCaseVersions.scenario,
          options: divergenceCaseVersions.options,
          caseVersionId: divergenceCaseVersions.id,
          divergenceId: divergenceCases.divergenceId,
        })
        .from(probeAssignments)
        .innerJoin(people, eq(people.id, probeAssignments.personId))
        .innerJoin(
          divergenceCaseVersions,
          eq(divergenceCaseVersions.id, probeAssignments.caseVersionId),
        )
        .innerJoin(
          divergenceCases,
          eq(divergenceCases.id, divergenceCaseVersions.divergenceCaseId),
        )
        .where(
          and(
            eq(probeAssignments.id, assignmentId),
            eq(people.membershipId, actor.membership.id),
          ),
        )
        .limit(1);
      if (!item) return null;
      const [response] = await transaction
        .select({ id: probeResponses.id })
        .from(probeResponses)
        .where(eq(probeResponses.probeAssignmentId, item.id))
        .limit(1);
      if (!response)
        return { ...item, options: safeOptions(item.options), feedback: null };
      const [assessment, evidence] = await Promise.all([
        transaction
          .select({
            label: probeAssessments.label,
            rationale: probeAssessments.matchedRationale,
          })
          .from(probeAssessments)
          .where(eq(probeAssessments.probeResponseId, response.id))
          .orderBy(desc(probeAssessments.revision))
          .limit(1),
        transaction
          .select({
            newRule: divergences.newRule,
            reviewerRationale: divergenceCaseVersions.rationale,
            quote: evidenceSpans.exactQuote,
          })
          .from(divergences)
          .innerJoin(
            divergenceCases,
            eq(divergenceCases.divergenceId, divergences.id),
          )
          .innerJoin(
            divergenceCaseVersions,
            eq(divergenceCaseVersions.divergenceCaseId, divergenceCases.id),
          )
          .innerJoin(
            caseVersionCitations,
            and(
              eq(caseVersionCitations.caseVersionId, divergenceCaseVersions.id),
              eq(caseVersionCitations.citationSide, "new"),
            ),
          )
          .innerJoin(
            evidenceSpans,
            eq(evidenceSpans.id, caseVersionCitations.evidenceSpanId),
          )
          .where(eq(divergenceCaseVersions.id, item.caseVersionId))
          .orderBy(asc(caseVersionCitations.position))
          .limit(1),
      ]);
      return {
        ...item,
        options: safeOptions(item.options),
        feedback:
          assessment[0] && evidence[0]
            ? { ...assessment[0], ...evidence[0] }
            : null,
      };
    },
  );
}

export async function listLearnerWork(actor: CurrentActor) {
  assertDisplace(actor);
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
          message: "Your learner profile is not linked to this membership.",
          status: 404,
        });
      const [probes, remediations] = await Promise.all([
        transaction
          .select({
            id: probeAssignments.id,
            kind: probeAssignments.assignmentKind,
            status: probeAssignments.status,
            dueAt: probeAssignments.dueAt,
            scenario: divergenceCaseVersions.scenario,
          })
          .from(probeAssignments)
          .innerJoin(
            divergenceCaseVersions,
            eq(divergenceCaseVersions.id, probeAssignments.caseVersionId),
          )
          .where(eq(probeAssignments.personId, person.id))
          .orderBy(asc(probeAssignments.dueAt)),
        transaction
          .select({
            id: remediationAssignments.id,
            status: remediationAssignments.status,
            dueAt: remediationAssignments.dueAt,
          })
          .from(remediationAssignments)
          .where(eq(remediationAssignments.personId, person.id))
          .orderBy(asc(remediationAssignments.dueAt)),
      ]);
      return { probes, remediations };
    },
  );
}

export async function getLearnerProbe(
  actor: CurrentActor,
  assignmentId: string,
) {
  const item = await getMyProbe(actor, assignmentId);
  if (!item)
    throw new AppError({
      code: "NOT_FOUND",
      message: "This probe assignment was not found.",
      status: 404,
    });
  if (item.status === "assigned")
    await withTenantContext(
      {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
      },
      async (transaction) => {
        await transaction
          .update(probeAssignments)
          .set({ status: "opened", openedAt: new Date() })
          .where(
            and(
              eq(probeAssignments.id, item.id),
              inArray(probeAssignments.status, ["assigned"]),
            ),
          );
      },
    );
  return {
    id: item.id,
    kind: item.kind,
    status: item.status === "assigned" ? "opened" : item.status,
    dueAt: item.dueAt,
    scenario: item.scenario,
    options: item.options,
    answerFormat: "single_choice" as const,
    feedback: item.feedback,
    result: item.feedback
      ? {
          label: item.feedback.label,
          selectedOptionIds: null,
          assessedAt: null,
        }
      : null,
  };
}

export async function getLearnerRemediation(
  actor: CurrentActor,
  assignmentId: string,
) {
  assertDisplace(actor);
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [item] = await transaction
        .select({
          id: remediationAssignments.id,
          status: remediationAssignments.status,
          dueAt: remediationAssignments.dueAt,
          title: exerciseVersions.title,
          instructions: exerciseVersions.instructions,
          starterContent: exerciseVersions.starterContent,
          evidenceQuote: evidenceSpans.exactQuote,
        })
        .from(remediationAssignments)
        .innerJoin(people, eq(people.id, remediationAssignments.personId))
        .innerJoin(
          exerciseVersions,
          eq(exerciseVersions.id, remediationAssignments.exerciseVersionId),
        )
        .innerJoin(
          evidenceSpans,
          eq(evidenceSpans.id, exerciseVersions.newRuleEvidenceSpanId),
        )
        .where(
          and(
            eq(remediationAssignments.id, assignmentId),
            eq(people.membershipId, actor.membership.id),
          ),
        )
        .limit(1);
      if (!item) return null;
      const [latest] = await transaction
        .select({
          attemptNumber: remediationAttempts.attemptNumber,
          outcome: remediationAttempts.outcome,
          feedback: remediationAttempts.feedback,
          submittedAt: remediationAttempts.submittedAt,
        })
        .from(remediationAttempts)
        .where(eq(remediationAttempts.remediationAssignmentId, item.id))
        .orderBy(desc(remediationAttempts.attemptNumber))
        .limit(1);
      return { ...item, latest: latest ?? null };
    },
  );
}
