import { inngest } from "@/inngest/client";
import { logger } from "@/lib/observability/logger";

export const dueWorkDispatch = inngest.createFunction(
  {
    id: "due-work-dispatch",
    name: "Dispatch due work",
    triggers: { cron: "0 3 * * *" },
    retries: 3,
  },
  async ({ step }) => {
    return step.run("locate-due-work", () => {
      logger.info(
        { workflow: "due-work-dispatch" },
        "Due-work dispatcher is ready",
      );
      return { dispatched: 0, scaffold: true };
    });
  },
);
