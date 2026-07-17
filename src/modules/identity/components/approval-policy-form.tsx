"use client";

import { useActionState } from "react";

import { ActionFeedback } from "@/components/forms/action-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateApprovalPolicyAction } from "@/modules/identity/actions";
import { initialIdentityActionState } from "@/modules/identity/contracts";

type Policy = {
  id: string;
  minimumApprovals: number;
  requireDistinctCreator: boolean;
  requireDistinctRequester: boolean;
  requireRecentAuth: boolean;
  requireMfa: boolean;
  eligibleRoleCodes: string[];
};

type Role = { code: string; description: string };

export function ApprovalPolicyForm({
  policy,
  roles,
  canManage,
}: {
  policy: Policy;
  roles: Role[];
  canManage: boolean;
}) {
  const [state, action] = useActionState(
    updateApprovalPolicyAction,
    initialIdentityActionState,
  );

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="policyId" value={policy.id} />
      <fieldset disabled={!canManage} className="space-y-5">
        <div className="max-w-48 space-y-2">
          <Label htmlFor={`minimum-${policy.id}`}>Approvals required</Label>
          <Input
            id={`minimum-${policy.id}`}
            name="minimumApprovals"
            type="number"
            min={1}
            max={5}
            defaultValue={policy.minimumApprovals}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Eligible roles</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {roles.map((role) => (
              <label
                key={role.code}
                className="hover:bg-muted/50 flex items-start gap-3 rounded-lg border p-3"
              >
                <input
                  type="checkbox"
                  name="eligibleRoleCodes"
                  value={role.code}
                  defaultChecked={policy.eligibleRoleCodes.includes(role.code)}
                  className="accent-primary mt-1 size-4"
                />
                <span>
                  <span className="block text-sm font-medium">
                    {role.code.replaceAll("_", " ")}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {role.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">Safeguards</legend>
          <PolicyCheckbox
            name="requireDistinctCreator"
            label="Approver differs from creator"
            defaultChecked={policy.requireDistinctCreator}
          />
          <PolicyCheckbox
            name="requireDistinctRequester"
            label="Approver differs from requester"
            defaultChecked={policy.requireDistinctRequester}
          />
          <PolicyCheckbox
            name="requireRecentAuth"
            label="Recent authentication required"
            defaultChecked={policy.requireRecentAuth}
          />
          <PolicyCheckbox
            name="requireMfa"
            label="MFA assurance required"
            defaultChecked={policy.requireMfa}
          />
        </fieldset>
      </fieldset>
      <ActionFeedback state={state} />
      {canManage ? (
        <SubmitButton pendingLabel="Activating…">
          Activate successor version
        </SubmitButton>
      ) : null}
    </form>
  );
}

function PolicyCheckbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="accent-primary size-4"
      />
      {label}
    </label>
  );
}
