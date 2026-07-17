import { getRequestId, problemResponse } from "@/lib/api/responses";
import { requireCurrentActor } from "@/modules/identity/policy";
import { createXapiExport } from "@/modules/integrations/xapi";
import { assertSameOrigin } from "@/lib/security/request-origin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    assertSameOrigin(request);
    const result = await createXapiExport(await requireCurrentActor());
    return new Response(JSON.stringify(result.statements, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="supersede-xapi-${result.jobId}.json"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return problemResponse(error, requestId, new URL(request.url).pathname);
  }
}
