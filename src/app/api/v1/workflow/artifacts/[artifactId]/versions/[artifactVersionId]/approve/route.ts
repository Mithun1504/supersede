import {
  artifactVersionIdsResponseSchema,
  idempotentBodySchema,
  parseUuidParam,
  workflowPost,
} from "@/app/api/v1/workflow/_shared/http";
import { approveArtifactVersion } from "@/modules/artifacts";
import { requireTenantActor } from "@/modules/identity/request-context";

type Params = Promise<{ artifactId: string; artifactVersionId: string }>;

export const approveArtifactVersionRequestSchema = idempotentBodySchema;
export const approveArtifactVersionResponseSchema =
  artifactVersionIdsResponseSchema;

export async function POST(request: Request, { params }: { params: Params }) {
  return workflowPost(
    request,
    approveArtifactVersionRequestSchema,
    approveArtifactVersionResponseSchema,
    async (_body, idempotencyKey) => {
      const { artifactId, artifactVersionId } = await params;
      const { tenant } = await requireTenantActor();
      return approveArtifactVersion(tenant, {
        idempotencyKey,
        artifactId: parseUuidParam(artifactId, "artifactId"),
        artifactVersionId: parseUuidParam(
          artifactVersionId,
          "artifactVersionId",
        ),
      });
    },
  );
}
