import { randomBytes } from "node:crypto";

import { Pool } from "pg";

async function provisionRuntimeRole() {
  const ownerUrl = process.env.DATABASE_URL;
  if (!ownerUrl) throw new Error("DATABASE_URL is required.");

  const password = randomBytes(36).toString("base64url");
  const pool = new Pool({ connectionString: ownerUrl, max: 1 });
  try {
    const result = await pool.query<{ statement: string }>(
      "select format('alter role supersede_app login password %L', $1::text) as statement",
      [password],
    );
    const statement = result.rows[0]?.statement;
    if (!statement)
      throw new Error("Could not build the runtime-role statement.");
    await pool.query(statement);
  } finally {
    await pool.end();
  }

  const runtimeUrl = new URL(ownerUrl);
  runtimeUrl.username = "supersede_app";
  runtimeUrl.password = password;
  process.stdout.write(runtimeUrl.toString());
}

provisionRuntimeRole().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Runtime role provisioning failed.",
  );
  process.exitCode = 1;
});
