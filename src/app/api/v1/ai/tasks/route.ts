import { createHash } from "node:crypto";

import { z } from "zod";

import { governedTaskRequestSchema, runGovernedTask } from "@/ai/workflows/api";
import {
  getRequestId,
  jsonResponse,
  problemResponse,
} from "@/lib/api/responses";
import { parseJsonBody } from "@/lib/api/validation";
import { AppError } from "@/lib/errors/app-error";
import { API_RATE_LIMITS, consumeRateLimit } from "@/lib/security/rate-limit";
import { requireTenantActor } from "@/modules/identity/request-context";

const idempotencyKeySchema = z.string().trim().min(1).max(255);

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    const idempotencyKey = idempotencyKeySchema.safeParse(
      request.headers.get("idempotency-key"),
    );
    if (!idempotencyKey.success) {
      throw new AppError({
        code: "BAD_REQUEST",
        message: "Idempotency-Key header is required.",
        status: 400,
      });
    }
    const { tenant } = await requireTenantActor();
    const input = await parseJsonBody(request, governedTaskRequestSchema);
    await consumeRateLimit(tenant, API_RATE_LIMITS.aiTask);
    const result = await runGovernedTask(input, {
      idempotencyKey: createHash("sha256")
        .update(
          `${tenant.organizationId}:ai-task:${idempotencyKey.data}:${JSON.stringify(input)}`,
        )
        .digest("hex"),
    });

    return jsonResponse(result, requestId, {
      headers: {
        "cache-control": "no-store",
        "idempotency-key": idempotencyKey.data,
      },
    });
  } catch (error) {
    return problemResponse(error, requestId, request.url);
  }
}
