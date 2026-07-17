"use client";

import { useActionState } from "react";

import { ActionFeedback } from "@/components/forms/action-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  importPeopleAction,
  mapRoleArtifactAction,
} from "@/modules/people/actions";
import { initialPeopleActionState } from "@/modules/people/contracts";

const selectClass =
  "border-input bg-background h-9 w-full rounded-lg border px-3 text-sm";

export function PeopleImportForm() {
  const [state, action] = useActionState(
    importPeopleAction,
    initialPeopleActionState,
  );
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="people-rows">CSV rows</Label>
        <Textarea
          id="people-rows"
          name="rows"
          className="min-h-44 font-mono text-sm"
          placeholder="P-001,Avery Stone,avery@example.test,Emergency physician"
          required
        />
        <p className="text-muted-foreground text-xs">
          One row per person: external key, display name, email, work role. Use
          fictional data for the hackathon demo.
        </p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="deprovisionMissing" className="mt-1" />
        <span>
          Full snapshot: deprovision records previously imported through the
          active HRIS CSV connection when their external key is absent.
        </span>
      </label>
      <ActionFeedback state={state} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="mode" value="preview" variant="outline">
          Preview and validate
        </Button>
        <SubmitButton name="mode" value="apply" pendingLabel="Importing…">
          Apply import
        </SubmitButton>
      </div>
    </form>
  );
}

export function ExposureMappingForm({
  roles,
  artifacts,
}: {
  roles: Array<{ id: string; name: string }>;
  artifacts: Array<{ id: string; title: string }>;
}) {
  const [state, action] = useActionState(
    mapRoleArtifactAction,
    initialPeopleActionState,
  );
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="exposure-role">Work role</Label>
          <select id="exposure-role" name="workRoleId" className={selectClass}>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="exposure-artifact">Governed artifact</Label>
          <select
            id="exposure-artifact"
            name="artifactId"
            className={selectClass}
          >
            {artifacts.map((artifact) => (
              <option key={artifact.id} value={artifact.id}>
                {artifact.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="exposure-rationale">
          Why this role uses the artifact
        </Label>
        <Textarea id="exposure-rationale" name="rationale" required />
      </div>
      <ActionFeedback state={state} />
      <SubmitButton
        pendingLabel="Mapping…"
        disabled={!roles.length || !artifacts.length}
      >
        Accept potential-exposure mapping
      </SubmitButton>
    </form>
  );
}
