import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  varchar,
  boolean,
} from "drizzle-orm/pg-core";

import { integrationConnections } from "@/db/schema/integrations/connections";
import { memberships, organizations } from "@/db/schema/identity/schema";
import { createdAt, timestamptz, updatedAt } from "@/db/schema/shared/columns";
import { entityStatus, personStatus } from "@/db/schema/shared/enums";

export const people = pgTable(
  "person",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    membershipId: uuid("membership_id")
      .unique()
      .references(() => memberships.id, { onDelete: "restrict" }),
    externalPersonKey: varchar("external_person_key", { length: 255 }),
    displayName: varchar("display_name", { length: 255 }),
    email: varchar("email", { length: 320 }),
    timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
    status: personStatus("status").notNull().default("active"),
    isSeededPersona: boolean("is_seeded_persona").notNull().default(false),
    sourceConnectionId: uuid("source_connection_id").references(
      () => integrationConnections.id,
      { onDelete: "restrict" },
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deprovisionedAt: timestamptz("deprovisioned_at"),
  },
  (t) => [
    uniqueIndex("person_external_key_uq")
      .on(t.organizationId, t.externalPersonKey)
      .where(sql`${t.externalPersonKey} is not null`),
    index("person_organization_status_idx").on(t.organizationId, t.status),
  ],
);

export const workRoles = pgTable(
  "work_role",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    externalRoleKey: varchar("external_role_key", { length: 255 }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description").notNull().default(""),
    status: entityStatus("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("work_role_active_name_uq")
      .on(t.organizationId, t.name)
      .where(sql`${t.status} = 'active'`),
    uniqueIndex("work_role_external_key_uq")
      .on(t.organizationId, t.externalRoleKey)
      .where(sql`${t.externalRoleKey} is not null`),
  ],
);

export const personWorkRoles = pgTable(
  "person_work_role",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    workRoleId: uuid("work_role_id")
      .notNull()
      .references(() => workRoles.id, { onDelete: "restrict" }),
    effectiveFrom: timestamptz("effective_from").notNull(),
    effectiveTo: timestamptz("effective_to"),
    sourceConnectionId: uuid("source_connection_id").references(
      () => integrationConnections.id,
      { onDelete: "restrict" },
    ),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("person_work_role_active_uq")
      .on(t.personId, t.workRoleId)
      .where(sql`${t.effectiveTo} is null`),
    check(
      "person_work_role_effective_chk",
      sql`${t.effectiveTo} is null or ${t.effectiveTo} > ${t.effectiveFrom}`,
    ),
  ],
);

export const cohorts = pgTable(
  "cohort",
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
    uniqueIndex("cohort_active_name_uq")
      .on(t.organizationId, t.name)
      .where(sql`${t.status} = 'active'`),
  ],
);

export const cohortMembers = pgTable(
  "cohort_member",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    cohortId: uuid("cohort_id")
      .notNull()
      .references(() => cohorts.id, { onDelete: "restrict" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    addedAt: timestamptz("added_at").notNull().defaultNow(),
    removedAt: timestamptz("removed_at"),
    addedByMembershipId: uuid("added_by_membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.cohortId, t.personId, t.addedAt] }),
    uniqueIndex("cohort_member_active_uq")
      .on(t.cohortId, t.personId)
      .where(sql`${t.removedAt} is null`),
    check(
      "cohort_member_removed_chk",
      sql`${t.removedAt} is null or ${t.removedAt} > ${t.addedAt}`,
    ),
  ],
);
