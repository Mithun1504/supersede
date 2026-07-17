import "server-only";

import { randomUUID } from "node:crypto";

import type { Database } from "@/db/client";
import { auditEvents, outboxEvents } from "@/db/schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function recordMembershipEvent(
  transaction: Transaction,
  input: {
    organizationId: string;
    actorMembershipId: string;
    eventType: string;
    objectType: string;
    objectId: string;
    objectVersionId?: string;
    requestId?: string;
    payload?: Record<string, unknown>;
    publish?: {
      eventName: string;
      payload: Record<string, unknown>;
    };
  },
): Promise<void> {
  await transaction.insert(auditEvents).values({
    organizationId: input.organizationId,
    actorType: "membership",
    actorMembershipId: input.actorMembershipId,
    eventType: input.eventType,
    objectType: input.objectType,
    objectId: input.objectId,
    ...(input.objectVersionId
      ? { objectVersionId: input.objectVersionId }
      : {}),
    ...(input.requestId ? { requestId: input.requestId } : {}),
    payload: input.payload ?? {},
  });

  if (input.publish) {
    await transaction.insert(outboxEvents).values({
      organizationId: input.organizationId,
      eventName: input.publish.eventName,
      aggregateType: input.objectType,
      aggregateId: input.objectId,
      idempotencyKey: `${input.publish.eventName}:${input.objectId}:${randomUUID()}`,
      payload: input.publish.payload,
    });
  }
}
