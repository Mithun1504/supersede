import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { z } from "zod";

import {
  auditEvents,
  organizations,
  people,
  personWorkRoles,
  workRoles,
} from "@/db/schema";

const input = z
  .object({ databaseUrl: z.string().url(), organizationId: z.string().uuid() })
  .parse({
    databaseUrl: process.env.DATABASE_URL,
    organizationId: process.env.DEMO_ORGANIZATION_ID,
  });

const personas = [
  ["DEMO-001", "R.N. Adams", "rn.adams@example.test", "ICU nurse"],
  ["DEMO-002", "Morgan Lee", "morgan.lee@example.test", "ICU nurse"],
  ["DEMO-003", "Jordan Patel", "jordan.patel@example.test", "ICU nurse"],
  ["DEMO-004", "Casey Rivera", "casey.rivera@example.test", "ICU nurse"],
  ["DEMO-005", "Avery Stone", "avery.stone@example.test", "Hospitalist"],
  ["DEMO-006", "Taylor Brooks", "taylor.brooks@example.test", "Hospitalist"],
  ["DEMO-007", "Reese Chen", "reese.chen@example.test", "Hospitalist"],
  ["DEMO-008", "Sam Okafor", "sam.okafor@example.test", "Hospitalist"],
] as const;

async function main() {
  const pool = new Pool({ connectionString: input.databaseUrl });
  const database = drizzle(pool);
  try {
    await database.transaction(async (transaction) => {
      const [organization] = await transaction
        .select({
          id: organizations.id,
          configuration: organizations.productConfiguration,
        })
        .from(organizations)
        .where(eq(organizations.id, input.organizationId))
        .limit(1);
      if (!organization || organization.configuration !== "displace")
        throw new Error(
          "DEMO_ORGANIZATION_ID must identify a provisioned Displace organization.",
        );
      const roles = new Map<string, string>();
      for (const roleName of ["ICU nurse", "Hospitalist"]) {
        let [role] = await transaction
          .select({ id: workRoles.id })
          .from(workRoles)
          .where(
            and(
              eq(workRoles.organizationId, organization.id),
              eq(workRoles.name, roleName),
            ),
          )
          .limit(1);
        if (!role)
          [role] = await transaction
            .insert(workRoles)
            .values({
              organizationId: organization.id,
              externalRoleKey: `DEMO-${roleName.toUpperCase().replaceAll(" ", "-")}`,
              name: roleName,
            })
            .returning({ id: workRoles.id });
        if (!role) throw new Error("Demo role insert returned no row.");
        roles.set(roleName, role.id);
      }
      for (const [
        externalPersonKey,
        displayName,
        email,
        roleName,
      ] of personas) {
        let [person] = await transaction
          .select({ id: people.id })
          .from(people)
          .where(
            and(
              eq(people.organizationId, organization.id),
              eq(people.externalPersonKey, externalPersonKey),
            ),
          )
          .limit(1);
        if (!person)
          [person] = await transaction
            .insert(people)
            .values({
              organizationId: organization.id,
              externalPersonKey,
              displayName,
              email,
              isSeededPersona: true,
            })
            .returning({ id: people.id });
        if (!person) throw new Error("Demo person insert returned no row.");
        const workRoleId = roles.get(roleName);
        if (!workRoleId) throw new Error("Demo role lookup failed.");
        await transaction
          .insert(personWorkRoles)
          .values({
            organizationId: organization.id,
            personId: person.id,
            workRoleId,
            effectiveFrom: new Date(),
          })
          .onConflictDoNothing();
      }
      await transaction.insert(auditEvents).values({
        organizationId: organization.id,
        actorType: "system",
        eventType: "demo.seeded_personas_created",
        objectType: "organization",
        objectId: organization.id,
        payload: { count: personas.length, fictional: true },
      });
    });
    process.stdout.write(
      `${JSON.stringify({ seededPersonas: personas.length })}\n`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Demo persona seeding failed."}\n`,
  );
  process.exitCode = 1;
});
