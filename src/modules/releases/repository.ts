import "server-only";

import { asc, countDistinct, desc, eq } from "drizzle-orm";

import {
  changeEvents,
  changeEventVersions,
  releaseBatches,
  releaseCases,
  sources,
  workRoles,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

export async function getReleaseWorkspace(actor: CurrentActor) {
  authorize(actor, "release.prepare");
  if (actor.organization.productConfiguration !== "displace")
    throw new AppError({
      code: "NOT_FOUND",
      message: "Releases are not enabled for this workspace.",
      status: 404,
    });
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [changes, roles, batches] = await Promise.all([
        transaction
          .select({
            id: changeEventVersions.id,
            label: changeEventVersions.diffSummary,
            sourceTitle: sources.title,
          })
          .from(changeEventVersions)
          .innerJoin(
            changeEvents,
            eq(changeEvents.id, changeEventVersions.changeEventId),
          )
          .innerJoin(sources, eq(sources.id, changeEvents.sourceId))
          .where(eq(changeEventVersions.status, "validated"))
          .orderBy(desc(changeEventVersions.createdAt)),
        transaction
          .select({ id: workRoles.id, name: workRoles.name })
          .from(workRoles)
          .where(eq(workRoles.status, "active"))
          .orderBy(asc(workRoles.name)),
        transaction
          .select({
            id: releaseBatches.id,
            status: releaseBatches.status,
            requestedBy: releaseBatches.requestedByMembershipId,
            resolvedPersonCount: releaseBatches.resolvedPersonCount,
            audienceHash: releaseBatches.resolvedPersonIdsHash,
            requestedAt: releaseBatches.requestedAt,
            caseCount: countDistinct(releaseCases.caseVersionId),
          })
          .from(releaseBatches)
          .leftJoin(
            releaseCases,
            eq(releaseCases.releaseBatchId, releaseBatches.id),
          )
          .groupBy(releaseBatches.id)
          .orderBy(desc(releaseBatches.createdAt))
          .limit(100),
      ]);
      return { changes, roles, batches };
    },
  );
}
