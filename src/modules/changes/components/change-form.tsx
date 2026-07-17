"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { ActionFeedback } from "@/components/forms/action-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createChangeAction } from "@/modules/changes/actions";
import { initialChangeActionState } from "@/modules/changes/contracts";

type SourceVersionOption = {
  id: string;
  sourceId: string;
  sourceTitle: string;
  versionLabel: string;
  recordStatus: string;
  effectiveAt: Date;
};

export function ChangeForm({ versions }: { versions: SourceVersionOption[] }) {
  const [state, action] = useActionState(
    createChangeAction,
    initialChangeActionState,
  );
  const [oldId, setOldId] = useState(versions[0]?.id ?? "");
  const old = versions.find((version) => version.id === oldId);
  const newVersions = useMemo(
    () =>
      versions.filter(
        (version) =>
          version.sourceId === old?.sourceId &&
          version.id !== oldId &&
          version.recordStatus === "approved",
      ),
    [versions, old?.sourceId, oldId],
  );
  const selectClass =
    "border-input bg-background focus-visible:border-ring h-9 w-full rounded-lg border px-3 text-sm focus-visible:ring-3 focus-visible:outline-none";
  return (
    <form action={action} className="space-y-7">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="old-source-version">Old governed version</Label>
          <select
            id="old-source-version"
            name="oldSourceVersionId"
            className={selectClass}
            value={oldId}
            onChange={(event) => setOldId(event.target.value)}
          >
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.sourceTitle} · {version.versionLabel} (
                {version.recordStatus})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-source-version">New approved version</Label>
          <select
            id="new-source-version"
            name="newSourceVersionId"
            className={selectClass}
            required
          >
            {newVersions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.sourceTitle} · {version.versionLabel}
              </option>
            ))}
          </select>
          {newVersions.length === 0 ? (
            <p className="text-destructive text-xs">
              This source has no different approved current version.
            </p>
          ) : null}
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="old-rule">Exact old rule quote</Label>
          <Textarea
            id="old-rule"
            name="oldRule"
            className="min-h-40 font-mono text-sm"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-rule">Exact new rule quote</Label>
          <Textarea
            id="new-rule"
            name="newRule"
            className="min-h-40 font-mono text-sm"
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="diff-summary">Decision-useful change summary</Label>
        <Textarea id="diff-summary" name="diffSummary" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="affected-population">
          Affected population or scope
        </Label>
        <Input id="affected-population" name="affectedPopulation" required />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="exclusions">Known exclusions</Label>
          <Textarea id="exclusions" name="exclusions" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ambiguity">Unresolved ambiguity</Label>
          <Textarea id="ambiguity" name="unresolvedAmbiguity" />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Submission succeeds only when both rules are exact quotes from their
        selected immutable documents. A different active change validator must
        validate this locked version.
      </p>
      <ActionFeedback state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton
          pendingLabel="Verifying evidence…"
          disabled={newVersions.length === 0}
        >
          Submit ChangeEvent
        </SubmitButton>
        {state.objectPath ? (
          <Button asChild variant="outline">
            <Link href={state.objectPath}>Open ChangeEvent</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
