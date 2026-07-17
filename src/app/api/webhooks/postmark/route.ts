import { getRequestId, problemResponse } from "@/lib/api/responses";
import { AppError } from "@/lib/errors/app-error";
import { logger } from "@/lib/observability/logger";
import {
  processPostmarkWebhook,
  verifyPostmarkBasicAuth,
} from "@/modules/notifications/email";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  const path = new URL(request.url).pathname;
  if (!verifyPostmarkBasicAuth(request.headers.get("authorization")))
    return problemResponse(
      new AppError({
        code: "UNAUTHENTICATED",
        message: "Valid webhook credentials are required.",
        status: 401,
      }),
      requestId,
      path,
    );

  try {
    const outcome = await processPostmarkWebhook(await request.json());
    logger.info({ requestId, outcome }, "Postmark webhook handled");
    return Response.json({ outcome });
  } catch (error) {
    logger.warn({ requestId, error }, "Postmark webhook rejected");
    return problemResponse(error, requestId, path);
  }
}
