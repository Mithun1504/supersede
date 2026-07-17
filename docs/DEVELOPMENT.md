# Development guide

## Architecture at a glance

Supersede is a modular TypeScript monolith built with Next.js App Router. React Server Components
perform internal reads directly through domain services. Server Actions own first-party
mutations; versioned Route Handlers are reserved for integrations, webhooks, streaming, and the
public API.

The initial infrastructure boundary is:

- Vercel for the web application and API;
- Neon PostgreSQL with pgvector and RLS;
- WorkOS AuthKit for human identity and organization sessions;
- Cloudflare R2 for working objects and S3 Object Lock for retained audit bundles;
- OpenAI Responses API for governed generation and Gemini Embedding 2 for embeddings;
- Inngest for retriable workflows and due-work dispatch.

All provider clients are lazy. The project can lint, test, and build without credentials; a service
throws a clear configuration error only when code attempts to use it.

## Folder ownership

```text
src/app/             App Router pages, layouts, route handlers, and errors
src/components/ui/   Owned shadcn primitives
src/components/      Reusable product-level components and providers
src/modules/         Domain policy, services, repositories, and public module APIs
src/db/              Drizzle schema, database client, and tenant transaction context
src/ai/              Prompt contracts, structured schemas, provider clients, and eval assets
src/inngest/          Durable workflow client and functions
src/lib/              Cross-cutting API, environment, logging, security, and storage utilities
database/migrations/ Database-native schema and security invariants
database/tests/      SQL invariant checks
tests/               Unit, component, eval, mocks, and Playwright suites
```

Do not import one domain module's private repository from another module. Add a public service or
domain event instead. Shared code belongs in `src/lib` only when it has no domain meaning.

## Environment configuration

Copy `.env.example` to `.env.local`. Empty optional provider variables are accepted for build and
test commands.
The server environment parser validates every supplied value and secrets are never exported to
client bundles.

For local MinIO, use:

```text
R2_ACCESS_KEY_ID=minioadmin
R2_SECRET_ACCESS_KEY=minioadmin
R2_ENDPOINT=http://localhost:9000
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_ENDPOINT=http://localhost:9000
S3_AUDIT_BUCKET=supersede-audit-development
```

The MinIO console is available at `http://localhost:9001`.

Generate `FIELD_ENCRYPTION_KEY` once per environment with `openssl rand -base64 32`. Store it in the
approved secret manager and rotate it only with a ciphertext migration; replacing it in place makes
existing encrypted learner corrections undecryptable.

## Authentication and tenant authorization

WorkOS proves human and organization identity. Product roles stay in PostgreSQL. Never authorize a
domain action from WorkOS role metadata or client input.

The request flow is:

1. `src/proxy.ts` propagates the encrypted AuthKit session and applies a nonce-based CSP.
2. A Server Component, Server Action, or Route Handler calls the identity module.
3. `app.resolve_actor()` maps WorkOS identifiers to one active internal membership.
4. `withTenantContext()` starts a transaction and sets organization and actor IDs with
   transaction-local PostgreSQL settings.
5. RLS and service policy both enforce access.

Production must use a dedicated non-owner application database role. Grant it only the required
table privileges and approved `app` functions; do not deploy using the migration owner. Migrations
create the `supersede_app` and `supersede_worker` NOLOGIN group roles. Grant the appropriate group
role to a separately managed Neon login. The migration owner is used only for schema changes.

Configure `WORKOS_WEBHOOK_SECRET` and send signed WorkOS membership created, updated, and deleted
events to `/api/webhooks/workos`. The handler accepts events only for locally provisioned active
organizations, deduplicates event IDs, maps identity-provider lifecycle state into local membership
state, closes role grants on deletion, and records an audit event.

Provision a tenant and its first admin atomically after creating the WorkOS organization:

```bash
PROVISION_WORKOS_ORGANIZATION_ID=org_... \
PROVISION_ORGANIZATION_NAME="Example Health" \
PROVISION_PRODUCT_CONFIGURATION=displace \
PROVISION_ADMIN_WORKOS_USER_ID=user_... \
PROVISION_ADMIN_EMAIL=admin@example.test \
PROVISION_ADMIN_DISPLAY_NAME="Example Admin" \
pnpm db:provision
```

The command requires the migration-owner `DATABASE_URL`; it is an operations command and must not
run inside the web application.

For the declared fictional hackathon audience only, seed eight personas after tenant provisioning:

