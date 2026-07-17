import { z } from "zod";

import { getPool } from "@/db/client";
import { getRequestId, jsonResponse } from "@/lib/api/responses";
import { getConfigurationStatus } from "@/lib/env/server";

export const readinessResponseSchema = z.object({
  status: z.enum(["ready", "not_ready"]),
  service: z.literal("supersede-web"),
  timestamp: z.string(),
  checks: z.record(z.string(), z.boolean()),
});

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const configured = getConfigurationStatus();
  let databaseReachable = false;

  if (configured.database) {
    try {
      await getPool().query("select 1");
      databaseReachable = true;
    } catch {
      databaseReachable = false;
    }
  }

  const checks = {
    database: databaseReachable,
    workos: configured.workos,
    openai: configured.openai,
    workingStorage: configured.workingStorage,
    inngest: configured.inngest,
  };
  const ready = Object.values(checks).every(Boolean);

  return jsonResponse(
    readinessResponseSchema.parse({
      status: ready ? "ready" : "not_ready",
      service: "supersede-web",
      timestamp: new Date().toISOString(),
      checks,
    }),
    requestId,
    {
      status: ready ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
