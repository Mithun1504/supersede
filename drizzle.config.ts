import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./database/migrations",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://supersede:supersede@localhost:5432/supersede",
  },
  strict: true,
  verbose: true,
});
