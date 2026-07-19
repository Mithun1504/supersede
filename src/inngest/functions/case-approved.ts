import { z } from "zod";

import { inngest } from "@/inngest/client";
import { releaseBlockedRechecksForApprovedCase } from "@/modules/learning";
import {
  beginWorkflow,
  finishWorkflow,
  recordWorkflowStep,
} from "@/modules/workflows";

export const caseApprovedPayloadSchema = z.object({
  organizationId: z.string().uuid(),
  actorMembershipId: z.string().uuid(),
  caseVersionId: z.string().uuid(),
});

export const caseApproved = inngest.createFunction(
  {
    id: "release-blocked-rechecks-on-case-approval",
    name: "Release blocked rechecks when a different case is approved",
    triggers: { event: "case.approved" },
    retries: 5,
  },
  async ({ event, step, runId }) => {
    const payload = caseApprovedPayloadSchema.parse(event.data);
    const actor = {
      organizationId: payload.organizationId,
      actorMembershipId: payload.actorMembershipId,
    };
    const workflowRunId = await step.run("project-workflow-start", () =>
      beginWorkflow(actor, {
        externalRunId: runId,
        workflowName: "case-approval",
        subjectType: "divergence_case_version",
        subjectId: payload.caseVersionId,
        totalSteps: 1,
      }),
    );
    try {
      const result = await step.run("release-blocked-rechecks", () =>
        releaseBlockedRechecksForApprovedCase(actor, {
          approvedCaseVersionId: payload.caseVersionId,
        }),
      );
      await step.run("project-case-approval-complete", async () => {
        await recordWorkflowStep(actor, {
          workflowRunId,
          stepKey: "release-rechecks",
          label: "Release eligible different-case rechecks",
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
