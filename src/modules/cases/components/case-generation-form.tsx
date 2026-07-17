"use client";

import { useActionState } from "react";

import { ActionFeedback } from "@/components/forms/action-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Label } from "@/components/ui/label";
import { generateCasesAction } from "@/modules/cases/actions";
import { initialCaseActionState } from "@/modules/cases/contracts";

export function CaseGenerationForm({
  changes,
}: {
  changes: Array<{ id: string; label: string; sourceTitle: string }>;
}) {
  const [state, action] = useActionState(
    generateCasesAction,
    initialCaseActionState,
  );
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="generate-case-change">Validated change</Label>
        <select
          id="generate-case-change"
          name="changeEventVersionId"
          className="border-input bg-background h-9 w-full rounded-lg border px-3 text-sm"
        >
          {changes.map((change) => (
            <option key={change.id} value={change.id}>
              {change.sourceTitle} · {change.label}
            </option>
          ))}
        </select>
      </div>
      <ActionFeedback state={state} />
      <SubmitButton
        pendingLabel="Generating three governed drafts…"
        disabled={!changes.length}
      >
        Generate with GPT‑5.6
      </SubmitButton>
    </form>
  );
}
