import {
  caseIdsResponseSchema,
  idempotentBodySchema,
  parseUuidParam,
  workflowPost,
} from "@/app/api/v1/workflow/_shared/http";
import { authorizeCaseRelease } from "@/modules/cases";
import { requireTenantActor } from "@/modules/identity/request-context";

type Params = Promise<{ caseId: string; caseVersionId: string }>;

export const releaseCaseRequestSchema = idempotentBodySchema;
export const releaseCaseResponseSchema = caseIdsResponseSchema;

export async function POST(request: Request, { params }: { params: Params }) {
  return workflowPost(
    request,
    releaseCaseRequestSchema,
    releaseCaseResponseSchema,
    async (_body, idempotencyKey) => {
      const { caseId, caseVersionId } = await params;
      const { tenant } = await requireTenantActor();
      return authorizeCaseRelease(tenant, {
        idempotencyKey,
        caseId: parseUuidParam(caseId, "caseId"),
        caseVersionId: parseUuidParam(caseVersionId, "caseVersionId"),
      });
    },
  );
}
