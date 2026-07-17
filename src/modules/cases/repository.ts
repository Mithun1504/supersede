import "server-only";

import { desc, eq } from "drizzle-orm";

import {
  caseRetirements,
  caseVersionCitations,
  changeEvents,
  changeEventVersions,
  divergenceCases,
  divergenceCaseVersions,
  divergences,
  exercises,
  exerciseVersions,
  evidenceSpans,
  sourceVersions,
  sources,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

export async function getCasesWorkspace(actor: CurrentActor) {
  authorize(actor, "case.read");
  if (actor.organization.productConfiguration !== "displace")
    throw new AppError({
      code: "NOT_FOUND",
      message: "Cases are not enabled for this workspace.",
      status: 404,
    });
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [changes, cases, exerciseRows, citations] = await Promise.all([
        transaction
          .select({
            id: changeEventVersions.id,
            label: changeEventVersions.diffSummary,
            sourceTitle: sources.title,
          })
          .from(changeEventVersions)
          .innerJoin(
            changeEvents,
            eq(changeEvents.id, changeEventVersions.changeEventId),
          )
          .innerJoin(sources, eq(sources.id, changeEvents.sourceId))
          .where(eq(changeEventVersions.status, "validated"))
          .orderBy(desc(changeEventVersions.createdAt)),
        transaction
          .select({
            id: divergenceCaseVersions.id,
            caseId: divergenceCases.id,
            scenario: divergenceCaseVersions.scenario,
            oldAnswer: divergenceCaseVersions.oldAnswer,
            newAnswer: divergenceCaseVersions.newAnswer,
            rationale: divergenceCaseVersions.rationale,
            status: divergenceCaseVersions.recordStatus,
            creatorId: divergenceCaseVersions.createdByMembershipId,
            changeEventVersionId: divergences.changeEventVersionId,
            createdAt: divergenceCaseVersions.createdAt,
            retirementReason: caseRetirements.reason,
            retiredAt: caseRetirements.retiredAt,
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
          .innerJoin(
            divergences,
            eq(divergences.id, divergenceCases.divergenceId),
          )
          .orderBy(desc(divergenceCaseVersions.createdAt)),
        transaction
          .select({
            id: exerciseVersions.id,
            title: exerciseVersions.title,
            instructions: exerciseVersions.instructions,
            status: exerciseVersions.recordStatus,
            creatorId: exerciseVersions.createdByMembershipId,
          })
          .from(exerciseVersions)
          .innerJoin(exercises, eq(exercises.id, exerciseVersions.exerciseId))
          .orderBy(desc(exerciseVersions.createdAt)),
        transaction
          .select({
            caseVersionId: caseVersionCitations.caseVersionId,
            side: caseVersionCitations.citationSide,
            quote: evidenceSpans.exactQuote,
            sourceTitle: sources.title,
          })
          .from(caseVersionCitations)
          .innerJoin(
            evidenceSpans,
            eq(evidenceSpans.id, caseVersionCitations.evidenceSpanId),
          )
          .innerJoin(
            sourceVersions,
            eq(sourceVersions.id, caseVersionCitations.sourceVersionId),
          )
          .innerJoin(sources, eq(sources.id, sourceVersions.sourceId)),
      ]);
      const citationsByCase = Map.groupBy(
        citations,
        (citation) => citation.caseVersionId,
      );
      return {
        changes,
        cases: cases.map((item) => ({
          ...item,
          citations: citationsByCase.get(item.id) ?? [],
        })),
        exercises: exerciseRows,
      };
    },
  );
}
