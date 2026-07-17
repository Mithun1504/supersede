import "server-only";

import { timingSafeEqual } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import {
  notificationDeliveries,
  notifications,
  probeDeliveryEvents,
} from "@/db/schema";
import { getDatabase } from "@/db/client";
import { withOrganizationContext } from "@/db/tenant-context";
import { getServerEnv } from "@/lib/env/server";

const postmarkResponse = z.object({
  MessageID: z.string().min(1),
  ErrorCode: z.number().int(),
  Message: z.string(),
});

type EmailCandidate = {
  id: string;
  email: string;
  title: string;
  body_summary: string;
  action_path: string;
};

export async function deliverOrganizationEmailNotifications(
  organizationId: string,
): Promise<{ delivered: number; failed: number; skipped: number }> {
  const env = getServerEnv();
  if (!env.POSTMARK_SERVER_TOKEN || !env.POSTMARK_FROM_EMAIL)
    return { delivered: 0, failed: 0, skipped: 0 };
  const candidates = await withOrganizationContext(
    organizationId,
    async (transaction) =>
      (
        await transaction.execute<EmailCandidate>(sql`
          select n.id, coalesce(m.email, p.email) as email, n.title,
                 n.body_summary, n.action_path
          from notification n
          left join notification_delivery nd
            on nd.notification_id = n.id and nd.channel = 'email'
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
                and pref.channel = 'email'
                and pref.enabled = false
                and (pref.membership_id = n.membership_id or pref.person_id = n.person_id)
            )
          order by n.created_at
          limit 100
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
          sql`select pg_advisory_xact_lock(hashtextextended(${`notification-email:${candidate.id}`}, 0))`,
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
              eq(notificationDeliveries.channel, "email"),
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
            channel: "email",
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
      const response = await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Postmark-Server-Token": env.POSTMARK_SERVER_TOKEN,
        },
        body: JSON.stringify({
          From: env.POSTMARK_FROM_EMAIL,
          To: candidate.email,
          Subject: candidate.title,
          TextBody: `${candidate.body_summary}\n\n${env.NEXT_PUBLIC_APP_URL}${candidate.action_path}`,
          MessageStream: "outbound",
          TrackOpens: false,
          TrackLinks: "None",
          Metadata: { notificationId: candidate.id, organizationId },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const result = postmarkResponse.parse(await response.json());
      if (!response.ok || result.ErrorCode !== 0)
        throw new Error(result.Message);
      await withOrganizationContext(organizationId, async (transaction) =>
        transaction
          .update(notificationDeliveries)
          .set({
            status: "completed",
            providerMessageId: result.MessageID,
            deliveredAt: null,
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
                : "Unknown Postmark error",
          })
          .where(eq(notificationDeliveries.id, deliveryId)),
      );
      failed += 1;
    }
  }
  return { delivered, failed, skipped };
}

export function verifyPostmarkBasicAuth(header: string | null): boolean {
  const secret = getServerEnv().POSTMARK_WEBHOOK_SECRET;
  if (!secret || !header?.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const actual = Buffer.from(decoded);
    const expected = Buffer.from(`supersede:${secret}`);
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}

const webhookSchema = z.object({
  RecordType: z.enum(["Delivery", "Bounce"]),
  MessageID: z.string().min(1),
  Description: z.string().optional(),
  DeliveredAt: z.string().datetime().optional(),
  BouncedAt: z.string().datetime().optional(),
});

export async function processPostmarkWebhook(
  payload: unknown,
): Promise<"processed" | "unknown"> {
  const event = webhookSchema.parse(payload);
  const resolution = await getDatabase().execute<{
    organization_id: string;
    notification_delivery_id: string;
  }>(sql`select * from app.resolve_notification_delivery(${event.MessageID})`);
  const resolved = resolution.rows[0];
  if (!resolved) return "unknown";
  await withOrganizationContext(
    resolved.organization_id,
    async (transaction) => {
      const [delivery] = await transaction
        .select({
          id: notificationDeliveries.id,
          notificationId: notificationDeliveries.notificationId,
          objectType: notifications.objectType,
          objectId: notifications.objectId,
        })
        .from(notificationDeliveries)
        .innerJoin(
          notifications,
          eq(notifications.id, notificationDeliveries.notificationId),
        )
        .where(eq(notificationDeliveries.id, resolved.notification_delivery_id))
        .limit(1);
      if (!delivery) return;
      const deliveredAt = event.DeliveredAt
        ? new Date(event.DeliveredAt)
        : new Date();
      await transaction
        .update(notificationDeliveries)
        .set({
          status: event.RecordType === "Delivery" ? "completed" : "unsupported",
          deliveredAt: event.RecordType === "Delivery" ? deliveredAt : null,
          errorSummary:
            event.RecordType === "Bounce"
              ? (event.Description ?? "Email bounced")
              : null,
        })
        .where(eq(notificationDeliveries.id, delivery.id));
      if (delivery.objectType === "probe_assignment" && delivery.objectId)
        await transaction
          .insert(probeDeliveryEvents)
          .values({
            organizationId: resolved.organization_id,
            probeAssignmentId: delivery.objectId,
            eventType:
              event.RecordType === "Delivery" ? "delivered" : "bounced",
            channel: "email",
            providerEventId: `${event.MessageID}:${event.RecordType}`,
            providerTimestamp: event.DeliveredAt
              ? new Date(event.DeliveredAt)
              : event.BouncedAt
                ? new Date(event.BouncedAt)
                : new Date(),
            metadata: event.Description
              ? { description: event.Description.slice(0, 500) }
              : {},
          })
          .onConflictDoNothing();
    },
  );
  return "processed";
}
