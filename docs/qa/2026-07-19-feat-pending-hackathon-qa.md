# `feat/pending` hackathon QA — 2026-07-19

**Branch:** `feat/pending` at `1c8da32`

**Browser:** Codex in-app Browser, Chromium, and Pixel 7 Playwright profiles

**Workspace:** Fresh isolated `supersede_playwright_3119` database with the fictional St. Marlowe seed

**Purpose:** Verify the documented Displace five-minute demo and its governed mutation path without touching real user data.

## Scope and safety boundary

The completion boundary is the Displace hospital walkthrough in
[`docs/PRD.md`](../PRD.md) and the explicit local verification path in
[`README.md`](../../README.md). Browser mutations ran only against the isolated
Playwright database and fictional personas.

No production account, real clinical record, hosted integration, payment,
email, or user-owned file was changed.

## Routes and surfaces covered

- `/`
- `/app`
- `/app/review`
- `/app/changes`
- `/app/graph`
- `/app/blast-radius`
- `/app/cases`
- `/app/probes`
- `/app/audit`
- `/app/walkthrough`
- `/api/v1/health`
- `/api/v1/readiness`
- `/api/v1/public/walkthrough/audit-export`

The in-app Browser loaded every showcase route. Settled pages had one primary
`main` landmark, no horizontal overflow, no visible error alert, and no
rendered token, key, bearer credential, JWT, or ciphertext pattern.

The automated five-minute journey followed the UI from evidence intake through
source change, dependency map, impact review, decision cases, remediation, and
the audit trail. It asserted exact source evidence, old/new rule comparison,
potential exposure, immutable approval/version-lock state, a different-case
recheck, append-only events, and the SHA-256 audit checksum.

The authenticated browser-to-database test also completed these governed
mutations with distinct seeded actors:

- drafted and approved three decision cases;
- released an approved case;
- accepted a reviewed dependency edge;
- submitted, approved, and published an artifact correction;
- completed R.N. Adams's response and remediation;
- verified different-case rechecks;
- recorded and second-person validated a source change;
- generated a checksummed report bundle.

## Verification results

- `pnpm check`: passed; 22 test files and 71 tests passed.
- `DATABASE_URL=... PLAYWRIGHT_PORT=3119 pnpm test:e2e`: 31 passed; the destructive mobile duplicate was intentionally skipped.
- WCAG 2.1 A/AA Axe checks passed across all ten public routes on desktop and mobile profiles.
- `pnpm eval`: 3 files and 9 evaluation tests passed.
- `pnpm build`: production build passed on Next.js 16.2.10.
- `pnpm audit --prod`: no known vulnerabilities.
- Local liveness returned `200`.
- Local readiness returned `503` because the OpenAI gate is not configured.
- The public audit export returned `200`; its ZIP contained `report.pdf`,
  `manifest.json`, `evidence.json`, `events.csv`, and `approvals.csv`, and passed
  `unzip -t`.

## Findings

### P1 — Live provider gates are unavailable

**Where:** Live extraction and embedding verification

**Observed:** `pnpm verify:live-extraction` failed closed because OpenAI is not
configured. `pnpm verify:live-embedding` failed closed because Gemini is not
configured. `/api/v1/readiness` returned `503` with `openai: false`.

**Why this matters:** The PRD requires live GPT-5.6 extraction at the start of
the five-minute demo, and the README explicitly separates deterministic tests
from provider-backed release proof.

**Expected:** Configure the hackathon environment, then pass both live verifier
commands with the controlled fictional inputs.

No deterministic, browser-flow, accessibility, build, dependency, or audit
export blocker reproduced.

## Coverage gaps

- A real WorkOS sign-in was not executed; authenticated UI mutations used the
  repository's non-production signed test-auth path.
- Hosted Inngest delivery, Cloudflare R2, S3 Object Lock retention, Sentry, and
  a deployed Vercel environment were not exercised in this local run.
- Provider-backed AI quality beyond the two explicit live verifiers remains
  unproven until credentials are supplied.

## Readiness view

The deterministic local showcase and the complete governed workflow are
hackathon dry-run ready. The app is not ready for a live-demo sign-off until
GPT-5.6 extraction and Gemini embedding pass in the actual hackathon
environment.
