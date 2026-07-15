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
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  memberships,
  organizations,
  platformOperators,
  roles,
  serviceAccounts,
} from "@/db/schema/identity/schema";
import { workflowRuns } from "@/db/schema/operations/core";
import { createdAt, timestamptz } from "@/db/schema/shared/columns";
import { actorType, recordStatus } from "@/db/schema/shared/enums";

export const approvalPolicies = pgTable(
  "approval_policy",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    objectType: varchar("object_type", { length: 64 }).notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    minimumApprovals: integer("minimum_approvals").notNull().default(1),
    requireDistinctCreator: boolean("require_distinct_creator")
      .notNull()
      .default(true),
    requireDistinctRequester: boolean("require_distinct_requester")
      .notNull()
      .default(false),
    requireRecentAuth: boolean("require_recent_auth").notNull().default(false),
    requireMfa: boolean("require_mfa").notNull().default(false),
    status: recordStatus("status").notNull().default("draft"),
    versionNumber: integer("version_number").notNull(),
    effectiveFrom: timestamptz("effective_from").notNull(),
    createdByMembershipId: uuid("created_by_membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    supersedesApprovalPolicyId: uuid(
      "supersedes_approval_policy_id",
    ).references((): AnyPgColumn => approvalPolicies.id, {
      onDelete: "restrict",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("approval_policy_active_uq")
      .on(t.organizationId, t.objectType, t.action)
      .where(sql`${t.status} = 'approved'`),
    uniqueIndex("approval_policy_version_uq").on(
      t.organizationId,
      t.objectType,
      t.action,
      t.versionNumber,
    ),
    check("approval_policy_minimum_chk", sql`${t.minimumApprovals} >= 1`),
    check("approval_policy_version_chk", sql`${t.versionNumber} > 0`),
  ],
);

export const approvalPolicyRoles = pgTable(
  "approval_policy_role",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    approvalPolicyId: uuid("approval_policy_id")
      .notNull()
      .references(() => approvalPolicies.id, { onDelete: "restrict" }),
    roleCode: varchar("role_code", { length: 64 })
      .notNull()
      .references(() => roles.code, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.approvalPolicyId, t.roleCode] })],
);

export const approvalRecords = pgTable(
  "approval_record",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    approvalPolicyId: uuid("approval_policy_id")
      .notNull()
      .references(() => approvalPolicies.id, { onDelete: "restrict" }),
    actorMembershipId: uuid("actor_membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "restrict" }),
    actorRoleCode: varchar("actor_role_code", { length: 64 })
      .notNull()
      .references(() => roles.code, { onDelete: "restrict" }),
    objectType: varchar("object_type", { length: 64 }).notNull(),
    objectId: uuid("object_id").notNull(),
    objectVersionId: uuid("object_version_id").notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    authenticationAgeSeconds: integer("authentication_age_seconds").notNull(),
    mfaVerified: boolean("mfa_verified").notNull().default(false),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("approval_record_actor_requirement_uq").on(
      t.approvalPolicyId,
      t.objectVersionId,
      t.action,
      t.actorMembershipId,
    ),
    index("approval_record_object_idx").on(
      t.organizationId,
      t.objectType,
      t.objectId,
      t.createdAt,
    ),
    index("approval_record_actor_idx").on(
      t.organizationId,
      t.actorMembershipId,
      t.createdAt,
    ),
    check(
      "approval_record_auth_age_chk",
      sql`${t.authenticationAgeSeconds} >= 0`,
    ),
  ],
);

export const auditEvents = pgTable(
  "audit_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    actorType: actorType("actor_type").notNull(),
    actorMembershipId: uuid("actor_membership_id").references(
      () => memberships.id,
      { onDelete: "restrict" },
    ),
    serviceAccountId: uuid("service_account_id").references(
      () => serviceAccounts.id,
      { onDelete: "restrict" },
    ),
    supportOperatorId: uuid("support_operator_id").references(
      () => platformOperators.id,
      { onDelete: "restrict" },
    ),
    eventType: varchar("event_type", { length: 128 }).notNull(),
    objectType: varchar("object_type", { length: 64 }).notNull(),
    objectId: uuid("object_id").notNull(),
    objectVersionId: uuid("object_version_id"),
    requestId: varchar("request_id", { length: 128 }),
    workflowRunId: uuid("workflow_run_id").references(() => workflowRuns.id, {
      onDelete: "restrict",
    }),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    occurredAt: timestamptz("occurred_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_event_timeline_idx").on(t.organizationId, t.occurredAt),
    index("audit_event_object_idx").on(
      t.organizationId,
      t.objectType,
      t.objectId,
    ),
    check(
      "audit_event_actor_chk",
      sql`
      (${t.actorType} = 'membership' and ${t.actorMembershipId} is not null and ${t.serviceAccountId} is null and ${t.supportOperatorId} is null) or
      (${t.actorType} = 'service_account' and ${t.actorMembershipId} is null and ${t.serviceAccountId} is not null and ${t.supportOperatorId} is null) or
      (${t.actorType} = 'support_operator' and ${t.actorMembershipId} is null and ${t.serviceAccountId} is null and ${t.supportOperatorId} is not null) or
      (${t.actorType} = 'system' and ${t.actorMembershipId} is null and ${t.serviceAccountId} is null and ${t.supportOperatorId} is null)
    `,
    ),
  ],
);
