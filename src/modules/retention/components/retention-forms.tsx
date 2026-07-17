"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  createLegalHoldAction,
  saveRetentionPolicyAction,
} from "@/modules/retention/actions";
import { initialRetentionActionState } from "@/modules/retention/contracts";

function Feedback({ state }: { state: typeof initialRetentionActionState }) {
  return state.message ? (
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
  ) : null;
}

export function RetentionPolicyForm() {
  const [state, action, pending] = useActionState(
    saveRetentionPolicyAction,
    initialRetentionActionState,
  );
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm font-medium">
        Retention days
        <input
          name="retentionDays"
          type="number"
          min={1}
          max={3650}
          defaultValue={365}
          required
          className="border-input bg-background mt-1 h-10 w-full rounded-lg border px-3"
        />
      </label>
      <label className="block text-sm font-medium">
        Object-lock mode
        <select
          name="retentionMode"
          defaultValue="governance"
          className="border-input bg-background mt-1 h-10 w-full rounded-lg border px-3"
        >
          <option value="governance">Governance</option>
          <option value="compliance">Compliance</option>
        </select>
      </label>
      <label className="block text-sm font-medium">
        Disposition
        <select
          name="dispositionAction"
          defaultValue="delete"
          className="border-input bg-background mt-1 h-10 w-full rounded-lg border px-3"
        >
          <option value="delete">Delete after retention</option>
          <option value="retain">Retain indefinitely</option>
        </select>
      </label>
      <Button type="submit" disabled={pending}>
        Approve new policy version
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function LegalHoldForm({ organizationId }: { organizationId: string }) {
  const [state, action, pending] = useActionState(
    createLegalHoldAction,
    initialRetentionActionState,
  );
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm font-medium">
        Scope
        <select
          name="scopeType"
          defaultValue="organization"
          className="border-input bg-background mt-1 h-10 w-full rounded-lg border px-3"
        >
          <option value="organization">Entire organization</option>
          <option value="report_bundle">One report bundle</option>
        </select>
      </label>
      <label className="block text-sm font-medium">
        Organization or report UUID
        <input
          name="scopeId"
          defaultValue={organizationId}
          required
          className="border-input bg-background mt-1 h-10 w-full rounded-lg border px-3 font-mono text-xs"
        />
      </label>
      <label className="block text-sm font-medium">
        Matter reference
        <input
          name="reference"
          required
          minLength={3}
          maxLength={255}
          className="border-input bg-background mt-1 h-10 w-full rounded-lg border px-3"
        />
      </label>
      <label className="block text-sm font-medium">
        Reason
        <textarea
          name="reason"
          required
          minLength={10}
          maxLength={4000}
          className="border-input bg-background mt-1 min-h-20 w-full rounded-lg border p-3"
        />
      </label>
      <Button type="submit" disabled={pending}>
        Activate legal hold
      </Button>
      <Feedback state={state} />
    </form>
  );
}
