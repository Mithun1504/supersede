"use client";

import { useActionState } from "react";

import { ActionFeedback } from "@/components/forms/action-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  grantMembershipRoleAction,
  revokeMembershipRoleAction,
} from "@/modules/identity/actions";
import { initialIdentityActionState } from "@/modules/identity/contracts";

type RoleOption = { code: string; description: string };

export function RoleGrantForm({
  membershipId,
  availableRoles,
}: {
  membershipId: string;
  availableRoles: RoleOption[];
}) {
  const [state, action] = useActionState(
    grantMembershipRoleAction,
    initialIdentityActionState,
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="membershipId" value={membershipId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          name="roleCode"
          aria-label="Role to grant"
          className="border-input bg-background h-8 min-w-44 rounded-lg border px-2 text-sm"
        >
          {availableRoles.map((role) => (
            <option key={role.code} value={role.code}>
              {role.code.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <SubmitButton variant="outline" pendingLabel="Granting…">
          Grant role
        </SubmitButton>
      </div>
      <ActionFeedback state={state} />
    </form>
  );
}

export function RoleRevokeForm({
  membershipId,
  roleCode,
}: {
  membershipId: string;
  roleCode: string;
}) {
  const [state, action] = useActionState(
    revokeMembershipRoleAction,
    initialIdentityActionState,
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="membershipId" value={membershipId} />
      <input type="hidden" name="roleCode" value={roleCode} />
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{roleCode.replaceAll("_", " ")}</Badge>
        <Input
          name="reason"
          aria-label={`Reason to revoke ${roleCode}`}
          placeholder="Revocation reason"
          className="h-8 w-48"
          required
          minLength={3}
        />
        <SubmitButton
          variant="ghost"
          pendingLabel="Revoking…"
          className="text-destructive"
        >
          Revoke
        </SubmitButton>
      </div>
      <ActionFeedback state={state} />
    </form>
  );
}
