import { z } from "zod";

import { AppError } from "@/lib/errors/app-error";

function assertJsonMutationRequest(request: Request): void {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json" && !mediaType?.endsWith("+json")) {
    throw new AppError({
      code: "BAD_REQUEST",
      message: "Content-Type must be application/json.",
      status: 415,
    });
  }

  const requestOrigin = new URL(request.url).origin;
  const suppliedOrigin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (
    (suppliedOrigin && suppliedOrigin !== requestOrigin) ||
    (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite))
  ) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "Same-origin request required.",
      status: 403,
    });
  }
}

export async function parseJsonBody<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
): Promise<z.output<TSchema>> {
  assertJsonMutationRequest(request);
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
