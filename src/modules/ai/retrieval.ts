import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  artifactVersions,
  corpusArtifacts,
  corpusSources,
  documentChunks,
  documentVersions,
  sourceVersions,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { getServerEnv } from "@/lib/env/server";
import { AppError } from "@/lib/errors/app-error";
import { embedTexts } from "@/modules/ai/embeddings";
import { reciprocalRankFuse, type RankedChunk } from "@/modules/ai/ranking";
import type { CurrentActor } from "@/modules/identity/policy";

export { reciprocalRankFuse } from "@/modules/ai/ranking";

export type RetrievalChunk = {
  id: string;
  documentVersionId: string;
  content: string;
  contentSha256: string;
  documentContentSha256: string;
  startOffset: number;
  endOffset: number;
  rank: number;
  lexicalScore: number | null;
  semanticScore: number | null;
  fusedScore: number;
};

export async function embedDocumentChunks(
  actor: CurrentActor,
  documentVersionIds: string[],
): Promise<number> {
  if (!getServerEnv().GEMINI_API_KEY || documentVersionIds.length === 0)
    return 0;
  const pending = await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    (transaction) =>
      transaction
        .select({ id: documentChunks.id, content: documentChunks.content })
        .from(documentChunks)
        .where(
          and(
            inArray(documentChunks.documentVersionId, documentVersionIds),
            isNull(documentChunks.embedding),
          ),
        )
        .orderBy(
          asc(documentChunks.documentVersionId),
          asc(documentChunks.position),
        ),
  );
  const batchSize = 64;
  let embedded = 0;
  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const batch = pending.slice(offset, offset + batchSize);
    const vectors = await embedTexts(
      batch.map((chunk) => chunk.content),
      "RETRIEVAL_DOCUMENT",
    );
    await withTenantContext(
      {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
      },
      async (transaction) => {
        for (const [index, chunk] of batch.entries()) {
          await transaction
            .update(documentChunks)
            .set({
              embedding: vectors[index],
              embeddingProvider: "google",
              embeddingModel: getServerEnv().EMBEDDING_MODEL,
              embeddingVersion: `${getServerEnv().EMBEDDING_MODEL}:${getServerEnv().EMBEDDING_DIMENSIONS}`,
              embeddedAt: new Date(),
            })
            .where(eq(documentChunks.id, chunk.id));
        }
      },
    );
    embedded += batch.length;
  }
  return embedded;
}

export async function loadExtractionScope(
  actor: CurrentActor,
  artifactVersionId: string,
): Promise<{
  corpusId: string;
  artifactDocumentVersionId: string;
  sourceDocumentVersionIds: string[];
}> {
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [artifact] = await transaction
        .select({
          corpusId: corpusArtifacts.corpusId,
          documentVersionId: artifactVersions.documentVersionId,
          recordStatus: artifactVersions.recordStatus,
        })
        .from(artifactVersions)
        .innerJoin(
          corpusArtifacts,
          eq(corpusArtifacts.artifactId, artifactVersions.artifactId),
        )
        .where(
          and(
            eq(artifactVersions.id, artifactVersionId),
            isNull(corpusArtifacts.removedAt),
          ),
        )
        .limit(1);
      if (!artifact)
        throw new AppError({
          code: "NOT_FOUND",
          message: "Artifact version was not found in an active corpus.",
          status: 404,
        });
      if (artifact.recordStatus !== "approved")
        throw new AppError({
          code: "CONFLICT",
          message: "Only an approved artifact version can enter extraction.",
          status: 409,
        });
      const sources = await transaction
        .select({ documentVersionId: sourceVersions.documentVersionId })
        .from(corpusSources)
        .innerJoin(
          sourceVersions,
          eq(sourceVersions.sourceId, corpusSources.sourceId),
        )
        .where(
          and(
            eq(corpusSources.corpusId, artifact.corpusId),
            isNull(corpusSources.removedAt),
            eq(sourceVersions.status, "active"),
          ),
        );
      return {
        corpusId: artifact.corpusId,
        artifactDocumentVersionId: artifact.documentVersionId,
        sourceDocumentVersionIds: [
          ...new Set(sources.map((row) => row.documentVersionId)),
        ],
      };
    },
  );
}

export async function loadDocumentChunks(
  actor: CurrentActor,
  documentVersionId: string,
): Promise<RankedChunk[]> {
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    (transaction) =>
      transaction
        .select({
          id: documentChunks.id,
          documentVersionId: documentChunks.documentVersionId,
          content: documentChunks.content,
          contentSha256: documentChunks.contentSha256,
          documentContentSha256: documentVersions.contentSha256,
          startOffset: documentChunks.startOffset,
          endOffset: documentChunks.endOffset,
          lexicalScore: sql<number | null>`null`,
          semanticScore: sql<number | null>`null`,
        })
        .from(documentChunks)
        .innerJoin(
          documentVersions,
          eq(documentVersions.id, documentChunks.documentVersionId),
        )
        .where(eq(documentChunks.documentVersionId, documentVersionId))
        .orderBy(asc(documentChunks.position)),
  );
}

export async function retrieveSourceChunks(
  actor: CurrentActor,
  documentVersionIds: string[],
  query: string,
  limit = 16,
): Promise<RetrievalChunk[]> {
  if (documentVersionIds.length === 0) return [];
  const semanticVector = getServerEnv().GEMINI_API_KEY
    ? (await embedTexts([query], "RETRIEVAL_QUERY"))[0]
    : null;
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const lexical = await transaction
        .select({
          id: documentChunks.id,
          documentVersionId: documentChunks.documentVersionId,
          content: documentChunks.content,
          contentSha256: documentChunks.contentSha256,
          documentContentSha256: documentVersions.contentSha256,
          startOffset: documentChunks.startOffset,
          endOffset: documentChunks.endOffset,
          lexicalScore: sql<number>`ts_rank_cd(${documentChunks.searchVector}, websearch_to_tsquery('english', ${query}))`,
          semanticScore: sql<number | null>`null`,
        })
        .from(documentChunks)
        .innerJoin(
          documentVersions,
          eq(documentVersions.id, documentChunks.documentVersionId),
        )
        .where(
          and(
            inArray(documentChunks.documentVersionId, documentVersionIds),
            sql`${documentChunks.searchVector} @@ websearch_to_tsquery('english', ${query})`,
          ),
        )
        .orderBy(
          sql`ts_rank_cd(${documentChunks.searchVector}, websearch_to_tsquery('english', ${query})) desc`,
        )
        .limit(limit * 2);
      let semantic: RankedChunk[] = [];
      if (semanticVector) {
        const literal = JSON.stringify(semanticVector);
        semantic = await transaction
          .select({
            id: documentChunks.id,
            documentVersionId: documentChunks.documentVersionId,
            content: documentChunks.content,
            contentSha256: documentChunks.contentSha256,
            documentContentSha256: documentVersions.contentSha256,
            startOffset: documentChunks.startOffset,
            endOffset: documentChunks.endOffset,
            lexicalScore: sql<number | null>`null`,
            semanticScore: sql<number>`1 - (${documentChunks.embedding} <=> ${literal}::vector)`,
          })
          .from(documentChunks)
          .innerJoin(
            documentVersions,
            eq(documentVersions.id, documentChunks.documentVersionId),
          )
          .where(
            and(
              inArray(documentChunks.documentVersionId, documentVersionIds),
              sql`${documentChunks.embedding} is not null`,
            ),
          )
          .orderBy(sql`${documentChunks.embedding} <=> ${literal}::vector`)
          .limit(limit * 2);
      }
      return reciprocalRankFuse(lexical, semantic, limit);
    },
  );
}
