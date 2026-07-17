# Supersede

Supersede is an evidence-backed change-propagation system. It traces a changed
rule through dependent claims, artifacts, professional roles, and fictional
demo personas; then governs review, remediation, release, rechecks, and audit
export without treating AI output as approval.

The public walkthrough uses the seeded St. Marlowe hospital tenant. Every
state-changing API requires a WorkOS session and an active internal membership.

## What is implemented

- TXT, Markdown, HTML, DOCX, XLSX, and text-PDF ingestion through tenant-scoped
  signed object-storage uploads, with a 25 MB limit and explicit OCR rejection.
- Live GPT-5.6 claim extraction with exact-quote verification, structured
  provenance, and review prioritization at 0.80 confidence. There is no
  confidence-based auto-approval.
- Versioned claims, reviewed dependency edges, cycle-safe eight-hop traversal,
  blast-radius paths, and load-bearing review at 0.65.
- Change validation, case approval, release separation of duties, append-only
  approvals/audit records, atomic outbox events, remediation, and different-case
  30/90-day rechecks.
- Aggregate-by-default reporting with five-person cohort suppression. The
  fictional demo tenant explicitly enables named results for the R.N. Adams
  workflow.
- Checksummed ZIP audit export containing PDF, JSON, and CSV files. The UI
  distinguishes standard storage from actual S3 Object Lock retention.
- A responsive public walkthrough and authenticated live-extraction surface.

The governing requirements and architecture are in
[`docs/PRD.md`](./docs/PRD.md) and [`docs/TECH_STACK.md`](./docs/TECH_STACK.md).

## Local setup

Prerequisites: Node.js 22.22+, pnpm 10.33, Docker, and `psql`.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
docker compose up -d postgres minio minio-init
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open `http://localhost:3000/app/walkthrough`. The public seeded views work
without provider credentials. Live extraction and every mutation fail closed
until WorkOS, Postgres, OpenAI, and object storage are configured.

Run Inngest locally in a second terminal when exercising durable workflows:

```bash
pnpm inngest:dev
```

## Required hosted configuration

- `DATABASE_URL`: Neon PostgreSQL owner used only for migrations and seeding.
  `DATABASE_RUNTIME_URL` is the app connection for the restricted
  `supersede_app` role created by the migrations.
- `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`, and redirect
  configuration. Real demo users must be mapped to the seeded internal
  memberships; the product has no impersonation or role switcher.
- `OPENAI_API_KEY` and `OPENAI_PRIMARY_MODEL=gpt-5.6` for the live completion
  gate.
- Private R2-compatible working storage credentials and bucket.
- Inngest event/signing keys for durable propagation and due-work dispatch.
- Optional S3 audit bucket. Select Object Lock retention only for a bucket that
  is already configured for it; standard storage must be labeled as non-WORM.

`GET /api/v1/health` is liveness. `GET /api/v1/readiness` returns 503 until the
critical production dependencies are configured and Postgres is reachable.
The generated OpenAPI document is available at `/api/v1/openapi`.

## Verification

```bash
pnpm db:migrate
pnpm db:test
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm audit --prod
```

Ordinary tests use deterministic fixtures. They never count as proof of the
live extraction gate; release verification must also make an authenticated
GPT-5.6 extraction call and verify returned quotes against the submitted text.

## Boundaries

- All included people, clinical content, responses, and outcomes are fictional.
- AI proposes and prioritizes; authenticated humans authorize governed actions.
- Reports use observable terms such as assigned, assessed, remediated, and
  rechecked. They do not infer knowledge, belief, or competence.
- Approved versions are immutable. Changes create new versions.
- Do not run `db:push` against shared or production databases.
