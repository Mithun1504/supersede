import { z } from "zod";

export const reviewDecisionInput = z
  .object({
    reviewTaskId: z.string().uuid(),
    action: z.enum(["accepted", "edited", "rejected", "deferred"]),
    editedText: z.string().trim().max(4_000).default(""),
    reason: z.string().trim().max(2_000).default(""),
    activeSeconds: z.coerce.number().int().min(0).max(3_600).default(0),
  })
  .superRefine((input, context) => {
    if (input.action === "edited" && input.editedText.length < 3) {
      context.addIssue({
        code: "custom",
        path: ["editedText"],
        message: "Edited claim text is required.",
      });
    }
  });

export type ReviewDecisionInput = z.infer<typeof reviewDecisionInput>;

export type ReviewActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialReviewActionState: ReviewActionState = { status: "idle" };

export const dismissQuoteFailureInput = z.object({
  reviewTaskId: z.string().uuid(),
  reason: z.string().trim().min(3).max(2_000),
});

export const assessCorrectionInput = z.object({
  reviewTaskId: z.string().uuid(),
  outcome: z.enum(["passed", "failed"]),
  feedback: z.string().trim().min(10).max(4_000),
});

export const classifyProbeInput = z.object({
  reviewTaskId: z.string().uuid(),
  label: z.enum(["old", "new", "other"]),
  rationale: z.string().trim().min(10).max(4_000),
});
