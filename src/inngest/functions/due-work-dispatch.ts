import { inngest } from "@/inngest/client";
import { dispatchDueRechecks } from "@/modules/learning";

export const dueWorkDispatch = inngest.createFunction(
  {
    id: "due-work-dispatch",
    name: "Dispatch due work",
    triggers: { cron: "0 3 * * *" },
    retries: 3,
  },
  async ({ step }) => {
    return step.run("dispatch-due-rechecks", () => dispatchDueRechecks());
  },
);
