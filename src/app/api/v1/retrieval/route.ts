import {
  getRequestId,
  jsonResponse,
  problemResponse,
} from "@/lib/api/responses";
import { parseJsonBody } from "@/lib/api/validation";
import { API_RATE_LIMITS, consumeRateLimit } from "@/lib/security/rate-limit";
import {
  hybridRetrievalRequestSchema,
  hybridRetrievalResponseSchema,
  hybridRetrieve,
} from "@/modules/corpus";
import { requireTenantActor } from "@/modules/identity/request-context";

export const retrievalRequestSchema = hybridRetrievalRequestSchema;
export const retrievalResponseSchema = hybridRetrievalResponseSchema;

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    const { tenant } = await requireTenantActor();
    const input = await parseJsonBody(request, retrievalRequestSchema);
    await consumeRateLimit(tenant, API_RATE_LIMITS.retrieval);
    const results = await hybridRetrieve(tenant, input);
    return jsonResponse(retrievalResponseSchema.parse({ results }), requestId, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return problemResponse(error, requestId, request.url);
  }
}
