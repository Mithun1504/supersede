import { execFileSync } from "node:child_process";

import { Client } from "pg";

function fixtureConfiguration() {
  const adminConnectionString = process.env.PLAYWRIGHT_ADMIN_DATABASE_URL;
  const testConnectionString = process.env.DATABASE_URL;
  if (
    process.env.PLAYWRIGHT_BASE_URL ||
    !adminConnectionString ||
    !testConnectionString
  ) {
    return undefined;
  }
  const testUrl = new URL(testConnectionString);
  const databaseName = testUrl.pathname.slice(1);
  if (!/^supersede_playwright_\d+$/.test(databaseName)) {
    throw new Error("Refusing to manage a non-Playwright database.");
  }
  const adminUrl = new URL(adminConnectionString);
  adminUrl.pathname = "/postgres";
  return {
    adminConnectionString: adminUrl.toString(),
    databaseName,
    testConnectionString,
  };
}

async function dropFixtureDatabase(client: Client, databaseName: string) {
  await client.query(
    `select pg_terminate_backend(pid)
     from pg_stat_activity
     where datname = $1 and pid <> pg_backend_pid()`,
    [databaseName],
  );
  await client.query(`drop database if exists "${databaseName}"`);
}

export async function createE2eDatabase() {
  const configuration = fixtureConfiguration();
  if (!configuration) return;
  const client = new Client({
    connectionString: configuration.adminConnectionString,
  });
  await client.connect();
  try {
    await dropFixtureDatabase(client, configuration.databaseName);
    await client.query(`create database "${configuration.databaseName}"`);
  } finally {
    await client.end();
  }
  const environment = {
    ...process.env,
    DATABASE_URL: configuration.testConnectionString,
    DATABASE_RUNTIME_URL: configuration.testConnectionString,
  };
  execFileSync("pnpm", ["exec", "drizzle-kit", "migrate"], {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
  });
  for (const seedMode of ["public", "sandbox"] as const) {
    execFileSync(
      "node",
      ["--conditions=react-server", "--import", "tsx", "scripts/seed.ts"],
      {
        cwd: process.cwd(),
        env: { ...environment, SEED_ORGANIZATION_MODE: seedMode },
        stdio: "inherit",
      },
    );
  }
}
