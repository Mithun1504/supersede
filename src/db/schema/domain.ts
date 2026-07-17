import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { memberships, organizations } from "@/db/schema/identity";

export const sourceKind = pgEnum("source_kind", [
  "guideline",
  "regulation",
  "paper",
  "standard",
  "internal_policy",
]);
export const sourceStatus = pgEnum("source_status", [
  "active",
  "superseded",
  "retracted",
  "corrected",
]);
export const artifactKind = pgEnum("artifact_kind", [
  "protocol",
  "course",
  "claim_library_entry",
  "decision_doc",
  "marketing_material",
]);
export const reviewStatus = pgEnum("review_status", [
  "suggested",
  "needs_review",
  "reviewed",
  "rejected",
  "retired",
]);
export const edgeKind = pgEnum("edge_kind", [
  "supports",
  "depends_on",
  "contradicts",
  "mentions",
  "acts_on",
]);
export const impactKind = pgEnum("impact_kind", [
  "load_bearing",
  "peripheral",
  "person_exposure",
]);
export const caseStatus = pgEnum("case_status", [
  "draft",
  "approved",
  "retired",
]);
export const deliveryStatus = pgEnum("delivery_status", [
  "assigned",
  "opened",
  "completed",
  "bounced",
]);
export const probeAnswer = pgEnum("probe_answer", ["old", "new", "other"]);
export const remediationStatus = pgEnum("remediation_status", [
  "assigned",
  "in_progress",
  "passed",
  "failed",
]);
export const recheckStatus = pgEnum("recheck_status", [
  "scheduled",
  "assigned",
  "completed",
  "missed",
  "blocked_case_required",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const organizationDomainPolicies = pgTable(
  "organization_domain_policy",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id),
    graphMaxDepth: integer("graph_max_depth").notNull().default(8),
    extractionAutoReviewThreshold: numeric("extraction_auto_review_threshold", {
      precision: 4,
      scale: 3,
    })
      .notNull()
      .default("0.800"),
    rewriteRequiredThreshold: numeric("rewrite_required_threshold", {
      precision: 4,
      scale: 3,
    })
      .notNull()
      .default("0.650"),
    aggregateCohortMinimum: integer("aggregate_cohort_minimum")
      .notNull()
      .default(5),
    sodScope: varchar("sod_scope", { length: 32 })
      .notNull()
      .default("per_object"),
    ...timestamps,
  },
);

export const professionalRoles = pgTable(
  "professional_role",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    code: varchar("code", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    description: text("description").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("professional_role_org_code_uq").on(
      table.organizationId,
      table.code,
    ),
    index("professional_role_org_idx").on(table.organizationId),
  ],
);

export const people = pgTable(
  "person",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    membershipId: uuid("membership_id").references(() => memberships.id),
    externalKey: varchar("external_key", { length: 128 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    professionalRoleId: uuid("professional_role_id")
      .notNull()
      .references(() => professionalRoles.id),
    isSeededPersona: boolean("is_seeded_persona").notNull().default(false),
    responsePattern: varchar("response_pattern", { length: 64 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("person_org_external_key_uq").on(
      table.organizationId,
      table.externalKey,
    ),
    index("person_org_professional_role_idx").on(
      table.organizationId,
      table.professionalRoleId,
    ),
  ],
);

export const sources = pgTable(
  "source",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    kind: sourceKind("kind").notNull(),
    canonicalKey: varchar("canonical_key", { length: 160 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("source_org_key_uq").on(
      table.organizationId,
      table.canonicalKey,
    ),
    index("source_org_kind_idx").on(table.organizationId, table.kind),
  ],
);

export const sourceVersions = pgTable(
  "source_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
    versionLabel: varchar("version_label", { length: 128 }).notNull(),
    status: sourceStatus("status").notNull(),
    effectiveDate: date("effective_date").notNull(),
    storageObjectKey: text("storage_object_key"),
    fileSha256: varchar("file_sha256", { length: 64 }).notNull(),
    summary: text("summary").notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedByMembershipId: uuid("locked_by_membership_id").references(
      () => memberships.id,
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("source_version_label_uq").on(
      table.sourceId,
      table.versionLabel,
    ),
    index("source_version_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const artifacts = pgTable(
  "artifact",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    kind: artifactKind("kind").notNull(),
    ownerMembershipId: uuid("owner_membership_id").references(
      () => memberships.id,
    ),
    canonicalKey: varchar("canonical_key", { length: 160 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("artifact_org_key_uq").on(
      table.organizationId,
      table.canonicalKey,
    ),
    index("artifact_owner_idx").on(
      table.organizationId,
      table.ownerMembershipId,
    ),
  ],
);

export const artifactVersions = pgTable(
  "artifact_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id),
    versionLabel: varchar("version_label", { length: 128 }).notNull(),
    bodyText: text("body_text").notNull(),
    storageObjectKey: text("storage_object_key"),
    fileSha256: varchar("file_sha256", { length: 64 }).notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedByMembershipId: uuid("locked_by_membership_id").references(
      () => memberships.id,
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("artifact_version_label_uq").on(
      table.artifactId,
      table.versionLabel,
    ),
    index("artifact_version_org_idx").on(
      table.organizationId,
      table.artifactId,
    ),
  ],
);

export const documentChunks = pgTable(
  "document_chunk",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    artifactVersionId: uuid("artifact_version_id").references(
      () => artifactVersions.id,
    ),
    sourceVersionId: uuid("source_version_id").references(
      () => sourceVersions.id,
    ),
    chunkOrdinal: integer("chunk_ordinal").notNull(),
    pageLabel: varchar("page_label", { length: 64 }),
    sectionLabel: varchar("section_label", { length: 255 }),
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    text: text("text").notNull(),
    checksum: varchar("checksum", { length: 64 }).notNull(),
    embeddingModel: varchar("embedding_model", { length: 128 }),
    searchVector: text("search_vector"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    ...timestamps,
  },
  (table) => [
    check(
      "document_chunk_exactly_one_parent",
      sql`(${table.artifactVersionId} IS NOT NULL) <> (${table.sourceVersionId} IS NOT NULL)`,
    ),
    check(
      "document_chunk_offsets_order",
      sql`${table.startOffset} < ${table.endOffset}`,
    ),
    uniqueIndex("document_chunk_artifact_ordinal_uq").on(
      table.artifactVersionId,
      table.chunkOrdinal,
    ),
    uniqueIndex("document_chunk_source_ordinal_uq").on(
      table.sourceVersionId,
      table.chunkOrdinal,
    ),
    index("document_chunk_org_artifact_idx").on(
      table.organizationId,
      table.artifactVersionId,
    ),
    index("document_chunk_org_source_idx").on(
      table.organizationId,
      table.sourceVersionId,
    ),
  ],
);
