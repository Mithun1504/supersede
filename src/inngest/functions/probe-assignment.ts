import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { probeAssignments, probeDeliveryEvents } from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { inngest } from "@/inngest/client";
import {
  beginWorkflow,
  finishWorkflow,
  recordWorkflowStep,
} from "@/modules/workflows";

const payloadSchema = z.object({
  organizationId: z.string().uuid(),
  actorMembershipId: z.string().uuid(),
  probeAssignmentId: z.string().uuid(),
  outboxEventId: z.string().uuid(),
});

export const probeAssignmentWorkflow = inngest.createFunction(
  {
    id: "probe-assignment-delivery-v1",
    name: "Deliver a governed probe assignment",
    triggers: { event: "probe.assigned" },
    retries: 4,
    concurrency: { limit: 5, key: "event.data.organizationId" },
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
        workflowName: "probe-assignment",
        subjectType: "probe_assignment",
        subjectId: payload.probeAssignmentId,
        totalSteps: 1,
      }),
    );
    try {
      await step.run("record-in-app-delivery", async () => {
        await withTenantContext(actor, async (transaction) => {
          const [assignment] = await transaction
            .select({ id: probeAssignments.id })
            .from(probeAssignments)
            .where(
              and(
                eq(probeAssignments.organizationId, actor.organizationId),
                eq(probeAssignments.id, payload.probeAssignmentId),
              ),
            )
            .limit(1);
          if (!assignment) throw new Error("Probe assignment was not found.");
          await transaction
            .insert(probeDeliveryEvents)
            .values({
              id: payload.outboxEventId,
              organizationId: actor.organizationId,
              assignmentId: assignment.id,
              status: "assigned",
              evidence: {
                adapter: "in_app_seeded_persona",
                simulated: true,
                outboxEventId: payload.outboxEventId,
              },
            })
            .onConflictDoNothing({ target: probeDeliveryEvents.id });
        });
        await recordWorkflowStep(actor, {
          workflowRunId,
          stepKey: "delivery",
          label: "Record in-app seeded-persona delivery evidence",
          status: "completed",
          detail: { simulated: true, adapter: "in_app_seeded_persona" },
        });
      });
      await step.run("project-workflow-complete", () =>
        finishWorkflow(actor, workflowRunId),
      );
      return { probeAssignmentId: payload.probeAssignmentId };
    } catch (error) {
      await finishWorkflow(actor, workflowRunId, error);
      throw error;
    }
  },
);
