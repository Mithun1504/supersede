import {
  changeIdsResponseSchema,
  idempotentBodySchema,
  parseUuidParam,
  workflowPost,
} from "@/app/api/v1/workflow/_shared/http";
import { validateChangeEvent } from "@/modules/changes";
import { requireTenantActor } from "@/modules/identity/request-context";

type Params = Promise<{
  changeEventId: string;
  changeEventVersionId: string;
}>;

export const validateChangeRequestSchema = idempotentBodySchema;
export const validateChangeResponseSchema = changeIdsResponseSchema;

export async function POST(request: Request, { params }: { params: Params }) {
  return workflowPost(
    request,
    validateChangeRequestSchema,
    validateChangeResponseSchema,
    async (_body, idempotencyKey) => {
      const { changeEventId, changeEventVersionId } = await params;
      const { tenant } = await requireTenantActor();
      return validateChangeEvent(tenant, {
        idempotencyKey,
        changeEventId: parseUuidParam(changeEventId, "changeEventId"),
        changeEventVersionId: parseUuidParam(
          changeEventVersionId,
          "changeEventVersionId",
        ),
      });
    },
  );
}
