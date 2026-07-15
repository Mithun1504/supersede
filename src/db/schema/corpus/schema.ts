import { sql } from "drizzle-orm";
import {
  AnyPgColumn,
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
  vector,
} from "drizzle-orm/pg-core";

import { memberships, organizations } from "@/db/schema/identity/schema";
import {
  createdAt,
  timestamptz,
  tsvector,
  updatedAt,
} from "@/db/schema/shared/columns";
import {
  artifactKind,
  entityStatus,
  evidenceVerificationStatus,
  processingStatus,
  recordStatus,
  retentionMode,
  scanStatus,
  sourceKind,
  sourceVersionStatus,
  storagePurpose,
} from "@/db/schema/shared/enums";

const shaCheck = (column: AnyPgColumn) => sql`${column} ~ '^[0-9a-f]{64}$'`;

export const corpora = pgTable(
  "corpus",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description").notNull().default(""),
    status: entityStatus("status").notNull().default("active"),
    createdByMembershipId: uuid("created_by_membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("corpus_active_name_uq")
      .on(t.organizationId, t.name)
      .where(sql`${t.status} <> 'retired'`),
  ],
);

export const storageObjects = pgTable(
  "storage_object",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    purpose: storagePurpose("purpose").notNull(),
    provider: varchar("provider", { length: 16 }).notNull(),
    bucketAlias: varchar("bucket_alias", { length: 255 }).notNull(),
    objectKey: text("object_key").notNull(),
    sha256: char("sha256", { length: 64 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    originalFilename: text("original_filename"),
    scanStatus: scanStatus("scan_status").notNull().default("pending"),
    encryptionKeyReference: text("encryption_key_reference"),
    retentionUntil: timestamptz("retention_until"),
    objectLockMode: retentionMode("object_lock_mode"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("storage_object_location_uq").on(
      t.provider,
      t.bucketAlias,
      t.objectKey,
    ),
    index("storage_object_hash_idx").on(t.organizationId, t.sha256),
    index("storage_object_retention_idx").on(
      t.organizationId,
      t.retentionUntil,
    ),
    check(
      "storage_object_provider_chk",
      sql`${t.provider} in ('r2', 's3', 'minio')`,
    ),
    check("storage_object_sha_chk", shaCheck(t.sha256)),
    check("storage_object_size_chk", sql`${t.sizeBytes} >= 0`),
  ],
);

export const uploadSessions = pgTable(
  "upload_session",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    requestedByMembershipId: uuid("requested_by_membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    declaredFilename: text("declared_filename").notNull(),
    declaredMimeType: varchar("declared_mime_type", { length: 255 }).notNull(),
    declaredSize: bigint("declared_size", { mode: "number" }).notNull(),
    storageObjectId: uuid("storage_object_id").references(
      () => storageObjects.id,
      { onDelete: "restrict" },
    ),
    expiresAt: timestamptz("expires_at").notNull(),
    completedAt: timestamptz("completed_at"),
    status: processingStatus("status").notNull().default("queued"),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("upload_session_idempotency_uq").on(
      t.organizationId,
      t.idempotencyKey,
    ),
    index("upload_session_expired_idx")
      .on(t.organizationId, t.expiresAt)
      .where(sql`${t.completedAt} is null`),
    check("upload_session_size_chk", sql`${t.declaredSize} >= 0`),
  ],
);

export const documentVersions = pgTable(
  "document_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    originalStorageObjectId: uuid("original_storage_object_id").references(
      () => storageObjects.id,
      { onDelete: "restrict" },
    ),
    extractedTextStorageObjectId: uuid(
      "extracted_text_storage_object_id",
    ).references(() => storageObjects.id, { onDelete: "restrict" }),
    contentSha256: char("content_sha256", { length: 64 }).notNull(),
    detectedMimeType: varchar("detected_mime_type", { length: 255 }).notNull(),
    parserName: varchar("parser_name", { length: 128 }).notNull(),
    parserVersion: varchar("parser_version", { length: 64 }).notNull(),
    processingStatus: processingStatus("processing_status")
      .notNull()
      .default("queued"),
    parserManifest: jsonb("parser_manifest")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    processingWarnings: jsonb("processing_warnings")
      .$type<unknown[]>()
      .notNull()
      .default([]),
    pageCount: integer("page_count"),
    language: varchar("language", { length: 16 }),
    createdByMembershipId: uuid("created_by_membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("document_version_cache_uq").on(
      t.organizationId,
      t.contentSha256,
      t.parserName,
      t.parserVersion,
    ),
    index("document_version_processing_idx").on(
      t.organizationId,
      t.processingStatus,
      t.createdAt,
    ),
    check("document_version_sha_chk", shaCheck(t.contentSha256)),
    check(
      "document_version_page_count_chk",
      sql`${t.pageCount} is null or ${t.pageCount} >= 0`,
    ),
  ],
);

