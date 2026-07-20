# Technical design

**Product source of truth:** [PRD.md](./PRD.md)

**Deployment unit:** one TypeScript application

**Demo configuration:** Displace

## Stack

| Area | Choice |
| --- | --- |
| Application | Next.js App Router, React, strict TypeScript, Node.js 22.22+ |
| UI | Tailwind CSS, Radix/shadcn primitives, TanStack Table, React Flow, Recharts |
| Database | Neon PostgreSQL, pgvector, RLS, Drizzle ORM, reviewed SQL migrations |
| Identity | WorkOS AuthKit; product roles in PostgreSQL |
| AI | OpenAI Responses API with GPT-5.6 |
| Embeddings | Gemini `gemini-embedding-001`, 768 dimensions |
| Workflows | Inngest with a transactional outbox |
| Working files | Private Cloudflare R2-compatible storage |
| Retained exports | S3 Object Lock when the bucket supports it |
| Observability | Sentry, pino, OpenTelemetry |
| Hosting | Vercel and managed service providers above |

Do not add a graph database, Redis, Kafka, Kubernetes, microservices, a second
runtime, or an agent framework without a measured requirement and an ADR.

## Architecture

```text
Browser
  |
Next.js application
  |-- domain services and policy
  |-- versioned API routes
  |-- Inngest endpoint
  |
  |-- PostgreSQL: tenant state, graph, approvals, audit, vectors
  |-- WorkOS: identity
  |-- OpenAI: governed generation
  |-- Gemini: embeddings
  |-- R2/S3: source files and exports
  `-- Inngest: durable work and schedules
