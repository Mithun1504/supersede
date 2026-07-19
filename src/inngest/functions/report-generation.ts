import { z } from "zod";

import { inngest } from "@/inngest/client";
import { generateAuditReportBundle } from "@/modules/audit";
import {
  beginWorkflow,
  finishWorkflow,
  recordWorkflowStep,
} from "@/modules/workflows";

const payloadSchema = z.object({
  organizationId: z.string().uuid(),
  actorMembershipId: z.string().uuid(),
  changeEventId: z.string().uuid(),
  changeEventVersionId: z.string().uuid(),
  retentionMode: z.enum(["standard", "object_lock"]).default("standard"),
  retainUntil: z.iso.datetime().nullish(),
  cutoffAt: z.iso.datetime().optional(),
  outboxEventId: z.string().uuid(),
});

export const reportGenerationWorkflow = inngest.createFunction(
  {
    id: "report-generation-v1",
    name: "Generate and store a checksummed report bundle",
    triggers: { event: "report.requested" },
    retries: 4,
    concurrency: { limit: 2, key: "event.data.organizationId" },
  },
  async ({ event, step, runId }) => {
    const payload = payloadSchema.parse(event.data);
    const actor = {
      organizationId: payload.organizationId,
      actorMembershipId: payload.actorMembershipId,
    };
    const workflowRunId = await step.run("project-workflow-start", () =>
      beginWorkflow(actor, {
        externalRunId: runId,
        workflowName: "report-generation",
        subjectType: "change_event_version",
        subjectId: payload.changeEventVersionId,
        totalSteps: 1,
      }),
    );
    try {
      const result = await step.run("snapshot-render-hash-store", async () => {
        const generated = await generateAuditReportBundle(actor, {
          idempotencyKey: `report.generate:${payload.outboxEventId}`,
          changeEventId: payload.changeEventId,
          changeEventVersionId: payload.changeEventVersionId,
          retentionMode: payload.retentionMode,
          ...(payload.retainUntil ? { retainUntil: payload.retainUntil } : {}),
          ...(payload.cutoffAt ? { cutoffAt: payload.cutoffAt } : {}),
        });
        await recordWorkflowStep(actor, {
          workflowRunId,
          stepKey: "generate",
          label: "Snapshot, render, hash, and store immutable bundle",
          status: "completed",
          detail: generated,
        });
        return generated;
      });
      await step.run("project-workflow-complete", () =>
        finishWorkflow(actor, workflowRunId),
      );
      return result;
    } catch (error) {
      await finishWorkflow(actor, workflowRunId, error);
      throw error;
    }
  },
);
