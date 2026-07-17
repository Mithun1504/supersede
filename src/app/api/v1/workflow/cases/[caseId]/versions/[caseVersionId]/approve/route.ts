import {
  caseIdsResponseSchema,
  idempotentBodySchema,
  parseUuidParam,
  workflowPost,
} from "@/app/api/v1/workflow/_shared/http";
import { approveCaseVersion } from "@/modules/cases";
import { requireTenantActor } from "@/modules/identity/request-context";

type Params = Promise<{ caseId: string; caseVersionId: string }>;

export const approveCaseRequestSchema = idempotentBodySchema;
export const approveCaseResponseSchema = caseIdsResponseSchema;

export async function POST(request: Request, { params }: { params: Params }) {
  return workflowPost(
    request,
    approveCaseRequestSchema,
    approveCaseResponseSchema,
    async (_body, idempotencyKey) => {
      const { caseId, caseVersionId } = await params;
      const { tenant } = await requireTenantActor();
      return approveCaseVersion(tenant, {
        idempotencyKey,
        caseId: parseUuidParam(caseId, "caseId"),
        caseVersionId: parseUuidParam(caseVersionId, "caseVersionId"),
      });
    },
  );
}
