"use client";

import { useActionState } from "react";

import { ActionFeedback } from "@/components/forms/action-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitRemediationAction } from "@/modules/learning/actions";
import { initialLearningActionState } from "@/modules/learning/contracts";

export function RemediationForm({ assignmentId }: { assignmentId: string }) {
  const [state, action] = useActionState(
    submitRemediationAction,
    initialLearningActionState,
  );
  return (
    <form action={action} className="space-y-5">
      <input
        type="hidden"
        name="remediationAssignmentId"
        value={assignmentId}
      />
      <div className="space-y-2">
        <Label htmlFor="corrected-work">Corrected work product</Label>
        <Textarea
          id="corrected-work"
          name="submissionText"
          minLength={20}
          className="min-h-64"
          required
        />
        <p className="text-muted-foreground text-xs">
          Apply the updated rule to the work itself. Merely repeating the rule
          does not pass.
        </p>
      </div>
      <ActionFeedback state={state} />
      <SubmitButton pendingLabel="Assessing correction…">
        Submit corrected work
      </SubmitButton>
    </form>
  );
}
