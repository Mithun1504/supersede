import { z } from "zod";

import {
  artifactVersionIdsResponseSchema,
  idempotentBodySchema,
  parseUuidParam,
  workflowPost,
  uuidSchema,
} from "@/app/api/v1/workflow/_shared/http";
import { submitCorrectedArtifactVersion } from "@/modules/artifacts";
import { requireTenantActor } from "@/modules/identity/request-context";

type Params = Promise<{ artifactId: string }>;

export const submitCorrectedArtifactVersionRequestSchema =
  idempotentBodySchema.extend({
    parentArtifactVersionId: uuidSchema,
    versionLabel: z.string().trim().min(1).max(128),
    bodyText: z.string().trim().min(1),
    fileSha256: z.string().regex(/^[a-f0-9]{64}$/i),
    storageObjectKey: z.string().trim().min(1).optional().nullable(),
  });
export const submitCorrectedArtifactVersionResponseSchema =
  artifactVersionIdsResponseSchema;

export async function POST(request: Request, { params }: { params: Params }) {
  return workflowPost(
    request,
    submitCorrectedArtifactVersionRequestSchema,
    submitCorrectedArtifactVersionResponseSchema,
    async (body, idempotencyKey) => {
      const { artifactId } = await params;
      const { tenant } = await requireTenantActor();
      return submitCorrectedArtifactVersion(tenant, {
        ...body,
        idempotencyKey,
        artifactId: parseUuidParam(artifactId, "artifactId"),
      });
    },
  );
}
