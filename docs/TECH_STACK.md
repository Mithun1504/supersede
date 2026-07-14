# Supersede — Technology Stack and Engineering Plan

**Status:** Proposed implementation baseline  
**Source of truth:** [`PRD.md`](./PRD.md), Rev 2, 2026-07-14  
**Target:** OpenAI hackathon vertical slice with a production-capable path  
**Primary configuration for the demo:** Displace (hospital setting)  
**Commercial v1 configuration:** Propagate (artifact governance only)

## 1. Executive recommendation

Build Supersede as a **modular TypeScript monolith** deployed on Vercel:

- **Next.js App Router + React + TypeScript** for the product UI, backend-for-frontend, and versioned REST endpoints.
- **Neon Postgres** with `pgvector` and Row Level Security; all database access is server-side.
- **WorkOS AuthKit** for human authentication, organization context, MFA, and the enterprise SSO/Directory Sync path; product authorization remains in Postgres.
- **Drizzle ORM plus explicit SQL migrations** for typed application queries without hiding PostgreSQL features such as recursive CTEs, RLS, triggers, and vector indexes.
- **OpenAI Responses API with GPT-5.6** for claim extraction, change-diff normalization, load-bearing classification, divergence-case generation, and constrained probe grading.
- **Gemini Embedding 2 at 768 dimensions + pgvector + PostgreSQL full-text search** for multimodal hybrid corpus retrieval.
- **Inngest** for durable extraction, propagation, report generation, delivery, and due-work dispatch.
- **Private Cloudflare R2** for working source files and artifact versions; **S3 Object Lock** for approved regulated export bundles requiring WORM retention.
- **Vercel + Neon + WorkOS + R2/S3 + Inngest Cloud** for the deployment; no Kubernetes, microservices, Kafka, or dedicated graph database.

This is the smallest coherent stack that supports the PRD's hard requirements: tenant isolation, evidence spans, a dependency graph, version locking, mandatory approval gates, append-only audit records, long-running AI work, scheduled rechecks, and a five-minute demonstrable workflow.

## 2. Architectural principles derived from the PRD

These principles are requirements, not preferences:

1. **AI proposes; authenticated humans authorize.** Model output never validates a ChangeEvent, approves a dependency edge, releases a case, or mutates a governed artifact.
2. **Evidence is first-class data.** Every extracted claim and dependency stores the source version, quoted span, stable location, confidence, extraction run, prompt version, model identifier, and review state.
3. **Approved objects are immutable.** Editing an approved case, artifact, source, or report input creates a new version. Approval records point to a specific immutable version.
4. **Audit describes observable events only.** The domain vocabulary is `assigned`, `opened`, `assessed`, `remediated`, and `rechecked`; it does not infer belief, knowledge, or competence.
5. **Ambiguity becomes workflow, not a guessed label.** Low-confidence extraction and `other/ambiguous` probe answers enter a review queue.
6. **Configuration boundaries are enforced in code and data.** Propagate tenants cannot access people, probes, or remediation features. A UI feature flag alone is insufficient.
7. **The graph remains relational.** The expected graph is explainable, moderately sized, and rich in versioned business records. PostgreSQL recursive queries are a better fit than introducing a second database.
8. **No real clinical data in the hackathon.** Use the fictional corpus and seeded personas described in the PRD. Production handling of PHI/PII requires contractual, security, retention, and regional-deployment review.

## 3. System context and component boundaries

```text
Browser / mobile web
        |
        v
Next.js application on Vercel
  - React product surfaces
  - Route Handlers / service layer
  - authorization and policy checks
  - Inngest function endpoint
        |
        +-------------------+---------------------+
        |                   |                     |
        v                   v                     v
Neon Postgres            Inngest Cloud         OpenAI API
  Postgres + pgvector      durable workflows     Responses API / GPT-5.6
  RLS + domain state       retries / schedules
        |                  concurrency limits
        v
WorkOS AuthKit + Cloudflare R2 + S3 Object Lock + Gemini Embedding 2
        |
        v
Optional delivery/integration adapters
  Postmark email | Slack | HRIS/LMS import/export
```

The application should be organized by domain modules rather than by infrastructure concerns:

- `identity`: organizations, memberships, roles, tenant policy.
- `corpus`: uploads, parsing, source/artifact versions, chunks, evidence locations.
- `graph`: claims, typed edges, review queue, traversal, impact classification.
- `changes`: ChangeEvent drafting, second-person validation, propagation runs.
- `cases`: divergence generation, expert review, approval, retirement.
- `learning`: assignments, probes, responses, artifact-correction exercises, rechecks.
- `audit`: approvals, append-only events, dashboards, export bundles.
- `integrations`: email, Slack, HRIS import, LMS/xAPI/SCORM export.

All modules run in one deployable application for the hackathon. Boundaries should be enforced with service-layer APIs so a high-volume parser or delivery worker can be extracted later without rewriting the domain.

## 4. Major technology decisions

### 4.1 Language and runtime

| Decision | Selection |
|---|---|
| Technology | TypeScript in strict mode on the active Node.js LTS, pinned in `.nvmrc` and `package.json#engines` |
| Purpose | One language for browser UI, API, background workflows, schemas, tests, and scripts |
| Why this fits | Shared types and Zod schemas reduce boundary mistakes in a workflow with many versioned states. The team can build the vertical slice without maintaining a separate Python service. |
| Alternatives | Python/FastAPI is strong for document/ML pipelines; Go is strong for services. Both create a second runtime without solving a PRD requirement. |
| Notes/trade-offs | Use Node-compatible parsing libraries and keep parser interfaces replaceable. Add a Python worker only if production OCR/table extraction quality proves Node tooling insufficient. Do not add it pre-emptively. |

Use `pnpm` with a committed lockfile. Pin exact major versions and use Dependabot or Renovate after the hackathon. Do not build a Turborepo initially; there is one product and one deployable unit.

