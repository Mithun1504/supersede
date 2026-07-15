import { sql } from "drizzle-orm";
import {
  AnyPgColumn,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { aiModelRuns, extractionRuns } from "@/db/schema/ai/schema";
import {
  artifactVersions,
  artifacts,
  evidenceSpans,
  sourceVersions,
} from "@/db/schema/corpus/schema";
import { memberships, organizations } from "@/db/schema/identity/schema";
import { workRoles } from "@/db/schema/people/schema";
import { createdAt, timestamptz } from "@/db/schema/shared/columns";
import {
  dependencyEdgeType,
  graphNodeType,
  reviewStatus,
} from "@/db/schema/shared/enums";

export const claims = pgTable(
  "claim",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    retiredAt: timestamptz("retired_at"),
  },
  (t) => [index("claim_artifact_idx").on(t.organizationId, t.artifactId)],
);

export const claimVersions = pgTable(
  "claim_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "restrict" }),
    artifactVersionId: uuid("artifact_version_id")
      .notNull()
      .references(() => artifactVersions.id, { onDelete: "restrict" }),
    versionNumber: integer("version_number").notNull(),
    text: text("text").notNull(),
    normalizedText: text("normalized_text").notNull(),
    primaryEvidenceSpanId: uuid("primary_evidence_span_id")
      .notNull()
      .references(() => evidenceSpans.id, { onDelete: "restrict" }),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
    loadBearingScore: numeric("load_bearing_score", {
      precision: 5,
      scale: 4,
    }).notNull(),
    loadBearingRationale: text("load_bearing_rationale").notNull(),
    reviewStatus: reviewStatus("review_status").notNull().default("suggested"),
    extractionRunId: uuid("extraction_run_id").references(
      () => extractionRuns.id,
      { onDelete: "restrict" },
    ),
    aiModelRunId: uuid("ai_model_run_id").references(() => aiModelRuns.id, {
      onDelete: "restrict",
    }),
    supersedesClaimVersionId: uuid("supersedes_claim_version_id").references(
      (): AnyPgColumn => claimVersions.id,
      { onDelete: "restrict" },
    ),
    createdByMembershipId: uuid("created_by_membership_id").references(
      () => memberships.id,
      { onDelete: "restrict" },
    ),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("claim_version_number_uq").on(t.claimId, t.versionNumber),
    index("claim_version_artifact_idx").on(
      t.organizationId,
      t.artifactVersionId,
    ),
    index("claim_version_review_idx").on(
      t.organizationId,
      t.reviewStatus,
      t.createdAt,
    ),
    check("claim_version_number_chk", sql`${t.versionNumber} > 0`),
    check("claim_version_confidence_chk", sql`${t.confidence} between 0 and 1`),
    check(
      "claim_version_load_bearing_chk",
      sql`${t.loadBearingScore} between 0 and 1`,
    ),
  ],
);

export const graphNodes = pgTable(
  "graph_node",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    nodeType: graphNodeType("node_type").notNull(),
    sourceVersionId: uuid("source_version_id").references(
      () => sourceVersions.id,
      { onDelete: "restrict" },
    ),
    artifactVersionId: uuid("artifact_version_id").references(
      () => artifactVersions.id,
      { onDelete: "restrict" },
    ),
    claimVersionId: uuid("claim_version_id").references(
      () => claimVersions.id,
      { onDelete: "restrict" },
    ),
  },
  (t) => [
    uniqueIndex("graph_node_source_version_uq")
      .on(t.sourceVersionId)
      .where(sql`${t.sourceVersionId} is not null`),
    uniqueIndex("graph_node_artifact_version_uq")
      .on(t.artifactVersionId)
      .where(sql`${t.artifactVersionId} is not null`),
    uniqueIndex("graph_node_claim_version_uq")
      .on(t.claimVersionId)
      .where(sql`${t.claimVersionId} is not null`),
    index("graph_node_type_idx").on(t.organizationId, t.nodeType),
    check(
      "graph_node_exact_type_chk",
      sql`
      (${t.nodeType} = 'source_version' and ${t.sourceVersionId} is not null and ${t.artifactVersionId} is null and ${t.claimVersionId} is null) or
      (${t.nodeType} = 'artifact_version' and ${t.sourceVersionId} is null and ${t.artifactVersionId} is not null and ${t.claimVersionId} is null) or
      (${t.nodeType} = 'claim_version' and ${t.sourceVersionId} is null and ${t.artifactVersionId} is null and ${t.claimVersionId} is not null)
    `,
    ),
  ],
);

