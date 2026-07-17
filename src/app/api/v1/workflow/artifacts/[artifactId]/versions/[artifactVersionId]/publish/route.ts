import {
  artifactVersionIdsResponseSchema,
  idempotentBodySchema,
  parseUuidParam,
  workflowPost,
} from "@/app/api/v1/workflow/_shared/http";
import { publishArtifactVersion } from "@/modules/artifacts";
import { requireTenantActor } from "@/modules/identity/request-context";

type Params = Promise<{ artifactId: string; artifactVersionId: string }>;

export const publishArtifactVersionRequestSchema = idempotentBodySchema;
export const publishArtifactVersionResponseSchema =
  artifactVersionIdsResponseSchema;

export async function POST(request: Request, { params }: { params: Params }) {
  return workflowPost(
    request,
    publishArtifactVersionRequestSchema,
    publishArtifactVersionResponseSchema,
    async (_body, idempotencyKey) => {
      const { artifactId, artifactVersionId } = await params;
      const { tenant } = await requireTenantActor();
      return publishArtifactVersion(tenant, {
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