### 4.2 Frontend architecture and UI

| Decision | Selection |
|---|---|
| Framework | Next.js App Router, React, TypeScript |
| UI system | Tailwind CSS + shadcn/ui primitives backed by Radix UI |
| Data-heavy UI | TanStack Table; Recharts for audit summaries |
| Graph visualization | `@xyflow/react` (React Flow) |
| Forms and validation | React Hook Form + Zod |
| Server-state policy | Server Components for initial reads; Route Handlers/server mutations plus targeted TanStack Query only for polling or optimistic interactions |

**Purpose.** Provide the graph review surface, ChangeEvent wizard, blast-radius report, case approval screen, mobile probe/remediation experience, and audit dashboard in one responsive application.

**Why this is the best fit.** The demo needs fast UI iteration, strong accessibility primitives, SSR for quick first paint, and an integrated backend. React Flow handles interactive node/edge inspection while the canonical graph stays in PostgreSQL. Server Components reduce client-side plumbing for read-heavy regulated workflows.

**Alternatives considered.** A separate Vite SPA plus FastAPI gives clearer deployment separation but doubles authentication, validation, and API work. Material UI accelerates generic screens but is harder to make visually distinctive. D3 offers maximum graph control but would consume hackathon time on interaction mechanics already supplied by React Flow.

**Implementation notes and trade-offs.**

- Render only a relevant subgraph for a ChangeEvent, not the whole tenant graph. Cluster by artifact and cap initial nodes to protect browser performance.
- Every confidence value needs a textual label and rationale; color must not be the only signal.
- Evidence-span clicks open a side-by-side viewer at the exact quoted location.
- Keep probes mobile-first, keyboard accessible, and completable in 2–4 minutes.
- Target WCAG 2.2 AA. Use Radix focus management, semantic headings, visible focus, and automated `axe` checks.
- Do not expose internal AI chain-of-thought. Show concise stored rationales, evidence, confidence, and reviewer actions.
- Use configuration-aware navigation. Server authorization must independently enforce every Displace-only route.

### 4.3 Backend framework and API design

| Decision | Selection |
|---|---|
| Framework | Next.js Route Handlers on the Node.js runtime |
| Internal design | Domain services + repositories + policy functions; thin HTTP handlers |
| API style | REST/JSON under `/api/v1` for integrations; server-side service calls for first-party pages |
| Contracts | Zod request/response schemas; OpenAPI generated from the same schemas |
| Idempotency | Required `Idempotency-Key` for workflow-starting and integration write endpoints |

**Purpose.** Provide stable endpoints for uploads, review actions, ChangeEvents, approvals, assignments, responses, reports, and external integrations.

**Why this is the best fit.** Route Handlers keep the hackathon to one deployable application while supporting standard HTTP methods and webhook endpoints. A domain-service layer prevents business rules from being trapped in React components or route files.

**Alternatives considered.** NestJS is structured but adds framework ceremony. FastAPI would be appropriate if a substantial Python processing service were already required. GraphQL is unnecessary for the small number of explicit workflow screens and complicates authorization and caching.

**Implementation notes and trade-offs.**

- Route handlers authenticate, validate, authorize, call one domain service, and map errors. They must not contain workflow logic.
- Use transactions for state transition + ApprovalRecord + outbox event.
- Every mutation accepts the current `version` or ETag and fails with `409 Conflict` on stale writes.
- External endpoints return opaque IDs, never storage paths or cross-tenant identifiers.
- Verify webhook signatures and persist provider event IDs for deduplication.
- Maintain an `outbox_event` table so committed domain changes reliably emit Inngest events.
- Use RFC 9457-style problem details for API errors.

### 4.4 Database and data modelling

| Decision | Selection |
|---|---|
| Database | Neon managed PostgreSQL with `pgvector` |
| ORM | Drizzle ORM for types and common queries |
| Database-native work | Version-controlled SQL migrations for RLS, triggers, recursive CTEs, full-text search, and vector indexes |
| Tenant isolation | `organization_id` on all tenant-owned rows + PostgreSQL Row Level Security |
| IDs | Database-generated UUIDs |

**Purpose.** Store the governed corpus, dependency graph, people mapping, workflow states, approvals, and audit history in a transactional system.

**Why this is the best fit.** Postgres is explicitly required by the PRD, supports graph traversal through recursive CTEs, supports hybrid retrieval through FTS and pgvector, and can atomically commit a business transition and its audit record. Neon adds isolated branches for local, preview, and test environments without coupling auth and storage to the database provider.

**Alternatives considered.** Neo4j improves arbitrary graph exploration but would duplicate tenant, version, approval, and transactional data and create cross-database consistency problems. MongoDB is a poor fit for relational approval joins. Prisma is productive for basic CRUD but requires more escape hatches around pgvector, RLS, and graph SQL; Drizzle stays closer to PostgreSQL.

#### Recommended logical schema

The PRD's model should be normalized into logical identities and immutable versions:

- `organization`, `organization_settings`, `membership`, `role`, `membership_role`.
- `source`, `source_version`; status and effective dates live on the version.
- `artifact`, `artifact_version`; original file hash and storage object reference live on the version.
- `document_chunk`; extracted text, page/section, character offsets, checksum, embedding, FTS vector.
- `claim`, `claim_version`; exact quote, normalized claim, confidence, load-bearing score/rationale, extraction metadata.
- `dependency_edge`, `dependency_edge_version`; typed `from`/`to` references, evidence location, confidence, review status.
- `role_artifact_exposure`; supports Displace potential-exposure mapping without claiming person knowledge.
- `change_event`, `change_event_version`, `change_impact`.
- `divergence_case`, `divergence_case_version`; old/new answers, both citations, rationale, ambiguity/retirement state.
- `probe_assignment`, `probe_delivery_event`, `probe_response`.
- `remediation_assignment`, `remediation_attempt`, `recheck_assignment`.
- `approval_record`, `audit_event`, `report_bundle`, `workflow_run`, `outbox_event`.

