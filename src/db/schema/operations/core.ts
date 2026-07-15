import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { organizations } from "@/db/schema/identity/schema";
import { createdAt, timestamptz, updatedAt } from "@/db/schema/shared/columns";
import {
  actorType,
  outboxStatus,
  workflowStatus,
} from "@/db/schema/shared/enums";

export const workflowRuns = pgTable(
  "workflow_run",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    externalRunId: varchar("external_run_id", { length: 255 }),
    workflowName: varchar("workflow_name", { length: 128 }).notNull(),
    subjectType: varchar("subject_type", { length: 64 }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    status: workflowStatus("status").notNull().default("queued"),
    progressCurrent: integer("progress_current").notNull().default(0),
    progressTotal: integer("progress_total"),
    errorCode: varchar("error_code", { length: 64 }),
    errorSummary: text("error_summary"),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    attempt: integer("attempt").notNull().default(1),
    triggerEventId: uuid("trigger_event_id"),
    nextRetryAt: timestamptz("next_retry_at"),
    lastHeartbeatAt: timestamptz("last_heartbeat_at"),
    startedAt: timestamptz("started_at"),
    completedAt: timestamptz("completed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("workflow_run_idempotency_uq").on(
      t.organizationId,
      t.workflowName,
      t.idempotencyKey,
    ),
    index("workflow_run_subject_idx").on(
      t.organizationId,
      t.subjectType,
      t.subjectId,
    ),
    index("workflow_run_stale_idx").on(
      t.organizationId,
      t.status,
      t.lastHeartbeatAt,
    ),
    check(
      "workflow_run_progress_chk",
      sql`${t.progressCurrent} >= 0 and (${t.progressTotal} is null or ${t.progressTotal} >= ${t.progressCurrent})`,
    ),
    check("workflow_run_attempt_chk", sql`${t.attempt} > 0`),
  ],
);

export const workflowSteps = pgTable(
  "workflow_step",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    workflowRunId: uuid("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "restrict" }),
    stepKey: varchar("step_key", { length: 128 }).notNull(),
    attempt: integer("attempt").notNull().default(1),
    status: workflowStatus("status").notNull().default("queued"),
    startedAt: timestamptz("started_at"),
    completedAt: timestamptz("completed_at"),
    nextRetryAt: timestamptz("next_retry_at"),
    errorCode: varchar("error_code", { length: 64 }),
    errorSummary: text("error_summary"),
    metrics: jsonb("metrics")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("workflow_step_attempt_uq").on(
      t.workflowRunId,
      t.stepKey,
      t.attempt,
    ),
    index("workflow_step_active_idx").on(
      t.organizationId,
      t.status,
      t.nextRetryAt,
    ),
    check("workflow_step_attempt_chk", sql`${t.attempt} > 0`),
  ],
);

export const outboxEvents = pgTable(
  "outbox_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    eventName: varchar("event_name", { length: 128 }).notNull(),
    aggregateType: varchar("aggregate_type", { length: 64 }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: outboxStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamptz("available_at").notNull().defaultNow(),
    publishedAt: timestamptz("published_at"),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("outbox_event_idempotency_uq").on(
      t.organizationId,
      t.idempotencyKey,
    ),
    index("outbox_event_dispatch_idx").on(t.status, t.availableAt),
    check("outbox_event_attempts_chk", sql`${t.attempts} >= 0`),
  ],
);

export const idempotencyRecords = pgTable(
  "idempotency_record",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    principalType: actorType("principal_type").notNull(),
    principalId: uuid("principal_id").notNull(),
    routeKey: varchar("route_key", { length: 255 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    requestSha256: varchar("request_sha256", { length: 64 }).notNull(),
    statusCode: integer("status_code"),
    responseHeaders: jsonb("response_headers")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>(),
    objectType: varchar("object_type", { length: 64 }),
    objectId: uuid("object_id"),
    lockedUntil: timestamptz("locked_until").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: createdAt(),
    completedAt: timestamptz("completed_at"),
  },
  (t) => [
    uniqueIndex("idempotency_record_scope_uq").on(
      t.organizationId,
      t.principalType,
      t.principalId,
      t.routeKey,
      t.idempotencyKey,
    ),
    index("idempotency_record_expiry_idx").on(t.expiresAt),
    check(
      "idempotency_record_hash_chk",
      sql`${t.requestSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "idempotency_record_expiry_chk",
      sql`${t.expiresAt} > ${t.createdAt}`,
    ),
  ],
);

export const usageEvents = pgTable(
  "usage_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    category: varchar("category", { length: 32 }).notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    quantity: numeric("quantity").notNull(),
    unit: varchar("unit", { length: 32 }).notNull(),
    costMinor: bigint("cost_minor", { mode: "number" }).notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull(),
    subjectType: varchar("subject_type", { length: 64 }),
    subjectId: uuid("subject_id"),
    workflowRunId: uuid("workflow_run_id").references(() => workflowRuns.id, {
      onDelete: "restrict",
    }),
    occurredAt: timestamptz("occurred_at").notNull().defaultNow(),
  },
  (t) => [
    index("usage_event_timeline_idx").on(t.organizationId, t.occurredAt),
    index("usage_event_category_period_idx").on(
      t.organizationId,
      t.category,
      t.occurredAt,
    ),
    check("usage_event_cost_chk", sql`${t.costMinor} >= 0`),
  ],
);
