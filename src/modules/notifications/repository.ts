import "server-only";

import { and, desc, eq, isNull, or } from "drizzle-orm";

import { notificationPreferences, notifications, people } from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import type { CurrentActor } from "@/modules/identity/policy";

export async function listMyNotifications(actor: CurrentActor) {
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) =>
      transaction
        .select({
          id: notifications.id,
          title: notifications.title,
          bodySummary: notifications.bodySummary,
          actionPath: notifications.actionPath,
          readAt: notifications.readAt,
          createdAt: notifications.createdAt,
        })
        .from(notifications)
        .leftJoin(people, eq(people.id, notifications.personId))
        .where(
          and(
            isNull(notifications.dismissedAt),
            or(
              eq(notifications.membershipId, actor.membership.id),
              eq(people.membershipId, actor.membership.id),
            ),
          ),
        )
        .orderBy(desc(notifications.createdAt))
        .limit(100),
  );
}

export async function listMyNotificationPreferences(actor: CurrentActor) {
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) =>
      transaction
        .select({
          channel: notificationPreferences.channel,
          enabled: notificationPreferences.enabled,
        })
        .from(notificationPreferences)
        .where(
          and(
            eq(notificationPreferences.membershipId, actor.membership.id),
            eq(notificationPreferences.notificationCategory, "*"),
          ),
        ),
  );
}
