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
  email,
  displayName,
}: {
  workosOrganizationId: string;
  workosUserId: string;
  email: string;
  displayName: string;
}): Promise<TenantContext> {
  const database = getDatabase();
  const existing = await database.execute<{
    organization_id: string;
    membership_id: string;
  }>(
    sql`select * from app.resolve_actor(${workosOrganizationId}, ${workosUserId})`,
  );

  const actor =
    existing.rows[0] ??
    (
      await database.execute<{
        organization_id: string;
        membership_id: string;
      }>(sql`
        select * from app.provision_walkthrough_actor(
          ${workosOrganizationId},
          ${workosUserId},
          ${email},
          ${displayName}
        )
      `)
    ).rows[0];

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

export async function resolvePublicWalkthroughContext(): Promise<TenantContext> {
  const result = await getDatabase().execute<{
    organization_id: string;
    membership_id: string;
  }>(sql`select * from app.resolve_public_walkthrough()`);
  const actor = result.rows[0];

  if (!actor) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "No public walkthrough workspace is available.",
      status: 404,
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
