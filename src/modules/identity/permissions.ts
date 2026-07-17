export const permissionCodes = [
  "organization.read",
  "organization.manage",
  "membership.read",
  "membership.manage",
  "service_account.manage",
  "approval_policy.manage",
  "corpus.read",
  "corpus.write",
  "edge.review",
  "change.read",
  "change.write",
  "change.validate",
  "artifact.remediate_owned",
  "artifact.verify",
  "people.read",
  "people.manage",
  "case.read",
  "case.approve",
  "release.prepare",
  "release.authorize",
  "learning.complete",
  "result.read_aggregate",
  "result.read_individual",
  "audit.read",
  "report.export",
  "retention.manage",
  "integration.manage",
  "operations.read",
  "operations.retry",
  "support.grant",
] as const;

export type PermissionCode = (typeof permissionCodes)[number];

export const roleCodes = [
  "org_admin",
  "change_owner",
  "change_validator",
  "edge_reviewer",
  "case_approver",
  "release_authorizer",
  "auditor",
  "learner",
] as const;

export type RoleCode = (typeof roleCodes)[number];

export const productConfigurations = ["propagate", "displace"] as const;
export type ProductConfiguration = (typeof productConfigurations)[number];

export function isPermissionCode(value: string): value is PermissionCode {
  return (permissionCodes as readonly string[]).includes(value);
}

export function isRoleCode(value: string): value is RoleCode {
  return (roleCodes as readonly string[]).includes(value);
}

export function can(
  actor: { permissions: readonly PermissionCode[] },
  permission: PermissionCode,
): boolean {
  return actor.permissions.includes(permission);
}
