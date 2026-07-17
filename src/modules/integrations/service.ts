import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { integrationConnections } from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { recordMembershipEvent } from "@/modules/audit/service";
import { authorize, type CurrentActor } from "@/modules/identity/policy";
import { verifySlackConnection } from "@/modules/notifications/slack";

export async function configureIntegration(
  actor: CurrentActor,
  input: { type: "slack" | "lms_xapi" | "hris_csv"; name: string },
) {
  authorize(actor, "integration.manage");
  const verification =
    input.type === "slack" ? await verifySlackConnection() : null;
  await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`integration:${actor.organization.id}:${input.type}`}, 0))`,
      );
      await transaction
        .update(integrationConnections)
        .set({ status: "disabled" })
        .where(
          and(
            eq(integrationConnections.type, input.type),
            eq(integrationConnections.status, "active"),
          ),
        );
      const [connection] = await transaction
        .insert(integrationConnections)
        .values({
          organizationId: actor.organization.id,
          type: input.type,
          name: input.name,
          status: "active",
          externalAccountId: verification?.teamId ?? null,
          credentialReference:
            input.type === "slack" ? "env:SLACK_BOT_TOKEN" : null,
          configuration: verification
            ? { workspaceName: verification.team }
            : input.type === "lms_xapi"
              ? { statementVersion: "1.0.3" }
              : { format: "csv", mode: "snapshot_or_upsert" },
          lastVerifiedAt: new Date(),
          createdByMembershipId: actor.membership.id,
        })
        .returning({ id: integrationConnections.id });
      if (!connection) throw new Error("Integration insert returned no row.");
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "integration.activated",
        objectType: "integration_connection",
        objectId: connection.id,
        payload: { type: input.type },
      });
    },
  );
}

export async function disableIntegration(
  actor: CurrentActor,
  connectionId: string,
) {
  authorize(actor, "integration.manage");
  await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [connection] = await transaction
        .update(integrationConnections)
        .set({ status: "disabled" })
        .where(eq(integrationConnections.id, connectionId))
        .returning({
          id: integrationConnections.id,
          type: integrationConnections.type,
        });
      if (!connection)
        throw new AppError({
          code: "NOT_FOUND",
          message: "Integration connection not found.",
          status: 404,
        });
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "integration.disabled",
        objectType: "integration_connection",
        objectId: connection.id,
        payload: { type: connection.type },
      });
    },
  );
}
