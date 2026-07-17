import { inngest } from "@/inngest/client";
import {
  listWorkerOrganizationIds,
  publishOrganizationOutbox,
} from "@/modules/operations/outbox";

export const outboxPublisher = inngest.createFunction(
  {
    id: "outbox-publisher-v1",
    name: "Publish transactional outbox",
    retries: 2,
    triggers: { cron: "* * * * *" },
  },
  async ({ step }) => {
    const organizationIds = await step.run(
      "list-organizations",
      listWorkerOrganizationIds,
    );
    const results = [];
    for (const organizationId of organizationIds)
      results.push(
        await step.run(`publish-${organizationId}`, () =>
          publishOrganizationOutbox(organizationId),
        ),
      );
    return results.reduce(
      (total, item) => ({
        published: total.published + item.published,
        failed: total.failed + item.failed,
      }),
      { published: 0, failed: 0 },
    );
  },
);
