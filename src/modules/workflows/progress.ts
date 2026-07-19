import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { workflowRuns, workflowSteps } from "@/db/schema";
import { type TenantContext, withTenantContext } from "@/db/tenant-context";

const workflowStatusSchema = z.enum([
  "queued",
  "running",
  "partial",
  "failed",
  "completed",
  "quota_paused",
]);

export async function beginWorkflow(
  actor: TenantContext,
  input: {
    externalRunId: string;
    workflowName: string;
    subjectType: string;
    subjectId: string;
    totalSteps: number;
  },
) {
  return withTenantContext(actor, async (transaction) => {
    const [created] = await transaction
      .insert(workflowRuns)
      .values({
        organizationId: actor.organizationId,
        externalRunId: input.externalRunId,
        workflowName: input.workflowName,
        subjectType: input.subjectType,
        subjectId: z.string().uuid().parse(input.subjectId),
        status: "running",
        progressCurrent: 0,
        progressTotal: input.totalSteps,
        startedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [workflowRuns.organizationId, workflowRuns.externalRunId],
        set: {
          status: "running",
          errorCode: null,
          errorSummary: null,
          progressCurrent: 0,
          progressTotal: input.totalSteps,
          startedAt: new Date(),
          completedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: workflowRuns.id });
    if (!created) throw new Error("Workflow projection could not be created.");
    return created.id;
  });
}

export async function recordWorkflowStep(
  actor: TenantContext,
  input: {
    workflowRunId: string;
    stepKey: string;
    label: string;
    status: z.infer<typeof workflowStatusSchema>;
    detail?: Record<string, unknown>;
  },
) {
  const status = workflowStatusSchema.parse(input.status);
  return withTenantContext(actor, async (transaction) => {
    await transaction
      .insert(workflowSteps)
      .values({
        organizationId: actor.organizationId,
        workflowRunId: input.workflowRunId,
        stepKey: input.stepKey,
        label: input.label,
        status,
        detail: input.detail ?? {},
        startedAt: new Date(),
        ...(status === "completed" || status === "failed"
          ? { completedAt: new Date() }
          : {}),
      })
      .onConflictDoUpdate({
        target: [workflowSteps.workflowRunId, workflowSteps.stepKey],
        set: {
          label: input.label,
          status,
          detail: input.detail ?? {},
          ...(status === "completed" || status === "failed"
            ? { completedAt: new Date() }
            : {}),
          updatedAt: new Date(),
        },
      });
    const completed = await transaction
      .select({ id: workflowSteps.id })
      .from(workflowSteps)
      .where(
        and(
          eq(workflowSteps.workflowRunId, input.workflowRunId),
          eq(workflowSteps.status, "completed"),
        ),
      );
    await transaction
      .update(workflowRuns)
      .set({ progressCurrent: completed.length, updatedAt: new Date() })
      .where(eq(workflowRuns.id, input.workflowRunId));
  });
}

export async function finishWorkflow(
  actor: TenantContext,
  workflowRunId: string,
  error?: unknown,
) {
  const message =
    error instanceof Error ? error.message : error ? String(error) : null;
  return withTenantContext(actor, (transaction) =>
    transaction
      .update(workflowRuns)
      .set({
        status: message ? "failed" : "completed",
        ...(message
          ? {
              errorCode: "WORKFLOW_FAILED",
              errorSummary: message.slice(0, 2_000),
            }
          : { completedAt: new Date() }),
        updatedAt: new Date(),
      })
      .where(eq(workflowRuns.id, workflowRunId)),
  );
}

export async function listWorkflowProgress(actor: TenantContext) {
  return withTenantContext(actor, async (transaction) => {
    const runs = await transaction
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.organizationId, actor.organizationId))
      .orderBy(desc(workflowRuns.updatedAt))
      .limit(20);
    const steps = runs.length
      ? await transaction
          .select()
          .from(workflowSteps)
          .where(eq(workflowSteps.organizationId, actor.organizationId))
          .orderBy(workflowSteps.createdAt)
      : [];
    return runs.map((run) => ({
      ...run,
      steps: steps.filter((step) => step.workflowRunId === run.id),
    }));
  });
}
