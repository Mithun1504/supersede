import "server-only";

import { and, count, eq, inArray, isNull, ne } from "drizzle-orm";

import {
  approvalPolicies,
  approvalPolicyRoles,
  membershipRoles,
  memberships,
  organizationSettings,
  roles,
} from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { recordMembershipEvent } from "@/modules/audit/service";
import type {
  ApprovalPolicyUpdateInput,
  OrganizationSettingsInput,
} from "@/modules/identity/contracts";
import { authorize, type CurrentActor } from "@/modules/identity/policy";
import type { RoleCode } from "@/modules/identity/permissions";

export async function updateOrganizationSettings(
  actor: CurrentActor,
  input: OrganizationSettingsInput,
): Promise<void> {
  authorize(actor, "organization.manage");

  await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      await transaction
        .insert(organizationSettings)
        .values({
          organizationId: actor.organization.id,
          ...input,
          reviewConfidenceThreshold: String(input.reviewConfidenceThreshold),
          updatedByMembershipId: actor.membership.id,
        })
        .onConflictDoUpdate({
          target: organizationSettings.organizationId,
          set: {
            ...input,
            reviewConfidenceThreshold: String(input.reviewConfidenceThreshold),
            updatedByMembershipId: actor.membership.id,
            updatedAt: new Date(),
          },
        });

      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "organization.settings.updated",
        objectType: "organization",
        objectId: actor.organization.id,
        payload: {
          defaultTimezone: input.defaultTimezone,
          locale: input.locale,
          individualResultPolicy: input.individualResultPolicy,
          minimumAggregateCohortSize: input.minimumAggregateCohortSize,
        },
        publish: {
          eventName: "organization/settings.updated",
          payload: { organizationId: actor.organization.id },
        },
      });
    },
  );
}

export async function grantMembershipRole(
  actor: CurrentActor,
  input: { membershipId: string; roleCode: RoleCode },
): Promise<void> {
  authorize(actor, "membership.manage");

  await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [target] = await transaction
        .select({ id: memberships.id, status: memberships.status })
        .from(memberships)
        .where(eq(memberships.id, input.membershipId))
        .limit(1);
      if (!target || target.status === "deprovisioned") {
        throw new AppError({
          code: "NOT_FOUND",
          message: "The member is unavailable for role assignment.",
          status: 404,
        });
      }

      const [role] = await transaction
        .select({ scope: roles.configurationScope })
        .from(roles)
        .where(eq(roles.code, input.roleCode))
        .limit(1);
      if (
        !role ||
        (role.scope !== null &&
          role.scope !== actor.organization.productConfiguration)
      ) {
        throw new AppError({
          code: "BAD_REQUEST",
          message: "That role is not available in this product configuration.",
          status: 400,
        });
      }

      const [grant] = await transaction
        .insert(membershipRoles)
        .values({
          organizationId: actor.organization.id,
          membershipId: target.id,
          roleCode: input.roleCode,
          grantedByMembershipId: actor.membership.id,
        })
        .onConflictDoNothing()
        .returning({ id: membershipRoles.id });

      if (!grant) {
        throw new AppError({
          code: "CONFLICT",
          message: "That member already has this role.",
          status: 409,
        });
      }

      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "membership.role_granted",
        objectType: "membership",
        objectId: target.id,
        payload: { roleCode: input.roleCode },
        publish: {
          eventName: "membership/role.granted",
          payload: { membershipId: target.id, roleCode: input.roleCode },
        },
      });
    },
  );
}

