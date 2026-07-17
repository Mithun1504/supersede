import { inngest } from "@/inngest/client";
import {
  dispatchDueRechecksForOrganization,
  listActiveOrganizationIds,
} from "@/modules/learning/rechecks";

export const dueWorkDispatch = inngest.createFunction(
  {
    id: "due-work-dispatch-v1",
    name: "Dispatch due rechecks",
    retries: 4,
    triggers: { cron: "0 * * * *" },
  },
  async ({ step }) => {
    const organizationIds = await step.run(
      "list-active-organizations",
      listActiveOrganizationIds,
    );
    const results = [];
    for (const organizationId of organizationIds)
      results.push(
        await step.run(`dispatch-${organizationId}`, () =>
          dispatchDueRechecksForOrganization(organizationId),
        ),
      );
    return results.reduce(
      (total, item) => ({
        dispatched: total.dispatched + item.dispatched,
        blocked: total.blocked + item.blocked,
      }),
      { dispatched: 0, blocked: 0 },
    );
  },
);
