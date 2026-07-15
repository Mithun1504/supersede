import { sql } from "drizzle-orm";
import {
  bigint,
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

import { createdAt, timestamptz, updatedAt } from "@/db/schema/shared/columns";
import {
  entityStatus,
  membershipStatus,
  productConfiguration,
} from "@/db/schema/shared/enums";

export const organizations = pgTable(
  "organization",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workosOrganizationId: varchar("workos_organization_id", {
      length: 255,
    }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    productConfiguration: productConfiguration(
      "product_configuration",
    ).notNull(),
    status: entityStatus("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("organization_workos_id_uq").on(t.workosOrganizationId),
    index("organization_configuration_status_idx").on(
      t.productConfiguration,
      t.status,
    ),
  ],
);

export const memberships = pgTable(
  "membership",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    workosUserId: varchar("workos_user_id", { length: 255 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
    status: membershipStatus("status").notNull().default("invited"),
    lastAuthenticatedAt: timestamptz("last_authenticated_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("membership_org_workos_user_uq").on(
      t.organizationId,
      t.workosUserId,
    ),
    index("membership_organization_status_idx").on(t.organizationId, t.status),
  ],
);

export const organizationSettings = pgTable(
  "organization_settings",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    defaultTimezone: varchar("default_timezone", { length: 64 })
      .notNull()
      .default("UTC"),
    locale: varchar("locale", { length: 16 }).notNull().default("en"),
    individualResultPolicy: varchar("individual_result_policy", { length: 32 })
      .notNull()
      .default("aggregate_only"),
    minimumAggregateCohortSize: integer("minimum_aggregate_cohort_size")
      .notNull()
      .default(5),
    supportAccessRequiresTenantApproval: boolean(
      "support_access_requires_tenant_approval",
    )
      .notNull()
      .default(true),
    reviewConfidenceThreshold: numeric("review_confidence_threshold", {
      precision: 5,
      scale: 4,
    })
      .notNull()
      .default("0.7500"),
    maxGraphDepth: integer("max_graph_depth").notNull().default(8),
    monthlyAiBudgetMinor: bigint("monthly_ai_budget_minor", { mode: "number" })
      .notNull()
      .default(0),
    maxUploadBytes: bigint("max_upload_bytes", { mode: "number" })
      .notNull()
      .default(52428800),
    updatedByMembershipId: uuid("updated_by_membership_id").references(
      () => memberships.id,
      { onDelete: "restrict" },
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "organization_settings_result_policy_chk",
      sql`${t.individualResultPolicy} in ('aggregate_only', 'authorized_individual')`,
    ),
    check(
      "organization_settings_cohort_size_chk",
      sql`${t.minimumAggregateCohortSize} >= 2`,
    ),
    check(
      "organization_settings_review_threshold_chk",
      sql`${t.reviewConfidenceThreshold} between 0 and 1`,
    ),
    check(
      "organization_settings_graph_depth_chk",
      sql`${t.maxGraphDepth} between 1 and 50`,
    ),
    check(
      "organization_settings_ai_budget_chk",
      sql`${t.monthlyAiBudgetMinor} >= 0`,
    ),
    check(
      "organization_settings_upload_limit_chk",
      sql`${t.maxUploadBytes} > 0`,
    ),
  ],
);

export const roles = pgTable("role", {
  code: varchar("code", { length: 64 }).primaryKey(),
  description: text("description").notNull(),
  configurationScope: productConfiguration("configuration_scope"),
  systemDefined: boolean("system_defined").notNull().default(true),
});

export const permissions = pgTable("permission", {
  code: varchar("code", { length: 96 }).primaryKey(),
  description: text("description").notNull(),
  configurationScope: productConfiguration("configuration_scope"),
  privileged: boolean("privileged").notNull().default(false),
});

export const rolePermissions = pgTable(
  "role_permission",
  {
    roleCode: varchar("role_code", { length: 64 })
      .notNull()
      .references(() => roles.code, { onDelete: "restrict" }),
    permissionCode: varchar("permission_code", { length: 96 })
      .notNull()
      .references(() => permissions.code, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.roleCode, t.permissionCode] })],
);

