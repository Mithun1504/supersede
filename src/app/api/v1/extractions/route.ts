import { createHash } from "node:crypto";

import { z } from "zod";

import {
  extractionApiRequestSchema,
  extractionApiResponseSchema,
  extractClaimsFromPastedText,
} from "@/modules/corpus/extraction";
import {
  getRequestId,
  jsonResponse,
  problemResponse,
} from "@/lib/api/responses";
import { parseJsonBody } from "@/lib/api/validation";
import { AppError } from "@/lib/errors/app-error";
import { API_RATE_LIMITS, consumeRateLimit } from "@/lib/security/rate-limit";
import { requireTenantActor } from "@/modules/identity/request-context";
import {
  ensureIngestedArtifactVersion,
  persistExtractedClaims,
} from "@/modules/corpus/persistence";

export const extractionRouteResponseSchema = extractionApiResponseSchema;

const idempotencyKeySchema = z.string().trim().min(1);

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

    const body = await parseJsonBody(request, extractionApiRequestSchema);
    await consumeRateLimit(tenant, API_RATE_LIMITS.extraction);
    const artifact = await ensureIngestedArtifactVersion(tenant, body);
    const response = await extractClaimsFromPastedText(
      {
        ...body,
        documentVersionId: artifact.artifactVersionId,
      },
      {
        idempotencyKey: createHash("sha256")
          .update(
            `${tenant.organizationId}:extraction:${idempotencyKey.data}:${body.sourceHash}`,
          )
          .digest("hex"),
      },
    );
    const persisted = await persistExtractedClaims(tenant, {
      ...artifact,
      sourceHash: body.sourceHash,
      result: response,
    });

    return jsonResponse(
      extractionRouteResponseSchema.parse({
        ...response,
        artifactVersionId: artifact.artifactVersionId,
        persistedClaimCount: persisted.persistedClaimCount,
      }),
      requestId,
      {
        headers: {
          "cache-control": "no-store",
          "idempotency-key": idempotencyKey.data,
        },
      },
    );
  } catch (error) {
    return problemResponse(error, requestId, request.url);
  }
}
