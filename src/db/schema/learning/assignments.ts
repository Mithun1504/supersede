import { sql } from "drizzle-orm";
import {
  AnyPgColumn,
  char,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { aiModelRuns } from "@/db/schema/ai/schema";
import { divergenceCaseVersions, divergences } from "@/db/schema/cases/core";
import { releaseBatches } from "@/db/schema/cases/releases";
import { changeEventVersions } from "@/db/schema/changes/schema";
import { evidenceSpans, storageObjects } from "@/db/schema/corpus/schema";
import { memberships, organizations } from "@/db/schema/identity/schema";
import { exerciseVersions } from "@/db/schema/learning/exercises";
import { people } from "@/db/schema/people/schema";
import { createdAt, timestamptz, updatedAt } from "@/db/schema/shared/columns";
import {
  answerFormat,
  assessmentLabel,
  assessmentSource,
  assignmentStatus,
  deliveryEventType,
  recheckStatus,
  remediationStatus,
} from "@/db/schema/shared/enums";

export const probeAssignments = pgTable(
  "probe_assignment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    caseVersionId: uuid("case_version_id")
      .notNull()
      .references(() => divergenceCaseVersions.id, { onDelete: "restrict" }),
    divergenceId: uuid("divergence_id")
      .notNull()
      .references(() => divergences.id, { onDelete: "restrict" }),
    changeEventVersionId: uuid("change_event_version_id")
      .notNull()
      .references(() => changeEventVersions.id, { onDelete: "restrict" }),
    releaseBatchId: uuid("release_batch_id").references(
      () => releaseBatches.id,
      { onDelete: "restrict" },
    ),
    recheckAssignmentId: uuid("recheck_assignment_id").references(
      (): AnyPgColumn => recheckAssignments.id,
      { onDelete: "restrict" },
    ),
    assignmentKind: varchar("assignment_kind", { length: 16 }).notNull(),
    status: assignmentStatus("status").notNull().default("assigned"),
    assignedAt: timestamptz("assigned_at").notNull().defaultNow(),
    dueAt: timestamptz("due_at").notNull(),
    openedAt: timestamptz("opened_at"),
    completedAt: timestamptz("completed_at"),
    createdAt: createdAt(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
  },
  (t) => [
    uniqueIndex("probe_assignment_idempotency_uq").on(
      t.organizationId,
      t.idempotencyKey,
    ),
    uniqueIndex("probe_assignment_recheck_uq")
      .on(t.recheckAssignmentId)
      .where(sql`${t.recheckAssignmentId} is not null`),
    index("probe_assignment_person_queue_idx").on(
      t.organizationId,
      t.personId,
      t.status,
      t.dueAt,
    ),
    index("probe_assignment_change_idx").on(
      t.organizationId,
      t.changeEventVersionId,
      t.status,
    ),
    check(
      "probe_assignment_kind_chk",
      sql`${t.assignmentKind} in ('initial', 'recheck_30', 'recheck_90')`,
    ),
    check(
      "probe_assignment_recheck_kind_chk",
      sql`(${t.assignmentKind} = 'initial' and ${t.recheckAssignmentId} is null) or (${t.assignmentKind} <> 'initial' and ${t.recheckAssignmentId} is not null)`,
    ),
  ],
);

export const probeDeliveryEvents = pgTable(
  "probe_delivery_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    probeAssignmentId: uuid("probe_assignment_id")
      .notNull()
      .references(() => probeAssignments.id, { onDelete: "restrict" }),
    eventType: deliveryEventType("event_type").notNull(),
    channel: varchar("channel", { length: 16 }).notNull(),
    providerEventId: varchar("provider_event_id", { length: 255 }),
    providerTimestamp: timestamptz("provider_timestamp"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    occurredAt: timestamptz("occurred_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("probe_delivery_provider_event_uq")
      .on(t.channel, t.providerEventId)
      .where(sql`${t.providerEventId} is not null`),
    index("probe_delivery_timeline_idx").on(
      t.organizationId,
      t.probeAssignmentId,
      t.occurredAt,
    ),
    check(
      "probe_delivery_channel_chk",
      sql`${t.channel} in ('in_app', 'email', 'slack', 'lms', 'simulated')`,
    ),
  ],
);

export const probeResponses = pgTable(
  "probe_response",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    probeAssignmentId: uuid("probe_assignment_id")
      .notNull()
      .unique()
      .references(() => probeAssignments.id, { onDelete: "restrict" }),
    answerFormat: answerFormat("answer_format").notNull(),
    selectedOptionIds: jsonb("selected_option_ids").$type<string[]>(),
    freeTextCiphertext: text("free_text_ciphertext"),
    submittedAt: timestamptz("submitted_at").notNull(),
    clientSubmissionId: varchar("client_submission_id", {
      length: 255,
    }).notNull(),
    contentSha256: char("content_sha256", { length: 64 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("probe_response_client_submission_uq").on(
      t.organizationId,
      t.clientSubmissionId,
    ),
    check(
      "probe_response_payload_chk",
      sql`
      (${t.answerFormat} in ('single_choice', 'multiple_choice') and ${t.selectedOptionIds} is not null and ${t.freeTextCiphertext} is null) or
      (${t.answerFormat} = 'free_text' and ${t.selectedOptionIds} is null and ${t.freeTextCiphertext} is not null)
    `,
    ),
    check("probe_response_sha_chk", sql`${t.contentSha256} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const probeAssessments = pgTable(
  "probe_assessment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    probeResponseId: uuid("probe_response_id")
      .notNull()
      .references(() => probeResponses.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    label: assessmentLabel("label").notNull(),
    source: assessmentSource("source").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    matchedRationale: text("matched_rationale").notNull(),
    ambiguityReason: text("ambiguity_reason"),
    aiModelRunId: uuid("ai_model_run_id").references(() => aiModelRuns.id, {
      onDelete: "restrict",
    }),
    assessedByMembershipId: uuid("assessed_by_membership_id").references(
      () => memberships.id,
      { onDelete: "restrict" },
    ),
    supersedesProbeAssessmentId: uuid(
      "supersedes_probe_assessment_id",
    ).references((): AnyPgColumn => probeAssessments.id, {
      onDelete: "restrict",
    }),
    assessedAt: timestamptz("assessed_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("probe_assessment_revision_uq").on(
      t.probeResponseId,
      t.revision,
    ),
    uniqueIndex("probe_assessment_successor_uq")
      .on(t.supersedesProbeAssessmentId)
      .where(sql`${t.supersedesProbeAssessmentId} is not null`),
    check("probe_assessment_revision_chk", sql`${t.revision} > 0`),
    check(
      "probe_assessment_confidence_chk",
      sql`${t.confidence} is null or ${t.confidence} between 0 and 1`,
    ),
  ],
);

export const remediationAssignments = pgTable(
  "remediation_assignment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    triggerProbeAssessmentId: uuid("trigger_probe_assessment_id")
      .notNull()
      .unique()
      .references(() => probeAssessments.id, { onDelete: "restrict" }),
    exerciseVersionId: uuid("exercise_version_id")
      .notNull()
      .references(() => exerciseVersions.id, { onDelete: "restrict" }),
    status: remediationStatus("status").notNull().default("assigned"),
    assignedAt: timestamptz("assigned_at").notNull().defaultNow(),
    dueAt: timestamptz("due_at").notNull(),
    openedAt: timestamptz("opened_at"),
    completedAt: timestamptz("completed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("remediation_assignment_person_queue_idx").on(
      t.organizationId,
      t.personId,
      t.status,
      t.dueAt,
    ),
  ],
);

export const remediationAttempts = pgTable(
  "remediation_attempt",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    remediationAssignmentId: uuid("remediation_assignment_id")
      .notNull()
      .references(() => remediationAssignments.id, { onDelete: "restrict" }),
    attemptNumber: integer("attempt_number").notNull(),
    submissionTextCiphertext: text("submission_text_ciphertext"),
    submissionStorageObjectId: uuid("submission_storage_object_id").references(
      () => storageObjects.id,
      { onDelete: "restrict" },
    ),
    submittedAt: timestamptz("submitted_at").notNull(),
    aiModelRunId: uuid("ai_model_run_id").references(() => aiModelRuns.id, {
      onDelete: "restrict",
    }),
    outcome: varchar("outcome", { length: 16 }).notNull(),
    feedback: text("feedback").notNull(),
    feedbackEvidenceSpanId: uuid("feedback_evidence_span_id")
      .notNull()
      .references(() => evidenceSpans.id, { onDelete: "restrict" }),
    reviewedByMembershipId: uuid("reviewed_by_membership_id").references(
      () => memberships.id,
      { onDelete: "restrict" },
    ),
    assessedAt: timestamptz("assessed_at").notNull(),
  },
  (t) => [
    uniqueIndex("remediation_attempt_number_uq").on(
      t.remediationAssignmentId,
      t.attemptNumber,
    ),
    check("remediation_attempt_number_chk", sql`${t.attemptNumber} > 0`),
    check(
      "remediation_attempt_submission_chk",
      sql`num_nonnulls(${t.submissionTextCiphertext}, ${t.submissionStorageObjectId}) = 1`,
    ),
    check(
      "remediation_attempt_outcome_chk",
      sql`${t.outcome} in ('passed', 'failed', 'needs_review')`,
    ),
  ],
);

export const recheckAssignments = pgTable(
  "recheck_assignment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    remediationAssignmentId: uuid("remediation_assignment_id")
      .notNull()
      .references(() => remediationAssignments.id, { onDelete: "restrict" }),
    divergenceId: uuid("divergence_id")
      .notNull()
      .references(() => divergences.id, { onDelete: "restrict" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    intervalDays: integer("interval_days").notNull(),
    dueAt: timestamptz("due_at").notNull(),
    status: recheckStatus("status").notNull().default("scheduled"),
    originalCaseVersionId: uuid("original_case_version_id")
      .notNull()
      .references(() => divergenceCaseVersions.id, { onDelete: "restrict" }),
    selectedCaseVersionId: uuid("selected_case_version_id").references(
      () => divergenceCaseVersions.id,
      { onDelete: "restrict" },
    ),
    dispatchedAt: timestamptz("dispatched_at"),
    completedAt: timestamptz("completed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("recheck_assignment_interval_uq").on(
      t.remediationAssignmentId,
      t.intervalDays,
    ),
    index("recheck_assignment_due_idx").on(t.organizationId, t.status, t.dueAt),
    check(
      "recheck_assignment_interval_chk",
      sql`${t.intervalDays} in (30, 90)`,
    ),
    check(
      "recheck_assignment_case_chk",
      sql`${t.selectedCaseVersionId} is null or ${t.selectedCaseVersionId} <> ${t.originalCaseVersionId}`,
    ),
  ],
);
