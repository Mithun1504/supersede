import { z } from "zod";

import {
  idempotentBodySchema,
  parseUuidParam,
  uuidSchema,
  workflowPost,
} from "@/app/api/v1/workflow/_shared/http";
import { requireTenantActor } from "@/modules/identity/request-context";
import { completeProbeResponse } from "@/modules/learning";

type Params = Promise<{ probeAssignmentId: string }>;

export const completeProbeRequestSchema = idempotentBodySchema.extend({
  responseText: z.string().trim().min(1).max(20_000),
});
export const completeProbeResponseSchema = z.object({
  probeAssignmentId: uuidSchema,
  probeResponseId: uuidSchema,
  answeredWith: z.enum(["old", "new", "other"]),
  reviewRequired: z.boolean(),
  remediationAssignmentId: uuidSchema.nullable(),
});

export async function POST(request: Request, { params }: { params: Params }) {
  return workflowPost(
    request,
    completeProbeRequestSchema,
    completeProbeResponseSchema,
    async (body, idempotencyKey) => {
      const { probeAssignmentId } = await params;
      const { tenant } = await requireTenantActor();
      return completeProbeResponse(tenant, {
        idempotencyKey,
        probeAssignmentId: parseUuidParam(
          probeAssignmentId,
          "probeAssignmentId",
        ),
        responseText: body.responseText,
      });
    },
  );
}
