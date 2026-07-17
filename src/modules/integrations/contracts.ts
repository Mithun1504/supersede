import { z } from "zod";

export const configureIntegrationInput = z.object({
  type: z.enum(["slack", "lms_xapi", "hris_csv"]),
  name: z.string().trim().min(2).max(255),
});

export const disableIntegrationInput = z.object({
  connectionId: z.string().uuid(),
});

export type IntegrationActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialIntegrationActionState: IntegrationActionState = {
  status: "idle",
};