#### Non-negotiable modelling rules

- An approval references `{object_type, object_id, object_version_id}`. Never approve a mutable logical ID alone.
- `approval_record` and `audit_event` are insert-only. The application role receives no `UPDATE` or `DELETE` privilege; a database trigger rejects mutation as defense in depth.
- The same actor cannot both submit and validate a ChangeEvent. Enforce separation of duties in the database/service transaction, not only in the UI.
- Confidence and scores use constrained numeric columns (`0 <= value <= 1`) and store a human-readable rationale separately.
- Evidence stores `document_version_id`, exact quote, page/section, start/end offsets, and the chunk/file checksum. Offsets alone are not sufficient after a document changes.
- Edges are typed and directionally explicit. Recursive traversal tracks visited IDs, rejects cycles in paths where cycles are invalid, and applies a configured maximum depth.
- Individual probe visibility is an organization policy. Aggregate queries must enforce minimum cohort size before returning breakdowns.
- Use database timestamps in UTC and retain the user's display timezone separately.
- Soft deletion is not versioning. Governed records are retired/superseded; storage retention follows policy.

### 4.5 Authentication and authorization

| Decision | Selection |
|---|---|
| Authentication | WorkOS AuthKit |
| Production identity | Hosted sign-in for the hackathon; MFA for privileged roles; SAML/OIDC SSO and Directory Sync for enterprise tenants |
| Authorization | Organization membership + explicit domain roles + RLS + service-layer policy checks |
| Session handling | Secure, HTTP-only cookies via WorkOS AuthKit's server-side Next.js integration |

**Purpose.** Associate every review, validation, approval, release, assessment, and export with an authenticated actor while preventing cross-tenant access.

**Why this is the best fit.** WorkOS matches the enterprise hospital/pharma buyer and provides a direct SSO/Directory Sync path. The BFF verifies the session, resolves the internal membership, and sets transaction-local actor/organization context before querying Neon. WorkOS identity is never the source of truth for product roles or separation-of-duties policy.

**Alternatives considered.** Clerk has polished organizations and fast UI but less advantage for this enterprise governance buyer. Auth0 is mature but heavier. Supabase Auth couples identity to a database platform whose free project/environment model does not fit the four-product workspace. Do not build custom SSO or SCIM.

**Roles.** Start with `org_admin`, `change_owner`, `change_validator`, `edge_reviewer`, `case_approver`, `release_authorizer`, `auditor`, and `learner`. One membership may hold multiple roles, but the separation-of-duties policy still applies per object.

**Implementation notes and trade-offs.**

- Never trust a role passed by the client or stored only in user-editable JWT metadata.
- Service credentials are server-only and bypass RLS only inside tightly scoped repositories.
- Require recent authentication/MFA for report export, retention changes, and privileged approval actions.
- Propagate tenants must be denied access to person/probe tables by server policies and RLS, not only hidden navigation.
- Access to individual results is a separate policy permission from case approval or release.
- Before production, define joiner/mover/leaver behavior and add SCIM/HRIS deprovisioning tests.

### 4.6 OpenAI and AI integration

| Decision | Selection |
|---|---|
| API | OpenAI Responses API using the official `openai` JavaScript SDK |
| Primary model | `gpt-5.6` (GPT-5.6 Sol alias) for the PRD-mandated extraction, divergence, and grading workflows |
| Embeddings | `gemini-embedding-2` at 768 dimensions |
| Output control | Strict JSON Schema Structured Outputs generated from versioned Zod schemas |
| Orchestration | Application-owned workflows in Inngest; no autonomous agent loop for governed decisions |
| Development requirement | Use Codex 5.6 as the hackathon coding agent; keep application runtime model configuration separate |

**Purpose.** Extract claims and supported-by edges, normalize old/new rules, score load-bearing dependencies, create cited divergence cases, and classify probe responses as `old`, `new`, or `other`.

**Why this is the best fit.** GPT-5.6 supports the Responses API and Structured Outputs for governed reasoning. Gemini Embedding 2 maps text, images, audio, video, and supported documents into one space, which fits mixed policy/training corpora. At 768 dimensions it fits pgvector's normal HNSW `vector` index. Schema constraints and evidence checks remain authoritative; no approval decision depends on embedding similarity alone.

**Alternatives considered.** Hosted OpenAI File Search would be fast for generic RAG, but the PRD already requires pgvector and the audit design needs tenant-owned chunks, stable offsets, versioning, and reproducible evidence. The Agents SDK is useful for open-ended tool use but adds no value to the fixed, auditable workflow. LangChain/LlamaIndex are not needed for a small number of explicit model calls and would obscure inputs and provenance. A smaller GPT-5.6 family variant can be introduced only after evals show it preserves quality.

#### AI task contracts

Each task gets its own prompt, schema, eval set, and model settings:

1. `claim_extraction_v1`: returns claims, exact quotes, candidate source references, confidence, and evidence locations.
2. `load_bearing_v1`: returns score, class, and short evidence-grounded rationale.
3. `change_diff_v1`: returns old rule, new rule, affected population, exclusions, and unresolved ambiguity.
4. `divergence_case_v1`: returns scenario, old answer, new answer, rationale, and citations to both approved source versions.
5. `probe_grade_v1`: returns `old | new | other`, confidence, matched rationale, and ambiguity reason.
6. `artifact_feedback_v1`: returns feedback grounded only in the approved new source and exercise rubric.

#### Guardrails and provenance

