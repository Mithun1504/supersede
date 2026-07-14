import "server-only";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";
import { requireEnv } from "@/lib/env/server";

export type Database = NodePgDatabase<typeof schema>;

const globalDatabase = globalThis as unknown as {
  pool?: Pool;
  database?: Database;
};

export function getPool(): Pool {
  globalDatabase.pool ??= new Pool({
    connectionString: requireEnv("DATABASE_URL"),
    max: process.env.NODE_ENV === "production" ? 5 : 10,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 5_000,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: true }
        : undefined,
  });

  return globalDatabase.pool;
}

export function getDatabase(): Database {
  globalDatabase.database ??= drizzle(getPool(), { schema });
  return globalDatabase.database;
}
