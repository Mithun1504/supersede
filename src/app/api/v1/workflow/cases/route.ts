import { z } from "zod";

import {
  caseIdsResponseSchema,
  idempotentBodySchema,
  jsonObjectSchema,
  uuidSchema,
  workflowPost,
} from "@/app/api/v1/workflow/_shared/http";
import { draftCaseVersion } from "@/modules/cases";
import { requireTenantActor } from "@/modules/identity/request-context";

export const draftCaseRequestSchema = idempotentBodySchema.extend({
  changeEventId: uuidSchema,
  changeEventVersionId: uuidSchema,
  versionLabel: z.string().trim().min(1).max(128),
  scenario: z.string().trim().min(1),
  oldAnswer: z.string().trim().min(1),
  newAnswer: z.string().trim().min(1),
  rationale: z.string().trim().min(1),
  oldCitation: jsonObjectSchema,
  newCitation: jsonObjectSchema,
  ambiguityNote: z.string().trim().min(1).nullable().optional(),
});

export const draftCaseResponseSchema = caseIdsResponseSchema;

export async function POST(request: Request) {
  return workflowPost(
    request,
    draftCaseRequestSchema,
    draftCaseResponseSchema,
    async (body, idempotencyKey) => {
      const { tenant } = await requireTenantActor();
      return draftCaseVersion(tenant, {
        idempotencyKey,
        changeEventId: body.changeEventId,
        changeEventVersionId: body.changeEventVersionId,
        versionLabel: body.versionLabel,
        scenario: body.scenario,
        oldAnswer: body.oldAnswer,
        newAnswer: body.newAnswer,
        rationale: body.rationale,
        oldCitation: body.oldCitation,
        newCitation: body.newCitation,
        ...(body.ambiguityNote === undefined
          ? {}
          : { ambiguityNote: body.ambiguityNote }),
      });
    },
  );
}