- Retrieval provides only version-locked, tenant-authorized chunks. The prompt instructs the model to abstain when evidence is insufficient.
- Validate every model response with Zod and deterministic domain rules. Invalid responses retry once with the validation error, then enter human review.
- Verify returned quotes by exact/fuzzy matching against the cited document version. A quote the application cannot locate is not stored as verified evidence.
- Store the OpenAI response ID, model ID, prompt version, schema version, reasoning setting, input document hashes, retrieval chunk IDs, token usage, latency, and validation outcome.
- Do not store hidden chain-of-thought. Store only requested concise rationales and evidence.
- Version prompts in source control and in the database execution record.
- Model confidence is not calibrated probability. Display it as an extraction aid and measure it against labeled data before setting thresholds.
- Free-text grading may return `other`; it must never be coerced to old/new to improve dashboard completion.
- Learner-facing cases require human approval regardless of model confidence.
- Use an environment variable such as `OPENAI_PRIMARY_MODEL=gpt-5.6`; changing it requires an eval run and an engineering approval record.
- If OpenAI offers a stable snapshot for the chosen model in the target account, pin it for production reproducibility. Otherwise record the exact resolved model metadata returned by the API and re-run evals on alias changes.

#### Cost and latency controls

- Chunk by semantic section and retrieve a small evidence set; do not send an entire corpus on every call.
- Cache extraction by `{file_hash, parser_version, prompt_version, model}`.
- Run independent document extractions concurrently under per-tenant and global limits.
- Use prompt caching where repeated source context qualifies.
- Keep GPT-5.6 Sol for high-stakes generation during the hackathon. Evaluate Terra/Luna or batch processing later for low-risk normalization and bulk backfills.
- Set token and dollar budgets per organization/run and stop with a visible partial-failure state rather than silently skipping documents.

### 4.7 File storage and document processing

| Decision | Selection |
|---|---|
| Working object storage | Cloudflare R2, private environment-specific buckets |
| Regulated export storage | Amazon S3 with Object Lock for approved WORM bundles |
| Parsing | `pdfjs-dist` for text PDFs, `mammoth` for DOCX, `xlsx`/SheetJS for spreadsheets, and native parsers for text/Markdown/HTML |
| Packaging | `jszip` for checksummed audit bundles and the initial SCORM export |
| Integrity | SHA-256 for every uploaded file, extracted-text artifact, and report member |

**Purpose.** Preserve original sources, create traceable text/chunks, and emit verifiable report bundles.

**Why this is the best fit.** R2 provides inexpensive private S3-compatible working storage with signed access and lifecycle rules. S3 Object Lock supplies the WORM retention semantics that regulated approved bundles may require. Format-specific parsers preserve page/section information better than converting everything to unlocated plain text.

**Alternatives considered.** Using S3 for every object is viable but adds AWS configuration to the hackathon's working path. R2 alone does not provide the selected regulated WORM export control. Unstructured.io or cloud document AI can improve OCR/layout extraction but transfers sensitive documents to another processor and introduces cost. Add a specialist parser only after measuring failures on buyer corpora.

**Processing pipeline.**

1. Validate declared MIME type, detected file signature, extension, size, and tenant quota.
2. Stream to a private quarantine bucket and compute SHA-256.
3. In production, malware-scan before promotion; the hackathon accepts only curated seeded files and clearly marks this limitation.
4. Create an immutable document version and store the original.
5. Parse into layout-aware text blocks with page/section/table coordinates.
6. Normalize whitespace without changing the stored original offsets; keep a mapping if normalization changes positions.
7. Chunk, embed, and index.
8. Run claim extraction and quote verification.
9. Persist a parser/extractor manifest and expose any unsupported pages or parsing warnings to reviewers.

Scanned PDFs require an OCR path. For the vertical slice, reject or visibly flag image-only documents; do not claim full ingestion coverage. A production OCR adapter can use an approved document-AI service or rendered-page vision extraction after privacy review.

### 4.8 Search, indexing, retrieval, and graph traversal

| Decision | Selection |
|---|---|
| Semantic index | pgvector HNSW index on 768-dimensional Gemini Embedding 2 vectors |
| Lexical index | PostgreSQL `tsvector` + GIN |
| Ranking | Hybrid semantic/lexical retrieval with reciprocal-rank fusion, followed by deterministic filters |
| Graph engine | Typed adjacency tables + recursive CTEs |

**Purpose.** Find candidate evidence and source links, then traverse validated dependencies for the blast radius.

**Why this is the best fit.** Semantic search catches paraphrases, lexical search preserves exact thresholds/citations, and relational filters guarantee tenant/version/status constraints. Graph paths remain inspectable SQL joined directly to approvals and evidence.

**Alternatives considered.** Elasticsearch/OpenSearch is unnecessary at hackathon scale. Pinecone duplicates vector data and complicates version/tenant consistency. Neo4j is unnecessary for the constrained dependency traversal.

**Implementation notes and trade-offs.**

- Apply `organization_id`, approved source version, object status, and access-policy filters before results can enter a model prompt.
- Keep embeddings on chunks, not whole documents.
- Exact numerical and citation tokens receive lexical weight; embeddings alone are unsafe for changed thresholds.
- Store index/model versions so re-embedding can run side-by-side and switch atomically.
- A blast radius begins from validated source/version changes and follows only active, reviewed edges by default. Unreviewed candidates appear separately.
- Return the complete path and evidence for each impacted artifact/person, not just an unexplained score.

### 4.9 Background jobs and workflow orchestration

| Decision | Selection |
|---|---|
| Platform | Inngest Cloud and TypeScript SDK; local Inngest dev server |
| Triggering | Transactional outbox events emitted after database commit |
| Delayed work | `due_at` rows in Postgres; daily Inngest cron dispatches due 30/90-day rechecks |
| Progress | `workflow_run`/`workflow_step` projections in PostgreSQL, delivered by SSE with polling fallback |

**Purpose.** Run document parsing, extraction, embedding, graph propagation, divergence generation, exports, notifications, and delayed rechecks outside request timeouts with retries and visible state.

