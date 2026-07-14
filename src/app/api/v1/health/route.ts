import { z } from "zod";

import { getRequestId, jsonResponse } from "@/lib/api/responses";
import { getConfigurationStatus } from "@/lib/env/server";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("supersede-web"),
  timestamp: z.string(),
  configuration: z.record(z.string(), z.boolean()),
});

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  return jsonResponse(
    healthResponseSchema.parse({
      status: "ok",
      service: "supersede-web",
      timestamp: new Date().toISOString(),
      configuration: getConfigurationStatus(),
    }),
    requestId,
    { headers: { "cache-control": "no-store" } },
  );
}
