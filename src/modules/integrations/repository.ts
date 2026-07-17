import "server-only";

import { desc } from "drizzle-orm";

import { integrationConnections, integrationJobs } from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

export async function getIntegrationWorkspace(actor: CurrentActor) {
  authorize(actor, "integration.manage");
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [connections, jobs] = await Promise.all([
        transaction
          .select()
          .from(integrationConnections)
          .orderBy(desc(integrationConnections.createdAt)),
        transaction
          .select()
          .from(integrationJobs)
          .orderBy(desc(integrationJobs.createdAt))
          .limit(50),
      ]);
      return { connections, jobs };
    },
  );
}
