import "server-only";

import { createHash } from "node:crypto";

import { WorkOS, type Event, type User } from "@workos-inc/node";
import { and, eq, isNull } from "drizzle-orm";

import {
  auditEvents,
  idempotencyRecords,
  membershipRoles,
  memberships,
  people,
} from "@/db/schema";
import {
  resolveWebhookOrganization,
  withOrganizationContext,
} from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { requireEnv } from "@/lib/env/server";

function workosClient(): WorkOS {
  return new WorkOS(requireEnv("WORKOS_API_KEY"), {
    clientId: requireEnv("WORKOS_CLIENT_ID"),
  });
}

export async function verifyWorkOSWebhook(
  payload: string,
  signature: string,
): Promise<Event> {
  try {
    return await workosClient().webhooks.constructEvent({
      payload,
      sigHeader: signature,
      secret: requireEnv("WORKOS_WEBHOOK_SECRET"),
    });
  } catch (error) {
    throw new AppError({
      code: "UNAUTHENTICATED",
      message: "The webhook signature is invalid.",
      status: 401,
      cause: error,
    });
  }
}

type MembershipEvent = Extract<
  Event,
  {
    event:
      | "organization_membership.created"
      | "organization_membership.updated"
      | "organization_membership.deleted";
  }
>;

function isMembershipEvent(event: Event): event is MembershipEvent {
  return (
    event.event === "organization_membership.created" ||
    event.event === "organization_membership.updated" ||
    event.event === "organization_membership.deleted"
  );
}

function displayName(user: User): string {
  const composedName = [user.firstName, user.lastName]
    .filter(Boolean)
    .join(" ");
  return user.name || composedName || user.email;
}

export async function processWorkOSIdentityEvent(
  event: Event,
  rawPayload: string,
): Promise<"processed" | "duplicate" | "ignored"> {
  if (!isMembershipEvent(event)) return "ignored";

  const organizationId = await resolveWebhookOrganization(
    event.data.organizationId,
  );
  if (!organizationId) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "The webhook organization has not been provisioned.",
      status: 404,
    });
  }

  const user = await workosClient().userManagement.getUser(event.data.userId);
  const payloadSha256 = createHash("sha256").update(rawPayload).digest("hex");

  return withOrganizationContext(organizationId, async (transaction) => {
    const [claim] = await transaction
      .insert(idempotencyRecords)
      .values({
        organizationId,
        principalType: "system",
        principalId: organizationId,
        routeKey: "webhook:workos:identity",
        idempotencyKey: event.id,
        requestSha256: payloadSha256,
        lockedUntil: new Date(Date.now() + 5 * 60 * 1000),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      })
      .onConflictDoNothing()
      .returning({ id: idempotencyRecords.id });

    if (!claim) return "duplicate";

    const status =
      event.event === "organization_membership.deleted"
        ? "deprovisioned"
        : event.data.status === "active"
          ? "active"
          : event.data.status === "pending"
            ? "invited"
            : "suspended";

    const [membership] = await transaction
      .insert(memberships)
      .values({
        organizationId,
        workosUserId: user.id,
        email: user.email,
        displayName: displayName(user),
        status,
      })
      .onConflictDoUpdate({
        target: [memberships.organizationId, memberships.workosUserId],
        set: {
          email: user.email,
          displayName: displayName(user),
          status,
          updatedAt: new Date(),
        },
      })
      .returning({ id: memberships.id });

    if (!membership) {
      throw new AppError({
        code: "INTERNAL_ERROR",
        message: "Membership synchronization returned no record.",
        status: 500,
      });
    }

    if (status === "deprovisioned") {
      await transaction
        .update(membershipRoles)
        .set({
          revokedAt: new Date(),
          revokedByMembershipId: membership.id,
          revocationReason: "Identity provider membership deleted",
        })
        .where(
          and(
            eq(membershipRoles.membershipId, membership.id),
            isNull(membershipRoles.revokedAt),
          ),
        );
    }

    const [matchingPerson] = await transaction
      .select({ id: people.id, membershipId: people.membershipId })
      .from(people)
      .where(eq(people.email, user.email))
      .limit(1);
    if (
      matchingPerson &&
      (!matchingPerson.membershipId ||
        matchingPerson.membershipId === membership.id)
    ) {
      await transaction
        .update(people)
        .set({
          membershipId: membership.id,
          status: status === "deprovisioned" ? "deprovisioned" : "active",
          deprovisionedAt: status === "deprovisioned" ? new Date() : null,
        })
        .where(eq(people.id, matchingPerson.id));
    }

    await transaction.insert(auditEvents).values({
      organizationId,
      actorType: "system",
      eventType: `identity.${event.event}`,
      objectType: "membership",
      objectId: membership.id,
      payload: {
        workosEventId: event.id,
        status,
        directoryManaged: event.data.directoryManaged,
      },
    });

    await transaction
      .update(idempotencyRecords)
      .set({
        statusCode: 204,
        responseHeaders: {},
        responseBody: { processed: true },
        objectType: "membership",
        objectId: membership.id,
        completedAt: new Date(),
        lockedUntil: new Date(),
      })
      .where(eq(idempotencyRecords.id, claim.id));

    return "processed";
  });
}
