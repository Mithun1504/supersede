import {
  getRequestId,
  jsonResponse,
  problemResponse,
} from "@/lib/api/responses";
import { requireTenantActor } from "@/modules/identity/request-context";
import { listWorkflowProgress } from "@/modules/workflows";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    const { tenant } = await requireTenantActor();
    const runs = await listWorkflowProgress(tenant);
    return jsonResponse({ runs }, requestId, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return problemResponse(error, requestId, request.url);
  }
}
