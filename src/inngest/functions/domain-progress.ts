import { z } from "zod";

import { inngest } from "@/inngest/client";
import {
  beginWorkflow,
  finishWorkflow,
  recordWorkflowStep,
} from "@/modules/workflows";

const baseSchema = z.object({
  organizationId: z.string().uuid(),
  actorMembershipId: z.string().uuid(),
});

function projectedDomainFunction(input: {
  id: string;
  name: string;
  event: string;
  workflowName: string;
  subjectType: string;
  subjectId: (data: Record<string, unknown>) => string;
  stepLabel: string;
}) {
  return inngest.createFunction(
    {
      id: input.id,
      name: input.name,
      triggers: { event: input.event },
      retries: 4,
    },
    async ({ event, step, runId }) => {
      const base = baseSchema.parse(event.data);
      const subjectId = z.string().uuid().parse(input.subjectId(event.data));
      const actor = {
        organizationId: base.organizationId,
        actorMembershipId: base.actorMembershipId,
      };
      const workflowRunId = await step.run("project-workflow-start", () =>
        beginWorkflow(actor, {
          externalRunId: runId,
          workflowName: input.workflowName,
          subjectType: input.subjectType,
          subjectId,
          totalSteps: 1,
        }),
      );
      await step.run("project-domain-transition", () =>
        recordWorkflowStep(actor, {
          workflowRunId,
          stepKey: "persisted",
          label: input.stepLabel,
          status: "completed",
          detail: { eventName: event.name },
        }),
      );
      await step.run("project-workflow-complete", () =>
        finishWorkflow(actor, workflowRunId),
      );
      return { workflowRunId, subjectId };
    },
  );
}

export const probeGradingWorkflow = projectedDomainFunction({
  id: "probe-response-grading-v1",
  name: "Grade and persist a probe response",
  event: "probe.completed",
  workflowName: "probe-grading",
  subjectType: "probe_assignment",
  subjectId: (data) => String(data.probeAssignmentId),
  stepLabel: "Response graded against the locked case",
});

export const remediationWorkflow = projectedDomainFunction({
  id: "remediation-and-recheck-v1",
  name: "Record remediation and plan rechecks",
  event: "remediation.passed",
  workflowName: "remediation",
  subjectType: "remediation_assignment",
  subjectId: (data) => String(data.remediationAssignmentId),
  stepLabel: "Remediation outcome and rechecks persisted",
});
