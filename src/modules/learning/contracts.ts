import { z } from "zod";

export const submitProbeInput = z.object({
  probeAssignmentId: z.string().uuid(),
  selectedOptionId: z.string().trim().min(1).max(128),
  clientSubmissionId: z.string().uuid(),
});

export const submitRemediationInput = z.object({
  remediationAssignmentId: z.string().uuid(),
  submissionText: z.string().trim().min(20).max(50_000),
});

export type LearningActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialLearningActionState: LearningActionState = {
  status: "idle",
};
