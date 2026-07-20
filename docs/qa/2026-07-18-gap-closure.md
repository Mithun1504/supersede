# Gap closure: 2026-07-18

**Reverified:** 2026-07-19

## Closed gaps

| Area                      | Evidence                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Governed workflow         | Role-aware UI covers change validation, edge review, artifact lifecycle, case approval and release, learner response, remediation, and report requests.            |
| Five-minute demo          | Seed contains three cases and eight fictional people. The browser journey completes the R.N. Adams response, correction, remediation, and different-case rechecks. |
| Retrieval                 | Exact-offset chunking, Gemini embeddings, pgvector and lexical indexes, reciprocal-rank fusion, version locks, rate limits, and authenticated API are implemented. |
| Background work           | Required Inngest functions, persisted progress, authenticated SSE, and polling fallback are implemented.                                                           |
| Authenticated integration | Playwright drives governed UI mutations through real services into an isolated PostgreSQL database.                                                                |
| AI evaluation             | Versioned labeled and adversarial fixtures enforce quote, ambiguity, grading, precision, and reviewer-effort thresholds.                                           |

## Verification

- Fresh database migrated and seeded: 3 cases, 8 people, 8 assignments, 1 recheck, 1 document chunk.
- `pnpm check`: passed, including 22 Vitest files and 71 tests.
- `pnpm eval`: passed, 3 files and 9 tests.
- Playwright: 31 passed; one destructive mobile duplicate intentionally skipped.
- Production build: passed.
- Production dependency audit: no known vulnerabilities.
- `git diff --check`: passed.

## External gates

This environment had no usable OpenAI or Gemini credential. Both live checks
correctly failed closed:

```bash
pnpm verify:live-extraction
pnpm verify:live-embedding
```

The implementation and deterministic gates were complete. Provider-backed
release sign-off remained pending.
