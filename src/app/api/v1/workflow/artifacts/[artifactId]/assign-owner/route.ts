import { z } from "zod";

import {
  artifactIdsResponseSchema,
  idempotentBodySchema,
  parseUuidParam,
  workflowPost,
  uuidSchema,
} from "@/app/api/v1/workflow/_shared/http";
import { assignArtifactOwner } from "@/modules/artifacts";
import { requireTenantActor } from "@/modules/identity/request-context";

type Params = Promise<{ artifactId: string }>;

export const assignArtifactOwnerRequestSchema = idempotentBodySchema.extend({
  ownerMembershipId: uuidSchema,
  reason: z.string().trim().min(1),
});
export const assignArtifactOwnerResponseSchema = artifactIdsResponseSchema;

export async function POST(request: Request, { params }: { params: Params }) {
  return workflowPost(
    request,
    assignArtifactOwnerRequestSchema,
    assignArtifactOwnerResponseSchema,
    async (body, idempotencyKey) => {
      const { artifactId } = await params;
      const { tenant } = await requireTenantActor();
      return assignArtifactOwner(tenant, {
        ...body,
        idempotencyKey,
        artifactId: parseUuidParam(artifactId, "artifactId"),
      });
    },
  );
}
