import { z } from "zod";

import { inngest } from "@/inngest/client";
import { runPropagationForOrganization } from "@/modules/changes/propagation";
import {
  beginWorkflow,
  finishWorkflow,
  recordWorkflowStep,
} from "@/modules/workflows";

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
  async ({ event, step, runId }) => {
    const payload = changeValidatedPayloadSchema.parse(event.data);
    const actor = {
      organizationId: payload.organizationId,
      actorMembershipId: payload.actorMembershipId,
    };
    const workflowRunId = await step.run("project-workflow-start", () =>
      beginWorkflow(actor, {
        externalRunId: runId,
        workflowName: "change-propagation",
        subjectType: "change_event_version",
        subjectId: payload.changeEventVersionId,
        totalSteps: 1,
      }),
    );
    try {
      const result = await step.run("walk-reviewed-graph", () =>
        runPropagationForOrganization(actor, payload.changeEventVersionId),
      );
      await step.run("project-propagation-complete", async () => {
        await recordWorkflowStep(actor, {
          workflowRunId,
          stepKey: "propagate",
          label: "Walk reviewed graph and persist impacts",
          status: "completed",
          detail: result,
        });
        await finishWorkflow(actor, workflowRunId);
      });
      return result;
    } catch (error) {
      await finishWorkflow(actor, workflowRunId, error);
      throw error;
    }
  },
);
