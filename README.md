# Supersede

Supersede is an evidence-backed change-propagation platform. Propagate traces governed source
changes through reviewed dependencies and artifact remediation; Displace adds audience snapshots,
cold probes, applied correction work, and spaced rechecks.

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

Open [http://localhost:3000](http://localhost:3000). The public site runs without WorkOS, while the
`/app` workspace always fails closed until AuthKit is configured. There is no development auth
bypass.

Run Inngest's local development server in a second terminal:

```bash
pnpm inngest:dev
```

The hackathon's fictional eight-person audience is an explicit optional operation documented in
`docs/DEVELOPMENT.md`; it is never created by normal production provisioning.

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

Use `E2E_PORT=3100 pnpm test:e2e` when port 3000 is occupied.

## Deployment configuration

Provision WorkOS, Neon/pgvector, private R2 working storage, S3 Object Lock audit storage, Inngest,
OpenAI, Gemini, and configured delivery providers before production. Configure Postmark webhook
Basic authentication and IP allowlisting, and grant the Slack bot only `chat:write` and
`users:read.email`. Generate
`FIELD_ENCRYPTION_KEY` with `openssl rand -base64 32` and keep it in the deployment secret store;
losing it makes encrypted learner submissions unrecoverable. Set `APPLICATION_RELEASE_SHA` to the
40-character deployed Git commit. Apply migrations with the migration owner, then run the app with
the restricted runtime role described in the development guide.

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
