# Supersede release QA — July 15, 2026

## Scope

In-app Browser release sweep of every public product route, public/auth
boundaries, responsive behavior, keyboard structure, downloads, not-found and
error states, plus live PostgreSQL, MinIO, Inngest, extraction, governed
workflow, and audit-export integration gates.

## Environments

- Local app: `http://localhost:3119`
- PostgreSQL: `supersede-postgres-1`
- Supersede MinIO: API `9010`, console `9011`
- Inngest dev server: `http://localhost:8288`
- WorkOS: existing `supersede` staging project and application only
- Public deployment: `https://supersede-bay.vercel.app`

Ports `3000`, `3001`, and `9000` belonged to unrelated local projects and were
left untouched. Supersede's Compose ports are now configurable so local QA does
not require stopping another project.

## Release gates

| Gate                              | Result                   | Evidence                                                                                                                          |
| --------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Formatting, lint, type safety     | Pass                     | `pnpm check`                                                                                                                      |
| Unit and governed-AI tests        | Pass                     | 16 files, 55 tests                                                                                                                |
| Production build                  | Pass                     | Next.js 16.2.10, 26 dynamic pages/routes generated                                                                                |
| SQL invariants                    | Pass                     | `BEGIN / DO / ROLLBACK` through containerized `psql`                                                                              |
| Database migration and seed       | Pass                     | migrations through `0007`; St. Marlowe seed present                                                                               |
| Public route sweep                | Pass                     | All nine `/app` routes rendered expected headings without console errors or page overflow                                         |
| Responsive behavior               | Pass                     | 390, 768, 1280, and 1440 px; no page overflow                                                                                     |
| Walkthrough and navigation clicks | Pass                     | Walkthrough card and product-nav transitions reached the correct routes                                                           |
| Audit download                    | Pass                     | Browser download event plus independently verified ZIP manifest/checksums                                                         |
| Public/auth boundary              | Pass                     | Anonymous writes return structured `401 UNAUTHENTICATED` responses                                                                |
| Signed object upload              | Pass                     | Real signed PUT and TXT/PDF parse against Supersede MinIO                                                                         |
| Upload limits and OCR state       | Pass                     | 25 MB + 1 rejected; scanned PDF rejected with `OCR not supported yet`                                                             |
| Durable workflow runtime          | Pass                     | Inngest dev health 200; app exposes four registered functions, including validated-change propagation; unsigned requests rejected |
| Rate limits and CSRF              | Pass                     | Same-origin JSON tests; first 20 extraction requests accepted and 21st returned 429 policy result                                 |
| Standard audit storage            | Pass                     | DB-backed bundle stored in MinIO, 64-char SHA-256, `worm: false`, version-scoped key                                              |
| Object Lock                       | Correctly unavailable    | No configured S3 Object Lock bucket; UI and API do not claim WORM                                                                 |
| WorkOS callback                   | Pass                     | `localhost:3119/auth/callback` saved on the existing Supersede staging application                                                |
| WorkOS tenant authentication      | Pass                     | Real Google login returned through Supersede AuthKit; existing test org mapped to St. Marlowe                                     |
| Authenticated browser boundary    | Pass                     | Real identity visible, sign-out available, tenant actor resolved; no impersonation or role switch                                 |
| Live local GPT-5.6 extraction     | Blocked on configuration | `.env.local` has no `OPENAI_API_KEY`; deterministic fallback cannot satisfy the production API                                    |
| Operational readiness             | Correctly not ready      | Missing OpenAI and invalid short WorkOS cookie secret keep readiness non-green                                                    |
| Production publish                | Blocked by Vercel        | Two uploads stopped in `UNKNOWN` before any build; prior healthy production remains active                                        |

## Browser route and state sweep

Verified `/app`, `/app/review`, `/app/graph`, `/app/changes`,
`/app/blast-radius`, `/app/cases`, `/app/probes`, `/app/audit`, and
`/app/walkthrough`. Each settled route had one product main landmark, the
expected heading, fictional seeded data, a visible read-only identity, and no
page-level horizontal overflow. Anonymous mutation controls stayed disabled or
returned a clean authentication problem. The unknown route rendered the custom
404 with a return-home action.

The mobile product rail scrolls within its own container rather than widening
the page. The skip link has a real `#content` target and that target is
programmatically focusable.

## Defects found and resolved in this pass

1. AuthKit v4 reads `NEXT_PUBLIC_WORKOS_REDIRECT_URI`; the project used the
   obsolete unprefixed name and sent an empty callback.
2. A present but too-short WorkOS cookie secret crashed Proxy before every
   handler. Configuration now treats fewer than 32 characters as not ready.
