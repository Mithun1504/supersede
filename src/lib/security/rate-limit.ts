import "server-only";

import { sql } from "drizzle-orm";

import { apiRateLimitBuckets } from "@/db/schema";
import { type TenantContext, withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";

export const API_RATE_LIMITS = {
  aiTask: { scope: "ai_task", limit: 30, windowSeconds: 60 },
  extraction: { scope: "extraction", limit: 20, windowSeconds: 60 },
  uploadSign: { scope: "upload_sign", limit: 60, windowSeconds: 60 },
  uploadParse: { scope: "upload_parse", limit: 20, windowSeconds: 60 },
} as const;

type RateLimitPolicy = (typeof API_RATE_LIMITS)[keyof typeof API_RATE_LIMITS];

export async function consumeRateLimit(
  actor: TenantContext,
  policy: RateLimitPolicy,
  now = new Date(),
): Promise<void> {
  const windowStartedAt = new Date(
    Math.floor(now.getTime() / (policy.windowSeconds * 1_000)) *
      policy.windowSeconds *
      1_000,
  );

  const result = await withTenantContext(actor, (transaction) =>
    transaction.execute<{ request_count: number }>(sql`
      insert into ${apiRateLimitBuckets} (
        organization_id,
        actor_membership_id,
        scope,
        window_started_at,
        request_count,
        updated_at
      ) values (
        ${actor.organizationId},
        ${actor.actorMembershipId},
        ${policy.scope},
        ${windowStartedAt},
        1,
        ${now}
      )
      on conflict (organization_id, actor_membership_id, scope)
      do update set
        window_started_at = case
          when api_rate_limit_bucket.window_started_at < ${windowStartedAt}
          then ${windowStartedAt}
          else api_rate_limit_bucket.window_started_at
        end,
        request_count = case
          when api_rate_limit_bucket.window_started_at < ${windowStartedAt}
          then 1
          else api_rate_limit_bucket.request_count + 1
        end,
        updated_at = ${now}
      where api_rate_limit_bucket.window_started_at < ${windowStartedAt}
         or api_rate_limit_bucket.request_count < ${policy.limit}
      returning request_count
    `),
  );

  if (!result.rows[0]) {
    const elapsedSeconds = Math.floor(
      (now.getTime() - windowStartedAt.getTime()) / 1_000,
    );
    throw new AppError({
      code: "RATE_LIMITED",
      message: "Request limit reached. Try again after the current window.",
      status: 429,
      retryAfterSeconds: Math.max(1, policy.windowSeconds - elapsedSeconds),
    });
  }
}
