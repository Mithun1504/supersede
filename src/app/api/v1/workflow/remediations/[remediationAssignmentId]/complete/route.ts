import { z } from "zod";

import {
  idempotentBodySchema,
  parseUuidParam,
  remediationCompleteResponseSchema,
  workflowPost,
} from "@/app/api/v1/workflow/_shared/http";
import { completeRemediation } from "@/modules/learning";
import { requireTenantActor } from "@/modules/identity/request-context";

type Params = Promise<{ remediationAssignmentId: string }>;

export const completeRemediationRequestSchema = idempotentBodySchema.extend({
  submittedPatch: z.string().trim().min(1),
  feedback: z.string().trim().min(1),
  passed: z.boolean(),
});
export const completeRemediationRouteResponseSchema =
  remediationCompleteResponseSchema;

export async function POST(request: Request, { params }: { params: Params }) {
  return workflowPost(
    request,
    completeRemediationRequestSchema,
    completeRemediationRouteResponseSchema,
    async (body, idempotencyKey) => {
      const { remediationAssignmentId } = await params;
      const { tenant } = await requireTenantActor();
      return completeRemediation(tenant, {
        idempotencyKey,
        remediationAssignmentId: parseUuidParam(
          remediationAssignmentId,
          "remediationAssignmentId",
        ),
        submittedPatch: body.submittedPatch,
        feedback: body.feedback,
        passed: body.passed,
      });
    },
  );
}
