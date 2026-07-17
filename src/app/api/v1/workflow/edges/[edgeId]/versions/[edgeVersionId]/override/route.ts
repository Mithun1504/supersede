import { z } from "zod";

import { edgeReviewResponseSchema } from "@/app/api/v1/workflow/edges/[edgeId]/versions/[edgeVersionId]/accept/route";
import {
  idempotentBodySchema,
  parseUuidParam,
  workflowPost,
} from "@/app/api/v1/workflow/_shared/http";
import { overrideDependencyEdge } from "@/modules/graph";
import { requireTenantActor } from "@/modules/identity/request-context";

type Params = Promise<{ edgeId: string; edgeVersionId: string }>;

const confidenceSchema = z.number().min(0).max(1);

export const overrideEdgeRequestSchema = idempotentBodySchema.extend({
  aiRationale: z.string().trim().min(1),
  loadBearingScore: confidenceSchema,
  overrideClass: z.enum(["load_bearing", "peripheral"]),
  reason: z.string().trim().min(1),
});
export const overrideEdgeResponseSchema = edgeReviewResponseSchema;

export async function POST(request: Request, { params }: { params: Params }) {
  return workflowPost(
    request,
    overrideEdgeRequestSchema,
    overrideEdgeResponseSchema,
    async (body, idempotencyKey) => {
      const { edgeId, edgeVersionId } = await params;
      const { tenant } = await requireTenantActor();
      return overrideDependencyEdge(tenant, {
        idempotencyKey,
        edgeId: parseUuidParam(edgeId, "edgeId"),
        edgeVersionId: parseUuidParam(edgeVersionId, "edgeVersionId"),
        aiRationale: body.aiRationale,
        loadBearingScore: body.loadBearingScore,
        overrideClass: body.overrideClass,
        reason: body.reason,
      });
    },
  );
}
