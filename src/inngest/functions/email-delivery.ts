import { inngest } from "@/inngest/client";
import { deliverOrganizationEmailNotifications } from "@/modules/notifications/email";
import { listWorkerOrganizationIds } from "@/modules/operations/outbox";

export const emailDelivery = inngest.createFunction(
  {
    id: "email-delivery-v1",
    name: "Deliver email notifications",
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
          deliverOrganizationEmailNotifications(organizationId),
        ),
      );
    return results.reduce(
      (total, result) => ({
        delivered: total.delivered + result.delivered,
        failed: total.failed + result.failed,
        skipped: total.skipped + result.skipped,
      }),
      { delivered: 0, failed: 0, skipped: 0 },
    );
  },
);
