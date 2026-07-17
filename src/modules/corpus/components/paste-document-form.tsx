"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { ActionFeedback } from "@/components/forms/action-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ingestPastedDocumentAction } from "@/modules/corpus/actions";
import {
  artifactKinds,
  initialCorpusActionState,
  sourceKinds,
} from "@/modules/corpus/contracts";

export function PasteDocumentForm({
  corpora,
}: {
  corpora: Array<{ id: string; name: string }>;
}) {
  const [documentType, setDocumentType] = useState<"source" | "artifact">(
    "source",
  );
  const [state, action] = useActionState(
    ingestPastedDocumentAction,
    initialCorpusActionState,
  );
  const selectClass =
    "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm focus-visible:ring-3 focus-visible:outline-none";

  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="corpusId">Corpus</Label>
          <select id="corpusId" name="corpusId" className={selectClass}>
            {corpora.map((corpus) => (
              <option key={corpus.id} value={corpus.id}>
                {corpus.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="documentType">Governed object</Label>
          <select
            id="documentType"
            name="documentType"
            className={selectClass}
            value={documentType}
            onChange={(event) =>
              setDocumentType(event.target.value as "source" | "artifact")
            }
          >
            <option value="source">Authoritative source</option>
            <option value="artifact">Downstream artifact</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="kind">Kind</Label>
          {documentType === "source" ? (
            <select id="kind" name="sourceKind" className={selectClass}>
              {sourceKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kind.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          ) : (
            <select id="kind" name="artifactKind" className={selectClass}>
              {artifactKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kind.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required minLength={2} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="versionLabel">Version label</Label>
          <Input
            id="versionLabel"
            name="versionLabel"
            required
            placeholder="2026.1"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="effectiveAt">Effective date</Label>
          <Input id="effectiveAt" name="effectiveAt" type="date" required />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="externalReference">
            Canonical or external reference
          </Label>
          <Input
            id="externalReference"
            name="externalReference"
            placeholder="Optional stable identifier or URL"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="content">Document text</Label>
        <Textarea
          id="content"
          name="content"
          required
          minLength={20}
          className="min-h-72 font-mono text-sm"
          placeholder="Paste the exact governed document text. It is hashed and stored without normalization so evidence offsets remain reproducible."
        />
        <p className="text-muted-foreground text-xs">
          Document instructions are treated as untrusted data and never as
          system instructions.
        </p>
      </div>
      <ActionFeedback state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Ingesting…">Ingest document</SubmitButton>
        {state.objectPath ? (
          <Button asChild variant="outline">
            <Link href={state.objectPath}>Open record</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
