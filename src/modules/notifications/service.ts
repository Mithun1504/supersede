import "server-only";

import { and, eq, or } from "drizzle-orm";

import { notificationPreferences, notifications, people } from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import type { CurrentActor } from "@/modules/identity/policy";
import { recordMembershipEvent } from "@/modules/audit/service";

export async function markNotificationRead(
  actor: CurrentActor,
  notificationId: string,
) {
  await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [owned] = await transaction
        .select({ id: notifications.id })
        .from(notifications)
        .leftJoin(people, eq(people.id, notifications.personId))
        .where(
          and(
            eq(notifications.id, notificationId),
            or(
              eq(notifications.membershipId, actor.membership.id),
              eq(people.membershipId, actor.membership.id),
            ),
          ),
        )
        .limit(1);
      if (!owned)
        throw new AppError({
          code: "NOT_FOUND",
          message: "The notification was not found.",
          status: 404,
        });
      await transaction
        .update(notifications)
        .set({ readAt: new Date() })
        .where(eq(notifications.id, owned.id));
    },
  );
}

export async function setNotificationChannelPreference(
  actor: CurrentActor,
  channel: "email" | "slack",
  enabled: boolean,
) {
  await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [linkedPerson] = await transaction
        .select({ id: people.id })
        .from(people)
        .where(eq(people.membershipId, actor.membership.id))
        .limit(1);
      const recipients: Array<{ membershipId?: string; personId?: string }> = [
        { membershipId: actor.membership.id },
        ...(linkedPerson ? [{ personId: linkedPerson.id }] : []),
      ];
      for (const recipient of recipients) {
        const recipientCondition = recipient.membershipId
          ? eq(notificationPreferences.membershipId, recipient.membershipId)
          : eq(notificationPreferences.personId, recipient.personId!);
        const [existing] = await transaction
          .select({ id: notificationPreferences.id })
          .from(notificationPreferences)
          .where(
            and(
              recipientCondition,
              eq(notificationPreferences.notificationCategory, "*"),
              eq(notificationPreferences.channel, channel),
            ),
          )
          .limit(1);
        if (existing)
          await transaction
            .update(notificationPreferences)
            .set({ enabled, digestMode: enabled ? "immediate" : "none" })
            .where(eq(notificationPreferences.id, existing.id));
        else
          await transaction.insert(notificationPreferences).values({
            organizationId: actor.organization.id,
            ...recipient,
            notificationCategory: "*",
            channel,
            enabled,
            digestMode: enabled ? "immediate" : "none",
          });
      }
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "notification.preference_updated",
        objectType: "membership",
        objectId: actor.membership.id,
        payload: { channel, enabled },
      });
    },
  );
}
