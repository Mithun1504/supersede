import { z } from "zod";

import {
  idempotentBodySchema,
  parseUuidParam,
  workflowPost,
  uuidSchema,
} from "@/app/api/v1/workflow/_shared/http";
import { authorizeExportRelease } from "@/modules/audit";
import { requireTenantActor } from "@/modules/identity/request-context";

type Params = Promise<{ reportBundleId: string }>;

export const exportReleaseRequestSchema = idempotentBodySchema;
export const exportApprovalResponseSchema = z.object({
  reportBundleId: uuidSchema,
  retentionMode: z.enum(["standard", "object_lock"]).optional(),
  worm: z.boolean().optional(),
  retainUntil: z.iso.datetime().optional(),
});
export const exportReleaseResponseSchema = exportApprovalResponseSchema;

export async function POST(request: Request, { params }: { params: Params }) {
  return workflowPost(
    request,
    exportReleaseRequestSchema,
    exportReleaseResponseSchema,
    async (_body, idempotencyKey) => {
      const { reportBundleId } = await params;
      const { tenant } = await requireTenantActor();
      return authorizeExportRelease(tenant, {
        idempotencyKey,
        reportBundleId: parseUuidParam(reportBundleId, "reportBundleId"),
      });
    },
  );
}
