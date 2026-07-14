import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";

export async function parseJsonBody<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
): Promise<z.output<TSchema>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    throw new AppError({
      code: "BAD_REQUEST",
      message: "Request body must be valid JSON.",
      status: 400,
      cause: error,
    });
  }

  const result = schema.safeParse(body);

  if (!result.success) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "Request validation failed.",
      detail: z.prettifyError(result.error),
      status: 422,
    });
  }

  return result.data;
}
