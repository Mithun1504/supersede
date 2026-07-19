import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  artifactVersions,
  caseStatus,
  deliveryStatus,
  impactKind,
  people,
  probeAnswer,
  recheckStatus,
  remediationStatus,
  sourceVersions,
  sources,
} from "@/db/schema/domain";
import { memberships, organizations } from "@/db/schema/identity";

export const changeEvents = pgTable(
  "change_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
    enteredByMembershipId: uuid("entered_by_membership_id")
      .notNull()
      .references(() => memberships.id),
    validatedByMembershipId: uuid("validated_by_membership_id").references(
      () => memberships.id,
    ),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("change_event_org_source_idx").on(
      table.organizationId,
      table.sourceId,
    ),
    check(
      "change_event_validator_distinct",
      sql`${table.validatedByMembershipId} IS NULL OR ${table.enteredByMembershipId} <> ${table.validatedByMembershipId}`,
    ),
  ],
);

export const changeEventVersions = pgTable(
  "change_event_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    changeEventId: uuid("change_event_id")
      .notNull()
      .references(() => changeEvents.id),
    oldSourceVersionId: uuid("old_source_version_id")
      .notNull()
      .references(() => sourceVersions.id),
    newSourceVersionId: uuid("new_source_version_id")
      .notNull()
      .references(() => sourceVersions.id),
    versionLabel: varchar("version_label", { length: 128 }).notNull(),
    oldRule: text("old_rule").notNull(),
    newRule: text("new_rule").notNull(),
    affectedPopulation: text("affected_population").notNull(),
    diffSummary: jsonb("diff_summary")
      .$type<Record<string, unknown>>()
      .notNull(),
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
      "change_event_version_sources_distinct",
      sql`${table.oldSourceVersionId} <> ${table.newSourceVersionId}`,
    ),
    uniqueIndex("change_event_version_label_uq").on(
      table.changeEventId,
      table.versionLabel,
    ),
    index("change_event_version_org_idx").on(
      table.organizationId,
      table.changeEventId,
    ),
  ],
);

export const changeImpacts = pgTable(
  "change_impact",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    changeEventVersionId: uuid("change_event_version_id")
      .notNull()
      .references(() => changeEventVersions.id),
    impactedObjectType: varchar("impacted_object_type", {
      length: 48,
    }).notNull(),
    impactedObjectId: uuid("impacted_object_id").notNull(),
    impactKind: impactKind("impact_kind").notNull(),
    pathEdgeIds: uuid("path_edge_ids").array().notNull(),
    pathDepth: integer("path_depth").notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
    rationale: text("rationale").notNull(),
    rewriteRequired: varchar("rewrite_required", { length: 16 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "change_impact_confidence_range",
      sql`${table.confidence} BETWEEN 0 AND 1`,
    ),
    check("change_impact_max_depth", sql`${table.pathDepth} BETWEEN 0 AND 8`),
    check(
      "change_impact_rewrite_enum",
      sql`${table.rewriteRequired} IN ('yes', 'no', 'candidate')`,
    ),
    uniqueIndex("change_impact_object_uq").on(
      table.changeEventVersionId,
      table.impactedObjectType,
      table.impactedObjectId,
    ),
    index("change_impact_org_event_idx").on(
      table.organizationId,
      table.changeEventVersionId,
    ),
  ],
);

export const divergenceCases = pgTable(
  "divergence_case",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    changeEventId: uuid("change_event_id")
      .notNull()
      .references(() => changeEvents.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("divergence_case_org_event_idx").on(
      table.organizationId,
      table.changeEventId,
    ),
  ],
);

export const divergenceCaseVersions = pgTable(
  "divergence_case_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => divergenceCases.id),
    changeEventVersionId: uuid("change_event_version_id")
      .notNull()
      .references(() => changeEventVersions.id),
    versionLabel: varchar("version_label", { length: 128 }).notNull(),
    scenario: text("scenario").notNull(),
    oldAnswer: text("old_answer").notNull(),
    newAnswer: text("new_answer").notNull(),
    rationale: text("rationale").notNull(),
    oldCitation: jsonb("old_citation")
      .$type<Record<string, unknown>>()
      .notNull(),
    newCitation: jsonb("new_citation")
      .$type<Record<string, unknown>>()
      .notNull(),
    status: caseStatus("status").notNull().default("draft"),
    authoredByMembershipId: uuid("authored_by_membership_id")
      .notNull()
      .references(() => memberships.id),
    ambiguityNote: text("ambiguity_note"),
    approvedByMembershipId: uuid("approved_by_membership_id").references(
      () => memberships.id,
    ),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
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
    uniqueIndex("divergence_case_version_label_uq").on(
      table.caseId,
      table.versionLabel,
    ),
    index("divergence_case_version_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const probeAssignments = pgTable(
  "probe_assignment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    caseVersionId: uuid("case_version_id")
      .notNull()
      .references(() => divergenceCaseVersions.id),
    changeEventVersionId: uuid("change_event_version_id")
      .notNull()
      .references(() => changeEventVersions.id),
    assignedByMembershipId: uuid("assigned_by_membership_id").references(
      () => memberships.id,
    ),
    dueAt: timestamp("due_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("probe_assignment_unique_uq").on(
      table.personId,
      table.caseVersionId,
    ),
    index("probe_assignment_org_event_idx").on(
      table.organizationId,
      table.changeEventVersionId,
    ),
  ],
);

