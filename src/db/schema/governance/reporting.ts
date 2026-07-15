import { sql } from "drizzle-orm";
import {
  AnyPgColumn,
  bigint,
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { changeEventVersions } from "@/db/schema/changes/schema";
import { storageObjects } from "@/db/schema/corpus/schema";
import { memberships, organizations } from "@/db/schema/identity/schema";
import { workflowRuns } from "@/db/schema/operations/core";
import { createdAt, timestamptz } from "@/db/schema/shared/columns";
import {
  recordStatus,
  reportStatus,
  retentionMode,
  workflowStatus,
} from "@/db/schema/shared/enums";

export const reportBundles = pgTable(
  "report_bundle",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    changeEventVersionId: uuid("change_event_version_id")
      .notNull()
      .references(() => changeEventVersions.id, { onDelete: "restrict" }),
    requestedByMembershipId: uuid("requested_by_membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    status: reportStatus("status").notNull().default("requested"),
    queryCutoffAt: timestamptz("query_cutoff_at").notNull(),
    includeIndividualResults: boolean("include_individual_results")
      .notNull()
      .default(false),
    templateVersion: varchar("template_version", { length: 64 }).notNull(),
    applicationReleaseSha: char("application_release_sha", {
      length: 40,
    }).notNull(),
    storageObjectId: uuid("storage_object_id").references(
      () => storageObjects.id,
      { onDelete: "restrict" },
    ),
    bundleSha256: char("bundle_sha256", { length: 64 }),
    manifest: jsonb("manifest").$type<Record<string, unknown>>(),
    manifestSignature: text("manifest_signature"),
    signatureAlgorithm: varchar("signature_algorithm", { length: 32 }),
    signingKeyVersion: varchar("signing_key_version", { length: 64 }),
    retentionMode: retentionMode("retention_mode"),
    retainUntil: timestamptz("retain_until"),
    objectLockVersionId: varchar("object_lock_version_id", { length: 255 }),
    workflowRunId: uuid("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "restrict" }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    requestedAt: timestamptz("requested_at").notNull().defaultNow(),
    completedAt: timestamptz("completed_at"),
    expiresAt: timestamptz("expires_at"),
    errorSummary: text("error_summary"),
  },
  (t) => [
    uniqueIndex("report_bundle_idempotency_uq").on(
      t.organizationId,
      t.idempotencyKey,
    ),
    index("report_bundle_change_status_idx").on(
      t.organizationId,
      t.changeEventVersionId,
      t.status,
    ),
    check(
      "report_bundle_release_sha_chk",
      sql`${t.applicationReleaseSha} ~ '^[0-9a-f]{40}$'`,
    ),
    check(
      "report_bundle_hash_chk",
      sql`${t.bundleSha256} is null or ${t.bundleSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "report_bundle_signature_chk",
      sql`${t.signatureAlgorithm} is null or ${t.signatureAlgorithm} = 'hmac-sha256'`,
    ),
  ],
);

export const reportBundleItems = pgTable(
  "report_bundle_item",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    reportBundleId: uuid("report_bundle_id")
      .notNull()
      .references(() => reportBundles.id, { onDelete: "restrict" }),
    path: varchar("path", { length: 512 }).notNull(),
    mediaType: varchar("media_type", { length: 255 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: char("sha256", { length: 64 }).notNull(),
    storageObjectId: uuid("storage_object_id").references(
      () => storageObjects.id,
      { onDelete: "restrict" },
    ),
    position: integer("position").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.reportBundleId, t.path] }),
    uniqueIndex("report_bundle_item_position_uq").on(
      t.reportBundleId,
      t.position,
    ),
    check("report_bundle_item_size_chk", sql`${t.sizeBytes} >= 0`),
    check("report_bundle_item_position_chk", sql`${t.position} >= 0`),
    check("report_bundle_item_sha_chk", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const retentionPolicies = pgTable(
  "retention_policy",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    dataClass: varchar("data_class", { length: 64 }).notNull(),
    versionNumber: integer("version_number").notNull(),
    retentionDays: integer("retention_days").notNull(),
    retentionMode: retentionMode("retention_mode").notNull(),
    dispositionAction: varchar("disposition_action", { length: 16 }).notNull(),
    status: recordStatus("status").notNull().default("draft"),
    effectiveFrom: timestamptz("effective_from").notNull(),
    supersedesRetentionPolicyId: uuid(
      "supersedes_retention_policy_id",
    ).references((): AnyPgColumn => retentionPolicies.id, {
      onDelete: "restrict",
    }),
    createdByMembershipId: uuid("created_by_membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("retention_policy_version_uq").on(
      t.organizationId,
      t.dataClass,
      t.versionNumber,
    ),
    uniqueIndex("retention_policy_active_uq")
      .on(t.organizationId, t.dataClass)
      .where(sql`${t.status} = 'approved'`),
    check("retention_policy_version_chk", sql`${t.versionNumber} > 0`),
    check("retention_policy_days_chk", sql`${t.retentionDays} > 0`),
    check(
      "retention_policy_action_chk",
      sql`${t.dispositionAction} in ('delete', 'anonymize', 'retain')`,
    ),
  ],
);

export const legalHolds = pgTable(
  "legal_hold",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    scopeType: varchar("scope_type", { length: 64 }).notNull(),
    scopeId: uuid("scope_id"),
    reason: text("reason").notNull(),
    reference: varchar("reference", { length: 255 }).notNull(),
    startsAt: timestamptz("starts_at").notNull(),
    releasedAt: timestamptz("released_at"),
    createdByMembershipId: uuid("created_by_membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    releasedByMembershipId: uuid("released_by_membership_id").references(
      () => memberships.id,
      { onDelete: "restrict" },
    ),
    createdAt: createdAt(),
  },
  (t) => [
    index("legal_hold_active_scope_idx")
      .on(t.organizationId, t.scopeType, t.scopeId)
      .where(sql`${t.releasedAt} is null`),
    check(
      "legal_hold_release_chk",
      sql`(${t.releasedAt} is null and ${t.releasedByMembershipId} is null) or (${t.releasedAt} is not null and ${t.releasedByMembershipId} is not null and ${t.releasedAt} >= ${t.startsAt})`,
    ),
  ],
);

export const dataDispositionRuns = pgTable(
  "data_disposition_run",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    retentionPolicyId: uuid("retention_policy_id")
      .notNull()
      .references(() => retentionPolicies.id, { onDelete: "restrict" }),
    workflowRunId: uuid("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "restrict" }),
    cutoffAt: timestamptz("cutoff_at").notNull(),
    status: workflowStatus("status").notNull().default("queued"),
    candidateCount: integer("candidate_count").notNull().default(0),
    disposedCount: integer("disposed_count").notNull().default(0),
    heldCount: integer("held_count").notNull().default(0),
    manifestStorageObjectId: uuid("manifest_storage_object_id").references(
      () => storageObjects.id,
      { onDelete: "restrict" },
    ),
    manifestSha256: char("manifest_sha256", { length: 64 }),
    startedAt: timestamptz("started_at"),
    completedAt: timestamptz("completed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "data_disposition_run_counts_chk",
      sql`${t.candidateCount} >= 0 and ${t.disposedCount} >= 0 and ${t.heldCount} >= 0 and ${t.disposedCount} + ${t.heldCount} <= ${t.candidateCount}`,
    ),
    check(
      "data_disposition_run_manifest_sha_chk",
      sql`${t.manifestSha256} is null or ${t.manifestSha256} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);
