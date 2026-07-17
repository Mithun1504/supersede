import "server-only";

import { createHash } from "node:crypto";

import { parse } from "csv-parse/sync";
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";

import {
  artifacts,
  integrationConnections,
  integrationJobItems,
  integrationJobs,
  memberships,
  people,
  personWorkRoles,
  roleArtifactExposures,
  workRoles,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { recordMembershipEvent } from "@/modules/audit/service";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

function requireDisplace(actor: CurrentActor) {
  if (actor.organization.productConfiguration !== "displace")
    throw new AppError({
      code: "NOT_FOUND",
      message: "People exposure is available only in a Displace workspace.",
      status: 404,
    });
}

export async function importPeople(
  actor: CurrentActor,
  input: {
    rows: string;
    deprovisionMissing: boolean;
    mode: "preview" | "apply";
  },
): Promise<{ people: number; roles: number; failed: number }> {
  authorize(actor, "people.manage");
  requireDisplace(actor);
  const records = parse(input.rows, {
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as string[][];
  const parsed = records.map((cells, position) => {
    const error =
      cells.length !== 4 || cells.some((cell) => !cell)
        ? "expected_four_fields"
        : !/^\S+@\S+\.\S+$/.test(cells[2] ?? "")
          ? "invalid_email"
          : null;
    const [
      externalPersonKey = "",
      displayName = "",
      email = "",
      roleName = "",
    ] = cells;
    return {
      position,
      externalPersonKey,
      displayName,
      email,
      roleName,
      error,
      raw: cells,
    };
  });
  const valid = parsed.filter((row) => !row.error);
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [connection] = await transaction
        .select({ id: integrationConnections.id })
        .from(integrationConnections)
        .where(
          and(
            eq(integrationConnections.type, "hris_csv"),
            eq(integrationConnections.status, "active"),
          ),
        )
        .limit(1);
      if (input.deprovisionMissing && !connection)
        throw new AppError({
          code: "CONFLICT",
          message:
            "Activate an HRIS CSV connection before full-snapshot deprovisioning.",
          status: 409,
        });
      const [job] = await transaction
        .insert(integrationJobs)
        .values({
          organizationId: actor.organization.id,
          integrationConnectionId: connection?.id,
          jobType: "hris_csv_people_v1",
          direction: "import",
          status: "running",
          requestedByMembershipId: actor.membership.id,
          totalCount: parsed.length,
        })
        .returning({ id: integrationJobs.id });
      if (!job) throw new Error("Import job insert returned no row.");
      if (input.mode === "preview") {
        if (parsed.length)
          await transaction.insert(integrationJobItems).values(
            parsed.map((row) => ({
              organizationId: actor.organization.id,
              integrationJobId: job.id,
              position: row.position,
              externalKey: row.externalPersonKey || null,
              status: row.error ? ("failed" as const) : ("completed" as const),
              errorCode: row.error,
              errorSummary: row.error
                ? row.error === "invalid_email"
                  ? "Email is invalid."
                  : "Expected external key, display name, email, and role."
                : null,
              payloadSha256: createHash("sha256")
                .update(JSON.stringify(row.raw))
                .digest("hex"),
            })),
          );
        const failed = parsed.length - valid.length;
        await transaction
          .update(integrationJobs)
          .set({
            status: failed ? "partial" : "completed",
            succeededCount: valid.length,
            failedCount: failed,
            completedAt: new Date(),
          })
          .where(eq(integrationJobs.id, job.id));
        return {
          people: valid.length,
          roles: new Set(valid.map((row) => row.roleName)).size,
          failed,
        };
      }
      const roleNames = [...new Set(valid.map((row) => row.roleName))];
      const roleByName = new Map<string, string>();
      for (const name of roleNames) {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`work-role:${actor.organization.id}:${name.toLowerCase()}`}, 0))`,
        );
        let [role] = await transaction
          .select({ id: workRoles.id })
          .from(workRoles)
          .where(and(eq(workRoles.name, name), eq(workRoles.status, "active")))
          .limit(1);
        if (!role)
          [role] = await transaction
            .insert(workRoles)
            .values({ organizationId: actor.organization.id, name })
            .returning({ id: workRoles.id });
        if (role) roleByName.set(name, role.id);
      }
      for (const row of parsed) {
        const payloadSha256 = createHash("sha256")
          .update(JSON.stringify(row.raw))
          .digest("hex");
        if (row.error) {
          await transaction.insert(integrationJobItems).values({
            organizationId: actor.organization.id,
            integrationJobId: job.id,
            position: row.position,
            externalKey: row.externalPersonKey || null,
            status: "failed",
            errorCode: row.error,
            errorSummary:
              row.error === "invalid_email"
                ? "Email is invalid."
                : "Expected external key, display name, email, and role.",
            payloadSha256,
          });
          continue;
        }
        const [membership] = await transaction
          .select({ id: memberships.id })
          .from(memberships)
          .where(
            and(
              sql`lower(${memberships.email}) = lower(${row.email})`,
              eq(memberships.status, "active"),
            ),
          )
          .limit(1);
        let [person] = await transaction
          .select({ id: people.id })
          .from(people)
          .where(eq(people.externalPersonKey, row.externalPersonKey))
          .limit(1);
        if (!person)
          [person] = await transaction
            .insert(people)
            .values({
              organizationId: actor.organization.id,
              externalPersonKey: row.externalPersonKey,
              displayName: row.displayName,
              email: row.email,
              membershipId: membership?.id,
              sourceConnectionId: connection?.id,
            })
            .returning({ id: people.id });
        else
          await transaction
            .update(people)
            .set({
              displayName: row.displayName,
              email: row.email,
              membershipId: membership?.id,
              status: "active",
              sourceConnectionId: connection?.id,
            })
            .where(eq(people.id, person.id));
        const roleId = roleByName.get(row.roleName);
        if (person && roleId)
          await transaction
            .insert(personWorkRoles)
            .values({
              organizationId: actor.organization.id,
              personId: person.id,
              workRoleId: roleId,
              effectiveFrom: new Date(),
              sourceConnectionId: connection?.id,
            })
            .onConflictDoNothing();
        if (person)
          await transaction.insert(integrationJobItems).values({
            organizationId: actor.organization.id,
            integrationJobId: job.id,
            position: row.position,
            externalKey: row.externalPersonKey,
            status: "completed",
            resultObjectType: "person",
            resultObjectId: person.id,
            payloadSha256,
          });
      }
      if (input.deprovisionMissing && connection) {
        const keys = valid.map((row) => row.externalPersonKey);
        if (keys.length)
          await transaction
            .update(people)
            .set({ status: "deprovisioned", deprovisionedAt: new Date() })
            .where(
              and(
                eq(people.sourceConnectionId, connection.id),
                eq(people.status, "active"),
                notInArray(people.externalPersonKey, keys),
              ),
            );
      }
      const failed = parsed.length - valid.length;
      await transaction
        .update(integrationJobs)
        .set({
          status: failed ? "partial" : "completed",
          succeededCount: valid.length,
          failedCount: failed,
          completedAt: new Date(),
        })
        .where(eq(integrationJobs.id, job.id));
      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "people.imported",
        objectType: "organization",
        objectId: actor.organization.id,
        payload: {
          peopleCount: valid.length,
          roleCount: roleNames.length,
          failedCount: failed,
          fullSnapshot: input.deprovisionMissing,
          integrationJobId: job.id,
        },
      });
      return { people: valid.length, roles: roleNames.length, failed };
    },
  );
}

export async function mapRoleToArtifact(
  actor: CurrentActor,
  input: { workRoleId: string; artifactId: string; rationale: string },
): Promise<void> {
  authorize(actor, "people.manage");
  requireDisplace(actor);
  await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [[role], [artifact]] = await Promise.all([
        transaction
          .select({ id: workRoles.id })
          .from(workRoles)
          .where(eq(workRoles.id, input.workRoleId))
          .limit(1),
        transaction
          .select({ id: artifacts.id })
          .from(artifacts)
          .where(eq(artifacts.id, input.artifactId))
          .limit(1),
      ]);
      if (!role || !artifact)
        throw new AppError({
          code: "NOT_FOUND",
          message: "The role or artifact was not found.",
          status: 404,
        });
      await transaction
        .update(roleArtifactExposures)
        .set({ effectiveTo: new Date() })
        .where(
          and(
            eq(roleArtifactExposures.workRoleId, role.id),
            eq(roleArtifactExposures.artifactId, artifact.id),
            isNull(roleArtifactExposures.effectiveTo),
          ),
        );
      const [mapping] = await transaction
        .insert(roleArtifactExposures)
        .values({
          organizationId: actor.organization.id,
          workRoleId: role.id,
          artifactId: artifact.id,
          confidence: "1.0000",
          rationale: input.rationale,
          reviewStatus: "accepted",
          effectiveFrom: new Date(),
          createdByMembershipId: actor.membership.id,
        })
        .returning({ id: roleArtifactExposures.id });
      if (mapping)
        await recordMembershipEvent(transaction, {
          organizationId: actor.organization.id,
          actorMembershipId: actor.membership.id,
          eventType: "exposure.accepted",
          objectType: "role_artifact_exposure",
          objectId: mapping.id,
          payload: { workRoleId: role.id, artifactId: artifact.id },
        });
    },
  );
}
