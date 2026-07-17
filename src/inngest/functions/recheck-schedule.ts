import { inngest } from "@/inngest/client";
import { dispatchRecheck } from "@/modules/learning/rechecks";

export const recheckSchedule = inngest.createFunction(
  {
    id: "recheck-schedule-v1",
    name: "Dispatch 30/90-day rechecks",
    retries: 5,
    triggers: { event: "remediation/passed" },
  },
  async ({ event, step }) => {
    const data = event.data as {
      organizationId: string;
      actorMembershipId: string;
      remediationAssignmentId: string;
      passedAt: string;
    };
    const passedAt = new Date(data.passedAt).getTime();
    await step.sleepUntil(
      "wait-until-30-day-recheck",
      new Date(passedAt + 30 * 86_400_000),
    );
    await step.run("dispatch-30-day-recheck", () =>
      dispatchRecheck({ ...data, intervalDays: 30 }),
    );
    await step.sleepUntil(
      "wait-until-90-day-recheck",
      new Date(passedAt + 90 * 86_400_000),
    );
    return step.run("dispatch-90-day-recheck", () =>
      dispatchRecheck({ ...data, intervalDays: 90 }),
    );
  },
);
