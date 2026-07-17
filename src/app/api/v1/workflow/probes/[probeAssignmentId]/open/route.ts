import { z } from "zod";

import {
  idempotentBodySchema,
  parseUuidParam,
  uuidSchema,
  workflowPost,
} from "@/app/api/v1/workflow/_shared/http";
import { requireTenantActor } from "@/modules/identity/request-context";
import { openProbeAssignment } from "@/modules/learning";

type Params = Promise<{ probeAssignmentId: string }>;

export const openProbeRequestSchema = idempotentBodySchema;
export const openProbeResponseSchema = z.object({
  probeAssignmentId: uuidSchema,
  opened: z.literal(true),
});

export async function POST(request: Request, { params }: { params: Params }) {
  return workflowPost(
    request,
    openProbeRequestSchema,
    openProbeResponseSchema,
    async (_body, idempotencyKey) => {
      const { probeAssignmentId } = await params;
      const { tenant } = await requireTenantActor();
      return openProbeAssignment(tenant, {
        idempotencyKey,
        probeAssignmentId: parseUuidParam(
          probeAssignmentId,
          "probeAssignmentId",
        ),
      });
    },
  );
}
