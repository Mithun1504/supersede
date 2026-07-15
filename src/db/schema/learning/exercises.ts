import { sql } from "drizzle-orm";
import {
  AnyPgColumn,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { aiModelRuns } from "@/db/schema/ai/schema";
import { divergences } from "@/db/schema/cases/core";
import { evidenceSpans, storageObjects } from "@/db/schema/corpus/schema";
import { memberships, organizations } from "@/db/schema/identity/schema";
import { createdAt, timestamptz } from "@/db/schema/shared/columns";
import {
  answerFormat,
  artifactKind,
  recordStatus,
} from "@/db/schema/shared/enums";

export const exercises = pgTable("exercise", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "restrict" }),
  divergenceId: uuid("divergence_id")
    .notNull()
    .references(() => divergences.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  retiredAt: timestamptz("retired_at"),
});

export const exerciseVersions = pgTable(
  "exercise_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    versionNumber: integer("version_number").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    instructions: text("instructions").notNull(),
    artifactKind: artifactKind("artifact_kind").notNull(),
    starterContent: text("starter_content"),
    starterStorageObjectId: uuid("starter_storage_object_id").references(
      () => storageObjects.id,
      { onDelete: "restrict" },
    ),
    answerFormat: answerFormat("answer_format")
      .notNull()
      .default("artifact_edit"),
    gradingRubric: jsonb("grading_rubric")
      .$type<Record<string, unknown>>()
      .notNull(),
    newRuleEvidenceSpanId: uuid("new_rule_evidence_span_id")
      .notNull()
      .references(() => evidenceSpans.id, { onDelete: "restrict" }),
    recordStatus: recordStatus("record_status").notNull().default("draft"),
    aiModelRunId: uuid("ai_model_run_id").references(() => aiModelRuns.id, {
      onDelete: "restrict",
    }),
    supersedesExerciseVersionId: uuid(
      "supersedes_exercise_version_id",
    ).references((): AnyPgColumn => exerciseVersions.id, {
      onDelete: "restrict",
    }),
    createdByMembershipId: uuid("created_by_membership_id").references(
      () => memberships.id,
      { onDelete: "restrict" },
    ),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("exercise_version_number_uq").on(t.exerciseId, t.versionNumber),
    check("exercise_version_number_chk", sql`${t.versionNumber} > 0`),
    check(
      "exercise_version_starter_chk",
      sql`num_nonnulls(${t.starterContent}, ${t.starterStorageObjectId}) = 1`,
    ),
    check(
      "exercise_version_format_chk",
      sql`${t.answerFormat} = 'artifact_edit'`,
    ),
  ],
);
