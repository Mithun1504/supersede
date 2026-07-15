import { sql } from "drizzle-orm";
import {
  char,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { divergenceCaseVersions } from "@/db/schema/cases/core";
import { changeEventVersions } from "@/db/schema/changes/schema";
import { memberships, organizations } from "@/db/schema/identity/schema";
import { exerciseVersions } from "@/db/schema/learning/exercises";
import { cohorts, people, workRoles } from "@/db/schema/people/schema";
import { createdAt, timestamptz, updatedAt } from "@/db/schema/shared/columns";
import { releaseStatus } from "@/db/schema/shared/enums";

export const releaseBatches = pgTable(
  "release_batch",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    changeEventVersionId: uuid("change_event_version_id")
      .notNull()
      .references(() => changeEventVersions.id, { onDelete: "restrict" }),
    status: releaseStatus("status").notNull().default("draft"),
    requestedByMembershipId: uuid("requested_by_membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    requestedAt: timestamptz("requested_at").notNull().defaultNow(),
    resolvedPersonCount: integer("resolved_person_count").notNull().default(0),
    resolvedPersonIdsHash: char("resolved_person_ids_hash", { length: 64 }),
    authorizedAt: timestamptz("authorized_at"),
    releasedAt: timestamptz("released_at"),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("release_batch_idempotency_uq").on(
      t.organizationId,
      t.idempotencyKey,
    ),
    index("release_batch_status_idx").on(
      t.organizationId,
      t.status,
      t.createdAt,
    ),
    check("release_batch_count_chk", sql`${t.resolvedPersonCount} >= 0`),
    check(
      "release_batch_hash_chk",
      sql`${t.resolvedPersonIdsHash} is null or ${t.resolvedPersonIdsHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const releaseCases = pgTable(
  "release_case",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    releaseBatchId: uuid("release_batch_id")
      .notNull()
      .references(() => releaseBatches.id, { onDelete: "restrict" }),
    caseVersionId: uuid("case_version_id")
      .notNull()
      .references(() => divergenceCaseVersions.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.releaseBatchId, t.caseVersionId] })],
);

export const releaseExercises = pgTable(
  "release_exercise",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    releaseBatchId: uuid("release_batch_id")
      .notNull()
      .references(() => releaseBatches.id, { onDelete: "restrict" }),
    exerciseVersionId: uuid("exercise_version_id")
      .notNull()
      .references(() => exerciseVersions.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.releaseBatchId, t.exerciseVersionId] })],
);

export const releaseTargets = pgTable(
  "release_target",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    releaseBatchId: uuid("release_batch_id")
      .notNull()
      .references(() => releaseBatches.id, { onDelete: "restrict" }),
    personId: uuid("person_id").references(() => people.id, {
      onDelete: "restrict",
    }),
    workRoleId: uuid("work_role_id").references(() => workRoles.id, {
      onDelete: "restrict",
    }),
    cohortId: uuid("cohort_id").references(() => cohorts.id, {
      onDelete: "restrict",
    }),
    resolvedPersonCount: integer("resolved_person_count").notNull(),
    resolvedPersonIdsHash: char("resolved_person_ids_hash", {
      length: 64,
    }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("release_target_person_uq")
      .on(t.releaseBatchId, t.personId)
      .where(sql`${t.personId} is not null`),
    uniqueIndex("release_target_role_uq")
      .on(t.releaseBatchId, t.workRoleId)
      .where(sql`${t.workRoleId} is not null`),
    uniqueIndex("release_target_cohort_uq")
      .on(t.releaseBatchId, t.cohortId)
      .where(sql`${t.cohortId} is not null`),
    check(
      "release_target_exact_one_chk",
      sql`num_nonnulls(${t.personId}, ${t.workRoleId}, ${t.cohortId}) = 1`,
    ),
    check("release_target_count_chk", sql`${t.resolvedPersonCount} >= 0`),
    check(
      "release_target_hash_chk",
      sql`${t.resolvedPersonIdsHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const releaseTargetPeople = pgTable(
  "release_target_person",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    releaseBatchId: uuid("release_batch_id")
      .notNull()
      .references(() => releaseBatches.id, { onDelete: "restrict" }),
    releaseTargetId: uuid("release_target_id")
      .notNull()
      .references(() => releaseTargets.id, { onDelete: "restrict" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    resolvedVia: varchar("resolved_via", { length: 16 }).notNull(),
    resolvedAt: timestamptz("resolved_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.releaseTargetId, t.personId] }),
    index("release_target_person_batch_idx").on(t.releaseBatchId, t.personId),
    check(
      "release_target_person_via_chk",
      sql`${t.resolvedVia} in ('direct', 'work_role', 'cohort')`,
    ),
  ],
);
