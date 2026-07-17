import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  artifactOwners,
  artifactRemediations,
  artifacts,
  artifactVersions,
  changeEvents,
  changeEventVersions,
  changeImpacts,
  claimVersions,
  propagationRuns,
  sources,
  sourceVersions,
  corpusArtifacts,
  corpora,
  memberships,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

export async function listChangeSourceVersions(actor: CurrentActor) {
  authorize(actor, "change.write");
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    (transaction) =>
      transaction
        .select({
          id: sourceVersions.id,
          sourceId: sourceVersions.sourceId,
          sourceTitle: sources.title,
          versionLabel: sourceVersions.versionLabel,
          recordStatus: sourceVersions.recordStatus,
          effectiveAt: sourceVersions.effectiveAt,
        })
        .from(sourceVersions)
        .innerJoin(sources, eq(sources.id, sourceVersions.sourceId))
        .where(inArray(sourceVersions.recordStatus, ["approved", "superseded"]))
        .orderBy(sources.title, desc(sourceVersions.versionNumber)),
  );
}

export async function listChanges(actor: CurrentActor) {
  authorize(actor, "change.read");
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) =>
      transaction
        .select({
          id: changeEvents.id,
          versionId: changeEventVersions.id,
          sourceTitle: sources.title,
          versionNumber: changeEventVersions.versionNumber,
          diffSummary: changeEventVersions.diffSummary,
          status: changeEventVersions.status,
          enteredByMembershipId: changeEventVersions.enteredByMembershipId,
          createdAt: changeEventVersions.createdAt,
          propagationStatus: propagationRuns.status,
          impactsFound: propagationRuns.impactsFound,
        })
        .from(changeEventVersions)
        .innerJoin(
          changeEvents,
          eq(changeEvents.id, changeEventVersions.changeEventId),
        )
        .innerJoin(sources, eq(sources.id, changeEvents.sourceId))
        .leftJoin(
          propagationRuns,
          eq(propagationRuns.changeEventVersionId, changeEventVersions.id),
        )
        .orderBy(desc(changeEventVersions.createdAt)),
  );
}

export async function listRemediations(actor: CurrentActor) {
  if (
    !actor.permissions.includes("artifact.remediate_owned") &&
    !actor.permissions.includes("artifact.verify")
  )
    authorize(actor, "artifact.remediate_owned");
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    (transaction) =>
      transaction
        .select({
          id: artifactRemediations.id,
          status: artifactRemediations.status,
          requiredAction: artifactRemediations.requiredAction,
          dueAt: artifactRemediations.dueAt,
          artifactId: artifactRemediations.artifactId,
          artifactTitle: artifacts.title,
          artifactKind: artifacts.kind,
          impactedArtifactVersionId:
            artifactRemediations.impactedArtifactVersionId,
          impactedVersionLabel: artifactVersions.versionLabel,
          assignedToMembershipId: artifactRemediations.assignedToMembershipId,
          assigneeName: memberships.displayName,
          corpusId: corpusArtifacts.corpusId,
        })
        .from(artifactRemediations)
        .innerJoin(artifacts, eq(artifacts.id, artifactRemediations.artifactId))
        .innerJoin(
          artifactVersions,
          eq(
            artifactVersions.id,
            artifactRemediations.impactedArtifactVersionId,
          ),
        )
        .leftJoin(
          memberships,
          eq(memberships.id, artifactRemediations.assignedToMembershipId),
        )
        .leftJoin(
          corpusArtifacts,
          eq(corpusArtifacts.artifactId, artifactRemediations.artifactId),
        )
        .leftJoin(
          artifactOwners,
          and(
            eq(artifactOwners.artifactId, artifactRemediations.artifactId),
            eq(artifactOwners.membershipId, actor.membership.id),
            isNull(artifactOwners.effectiveTo),
          ),
        )
        .where(
          actor.permissions.includes("artifact.verify")
            ? sql`true`
            : sql`${artifactRemediations.assignedToMembershipId} = ${actor.membership.id} or ${artifactOwners.id} is not null`,
        )
        .orderBy(desc(artifactRemediations.createdAt)),
  );
}

