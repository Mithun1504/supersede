import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { corpora } from "@/db/schema/corpus/schema";
import { memberships, organizations } from "@/db/schema/identity/schema";
import { workflowRuns } from "@/db/schema/operations/core";
import { createdAt, timestamptz, updatedAt } from "@/db/schema/shared/columns";
import { reviewTaskStatus, reviewTaskType } from "@/db/schema/shared/enums";

export const reviewTasks = pgTable(
  "review_task",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    taskType: reviewTaskType("task_type").notNull(),
    status: reviewTaskStatus("status").notNull().default("open"),
    subjectType: varchar("subject_type", { length: 64 }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    subjectVersionId: uuid("subject_version_id"),
    reasonCode: varchar("reason_code", { length: 64 }).notNull(),
    priority: smallint("priority").notNull().default(0),
    assignedToMembershipId: uuid("assigned_to_membership_id").references(
      () => memberships.id,
      { onDelete: "restrict" },
    ),
    dueAt: timestamptz("due_at"),
    createdByWorkflowRunId: uuid("created_by_workflow_run_id").references(
      () => workflowRuns.id,
      { onDelete: "restrict" },
    ),
    resolvedAt: timestamptz("resolved_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("review_task_open_subject_uq")
      .on(
        t.organizationId,
        t.taskType,
        t.subjectType,
        t.subjectId,
        t.subjectVersionId,
      )
      .where(sql`${t.status} in ('open', 'assigned', 'in_progress')`),
    index("review_task_queue_idx").on(
      t.organizationId,
      t.status,
      t.priority,
      t.createdAt,
    ),
    index("review_task_assignee_idx").on(
      t.organizationId,
      t.assignedToMembershipId,
      t.status,
    ),
  ],
);

export const reviewSessions = pgTable(
  "review_session",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    reviewTaskType: reviewTaskType("review_task_type").notNull(),
    corpusId: uuid("corpus_id").references(() => corpora.id, {
      onDelete: "restrict",
    }),
    startedAt: timestamptz("started_at").notNull(),
    endedAt: timestamptz("ended_at"),
    activeSeconds: integer("active_seconds").notNull().default(0),
    itemsReviewed: integer("items_reviewed").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("review_session_corpus_idx").on(
      t.organizationId,
      t.corpusId,
      t.startedAt,
    ),
    check(
      "review_session_counts_chk",
      sql`${t.activeSeconds} >= 0 and ${t.itemsReviewed} >= 0`,
    ),
    check(
      "review_session_end_chk",
      sql`${t.endedAt} is null or ${t.endedAt} >= ${t.startedAt}`,
    ),
  ],
);

export const reviewActions = pgTable(
  "review_action",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    reviewSessionId: uuid("review_session_id")
      .notNull()
      .references(() => reviewSessions.id, { onDelete: "restrict" }),
    reviewTaskId: uuid("review_task_id")
      .notNull()
      .references(() => reviewTasks.id, { onDelete: "restrict" }),
    action: varchar("action", { length: 32 }).notNull(),
    resultingVersionId: uuid("resulting_version_id"),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("review_action_task_idx").on(
      t.organizationId,
      t.reviewTaskId,
      t.createdAt,
    ),
    index("review_action_session_idx").on(
      t.organizationId,
      t.reviewSessionId,
      t.createdAt,
    ),
    check(
      "review_action_action_chk",
      sql`${t.action} in ('accepted', 'edited', 'rejected', 'deferred', 'human_verified', 'reclassified')`,
    ),
  ],
);
