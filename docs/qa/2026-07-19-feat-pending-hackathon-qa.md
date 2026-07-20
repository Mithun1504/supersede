# Hackathon QA: 2026-07-19

**Branch:** `feat/pending` at `1c8da32`

**Browser:** Codex in-app Browser, Chromium, and Pixel 7 Playwright

**Database:** isolated `supersede_playwright_3119` with fictional St. Marlowe data

## Scope

QA covered the Displace five-minute workflow without modifying production or
real user data. Routes included `/`, every `/app` surface, health, readiness,
and the public audit export.

The authenticated browser journey completed:

- three case approvals and one release;
- dependency-edge acceptance;
- artifact correction, approval, and publication;
- R.N. Adams response, remediation, and different-case rechecks;
- source-change entry and second-person validation;
- checksummed report generation.

## Results

- `pnpm check`: passed, 22 files and 71 tests.
- Playwright: 31 passed; one destructive mobile duplicate skipped.
- WCAG 2.1 A/AA axe checks passed on ten public routes at desktop and mobile sizes.
- `pnpm eval`: passed, 3 files and 9 tests.
- `pnpm build`: passed on Next.js 16.2.10.
- `pnpm audit --prod`: no known vulnerabilities.
- Health returned `200`.
- Readiness returned `503` because OpenAI was not configured.
- Audit export returned `200`; the ZIP and checksums passed validation.

No deterministic, browser, accessibility, build, dependency, or export blocker
reproduced.

## Open findings

### P1: live providers unavailable

`pnpm verify:live-extraction` and `pnpm verify:live-embedding` failed closed
because their credentials were absent. A real WorkOS sign-in, hosted Inngest,
Cloudflare R2, S3 Object Lock, Sentry, and Vercel deployment were not exercised.

## Status

The local deterministic workflow was hackathon dry-run ready. Live-demo sign-off
still required both provider checks in the target environment.
