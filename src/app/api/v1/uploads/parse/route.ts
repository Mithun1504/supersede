import {
  parsedCorpusUploadSchema,
  parseCorpusUpload,
  parseCorpusUploadRequestSchema,
} from "@/modules/corpus/uploads";
import {
  getRequestId,
  jsonResponse,
  problemResponse,
} from "@/lib/api/responses";
import { parseJsonBody } from "@/lib/api/validation";
import { API_RATE_LIMITS, consumeRateLimit } from "@/lib/security/rate-limit";
import { requireTenantActor } from "@/modules/identity/request-context";

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    const { tenant } = await requireTenantActor();
    const input = await parseJsonBody(request, parseCorpusUploadRequestSchema);
    await consumeRateLimit(tenant, API_RATE_LIMITS.uploadParse);
    const result = await parseCorpusUpload({
      organizationId: tenant.organizationId,
      ...input,
    });

    return jsonResponse(parsedCorpusUploadSchema.parse(result), requestId, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return problemResponse(error, requestId, request.url);
  }
}