3. Local MinIO used fixed host ports and fixed credentials. Compose now supports
   alternate ports and uses the configured R2 credentials and bucket.
4. PDF.js detached the input byte buffer, causing parsed PDF metadata to report
   zero bytes. Size and SHA-256 are captured before parsing.
5. The production extraction API accepted deterministic fallback as success.
   It now accepts live mode only; fallback remains test/disaster-recovery code.
6. `case.approved` emitted an event shape the release handler rejected. The
   contract now matches and overdue blocked rechecks release only with a
   different approved case.
7. Release authorization stopped before assignments, and probe assessment was
   not wired. It now creates assignments, records exact grading evidence,
   routes uncertainty to human review, and creates remediation for old-rule
   responses without creating fake approvals.
8. Audit export generation was not connected to tenant evidence/storage. It now
   writes the bundle and report row, with release remaining a separate human
   approval.
9. Raw audit timestamps were strings in live PostgreSQL but treated as `Date`,
   and concurrent queries reused one transaction client. The evidence boundary
   now normalizes timestamps and runs its transaction queries sequentially.
10. Expensive authenticated endpoints lacked durable quotas, and JSON mutation
    parsing lacked an application-level CSRF boundary. Both are centralized and
    tested.
11. Product routes never surfaced the authenticated WorkOS identity, and the
    live extraction gate turned missing OpenAI configuration into a generic 500.
    The server shell now shows the real signed-in identity and sign-out action;
    the extraction gate returns an explicit 503 without using fallback.

## Honest release status

The code, schema, public walkthrough, local database, local object storage,
Inngest registration, governed workflow policy, standard audit export, and the
Supersede WorkOS login/tenant boundary are green. Production readiness must
remain non-green until a real OpenAI key, a 32+ character WorkOS cookie
password, and the intended production services are configured. The seeded
walkthrough remains read-only even after authentication; stateful workflow
endpoints use the authenticated tenant actor and cannot be replaced by actor
impersonation. Vercel accepted two production uploads but failed before
scheduling either build, so the previously healthy production deployment was
left serving rather than replaced by an unverified release.

---

# Best-of-branches demo hardening pass

**Date:** July 17, 2026

**Browser:** Playwright Chromium 1.61.1

**Workspace:** Local seeded St. Marlowe tenant

**Purpose:** Close the remote branch's useful interaction and propagation gaps without importing its stale thresholds, duplicate scheduler, vulnerable XLSX dependency, or migration scaffolding.

## Routes and surfaces covered

- `/app/walkthrough` at 390×844, 768×1024, 1280×720, and 1440×900.
- `/app/probes` at the same four viewports, before and after the full scripted response, artifact correction, and recheck-scheduling rehearsal.
- Keyboard activation of all new probe/remediation controls.
- Anonymous extraction and all public/auth boundary smoke checks.
- PostgreSQL traversal, persisted extraction idempotency, four-function Inngest registration, production build, and checksummed audit path.

## Actions intentionally not executed

- No real person, learner, or governed approval record was mutated through the public walkthrough.
- No deployment, push, or production database mutation was performed.
- The production OpenAI key was not copied into the repository or printed.

## Findings

No P0-P3 visual, accessibility, overflow, clipping, keyboard, or secret-leak findings remained on the changed surfaces. The scripted persona runner is explicitly labeled browser-only and simulated; the live extraction surface is explicitly labeled as the completion gate.

## Verification evidence

- `pnpm check`: 17 files, 60 tests passed.
- SQL foundation test: `BEGIN / DO / ROLLBACK` passed through the PostgreSQL container because host `psql` is unavailable.
- `pnpm build`: production compilation and route generation passed.
- `pnpm test:e2e`: 30 desktop/mobile tests passed, including the complete five-minute path.
- `pnpm audit --prod`: no known vulnerabilities.
- Propagation integration: reviewed source traversal produced claim, artifact, role, and six fictional-person impacts; a second run reused the completed workflow.
- Extraction persistence integration: one verified claim version persisted; the unverified quote did not; the repeated run created no duplicate.
- Inngest local dev registration: four functions, including `Propagate a validated ChangeEvent`.

## Coverage gaps and prerequisites

- Live GPT-5.6 verification remains blocked. Vercel lists `OPENAI_API_KEY` for production, but the pulled value is empty; local configuration also has no key. The deterministic fallback was not used.
- Local WorkOS cookie configuration is now a valid generated 32-byte secret, and the other readiness checks are green.

## Release readiness view

The code and seeded five-minute demo are ready. Operational readiness remains correctly non-green only for the missing OpenAI credential; the app must not be presented as having passed the live extraction gate until that key is populated and `pnpm verify:live-extraction` succeeds.
