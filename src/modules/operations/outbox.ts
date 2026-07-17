import "server-only";

import { and, asc, eq, inArray, lt, lte, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { outboxEvents } from "@/db/schema";
import { withOrganizationContext } from "@/db/tenant-context";
import { inngest } from "@/inngest/client";

export async function listWorkerOrganizationIds(): Promise<string[]> {
  const result = await getDatabase().execute<{ organization_id: string }>(
    sql`select organization_id from app.active_organization_ids()`,
  );
  return result.rows.map((row) => row.organization_id);
}

export async function publishOrganizationOutbox(organizationId: string) {
  const events = await withOrganizationContext(
    organizationId,
    async (transaction) =>
      transaction
        .select({
          id: outboxEvents.id,
          eventName: outboxEvents.eventName,
          payload: outboxEvents.payload,
          attempts: outboxEvents.attempts,
        })
        .from(outboxEvents)
        .where(
          and(
            inArray(outboxEvents.status, ["pending", "failed"]),
            lte(outboxEvents.availableAt, new Date()),
            lt(outboxEvents.attempts, 10),
          ),
        )
        .orderBy(asc(outboxEvents.createdAt))
        .limit(100),
  );
  let published = 0;
  let failed = 0;
  for (const event of events) {
    try {
      await inngest.send({ name: event.eventName, data: event.payload });
      await withOrganizationContext(organizationId, async (transaction) =>
        transaction
          .update(outboxEvents)
          .set({
            status: "published",
            attempts: event.attempts + 1,
            publishedAt: new Date(),
            lastError: null,
          })
          .where(eq(outboxEvents.id, event.id)),
      );
      published += 1;
    } catch (error) {
      const attempts = event.attempts + 1;
      await withOrganizationContext(organizationId, async (transaction) =>
        transaction
          .update(outboxEvents)
          .set({
            status: "failed",
            attempts,
            availableAt: new Date(
              Date.now() + Math.min(3_600_000, 2 ** attempts * 1_000),
            ),
            lastError:
              error instanceof Error
                ? error.message.slice(0, 2_000)
                : "Unknown publisher failure",
          })
          .where(eq(outboxEvents.id, event.id)),
      );
      failed += 1;
    }
  }
  return { published, failed };
}
