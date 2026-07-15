import { sql } from "drizzle-orm";
import {
  bigint,
  char,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  artifactVersions,
  corpora,
  documentChunks,
  documentVersions,
  sourceVersions,
} from "@/db/schema/corpus/schema";
import { organizations } from "@/db/schema/identity/schema";
import { workflowRuns } from "@/db/schema/operations/core";
import { createdAt, timestamptz } from "@/db/schema/shared/columns";
import {
  processingStatus,
  recordStatus,
  workflowStatus,
} from "@/db/schema/shared/enums";

export const aiPromptVersions = pgTable(
  "ai_prompt_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskType: varchar("task_type", { length: 64 }).notNull(),
    promptVersion: varchar("prompt_version", { length: 64 }).notNull(),
    schemaVersion: varchar("schema_version", { length: 64 }).notNull(),
    sourcePath: text("source_path").notNull(),
    gitCommitSha: char("git_commit_sha", { length: 40 }).notNull(),
    promptSha256: char("prompt_sha256", { length: 64 }).notNull(),
    status: recordStatus("status").notNull().default("draft"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("ai_prompt_version_contract_uq").on(
      t.taskType,
      t.promptVersion,
      t.schemaVersion,
    ),
    check(
      "ai_prompt_version_git_sha_chk",
      sql`${t.gitCommitSha} ~ '^[0-9a-f]{40}$'`,
    ),
    check(
      "ai_prompt_version_prompt_sha_chk",
      sql`${t.promptSha256} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const extractionRuns = pgTable(
  "extraction_run",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id, { onDelete: "restrict" }),
    corpusId: uuid("corpus_id").references(() => corpora.id, {
      onDelete: "restrict",
    }),
    workflowRunId: uuid("workflow_run_id").references(() => workflowRuns.id, {
      onDelete: "restrict",
    }),
    status: workflowStatus("status").notNull().default("queued"),
    cacheKey: char("cache_key", { length: 64 }).notNull(),
    claimsSuggested: integer("claims_suggested").notNull().default(0),
    edgesSuggested: integer("edges_suggested").notNull().default(0),
    quotesFailed: integer("quotes_failed").notNull().default(0),
    itemsRequiringReview: integer("items_requiring_review")
      .notNull()
      .default(0),
    startedAt: timestamptz("started_at"),
    completedAt: timestamptz("completed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("extraction_run_cache_uq").on(t.organizationId, t.cacheKey),
    check(
      "extraction_run_cache_key_chk",
      sql`${t.cacheKey} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "extraction_run_counts_chk",
      sql`${t.claimsSuggested} >= 0 and ${t.edgesSuggested} >= 0 and ${t.quotesFailed} >= 0 and ${t.itemsRequiringReview} >= 0`,
    ),
  ],
);

export const aiModelRuns = pgTable(
  "ai_model_run",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    workflowRunId: uuid("workflow_run_id").references(() => workflowRuns.id, {
      onDelete: "restrict",
    }),
    extractionRunId: uuid("extraction_run_id").references(
      () => extractionRuns.id,
      { onDelete: "restrict" },
    ),
    taskType: varchar("task_type", { length: 64 }).notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    model: varchar("model", { length: 128 }).notNull(),
    resolvedModel: varchar("resolved_model", { length: 128 }).notNull(),
    aiPromptVersionId: uuid("ai_prompt_version_id").references(
      () => aiPromptVersions.id,
      { onDelete: "restrict" },
    ),
    subjectType: varchar("subject_type", { length: 64 }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    subjectVersionId: uuid("subject_version_id"),
    applicationReleaseSha: char("application_release_sha", {
      length: 40,
    }).notNull(),
    externalResponseId: varchar("external_response_id", { length: 255 }),
    reasoningSetting: varchar("reasoning_setting", { length: 64 }),
    status: processingStatus("status").notNull().default("queued"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costMinor: bigint("cost_minor", { mode: "number" }),
    latencyMs: integer("latency_ms"),
    validationOutcome: varchar("validation_outcome", { length: 64 }),
    outputJson: jsonb("output_json").$type<Record<string, unknown>>(),
    errorCode: varchar("error_code", { length: 64 }),
    errorSummary: text("error_summary"),
    startedAt: timestamptz("started_at"),
    completedAt: timestamptz("completed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("ai_model_run_external_response_uq")
      .on(t.provider, t.externalResponseId)
      .where(sql`${t.externalResponseId} is not null`),
    index("ai_model_run_subject_idx").on(
      t.organizationId,
      t.subjectType,
      t.subjectId,
      t.subjectVersionId,
    ),
    index("ai_model_run_cost_period_idx").on(t.organizationId, t.createdAt),
    check(
      "ai_model_run_release_sha_chk",
      sql`${t.applicationReleaseSha} ~ '^[0-9a-f]{40}$'`,
    ),
    check(
      "ai_model_run_metrics_chk",
      sql`coalesce(${t.inputTokens}, 0) >= 0 and coalesce(${t.outputTokens}, 0) >= 0 and coalesce(${t.costMinor}, 0) >= 0 and coalesce(${t.latencyMs}, 0) >= 0`,
    ),
  ],
);

export const aiRunInputs = pgTable(
  "ai_run_input",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    aiModelRunId: uuid("ai_model_run_id")
      .notNull()
      .references(() => aiModelRuns.id, { onDelete: "restrict" }),
    documentVersionId: uuid("document_version_id").references(
      () => documentVersions.id,
      { onDelete: "restrict" },
    ),
    sourceVersionId: uuid("source_version_id").references(
      () => sourceVersions.id,
      { onDelete: "restrict" },
    ),
    artifactVersionId: uuid("artifact_version_id").references(
      () => artifactVersions.id,
      { onDelete: "restrict" },
    ),
    inputRole: varchar("input_role", { length: 32 }).notNull(),
    contentSha256: char("content_sha256", { length: 64 }).notNull(),
    position: integer("position").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.aiModelRunId, t.position] }),
    check(
      "ai_run_input_reference_chk",
      sql`num_nonnulls(${t.documentVersionId}, ${t.sourceVersionId}, ${t.artifactVersionId}) >= 1`,
    ),
    check("ai_run_input_sha_chk", sql`${t.contentSha256} ~ '^[0-9a-f]{64}$'`),
    check("ai_run_input_position_chk", sql`${t.position} >= 0`),
  ],
);

export const aiRunRetrievalChunks = pgTable(
  "ai_run_retrieval_chunk",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    aiModelRunId: uuid("ai_model_run_id")
      .notNull()
      .references(() => aiModelRuns.id, { onDelete: "restrict" }),
    documentChunkId: uuid("document_chunk_id")
      .notNull()
      .references(() => documentChunks.id, { onDelete: "restrict" }),
    rank: integer("rank").notNull(),
    semanticScore: numeric("semantic_score", { precision: 8, scale: 6 }),
    lexicalScore: numeric("lexical_score", { precision: 8, scale: 6 }),
    fusedScore: numeric("fused_score", { precision: 8, scale: 6 }),
  },
  (t) => [
    primaryKey({ columns: [t.aiModelRunId, t.documentChunkId] }),
    uniqueIndex("ai_run_retrieval_rank_uq").on(t.aiModelRunId, t.rank),
    check("ai_run_retrieval_rank_chk", sql`${t.rank} >= 0`),
  ],
);
