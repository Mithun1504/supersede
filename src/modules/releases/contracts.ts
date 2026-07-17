import { z } from "zod";

export const prepareReleaseInput = z.object({
  changeEventVersionId: z.string().uuid(),
  workRoleId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});

export const authorizeReleaseInput = z.object({
  releaseBatchId: z.string().uuid(),
});
export const simulateSeededPersonasInput = z.object({
  releaseBatchId: z.string().uuid(),
});

export type ReleaseActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialReleaseActionState: ReleaseActionState = { status: "idle" };
