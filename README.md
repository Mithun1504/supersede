# Supersede

Supersede traces a source change through dependent claims, artifacts, decisions,
remediation, and rechecks. AI extracts and prioritizes evidence. Authenticated
reviewers authorize every governed action.

The public demo uses fictional hospital data and is read-only.

**Live app:** [supersede-bay.vercel.app](https://supersede-bay.vercel.app/)

## Product workflow

1. Extract claims with exact source quotes.
2. Validate the old and new rule with a second reviewer.
3. Review dependency paths and affected artifacts.
4. Approve cases where the rules produce different decisions.
5. Assign remediation and schedule a different-case recheck.
6. Export a checksummed audit bundle.

See [the product requirements](./docs/PRD.md) and
[technical design](./docs/TECH_STACK.md) for the governing decisions.

## How AI was used

### Development

- **Codex** was the agentic engineering environment used to inspect the
  repository, implement and refactor the Next.js and TypeScript code, write
  tests, run verification, and perform browser QA.
- **GPT-5.6-sol** powered those Codex sessions. It reasoned across the product
  requirements, technical design, implementation, and test failures. It is a
  development-time model, separate from the model called by the live product.

### Product integration

Supersede calls **GPT-5.6** through the server-side OpenAI Responses API. It
extracts claims, assesses load-bearing evidence, normalizes source changes,
drafts divergence cases, grades non-exact probe responses, and reviews artifact
corrections. Each task returns a Zod-validated structured result. Supersede then
checks source hashes and exact quotes in application code, records model and
prompt provenance, and requires human review for governed decisions. The API
key stays on the server, and the integration fails closed when OpenAI is not
configured.

## Local setup

Requirements: Node.js 22.22+, pnpm 10.33, Docker, and `psql`.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
docker compose up -d postgres minio minio-init
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open <http://localhost:3000/app/walkthrough>. Start Inngest in another terminal
when testing background workflows:

```bash
pnpm inngest:dev
```

The seeded public views work without provider credentials. Live extraction,
retrieval, and governed writes fail closed until their services are configured.

## Configuration

| Service         | Variables                                                                            |
| --------------- | ------------------------------------------------------------------------------------ |
| PostgreSQL      | `DATABASE_URL` for migrations; `DATABASE_RUNTIME_URL` for the restricted app role    |
| WorkOS          | `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`, redirect URI         |
| OpenAI          | `OPENAI_API_KEY`, `OPENAI_PRIMARY_MODEL=gpt-5.6`                                     |
| Gemini          | `GEMINI_API_KEY`, `EMBEDDING_MODEL=gemini-embedding-001`, `EMBEDDING_DIMENSIONS=768` |
| Working storage | Private R2-compatible bucket and credentials                                         |
| Workflows       | Inngest event and signing keys                                                       |
| Audit retention | Optional S3 bucket with Object Lock already enabled                                  |

`GET /api/v1/health` reports liveness. `GET /api/v1/readiness` returns `503`
until critical production dependencies are ready. OpenAPI is available at
`/api/v1/openapi`.

## Verification

```bash
pnpm check
pnpm db:test
pnpm eval
pnpm build
pnpm test:e2e
pnpm audit --prod
```

Deterministic tests do not prove live provider behavior. Run both provider gates
with release credentials:

```bash
pnpm verify:live-extraction
pnpm verify:live-embedding
```

## Safety boundaries

- Demo people, clinical content, responses, and outcomes are fictional.
- Reports describe observable actions: assigned, assessed, remediated, and rechecked.
- Approved versions are immutable. Changes create new versions.
- Named results require explicit organization policy; aggregates suppress cohorts below five people.
- Never run `db:push` against a shared or production database.
