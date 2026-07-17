import "server-only";

import { cache } from "react";
import { and, eq, isNull } from "drizzle-orm";

import {
  membershipRoles,
  memberships,
  organizations,
  permissions,
  rolePermissions,
  roles,
} from "@/db/schema";
import { resolveActorContext, withTenantContext } from "@/db/tenant-context";
import { AppError } from "@/lib/errors/app-error";
import { requireAuthContext } from "@/modules/identity/auth";
import {
  can,
  isPermissionCode,
  isRoleCode,
  type PermissionCode,
  type ProductConfiguration,
  type RoleCode,
} from "@/modules/identity/permissions";

export type CurrentActor = {
  organization: {
    id: string;
    name: string;
    productConfiguration: ProductConfiguration;
  };
  membership: {
    id: string;
    workosUserId: string;
    email: string;
    displayName: string;
    timezone: string;
  };
  roles: RoleCode[];
  permissions: PermissionCode[];
  privilegedPermissions: PermissionCode[];
};

async function loadCurrentActor(): Promise<CurrentActor> {
  const auth = await requireAuthContext();

  if (!auth.workosOrganizationId) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "Select an organization before opening this workspace.",
      status: 403,
    });
  }

  const context = await resolveActorContext({
    workosOrganizationId: auth.workosOrganizationId,
    workosUserId: auth.workosUserId,
  });

  return withTenantContext(context, async (transaction) => {
    const [profile] = await transaction
      .select({
        organizationId: organizations.id,
        organizationName: organizations.name,
        productConfiguration: organizations.productConfiguration,
        membershipId: memberships.id,
        workosUserId: memberships.workosUserId,
        email: memberships.email,
        displayName: memberships.displayName,
        timezone: memberships.timezone,
      })
      .from(memberships)
      .innerJoin(
        organizations,
        eq(organizations.id, memberships.organizationId),
      )
      .where(
        and(
          eq(memberships.id, context.actorMembershipId),
          eq(memberships.status, "active"),
          eq(organizations.status, "active"),
        ),
      )
      .limit(1);

    if (!profile) {
      throw new AppError({
        code: "FORBIDDEN",
        message: "Your organization access is no longer active.",
        status: 403,
      });
    }

    const grants = await transaction
      .select({
        roleCode: membershipRoles.roleCode,
        roleScope: roles.configurationScope,
        permissionCode: permissions.code,
        permissionScope: permissions.configurationScope,
        privileged: permissions.privileged,
      })
      .from(membershipRoles)
      .innerJoin(roles, eq(roles.code, membershipRoles.roleCode))
      .innerJoin(
        rolePermissions,
        eq(rolePermissions.roleCode, membershipRoles.roleCode),
      )
      .innerJoin(
        permissions,
        eq(permissions.code, rolePermissions.permissionCode),
      )
      .where(
        and(
          eq(membershipRoles.membershipId, profile.membershipId),
          isNull(membershipRoles.revokedAt),
        ),
      );

    const roleSet = new Set<RoleCode>();
    const permissionSet = new Set<PermissionCode>();
    const privilegedSet = new Set<PermissionCode>();

    for (const grant of grants) {
      const roleIsInScope =
        grant.roleScope === null ||
        grant.roleScope === profile.productConfiguration;
      const permissionIsInScope =
        grant.permissionScope === null ||
        grant.permissionScope === profile.productConfiguration;

      if (roleIsInScope && isRoleCode(grant.roleCode)) {
        roleSet.add(grant.roleCode);
      }

      if (
        roleIsInScope &&
        permissionIsInScope &&
        isPermissionCode(grant.permissionCode)
      ) {
        permissionSet.add(grant.permissionCode);
        if (grant.privileged) {
          privilegedSet.add(grant.permissionCode);
        }
      }
    }

    return {
      organization: {
        id: profile.organizationId,
        name: profile.organizationName,
        productConfiguration: profile.productConfiguration,
      },
      membership: {
        id: profile.membershipId,
        workosUserId: profile.workosUserId,
        email: profile.email,
        displayName: profile.displayName,
        timezone: profile.timezone,
      },
      roles: [...roleSet].sort(),
      permissions: [...permissionSet].sort(),
      privilegedPermissions: [...privilegedSet].sort(),
    };
  });
}

export const requireCurrentActor = cache(loadCurrentActor);

export function authorize(
  actor: Pick<CurrentActor, "permissions">,
  permission: PermissionCode,
): void {
  if (!can(actor, permission)) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "You do not have permission to perform this action.",
      status: 403,
      detail: `Required permission: ${permission}`,
    });
  }
}

export { can };

export async function requirePermission(
  permission: PermissionCode,
): Promise<CurrentActor> {
  const actor = await requireCurrentActor();
  authorize(actor, permission);
  return actor;
}
