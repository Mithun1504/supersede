import "server-only";

import { createHash } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getGeminiClient } from "@/ai/providers/gemini";
import { documentChunks } from "@/db/schema";
import { type TenantContext, withTenantContext } from "@/db/tenant-context";
import { getServerEnv } from "@/lib/env/server";
import { AppError } from "@/lib/errors/app-error";

const CHUNK_CHARACTERS = 1_800;
const CHUNK_OVERLAP = 200;
const RRF_K = 60;

export type CorpusChunk = {
  ordinal: number;
  text: string;
  startOffset: number;
  endOffset: number;
  checksum: string;
};

export function chunkDocument(text: string): CorpusChunk[] {
  const normalized = text;
  if (!normalized.trim()) return [];
  const chunks: CorpusChunk[] = [];
  let start = 0;
  while (start < normalized.length) {
    const hardEnd = Math.min(start + CHUNK_CHARACTERS, normalized.length);
    const paragraphBreak = normalized.lastIndexOf("\n\n", hardEnd);
    const sentenceBreak = normalized.lastIndexOf(". ", hardEnd);
    const preferredEnd = Math.max(paragraphBreak + 2, sentenceBreak + 2);
    const end =
      hardEnd < normalized.length && preferredEnd > start + CHUNK_CHARACTERS / 2
        ? preferredEnd
        : hardEnd;
    const rawValue = normalized.slice(start, end);
    const leadingWhitespace = rawValue.length - rawValue.trimStart().length;
    const trailingWhitespace = rawValue.length - rawValue.trimEnd().length;
    const exactStart = start + leadingWhitespace;
    const exactEnd = end - trailingWhitespace;
    const value = normalized.slice(exactStart, exactEnd);
    if (value) {
      chunks.push({
        ordinal: chunks.length,
        text: value,
        startOffset: exactStart,
        endOffset: exactEnd,
        checksum: createHash("sha256").update(value).digest("hex"),
      });
    }
    if (end >= normalized.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return chunks;
}

async function embedTexts(
  texts: string[],
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
  title?: string,
) {
  if (texts.length === 0) return [];
  const env = getServerEnv();
  if (!env.GEMINI_API_KEY) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Corpus indexing requires GEMINI_API_KEY.",
      status: 503,
    });
  }
  const response = await getGeminiClient().models.embedContent({
    model: env.EMBEDDING_MODEL,
    contents: texts,
    config: {
      taskType,
      outputDimensionality: env.EMBEDDING_DIMENSIONS,
      ...(title && taskType === "RETRIEVAL_DOCUMENT" ? { title } : {}),
    },
  });
  const embeddings = response.embeddings ?? [];
  if (
    embeddings.length !== texts.length ||
    embeddings.some(
      (embedding) =>
        !embedding.values ||
        embedding.values.length !== env.EMBEDDING_DIMENSIONS,
    )
  ) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Gemini returned an incomplete embedding batch.",
      status: 503,
    });
  }
  return embeddings.map((embedding) => embedding.values!);
}

export async function indexArtifactVersion(
  actor: TenantContext,
  input: { artifactVersionId: string; title: string; text: string },
) {
  const artifactVersionId = z.string().uuid().parse(input.artifactVersionId);
  const title = z.string().trim().min(1).max(255).parse(input.title);
  const chunks = chunkDocument(input.text);
  if (chunks.length === 0) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "A document must contain text before it can be indexed.",
      status: 422,
    });
  }
  const embeddings = await embedTexts(
    chunks.map((chunk) => chunk.text),
    "RETRIEVAL_DOCUMENT",
    title,
  );
  const env = getServerEnv();
  return withTenantContext(actor, async (transaction) => {
    for (const [index, chunk] of chunks.entries()) {
      await transaction
        .insert(documentChunks)
        .values({
          organizationId: actor.organizationId,
          artifactVersionId,
          chunkOrdinal: chunk.ordinal,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
          text: chunk.text,
          checksum: chunk.checksum,
          embeddingModel: env.EMBEDDING_MODEL,
          embedding: embeddings[index],
          metadata: {
            embeddingDimensions: env.EMBEDDING_DIMENSIONS,
            indexedAt: new Date().toISOString(),
          },
        })
        .onConflictDoUpdate({
          target: [
            documentChunks.artifactVersionId,
            documentChunks.chunkOrdinal,
          ],
          set: {
            startOffset: chunk.startOffset,
            endOffset: chunk.endOffset,
            text: chunk.text,
            checksum: chunk.checksum,
            embeddingModel: env.EMBEDDING_MODEL,
            embedding: embeddings[index],
            metadata: {
              embeddingDimensions: env.EMBEDDING_DIMENSIONS,
              indexedAt: new Date().toISOString(),
            },
            updatedAt: new Date(),
          },
        });
    }
    await transaction
      .delete(documentChunks)
      .where(
        and(
          eq(documentChunks.organizationId, actor.organizationId),
          eq(documentChunks.artifactVersionId, artifactVersionId),
          sql`${documentChunks.chunkOrdinal} >= ${chunks.length}`,
        ),
      );
    return { artifactVersionId, indexedChunkCount: chunks.length };
  });
}

