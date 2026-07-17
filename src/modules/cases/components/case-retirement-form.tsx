"use client";

import { useActionState } from "react";

import { ActionFeedback } from "@/components/forms/action-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { retireCaseAction } from "@/modules/cases/actions";
import { initialCaseActionState } from "@/modules/cases/contracts";

export function CaseRetirementForm({
  caseVersionId,
}: {
  caseVersionId: string;
}) {
  const [state, action] = useActionState(
    retireCaseAction,
    initialCaseActionState,
  );
  return (
    <form action={action} className="mt-4 space-y-3 border-t pt-4">
      <input type="hidden" name="caseVersionId" value={caseVersionId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`reason-${caseVersionId}`}>Retirement reason</Label>
          <select
            id={`reason-${caseVersionId}`}
            name="reason"
            className="border-input bg-background h-9 w-full rounded-lg border px-3 text-sm"
          >
            <option value="ambiguous">Ambiguous</option>
            <option value="citation_invalid">Citation invalid</option>
            <option value="content_error">Content error</option>
            <option value="source_superseded">Source superseded</option>
            <option value="policy_change">Policy change</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`rationale-${caseVersionId}`}>Rationale</Label>
          <Input
            id={`rationale-${caseVersionId}`}
            name="rationale"
            minLength={5}
            required
          />
        </div>
      </div>
      <label className="flex items-start gap-2 text-xs">
        <input
          className="mt-0.5"
          type="checkbox"
          name="excludesHistoricalMetrics"
        />
        <span>
          Exclude this case from historical metrics because post-hoc ambiguity
          or invalid evidence makes its results unreliable.
        </span>
      </label>
      <ActionFeedback state={state} />
      <SubmitButton variant="outline" pendingLabel="Retiring…">
        Retire exact version
      </SubmitButton>
    </form>
  );
}
