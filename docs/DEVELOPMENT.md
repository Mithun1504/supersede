# Development

## Architecture

Supersede is a modular TypeScript monolith built with Next.js App Router.
Server Components read through domain services. Route Handlers expose versioned
integration and workflow APIs. PostgreSQL owns tenant isolation and durable
business state.

Core services:

- Vercel: application and API
- Neon PostgreSQL: relational graph, pgvector, and RLS
- WorkOS AuthKit: identity and organization sessions
- Cloudflare R2: working files
- S3 Object Lock: retained audit bundles when configured
- OpenAI: claim extraction and governed AI tasks
- Gemini: embeddings
- Inngest: durable workflows

Provider clients load on demand so lint, tests, and builds do not require
credentials.

## Repository map

```text
src/app/             pages, layouts, and route handlers
src/components/      product components and UI primitives
src/modules/         domain policy, services, and repositories
src/db/              Drizzle schema and tenant transactions
src/ai/              prompts, schemas, providers, and eval contracts
src/inngest/          workflow functions
src/lib/              shared infrastructure and security utilities
database/migrations/ reviewed SQL migrations
database/tests/      database invariant checks
tests/               unit, eval, integration, and browser tests
```

Import another module through its public service. Keep repositories private to
their domain. Put code in `src/lib` only when it has no domain meaning.

## Environment

Copy `.env.example` to `.env.local`. The server validates supplied values and
never exports secrets to the client.

Local MinIO defaults:

```text
R2_ACCESS_KEY_ID=minioadmin
R2_SECRET_ACCESS_KEY=minioadmin
R2_ENDPOINT=http://localhost:9000
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_ENDPOINT=http://localhost:9000
S3_AUDIT_BUCKET=supersede-audit-development
```

Use alternate host ports when needed:

```bash
MINIO_API_PORT=9010 MINIO_CONSOLE_PORT=9011 docker compose up -d minio minio-init
```

Then set `R2_ENDPOINT` and `S3_ENDPOINT` to `http://localhost:9010`.

## Authentication and tenancy

WorkOS proves identity. PostgreSQL owns product roles and permissions.

1. `src/proxy.ts` propagates the AuthKit session and applies the CSP nonce.
2. The identity module resolves one active internal membership.
3. `withTenantContext()` starts a transaction and sets actor and organization IDs.
4. Service policy and RLS enforce authorization.

Production application queries must use `DATABASE_RUNTIME_URL` with the
restricted `supersede_app` role. Reserve `DATABASE_URL` for migrations and seed
operations.

## Database changes

Edit the Drizzle schema, then generate and review a migration:

```bash
pnpm db:generate
```

Write custom SQL for RLS, triggers, recursive traversal, vector indexes, and
grants. Use expand, migrate, contract sequencing in production. Never run
`db:push` against shared or production databases.

`approval_record` and `audit_event` are insert-only. Approvals always reference
an immutable version.

## API rules

- External routes live under `/api/v1`.
- Validate input with Zod.
- Return RFC 9457 problem details and `x-request-id`.
- Require `Idempotency-Key` for workflow-starting writes.
- Authenticate and authorize every handler.
- Commit state transitions, approvals, audit events, and outbox events atomically.

## UI rules

Use semantic tokens from `src/app/globals.css` and existing components from
`src/components/ui`. Keep Server Components as the default. Add `"use client"`
at the smallest interactive boundary.

## Verification

```bash
pnpm check
pnpm db:test
pnpm eval
pnpm build
pnpm test:e2e
```

Prompt or model changes must increment the prompt version and pass the matching
evals. Live provider checks remain separate from deterministic tests.

## Security rules

- Use fictional data until production privacy and processor gates pass.
- Never log source text, probe answers, emails, credentials, cookies, or signed URLs.
- Treat uploaded content as untrusted.
- Keep buckets private and signed URLs short-lived.
- Claim WORM retention only after a configured Object Lock write succeeds.
