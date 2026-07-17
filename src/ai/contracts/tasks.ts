import { z } from "zod";

const confidenceSchema = z.number().min(0).max(1);

export const GOVERNED_AI_THRESHOLDS = {
  autoSuggest: 0.8,
  rewriteRequired: 0.65,
  probeGrade: 0.8,
} as const;

export const evidenceLocationSchema = z.object({
  documentVersionId: z.string().min(1),
  quote: z.string().min(1),
  startOffset: z.number().int().nonnegative().nullable(),
  endOffset: z.number().int().positive().nullable(),
  page: z.number().int().positive().nullable(),
  section: z.string().min(1).nullable(),
  checksum: z.string().min(1),
});

export const sourceCitationSchema = z.object({
  sourceId: z.string().min(1),
  sourceVersionId: z.string().min(1),
  quote: z.string().min(1),
  location: evidenceLocationSchema,
});

export const claimExtractionSchema = z.object({
  claims: z.array(
    z.object({
      text: z.string().min(1),
      exactQuote: z.string().min(1),
      evidence: evidenceLocationSchema,
      candidateSourceReferences: z.array(sourceCitationSchema),
      confidence: confidenceSchema,
      ambiguity: z.string().min(1).nullable(),
      reviewRequired: z.boolean(),
    }),
  ),
});

export const loadBearingSchema = z.object({
  score: confidenceSchema,
  class: z.enum(["load_bearing", "peripheral", "unclear"]),
  rationale: z.string().min(1),
  evidenceQuotes: z.array(z.string().min(1)),
  reviewRequired: z.boolean(),
});

export const changeDiffSchema = z.object({
  oldRule: z.string().min(1),
  newRule: z.string().min(1),
  affectedPopulation: z.string().min(1),
  exclusions: z.array(z.string().min(1)),
  unresolvedAmbiguity: z.string().min(1).nullable(),
  citations: z.object({
    old: z.array(sourceCitationSchema),
    new: z.array(sourceCitationSchema),
  }),
  confidence: confidenceSchema,
});

export const divergenceCaseSchema = z.object({
  cases: z.array(
    z.object({
      scenario: z.string().min(1),
      oldAnswer: z.string().min(1),
      newAnswer: z.string().min(1),
      rationale: z.string().min(1),
      citations: z.object({
        old: z.array(sourceCitationSchema).min(1),
        new: z.array(sourceCitationSchema).min(1),
      }),
      ambiguous: z.boolean(),
      ambiguityReason: z.string().min(1).nullable(),
      confidence: confidenceSchema,
    }),
  ),
});

export const probeGradeSchema = z.object({
  answeredWith: z.enum(["old", "new", "other"]),
  confidence: confidenceSchema,
  matchedApprovedCaseRationale: z.string().min(1),
  exactQuote: z.string().min(1).nullable(),
  ambiguityReason: z.string().min(1).nullable(),
  reviewRequired: z.boolean(),
});

export const artifactFeedbackSchema = z.object({
  passed: z.boolean(),
  feedback: z.string().min(1),
  evidenceQuotes: z.array(z.string().min(1)).min(1),
  confidence: confidenceSchema,
  reviewRequired: z.boolean(),
});

export const deterministicFallbackSchema = z.object({
  label: z.literal("deterministic_fallback"),
  reason: z.string().min(1),
  reviewRequired: z.literal(true),
});

export type EvidenceLocation = z.infer<typeof evidenceLocationSchema>;
export type SourceCitation = z.infer<typeof sourceCitationSchema>;
export type ClaimExtraction = z.infer<typeof claimExtractionSchema>;
export type LoadBearing = z.infer<typeof loadBearingSchema>;
export type ChangeDiff = z.infer<typeof changeDiffSchema>;
export type DivergenceCase = z.infer<typeof divergenceCaseSchema>;
export type ProbeGrade = z.infer<typeof probeGradeSchema>;
export type ArtifactFeedback = z.infer<typeof artifactFeedbackSchema>;

export function enforceProbeGradePolicy(
  grade: ProbeGrade,
  approvedCaseRationale: string,
  responseText?: string,
): ProbeGrade {
  const rationaleMatches =
    normalize(grade.matchedApprovedCaseRationale) ===
    normalize(approvedCaseRationale);
  const quoteMatches =
    grade.answeredWith === "other" ||
    (Boolean(grade.exactQuote) &&
      Boolean(responseText?.includes(grade.exactQuote ?? "")));
  const mustRemainOther =
    grade.answeredWith === "other" ||
    grade.reviewRequired ||
    grade.confidence < GOVERNED_AI_THRESHOLDS.probeGrade ||
    Boolean(grade.ambiguityReason) ||
    !rationaleMatches ||
    !quoteMatches;

  return {
    ...grade,
    answeredWith: mustRemainOther ? "other" : grade.answeredWith,
    exactQuote: mustRemainOther ? null : grade.exactQuote,
    reviewRequired: mustRemainOther,
  };
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ");
}
