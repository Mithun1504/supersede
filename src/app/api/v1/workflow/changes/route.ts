import { z } from "zod";

import {
  changeIdsResponseSchema,
  idempotentBodySchema,
  jsonObjectSchema,
  workflowPost,
  uuidSchema,
} from "@/app/api/v1/workflow/_shared/http";
import { enterChangeEvent } from "@/modules/changes";
import { requireTenantActor } from "@/modules/identity/request-context";

export const submitChangeRequestSchema = idempotentBodySchema.extend({
  sourceId: uuidSchema,
  oldSourceVersionId: uuidSchema,
  newSourceVersionId: uuidSchema,
  versionLabel: z.string().trim().min(1).max(128),
  oldRule: z.string().trim().min(1),
  newRule: z.string().trim().min(1),
  affectedPopulation: z.string().trim().min(1),
  diffSummary: jsonObjectSchema,
});

export const submitChangeResponseSchema = changeIdsResponseSchema;

export async function POST(request: Request) {
  return workflowPost(
    request,
    submitChangeRequestSchema,
    submitChangeResponseSchema,
    async (body, idempotencyKey) => {
      const { tenant } = await requireTenantActor();
      return enterChangeEvent(tenant, { ...body, idempotencyKey });
    },
  );
}
