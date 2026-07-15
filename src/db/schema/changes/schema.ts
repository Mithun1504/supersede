import { sql } from "drizzle-orm";
import {
  AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { aiModelRuns } from "@/db/schema/ai/schema";
import {
  artifactVersions,
  artifacts,
  evidenceSpans,
  sourceVersions,
  sources,
} from "@/db/schema/corpus/schema";
import {
  claimVersions,
  dependencyEdgeVersions,
  graphNodes,
} from "@/db/schema/graph/schema";
import { memberships, organizations } from "@/db/schema/identity/schema";
import { workflowRuns } from "@/db/schema/operations/core";
import { people, workRoles } from "@/db/schema/people/schema";
import { createdAt, timestamptz, updatedAt } from "@/db/schema/shared/columns";
import {
  artifactRemediationStatus,
  changeEventStatus,
  impactClass,
  reviewStatus,
  workflowStatus,
} from "@/db/schema/shared/enums";

export const changeEvents = pgTable(
  "change_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    cancelledAt: timestamptz("cancelled_at"),
  },
  (t) => [
    index("change_event_source_idx").on(
      t.organizationId,
      t.sourceId,
      t.createdAt,
    ),
  ],
);

export const changeEventVersions = pgTable(
  "change_event_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    changeEventId: uuid("change_event_id")
      .notNull()
      .references(() => changeEvents.id, { onDelete: "restrict" }),
    versionNumber: integer("version_number").notNull(),
    oldSourceVersionId: uuid("old_source_version_id")
      .notNull()
      .references(() => sourceVersions.id, { onDelete: "restrict" }),
    newSourceVersionId: uuid("new_source_version_id")
      .notNull()
      .references(() => sourceVersions.id, { onDelete: "restrict" }),
    oldRule: text("old_rule").notNull(),
    newRule: text("new_rule").notNull(),
    affectedPopulation: text("affected_population").notNull(),
    exclusions: text("exclusions"),
    unresolvedAmbiguity: text("unresolved_ambiguity"),
    diffSummary: text("diff_summary").notNull(),
    status: changeEventStatus("status").notNull().default("draft"),
    enteredByMembershipId: uuid("entered_by_membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    submittedAt: timestamptz("submitted_at"),
    aiModelRunId: uuid("ai_model_run_id").references(() => aiModelRuns.id, {
      onDelete: "restrict",
    }),
    supersedesChangeEventVersionId: uuid(
      "supersedes_change_event_version_id",
    ).references((): AnyPgColumn => changeEventVersions.id, {
      onDelete: "restrict",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("change_event_version_number_uq").on(
      t.changeEventId,
      t.versionNumber,
    ),
    check("change_event_version_number_chk", sql`${t.versionNumber} > 0`),
    check(
      "change_event_version_sources_chk",
      sql`${t.oldSourceVersionId} <> ${t.newSourceVersionId}`,
    ),
  ],
);

export const changeEventVersionCitations = pgTable(
  "change_event_version_citation",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    changeEventVersionId: uuid("change_event_version_id")
      .notNull()
      .references(() => changeEventVersions.id, { onDelete: "restrict" }),
    citationSide: varchar("citation_side", { length: 8 }).notNull(),
    sourceVersionId: uuid("source_version_id")
      .notNull()
      .references(() => sourceVersions.id, { onDelete: "restrict" }),
    evidenceSpanId: uuid("evidence_span_id")
      .notNull()
      .references(() => evidenceSpans.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.changeEventVersionId, t.citationSide, t.position],
    }),
    check(
      "change_event_citation_side_chk",
      sql`${t.citationSide} in ('old', 'new')`,
    ),
    check("change_event_citation_position_chk", sql`${t.position} >= 0`),
  ],
);

export const propagationRuns = pgTable(
  "propagation_run",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    changeEventVersionId: uuid("change_event_version_id")
      .notNull()
      .references(() => changeEventVersions.id, { onDelete: "restrict" }),
    workflowRunId: uuid("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "restrict" }),
    graphCutoffAt: timestamptz("graph_cutoff_at").notNull(),
    algorithmVersion: varchar("algorithm_version", { length: 64 }).notNull(),
    maxDepth: integer("max_depth").notNull(),
    status: workflowStatus("status").notNull().default("queued"),
    nodesExamined: integer("nodes_examined").notNull().default(0),
    edgesExamined: integer("edges_examined").notNull().default(0),
    impactsFound: integer("impacts_found").notNull().default(0),
    startedAt: timestamptz("started_at"),
    completedAt: timestamptz("completed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("propagation_run_idempotency_uq").on(
      t.changeEventVersionId,
      t.graphCutoffAt,
      t.algorithmVersion,
    ),
    check("propagation_run_depth_chk", sql`${t.maxDepth} between 1 and 50`),
    check(
      "propagation_run_counts_chk",
      sql`${t.nodesExamined} >= 0 and ${t.edgesExamined} >= 0 and ${t.impactsFound} >= 0`,
    ),
  ],
);

