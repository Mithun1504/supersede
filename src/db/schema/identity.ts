import {
  boolean,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const productConfiguration = pgEnum("product_configuration", [
  "propagate",
  "displace",
]);
export const membershipStatus = pgEnum("membership_status", [
  "active",
  "suspended",
  "deprovisioned",
]);

export const organizations = pgTable(
  "organization",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workosOrganizationId: varchar("workos_organization_id", {
      length: 255,
    }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    configuration: productConfiguration("product_configuration").notNull(),
    individualResultsVisible: boolean("individual_results_visible")
      .notNull()
      .default(false),
    publicWalkthroughEnabled: boolean("public_walkthrough_enabled")
      .notNull()
      .default(false),
    walkthroughProvisioningEnabled: boolean("walkthrough_provisioning_enabled")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("organization_workos_id_uq").on(table.workosOrganizationId),
  ],
);

export const memberships = pgTable(
  "membership",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    workosUserId: varchar("workos_user_id", { length: 255 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    status: membershipStatus("status").notNull().default("active"),
    timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("membership_org_workos_user_uq").on(
      table.organizationId,
      table.workosUserId,
    ),
    index("membership_organization_idx").on(table.organizationId),
  ],
);

export const roles = pgTable("role", {
  code: varchar("code", { length: 64 }).primaryKey(),
  description: text("description").notNull(),
});

export const membershipRoles = pgTable(
  "membership_role",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id),
    roleCode: varchar("role_code", { length: 64 })
      .notNull()
      .references(() => roles.code),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.membershipId, table.roleCode] }),
    index("membership_role_organization_idx").on(table.organizationId),
  ],
);