export async function revokeMembershipRole(
  actor: CurrentActor,
  input: { membershipId: string; roleCode: RoleCode; reason: string },
): Promise<void> {
  authorize(actor, "membership.manage");

  await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      if (input.roleCode === "org_admin") {
        const [remaining] = await transaction
          .select({ value: count() })
          .from(membershipRoles)
          .innerJoin(
            memberships,
            eq(memberships.id, membershipRoles.membershipId),
          )
          .where(
            and(
              eq(membershipRoles.roleCode, "org_admin"),
              isNull(membershipRoles.revokedAt),
              eq(memberships.status, "active"),
              ne(membershipRoles.membershipId, input.membershipId),
            ),
          );
        if ((remaining?.value ?? 0) === 0) {
          throw new AppError({
            code: "CONFLICT",
            message: "The organization must retain at least one active admin.",
            status: 409,
          });
        }
      }

      const [revoked] = await transaction
        .update(membershipRoles)
        .set({
          revokedAt: new Date(),
          revokedByMembershipId: actor.membership.id,
          revocationReason: input.reason,
        })
        .where(
          and(
            eq(membershipRoles.membershipId, input.membershipId),
            eq(membershipRoles.roleCode, input.roleCode),
            isNull(membershipRoles.revokedAt),
          ),
        )
        .returning({ id: membershipRoles.id });

      if (!revoked) {
        throw new AppError({
          code: "NOT_FOUND",
          message: "The active role grant was not found.",
          status: 404,
        });
      }

      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "membership.role_revoked",
        objectType: "membership",
        objectId: input.membershipId,
        payload: { roleCode: input.roleCode, reason: input.reason },
        publish: {
          eventName: "membership/role.revoked",
          payload: {
            membershipId: input.membershipId,
            roleCode: input.roleCode,
          },
        },
      });
    },
  );
}

export async function updateApprovalPolicy(
  actor: CurrentActor,
  input: ApprovalPolicyUpdateInput,
): Promise<void> {
  authorize(actor, "approval_policy.manage");

  await withTenantContext(
    {
      organizationId: actor.organization.id,
      actorMembershipId: actor.membership.id,
    },
    async (transaction) => {
      const [current] = await transaction
        .select()
        .from(approvalPolicies)
        .where(
          and(
            eq(approvalPolicies.id, input.policyId),
            eq(approvalPolicies.status, "approved"),
          ),
        )
        .limit(1);
      if (!current) {
        throw new AppError({
          code: "CONFLICT",
          message: "The approval policy changed. Refresh and try again.",
          status: 409,
        });
      }

      const allowedRoles = await transaction
        .select({ code: roles.code, scope: roles.configurationScope })
        .from(roles)
        .where(inArray(roles.code, input.eligibleRoleCodes));
      if (
        allowedRoles.length !== input.eligibleRoleCodes.length ||
        allowedRoles.some(
          (role) =>
            role.scope !== null &&
            role.scope !== actor.organization.productConfiguration,
        )
      ) {
        throw new AppError({
          code: "BAD_REQUEST",
          message:
            "One or more eligible roles are unavailable for this tenant.",
          status: 400,
        });
      }

      await transaction
        .update(approvalPolicies)
        .set({ status: "superseded" })
        .where(eq(approvalPolicies.id, current.id));
      const [successor] = await transaction
        .insert(approvalPolicies)
        .values({
          organizationId: actor.organization.id,
          objectType: current.objectType,
          action: current.action,
          minimumApprovals: input.minimumApprovals,
          requireDistinctCreator: input.requireDistinctCreator,
          requireDistinctRequester: input.requireDistinctRequester,
          requireRecentAuth: input.requireRecentAuth,
          requireMfa: input.requireMfa,
          status: "approved",
          versionNumber: current.versionNumber + 1,
          effectiveFrom: new Date(),
          createdByMembershipId: actor.membership.id,
          supersedesApprovalPolicyId: current.id,
        })
        .returning({ id: approvalPolicies.id });
      if (!successor) {
        throw new AppError({
          code: "INTERNAL_ERROR",
          message: "The policy successor could not be created.",
          status: 500,
        });
      }
      await transaction.insert(approvalPolicyRoles).values(
        input.eligibleRoleCodes.map((roleCode) => ({
          organizationId: actor.organization.id,
          approvalPolicyId: successor.id,
          roleCode,
        })),
      );

      await recordMembershipEvent(transaction, {
        organizationId: actor.organization.id,
        actorMembershipId: actor.membership.id,
        eventType: "approval_policy.superseded",
        objectType: "approval_policy",
        objectId: successor.id,
        objectVersionId: successor.id,
        payload: {
          supersedesPolicyId: current.id,
          versionNumber: current.versionNumber + 1,
          eligibleRoleCodes: input.eligibleRoleCodes,
        },
        publish: {
          eventName: "approval-policy/updated",
          payload: { approvalPolicyId: successor.id },
        },
      });
    },
  );
}
