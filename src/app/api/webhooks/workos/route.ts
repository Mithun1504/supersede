import { getRequestId, problemResponse } from "@/lib/api/responses";
import { AppError } from "@/lib/errors/app-error";
import { logger } from "@/lib/observability/logger";
import {
  processWorkOSIdentityEvent,
  verifyWorkOSWebhook,
} from "@/modules/identity/workos";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const requestId = getRequestId(request);
  const signature = request.headers.get("workos-signature");
  if (!signature) {
    return problemResponse(
      new AppError({
        code: "UNAUTHENTICATED",
        message: "The WorkOS signature header is required.",
        status: 401,
      }),
      requestId,
      new URL(request.url).pathname,
    );
  }

  try {
    const payload = await request.text();
    const event = await verifyWorkOSWebhook(payload, signature);
    const outcome = await processWorkOSIdentityEvent(event, payload);
    logger.info(
      { requestId, eventId: event.id, eventType: event.event, outcome },
      "WorkOS webhook handled",
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    logger.warn({ requestId, error }, "WorkOS webhook rejected");
    return problemResponse(error, requestId, new URL(request.url).pathname);
  }
}
