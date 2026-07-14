# Supersede

Supersede is an evidence-backed change-propagation platform. This repository currently contains
the production scaffold only: framework, design system, identity boundary, database foundations,
provider adapters, workflow runtime, API conventions, observability, tests, and local tooling.
Business features described in [`docs/PRD.md`](./docs/PRD.md) are intentionally not implemented.

## Prerequisites

- Node.js 22.22 or newer in the Node 22/24 LTS range
- Corepack and pnpm 10.33
- Docker Desktop or a compatible Compose runtime
- PostgreSQL client tools (`psql`) for `pnpm db:test`

## Quick start

```bash
corepack enable
pnpm install
cp .env.example .env.local
docker compose up -d postgres minio minio-init
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). WorkOS is optional for an unprivileged local
scaffold run; configure its variables to test the real hosted sign-in flow. Authentication fails
closed on the `/app` surface in production when WorkOS is not configured.

Run Inngest's local development server in a second terminal:

```bash
pnpm inngest:dev
```

## Verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Database invariants can be checked after migrations with `pnpm db:test`.

## Important boundaries

- `docs/PRD.md` and `docs/TECH_STACK.md` are architectural source documents.
- `src/modules/*` owns domain policy and exposes narrow public APIs.
- `src/db` owns Drizzle schemas and transaction-scoped tenant context.
- `database/migrations` owns RLS, append-only triggers, and database-native invariants.
- `src/ai` owns provider mechanics, prompt contracts, and provenance schemas—not approval policy.
- `src/inngest` owns durable orchestration; PostgreSQL remains workflow truth.
- `src/app/api/v1` contains external/versioned REST endpoints. First-party reads should use Server
  Components and first-party mutations should use authenticated Server Actions.

See [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) for environment, architecture, and contribution
details.
