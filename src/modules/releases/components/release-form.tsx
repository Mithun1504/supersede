"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { initialReleaseActionState } from "@/modules/releases/contracts";
import { prepareReleaseAction } from "@/modules/releases/actions";

export function ReleaseForm({
  idempotencyKey,
  changes,
  roles,
}: {
  idempotencyKey: string;
  changes: { id: string; label: string; sourceTitle: string }[];
  roles: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(
    prepareReleaseAction,
    initialReleaseActionState,
  );
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <label className="block text-sm font-medium">
        Validated change
        <select
          name="changeEventVersionId"
          required
          className="border-input bg-background mt-1 h-10 w-full rounded-lg border px-3"
        >
          <option value="">Select a change</option>
          {changes.map((change) => (
            <option key={change.id} value={change.id}>
              {change.sourceTitle} · {change.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        Audience work role
        <select
          name="workRoleId"
          required
          className="border-input bg-background mt-1 h-10 w-full rounded-lg border px-3"
        >
          <option value="">Select a role</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      </label>
      <Button
        type="submit"
        disabled={pending || !changes.length || !roles.length}
      >
        {pending ? "Freezing snapshot…" : "Prepare release snapshot"}
      </Button>
      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error"
              ? "text-destructive text-sm"
              : "text-muted-foreground text-sm"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
