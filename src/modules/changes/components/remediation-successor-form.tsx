"use client";

import { useActionState } from "react";

import { ActionFeedback } from "@/components/forms/action-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createRemediationSuccessorAction,
  type RemediationActionState,
} from "@/modules/changes/remediation-actions";

const initialState: RemediationActionState = { status: "idle" };

export function RemediationSuccessorForm({
  remediation,
}: {
  remediation: {
    id: string;
    artifactId: string;
    artifactTitle: string;
    artifactKind: string;
    corpusId: string;
  };
}) {
  const [state, action] = useActionState(
    createRemediationSuccessorAction,
    initialState,
  );
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="remediationId" value={remediation.id} />
      <input type="hidden" name="artifactId" value={remediation.artifactId} />
      <input type="hidden" name="corpusId" value={remediation.corpusId} />
      <input type="hidden" name="documentType" value="artifact" />
      <input
        type="hidden"
        name="artifactKind"
        value={remediation.artifactKind}
      />
      <input type="hidden" name="title" value={remediation.artifactTitle} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="remediation-version">Version label</Label>
          <Input id="remediation-version" name="versionLabel" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="remediation-effective">Effective date</Label>
          <Input
            id="remediation-effective"
            name="effectiveAt"
            type="date"
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="remediation-content">
          Complete corrected artifact text
        </Label>
        <Textarea
          id="remediation-content"
          name="content"
          className="min-h-64 font-mono text-sm"
          minLength={20}
          required
        />
      </div>
      <ActionFeedback state={state} />
      <SubmitButton pendingLabel="Submitting successor…">
        Submit successor for verification
      </SubmitButton>
    </form>
  );
}
