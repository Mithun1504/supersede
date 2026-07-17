import "server-only";

import { desc, inArray, sql } from "drizzle-orm";

import { aiModelRuns, outboxEvents, workflowRuns } from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

export async function getOperationsWorkspace(actor: CurrentActor) {
  authorize(actor, "operations.read");
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [workflows, modelRuns, outbox, usage] = await Promise.all([
        transaction
          .select()
          .from(workflowRuns)
          .orderBy(desc(workflowRuns.createdAt))
          .limit(100),
        transaction
          .select({
            id: aiModelRuns.id,
            taskType: aiModelRuns.taskType,
            status: aiModelRuns.status,
            inputTokens: aiModelRuns.inputTokens,
            outputTokens: aiModelRuns.outputTokens,
            latencyMs: aiModelRuns.latencyMs,
            errorCode: aiModelRuns.errorCode,
          })
          .from(aiModelRuns)
          .orderBy(desc(aiModelRuns.createdAt))
          .limit(100),
        transaction
          .select()
          .from(outboxEvents)
          .where(inArray(outboxEvents.status, ["pending", "failed"]))
          .orderBy(desc(outboxEvents.createdAt))
          .limit(100),
        transaction.execute<{ cost_minor: string }>(sql`
          select coalesce(sum(cost_minor), 0)::text as cost_minor
          from usage_event
          where occurred_at >= date_trunc('month', now())
        `),
      ]);
      return {
        workflows,
        modelRuns,
        outbox,
        costMinor: Number(usage.rows[0]?.cost_minor ?? 0),
      };
    },
  );
}
