# Release QA: 2026-07-15

## Environment

| Service           | Target                                 |
| ----------------- | -------------------------------------- |
| App               | `http://localhost:3119`                |
| PostgreSQL        | `supersede-postgres-1`                 |
| MinIO             | API `9010`, console `9011`             |
| Inngest           | `http://localhost:8288`                |
| WorkOS            | existing Supersede staging application |
| Public deployment | `https://supersede-bay.vercel.app`     |

Ports used by unrelated projects were left untouched.

## Initial release gates

| Gate                                | Result                                                        |
| ----------------------------------- | ------------------------------------------------------------- |
| `pnpm check`                        | Passed: 16 files, 55 tests                                    |
| Production build                    | Passed on Next.js 16.2.10                                     |
| SQL invariants                      | Passed in containerized `psql`                                |
| Migration and seed                  | Passed through migration `0007`                               |
| Public routes and responsive layout | Passed at 390, 768, 1280, and 1440 px                         |
| Public write boundary               | Anonymous writes returned structured `401` responses          |
| Signed upload and parsing           | Passed for TXT and PDF                                        |
| Upload limits                       | 25 MB enforced; scanned PDF rejected with explicit OCR status |
| Inngest                             | Healthy; four functions registered; unsigned calls rejected   |
| Rate limits and CSRF                | Passed                                                        |
| Standard audit storage              | Passed with SHA-256 and `worm: false`                         |
| Object Lock                         | Unavailable and represented accurately                        |
| WorkOS login and tenant mapping     | Passed                                                        |
| Live GPT-5.6 extraction             | Blocked by missing `OPENAI_API_KEY`                           |
| Production publish                  | Two Vercel uploads stopped in `UNKNOWN` before build          |

All public product routes rendered expected seeded data without console errors
or page overflow. The mobile navigation stayed within its scroll container.
Skip navigation and the custom 404 worked.

## Defects fixed

1. Updated the AuthKit redirect variable to `NEXT_PUBLIC_WORKOS_REDIRECT_URI`.
2. Treated WorkOS cookie secrets below 32 characters as unconfigured.
3. Made MinIO ports and credentials configurable.
4. Captured PDF size and SHA-256 before PDF.js detached the buffer.
5. Removed deterministic fallback from production extraction success.
6. Aligned the `case.approved` event contract and blocked same-case rechecks.
7. Connected release, assignment, grading, remediation, and recheck state.
8. Connected audit generation to tenant evidence and storage.
9. Normalized PostgreSQL timestamps and serialized transaction queries.
10. Centralized durable quotas and JSON CSRF checks.
11. Exposed authenticated identity and returned explicit extraction `503` errors.

## Status on July 15

Local code, database, storage, workflow, auth, and standard export gates passed.
Production readiness remained blocked by live OpenAI configuration and Vercel
deployment. The previous healthy deployment stayed active.

## Demo hardening: July 17

The follow-up pass covered `/app/walkthrough` and `/app/probes` at four
viewports, keyboard activation, public/auth boundaries, PostgreSQL traversal,
extraction idempotency, Inngest registration, build, and audit export.

Results:

- `pnpm check`: 17 files and 60 tests passed.
- SQL foundation transaction passed in the PostgreSQL container.
- `pnpm build` passed.
- `pnpm test:e2e`: 30 tests passed.
- `pnpm audit --prod`: no known vulnerabilities.
- Propagation produced claim, artifact, role, and six-person impacts.
- Extraction persisted one verified claim, rejected an unverified quote, and remained idempotent.
- Four Inngest functions registered.

No P0-P3 visual, accessibility, overflow, clipping, keyboard, or secret-leak
finding remained. Live GPT-5.6 verification was still blocked by the missing
credential. No deployment or production mutation was performed.