```

Keep one deployable modular monolith. Organize code by domain:

- `identity`: organizations, memberships, roles, policy
- `corpus`: uploads, parsing, versions, chunks, evidence
- `graph`: claims, dependency edges, review, traversal
- `changes`: source changes, validation, propagation
- `cases`: divergence generation and approval
- `learning`: assignments, responses, remediation, rechecks
- `audit`: approvals, events, reports, exports
- `integrations`: external delivery and import/export

Modules expose services. Repositories stay private to their module.

## Data invariants

- Every tenant-owned row carries `organization_id` and is protected by RLS.
- Governed objects use logical identity plus immutable versions.
- Approvals reference object type, object ID, and version ID.
- `approval_record` and `audit_event` are insert-only at the database level.
- Confidence fields are constrained to `0..1` and keep a separate rationale.
- Evidence stores document version, exact quote, location, offsets, and checksum.
- Dependency edges are typed and directional.
- Traversal retains complete paths, handles cycles, and stops at eight hops.
- Aggregate reporting suppresses cohorts below five people.
- Timestamps are stored in UTC.
- Governed records are retired or superseded rather than soft-deleted.

Use one organization enum, `propagate | displace`, across policy, APIs,
background work, and RLS.

## Authentication and authorization

1. WorkOS validates the session and organization identity.
2. The identity service resolves one active internal membership.
3. The request starts a tenant transaction with actor and organization context.
4. Service policy and RLS authorize the operation.

Never trust roles from client input or editable identity metadata. Use the
restricted `supersede_app` database role at runtime. Require recent
authentication for privileged export and retention actions.

## API rules

- External APIs live under `/api/v1`.
- Route Handlers authenticate, validate, authorize, call one service, and map errors.
- Zod schemas generate request validation and OpenAPI contracts.
- Responses use RFC 9457 problem details and `x-request-id`.
- Workflow-starting writes require `Idempotency-Key`.
- Stale version writes return `409 Conflict`.
- A transition, approval, audit event, and outbox event commit in one transaction.
- Webhooks verify signatures and deduplicate provider event IDs.

## AI contracts

Each AI task has a versioned prompt, strict schema, deterministic validation,
and labeled eval set:

| Task | Output |
| --- | --- |
| `claim_extraction_v1` | claims, exact quotes, source references, confidence, locations |
| `load_bearing_v1` | score, class, evidence-grounded rationale |
| `change_diff_v1` | old rule, new rule, population, exclusions, ambiguity |
| `divergence_case_v1` | scenario, answers, rationale, both citations |
| `probe_grade_v1` | `old`, `new`, or `other`, confidence, matched evidence |
| `artifact_feedback_v1` | correction feedback grounded in the approved source |

The application verifies returned quotes against the locked document version.
Invalid output retries once, then enters human review. Store provider response
ID, model, prompt/schema versions, input hashes, chunk IDs, usage, and latency.
Never store hidden chain-of-thought.

Retrieval uses tenant-authorized, version-locked chunks. PostgreSQL combines
pgvector and full-text ranks with reciprocal-rank fusion. Similarity can select
evidence; it cannot authorize a decision.

## Workflows

Inngest handles:

- document indexing and claim extraction;
- validated-change propagation;
- case approval and release;
- probe assignment and grading;
- remediation and due rechecks;
- report generation;
- transactional outbox publication.

Each workflow is idempotent, exposes persisted progress, limits tenant
concurrency, retries bounded failures, and keeps a visible failed state.
Authenticated SSE reports progress with polling fallback.

## Storage and exports

- Quarantine uploads before parsing.
- Accept only listed file types and enforce the 25 MB limit.
- Keep buckets private and issue short-lived signed URLs.
- Use tenant-scoped, version-scoped object keys.
- Capture audit exports from a consistent database snapshot.
- Include PDF, JSON, CSV, manifest, version IDs, and SHA-256 checksums.
- Record storage mode, release SHA, template version, requester, and retention.
- Report WORM retention only after S3 Object Lock succeeds.

## Security and privacy

- Treat documents as untrusted input and ignore embedded instructions.
- Protect against cross-tenant access, IDOR, approval forgery, stale writes, malicious uploads, webhook replay, prompt injection, and export leakage.
- Apply CSP, HSTS, secure cookies, CSRF checks, rate limits, and upload limits.
- Redact content, answers, emails, credentials, cookies, and signed URLs from logs.
- Use fictional data for demos and previews.
- Keep production data out of preview environments.
- Define retention, deletion, legal hold, backup, restore, access review, and incident response before real customer use.

The selected services do not make the product compliant by default. Real PHI
or employee data requires contracts, data-residency review, a DPIA, processor
assessment, and tested operational controls.

## Verification

| Layer | Tooling | Required proof |
| --- | --- | --- |
| Domain | Vitest | policy, state transitions, idempotency, vocabulary |
| Components | Testing Library, axe | controls and accessibility |
| Database | SQL tests | RLS, constraints, append-only records, traversal |
| API | Vitest, MSW, OpenAPI | auth, validation, stale writes, idempotency |
| Browser | Playwright | public routes and authenticated five-minute journey |
| AI | versioned JSONL evals | precision, quotes, ambiguity, grading, reviewer effort |
| Providers | live verifier scripts | real extraction and embedding behavior |

Required local gate:

```bash
pnpm check
pnpm db:test
pnpm eval
pnpm build
pnpm test:e2e
pnpm audit --prod
```

Release credentials must also pass:

```bash
pnpm verify:live-extraction
pnpm verify:live-embedding
```

## Performance and reliability

Initial targets:

- non-AI API and page p95 below 500 ms;
- upload acknowledgment below 2 seconds;
- validated change to impact report below 60 seconds for the demo and below one day in production;
- graph viewport capped at 200 nodes;
- explicit queued, running, partial, failed, and complete states.

Scale PostgreSQL and connection pooling first. Add partitions, read replicas,
dedicated workers, or extracted services only after measurement. Use point-in-
time recovery, restore drills, object versioning, transactional outbox,
idempotent consumers, bounded retries, and visible dead letters.

## Scope

The required hackathon slice is defined in [PRD.md](./PRD.md). Build the core
loop before optional delivery integrations. Deferred work includes source
watchers, real EHR data, advanced OCR, general LMS features, autonomous
approvals, and new infrastructure services.

## ADR required

Create an ADR before:

- replacing PostgreSQL graph traversal;
- adding a second runtime;
- changing identity provider;
- moving retrieval out of PostgreSQL;
- introducing autonomous agents;
- changing approval or version-lock rules;
- enabling named reporting by default.

Production gates include security review, cross-tenant tests, restore drill,
data governance, processor contracts, live AI evals, reviewer usability,
export-language review, SSO/MFA operations, monitoring, and on-call procedures.