export const changeImpacts = pgTable(
  "change_impact",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    propagationRunId: uuid("propagation_run_id")
      .notNull()
      .references(() => propagationRuns.id, { onDelete: "restrict" }),
    changeEventVersionId: uuid("change_event_version_id")
      .notNull()
      .references(() => changeEventVersions.id, { onDelete: "restrict" }),
    impactClass: impactClass("impact_class").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
    rationale: text("rationale").notNull(),
    claimVersionId: uuid("claim_version_id").references(
      () => claimVersions.id,
      { onDelete: "restrict" },
    ),
    artifactVersionId: uuid("artifact_version_id").references(
      () => artifactVersions.id,
      { onDelete: "restrict" },
    ),
    workRoleId: uuid("work_role_id").references(() => workRoles.id, {
      onDelete: "restrict",
    }),
    personId: uuid("person_id").references(() => people.id, {
      onDelete: "restrict",
    }),
    requiresRemediation: boolean("requires_remediation")
      .notNull()
      .default(false),
    reviewStatus: reviewStatus("review_status").notNull().default("suggested"),
    createdAt: createdAt(),
  },
  (t) => [
    index("change_impact_class_idx").on(
      t.organizationId,
      t.changeEventVersionId,
      t.impactClass,
    ),
    uniqueIndex("change_impact_claim_uq")
      .on(t.propagationRunId, t.claimVersionId)
      .where(sql`${t.claimVersionId} is not null`),
    uniqueIndex("change_impact_artifact_uq")
      .on(t.propagationRunId, t.artifactVersionId)
      .where(sql`${t.artifactVersionId} is not null`),
    uniqueIndex("change_impact_role_uq")
      .on(t.propagationRunId, t.workRoleId)
      .where(sql`${t.workRoleId} is not null`),
    uniqueIndex("change_impact_person_uq")
      .on(t.propagationRunId, t.personId)
      .where(sql`${t.personId} is not null`),
    check(
      "change_impact_target_chk",
      sql`num_nonnulls(${t.claimVersionId}, ${t.artifactVersionId}, ${t.workRoleId}, ${t.personId}) = 1`,
    ),
    check("change_impact_confidence_chk", sql`${t.confidence} between 0 and 1`),
  ],
);

export const changeImpactPaths = pgTable(
  "change_impact_path",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    changeImpactId: uuid("change_impact_id")
      .notNull()
      .references(() => changeImpacts.id, { onDelete: "restrict" }),
    pathRank: integer("path_rank").notNull(),
    pathConfidence: numeric("path_confidence", {
      precision: 5,
      scale: 4,
    }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("change_impact_path_rank_uq").on(t.changeImpactId, t.pathRank),
    check("change_impact_path_rank_chk", sql`${t.pathRank} >= 0`),
    check(
      "change_impact_path_confidence_chk",
      sql`${t.pathConfidence} between 0 and 1`,
    ),
  ],
);

export const changeImpactPathSteps = pgTable(
  "change_impact_path_step",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    changeImpactPathId: uuid("change_impact_path_id")
      .notNull()
      .references(() => changeImpactPaths.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    graphNodeId: uuid("graph_node_id")
      .notNull()
      .references(() => graphNodes.id, { onDelete: "restrict" }),
    dependencyEdgeVersionId: uuid("dependency_edge_version_id").references(
      () => dependencyEdgeVersions.id,
      { onDelete: "restrict" },
    ),
  },
  (t) => [
    primaryKey({ columns: [t.changeImpactPathId, t.position] }),
    check("change_impact_path_step_position_chk", sql`${t.position} >= 0`),
  ],
);

export const artifactRemediations = pgTable(
  "artifact_remediation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    changeImpactId: uuid("change_impact_id")
      .notNull()
      .references(() => changeImpacts.id, { onDelete: "restrict" }),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "restrict" }),
    impactedArtifactVersionId: uuid("impacted_artifact_version_id")
      .notNull()
      .references(() => artifactVersions.id, { onDelete: "restrict" }),
    assignedToMembershipId: uuid("assigned_to_membership_id").references(
      () => memberships.id,
      { onDelete: "restrict" },
    ),
    requiredAction: varchar("required_action", { length: 32 }).notNull(),
    status: artifactRemediationStatus("status").notNull().default("open"),
    dueAt: timestamptz("due_at"),
    resolvedArtifactVersionId: uuid("resolved_artifact_version_id").references(
      () => artifactVersions.id,
      { onDelete: "restrict" },
    ),
    verifiedByMembershipId: uuid("verified_by_membership_id").references(
      () => memberships.id,
      { onDelete: "restrict" },
    ),
    verifiedAt: timestamptz("verified_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("artifact_remediation_impact_artifact_uq").on(
      t.changeImpactId,
      t.artifactId,
    ),
    index("artifact_remediation_queue_idx").on(
      t.organizationId,
      t.assignedToMembershipId,
      t.status,
      t.dueAt,
    ),
    check(
      "artifact_remediation_action_chk",
      sql`${t.requiredAction} in ('rewrite', 'line_edit', 'review_only', 'retire')`,
    ),
    check(
      "artifact_remediation_verification_chk",
      sql`(${t.verifiedAt} is null and ${t.verifiedByMembershipId} is null) or (${t.verifiedAt} is not null and ${t.verifiedByMembershipId} is not null)`,
    ),
  ],
);
