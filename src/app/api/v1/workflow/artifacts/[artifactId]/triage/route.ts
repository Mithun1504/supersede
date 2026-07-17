import { z } from "zod";

import {
  artifactVersionIdsResponseSchema,
  idempotentBodySchema,
  parseUuidParam,
  workflowPost,
  uuidSchema,
} from "@/app/api/v1/workflow/_shared/http";
import { triageArtifactImpact } from "@/modules/artifacts";
import { requireTenantActor } from "@/modules/identity/request-context";

type Params = Promise<{ artifactId: string }>;

export const triageArtifactRequestSchema = idempotentBodySchema.extend({
  artifactVersionId: uuidSchema,
  changeEventVersionId: uuidSchema,
  decision: z.enum(["requires_correction", "no_change_required"]),
  rationale: z.string().trim().min(1),
});
export const triageArtifactResponseSchema = artifactVersionIdsResponseSchema;

export async function POST(request: Request, { params }: { params: Params }) {
  return workflowPost(
    request,
    triageArtifactRequestSchema,
    triageArtifactResponseSchema,
    async (body, idempotencyKey) => {
      const { artifactId } = await params;
      const { tenant } = await requireTenantActor();
      return triageArtifactImpact(tenant, {
        ...body,
        idempotencyKey,
        artifactId: parseUuidParam(artifactId, "artifactId"),
      });
    },
  );
}
