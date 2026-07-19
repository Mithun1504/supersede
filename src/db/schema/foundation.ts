import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { memberships, organizations, roles } from "@/db/schema/identity";

export const outboxStatus = pgEnum("outbox_status", [
  "pending",
  "published",
  "failed",
]);
export const workflowStatus = pgEnum("workflow_status", [
  "queued",
  "running",
  "partial",
  "failed",
  "completed",
  "quota_paused",
]);

export const approvalRecords = pgTable(
  "approval_record",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    actorMembershipId: uuid("actor_membership_id")
      .notNull()
      .references(() => memberships.id),
    actorRoleCode: varchar("actor_role_code", { length: 64 })
      .notNull()
      .references(() => roles.code),
    objectType: varchar("object_type", { length: 64 }).notNull(),
    objectId: uuid("object_id").notNull(),
    objectVersionId: uuid("object_version_id").notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("approval_record_object_idx").on(
      table.organizationId,
      table.objectType,
      table.objectId,
    ),
    index("approval_record_actor_idx").on(
      table.organizationId,
      table.actorMembershipId,
    ),
  ],
);

export const auditEvents = pgTable(
  "audit_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    actorMembershipId: uuid("actor_membership_id").references(
      () => memberships.id,
    ),
    actorRoleCode: varchar("actor_role_code", { length: 64 }).references(
      () => roles.code,
    ),
    eventType: varchar("event_type", { length: 128 }).notNull(),
    objectType: varchar("object_type", { length: 64 }).notNull(),
    objectId: uuid("object_id").notNull(),
    objectVersionId: uuid("object_version_id"),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_event_timeline_idx").on(
      table.organizationId,
      table.occurredAt,
    ),
  ],
);

export const outboxEvents = pgTable(
  "outbox_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    eventName: varchar("event_name", { length: 128 }).notNull(),
    aggregateType: varchar("aggregate_type", { length: 64 }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: outboxStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("outbox_event_idempotency_uq").on(
      table.organizationId,
      table.idempotencyKey,
    ),
    index("outbox_event_dispatch_idx").on(table.status, table.availableAt),
  ],
);

export const workflowRuns = pgTable(
  "workflow_run",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    externalRunId: varchar("external_run_id", { length: 255 }),
    workflowName: varchar("workflow_name", { length: 128 }).notNull(),
    subjectType: varchar("subject_type", { length: 64 }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    status: workflowStatus("status").notNull().default("queued"),
    progressCurrent: integer("progress_current").notNull().default(0),
    progressTotal: integer("progress_total"),
    errorCode: varchar("error_code", { length: 64 }),
    errorSummary: text("error_summary"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("workflow_run_external_id_uq").on(
      table.organizationId,
      table.externalRunId,
    ),
    index("workflow_run_subject_idx").on(
      table.organizationId,
      table.subjectType,
      table.subjectId,
    ),
  ],
);

export const workflowSteps = pgTable(
  "workflow_step",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    workflowRunId: uuid("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id),
    stepKey: varchar("step_key", { length: 128 }).notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    status: workflowStatus("status").notNull().default("queued"),
    detail: jsonb("detail")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("workflow_step_run_key_uq").on(
      table.workflowRunId,
      table.stepKey,
    ),
    index("workflow_step_org_run_idx").on(
      table.organizationId,
      table.workflowRunId,
    ),
  ],
);

export const apiRateLimitBuckets = pgTable(
  "api_rate_limit_bucket",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    actorMembershipId: uuid("actor_membership_id")
      .notNull()
      .references(() => memberships.id),
    scope: varchar("scope", { length: 64 }).notNull(),
    windowStartedAt: timestamp("window_started_at", {
      withTimezone: true,
    }).notNull(),
    requestCount: integer("request_count").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("api_rate_limit_bucket_actor_scope_uq").on(
      table.organizationId,
      table.actorMembershipId,
      table.scope,
    ),
  ],
);