export const membershipRoles = pgTable(
  "membership_role",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    roleCode: varchar("role_code", { length: 64 })
      .notNull()
      .references(() => roles.code, { onDelete: "restrict" }),
    grantedByMembershipId: uuid("granted_by_membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    grantedAt: timestamptz("granted_at").notNull().defaultNow(),
    revokedByMembershipId: uuid("revoked_by_membership_id").references(
      () => memberships.id,
      { onDelete: "restrict" },
    ),
    revokedAt: timestamptz("revoked_at"),
    revocationReason: text("revocation_reason"),
  },
  (t) => [
    index("membership_role_organization_idx").on(t.organizationId),
    uniqueIndex("membership_role_active_uq")
      .on(t.membershipId, t.roleCode)
      .where(sql`${t.revokedAt} is null`),
    check(
      "membership_role_revocation_chk",
      sql`(${t.revokedAt} is null and ${t.revokedByMembershipId} is null) or (${t.revokedAt} is not null and ${t.revokedByMembershipId} is not null)`,
    ),
  ],
);

export const serviceAccounts = pgTable(
  "service_account",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 255 }).notNull(),
    status: entityStatus("status").notNull().default("active"),
    description: text("description").notNull().default(""),
    createdByMembershipId: uuid("created_by_membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    lastUsedAt: timestamptz("last_used_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("service_account_active_name_uq")
      .on(t.organizationId, t.name)
      .where(sql`${t.status} <> 'retired'`),
  ],
);

export const serviceAccountPermissions = pgTable(
  "service_account_permission",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    serviceAccountId: uuid("service_account_id")
      .notNull()
      .references(() => serviceAccounts.id, { onDelete: "restrict" }),
    permissionCode: varchar("permission_code", { length: 96 })
      .notNull()
      .references(() => permissions.code, { onDelete: "restrict" }),
    grantedByMembershipId: uuid("granted_by_membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    grantedAt: timestamptz("granted_at").notNull().defaultNow(),
    revokedAt: timestamptz("revoked_at"),
  },
  (t) => [
    primaryKey({
      columns: [t.serviceAccountId, t.permissionCode, t.grantedAt],
    }),
    uniqueIndex("service_account_permission_active_uq")
      .on(t.serviceAccountId, t.permissionCode)
      .where(sql`${t.revokedAt} is null`),
  ],
);

export const apiCredentials = pgTable(
  "api_credential",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    serviceAccountId: uuid("service_account_id")
      .notNull()
      .references(() => serviceAccounts.id, { onDelete: "restrict" }),
    keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
    secretHash: text("secret_hash").notNull(),
    expiresAt: timestamptz("expires_at"),
    lastUsedAt: timestamptz("last_used_at"),
    revokedAt: timestamptz("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("api_credential_secret_hash_uq").on(t.secretHash),
    index("api_credential_active_idx")
      .on(t.serviceAccountId, t.expiresAt)
      .where(sql`${t.revokedAt} is null`),
  ],
);

export const platformOperators = pgTable(
  "platform_operator",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workosUserId: varchar("workos_user_id", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    status: entityStatus("status").notNull().default("active"),
    operatorRole: varchar("operator_role", { length: 32 }).notNull(),
    createdAt: createdAt(),
    deprovisionedAt: timestamptz("deprovisioned_at"),
  },
  (t) => [
    uniqueIndex("platform_operator_workos_user_uq").on(t.workosUserId),
    check(
      "platform_operator_role_chk",
      sql`${t.operatorRole} in ('support', 'security_admin')`,
    ),
  ],
);

export const supportAccessGrants = pgTable(
  "support_access_grant",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => platformOperators.id, { onDelete: "restrict" }),
    requestedScope: text("requested_scope").array().notNull(),
    reason: text("reason").notNull(),
    ticketReference: varchar("ticket_reference", { length: 255 }).notNull(),
    approvedByOperatorId: uuid("approved_by_operator_id")
      .notNull()
      .references(() => platformOperators.id, { onDelete: "restrict" }),
    startsAt: timestamptz("starts_at").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    tenantApprovedByMembershipId: uuid(
      "tenant_approved_by_membership_id",
    ).references(() => memberships.id, { onDelete: "restrict" }),
    emergencyAccess: boolean("emergency_access").notNull().default(false),
    emergencyReason: text("emergency_reason"),
    revokedAt: timestamptz("revoked_at"),
    revokedByOperatorId: uuid("revoked_by_operator_id").references(
      () => platformOperators.id,
      { onDelete: "restrict" },
    ),
    createdAt: createdAt(),
  },
  (t) => [
    index("support_access_grant_active_idx")
      .on(t.organizationId, t.expiresAt)
      .where(sql`${t.revokedAt} is null`),
    check(
      "support_access_grant_approver_chk",
      sql`${t.approvedByOperatorId} <> ${t.operatorId}`,
    ),
    check(
      "support_access_grant_expiry_chk",
      sql`${t.expiresAt} > ${t.startsAt}`,
    ),
    check(
      "support_access_grant_emergency_chk",
      sql`not ${t.emergencyAccess} or ${t.emergencyReason} is not null`,
    ),
  ],
);
