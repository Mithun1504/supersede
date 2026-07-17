import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { notificationDeliveries } from "@/db/schema";
import { withOrganizationContext } from "@/db/tenant-context";
import { getServerEnv } from "@/lib/env/server";

const slackUser = z.object({
  ok: z.literal(true),
  user: z.object({ id: z.string() }),
});
const slackMessage = z.object({
  ok: z.literal(true),
  channel: z.string(),
  ts: z.string(),
});

type SlackCandidate = {
  id: string;
  email: string;
  title: string;
  body_summary: string;
  action_path: string;
  connection_id: string;
};

async function slackRequest(path: string, token: string, body?: object) {
  const response = await fetch(`https://slack.com/api/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const payload: unknown = await response.json();
  if (!response.ok || !(payload as { ok?: boolean }).ok)
    throw new Error(
      `Slack request failed: ${String((payload as { error?: unknown }).error ?? response.status)}`,
    );
  return payload;
}

export async function verifySlackConnection(): Promise<{
  teamId: string;
  team: string;
}> {
  const token = getServerEnv().SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN is not configured.");
  const result = z
    .object({ ok: z.literal(true), team_id: z.string(), team: z.string() })
    .parse(await slackRequest("auth.test", token));
  return { teamId: result.team_id, team: result.team };
}

export async function deliverOrganizationSlackNotifications(
  organizationId: string,
): Promise<{ delivered: number; failed: number; skipped: number }> {
  const token = getServerEnv().SLACK_BOT_TOKEN;
  if (!token) return { delivered: 0, failed: 0, skipped: 0 };
  const candidates = await withOrganizationContext(
    organizationId,
    async (transaction) =>
      (
        await transaction.execute<SlackCandidate>(sql`
          select n.id, coalesce(m.email, p.email) as email, n.title,
                 n.body_summary, n.action_path, ic.id as connection_id
          from notification n
          cross join lateral (
            select id from integration_connection
            where type = 'slack' and status = 'active'
            order by created_at limit 1
          ) ic
          left join notification_delivery nd
            on nd.notification_id = n.id and nd.channel = 'slack'
          left join membership m on m.id = n.membership_id and m.status = 'active'
          left join person p on p.id = n.person_id and p.status = 'active'
          where coalesce(m.email, p.email) is not null
            and (
              nd.id is null or (
                nd.status = 'failed' and nd.attempt_count < 5
                and nd.last_attempt_at <= now() - (least(60, power(2, nd.attempt_count))::text || ' minutes')::interval
              )
            )
            and not exists (
              select 1 from notification_preference pref
              where pref.notification_category in (n.type, '*')
                and pref.channel = 'slack' and pref.enabled = false
                and (pref.membership_id = n.membership_id or pref.person_id = n.person_id)
            )
          order by n.created_at limit 50
        `)
      ).rows,
  );
  let delivered = 0;
  let failed = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    const deliveryId = await withOrganizationContext(
      organizationId,
      async (transaction) => {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`notification-slack:${candidate.id}`}, 0))`,
        );
        const [existing] = await transaction
          .select({
            id: notificationDeliveries.id,
            status: notificationDeliveries.status,
            attemptCount: notificationDeliveries.attemptCount,
          })
          .from(notificationDeliveries)
          .where(
            and(
              eq(notificationDeliveries.notificationId, candidate.id),
              eq(notificationDeliveries.channel, "slack"),
            ),
          )
          .limit(1);
        if (existing) {
          if (existing.status !== "failed" || existing.attemptCount >= 5)
            return null;
          await transaction
            .update(notificationDeliveries)
            .set({
              status: "running",
              attemptCount: existing.attemptCount + 1,
              lastAttemptAt: new Date(),
              errorSummary: null,
            })
            .where(eq(notificationDeliveries.id, existing.id));
          return existing.id;
        }
        const [created] = await transaction
          .insert(notificationDeliveries)
          .values({
            organizationId,
            notificationId: candidate.id,
            channel: "slack",
            integrationConnectionId: candidate.connection_id,
            status: "running",
            attemptCount: 1,
            lastAttemptAt: new Date(),
          })
          .returning({ id: notificationDeliveries.id });
        return created?.id ?? null;
      },
    );
    if (!deliveryId) {
      skipped += 1;
      continue;
    }
    try {
      const user = slackUser.parse(
        await slackRequest(
          `users.lookupByEmail?email=${encodeURIComponent(candidate.email)}`,
          token,
        ),
      );
      const result = slackMessage.parse(
        await slackRequest("chat.postMessage", token, {
          channel: user.user.id,
          text: `${candidate.title}\n${candidate.body_summary}\n${getServerEnv().NEXT_PUBLIC_APP_URL}${candidate.action_path}`,
          unfurl_links: false,
          unfurl_media: false,
        }),
      );
      await withOrganizationContext(organizationId, async (transaction) =>
        transaction
          .update(notificationDeliveries)
          .set({
            status: "completed",
            providerMessageId: `${result.channel}:${result.ts}`,
            deliveredAt: new Date(),
            errorSummary: null,
          })
          .where(eq(notificationDeliveries.id, deliveryId)),
      );
      delivered += 1;
    } catch (error) {
      await withOrganizationContext(organizationId, async (transaction) =>
        transaction
          .update(notificationDeliveries)
          .set({
            status: "failed",
            errorSummary:
              error instanceof Error
                ? error.message.slice(0, 2_000)
                : "Unknown Slack error",
          })
          .where(eq(notificationDeliveries.id, deliveryId)),
      );
      failed += 1;
    }
  }
  return { delivered, failed, skipped };
}