**Why this is the best fit.** Inngest provides durable, independently retriable steps and schedules while keeping workflow code in TypeScript and avoiding queue/worker infrastructure. Postgres retains workflow truth. Rechecks use `due_at` plus a daily dispatcher rather than 30/90-day sleeps, so the design works within Inngest's free seven-day sleep limit and remains portable.

**Alternatives considered.** Trigger.dev is a credible equivalent. Temporal is more powerful but operationally and conceptually excessive for the hackathon. BullMQ requires Redis and an always-on worker. Vercel Cron alone does not provide multi-step durability or per-step retry state.

**Required workflows.**

- `document.ingested`: parse -> chunk -> embed -> extract -> verify quotes -> queue reviews.
- `change.validated`: compute graph paths -> classify impacts -> persist report -> optionally generate draft cases.
- `case.approved`: lock version -> await release authorization -> create assignments.
- `probe.assigned`: send through configured adapter -> record provider delivery events.
- `probe.completed`: grade -> route ambiguity or assign remediation.
- `remediation.passed`: insert distinct-case rechecks with 30/90-day `due_at` values; a daily cron emits work for due rows.
- `report.requested`: take a consistent data snapshot -> render -> hash -> write immutable bundle and manifest.

All handlers must be idempotent. Use stable domain event IDs and database uniqueness constraints. AI retry steps should not duplicate stored model runs or approvals. Limit concurrency per tenant so one large corpus cannot starve other organizations.

Use separate production, branch, and local Inngest environments. Cloud usage is pooled:
the Hobby allowance is 50,000 executions and five concurrent steps, and every function
run plus each step consumes quota. The UI must expose quota-paused/failed work rather
than implying that a governed workflow completed.

### 4.10 Real-time communication and delivery

| Decision | Selection |
|---|---|
| Product realtime | No permanent WebSocket layer in v1 |
| Job feedback | Authenticated Server-Sent Events with polling fallback |
| Email | Postmark adapter with signed delivery webhooks |
| Slack | Slack app/webhook adapter after the core in-app flow works |
| Demo delivery | In-app seeded-persona runner, visibly labeled as simulated |

**Purpose.** Give reviewers job progress and deliver probe assignments with observable evidence.

**Why this is the best fit.** The PRD does not require collaborative editing or chat. SSE uses the existing authenticated HTTP boundary and polling recovers missed events; clients always refetch the durable run projection. Delivery is adapter-based because email, Slack, and LMS evidence have different semantics.

**Alternatives considered.** Socket.IO/Pusher add stateful infrastructure without a current requirement. Resend is a viable email alternative; Postmark is selected for mature transactional-delivery event handling.

Record `assigned`, provider-accepted, delivered/bounced, opened when available, and in-app completed as separate events. Email-open pixels are privacy-sensitive and unreliable; never treat an open as assessment completion. For the hackathon, seeded persona activity must not be represented as real provider delivery.

### 4.11 Reporting and exports

| Decision | Selection |
|---|---|
| Dashboard | Server-rendered React + TanStack Table + Recharts |
| PDF generation | Playwright/Chromium rendering of a versioned HTML report template |
| Bundle | ZIP containing PDF, CSV/JSON evidence, manifest, and SHA-256 checksums |
| LMS | Minimal xAPI statement export first; SCORM 1.2 package adapter only if the demo needs it |

**Purpose.** Provide the FR-11 dashboard and exportable, verifiable evidence trail.

**Why this is the best fit.** Reusing the HTML/CSS report layout keeps the screen and PDF consistent. A manifest with checksums is transparent and testable; a blockchain or bespoke signing system is not necessary.

**Alternatives considered.** React PDF is deterministic but requires a second layout implementation. Server-side office documents are not a PRD requirement. Full LMS integration is too broad for the hackathon.

The report template must use an allow-list vocabulary and a test that fails on prohibited claims such as `belief`, `knows`, or `competent`. Exports include the report query cutoff, tenant, ChangeEvent version, included object versions, approvals, generation software version, and checksum manifest. A checksum proves bundle integrity after creation; it does not by itself prove regulatory acceptance.

### 4.12 Hosting, deployment, and infrastructure

| Layer | Selection | Rationale and trade-off |
|---|---|---|
| Web/API | Vercel | Zero-ops Next.js previews and rapid hackathon deployment. Long work stays in Inngest. |
| Database | Neon Postgres | PostgreSQL/pgvector, pooling, backups, and isolated branches for preview/test environments. |
| Authentication | WorkOS AuthKit | Enterprise organization identity, MFA, SSO, and Directory Sync path. |
| Working storage | Cloudflare R2 | Private source/artifact buckets with signed access and lifecycle rules. |
| Regulated exports | Amazon S3 Object Lock | WORM retention for approved bundles when policy requires it. |
| Workflows | Inngest Cloud | Durable serverless orchestration without a managed queue/worker fleet. |
| DNS/TLS | Vercel-managed TLS | Sufficient initially; enterprise custom-domain controls can follow. |
| Infrastructure as code | SQL migrations + `vercel.json` + Inngest code; Terraform deferred | The initial footprint is small. Add Terraform/Pulumi when multiple regions/accounts make drift material. |

**Alternatives considered.** AWS-native ECS/RDS/S3/SQS/Step Functions offers maximum enterprise control but would dominate the hackathon. Fly.io/Render are good for persistent workers, which this design avoids. Kubernetes is specifically rejected until scale and organizational ownership justify it.

Deploy in a single region close to the chosen Neon/R2/S3 regions. Confirm data residency and subprocessors with a real buyer before production. Use Neon branches and isolated synthetic R2 prefixes/buckets for previews; never copy production data into previews.

### 4.13 Security, privacy, and secrets

