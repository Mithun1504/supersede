import { z } from "zod";

import {
  idempotentBodySchema,
  parseUuidParam,
  workflowPost,
} from "@/app/api/v1/workflow/_shared/http";
import { exportApprovalResponseSchema } from "@/app/api/v1/exports/report-bundles/[reportBundleId]/release/route";
import { approveRetentionChange } from "@/modules/audit";
import { requireTenantActor } from "@/modules/identity/request-context";

type Params = Promise<{ reportBundleId: string }>;

export const retentionChangeRequestSchema = idempotentBodySchema.extend({
  retentionMode: z.enum(["standard", "object_lock"]),
  retainUntil: z.iso.datetime().optional().nullable(),
  reason: z.string().trim().min(1),
});
export const retentionChangeResponseSchema = exportApprovalResponseSchema;

export async function POST(request: Request, { params }: { params: Params }) {
  return workflowPost(
    request,
    retentionChangeRequestSchema,
    retentionChangeResponseSchema,
    async (body, idempotencyKey) => {
      const { reportBundleId } = await params;
      const { tenant } = await requireTenantActor();
      return approveRetentionChange(tenant, {
        ...body,
        idempotencyKey,
        reportBundleId: parseUuidParam(reportBundleId, "reportBundleId"),
      });
    },
  );
}