```bash
DEMO_ORGANIZATION_ID=<provisioned-displace-organization-uuid> pnpm demo:seed-personas
```

The command marks every record `is_seeded_persona=true`, uses `example.test` addresses, and writes a
system audit event. After a release is authorized, the release ledger exposes an explicit fictional
persona runner. It processes only those marked records, uses deterministic declared response
patterns, labels delivery as `simulated`, and remains idempotent for completed assignments. Never use
that control for real people.

## Delivery and learning-system integrations

Postmark delivery requires `POSTMARK_SERVER_TOKEN` and a verified `POSTMARK_FROM_EMAIL`. Configure
delivery and bounce webhooks at `/api/webhooks/postmark` with HTTP Basic authentication username
`supersede` and password `POSTMARK_WEBHOOK_SECRET`. Postmark does not provide an HMAC webhook
signature, so production must also use HTTPS and a Vercel Firewall IP allowlist for Postmark's
published webhook ranges. Webhook bodies and recipient addresses are never logged.

Slack direct delivery requires a bot token in `SLACK_BOT_TOKEN` with `chat:write` and
`users:read.email`. An organization admin verifies and activates the workspace from
`/app/admin/integrations`; the database stores only `env:SLACK_BOT_TOKEN`, never the token. Delivery
looks up the recipient by the already-authorized directory email and opens an app direct message.

The xAPI boundary exports current immutable assessment revisions as xAPI 1.0.3 JSON statements.
Each export creates `integration_job` and row-level `integration_job_item` records. SCORM packaging
is intentionally not enabled: xAPI satisfies the initial LMS boundary and remains the system's one
supported source-of-truth-safe export format unless a target LMS specifically requires SCORM.

HRIS CSV supports preview and apply modes. Quoted fields are parsed correctly, failures are recorded
per row, and full-snapshot deprovisioning affects only people previously imported through the active
HRIS CSV connection. Never enable full snapshot for a partial extract.

## Database changes

Edit the Drizzle schema, then generate a reviewed migration:

```bash
pnpm db:generate
```

Database-native behavior such as RLS, triggers, recursive CTE helpers, vector indexes, and grants
belongs in a named custom SQL migration. Never run `db:push` against shared or production databases.
Production migrations follow expand/migrate/contract sequencing and do not run during application
startup.

`approval_record` and `audit_event` are insert-only at the database layer. Approvals always point to
a version ID; feature work must not weaken that constraint.

## UI and design system

Theme values live in `src/app/globals.css` as OKLCH custom properties. Use semantic utilities such as
`bg-background`, `text-muted-foreground`, `border-border`, `text-success`, and confidence tokens.
Do not add ad hoc hex values or product-wide palette classes in components.

Use components in `src/components/ui` before building custom controls. Extend variants centrally
with class-variance-authority. Keep Server Components as the default and add `"use client"` only at
the smallest interactive boundary.

## API conventions

- External routes live under `/api/v1`.
- Validate inputs with Zod and return RFC 9457-style problem details.
- Include `x-request-id` in every response and log only opaque IDs.
- Require `Idempotency-Key` on workflow-starting writes.
- Authenticate and authorize each handler even when proxy matching is enabled.
- Cookie-authenticated Route Handler mutations must call the same-origin guard; Server Actions use
  the framework's built-in origin protection.
- State transitions, their ApprovalRecord, and outbox events commit in one transaction.

The development OpenAPI document is available at `/api/v1/openapi`.

## Testing

- Vitest: domain utilities, API contracts, and AI schema/eval fixtures.
- Testing Library + axe-core: components and accessibility.
- SQL tests: RLS/trigger/catalog invariants.
- Playwright: desktop/mobile browser-to-API smoke paths and the five-minute demo story.
- MSW: external HTTP mocks. Live model calls are opt-in and never required for ordinary pull
  requests.

Every model or prompt change must update its version and pass a labeled eval. Never replace an
ambiguous result with a forced old/new classification.

## Security and privacy

- Use fictional data only until production privacy and processor gates are complete.
- Do not log source text, probe answers, emails, tokens, cookies, or signed URLs.
- Treat uploaded document instructions as untrusted content.
- Keep object buckets private and issue short-lived signed URLs.
- Store approved WORM exports in S3 Object Lock when policy requires it.
- Do not describe the product as regulator-grade until the approval, retention, and export controls
  are verified.
