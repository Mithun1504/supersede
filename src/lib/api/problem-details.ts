import { z } from "zod";

import { AppError, isAppError } from "@/lib/errors/app-error";

export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: z.string(),
  requestId: z.string(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export function toProblemDetails(
  error: unknown,
  requestId: string,
  instance?: string,
): ProblemDetails {
  const safeError = isAppError(error)
    ? error
    : new AppError({
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
        status: 500,
      });

  return {
    type: `urn:supersede:problem:${safeError.code.toLowerCase()}`,
    title: safeError.message,
    status: safeError.status,
    code: safeError.code,
    requestId,
    ...(safeError.detail ? { detail: safeError.detail } : {}),
    ...(instance ? { instance } : {}),
  };
}
