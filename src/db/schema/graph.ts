import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { memberships, organizations } from "@/db/schema/identity";
import {
  artifactVersions,
  edgeKind,
  professionalRoles,
  reviewStatus,
  sourceVersions,
} from "@/db/schema/domain";

export const claims = pgTable(
  "claim",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    artifactVersionId: uuid("artifact_version_id")
      .notNull()
      .references(() => artifactVersions.id),
    canonicalKey: varchar("canonical_key", { length: 160 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("claim_artifact_key_uq").on(
      table.artifactVersionId,
      table.canonicalKey,
    ),
    index("claim_org_artifact_idx").on(
      table.organizationId,
      table.artifactVersionId,
    ),
  ],
);

export const claimVersions = pgTable(
  "claim_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id),
    versionLabel: varchar("version_label", { length: 128 }).notNull(),
    text: text("text").notNull(),
    evidenceQuote: text("evidence_quote").notNull(),
    evidencePage: varchar("evidence_page", { length: 64 }),
    evidenceSection: varchar("evidence_section", { length: 255 }),
    evidenceStartOffset: integer("evidence_start_offset").notNull(),
    evidenceEndOffset: integer("evidence_end_offset").notNull(),
    evidenceChecksum: varchar("evidence_checksum", { length: 64 }).notNull(),
    extractionRunId: varchar("extraction_run_id", { length: 128 }).notNull(),
    promptVersion: varchar("prompt_version", { length: 64 }).notNull(),
    modelId: varchar("model_id", { length: 128 }).notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
    loadBearingScore: numeric("load_bearing_score", {
      precision: 4,
      scale: 3,
    }).notNull(),
    loadBearingRationale: text("load_bearing_rationale").notNull(),
    reviewStatus: reviewStatus("review_status").notNull().default("suggested"),
    reviewedByMembershipId: uuid("reviewed_by_membership_id").references(
      () => memberships.id,
    ),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedByMembershipId: uuid("locked_by_membership_id").references(
      () => memberships.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "claim_version_confidence_range",
      sql`${table.confidence} BETWEEN 0 AND 1`,
    ),
    check(
      "claim_version_load_bearing_range",
      sql`${table.loadBearingScore} BETWEEN 0 AND 1`,
    ),
    check(
      "claim_version_evidence_offsets_order",
      sql`${table.evidenceStartOffset} < ${table.evidenceEndOffset}`,
    ),
    uniqueIndex("claim_version_label_uq").on(table.claimId, table.versionLabel),
    index("claim_version_org_review_idx").on(
      table.organizationId,
      table.reviewStatus,
    ),
  ],
);

export const dependencyEdges = pgTable(
  "dependency_edge",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    kind: edgeKind("kind").notNull(),
    fromObjectType: varchar("from_object_type", { length: 48 }).notNull(),
    fromObjectId: uuid("from_object_id").notNull(),
    toObjectType: varchar("to_object_type", { length: 48 }).notNull(),
    toObjectId: uuid("to_object_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("dependency_edge_unique_uq").on(
      table.organizationId,
      table.kind,
      table.fromObjectType,
      table.fromObjectId,
      table.toObjectType,
      table.toObjectId,
    ),
    index("dependency_edge_from_idx").on(
      table.organizationId,
      table.fromObjectType,
      table.fromObjectId,
    ),
    index("dependency_edge_to_idx").on(
      table.organizationId,
      table.toObjectType,
      table.toObjectId,
    ),
  ],
);

export const dependencyEdgeVersions = pgTable(
  "dependency_edge_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    edgeId: uuid("edge_id")
      .notNull()
      .references(() => dependencyEdges.id),
    versionLabel: varchar("version_label", { length: 128 }).notNull(),
    evidenceDocumentVersionId: uuid("evidence_document_version_id").notNull(),
    evidenceQuote: text("evidence_quote").notNull(),
    evidenceStartOffset: integer("evidence_start_offset").notNull(),
    evidenceEndOffset: integer("evidence_end_offset").notNull(),
    evidenceChecksum: varchar("evidence_checksum", { length: 64 }).notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
    reviewStatus: reviewStatus("review_status").notNull().default("suggested"),
    reviewedByMembershipId: uuid("reviewed_by_membership_id").references(
      () => memberships.id,
    ),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedByMembershipId: uuid("locked_by_membership_id").references(
      () => memberships.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "dependency_edge_version_confidence_range",
      sql`${table.confidence} BETWEEN 0 AND 1`,
    ),
    check(
      "dependency_edge_version_offsets_order",
      sql`${table.evidenceStartOffset} < ${table.evidenceEndOffset}`,
    ),
    uniqueIndex("dependency_edge_version_label_uq").on(
      table.edgeId,
      table.versionLabel,
    ),
    index("dependency_edge_version_org_review_idx").on(
      table.organizationId,
      table.reviewStatus,
    ),
  ],
);

export const roleArtifactExposures = pgTable(
  "role_artifact_exposure",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    professionalRoleId: uuid("professional_role_id")
      .notNull()
      .references(() => professionalRoles.id),
    artifactVersionId: uuid("artifact_version_id")
      .notNull()
      .references(() => artifactVersions.id),
    rationale: text("rationale").notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "role_artifact_exposure_confidence_range",
      sql`${table.confidence} BETWEEN 0 AND 1`,
    ),
    uniqueIndex("role_artifact_exposure_uq").on(
      table.organizationId,
      table.professionalRoleId,
      table.artifactVersionId,
    ),
    index("role_artifact_exposure_role_idx").on(
      table.organizationId,
      table.professionalRoleId,
    ),
  ],
);

export const sourceSupportEdges = pgTable(
  "claim_source_support",
  {
    claimVersionId: uuid("claim_version_id")
      .notNull()
      .references(() => claimVersions.id),
    sourceVersionId: uuid("source_version_id")
      .notNull()
      .references(() => sourceVersions.id),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("claim_source_support_uq").on(
      table.claimVersionId,
      table.sourceVersionId,
    ),
    index("claim_source_support_source_idx").on(
      table.organizationId,
      table.sourceVersionId,
    ),
  ],
);
