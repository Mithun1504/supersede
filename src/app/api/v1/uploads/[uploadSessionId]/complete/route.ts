import { z } from "zod";

import {
  getRequestId,
  jsonResponse,
  problemResponse,
} from "@/lib/api/responses";
import { parseJsonBody } from "@/lib/api/validation";
import { AppError } from "@/lib/errors/app-error";
import { logger } from "@/lib/observability/logger";
import {
  completeUploadBodyInput,
  completeUploadResponse,
} from "@/modules/corpus/contracts";
import { completeUpload } from "@/modules/corpus/uploads";
import { requireCurrentActor } from "@/modules/identity/policy";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ uploadSessionId: string }> },
): Promise<Response> {
  const requestId = getRequestId(request);
  const instance = new URL(request.url).pathname;
  try {
    const actor = await requireCurrentActor();
    const { uploadSessionId } = await context.params;
    if (!z.uuid().safeParse(uploadSessionId).success) {
      throw new AppError({
        code: "VALIDATION_FAILED",
        message: "The upload session identifier is invalid.",
        status: 422,
      });
    }
    const body = await parseJsonBody(request, completeUploadBodyInput);
    const result = completeUploadResponse.parse(
      await completeUpload(actor, { ...body, uploadSessionId }),
    );
    return jsonResponse(result, requestId, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    logger.warn({ requestId, error }, "Upload completion failed");
    return problemResponse(error, requestId, instance);
  }
}
