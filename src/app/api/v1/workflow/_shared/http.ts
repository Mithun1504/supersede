import { z } from "zod";

import {
  getRequestId,
  jsonResponse,
  problemResponse,
} from "@/lib/api/responses";
import { parseJsonBody } from "@/lib/api/validation";
import { AppError } from "@/lib/errors/app-error";
import { requireRequestAuthentication } from "@/modules/identity/request-context";

export const uuidSchema = z.string().uuid();
export const idempotencyKeySchema = z.string().trim().min(8).max(255);
export const jsonObjectSchema = z.record(z.string(), z.unknown());

export const idempotentBodySchema = z.object({
  idempotencyKey: idempotencyKeySchema.optional(),
});

export const changeIdsResponseSchema = z.object({
  changeEventId: uuidSchema,
  changeEventVersionId: uuidSchema,
});

export const caseIdsResponseSchema = z.object({
  caseId: uuidSchema,
  caseVersionId: uuidSchema,
});

export const remediationCompleteResponseSchema = z.object({
  remediationAssignmentId: uuidSchema,
  passed: z.boolean(),
});

export const artifactIdsResponseSchema = z.object({
  artifactId: uuidSchema,
});

export const artifactVersionIdsResponseSchema = z.object({
  artifactId: uuidSchema,
  artifactVersionId: uuidSchema,
});

export type RouteResult<T> = Promise<T>;

type IdempotentBody = { idempotencyKey?: string | undefined };

export function idempotencyKeyFromRequest(
  request: Request,
  body: IdempotentBody,
): string {
  const header = request.headers.get("idempotency-key");
  const parsedHeader = header
    ? idempotencyKeySchema.safeParse(header)
    : undefined;
  if (parsedHeader && !parsedHeader.success) {
    throw new AppError({
      code: "BAD_REQUEST",
      message: "Idempotency-Key header is invalid.",
      status: 400,
    });
  }
  const headerKey = parsedHeader?.data;

  if (headerKey && body.idempotencyKey && headerKey !== body.idempotencyKey) {
    throw new AppError({
      code: "BAD_REQUEST",
      message: "Idempotency-Key header must match body idempotencyKey.",
      status: 400,
    });
  }

  const key = headerKey ?? body.idempotencyKey;
  if (!key) {
    throw new AppError({
      code: "BAD_REQUEST",
      message: "Idempotency-Key header or body idempotencyKey is required.",
      status: 400,
    });
  }

  return key;
}

export function parseUuidParam(value: string, name: string): string {
  const result = uuidSchema.safeParse(value);
  if (!result.success) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: `${name} must be a valid UUID.`,
      status: 422,
    });
  }
  return result.data;
}

export async function workflowPost<TBody extends IdempotentBody, TResult>(
  request: Request,
  bodySchema: z.ZodType<TBody>,
  resultSchema: z.ZodType<TResult>,
  handler: (body: TBody, idempotencyKey: string) => RouteResult<TResult>,
): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    await requireRequestAuthentication();
    const body = await parseJsonBody(request, bodySchema);
    const idempotencyKey = idempotencyKeyFromRequest(request, body);
    const result = await handler(body, idempotencyKey);

    return jsonResponse(resultSchema.parse(result), requestId, {
      headers: {
        "cache-control": "no-store",
        "idempotency-key": idempotencyKey,
      },
    });
  } catch (error) {
    return problemResponse(error, requestId, request.url);
  }
}
