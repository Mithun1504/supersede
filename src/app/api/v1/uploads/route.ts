import { z } from "zod";

import {
  getRequestId,
  jsonResponse,
  problemResponse,
} from "@/lib/api/responses";
import { parseJsonBody } from "@/lib/api/validation";
import { logger } from "@/lib/observability/logger";
import { createUploadSessionInput } from "@/modules/corpus/contracts";
import { createUploadSession } from "@/modules/corpus/uploads";
import { requireCurrentActor } from "@/modules/identity/policy";

export const runtime = "nodejs";

export const uploadSessionResponse = z.object({
  uploadSessionId: z.string().uuid(),
  uploadUrl: z.string().url(),
  requiredHeaders: z.record(z.string(), z.string()),
  expiresAt: z.string().datetime(),
  replayed: z.boolean(),
});

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  const instance = new URL(request.url).pathname;
  try {
    const actor = await requireCurrentActor();
    const input = await parseJsonBody(request, createUploadSessionInput);
    const result = uploadSessionResponse.parse(
      await createUploadSession(actor, input),
    );
    return jsonResponse(result, requestId, {
      status: result.replayed ? 200 : 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    logger.warn({ requestId, error }, "Upload session creation failed");
    return problemResponse(error, requestId, instance);
  }
}
