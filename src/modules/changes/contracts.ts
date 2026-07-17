import { z } from "zod";

export const createChangeInput = z
  .object({
    oldSourceVersionId: z.string().uuid(),
    newSourceVersionId: z.string().uuid(),
    oldRule: z.string().trim().min(3).max(8_000),
    newRule: z.string().trim().min(3).max(8_000),
    affectedPopulation: z.string().trim().min(2).max(4_000),
    exclusions: z.string().trim().max(4_000).default(""),
    unresolvedAmbiguity: z.string().trim().max(4_000).default(""),
    diffSummary: z.string().trim().min(3).max(4_000),
  })
  .refine((input) => input.oldSourceVersionId !== input.newSourceVersionId, {
    path: ["newSourceVersionId"],
    message: "Choose two different versions.",
  });

export const validateChangeInput = z.object({
  changeEventVersionId: z.string().uuid(),
});

export type CreateChangeInput = z.infer<typeof createChangeInput>;

export type ChangeActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  objectPath?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialChangeActionState: ChangeActionState = { status: "idle" };
