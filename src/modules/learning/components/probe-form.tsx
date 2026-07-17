"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { submitProbeAction } from "@/modules/learning/actions";
import { initialLearningActionState } from "@/modules/learning/contracts";

export function ProbeForm({
  assignmentId,
  clientSubmissionId,
  options,
}: {
  assignmentId: string;
  clientSubmissionId: string;
  options: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(
    submitProbeAction,
    initialLearningActionState,
  );
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="probeAssignmentId" value={assignmentId} />
      <input
        type="hidden"
        name="clientSubmissionId"
        value={clientSubmissionId}
      />
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">What would you do?</legend>
        {options.map((option) => (
          <label
            key={option.id}
            className="has-checked:border-primary has-checked:bg-primary/5 flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm transition-colors"
          >
            <input
              type="radio"
              name="selectedOptionId"
              value={option.id}
              required
              className="accent-primary size-4"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Recording response…" : "Submit final response"}
      </Button>
      <p className="text-muted-foreground text-xs">
        A probe response is final after submission and cannot be edited.
      </p>
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
