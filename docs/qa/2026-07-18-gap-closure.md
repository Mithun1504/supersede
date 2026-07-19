# Gap-closure verification — 2026-07-18, reverified 2026-07-19

This record reconciles the implementation with `docs/PENDING.md`, the PRD,
and the required technical slice. It distinguishes deterministic verification
from provider-backed release verification.

## Closure evidence

| Gap                                | Implemented evidence                                                                                                                                                                                                                                                                                                                                                                        | Verification                                                                                                                                                                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Governed workflow UI               | Role-aware controls now cover change entry and second-person validation, edge acceptance/override, artifact triage/owner assignment/correction/approval/publication, case drafting/approval/release, learner response, remediation, and asynchronous audit-report requests.                                                                                                                 | The authenticated Playwright journey executes every listed mutation through the browser and asserts the persisted Postgres state.                                                                                                                                                                                      |
| Exact five-minute demo             | The idempotent seed contains three versioned divergence cases, eight fictional people, R.N. Adams's old-rule response, remediation evidence, and a different-case recheck.                                                                                                                                                                                                                  | A fresh database seeded `3` cases, `8` people, and `8` assignments. The authenticated journey independently creates and approves three cases, releases one, and verifies two scheduled rechecks after remediation.                                                                                                     |
| Embedding and retrieval            | Document ingestion now chunks with exact offsets, batches Gemini `gemini-embedding-001` document/query embeddings at 768 dimensions, stores pgvector values, and provides tenant/version-locked hybrid retrieval using vector and Postgres lexical ranks with reciprocal-rank fusion. HNSW and GIN indexes are migrated. An authenticated, rate-limited retrieval API exposes the pipeline. | Unit and route tests cover exact offsets, deterministic chunking, fusion, authentication, input validation, and service dispatch. Empty-database migration and foundation tests verify the vector/lexical columns and indexes. Live Gemini execution remains credential-gated as described below.                      |
| Background workflows and progress  | Inngest registers document indexing, change propagation, case approval, probe assignment, probe grading, remediation, report generation, due-work dispatch, and transactional-outbox publication. Persisted workflow runs/steps back both authenticated SSE and polling fallback.                                                                                                           | Type/build tests validate registration and route compilation; Playwright exercises the synchronous governed boundaries while persisted workflow state is exposed in the shell.                                                                                                                                         |
| Authenticated integration coverage | A non-production-only signed test-auth adapter maps real seeded memberships and roles.                                                                                                                                                                                                                                                                                                      | `tests/e2e/governed-journey.spec.ts` covers browser → authenticated route → service transaction → Postgres for edge review, the artifact lifecycle, three case approvals and release, R.N. Adams response/remediation/rechecks, change entry/validation, and report request. Production builds cannot use the adapter. |
| Live GPT-5.6 release gate          | The explicit provider verifier submits a controlled source, invokes the configured `gpt-5.6` extraction path, validates structured results, and checks returned quotes against the source.                                                                                                                                                                                                  | `pnpm verify:live-extraction` is intentionally fail-closed. On this machine it reports that OpenAI is not configured, so provider-backed release sign-off still requires a usable `OPENAI_API_KEY`.                                                                                                                    |
| AI evaluation gate                 | Versioned labeled and adversarial JSONL corpora measure edge precision, citation validity, ambiguity recall, grading agreement, reviewer actions, median review time, and p95 review time. Adversarial cases include prompt injection, near-quote substitution, Unicode lookalikes, and contradictory passages.                                                                             | `pnpm eval` passes all release thresholds. The fixtures are deterministic release evidence, not a substitute for the live provider gate.                                                                                                                                                                               |

## Verification results

- Fresh Postgres database: all migrations applied; seed completed; foundation
  transaction passed; seed counts were `3` cases, `8` people, `8` probe
  assignments, `1` seeded recheck, and `1` initial document chunk.
- ESLint: passed with zero warnings.
- TypeScript: passed.
- Deterministic quality gate (`pnpm check`): formatting, ESLint with zero
  warnings, TypeScript, and Vitest all passed; Vitest reported `22` files and
  `71` tests.
- AI evaluation gate: `3` files and `9` tests passed, including executable
  quote-integrity and prompt-injection adversarial checks.
- Playwright: `31` passed and `1` intentionally skipped duplicate mobile run
  of the destructive authenticated journey. Desktop and mobile surface checks
  passed. The harness creates a dedicated port-scoped Playwright database,
  migrates and seeds it before the run, and never writes governed test records
  into the configured application database.
- Next.js production build: passed.
- Production dependency audit: no known vulnerabilities.
- Git whitespace validation (`git diff --check`): passed.

## External release credentials

The implementation is complete and the live gates are fail-closed, but this
environment has neither a usable `OPENAI_API_KEY` nor `GEMINI_API_KEY`.
Production release sign-off must run the following after supplying those
credentials:

```bash
pnpm verify:live-extraction
pnpm verify:live-embedding
```

An absent provider credential is not converted into a mock success and is not
reported as a passed live gate.
