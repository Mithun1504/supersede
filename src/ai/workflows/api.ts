import { z } from "zod";

import {
  assessArtifactCorrection,
  assessLoadBearing,
  generateDivergenceCases,
  gradeProbeResponse,
  normalizeChangeDiff,
} from "@/ai/workflows/governed";

const documentText = z.string().min(1).max(250_000);
const hash = z.string().min(8).max(128);

export const governedTaskRequestSchema = z.discriminatedUnion("task", [
  z.object({
    task: z.literal("load_bearing"),
    input: z.object({
      claim: z.string().min(1).max(10_000),
      artifactText: documentText,
      sourceHash: hash,
    }),
  }),
  z.object({
    task: z.literal("change_diff"),
    input: z.object({
      oldVersionId: z.string().min(1),
      oldText: documentText,
      oldHash: hash,
      newVersionId: z.string().min(1),
      newText: documentText,
      newHash: hash,
    }),
  }),
  z.object({
    task: z.literal("divergence_case"),
    input: z.object({
      changeEventVersionId: z.string().min(1),
      oldVersionId: z.string().min(1),
      oldText: documentText,
      oldHash: hash,
      newVersionId: z.string().min(1),
      newText: documentText,
      newHash: hash,
    }),
  }),
  z.object({
    task: z.literal("probe_grade"),
    input: z.object({
      responseText: z.string().min(1).max(20_000),
      approvedCaseRationale: z.string().min(1).max(20_000),
      oldAnswer: z.string().min(1).max(20_000),
      newAnswer: z.string().min(1).max(20_000),
      caseVersionHash: hash,
    }),
  }),
  z.object({
    task: z.literal("artifact_feedback"),
    input: z.object({
      submittedPatch: z.string().min(1).max(100_000),
      rubric: z.string().min(1).max(20_000),
      approvedNewSourceText: documentText,
      sourceHash: hash,
    }),
  }),
]);

export async function runGovernedTask(
  request: z.infer<typeof governedTaskRequestSchema>,
  options: { idempotencyKey?: string } = {},
) {
  switch (request.task) {
    case "load_bearing":
      return assessLoadBearing(request.input, options);
    case "change_diff":
      return normalizeChangeDiff(request.input, options);
    case "divergence_case":
      return generateDivergenceCases(request.input, options);
    case "probe_grade":
      return gradeProbeResponse(request.input, options);
    case "artifact_feedback":
      return assessArtifactCorrection(request.input, options);
  }
}
