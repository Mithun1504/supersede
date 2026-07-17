import "server-only";

import { and, asc, countDistinct, desc, eq, isNull } from "drizzle-orm";

import {
  artifactOwners,
  artifacts,
  artifactVersions,
  corpora,
  corpusArtifacts,
  corpusSources,
  documentVersions,
  memberships,
  sources,
  sourceVersions,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

export type CorpusListItem = {
  id: string;
  name: string;
  description: string;
  status: string;
  sourceCount: number;
  artifactCount: number;
  updatedAt: Date;
};

export async function listCorpora(
  actor: CurrentActor,
): Promise<CorpusListItem[]> {
  authorize(actor, "corpus.read");
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [sourceCounts, artifactCounts, rows] = await Promise.all([
        transaction
          .select({
            corpusId: corpusSources.corpusId,
            value: countDistinct(corpusSources.sourceId),
          })
          .from(corpusSources)
          .where(isNull(corpusSources.removedAt))
          .groupBy(corpusSources.corpusId),
        transaction
          .select({
            corpusId: corpusArtifacts.corpusId,
            value: countDistinct(corpusArtifacts.artifactId),
          })
          .from(corpusArtifacts)
          .where(isNull(corpusArtifacts.removedAt))
          .groupBy(corpusArtifacts.corpusId),
        transaction
          .select()
          .from(corpora)
          .where(eq(corpora.status, "active"))
          .orderBy(asc(corpora.name)),
      ]);
      const sourcesByCorpus = new Map(
        sourceCounts.map((row) => [row.corpusId, row.value]),
      );
      const artifactsByCorpus = new Map(
        artifactCounts.map((row) => [row.corpusId, row.value]),
      );
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status,
        sourceCount: sourcesByCorpus.get(row.id) ?? 0,
        artifactCount: artifactsByCorpus.get(row.id) ?? 0,
        updatedAt: row.updatedAt,
      }));
    },
  );
}

export async function getCorpusDetail(actor: CurrentActor, corpusId: string) {
  authorize(actor, "corpus.read");
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [corpus] = await transaction
        .select()
        .from(corpora)
        .where(eq(corpora.id, corpusId))
        .limit(1);
      if (!corpus)
        throw new AppError({
          code: "NOT_FOUND",
          message: "Corpus not found.",
          status: 404,
        });
      const [sourceRows, artifactRows] = await Promise.all([
        transaction
          .select({
            id: sources.id,
            title: sources.title,
            kind: sources.kind,
            retiredAt: sources.retiredAt,
            versionId: sourceVersions.id,
            versionLabel: sourceVersions.versionLabel,
            recordStatus: sourceVersions.recordStatus,
            processingStatus: documentVersions.processingStatus,
          })
          .from(corpusSources)
          .innerJoin(sources, eq(sources.id, corpusSources.sourceId))
          .leftJoin(sourceVersions, eq(sourceVersions.sourceId, sources.id))
          .leftJoin(
            documentVersions,
            eq(documentVersions.id, sourceVersions.documentVersionId),
          )
          .where(
            and(
              eq(corpusSources.corpusId, corpusId),
              isNull(corpusSources.removedAt),
            ),
          )
          .orderBy(asc(sources.title), desc(sourceVersions.versionNumber)),
        transaction
          .select({
            id: artifacts.id,
            title: artifacts.title,
            kind: artifacts.kind,
            retiredAt: artifacts.retiredAt,
            versionId: artifactVersions.id,
            versionLabel: artifactVersions.versionLabel,
            recordStatus: artifactVersions.recordStatus,
            processingStatus: documentVersions.processingStatus,
          })
          .from(corpusArtifacts)
          .innerJoin(artifacts, eq(artifacts.id, corpusArtifacts.artifactId))
          .leftJoin(
            artifactVersions,
            eq(artifactVersions.artifactId, artifacts.id),
          )
          .leftJoin(
            documentVersions,
            eq(documentVersions.id, artifactVersions.documentVersionId),
          )
          .where(
            and(
              eq(corpusArtifacts.corpusId, corpusId),
              isNull(corpusArtifacts.removedAt),
            ),
          )
          .orderBy(asc(artifacts.title), desc(artifactVersions.versionNumber)),
      ]);
      return {
        corpus,
        sources: latestPerObject(sourceRows),
        artifacts: latestPerObject(artifactRows),
      };
    },
  );
}