| Area | Selection |
|---|---|
| Secrets | Vercel encrypted environment variables for deploys; `.env.local` ignored locally; 1Password or equivalent team vault for human custody |
| Tenant isolation | RLS plus service-layer authorization and tenant-scoped storage paths |
| Encryption | Provider-managed TLS in transit and encryption at rest; application-level field encryption considered for unusually sensitive identifiers |
| Audit integrity | Insert-only DB permissions/triggers, immutable versions, export hashes, separation of duties |
| Dependency security | lockfile, Dependabot/Renovate, CodeQL, secret scanning, `pnpm audit` as a signal rather than a sole gate |

**Purpose.** Protect regulated content, personal assessment data, credentials, and the integrity of approvals.

**Implementation requirements.**

- Threat-model cross-tenant reads, IDOR, approval forgery, stale-version approval, malicious uploads, prompt injection in documents, webhook replay, export leakage, and over-broad service-role use.
- Treat uploaded text as untrusted data. Prompts delimit document content and prohibit following instructions embedded in it.
- Use signed, short-lived object URLs. Do not expose a public storage bucket.
- Apply CSP, HSTS, secure cookies, CSRF protection for cookie-authenticated writes, rate limits, and upload limits.
- Redact document text, probe answers, emails, tokens, and signed URLs from logs and error payloads.
- Separate employee/person identifiers from corpus content where possible; use pseudonymous seeded personas in all demos.
- Define retention by data class: originals, derived text, model runs, probe responses, audit records, and exports may require different policies.
- A tenant retention change is privileged and audited. Legal hold must override deletion jobs.
- Complete a DPIA/privacy review and employment-law review before individual-level reporting in real deployments.
- Production use with PHI requires BAA/contract verification for every processor, regional and retention review, incident-response procedures, access reviews, and validated backup/restore. The selected stack is not automatically compliant merely by configuration.
- Rotate provider keys, scope them per environment, and document revocation. Never put the OpenAI key in browser code.

### 4.14 Logging, monitoring, and error tracking

| Decision | Selection |
|---|---|
| Error tracking | Sentry for Next.js client/server errors and releases |
| Structured logs | `pino` JSON logs with request/run correlation IDs |
| Tracing | OpenTelemetry instrumentation across HTTP, database, Inngest, and OpenAI calls |
| Product operations | PostgreSQL workflow/model-run tables + Inngest dashboard |
| Availability | Better Stack or equivalent external uptime checks after the demo |

**Purpose.** Diagnose failures without leaking regulated content and measure the PRD's latency, reviewer effort, and workflow completion targets.

**Why this is the best fit.** Sentry is fast to integrate and useful during the hackathon; OpenTelemetry prevents permanent lock-in for traces. Domain metrics belong in the product database because they are auditable business facts, not only infrastructure telemetry.

**Required metrics.**

- extraction success/failure, duration, tokens/cost, and validated precision sample;
- reviewer minutes and claims reviewed per corpus;
- quote-verification failure and low-confidence queue rates;
- ChangeEvent validation-to-report latency;
- graph nodes/edges/path depth and traversal duration;
- case draft-to-approval/retirement rates;
- assigned/opened/assessed/remediated/rechecked counts;
- ambiguous grading rate;
- outbox lag, workflow retries/dead letters, email bounces;
- API latency/error rate and database/storage utilization.

Telemetry must use opaque object IDs and classifications rather than raw document text or learner answers.

### 4.15 Testing and AI evaluation

| Layer | Tools | Required coverage |
|---|---|---|
| Unit/domain | Vitest | State transitions, separation of duties, scoring, banned vocabulary, idempotency |
| Component | React Testing Library + `user-event` + axe | Review queue, approval controls, evidence viewer, mobile probe accessibility |
| Database | Local Postgres + pgTAP/SQL tests | RLS, insert-only audit tables, constraints, recursive traversal, tenant isolation |
| API/contract | Vitest + generated OpenAPI checks + MSW | Auth failures, stale versions, idempotency, webhooks |
| End-to-end | Playwright | Complete five-minute demo and critical negative authorization paths |
| AI evals | Versioned fixture runner + labeled JSONL datasets | Extraction precision, citation validity, ambiguity handling, divergence correctness, grading agreement |
| Performance | k6 after vertical slice | Upload, dashboard, traversal, and concurrency budgets |

**AI evaluation is a release gate, not a demo afterthought.** Create a small labeled dataset from all seeded documents plus adversarial cases: conflicting citations, tables, negation, superseded versions, prompt injection, no-answer text, and ambiguous probe responses. Compare each prompt/model change against the baseline. Track precision per edge and median/P95 reviewer time, because the PRD explicitly rejects precision achieved by excessive review.

Mock OpenAI at unit/component layers with recorded schema-valid fixtures. Run a small, opt-in live eval suite in CI or staging when `OPENAI_API_KEY` is available. Never make every pull request depend on nondeterministic live model output. The demo E2E suite may pre-warm fixtures but the actual presentation must include the PRD-required live extraction.

### 4.16 Development tooling and local setup

