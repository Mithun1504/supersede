import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { outboxEvents } from "@/db/schema";
import { AppError } from "@/lib/errors/app-error";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function findLearningEvent(
  transaction: Transaction,
  input: { organizationId: string; idempotencyKey: string; eventName: string },
) {
  const [existing] = await transaction
    .select({
      eventName: outboxEvents.eventName,
      payload: outboxEvents.payload,
    })
    .from(outboxEvents)
    .where(
      and(
        eq(outboxEvents.organizationId, input.organizationId),
        eq(outboxEvents.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  if (!existing) return null;
  if (existing.eventName !== input.eventName) {
    throw new AppError({
      code: "CONFLICT",
      message: "The idempotency key was already used for another operation.",
      status: 409,
    });
  }
  return existing.payload;
}

export async function reserveLearningEvent(
  transaction: Transaction,
  input: {
    organizationId: string;
    idempotencyKey: string;
    eventName: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
  },
) {
  const [event] = await transaction
    .insert(outboxEvents)
    .values(input)
    .onConflictDoNothing({
      target: [outboxEvents.organizationId, outboxEvents.idempotencyKey],
    })
    .returning({
      eventName: outboxEvents.eventName,
      payload: outboxEvents.payload,
    });
  if (event) return { duplicate: false, payload: event.payload };

  const [existing] = await transaction
    .select({
      eventName: outboxEvents.eventName,
      payload: outboxEvents.payload,
    })
    .from(outboxEvents)
    .where(
      and(
        eq(outboxEvents.organizationId, input.organizationId),
        eq(outboxEvents.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Idempotency reservation disappeared.");
  if (existing.eventName !== input.eventName) {
    throw new AppError({
      code: "CONFLICT",
      message: "The idempotency key was already used for another operation.",
      status: 409,
    });
  }
  return { duplicate: true, payload: existing.payload };
}
