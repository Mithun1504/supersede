import { sql } from "drizzle-orm";
import {
  AnyPgColumn,
  boolean,
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

import { aiModelRuns } from "@/db/schema/ai/schema";
import { changeEventVersions } from "@/db/schema/changes/schema";
import { evidenceSpans, sourceVersions } from "@/db/schema/corpus/schema";
import { approvalRecords } from "@/db/schema/governance/core";
import { memberships, organizations } from "@/db/schema/identity/schema";
import { createdAt, timestamptz } from "@/db/schema/shared/columns";
import {
  answerFormat,
  caseRetirementReason,
  recordStatus,
} from "@/db/schema/shared/enums";

export const divergences = pgTable(
  "divergence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    changeEventVersionId: uuid("change_event_version_id")
      .notNull()
      .references(() => changeEventVersions.id, { onDelete: "restrict" }),
    oldRule: text("old_rule").notNull(),
    newRule: text("new_rule").notNull(),
    affectedPopulation: text("affected_population").notNull(),
    status: recordStatus("status").notNull().default("draft"),
    createdByMembershipId: uuid("created_by_membership_id").references(
      () => memberships.id,
      { onDelete: "restrict" },
    ),
    aiModelRunId: uuid("ai_model_run_id").references(() => aiModelRuns.id, {
      onDelete: "restrict",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    index("divergence_change_idx").on(
      t.organizationId,
      t.changeEventVersionId,
      t.status,
    ),
  ],
);

export const divergenceCases = pgTable("divergence_case", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "restrict" }),
  divergenceId: uuid("divergence_id")
    .notNull()
    .references(() => divergences.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
});

export const divergenceCaseVersions = pgTable(
  "divergence_case_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    divergenceCaseId: uuid("divergence_case_id")
      .notNull()
      .references(() => divergenceCases.id, { onDelete: "restrict" }),
    versionNumber: integer("version_number").notNull(),
    scenario: text("scenario").notNull(),
    answerFormat: answerFormat("answer_format").notNull(),
    options: jsonb("options").$type<unknown[]>(),
    oldAnswer: text("old_answer").notNull(),
    newAnswer: text("new_answer").notNull(),
    rationale: text("rationale").notNull(),
    gradingRubric: jsonb("grading_rubric")
      .$type<Record<string, unknown>>()
      .notNull(),
    recordStatus: recordStatus("record_status").notNull().default("draft"),
    aiModelRunId: uuid("ai_model_run_id").references(() => aiModelRuns.id, {
      onDelete: "restrict",
    }),
    supersedesCaseVersionId: uuid("supersedes_case_version_id").references(
      (): AnyPgColumn => divergenceCaseVersions.id,
      { onDelete: "restrict" },
    ),
    createdByMembershipId: uuid("created_by_membership_id").references(
      () => memberships.id,
      { onDelete: "restrict" },
    ),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("divergence_case_version_number_uq").on(
      t.divergenceCaseId,
      t.versionNumber,
    ),
    check("divergence_case_version_number_chk", sql`${t.versionNumber} > 0`),
    check(
      "divergence_case_options_chk",
      sql`(${t.answerFormat} in ('single_choice', 'multiple_choice') and ${t.options} is not null) or (${t.answerFormat} not in ('single_choice', 'multiple_choice') and ${t.options} is null)`,
    ),
  ],
);

export const caseVersionCitations = pgTable(
  "case_version_citation",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    caseVersionId: uuid("case_version_id")
      .notNull()
      .references(() => divergenceCaseVersions.id, { onDelete: "restrict" }),
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
    primaryKey({ columns: [t.caseVersionId, t.citationSide, t.position] }),
    check(
      "case_version_citation_side_chk",
      sql`${t.citationSide} in ('old', 'new')`,
    ),
    check("case_version_citation_position_chk", sql`${t.position} >= 0`),
  ],
);

export const caseRetirements = pgTable("case_retirement", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "restrict" }),
  caseVersionId: uuid("case_version_id")
    .notNull()
    .unique()
    .references(() => divergenceCaseVersions.id, { onDelete: "restrict" }),
  reason: caseRetirementReason("reason").notNull(),
  excludesHistoricalMetrics: boolean("excludes_historical_metrics")
    .notNull()
    .default(false),
  rationale: text("rationale").notNull(),
  retiredByMembershipId: uuid("retired_by_membership_id")
    .notNull()
    .references(() => memberships.id, { onDelete: "restrict" }),
  retiredAt: timestamptz("retired_at").notNull().defaultNow(),
  approvalRecordId: uuid("approval_record_id")
    .notNull()
    .unique()
    .references(() => approvalRecords.id, { onDelete: "restrict" }),
});
