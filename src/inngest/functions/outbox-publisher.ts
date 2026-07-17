import { sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { inngest } from "@/inngest/client";

const BATCH_SIZE = 50;

export async function publishOutboxBatch(now = new Date()) {
  const database = getDatabase();
  const claimed = await database.execute<{
    id: string;
    organization_id: string;
    event_name: string;
    payload: Record<string, unknown>;
    attempts: number;
  }>(sql`select * from app.claim_outbox_events(${BATCH_SIZE}, ${300})`);

  let published = 0;
  for (const event of claimed.rows) {
    try {
      await inngest.send({
        id: event.id,
        name: event.event_name,
        data: {
          ...event.payload,
          organizationId: event.organization_id,
          outboxEventId: event.id,
        },
      });
      await database.execute(
        sql`select app.mark_outbox_event_published(${event.id})`,
      );
      published += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown publish error";
      const retryAfterSeconds = Math.min(3_600, 2 ** event.attempts * 60);
      await database.execute(
        sql`select app.release_outbox_event(
          ${event.id},
          ${message},
          ${retryAfterSeconds},
          ${event.attempts >= 10}
        )`,
      );
    }
  }

  return { selected: claimed.rows.length, published, at: now.toISOString() };
}

export const outboxPublisher = inngest.createFunction(
  {
    id: "outbox-publisher",
    name: "Publish transactional outbox",
    triggers: { cron: "*/1 * * * *" },
    retries: 2,
  },
  async ({ step }) =>
    step.run("publish-outbox-batch", () => publishOutboxBatch()),
);
