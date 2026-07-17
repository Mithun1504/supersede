import "server-only";

import { and, eq, ne, sql } from "drizzle-orm";

import { artifactVersions, sourceVersions } from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { recordMembershipEvent } from "@/modules/audit/service";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

export async function approveSourceVersion(
  actor: CurrentActor,
  sourceVersionId: string,
): Promise<string> {
  authorize(actor, "edge.review");
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [version] = await transaction
        .select({
          id: sourceVersions.id,
          sourceId: sourceVersions.sourceId,
          recordStatus: sourceVersions.recordStatus,
          createdByMembershipId: sourceVersions.createdByMembershipId,
        })
        .from(sourceVersions)
        .where(eq(sourceVersions.id, sourceVersionId))
        .limit(1);
      if (!version)
        throw new AppError({
          code: "NOT_FOUND",
          message: "Source version not found.",
          status: 404,
        });
      if (version.createdByMembershipId === actor.membership.id) {
        throw new AppError({
          code: "FORBIDDEN",
          message:
            "The version creator cannot approve the same source version.",
          status: 403,
        });
      }
      if (version.recordStatus === "approved") return version.sourceId;
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`source-approval:${version.sourceId}`}, 0))`,
      );
      await transaction
        .update(sourceVersions)
        .set({ recordStatus: "superseded", status: "superseded" })
        .where(
          and(
            eq(sourceVersions.sourceId, version.sourceId),
            eq(sourceVersions.recordStatus, "approved"),
            ne(sourceVersions.id, version.id),
          ),
        );
      await transaction
        .update(sourceVersions)
        .set({ recordStatus: "approved", status: "active" })
        .where(eq(sourceVersions.id, version.id));
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "source.version_approved",
        objectType: "source",
        objectId: version.sourceId,
        objectVersionId: version.id,
      });
      return version.sourceId;
    },
  );
}

export async function approveArtifactVersion(
  actor: CurrentActor,
  artifactVersionId: string,
): Promise<string> {
  authorize(actor, "edge.review");
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [version] = await transaction
        .select({
          id: artifactVersions.id,
          artifactId: artifactVersions.artifactId,
          recordStatus: artifactVersions.recordStatus,
          createdByMembershipId: artifactVersions.createdByMembershipId,
        })
        .from(artifactVersions)
        .where(eq(artifactVersions.id, artifactVersionId))
        .limit(1);
      if (!version)
        throw new AppError({
          code: "NOT_FOUND",
          message: "Artifact version not found.",
          status: 404,
        });
      if (version.recordStatus === "approved") return version.artifactId;
      if (version.createdByMembershipId === actor.membership.id)
        throw new AppError({
          code: "FORBIDDEN",
          message:
            "The version creator cannot approve the same artifact version.",
          status: 403,
        });
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`artifact-approval:${version.artifactId}`}, 0))`,
      );
      await transaction
        .update(artifactVersions)
        .set({ recordStatus: "superseded" })
        .where(
          and(
            eq(artifactVersions.artifactId, version.artifactId),
            eq(artifactVersions.recordStatus, "approved"),
            ne(artifactVersions.id, version.id),
          ),
        );
      await transaction
        .update(artifactVersions)
        .set({ recordStatus: "approved" })
        .where(eq(artifactVersions.id, version.id));
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "artifact.version_approved",
        objectType: "artifact",
        objectId: version.artifactId,
        objectVersionId: version.id,
      });
      return version.artifactId;
    },
  );
}
