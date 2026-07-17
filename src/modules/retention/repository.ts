import "server-only";

import { desc } from "drizzle-orm";

import {
  dataDispositionRuns,
  legalHolds,
  retentionPolicies,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

export async function getRetentionWorkspace(actor: CurrentActor) {
  authorize(actor, "retention.manage");
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [policies, holds, runs] = await Promise.all([
        transaction
          .select()
          .from(retentionPolicies)
          .orderBy(desc(retentionPolicies.createdAt)),
        transaction
          .select()
          .from(legalHolds)
          .orderBy(desc(legalHolds.createdAt)),
        transaction
          .select()
          .from(dataDispositionRuns)
          .orderBy(desc(dataDispositionRuns.createdAt))
          .limit(50),
      ]);
      return { policies, holds, runs };
    },
  );
}