function latestPerObject<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

export async function getSourceDetail(actor: CurrentActor, sourceId: string) {
  authorize(actor, "corpus.read");
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [source] = await transaction
        .select({
          id: sources.id,
          title: sources.title,
          kind: sources.kind,
          canonicalReference: sources.canonicalReference,
          ownerName: memberships.displayName,
          retiredAt: sources.retiredAt,
        })
        .from(sources)
        .leftJoin(memberships, eq(memberships.id, sources.ownerMembershipId))
        .where(eq(sources.id, sourceId))
        .limit(1);
      if (!source)
        throw new AppError({
          code: "NOT_FOUND",
          message: "Source not found.",
          status: 404,
        });
      const versions = await transaction
        .select({
          id: sourceVersions.id,
          versionNumber: sourceVersions.versionNumber,
          versionLabel: sourceVersions.versionLabel,
          status: sourceVersions.status,
          recordStatus: sourceVersions.recordStatus,
          effectiveAt: sourceVersions.effectiveAt,
          createdAt: sourceVersions.createdAt,
          createdByMembershipId: sourceVersions.createdByMembershipId,
          contentSha256: documentVersions.contentSha256,
          processingStatus: documentVersions.processingStatus,
        })
        .from(sourceVersions)
        .innerJoin(
          documentVersions,
          eq(documentVersions.id, sourceVersions.documentVersionId),
        )
        .where(eq(sourceVersions.sourceId, sourceId))
        .orderBy(desc(sourceVersions.versionNumber));
      const [membership] = await transaction
        .select({ corpusId: corpusSources.corpusId })
        .from(corpusSources)
        .where(
          and(
            eq(corpusSources.sourceId, sourceId),
            isNull(corpusSources.removedAt),
          ),
        )
        .limit(1);
      return { source, versions, corpusId: membership?.corpusId ?? null };
    },
  );
}

export async function getArtifactDetail(
  actor: CurrentActor,
  artifactId: string,
) {
  authorize(actor, "corpus.read");
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [artifact] = await transaction
        .select()
        .from(artifacts)
        .where(eq(artifacts.id, artifactId))
        .limit(1);
      if (!artifact)
        throw new AppError({
          code: "NOT_FOUND",
          message: "Artifact not found.",
          status: 404,
        });
      const [versions, owners] = await Promise.all([
        transaction
          .select({
            id: artifactVersions.id,
            versionNumber: artifactVersions.versionNumber,
            versionLabel: artifactVersions.versionLabel,
            recordStatus: artifactVersions.recordStatus,
            effectiveAt: artifactVersions.effectiveAt,
            createdAt: artifactVersions.createdAt,
            createdByMembershipId: artifactVersions.createdByMembershipId,
            contentSha256: documentVersions.contentSha256,
            processingStatus: documentVersions.processingStatus,
          })
          .from(artifactVersions)
          .innerJoin(
            documentVersions,
            eq(documentVersions.id, artifactVersions.documentVersionId),
          )
          .where(eq(artifactVersions.artifactId, artifactId))
          .orderBy(desc(artifactVersions.versionNumber)),
        transaction
          .select({
            membershipId: artifactOwners.membershipId,
            displayName: memberships.displayName,
            email: memberships.email,
            ownerType: artifactOwners.ownerType,
          })
          .from(artifactOwners)
          .innerJoin(
            memberships,
            eq(memberships.id, artifactOwners.membershipId),
          )
          .where(
            and(
              eq(artifactOwners.artifactId, artifactId),
              isNull(artifactOwners.effectiveTo),
            ),
          )
          .orderBy(asc(artifactOwners.ownerType), asc(memberships.displayName)),
      ]);
      return { artifact, versions, owners };
    },
  );
}
