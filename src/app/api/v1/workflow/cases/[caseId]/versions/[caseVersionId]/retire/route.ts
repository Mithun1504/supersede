import { z } from "zod";

import {
  caseIdsResponseSchema,
  idempotentBodySchema,
  parseUuidParam,
  workflowPost,
} from "@/app/api/v1/workflow/_shared/http";
import { retireCaseVersion } from "@/modules/cases";
import { requireTenantActor } from "@/modules/identity/request-context";

type Params = Promise<{ caseId: string; caseVersionId: string }>;

export const retireCaseRequestSchema = idempotentBodySchema.extend({
  reason: z.string().trim().min(1),
});
export const retireCaseResponseSchema = caseIdsResponseSchema;

export async function POST(request: Request, { params }: { params: Params }) {
  return workflowPost(
    request,
    retireCaseRequestSchema,
    retireCaseResponseSchema,
    async (body, idempotencyKey) => {
      const { caseId, caseVersionId } = await params;
      const { tenant } = await requireTenantActor();
      return retireCaseVersion(tenant, {
        idempotencyKey,
        caseId: parseUuidParam(caseId, "caseId"),
        caseVersionId: parseUuidParam(caseVersionId, "caseVersionId"),
        reason: body.reason,
      });
    },
  );
}
