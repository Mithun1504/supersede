"use client";

import { useActionState } from "react";

import { ActionFeedback } from "@/components/forms/action-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ingestPastedDocumentAction } from "@/modules/corpus/actions";
import { initialCorpusActionState } from "@/modules/corpus/contracts";

export function AddSourceVersionForm({
  source,
  corpusId,
}: {
  source: { id: string; title: string; kind: string };
  corpusId: string;
}) {
  const [state, action] = useActionState(
    ingestPastedDocumentAction,
    initialCorpusActionState,
  );
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="corpusId" value={corpusId} />
      <input type="hidden" name="sourceId" value={source.id} />
      <input type="hidden" name="documentType" value="source" />
      <input type="hidden" name="sourceKind" value={source.kind} />
      <input type="hidden" name="title" value={source.title} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="successor-label">Version label</Label>
          <Input id="successor-label" name="versionLabel" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="successor-effective">Effective date</Label>
          <Input
            id="successor-effective"
            name="effectiveAt"
            type="date"
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="successor-content">Exact successor text</Label>
        <Textarea
          id="successor-content"
          name="content"
          className="min-h-56 font-mono text-sm"
          minLength={20}
          required
        />
      </div>
      <ActionFeedback state={state} />
      <SubmitButton pendingLabel="Creating successor…">
        Create immutable successor
      </SubmitButton>
    </form>
  );
}
