import { z } from "zod";

import {
  idempotentBodySchema,
  parseUuidParam,
  workflowPost,
} from "@/app/api/v1/workflow/_shared/http";
import { acceptDependencyEdge } from "@/modules/graph";
import { requireTenantActor } from "@/modules/identity/request-context";

type Params = Promise<{ edgeId: string; edgeVersionId: string }>;

const confidenceSchema = z.number().min(0).max(1);

export const edgeReviewResponseSchema = z.object({
  edgeId: z.string().uuid(),
  edgeVersionId: z.string().uuid(),
  reviewStatus: z.literal("reviewed"),
  decision: z.enum(["accepted", "overridden"]),
  ai: z.object({
    confidence: confidenceSchema,
    rationale: z.string().min(1),
    loadBearingScore: confidenceSchema,
  }),
  impact: z.object({
    class: z.enum(["rewrite_required", "line_edit"]),
    humanReviewed: z.literal(true),
    overrideClass: z.enum(["load_bearing", "peripheral"]).optional(),
    overrideReason: z.string().min(1).optional(),
  }),
});

export const acceptEdgeRequestSchema = idempotentBodySchema.extend({
  aiRationale: z.string().trim().min(1),
  loadBearingScore: confidenceSchema,
});
export const acceptEdgeResponseSchema = edgeReviewResponseSchema;

export async function POST(request: Request, { params }: { params: Params }) {
  return workflowPost(
    request,
    acceptEdgeRequestSchema,
    acceptEdgeResponseSchema,
    async (body, idempotencyKey) => {
      const { edgeId, edgeVersionId } = await params;
      const { tenant } = await requireTenantActor();
      return acceptDependencyEdge(tenant, {
        idempotencyKey,
        edgeId: parseUuidParam(edgeId, "edgeId"),
        edgeVersionId: parseUuidParam(edgeVersionId, "edgeVersionId"),
        aiRationale: body.aiRationale,
        loadBearingScore: body.loadBearingScore,
      });
    },
  );
}
