import "server-only";

import { createHash } from "node:crypto";

import { and, eq, gte, inArray, sql, sum } from "drizzle-orm";
import { zodTextFormat } from "openai/helpers/zod";

import {
  aiModelRuns,
  aiPromptVersions,
  aiRunInputs,
  aiRunRetrievalChunks,
  artifactVersions,
  claimVersions,
  claims,
  dependencyEdges,
  dependencyEdgeVersions,
  documentVersions,
  evidenceSpans,
  extractionRuns,
  graphNodes,
  organizationSettings,
  reviewTasks,
  sourceVersions,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { getServerEnv } from "@/lib/env/server";
import { AppError } from "@/lib/errors/app-error";
import { recordMembershipEvent } from "@/modules/audit/service";
import { getOpenAIClient } from "@/modules/ai/clients";
import { estimateOpenAiCostMinor } from "@/modules/ai/cost";
import {
  claimExtractionOutput,
  type ClaimExtractionOutput,
} from "@/modules/ai/contracts";
import { verifyExactQuote } from "@/modules/ai/evidence";
import {
  claimExtractionPrompt,
  claimExtractionPromptVersion,
  claimExtractionSchemaVersion,
} from "@/modules/ai/prompts/claim-extraction-v1";
import {
  embedDocumentChunks,
  loadDocumentChunks,
  loadExtractionScope,
  retrieveSourceChunks,
  type RetrievalChunk,
} from "@/modules/ai/retrieval";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

const promptPath = "src/modules/ai/prompts/claim-extraction-v1.ts";
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function releaseSha(): string {
  const value =
    getServerEnv().APPLICATION_RELEASE_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA;
  if (value && /^[0-9a-f]{40}$/.test(value)) return value;
  if (getServerEnv().NODE_ENV === "production") {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "AI provenance requires APPLICATION_RELEASE_SHA in production.",
      status: 503,
    });
  }
  return "0".repeat(40);
}

function boundedContext(
  artifactChunks: Awaited<ReturnType<typeof loadDocumentChunks>>,
  sourceChunks: RetrievalChunk[],
): string {
  const artifact = artifactChunks
    .slice(0, 30)
    .map(
      (chunk) =>
        `<DOCUMENT_CHUNK id="${chunk.id}">\n${chunk.content}\n</DOCUMENT_CHUNK>`,
    )
    .join("\n\n");
  const sources = sourceChunks
    .map(
      (chunk) =>
        `<SOURCE_CHUNK id="${chunk.id}">\n${chunk.content}\n</SOURCE_CHUNK>`,
    )
    .join("\n\n");
  return `${artifact}\n\n${sources}`;
}

