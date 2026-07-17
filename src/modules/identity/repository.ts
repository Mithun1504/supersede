import "server-only";

import { and, asc, count, eq, isNull, or } from "drizzle-orm";

import {
  approvalPolicies,
  approvalPolicyRoles,
  membershipRoles,
  memberships,
  organizationSettings,
  roles,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { authorize, type CurrentActor } from "@/modules/identity/policy";

export type OrganizationOverview = {
  settings: typeof organizationSettings.$inferSelect | null;
  activeMemberCount: number;
  invitedMemberCount: number;
  activeRoleGrantCount: number;
};

export async function getOrganizationOverview(
  actor: CurrentActor,
): Promise<OrganizationOverview> {
  authorize(actor, "organization.read");

  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [settings, [activeMembers], [invitedMembers], [activeGrants]] =
        await Promise.all([
          transaction.query.organizationSettings.findFirst({
            where: eq(
              organizationSettings.organizationId,
              actor.organization.id,
            ),
          }),
          transaction
            .select({ value: count() })
            .from(memberships)
            .where(eq(memberships.status, "active")),
          transaction
            .select({ value: count() })
            .from(memberships)
            .where(eq(memberships.status, "invited")),
          transaction
            .select({ value: count() })
            .from(membershipRoles)
            .where(isNull(membershipRoles.revokedAt)),
        ]);

      return {
        settings: settings ?? null,
        activeMemberCount: activeMembers?.value ?? 0,
        invitedMemberCount: invitedMembers?.value ?? 0,
        activeRoleGrantCount: activeGrants?.value ?? 0,
      };
    },
  );
}

export type MemberListItem = {
  id: string;
  displayName: string;
  email: string;
  timezone: string;
  status: "invited" | "active" | "suspended" | "deprovisioned";
  roleCodes: string[];
  lastAuthenticatedAt: Date | null;
};

export async function listOrganizationMembers(
  actor: CurrentActor,
): Promise<MemberListItem[]> {
  authorize(actor, "membership.read");

  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const rows = await transaction
        .select({
          id: memberships.id,
          displayName: memberships.displayName,
          email: memberships.email,
          timezone: memberships.timezone,
          status: memberships.status,
          lastAuthenticatedAt: memberships.lastAuthenticatedAt,
          roleCode: membershipRoles.roleCode,
        })
        .from(memberships)
        .leftJoin(
          membershipRoles,
          and(
            eq(membershipRoles.membershipId, memberships.id),
            isNull(membershipRoles.revokedAt),
          ),
        )
        .orderBy(asc(memberships.displayName), asc(membershipRoles.roleCode));

      const members = new Map<string, MemberListItem>();
      for (const row of rows) {
        const member = members.get(row.id) ?? {
          id: row.id,
          displayName: row.displayName,
          email: row.email,
          timezone: row.timezone,
          status: row.status,
          roleCodes: [],
          lastAuthenticatedAt: row.lastAuthenticatedAt,
        };
        if (row.roleCode) member.roleCodes.push(row.roleCode);
        members.set(row.id, member);
      }

      return [...members.values()];
    },
  );
}

export type AssignableRole = {
  code: string;
  description: string;
};

export async function listAssignableRoles(
  actor: CurrentActor,
): Promise<AssignableRole[]> {
  authorize(actor, "membership.read");

  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) =>
      transaction
        .select({ code: roles.code, description: roles.description })
        .from(roles)
        .where(
          or(
            isNull(roles.configurationScope),
            eq(
              roles.configurationScope,
              actor.organization.productConfiguration,
            ),
          ),
        )
        .orderBy(asc(roles.code)),
  );
}

export type ApprovalPolicyListItem = {
  id: string;
  objectType: string;
  action: string;
  versionNumber: number;
  minimumApprovals: number;
  requireDistinctCreator: boolean;
  requireDistinctRequester: boolean;
  requireRecentAuth: boolean;
  requireMfa: boolean;
  eligibleRoleCodes: string[];
};

export async function listActiveApprovalPolicies(
  actor: CurrentActor,
): Promise<ApprovalPolicyListItem[]> {
  authorize(actor, "organization.read");
  return withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const rows = await transaction
        .select({
          id: approvalPolicies.id,
          objectType: approvalPolicies.objectType,
          action: approvalPolicies.action,
          versionNumber: approvalPolicies.versionNumber,
          minimumApprovals: approvalPolicies.minimumApprovals,
          requireDistinctCreator: approvalPolicies.requireDistinctCreator,
          requireDistinctRequester: approvalPolicies.requireDistinctRequester,
          requireRecentAuth: approvalPolicies.requireRecentAuth,
          requireMfa: approvalPolicies.requireMfa,
          roleCode: approvalPolicyRoles.roleCode,
        })
        .from(approvalPolicies)
        .innerJoin(
          approvalPolicyRoles,
          eq(approvalPolicyRoles.approvalPolicyId, approvalPolicies.id),
        )
        .where(eq(approvalPolicies.status, "approved"))
        .orderBy(
          asc(approvalPolicies.objectType),
          asc(approvalPolicies.action),
          asc(approvalPolicyRoles.roleCode),
        );

      const policies = new Map<string, ApprovalPolicyListItem>();
      for (const row of rows) {
        const policy = policies.get(row.id) ?? {
          id: row.id,
          objectType: row.objectType,
          action: row.action,
          versionNumber: row.versionNumber,
          minimumApprovals: row.minimumApprovals,
          requireDistinctCreator: row.requireDistinctCreator,
          requireDistinctRequester: row.requireDistinctRequester,
          requireRecentAuth: row.requireRecentAuth,
          requireMfa: row.requireMfa,
          eligibleRoleCodes: [],
        };
        policy.eligibleRoleCodes.push(row.roleCode);
        policies.set(row.id, policy);
      }
      return [...policies.values()];
    },
  );
}
