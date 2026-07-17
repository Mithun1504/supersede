import { z } from "zod";

import { inngest } from "@/inngest/client";
import { runPropagationForOrganization } from "@/modules/changes/propagation";

export const changeValidatedPayloadSchema = z.object({
  organizationId: z.string().uuid(),
  actorMembershipId: z.string().uuid(),
  changeEventVersionId: z.string().uuid(),
});

export const changePropagation = inngest.createFunction(
  {
    id: "change-propagation-v1",
    name: "Propagate a validated ChangeEvent",
    triggers: { event: "change.validated" },
    retries: 4,
    concurrency: { limit: 2, key: "event.data.organizationId" },
  },
  async ({ event, step }) => {
    const payload = changeValidatedPayloadSchema.parse(event.data);
    return step.run("walk-reviewed-graph", () =>
      runPropagationForOrganization(
        {
          organizationId: payload.organizationId,
          actorMembershipId: payload.actorMembershipId,
        },
        payload.changeEventVersionId,
      ),
    );
  },
);
