import { inngest } from "@/inngest/client";
import { runPropagationForOrganization } from "@/modules/changes/propagation";

export const changePropagation = inngest.createFunction(
  {
    id: "change-propagation-v1",
    name: "Propagate a validated ChangeEvent",
    retries: 4,
    concurrency: { limit: 2, key: "event.data.organizationId" },
    triggers: { event: "change/validated" },
  },
  async ({ event, step }) => {
    const data = event.data as {
      organizationId: string;
      changeEventVersionId: string;
      actorMembershipId: string;
    };
    return step.run("walk-reviewed-graph", () =>
      runPropagationForOrganization(
        {
          organizationId: data.organizationId,
          actorMembershipId: data.actorMembershipId,
        },
        data.changeEventVersionId,
      ),
    );
  },
);