| Decision | Selection |
|---|---|
| Package manager | `pnpm`, pinned through Corepack |
| Type checking | TypeScript `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| Lint/format | ESLint with Next.js rules + Prettier |
| Git hooks | Husky + lint-staged for changed files only |
| Local services | PostgreSQL in Docker + MinIO for S3-compatible storage + Inngest dev server |
| Schema/migrations | Drizzle Kit for typed schema generation plus reviewed SQL migrations |
| API inspection | Generated OpenAPI file and a lightweight docs route in development only |
| Coding agent | Codex 5.6, following repository `AGENTS.md` and project verification commands |

Recommended commands:

```bash
corepack enable
pnpm install
docker compose up -d postgres minio
pnpm db:migrate
pnpm dev
pnpm inngest:dev
pnpm test
pnpm test:e2e
pnpm eval
```

Provide `.env.example` with names and descriptions, never values. Validate environment variables at startup with Zod. Seed commands must create the fictional hospital corpus, eight declared test personas, roles, predetermined response patterns, and demo users with distinct approval roles.

### 4.17 Source control and CI/CD

| Decision | Selection |
|---|---|
| Repository | GitHub, single repository |
| Workflow | Trunk-based development, short feature branches, pull requests, protected `main` |
| CI | GitHub Actions |
| Deploys | Vercel preview per pull request; staging migration before production promotion |
| Releases | Conventional commit style optional; immutable application release SHA stored with model/report runs |

**Required CI jobs.**

1. install from frozen lockfile;
2. lint, format check, and TypeScript check;
3. unit/component tests;
4. start local PostgreSQL and run migrations, pgTAP/RLS, integration tests;
5. build the Next.js production bundle;
6. Playwright smoke test against preview/staging;
7. dependency, secret, and CodeQL scans;
8. opt-in live AI eval on prompt/model changes;
9. migration policy check forbidding destructive production changes without an expand/migrate/contract plan.

Production database migrations run as an explicit deployment job, not opportunistically on application startup. Backward-compatible migrations deploy before code that depends on them. Require review from a domain owner for prompt/schema changes and from a database/security owner for RLS or audit-table changes.

## 5. End-to-end workflow implementation

### 5.1 Corpus ingestion and extraction

1. Reviewer uploads or pastes an artifact/source.
2. API creates a document version in `quarantined` state and an outbox event.
3. Inngest verifies/scans, parses, chunks, embeds, and runs `claim_extraction_v1`.
4. The service verifies each evidence quote against the immutable document version.
5. High-confidence, quote-valid candidates appear as `suggested`; they are not silently approved.
6. Low-confidence or failed-verification items enter the review queue with warnings.
7. Reviewer accepts, edits by creating a reviewed version, or rejects each edge.
8. The live demo streams or polls these states and shows three extracted claims with quoted spans.

### 5.2 Change validation and propagation

1. `change_owner` drafts old/new source-version links and the machine-readable diff.
2. A distinct `change_validator` verifies both versions and validates the ChangeEvent.
3. The transaction inserts `ApprovalRecord(action=validated)` and an outbox event.
4. Inngest traverses active reviewed edges, records complete paths, and classifies load-bearing/peripheral impacts.
5. The report distinguishes reviewed impacts from low-confidence candidates and maps role exposure only for Displace.
6. Draft divergence cases are generated from locked old/new evidence but cannot be assigned.

### 5.3 Case approval, release, and learner flow

1. Expert reviews both citations, scenario, answers, rationale, and ambiguity.
2. Approval locks that exact case version. Any edit creates a new draft version.
3. A separately authorized release action creates assignments for affected users.
4. The learner receives a cold probe without revealing the changed rule.
5. Deterministic answers use the case rubric; free text uses constrained grading and routes `other` to review.
6. An old-rule assessed response creates an artifact-correction exercise grounded in the new source.
7. A passed exercise inserts 30/90-day `due_at` rechecks using a different approved case from the same divergence; daily dispatch picks them up.

### 5.4 Audit export

1. Authorized requester selects a ChangeEvent and cutoff time.
2. A repeatable-read transaction captures all referenced immutable versions and events.
3. Workflow renders observable-term aggregates and permitted per-person details.
4. Bundle contains the PDF, machine-readable evidence, approvals, version manifest, and checksums.
5. Bundle is written to S3 Object Lock when WORM retention is required; its hash, release SHA, template version, retention mode, and requester are recorded.

## 6. Configuration split

Use an organization-level enum `product_configuration = propagate | displace`, not scattered booleans.

| Capability | Propagate | Displace |
|---|---:|---:|
| Corpus, sources, artifacts, claims, graph | Yes | Yes |
| Manual ChangeEvents and blast radius | Yes | Yes |
| Artifact remediation and audit | Yes | Yes |
| People/role exposure mapping | No | Yes |
| Divergence cases and probes | No | Yes |
| Remediation exercises and rechecks | No | Yes |

Policy functions, API authorization, background event handlers, and RLS must all check this configuration. Avoid importing real people data into Propagate tenants at all.

## 7. Performance, scalability, reliability, and cost

### Initial targets

- Interactive page/API P95 below 500 ms where no AI or file processing is involved.
- Upload acknowledgment below 2 seconds; processing is asynchronous.
- ChangeEvent-to-report remains well inside the PRD's one-day target; hackathon corpus target below 60 seconds after validation.
- Graph UI initially renders at most 200 nodes; server-side traversal may process more.
- Every workflow exposes queued/running/partial/failed/completed states and a safe retry action.

### Scaling path

1. Scale PostgreSQL vertically and add connection pooling before adding services.
2. Partition the largest append-only tables by time/tenant only after measured need.
3. Tune HNSW indexes and use filtered/hybrid retrieval; re-embed asynchronously.
4. Apply Inngest tenant concurrency, throttling, and priority controls.
5. Move CPU-heavy parsing to a dedicated worker only when serverless limits are measured.
6. Extract delivery/report services only if they have independent scale or compliance boundaries.
7. Add read replicas for analytics only when dashboards create measurable primary load.

### Reliability controls

- Point-in-time database recovery and tested restore drills.
- Object-storage versioning/retention policy for governed files and exports.
- Transactional outbox, idempotent consumers, unique provider event IDs, bounded exponential retries, and a visible dead-letter process.
- Consistent report snapshots and immutable referenced versions.
- Health checks for web, database, storage, workflow endpoint, and model-provider reachability.
- Graceful provider failure: preserve the run, show partial status, and allow authorized retry; never drop audit state.

### Cost controls

The main variable cost is AI inference, followed by document storage/egress and workflow steps. Track cost per corpus, ChangeEvent, case, and tenant. Apply upload/token quotas, retrieval limits, caching, concurrency controls, and optional lower-cost GPT-5.6 variants only after evals. Avoid a vector vendor, Redis, graph database, and always-on worker until they solve measured constraints.

## 8. Hackathon scope and sequence

### Must build for the five-minute vertical slice

1. Neon/Postgres schema, RLS basics, WorkOS identities, seeded roles/personas/corpus, and distinct demo users.
2. Paste/upload one protocol and perform a real GPT-5.6 extraction with three quote-verified claims.
3. Reviewer graph UI and evidence drawer.
4. Manual ChangeEvent entry and distinct-validator action.
5. PostgreSQL blast-radius traversal with load-bearing/peripheral classification and six-of-eight potential exposure mapping.
6. Three generated divergence cases; approve and lock one.
7. Seeded-persona probe runner, one old-rule response, artifact-correction exercise, and scheduled different-case recheck.
8. Observable-terms audit dashboard with ApprovalRecords.
9. One checksummed export bundle or, if time is tight, a visibly generated JSON/CSV manifest plus PDF report.
10. Playwright rehearsal test for the exact demo path and a fallback seeded extraction result clearly labeled as fallback if the live provider is unavailable.

### Build only after the core loop works

- Postmark delivery and webhooks.
- Slack adapter.
- xAPI/SCORM export.
- HRIS CSV import beyond the seed script.
- Advanced PDF rendering/OCR.
- Enterprise SAML/MFA configuration.
- Full OpenTelemetry collector and external uptime monitoring.

### Explicitly defer

- Automated source watchers, per the PRD.
- Live EHR integration or real patient/employee data.
- Neo4j, Elasticsearch, Kafka, Redis, Kubernetes, microservices.
- Autonomous artifact rewriting or autonomous case release.
- General-purpose LMS/course authoring.
- Fine-tuning before the labeled eval set demonstrates a need.
- Blockchain/notarization claims.

## 9. Suggested repository structure

```text
/
  docs/
    PRD.md
    TECH_STACK.md
    adr/
  src/
    app/
      (auth)/
      (product)/
      api/v1/
      api/inngest/
    components/
    modules/
      identity/
      corpus/
      graph/
      changes/
      cases/
      learning/
      audit/
      integrations/
    ai/
      prompts/
      schemas/
      evals/
    inngest/
    db/
      schema/
      queries/
    lib/
  database/
    migrations/
    seed.sql
    tests/
  tests/
    e2e/
    fixtures/
    evals/
  scripts/
  .env.example
  package.json
  pnpm-lock.yaml