export async function extractClaims(
  actor: CurrentActor,
  artifactVersionId: string,
): Promise<{
  extractionRunId: string;
  claimsSuggested: number;
  quotesFailed: number;
  replayed: boolean;
}> {
  authorize(actor, "edge.review");
  if (!getServerEnv().OPENAI_API_KEY) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Configure OPENAI_API_KEY before starting claim extraction.",
      status: 503,
    });
  }
  const scope = await loadExtractionScope(actor, artifactVersionId);
  await embedDocumentChunks(actor, [
    scope.artifactDocumentVersionId,
    ...scope.sourceDocumentVersionIds,
  ]);
  const artifactChunks = await loadDocumentChunks(
    actor,
    scope.artifactDocumentVersionId,
  );
  if (artifactChunks.length === 0) {
    throw new AppError({
      code: "CONFLICT",
      message: "The artifact has no extractable text chunks.",
      status: 409,
    });
  }
  const query = artifactChunks
    .map((chunk) => chunk.content)
    .join("\n")
    .slice(0, 12_000);
  const sourceChunks = await retrieveSourceChunks(
    actor,
    scope.sourceDocumentVersionIds,
    query,
  );
  const model = getServerEnv().OPENAI_PRIMARY_MODEL;
  const cacheKey = sha256(
    [
      artifactVersionId,
      claimExtractionPromptVersion,
      claimExtractionSchemaVersion,
      model,
      ...artifactChunks.map((c) => c.contentSha256),
      ...sourceChunks.map((c) => c.contentSha256),
    ].join(":"),
  );

  const prepared = await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${actor.organization.id}:${cacheKey}`}, 0))`,
      );
      const [existing] = await transaction
        .select({
          id: extractionRuns.id,
          status: extractionRuns.status,
          claimsSuggested: extractionRuns.claimsSuggested,
          quotesFailed: extractionRuns.quotesFailed,
        })
        .from(extractionRuns)
        .where(
          and(
            eq(extractionRuns.organizationId, actor.organization.id),
            eq(extractionRuns.cacheKey, cacheKey),
          ),
        )
        .limit(1);
      if (existing) {
        if (existing.status === "completed" || existing.status === "partial")
          return { replay: existing };
        throw new AppError({
          code: "CONFLICT",
          message:
            "An extraction for this exact document and contract is already active or failed. Use operations retry for failed runs.",
          status: 409,
        });
      }

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
      const spent = Number(usage?.value ?? 0);
      if (
        settings &&
        settings.monthlyAiBudgetMinor > 0 &&
        spent >= settings.monthlyAiBudgetMinor
      ) {
        throw new AppError({
          code: "CONFLICT",
          message: "The organization AI budget is exhausted.",
          status: 409,
        });
      }

      const [prompt] = await transaction
        .select({
          id: aiPromptVersions.id,
          sourcePath: aiPromptVersions.sourcePath,
          promptSha256: aiPromptVersions.promptSha256,
        })
        .from(aiPromptVersions)
        .where(
          and(
            eq(aiPromptVersions.taskType, "claim_extraction"),
            eq(aiPromptVersions.promptVersion, claimExtractionPromptVersion),
            eq(aiPromptVersions.schemaVersion, claimExtractionSchemaVersion),
            eq(aiPromptVersions.status, "approved"),
          ),
        )
        .limit(1);
      if (!prompt)
        throw new AppError({
          code: "DEPENDENCY_UNAVAILABLE",
          message: "The approved AI prompt contract is not registered.",
          status: 503,
        });
      if (
        prompt.sourcePath !== promptPath ||
        prompt.promptSha256 !== sha256(claimExtractionPrompt)
      ) {
        throw new AppError({
          code: "CONFLICT",
          message: "The registered AI prompt does not match this release.",
          status: 409,
        });
      }
      const [run] = await transaction
        .insert(extractionRuns)
        .values({
          organizationId: actor.organization.id,
          documentVersionId: scope.artifactDocumentVersionId,
          corpusId: scope.corpusId,
          status: "running",
          cacheKey,
          startedAt: new Date(),
        })
        .returning({ id: extractionRuns.id });
      if (!run)
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "Extraction run could not be created.",
          status: 500,
        });
      const [modelRun] = await transaction
        .insert(aiModelRuns)
        .values({
          organizationId: actor.organization.id,
          extractionRunId: run.id,
          taskType: "claim_extraction",
          provider: "openai",
          model,
          resolvedModel: model,
          aiPromptVersionId: prompt.id,
          subjectType: "artifact_version",
          subjectId: artifactVersionId,
          subjectVersionId: artifactVersionId,
          applicationReleaseSha: releaseSha(),
          reasoningSetting: "medium",
          status: "running",
          startedAt: new Date(),
        })
        .returning({ id: aiModelRuns.id });
      if (!modelRun)
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "Model provenance could not be created.",
          status: 500,
        });

      const documentIds = [
        scope.artifactDocumentVersionId,
        ...new Set(sourceChunks.map((chunk) => chunk.documentVersionId)),
      ];
      const documentRows = await transaction
        .select({
          id: documentVersions.id,
          contentSha256: documentVersions.contentSha256,
        })
        .from(documentVersions)
        .where(inArray(documentVersions.id, documentIds));
      await transaction.insert(aiRunInputs).values(
        documentRows.map((document, position) => ({
          organizationId: actor.organization.id,
          aiModelRunId: modelRun.id,
          documentVersionId: document.id,
          inputRole:
            document.id === scope.artifactDocumentVersionId
              ? "subject"
              : "retrieved_source",
          contentSha256: document.contentSha256,
          position,
        })),
      );
      if (sourceChunks.length > 0) {
        await transaction.insert(aiRunRetrievalChunks).values(
          sourceChunks.map((chunk) => ({
            organizationId: actor.organization.id,
            aiModelRunId: modelRun.id,
            documentChunkId: chunk.id,
            rank: chunk.rank,
            semanticScore: chunk.semanticScore?.toFixed(6),
            lexicalScore: chunk.lexicalScore?.toFixed(6),
            fusedScore: chunk.fusedScore.toFixed(6),
          })),
        );
      }
      return { runId: run.id, modelRunId: modelRun.id };
    },
  );
  if ("replay" in prepared) {
    return {
      extractionRunId: prepared.replay.id,
      claimsSuggested: prepared.replay.claimsSuggested,
      quotesFailed: prepared.replay.quotesFailed,
      replayed: true,
    };
  }

  const started = Date.now();
  try {
    const response = await getOpenAIClient().responses.parse(
      {
        model,
        instructions: claimExtractionPrompt,
        input: boundedContext(artifactChunks, sourceChunks),
        reasoning: { effort: "medium" },
        text: {
          format: zodTextFormat(claimExtractionOutput, "claim_extraction_v1"),
        },
        store: false,
      },
      { timeout: 90_000, maxRetries: 1 },
    );
    if (!response.output_parsed) {
      throw new AppError({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "The model did not return a valid extraction result.",
        status: 503,
      });
    }
    const outcome = await persistExtraction(actor, {
      artifactVersionId,
      artifactChunks,
      sourceChunks,
      extractionRunId: prepared.runId,
      modelRunId: prepared.modelRunId,
      output: response.output_parsed,
      responseId: response.id,
      resolvedModel: String(response.model),
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      costMinor: estimateOpenAiCostMinor(
        model,
        response.usage?.input_tokens ?? 0,
        response.usage?.output_tokens ?? 0,
      ),
      latencyMs: Date.now() - started,
    });
    return { extractionRunId: prepared.runId, ...outcome, replayed: false };
  } catch (error) {
    await withTenantContext(
      {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
      },
      async (transaction) => {
        await transaction
          .update(aiModelRuns)
          .set({
            status: "failed",
            errorCode:
              error instanceof AppError ? error.code : "PROVIDER_ERROR",
            errorSummary:
              error instanceof Error
                ? error.message.slice(0, 1_000)
                : "Unknown provider error",
            latencyMs: Date.now() - started,
            completedAt: new Date(),
          })
          .where(eq(aiModelRuns.id, prepared.modelRunId));
        await transaction
          .update(extractionRuns)
          .set({ status: "failed", completedAt: new Date() })
          .where(eq(extractionRuns.id, prepared.runId));
      },
    );
    throw error;
  }
}

