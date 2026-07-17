import "server-only";

import { sql } from "drizzle-orm";

import { getDatabase, type Database } from "@/db/client";
import { AppError } from "@/lib/errors/app-error";

export type TenantContext = {
  organizationId: string;
  actorMembershipId: string;
};

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function resolveActorContext({
  workosOrganizationId,
  workosUserId,
}: {
  workosOrganizationId: string;
  workosUserId: string;
}): Promise<TenantContext> {
  const result = await getDatabase().execute<{
    organization_id: string;
    membership_id: string;
  }>(
    sql`select * from app.resolve_actor(${workosOrganizationId}, ${workosUserId})`,
  );

  const actor = result.rows[0];

  if (!actor) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "No active organization membership was found.",
      status: 403,
    });
  }

  return {
    organizationId: actor.organization_id,
    actorMembershipId: actor.membership_id,
  };
}

export async function withTenantContext<T>(
  context: TenantContext,
  operation: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  return getDatabase().transaction(async (transaction) => {
    await transaction.execute(
      sql`select set_config('app.organization_id', ${context.organizationId}, true)`,
    );
    await transaction.execute(
      sql`select set_config('app.actor_membership_id', ${context.actorMembershipId}, true)`,
    );

    return operation(transaction);
  });
}

export async function resolveWebhookOrganization(
  workosOrganizationId: string,
): Promise<string | null> {
  const result = await getDatabase().execute<{ organization_id: string }>(
    sql`select app.resolve_webhook_organization(${workosOrganizationId}) as organization_id`,
  );
  return result.rows[0]?.organization_id ?? null;
}

export async function withOrganizationContext<T>(
  organizationId: string,
  operation: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  return getDatabase().transaction(async (transaction) => {
    await transaction.execute(
      sql`select set_config('app.organization_id', ${organizationId}, true)`,
    );
    await transaction.execute(
      sql`select set_config('app.actor_membership_id', '', true)`,
    );
    return operation(transaction);
  });
}
