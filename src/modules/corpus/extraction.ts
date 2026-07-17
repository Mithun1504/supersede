import { createHash } from "node:crypto";

import { z } from "zod";

import { claimExtractionSchema } from "@/ai/contracts/tasks";
import { runStructuredOpenAiTask } from "@/ai/providers/openai";
import { governedAiTasks } from "@/ai/prompts/governed";
import { verifyQuotedEvidence } from "@/modules/corpus";
import { classifyReviewState } from "@/modules/graph";
import { AppError } from "@/lib/errors/app-error";

export const extractionRequestSchema = z.object({
  documentVersionId: z.string().min(1),
  sourceHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  text: z.string().min(1).max(250_000),
  executionMode: z.enum(["live", "deterministic_fallback"]).default("live"),
});

export const extractionApiRequestSchema = extractionRequestSchema
  .omit({ documentVersionId: true })
  .extend({
    documentTitle: z.string().trim().min(1).max(255),
    executionMode: z.literal("live").default("live"),
  });

const claimDtoSchema = z.object({
  text: z.string(),
  exactQuote: z.string(),
  confidence: z.number().min(0).max(1),
  reviewState: z.enum(["suggested", "needs_review"]),
  quoteVerified: z.boolean(),
  startOffset: z.number().int().nonnegative().optional(),
  endOffset: z.number().int().positive().optional(),
  ambiguity: z.string().optional(),
});

export const extractionResponseSchema = z.object({
  live: z.boolean(),
  documentVersionId: z.string(),
  claims: z.array(claimDtoSchema),
  provenance: z
    .object({
      provider: z.string(),
      model: z.string(),
      promptVersion: z.string(),
      schemaVersion: z.string(),
      externalResponseId: z.string().optional(),
      latencyMs: z.number().int().nonnegative(),
      validated: z.boolean(),
    })
    .optional(),
  fallback: z
    .object({
      label: z.literal("deterministic_fallback"),
      reason: z.string(),
    })
    .optional(),
});

export const extractionApiResponseSchema = extractionResponseSchema.extend({
  artifactVersionId: z.string().uuid(),
  persistedClaimCount: z.number().int().nonnegative(),
});

export type ExtractionRequest = z.infer<typeof extractionRequestSchema>;
export type ExtractionResponse = z.infer<typeof extractionResponseSchema>;

export async function extractClaimsFromPastedText(
  request: ExtractionRequest,
  options: { idempotencyKey?: string } = {},
): Promise<ExtractionResponse> {
  const computedSourceHash = `sha256:${createHash("sha256").update(request.text).digest("hex")}`;
  if (request.sourceHash !== computedSourceHash) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "Source hash does not match the submitted text.",
      status: 422,
    });
  }
  if (request.executionMode === "deterministic_fallback") {
    return {
      live: false,
      documentVersionId: request.documentVersionId,
      claims: [],
      fallback: {
        label: "deterministic_fallback",
        reason:
          "Explicit fallback mode requested; no live model call was made.",
      },
    };
  }

  const { output, provenance } = await runStructuredOpenAiTask({
    task: governedAiTasks.claimExtraction,
    input: {
      documentVersionId: request.documentVersionId,
      sourceHash: request.sourceHash,
      text: request.text,
    },
    sourceHashes: [request.sourceHash],
    ...(options.idempotencyKey
      ? { idempotencyKey: options.idempotencyKey }
      : {}),
  });
  const parsed = claimExtractionSchema.parse(output);

  return {
    live: true,
    documentVersionId: request.documentVersionId,
    claims: parsed.claims.map((claim) => {
      const quote = claim.exactQuote || claim.evidence.quote;
      const verification = verifyQuotedEvidence(request.text, quote);
      const suggested =
        verification.verified &&
        !claim.reviewRequired &&
        classifyReviewState(claim.confidence) === "suggested";

      return {
        text: claim.text,
        exactQuote: quote,
        confidence: claim.confidence,
        reviewState: suggested ? "suggested" : "needs_review",
        quoteVerified: verification.verified,
        ...(verification.verified
          ? {
              startOffset: verification.startOffset,
              endOffset: verification.endOffset,
            }
          : {}),
        ...(claim.ambiguity ? { ambiguity: claim.ambiguity } : {}),
      };
    }),
    provenance: {
      provider: provenance.provider,
      model: provenance.model,
      promptVersion: provenance.promptVersion,
      schemaVersion: provenance.schemaVersion,
      externalResponseId: provenance.externalResponseId,
      latencyMs: provenance.latencyMs,
      validated: provenance.validated,
    },
  };
}
