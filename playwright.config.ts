import { readFileSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? "3119");
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${String(port)}`;

function localDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    return readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .find((value) => value.startsWith("DATABASE_URL="))
      ?.slice("DATABASE_URL=".length);
  } catch {
    return undefined;
  }
}

const sourceDatabaseUrl = localDatabaseUrl();
const isolatedDatabaseUrl = sourceDatabaseUrl
  ? (() => {
      const url = new URL(sourceDatabaseUrl);
      url.pathname = `/supersede_playwright_${String(port)}`;
      return url.toString();
    })()
  : undefined;

if (
  !process.env.PLAYWRIGHT_BASE_URL &&
  sourceDatabaseUrl &&
  isolatedDatabaseUrl
) {
  process.env.PLAYWRIGHT_ADMIN_DATABASE_URL = sourceDatabaseUrl;
  process.env.DATABASE_URL = isolatedDatabaseUrl;
  process.env.DATABASE_RUNTIME_URL = isolatedDatabaseUrl;
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: [["html", { open: "never" }], ["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
  ],
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: `pnpm exec next dev --port ${String(port)}`,
          env: {
            E2E_AUTH_SECRET:
              process.env.E2E_AUTH_SECRET ?? "supersede-e2e-local-secret",
            ...(isolatedDatabaseUrl
              ? {
                  DATABASE_URL: isolatedDatabaseUrl,
                  DATABASE_RUNTIME_URL: isolatedDatabaseUrl,
                }
              : {}),
          },
          url: `${baseURL}/api/v1/health`,
          reuseExistingServer: false,
          timeout: 120_000,
        },
      }),
});