export const probeDeliveryEvents = pgTable(
  "probe_delivery_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => probeAssignments.id),
    status: deliveryStatus("status").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("probe_delivery_event_assignment_idx").on(
      table.organizationId,
      table.assignmentId,
    ),
  ],
);

export const probeResponses = pgTable(
  "probe_response",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => probeAssignments.id),
    answeredWith: probeAnswer("answered_with").notNull(),
    responseText: text("response_text").notNull(),
    gradingConfidence: numeric("grading_confidence", {
      precision: 4,
      scale: 3,
    }).notNull(),
    gradingRationale: text("grading_rationale").notNull(),
    gradingEvidenceQuote: text("grading_evidence_quote"),
    reviewRequired: boolean("review_required").notNull().default(true),
    assessedAt: timestamp("assessed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "probe_response_grading_confidence_range",
      sql`${table.gradingConfidence} BETWEEN 0 AND 1`,
    ),
    uniqueIndex("probe_response_assignment_uq").on(table.assignmentId),
    index("probe_response_org_answer_idx").on(
      table.organizationId,
      table.answeredWith,
    ),
  ],
);

export const remediationAssignments = pgTable(
  "remediation_assignment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    probeResponseId: uuid("probe_response_id")
      .notNull()
      .references(() => probeResponses.id),
    artifactVersionId: uuid("artifact_version_id")
      .notNull()
      .references(() => artifactVersions.id),
    status: remediationStatus("status").notNull().default("assigned"),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("remediation_assignment_response_uq").on(table.probeResponseId),
    index("remediation_assignment_org_person_idx").on(
      table.organizationId,
      table.personId,
    ),
  ],
);

export const remediationAttempts = pgTable(
  "remediation_attempt",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    remediationAssignmentId: uuid("remediation_assignment_id")
      .notNull()
      .references(() => remediationAssignments.id),
    submittedPatch: text("submitted_patch").notNull(),
    feedback: text("feedback").notNull(),
    passed: boolean("passed").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("remediation_attempt_assignment_idx").on(
      table.organizationId,
      table.remediationAssignmentId,
    ),
  ],
);

export const recheckAssignments = pgTable(
  "recheck_assignment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    changeEventVersionId: uuid("change_event_version_id")
      .notNull()
      .references(() => changeEventVersions.id),
    remediationAssignmentId: uuid("remediation_assignment_id").references(
      () => remediationAssignments.id,
    ),
    caseVersionId: uuid("case_version_id").references(
      () => divergenceCaseVersions.id,
    ),
    dueOn: date("due_on").notNull(),
    status: recheckStatus("status").notNull().default("scheduled"),
    result: probeAnswer("result"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("recheck_assignment_due_idx").on(table.organizationId, table.dueOn),
    uniqueIndex("recheck_assignment_remediation_due_uq")
      .on(table.remediationAssignmentId, table.dueOn)
      .where(sql`${table.remediationAssignmentId} is not null`),
    index("recheck_assignment_person_change_idx").on(
      table.personId,
      table.changeEventVersionId,
      table.dueOn,
    ),
  ],
);

export const reportBundles = pgTable(
  "report_bundle",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    changeEventVersionId: uuid("change_event_version_id")
      .notNull()
      .references(() => changeEventVersions.id),
    generatedByMembershipId: uuid("generated_by_membership_id")
      .notNull()
      .references(() => memberships.id),
    storageObjectKey: text("storage_object_key").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull(),
    cutoffAt: timestamp("cutoff_at", { withTimezone: true }).notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("report_bundle_event_sha_uq").on(
      table.changeEventVersionId,
      table.sha256,
    ),
    index("report_bundle_org_event_idx").on(
      table.organizationId,
      table.changeEventVersionId,
    ),
  ],
);