async function persistExtraction(
  actor: CurrentActor,
  input: {
    artifactVersionId: string;
    artifactChunks: Awaited<ReturnType<typeof loadDocumentChunks>>;
    sourceChunks: RetrievalChunk[];
    extractionRunId: string;
    modelRunId: string;
    output: ClaimExtractionOutput;
    responseId: string;
    resolvedModel: string;
    inputTokens: number;
    outputTokens: number;
    costMinor: number;
    latencyMs: number;
  },
): Promise<{ claimsSuggested: number; quotesFailed: number }> {
  const artifactById = new Map(
    input.artifactChunks.map((chunk) => [chunk.id, chunk]),
  );
  const sourceById = new Map(
    input.sourceChunks.map((chunk) => [chunk.id, chunk]),
  );
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [artifactVersion] = await transaction
        .select({ artifactId: artifactVersions.artifactId })
        .from(artifactVersions)
        .where(eq(artifactVersions.id, input.artifactVersionId))
        .limit(1);
      if (!artifactVersion)
        throw new AppError({
          code: "NOT_FOUND",
          message: "Artifact version no longer exists.",
          status: 404,
        });
      const sourceDocumentIds = [
        ...new Set(input.sourceChunks.map((chunk) => chunk.documentVersionId)),
      ];
      const sourceVersionRows =
        sourceDocumentIds.length > 0
          ? await transaction
              .select({
                id: sourceVersions.id,
                documentVersionId: sourceVersions.documentVersionId,
              })
              .from(sourceVersions)
              .where(
                inArray(sourceVersions.documentVersionId, sourceDocumentIds),
              )
          : [];
      const sourceVersionByDocument = new Map(
        sourceVersionRows.map((row) => [row.documentVersionId, row.id]),
      );
      const [settings] = await transaction
        .select({ threshold: organizationSettings.reviewConfidenceThreshold })
        .from(organizationSettings)
        .where(eq(organizationSettings.organizationId, actor.organization.id))
        .limit(1);
      const threshold = Number(settings?.threshold ?? 0.75);
      let claimsSuggested = 0;
      let edgesSuggested = 0;
      let quotesFailed = 0;
      let itemsRequiringReview = 0;

      const [artifactNode] = await transaction
        .insert(graphNodes)
        .values({
          organizationId: actor.organization.id,
          nodeType: "artifact_version",
          artifactVersionId: input.artifactVersionId,
        })
        .onConflictDoNothing()
        .returning({ id: graphNodes.id });
      const existingArtifactNode =
        artifactNode ??
        (
          await transaction
            .select({ id: graphNodes.id })
            .from(graphNodes)
            .where(eq(graphNodes.artifactVersionId, input.artifactVersionId))
            .limit(1)
        )[0];
      if (!existingArtifactNode)
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "Artifact graph node could not be resolved.",
          status: 500,
        });

      for (const candidate of input.output.claims) {
        const artifactChunk = artifactById.get(candidate.artifactChunkId);
        const verified = artifactChunk
          ? verifyExactQuote(
              artifactChunk.content,
              candidate.artifactQuote,
              artifactChunk.startOffset,
            )
          : null;
        if (!artifactChunk || !verified?.exact) {
          quotesFailed += 1;
          itemsRequiringReview += 1;
          await transaction
            .insert(reviewTasks)
            .values({
              organizationId: actor.organization.id,
              taskType: "quote_verification",
              subjectType: "ai_model_run",
              subjectId: input.modelRunId,
              subjectVersionId: input.modelRunId,
              reasonCode: "artifact_quote_not_exact",
              priority: 100,
            })
            .onConflictDoNothing();
          continue;
        }
        const [artifactEvidence] = await transaction
          .insert(evidenceSpans)
          .values({
            organizationId: actor.organization.id,
            documentVersionId: artifactChunk.documentVersionId,
            documentChunkId: artifactChunk.id,
            exactQuote: candidate.artifactQuote,
            startOffset: verified.startOffset,
            endOffset: verified.endOffset,
            sourceContentSha256: artifactChunk.documentContentSha256,
            verificationStatus: "exact",
            verificationScore: "1.0000",
            verifiedAt: new Date(),
          })
          .returning({ id: evidenceSpans.id });
        if (!artifactEvidence) continue;
        const [claim] = await transaction
          .insert(claims)
          .values({
            organizationId: actor.organization.id,
            artifactId: artifactVersion.artifactId,
          })
          .returning({ id: claims.id });
        if (!claim) continue;
        const needsReview = candidate.confidence < threshold;
        const [claimVersion] = await transaction
          .insert(claimVersions)
          .values({
            organizationId: actor.organization.id,
            claimId: claim.id,
            artifactVersionId: input.artifactVersionId,
            versionNumber: 1,
            text: candidate.text,
            normalizedText: candidate.text
              .toLocaleLowerCase("en")
              .replace(/\s+/g, " ")
              .trim(),
            primaryEvidenceSpanId: artifactEvidence.id,
            confidence: candidate.confidence.toFixed(4),
            loadBearingScore: candidate.loadBearingScore.toFixed(4),
            loadBearingRationale: candidate.loadBearingRationale,
            reviewStatus: needsReview ? "needs_review" : "suggested",
            extractionRunId: input.extractionRunId,
            aiModelRunId: input.modelRunId,
          })
          .returning({ id: claimVersions.id });
        if (!claimVersion) continue;
        claimsSuggested += 1;
        itemsRequiringReview += 1;
        await transaction.insert(reviewTasks).values({
          organizationId: actor.organization.id,
          taskType: "claim",
          subjectType: "claim",
          subjectId: claim.id,
          subjectVersionId: claimVersion.id,
          reasonCode: needsReview ? "low_confidence" : "ai_suggestion",
          priority: needsReview ? 80 : 40,
        });
        const [claimNode] = await transaction
          .insert(graphNodes)
          .values({
            organizationId: actor.organization.id,
            nodeType: "claim_version",
            claimVersionId: claimVersion.id,
          })
          .returning({ id: graphNodes.id });
        if (!claimNode) continue;
        const [containsEdge] = await transaction
          .insert(dependencyEdges)
          .values({ organizationId: actor.organization.id })
          .returning({ id: dependencyEdges.id });
        if (containsEdge) {
          await transaction.insert(dependencyEdgeVersions).values({
            organizationId: actor.organization.id,
            dependencyEdgeId: containsEdge.id,
            versionNumber: 1,
            fromNodeId: existingArtifactNode.id,
            toNodeId: claimNode.id,
            edgeType: "contains",
            evidenceSpanId: artifactEvidence.id,
            confidence: candidate.confidence.toFixed(4),
            loadBearingScore: candidate.loadBearingScore.toFixed(4),
            loadBearingRationale: candidate.loadBearingRationale,
            reviewStatus: "suggested",
            extractionRunId: input.extractionRunId,
            aiModelRunId: input.modelRunId,
          });
          edgesSuggested += 1;
        }

        for (const support of candidate.supports) {
          const sourceChunk = sourceById.get(support.sourceChunkId);
          const sourceVersionId = sourceChunk
            ? sourceVersionByDocument.get(sourceChunk.documentVersionId)
            : null;
          const sourceVerified = sourceChunk
            ? verifyExactQuote(
                sourceChunk.content,
                support.sourceQuote,
                sourceChunk.startOffset,
              )
            : null;
          if (!sourceChunk || !sourceVersionId || !sourceVerified?.exact) {
            quotesFailed += 1;
            itemsRequiringReview += 1;
            await transaction
              .insert(reviewTasks)
              .values({
                organizationId: actor.organization.id,
                taskType: "quote_verification",
                subjectType: "claim_version",
                subjectId: claimVersion.id,
                subjectVersionId: claimVersion.id,
                reasonCode: "source_quote_not_exact",
                priority: 100,
              })
              .onConflictDoNothing();
            continue;
          }
          const [sourceEvidence] = await transaction
            .insert(evidenceSpans)
            .values({
              organizationId: actor.organization.id,
              documentVersionId: sourceChunk.documentVersionId,
              documentChunkId: sourceChunk.id,
              exactQuote: support.sourceQuote,
              startOffset: sourceVerified.startOffset,
              endOffset: sourceVerified.endOffset,
              sourceContentSha256: sourceChunk.documentContentSha256,
              verificationStatus: "exact",
              verificationScore: "1.0000",
              verifiedAt: new Date(),
            })
            .returning({ id: evidenceSpans.id });
          if (!sourceEvidence) continue;
          const [createdSourceNode] = await transaction
            .insert(graphNodes)
            .values({
              organizationId: actor.organization.id,
              nodeType: "source_version",
              sourceVersionId,
            })
            .onConflictDoNothing()
            .returning({ id: graphNodes.id });
          const sourceNode =
            createdSourceNode ??
            (
              await transaction
                .select({ id: graphNodes.id })
                .from(graphNodes)
                .where(eq(graphNodes.sourceVersionId, sourceVersionId))
                .limit(1)
            )[0];
          if (!sourceNode) continue;
          const [edge] = await transaction
            .insert(dependencyEdges)
            .values({ organizationId: actor.organization.id })
            .returning({ id: dependencyEdges.id });
          if (!edge) continue;
          const edgeNeedsReview = support.confidence < threshold;
          const [edgeVersion] = await transaction
            .insert(dependencyEdgeVersions)
            .values({
              organizationId: actor.organization.id,
              dependencyEdgeId: edge.id,
              versionNumber: 1,
              fromNodeId: claimNode.id,
              toNodeId: sourceNode.id,
              edgeType: "supported_by",
              evidenceSpanId: sourceEvidence.id,
              confidence: support.confidence.toFixed(4),
              loadBearingScore: candidate.loadBearingScore.toFixed(4),
              loadBearingRationale: support.rationale,
              reviewStatus: edgeNeedsReview ? "needs_review" : "suggested",
              extractionRunId: input.extractionRunId,
              aiModelRunId: input.modelRunId,
            })
            .returning({ id: dependencyEdgeVersions.id });
          if (edgeVersion) {
            edgesSuggested += 1;
            itemsRequiringReview += 1;
            await transaction.insert(reviewTasks).values({
              organizationId: actor.organization.id,
              taskType: "dependency_edge",
              subjectType: "dependency_edge",
              subjectId: edge.id,
              subjectVersionId: edgeVersion.id,
              reasonCode: edgeNeedsReview ? "low_confidence" : "ai_suggestion",
              priority: edgeNeedsReview ? 80 : 40,
            });
          }
        }
      }

      await transaction
        .update(aiModelRuns)
        .set({
          externalResponseId: input.responseId,
          resolvedModel: input.resolvedModel,
          status: "completed",
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          costMinor: input.costMinor,
          latencyMs: input.latencyMs,
          validationOutcome:
            quotesFailed > 0
              ? "partial_quote_validation"
              : "schema_and_quotes_valid",
          outputJson: input.output as unknown as Record<string, unknown>,
          completedAt: new Date(),
        })
        .where(eq(aiModelRuns.id, input.modelRunId));
      await transaction
        .update(extractionRuns)
        .set({
          status: quotesFailed > 0 ? "partial" : "completed",
          claimsSuggested,
          edgesSuggested,
          quotesFailed,
          itemsRequiringReview,
          completedAt: new Date(),
        })
        .where(eq(extractionRuns.id, input.extractionRunId));
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "extraction.completed",
        objectType: "extraction_run",
        objectId: input.extractionRunId,
        payload: {
          artifactVersionId: input.artifactVersionId,
          claimsSuggested,
          edgesSuggested,
          quotesFailed,
          itemsRequiringReview,
        },
      });
      return { claimsSuggested, quotesFailed };
    },
  );
}