export const documentChunks = pgTable(
  "document_chunk",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    content: text("content").notNull(),
    contentSha256: char("content_sha256", { length: 64 }).notNull(),
    pageStart: integer("page_start"),
    pageEnd: integer("page_end"),
    sectionPath: text("section_path").array(),
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    location: jsonb("location")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    searchVector: tsvector("search_vector"),
    embedding: vector("embedding", { dimensions: 768 }),
    embeddingProvider: varchar("embedding_provider", { length: 64 }),
    embeddingModel: varchar("embedding_model", { length: 128 }),
    embeddingVersion: varchar("embedding_version", { length: 64 }),
    embeddedAt: timestamptz("embedded_at"),
  },
  (t) => [
    uniqueIndex("document_chunk_position_uq").on(
      t.documentVersionId,
      t.position,
    ),
    index("document_chunk_document_idx").on(
      t.organizationId,
      t.documentVersionId,
    ),
    index("document_chunk_search_idx").using("gin", t.searchVector),
    index("document_chunk_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
    check("document_chunk_position_chk", sql`${t.position} >= 0`),
    check("document_chunk_sha_chk", shaCheck(t.contentSha256)),
    check(
      "document_chunk_offsets_chk",
      sql`${t.startOffset} >= 0 and ${t.endOffset} >= ${t.startOffset}`,
    ),
    check(
      "document_chunk_pages_chk",
      sql`${t.pageStart} is null or (${t.pageStart} >= 0 and (${t.pageEnd} is null or ${t.pageEnd} >= ${t.pageStart}))`,
    ),
  ],
);

export const sources = pgTable(
  "source",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    kind: sourceKind("kind").notNull(),
    title: text("title").notNull(),
    canonicalReference: varchar("canonical_reference", { length: 512 }),
    ownerMembershipId: uuid("owner_membership_id").references(
      () => memberships.id,
      { onDelete: "restrict" },
    ),
    createdAt: createdAt(),
    retiredAt: timestamptz("retired_at"),
  },
  (t) => [
    uniqueIndex("source_canonical_reference_uq")
      .on(t.organizationId, t.canonicalReference)
      .where(sql`${t.canonicalReference} is not null`),
    index("source_title_idx").on(t.organizationId, t.title),
  ],
);

export const sourceVersions = pgTable(
  "source_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    versionNumber: integer("version_number").notNull(),
    versionLabel: varchar("version_label", { length: 128 }).notNull(),
    status: sourceVersionStatus("status").notNull().default("active"),
    recordStatus: recordStatus("record_status").notNull().default("draft"),
    effectiveAt: timestamptz("effective_at").notNull(),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id, { onDelete: "restrict" }),
    supersedesSourceVersionId: uuid("supersedes_source_version_id").references(
      (): AnyPgColumn => sourceVersions.id,
      { onDelete: "restrict" },
    ),
    createdByMembershipId: uuid("created_by_membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("source_version_number_uq").on(t.sourceId, t.versionNumber),
    uniqueIndex("source_version_label_uq").on(t.sourceId, t.versionLabel),
    uniqueIndex("source_version_current_uq")
      .on(t.sourceId)
      .where(sql`${t.recordStatus} = 'approved' and ${t.status} = 'active'`),
    check("source_version_number_chk", sql`${t.versionNumber} > 0`),
    check(
      "source_version_self_chk",
      sql`${t.supersedesSourceVersionId} is null or ${t.supersedesSourceVersionId} <> ${t.id}`,
    ),
  ],
);

export const artifacts = pgTable(
  "artifact",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    kind: artifactKind("kind").notNull(),
    title: text("title").notNull(),
    externalReference: varchar("external_reference", { length: 255 }),
    createdAt: createdAt(),
    retiredAt: timestamptz("retired_at"),
  },
  (t) => [
    uniqueIndex("artifact_external_reference_uq")
      .on(t.organizationId, t.externalReference)
      .where(sql`${t.externalReference} is not null`),
    index("artifact_kind_idx").on(t.organizationId, t.kind),
  ],
);

