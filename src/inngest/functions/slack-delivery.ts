import { inngest } from "@/inngest/client";
import { deliverOrganizationSlackNotifications } from "@/modules/notifications/slack";
import { listWorkerOrganizationIds } from "@/modules/operations/outbox";

export const slackDelivery = inngest.createFunction(
  {
    id: "slack-delivery-v1",
    name: "Deliver Slack notifications",
    retries: 4,
    triggers: { cron: "*/5 * * * *" },
  },
  async ({ step }) => {
    const organizationIds = await step.run(
      "list-active-organizations",
      listWorkerOrganizationIds,
    );
    const results = [];
    for (const organizationId of organizationIds)
      results.push(
        await step.run(`deliver-${organizationId}`, () =>
          deliverOrganizationSlackNotifications(organizationId),
        ),
      );
    return results;
  },
);
