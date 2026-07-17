import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  RoleGrantForm,
  RoleRevokeForm,
} from "@/modules/identity/components/role-management";
import { can, requireCurrentActor } from "@/modules/identity/policy";
import {
  listAssignableRoles,
  listOrganizationMembers,
} from "@/modules/identity/repository";

export const metadata: Metadata = { title: "Members and roles" };

export default async function MembersPage() {
  const actor = await requireCurrentActor();
  const [members, roles] = await Promise.all([
    listOrganizationMembers(actor),
    listAssignableRoles(actor),
  ]);
  const canManage = can(actor, "membership.manage");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members and role grants</CardTitle>
        <CardDescription>
          WorkOS proves identity. Supersede roles grant local, historical
          capabilities and are never inferred from the client.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {members.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <p className="font-medium">No members synchronized</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Invite members in WorkOS to begin assigning domain roles.
            </p>
          </div>
        ) : (
          members.map((member) => {
            const availableRoles = roles.filter(
              (role) => !member.roleCodes.includes(role.code),
            );
            return (
              <section
                key={member.id}
                className="rounded-xl border p-4 sm:p-5"
                aria-labelledby={`member-${member.id}`}
              >
                <div className="flex flex-col justify-between gap-3 sm:flex-row">
                  <div>
                    <h2 id={`member-${member.id}`} className="font-medium">
                      {member.displayName}
                    </h2>
                    <p className="text-muted-foreground text-sm">
                      {member.email}
                    </p>
                  </div>
                  <Badge variant="outline" className="w-fit capitalize">
                    {member.status}
                  </Badge>
                </div>
                <div className="mt-4 space-y-3">
                  {member.roleCodes.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No active role grants.
                    </p>
                  ) : canManage ? (
                    member.roleCodes.map((roleCode) => (
                      <RoleRevokeForm
                        key={roleCode}
                        membershipId={member.id}
                        roleCode={roleCode}
                      />
                    ))
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {member.roleCodes.map((roleCode) => (
                        <Badge key={roleCode} variant="secondary">
                          {roleCode.replaceAll("_", " ")}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {canManage && availableRoles.length > 0 ? (
                    <RoleGrantForm
                      membershipId={member.id}
                      availableRoles={availableRoles}
                    />
                  ) : null}
                </div>
              </section>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
