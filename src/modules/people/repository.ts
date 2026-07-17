import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import {
  artifacts,
  people,
  personWorkRoles,
  roleArtifactExposures,
  workRoles,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

export async function getPeopleWorkspace(actor: CurrentActor) {
  authorize(actor, "people.read");
  if (actor.organization.productConfiguration !== "displace")
    throw new AppError({
      code: "NOT_FOUND",
      message: "People exposure is not enabled for this workspace.",
      status: 404,
    });
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [personRows, roles, artifactRows, mappings] = await Promise.all([
        transaction
          .select({
            id: people.id,
            displayName: people.displayName,
            email: people.email,
            status: people.status,
            roleName: workRoles.name,
          })
          .from(people)
          .leftJoin(
            personWorkRoles,
            and(
              eq(personWorkRoles.personId, people.id),
              isNull(personWorkRoles.effectiveTo),
            ),
          )
          .leftJoin(workRoles, eq(workRoles.id, personWorkRoles.workRoleId))
          .orderBy(asc(people.displayName)),
        transaction
          .select({ id: workRoles.id, name: workRoles.name })
          .from(workRoles)
          .where(eq(workRoles.status, "active"))
          .orderBy(asc(workRoles.name)),
        transaction
          .select({ id: artifacts.id, title: artifacts.title })
          .from(artifacts)
          .orderBy(asc(artifacts.title)),
        transaction
          .select({
            id: roleArtifactExposures.id,
            roleName: workRoles.name,
            artifactTitle: artifacts.title,
            rationale: roleArtifactExposures.rationale,
          })
          .from(roleArtifactExposures)
          .innerJoin(
            workRoles,
            eq(workRoles.id, roleArtifactExposures.workRoleId),
          )
          .innerJoin(
            artifacts,
            eq(artifacts.id, roleArtifactExposures.artifactId),
          )
          .where(
            and(
              eq(roleArtifactExposures.reviewStatus, "accepted"),
              isNull(roleArtifactExposures.effectiveTo),
            ),
          ),
      ]);
      return { people: personRows, roles, artifacts: artifactRows, mappings };
    },
  );
}