export const dependencyEdges = pgTable("dependency_edge", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  retiredAt: timestamptz("retired_at"),
});

export const dependencyEdgeVersions = pgTable(
  "dependency_edge_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    dependencyEdgeId: uuid("dependency_edge_id")
      .notNull()
      .references(() => dependencyEdges.id, { onDelete: "restrict" }),
    versionNumber: integer("version_number").notNull(),
    fromNodeId: uuid("from_node_id")
      .notNull()
      .references(() => graphNodes.id, { onDelete: "restrict" }),
    toNodeId: uuid("to_node_id")
      .notNull()
      .references(() => graphNodes.id, { onDelete: "restrict" }),
    edgeType: dependencyEdgeType("edge_type").notNull(),
    evidenceSpanId: uuid("evidence_span_id")
      .notNull()
      .references(() => evidenceSpans.id, { onDelete: "restrict" }),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
    loadBearingScore: numeric("load_bearing_score", {
      precision: 5,
      scale: 4,
    }).notNull(),
    loadBearingRationale: text("load_bearing_rationale").notNull(),
    reviewStatus: reviewStatus("review_status").notNull().default("suggested"),
    extractionRunId: uuid("extraction_run_id").references(
      () => extractionRuns.id,
      { onDelete: "restrict" },
    ),
    aiModelRunId: uuid("ai_model_run_id").references(() => aiModelRuns.id, {
      onDelete: "restrict",
    }),
    supersedesEdgeVersionId: uuid("supersedes_edge_version_id").references(
      (): AnyPgColumn => dependencyEdgeVersions.id,
      { onDelete: "restrict" },
    ),
    createdByMembershipId: uuid("created_by_membership_id").references(
      () => memberships.id,
      { onDelete: "restrict" },
    ),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("dependency_edge_version_number_uq").on(
      t.dependencyEdgeId,
      t.versionNumber,
    ),
    index("dependency_edge_version_from_idx").on(
      t.organizationId,
      t.fromNodeId,
      t.edgeType,
    ),
    index("dependency_edge_version_to_idx").on(
      t.organizationId,
      t.toNodeId,
      t.edgeType,
    ),
    index("dependency_edge_version_review_idx").on(
      t.organizationId,
      t.reviewStatus,
      t.createdAt,
    ),
    check(
      "dependency_edge_version_nodes_chk",
      sql`${t.fromNodeId} <> ${t.toNodeId}`,
    ),
    check("dependency_edge_version_number_chk", sql`${t.versionNumber} > 0`),
    check(
      "dependency_edge_version_confidence_chk",
      sql`${t.confidence} between 0 and 1 and ${t.loadBearingScore} between 0 and 1`,
    ),
  ],
);

export const roleArtifactExposures = pgTable(
  "role_artifact_exposure",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    workRoleId: uuid("work_role_id")
      .notNull()
      .references(() => workRoles.id, { onDelete: "restrict" }),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "restrict" }),
    evidenceSpanId: uuid("evidence_span_id").references(
      () => evidenceSpans.id,
      { onDelete: "restrict" },
    ),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
    rationale: text("rationale").notNull(),
    reviewStatus: reviewStatus("review_status").notNull().default("suggested"),
    effectiveFrom: timestamptz("effective_from").notNull(),
    effectiveTo: timestamptz("effective_to"),
    supersedesExposureId: uuid("supersedes_exposure_id").references(
      (): AnyPgColumn => roleArtifactExposures.id,
      { onDelete: "restrict" },
    ),
    createdByMembershipId: uuid("created_by_membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("role_artifact_exposure_active_uq")
      .on(t.workRoleId, t.artifactId)
      .where(sql`${t.reviewStatus} = 'accepted' and ${t.effectiveTo} is null`),
    check(
      "role_artifact_exposure_confidence_chk",
      sql`${t.confidence} between 0 and 1`,
    ),
    check(
      "role_artifact_exposure_effective_chk",
      sql`${t.effectiveTo} is null or ${t.effectiveTo} > ${t.effectiveFrom}`,
    ),
  ],
);
