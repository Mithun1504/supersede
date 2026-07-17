import { z } from "zod";

export const claimSupportSchema = z.object({
  sourceChunkId: z.string().uuid(),
  sourceQuote: z.string().min(3).max(4_000),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(3).max(2_000),
});

export const extractedClaimSchema = z.object({
  text: z.string().min(3).max(4_000),
  artifactChunkId: z.string().uuid(),
  artifactQuote: z.string().min(3).max(4_000),
  confidence: z.number().min(0).max(1),
  loadBearingScore: z.number().min(0).max(1),
  loadBearingRationale: z.string().min(3).max(2_000),
  supports: z.array(claimSupportSchema).max(8),
});

export const claimExtractionResultSchema = z.object({
  claims: z.array(extractedClaimSchema).max(100),
});

export type ClaimExtractionResult = z.infer<typeof claimExtractionResultSchema>;

export const claimExtractionOutput = claimExtractionResultSchema;
export type ClaimExtractionOutput = ClaimExtractionResult;

export const startExtractionInput = z.object({
  artifactVersionId: z.string().uuid(),
});