```

Keep domain invariants close to their module. `src/ai` owns provider mechanics and versioned task contracts, but domain modules decide when AI may run and what human approval is required.

## 10. Required environment variables

Names should be validated at startup and separated into browser-safe and server-only groups:

```text
NEXT_PUBLIC_APP_URL
DATABASE_URL
WORKOS_API_KEY
WORKOS_CLIENT_ID
WORKOS_COOKIE_PASSWORD
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
S3_AUDIT_BUCKET
OPENAI_API_KEY
OPENAI_PRIMARY_MODEL=gpt-5.6
GEMINI_API_KEY
EMBEDDING_MODEL=gemini-embedding-2
EMBEDDING_DIMENSIONS=768
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
POSTMARK_SERVER_TOKEN
POSTMARK_WEBHOOK_SECRET
SENTRY_DSN
SENTRY_AUTH_TOKEN
REPORT_SIGNING_SECRET
```

`REPORT_SIGNING_SECRET` is optional for an HMAC-signed manifest; SHA-256 checksums alone are sufficient for the hackathon. Never invent stronger evidentiary claims than the chosen mechanism supports.

## 11. Decision log and production gates

Create ADRs before changing these foundational decisions:

- replacing PostgreSQL graph traversal with a graph database;
- adding a second application runtime;
- changing identity providers;
- moving from app-owned pgvector retrieval to hosted retrieval;
- introducing autonomous agents into governed workflows;
- changing the approval/version-lock model;
- enabling individual-level reporting by default.

Before real customer production, the following gates are mandatory:

1. Security threat model, penetration test, dependency review, incident runbook, and access-review process.
2. RLS/cross-tenant test suite and restore drill.
3. Data classification, retention/deletion/legal-hold behavior, DPIA, and employment/privacy review.
4. Processor contracts, data residency, OpenAI data-control configuration, and BAA assessment where PHI is in scope.
5. Labeled-corpus AI eval with agreed precision, reviewer-effort, citation-validity, and ambiguity thresholds.
6. Reviewer usability test against the PRD target of under 15 minutes per 50 claims by corpus three.
7. Export language/legal review; no `regulator-grade` claim until FR-12 and retention/export verification are demonstrated.
8. SSO/MFA/deprovisioning, backup/restore, monitoring, on-call, and model-change procedures.

## 12. Final rationale

Supersede's differentiator is not a novel infrastructure topology. It is the trustworthy chain from changed source to evidence-backed dependency, authorized remediation, and observable audit outcome. The recommended stack keeps that chain in one transactional PostgreSQL system, makes AI inputs and outputs inspectable, and uses durable workflows only where requests genuinely span time or failure boundaries.

This design is realistic for a hackathon because the team can ship one TypeScript application with managed services and a seeded demo. It is production-capable because the difficult properties—tenant isolation, immutable versions, append-only approvals, idempotent workflows, provenance, ambiguity routing, and evaluation—are designed in from the first schema rather than postponed behind the demo.

## 13. Primary technical references

- [OpenAI model guidance](https://developers.openai.com/api/docs/models)
- [OpenAI GPT-5.6 Sol model and supported capabilities](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
- [Gemini embeddings](https://ai.google.dev/gemini-api/docs/embeddings)
- [pgvector](https://github.com/pgvector/pgvector)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Neon documentation](https://neon.com/docs)
- [WorkOS AuthKit](https://workos.com/docs/authkit)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)
- [Amazon S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html)
- [Inngest durable functions](https://www.inngest.com/docs/learn/inngest-functions)
- [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/)
