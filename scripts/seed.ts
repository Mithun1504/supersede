import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";
import { roles } from "@/db/schema";

const roleSeed = [
  ["org_admin", "Organization configuration and membership administration"],
  ["change_owner", "Creates and submits source change events"],
  ["change_validator", "Validates a change event created by another actor"],
  ["edge_reviewer", "Reviews extracted dependency edges and evidence"],
  ["case_approver", "Approves an immutable divergence-case version"],
  ["release_authorizer", "Authorizes release to affected users"],
  ["auditor", "Reads audit records and creates permitted exports"],
  ["learner", "Completes assigned probes and remediation exercises"],
] as const;

async function seed() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for seeding.");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const database = drizzle(pool, { schema });

  await database
    .insert(roles)
    .values(roleSeed.map(([code, description]) => ({ code, description })))
    .onConflictDoNothing();

  await pool.end();
}

seed()
  .then(async () => {
    console.info("Foundation seed completed.");
  })
  .catch(async (error: unknown) => {
    console.error("Foundation seed failed.", error);
    process.exitCode = 1;
  });