export async function getRemediationDetail(
  actor: CurrentActor,
  remediationId: string,
) {
  if (
    !actor.permissions.includes("artifact.remediate_owned") &&
    !actor.permissions.includes("artifact.verify")
  )
    authorize(actor, "artifact.remediate_owned");
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [row] = await transaction
        .select({
          id: artifactRemediations.id,
          artifactId: artifactRemediations.artifactId,
          artifactTitle: artifacts.title,
          artifactKind: artifacts.kind,
          status: artifactRemediations.status,
          requiredAction: artifactRemediations.requiredAction,
          assignedToMembershipId: artifactRemediations.assignedToMembershipId,
          impactedArtifactVersionId:
            artifactRemediations.impactedArtifactVersionId,
          impactedVersionLabel: artifactVersions.versionLabel,
          resolvedArtifactVersionId:
            artifactRemediations.resolvedArtifactVersionId,
          diffSummary: changeEventVersions.diffSummary,
          oldRule: changeEventVersions.oldRule,
          newRule: changeEventVersions.newRule,
          sourceTitle: sources.title,
          corpusId: corpora.id,
        })
        .from(artifactRemediations)
        .innerJoin(artifacts, eq(artifacts.id, artifactRemediations.artifactId))
        .innerJoin(
          artifactVersions,
          eq(
            artifactVersions.id,
            artifactRemediations.impactedArtifactVersionId,
          ),
        )
        .innerJoin(
          changeImpacts,
          eq(changeImpacts.id, artifactRemediations.changeImpactId),
        )
        .innerJoin(
          changeEventVersions,
          eq(changeEventVersions.id, changeImpacts.changeEventVersionId),
        )
        .innerJoin(
          changeEvents,
          eq(changeEvents.id, changeEventVersions.changeEventId),
        )
        .innerJoin(sources, eq(sources.id, changeEvents.sourceId))
        .innerJoin(
          corpusArtifacts,
          and(
            eq(corpusArtifacts.artifactId, artifacts.id),
            isNull(corpusArtifacts.removedAt),
          ),
        )
        .innerJoin(corpora, eq(corpora.id, corpusArtifacts.corpusId))
        .where(eq(artifactRemediations.id, remediationId))
        .limit(1);
      if (!row) return null;
      if (
        !actor.permissions.includes("artifact.verify") &&
        row.assignedToMembershipId !== actor.membership.id
      )
        return null;
      return row;
    },
  );
}

export async function getChangeDetail(
  actor: CurrentActor,
  changeEventId: string,
) {
  authorize(actor, "change.read");
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const rows = await transaction
        .select({
          id: changeEvents.id,
          sourceTitle: sources.title,
          versionId: changeEventVersions.id,
          versionNumber: changeEventVersions.versionNumber,
          oldRule: changeEventVersions.oldRule,
          newRule: changeEventVersions.newRule,
          affectedPopulation: changeEventVersions.affectedPopulation,
          exclusions: changeEventVersions.exclusions,
          unresolvedAmbiguity: changeEventVersions.unresolvedAmbiguity,
          diffSummary: changeEventVersions.diffSummary,
          status: changeEventVersions.status,
          enteredByMembershipId: changeEventVersions.enteredByMembershipId,
          createdAt: changeEventVersions.createdAt,
        })
        .from(changeEvents)
        .innerJoin(sources, eq(sources.id, changeEvents.sourceId))
        .innerJoin(
          changeEventVersions,
          eq(changeEventVersions.changeEventId, changeEvents.id),
        )
        .where(eq(changeEvents.id, changeEventId))
        .orderBy(desc(changeEventVersions.versionNumber));
      if (!rows[0]) return null;
      const impacts = await transaction
        .select({
          id: changeImpacts.id,
          impactClass: changeImpacts.impactClass,
          confidence: changeImpacts.confidence,
          rationale: changeImpacts.rationale,
          requiresRemediation: changeImpacts.requiresRemediation,
          reviewStatus: changeImpacts.reviewStatus,
          claimText: claimVersions.text,
          artifactTitle: artifacts.title,
        })
        .from(changeImpacts)
        .leftJoin(
          claimVersions,
          eq(claimVersions.id, changeImpacts.claimVersionId),
        )
        .leftJoin(
          artifactVersions,
          eq(artifactVersions.id, changeImpacts.artifactVersionId),
        )
        .leftJoin(artifacts, eq(artifacts.id, artifactVersions.artifactId))
        .where(eq(changeImpacts.changeEventVersionId, rows[0].versionId));
      const [propagation] = await transaction
        .select({
          status: propagationRuns.status,
          nodesExamined: propagationRuns.nodesExamined,
          impactsFound: propagationRuns.impactsFound,
          completedAt: propagationRuns.completedAt,
        })
        .from(propagationRuns)
        .where(eq(propagationRuns.changeEventVersionId, rows[0].versionId))
        .limit(1);
      return { change: rows[0], versions: rows, impacts, propagation };
    },
  );
}
