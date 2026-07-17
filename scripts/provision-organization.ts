import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { z } from "zod";

import {
  approvalPolicies,
  approvalPolicyRoles,
  auditEvents,
  membershipRoles,
  memberships,
  organizationSettings,
  organizations,
  retentionPolicies,
} from "@/db/schema";

const baseApprovalPolicies = [
  {
    objectType: "change_event",
    action: "validate",
    roleCode: "change_validator",
    requireDistinctCreator: true,
    requireDistinctRequester: false,
    requireRecentAuth: true,
    requireMfa: false,
  },
  {
    objectType: "dependency_edge",
    action: "accept",
    roleCode: "edge_reviewer",
    requireDistinctCreator: false,
    requireDistinctRequester: false,
    requireRecentAuth: false,
    requireMfa: false,
  },
  {
    objectType: "artifact_remediation",
    action: "verify",
    roleCode: "edge_reviewer",
    requireDistinctCreator: true,
    requireDistinctRequester: false,
    requireRecentAuth: true,
    requireMfa: false,
  },
] as const;

const displaceApprovalPolicies = [
  {
    objectType: "divergence_case",
    action: "approve",
    roleCode: "case_approver",
    requireDistinctCreator: true,
    requireDistinctRequester: false,
    requireRecentAuth: true,
    requireMfa: false,
  },
  {
    objectType: "correction_exercise",
    action: "approve",
    roleCode: "case_approver",
    requireDistinctCreator: true,
    requireDistinctRequester: false,
    requireRecentAuth: true,
    requireMfa: false,
  },
  {
    objectType: "divergence_case",
    action: "retire",
    roleCode: "case_approver",
    requireDistinctCreator: false,
    requireDistinctRequester: false,
    requireRecentAuth: true,
    requireMfa: false,
  },
  {
    objectType: "release_batch",
    action: "authorize",
    roleCode: "release_authorizer",
    requireDistinctCreator: false,
    requireDistinctRequester: true,
    requireRecentAuth: true,
    requireMfa: true,
  },
] as const;

const inputSchema = z.object({
  databaseUrl: z.string().url(),
  workosOrganizationId: z.string().min(1).max(255),
  organizationName: z.string().trim().min(2).max(255),
  productConfiguration: z.enum(["propagate", "displace"]),
  adminWorkosUserId: z.string().min(1).max(255),
  adminEmail: z.string().email().max(320),
  adminDisplayName: z.string().trim().min(1).max(255),
});

async function main() {
  const input = inputSchema.parse({
    databaseUrl: process.env.DATABASE_URL,
    workosOrganizationId: process.env.PROVISION_WORKOS_ORGANIZATION_ID,
    organizationName: process.env.PROVISION_ORGANIZATION_NAME,
    productConfiguration: process.env.PROVISION_PRODUCT_CONFIGURATION,
    adminWorkosUserId: process.env.PROVISION_ADMIN_WORKOS_USER_ID,
    adminEmail: process.env.PROVISION_ADMIN_EMAIL,
    adminDisplayName: process.env.PROVISION_ADMIN_DISPLAY_NAME,
  });

  const pool = new Pool({ connectionString: input.databaseUrl });
  const database = drizzle(pool);
  try {
    const result = await database.transaction(async (transaction) => {
      const [organization] = await transaction
        .insert(organizations)
        .values({
          workosOrganizationId: input.workosOrganizationId,
          name: input.organizationName,
          productConfiguration: input.productConfiguration,
        })
        .returning({ id: organizations.id });
      if (!organization)
        throw new Error("Organization insert returned no row.");

      const [admin] = await transaction
        .insert(memberships)
        .values({
          organizationId: organization.id,
          workosUserId: input.adminWorkosUserId,
          email: input.adminEmail,
          displayName: input.adminDisplayName,
          status: "active",
        })
        .returning({ id: memberships.id });
      if (!admin) throw new Error("Admin membership insert returned no row.");

      await transaction.insert(organizationSettings).values({
        organizationId: organization.id,
        updatedByMembershipId: admin.id,
      });
      await transaction.insert(membershipRoles).values({
        organizationId: organization.id,
        membershipId: admin.id,
        roleCode: "org_admin",
        grantedByMembershipId: admin.id,
      });
      await transaction.insert(retentionPolicies).values({
        organizationId: organization.id,
        dataClass: "report_bundle",
        versionNumber: 1,
        retentionDays: 365,
        retentionMode: "governance",
        dispositionAction: "delete",
        status: "approved",
        effectiveFrom: new Date(),
        createdByMembershipId: admin.id,
      });

      const policyTemplates = [
        ...baseApprovalPolicies,
        ...(input.productConfiguration === "displace"
          ? displaceApprovalPolicies
          : []),
      ];
      for (const template of policyTemplates) {
        const [policy] = await transaction
          .insert(approvalPolicies)
          .values({
            organizationId: organization.id,
            objectType: template.objectType,
            action: template.action,
            versionNumber: 1,
            minimumApprovals: 1,
            requireDistinctCreator: template.requireDistinctCreator,
            requireDistinctRequester: template.requireDistinctRequester,
            requireRecentAuth: template.requireRecentAuth,
            requireMfa: template.requireMfa,
            status: "approved",
            effectiveFrom: new Date(),
            createdByMembershipId: admin.id,
          })
          .returning({ id: approvalPolicies.id });
        if (!policy) throw new Error("Approval policy insert returned no row.");
        await transaction.insert(approvalPolicyRoles).values({
          organizationId: organization.id,
          approvalPolicyId: policy.id,
          roleCode: template.roleCode,
        });
      }
      await transaction.insert(auditEvents).values({
        organizationId: organization.id,
        actorType: "system",
        eventType: "organization.provisioned",
        objectType: "organization",
        objectId: organization.id,
        payload: {
          productConfiguration: input.productConfiguration,
          initialAdminMembershipId: admin.id,
        },
      });

      return { organizationId: organization.id, adminMembershipId: admin.id };
    });

    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Provisioning failed."}\n`,
  );
  process.exitCode = 1;
});