export const artifactVersions = pgTable(
  "artifact_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "restrict" }),
    versionNumber: integer("version_number").notNull(),
    versionLabel: varchar("version_label", { length: 128 }).notNull(),
    recordStatus: recordStatus("record_status").notNull().default("draft"),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id, { onDelete: "restrict" }),
    effectiveAt: timestamptz("effective_at").notNull(),
    supersedesArtifactVersionId: uuid(
      "supersedes_artifact_version_id",
    ).references((): AnyPgColumn => artifactVersions.id, {
      onDelete: "restrict",
    }),
    createdByMembershipId: uuid("created_by_membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("artifact_version_number_uq").on(t.artifactId, t.versionNumber),
    uniqueIndex("artifact_version_current_uq")
      .on(t.artifactId)
      .where(sql`${t.recordStatus} = 'approved'`),
    check("artifact_version_number_chk", sql`${t.versionNumber} > 0`),
    check(
      "artifact_version_self_chk",
      sql`${t.supersedesArtifactVersionId} is null or ${t.supersedesArtifactVersionId} <> ${t.id}`,
    ),
  ],
);

export const artifactOwners = pgTable(
  "artifact_owner",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "restrict" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    ownerType: varchar("owner_type", { length: 32 }).notNull(),
    effectiveFrom: timestamptz("effective_from").notNull(),
    effectiveTo: timestamptz("effective_to"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("artifact_owner_active_uq")
      .on(t.artifactId, t.membershipId, t.ownerType)
      .where(sql`${t.effectiveTo} is null`),
    check(
      "artifact_owner_type_chk",
      sql`${t.ownerType} in ('primary', 'reviewer', 'steward')`,
    ),
    check(
      "artifact_owner_effective_chk",
      sql`${t.effectiveTo} is null or ${t.effectiveTo} > ${t.effectiveFrom}`,
    ),
  ],
);

export const corpusSources = pgTable(
  "corpus_source",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    corpusId: uuid("corpus_id")
      .notNull()
      .references(() => corpora.id, { onDelete: "restrict" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    addedAt: timestamptz("added_at").notNull().defaultNow(),
    removedAt: timestamptz("removed_at"),
  },
  (t) => [
    primaryKey({ columns: [t.corpusId, t.sourceId, t.addedAt] }),
    uniqueIndex("corpus_source_active_uq")
      .on(t.corpusId, t.sourceId)
      .where(sql`${t.removedAt} is null`),
  ],
);

export const corpusArtifacts = pgTable(
  "corpus_artifact",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    corpusId: uuid("corpus_id")
      .notNull()
      .references(() => corpora.id, { onDelete: "restrict" }),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "restrict" }),
    addedAt: timestamptz("added_at").notNull().defaultNow(),
    removedAt: timestamptz("removed_at"),
  },
  (t) => [
    primaryKey({ columns: [t.corpusId, t.artifactId, t.addedAt] }),
    uniqueIndex("corpus_artifact_active_uq")
      .on(t.corpusId, t.artifactId)
      .where(sql`${t.removedAt} is null`),
  ],
);

export const evidenceSpans = pgTable(
  "evidence_span",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id, { onDelete: "restrict" }),
    documentChunkId: uuid("document_chunk_id").references(
      () => documentChunks.id,
      { onDelete: "restrict" },
    ),
    exactQuote: text("exact_quote").notNull(),
    pageNumber: integer("page_number"),
    sectionPath: text("section_path").array(),
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    sourceContentSha256: char("source_content_sha256", {
      length: 64,
    }).notNull(),
    verificationStatus: evidenceVerificationStatus("verification_status")
      .notNull()
      .default("pending"),
    verificationScore: numeric("verification_score", {
      precision: 5,
      scale: 4,
    }),
    verifiedByMembershipId: uuid("verified_by_membership_id").references(
      () => memberships.id,
      { onDelete: "restrict" },
    ),
    verifiedAt: timestamptz("verified_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("evidence_span_offsets_idx").on(
      t.documentVersionId,
      t.startOffset,
      t.endOffset,
    ),
    check(
      "evidence_span_offsets_chk",
      sql`${t.startOffset} >= 0 and ${t.endOffset} >= ${t.startOffset}`,
    ),
    check("evidence_span_sha_chk", shaCheck(t.sourceContentSha256)),
    check(
      "evidence_span_score_chk",
      sql`${t.verificationScore} is null or ${t.verificationScore} between 0 and 1`,
    ),
  ],
);
