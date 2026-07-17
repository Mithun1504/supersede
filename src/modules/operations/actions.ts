"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { outboxEvents } from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { recordMembershipEvent } from "@/modules/audit/service";
import { authorize, requireCurrentActor } from "@/modules/identity/policy";

const inputSchema = z.object({ outboxEventId: z.string().uuid() });

export async function retryOutboxAction(formData: FormData) {
  const actor = await requireCurrentActor();
  authorize(actor, "operations.retry");
  const input = inputSchema.parse(Object.fromEntries(formData));
  await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [event] = await transaction
        .update(outboxEvents)
        .set({ status: "pending", availableAt: new Date(), lastError: null })
        .where(
          and(
            eq(outboxEvents.id, input.outboxEventId),
            inArray(outboxEvents.status, ["failed", "pending"]),
          ),
        )
        .returning({ id: outboxEvents.id });
      if (event)
        await recordMembershipEvent(transaction, {
          organizationId: actor.organization.id,
          actorMembershipId: actor.membership.id,
          eventType: "operations.outbox_retry_requested",
          objectType: "outbox_event",
          objectId: event.id,
        });
    },
  );
  revalidatePath("/app/operations");
}
