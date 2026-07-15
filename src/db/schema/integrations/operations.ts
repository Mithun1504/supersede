import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { storageObjects } from "@/db/schema/corpus/schema";
import { integrationConnections } from "@/db/schema/integrations/connections";
import { memberships, organizations } from "@/db/schema/identity/schema";
import { workflowRuns } from "@/db/schema/operations/core";
import { people } from "@/db/schema/people/schema";
import { createdAt, timestamptz, updatedAt } from "@/db/schema/shared/columns";
import { processingStatus, workflowStatus } from "@/db/schema/shared/enums";

export const integrationEvents = pgTable(
  "integration_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    integrationConnectionId: uuid("integration_connection_id")
      .notNull()
      .references(() => integrationConnections.id, { onDelete: "restrict" }),
    externalEventId: varchar("external_event_id", { length: 255 }).notNull(),
    eventType: varchar("event_type", { length: 128 }).notNull(),
    signatureVerified: boolean("signature_verified").notNull().default(false),
    payloadSha256: char("payload_sha256", { length: 64 }).notNull(),
    receivedAt: timestamptz("received_at").notNull().defaultNow(),
    processedAt: timestamptz("processed_at"),
    status: processingStatus("status").notNull().default("queued"),
    errorSummary: text("error_summary"),
  },
  (t) => [
    uniqueIndex("integration_event_external_uq").on(
      t.integrationConnectionId,
      t.externalEventId,
    ),
    index("integration_event_queue_idx").on(
      t.organizationId,
      t.status,
      t.receivedAt,
    ),
    check(
      "integration_event_payload_sha_chk",
      sql`${t.payloadSha256} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const integrationJobs = pgTable(
  "integration_job",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    integrationConnectionId: uuid("integration_connection_id").references(
      () => integrationConnections.id,
      { onDelete: "restrict" },
    ),
    jobType: varchar("job_type", { length: 64 }).notNull(),
    direction: varchar("direction", { length: 8 }).notNull(),
    storageObjectId: uuid("storage_object_id").references(
      () => storageObjects.id,
      { onDelete: "restrict" },
    ),
    status: workflowStatus("status").notNull().default("queued"),
    workflowRunId: uuid("workflow_run_id").references(() => workflowRuns.id, {
      onDelete: "restrict",
    }),
    requestedByMembershipId: uuid("requested_by_membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    totalCount: integer("total_count").notNull().default(0),
    succeededCount: integer("succeeded_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    createdAt: createdAt(),
    completedAt: timestamptz("completed_at"),
  },
  (t) => [
    check(
      "integration_job_direction_chk",
      sql`${t.direction} in ('import', 'export')`,
    ),
    check(
      "integration_job_counts_chk",
      sql`${t.totalCount} >= 0 and ${t.succeededCount} >= 0 and ${t.failedCount} >= 0 and ${t.skippedCount} >= 0`,
    ),
  ],
);

export const integrationJobItems = pgTable(
  "integration_job_item",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    integrationJobId: uuid("integration_job_id")
      .notNull()
      .references(() => integrationJobs.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    externalKey: varchar("external_key", { length: 255 }),
    status: processingStatus("status").notNull().default("queued"),
    resultObjectType: varchar("result_object_type", { length: 64 }),
    resultObjectId: uuid("result_object_id"),
    errorCode: varchar("error_code", { length: 64 }),
    errorSummary: text("error_summary"),
    payloadSha256: char("payload_sha256", { length: 64 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("integration_job_item_position_uq").on(
      t.integrationJobId,
      t.position,
    ),
    index("integration_job_item_failed_idx").on(
      t.organizationId,
      t.integrationJobId,
      t.status,
    ),
    check("integration_job_item_position_chk", sql`${t.position} >= 0`),
    check(
      "integration_job_item_sha_chk",
      sql`${t.payloadSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "integration_job_item_result_chk",
      sql`(${t.resultObjectType} is null) = (${t.resultObjectId} is null)`,
    ),
  ],
);

export const notifications = pgTable(
  "notification",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    membershipId: uuid("membership_id").references(() => memberships.id, {
      onDelete: "restrict",
    }),
    personId: uuid("person_id").references(() => people.id, {
      onDelete: "restrict",
    }),
    type: varchar("type", { length: 64 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    bodySummary: text("body_summary").notNull(),
    actionPath: text("action_path").notNull(),
    objectType: varchar("object_type", { length: 64 }),
    objectId: uuid("object_id"),
    objectVersionId: uuid("object_version_id"),
    readAt: timestamptz("read_at"),
    dismissedAt: timestamptz("dismissed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("notification_membership_unread_idx")
      .on(t.organizationId, t.membershipId, t.createdAt)
      .where(sql`${t.readAt} is null and ${t.dismissedAt} is null`),
    index("notification_person_unread_idx")
      .on(t.organizationId, t.personId, t.createdAt)
      .where(sql`${t.readAt} is null and ${t.dismissedAt} is null`),
    check(
      "notification_recipient_chk",
      sql`num_nonnulls(${t.membershipId}, ${t.personId}) = 1`,
    ),
    check(
      "notification_action_path_chk",
      sql`${t.actionPath} like '/%' and ${t.actionPath} not like '//%'`,
    ),
  ],
);

export const notificationPreferences = pgTable(
  "notification_preference",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    membershipId: uuid("membership_id").references(() => memberships.id, {
      onDelete: "restrict",
    }),
    personId: uuid("person_id").references(() => people.id, {
      onDelete: "restrict",
    }),
    notificationCategory: varchar("notification_category", {
      length: 64,
    }).notNull(),
    channel: varchar("channel", { length: 16 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    digestMode: varchar("digest_mode", { length: 16 })
      .notNull()
      .default("immediate"),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("notification_preference_membership_uq")
      .on(t.membershipId, t.notificationCategory, t.channel)
      .where(sql`${t.membershipId} is not null`),
    uniqueIndex("notification_preference_person_uq")
      .on(t.personId, t.notificationCategory, t.channel)
      .where(sql`${t.personId} is not null`),
    check(
      "notification_preference_recipient_chk",
      sql`num_nonnulls(${t.membershipId}, ${t.personId}) = 1`,
    ),
    check(
      "notification_preference_digest_chk",
      sql`${t.digestMode} in ('immediate', 'daily', 'none')`,
    ),
  ],
);

export const notificationDeliveries = pgTable(
  "notification_delivery",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "restrict" }),
    channel: varchar("channel", { length: 16 }).notNull(),
    integrationConnectionId: uuid("integration_connection_id").references(
      () => integrationConnections.id,
      { onDelete: "restrict" },
    ),
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    status: processingStatus("status").notNull().default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: timestamptz("last_attempt_at"),
    deliveredAt: timestamptz("delivered_at"),
    errorSummary: text("error_summary"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("notification_delivery_provider_message_uq")
      .on(t.channel, t.providerMessageId)
      .where(sql`${t.providerMessageId} is not null`),
    index("notification_delivery_retry_idx").on(
      t.organizationId,
      t.status,
      t.lastAttemptAt,
    ),
    check("notification_delivery_attempt_chk", sql`${t.attemptCount} >= 0`),
  ],
);
