import { getRequestId, jsonResponse } from "@/lib/api/responses";
import { createOpenApiDocument } from "@/lib/api/openapi";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response(null, { status: 404 });
  }

  return jsonResponse(createOpenApiDocument(), getRequestId(request), {
    headers: { "cache-control": "no-store" },
  });
}
