import { z } from "zod";

export const createCaseInput = z.object({
  changeEventVersionId: z.string().uuid(),
  scenario: z.string().trim().min(20).max(8_000),
  optionsText: z.string().trim().min(5).max(8_000),
  oldAnswer: z.string().trim().min(1).max(128),
  newAnswer: z.string().trim().min(1).max(128),
  rationale: z.string().trim().min(3).max(4_000),
});
export const approveCaseInput = z.object({ caseVersionId: z.string().uuid() });
export const approveExerciseInput = z.object({
  exerciseVersionId: z.string().uuid(),
});
export const generateCasesInput = z.object({
  changeEventVersionId: z.string().uuid(),
});
export const retireCaseInput = z.object({
  caseVersionId: z.string().uuid(),
  reason: z.enum([
    "ambiguous",
    "citation_invalid",
    "content_error",
    "source_superseded",
    "policy_change",
    "other",
  ]),
  rationale: z.string().trim().min(5).max(4_000),
  excludesHistoricalMetrics: z.preprocess(
    (value) => value === "on" || value === "true",
    z.boolean(),
  ),
});
export type CreateCaseInput = z.infer<typeof createCaseInput>;
export type CaseActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};
export const initialCaseActionState: CaseActionState = { status: "idle" };
