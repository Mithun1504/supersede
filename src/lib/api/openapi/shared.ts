import { z } from "zod";
import { problemDetailsSchema } from "@/lib/api/problem-details";

export const idempotencyHeader = z.object({
  "Idempotency-Key": z.string().min(8).max(255).optional(),
});

const problemContent = {
  "application/problem+json": { schema: problemDetailsSchema },
};

export const mutationProblems = {
  400: {
    description: "Missing, invalid, or conflicting idempotency key.",
    content: problemContent,
  },
  401: {
    description: "Authentication is required.",
    content: problemContent,
  },
  403: {
    description: "Authenticated actor is not allowed to perform the action.",
    content: problemContent,
  },
  409: {
    description: "The requested workflow transition conflicts with state.",
    content: problemContent,
  },
  422: {
    description: "Request input failed validation.",
    content: problemContent,
  },
};
