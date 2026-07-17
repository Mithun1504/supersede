"use client";

import { useActionState } from "react";

import { ActionFeedback } from "@/components/forms/action-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createCaseAction } from "@/modules/cases/actions";
import { initialCaseActionState } from "@/modules/cases/contracts";

export function CaseForm({
  changes,
}: {
  changes: Array<{ id: string; label: string; sourceTitle: string }>;
}) {
  const [state, action] = useActionState(
    createCaseAction,
    initialCaseActionState,
  );
  const selectClass =
    "border-input bg-background h-9 w-full rounded-lg border px-3 text-sm";
  return (
    <form action={action} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="case-change">Validated change</Label>
        <select
          id="case-change"
          name="changeEventVersionId"
          className={selectClass}
        >
          {changes.map((change) => (
            <option key={change.id} value={change.id}>
              {change.sourceTitle} · {change.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="scenario">Cold scenario</Label>
        <Textarea id="scenario" name="scenario" className="min-h-36" required />
        <p className="text-muted-foreground text-xs">
          Do not reveal that a rule changed or teach the new answer in the
          prompt.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="options">Options (one id|label per line)</Label>
        <Textarea
          id="options"
          name="optionsText"
          className="font-mono text-sm"
          placeholder={
            "old|Continue the previous action\nnew|Apply the updated action\nother|Escalate for clarification"
          }
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="old-answer">Old answer ID</Label>
          <Input id="old-answer" name="oldAnswer" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-answer">New answer ID</Label>
          <Input id="new-answer" name="newAnswer" required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="case-rationale">Reviewer rationale</Label>
        <Textarea id="case-rationale" name="rationale" required />
      </div>
      <ActionFeedback state={state} />
      <SubmitButton pendingLabel="Creating case…" disabled={!changes.length}>
        Create case
      </SubmitButton>
    </form>
  );
}