export type HybridRetrievalResult = {
  id: string;
  artifactVersionId: string | null;
  sourceVersionId: string | null;
  text: string;
  pageLabel: string | null;
  sectionLabel: string | null;
  score: number;
};

export const hybridRetrievalRequestSchema = z.object({
  query: z.string().trim().min(2).max(4_000),
  limit: z.number().int().min(1).max(50).default(12),
  artifactVersionIds: z.array(z.string().uuid()).max(100).default([]),
  sourceVersionIds: z.array(z.string().uuid()).max(100).default([]),
});

export const hybridRetrievalResultSchema = z.object({
  id: z.string().uuid(),
  artifactVersionId: z.string().uuid().nullable(),
  sourceVersionId: z.string().uuid().nullable(),
  text: z.string(),
  pageLabel: z.string().nullable(),
  sectionLabel: z.string().nullable(),
  score: z.number().nonnegative(),
});

export const hybridRetrievalResponseSchema = z.object({
  results: z.array(hybridRetrievalResultSchema),
});

export async function hybridRetrieve(
  actor: TenantContext,
  input: z.input<typeof hybridRetrievalRequestSchema>,
): Promise<HybridRetrievalResult[]> {
  const { query, limit, artifactVersionIds, sourceVersionIds } =
    hybridRetrievalRequestSchema.parse(input);
  const [queryEmbedding] = await embedTexts([query], "RETRIEVAL_QUERY");
  if (!queryEmbedding) return [];
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;
  return withTenantContext(actor, async (transaction) => {
    const result = await transaction.execute<{
      id: string;
      artifact_version_id: string | null;
      source_version_id: string | null;
      text: string;
      page_label: string | null;
      section_label: string | null;
      score: string;
    }>(sql`
      WITH eligible AS (
        SELECT dc.* FROM document_chunk dc
        LEFT JOIN artifact_version av ON av.id = dc.artifact_version_id
        LEFT JOIN source_version sv ON sv.id = dc.source_version_id
        WHERE dc.organization_id = ${actor.organizationId}
          AND (dc.artifact_version_id IS NULL OR av.locked_at IS NOT NULL)
          AND (
            dc.source_version_id IS NULL
            OR (sv.locked_at IS NOT NULL AND sv.status IN ('active', 'corrected'))
          )
          AND (
            ${artifactVersionIds.length === 0 && sourceVersionIds.length === 0}
            OR dc.artifact_version_id = ANY(${artifactVersionIds}::uuid[])
            OR dc.source_version_id = ANY(${sourceVersionIds}::uuid[])
          )
      ), semantic AS (
        SELECT id, row_number() OVER (ORDER BY embedding <=> ${vectorLiteral}::vector) AS rank
        FROM eligible WHERE embedding IS NOT NULL LIMIT 100
      ), lexical AS (
        SELECT id, row_number() OVER (
          ORDER BY ts_rank_cd(search_vector, websearch_to_tsquery('english', ${query})) DESC
        ) AS rank
        FROM eligible
        WHERE search_vector @@ websearch_to_tsquery('english', ${query})
        LIMIT 100
      ), fused AS (
        SELECT COALESCE(s.id, l.id) AS id,
          COALESCE(1.0 / (${RRF_K} + s.rank), 0) +
          COALESCE(1.0 / (${RRF_K} + l.rank), 0) AS score
        FROM semantic s FULL OUTER JOIN lexical l ON l.id = s.id
      )
      SELECT e.id, e.artifact_version_id, e.source_version_id, e.text,
        e.page_label, e.section_label, f.score::text
      FROM fused f JOIN eligible e ON e.id = f.id
      ORDER BY f.score DESC, e.chunk_ordinal ASC
      LIMIT ${limit}
    `);
    return result.rows.map((row) => ({
      id: row.id,
      artifactVersionId: row.artifact_version_id,
      sourceVersionId: row.source_version_id,
      text: row.text,
      pageLabel: row.page_label,
      sectionLabel: row.section_label,
      score: Number(row.score),
    }));
  });
}
