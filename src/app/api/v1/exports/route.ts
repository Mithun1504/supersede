import { z } from "zod";

import {
  idempotentBodySchema,
  workflowPost,
  uuidSchema,
} from "@/app/api/v1/workflow/_shared/http";
import { generateAuditReportBundle } from "@/modules/audit";
import { requireTenantActor } from "@/modules/identity/request-context";

export const reportBundleGenerationRequestSchema = idempotentBodySchema.extend({
  changeEventId: uuidSchema,
  changeEventVersionId: uuidSchema,
  retentionMode: z.enum(["standard", "object_lock"]).default("standard"),
  retainUntil: z.iso.datetime().optional().nullable(),
  cutoffAt: z.iso.datetime().optional(),
});

export const reportBundleGenerationResponseSchema = z.object({
  reportBundleId: uuidSchema,
  storageObjectKey: z.string().min(1),
  sha256: z.string().length(64),
  retentionMode: z.enum(["standard", "object_lock"]),
  worm: z.boolean(),
  retainUntil: z.iso.datetime().optional(),
});

export async function POST(request: Request) {
  return workflowPost(
    request,
    reportBundleGenerationRequestSchema,
    reportBundleGenerationResponseSchema,
    async (body, idempotencyKey) => {
      const { tenant } = await requireTenantActor();
      return generateAuditReportBundle(tenant, { ...body, idempotencyKey });
    },
  );
}
