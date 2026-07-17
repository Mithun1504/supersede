"use client";

import { useActionState } from "react";

import { ActionFeedback } from "@/components/forms/action-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateOrganizationSettingsAction } from "@/modules/identity/actions";
import { initialIdentityActionState } from "@/modules/identity/contracts";

type SettingsValue = {
  defaultTimezone: string;
  locale: string;
  individualResultPolicy: string;
  minimumAggregateCohortSize: number;
  reviewConfidenceThreshold: string;
  maxGraphDepth: number;
};

function FieldError({ errors }: { errors: string[] | undefined }) {
  return errors?.[0] ? (
    <p className="text-destructive text-xs">{errors[0]}</p>
  ) : null;
}

export function OrganizationSettingsForm({
  settings,
  canManage,
}: {
  settings: SettingsValue;
  canManage: boolean;
}) {
  const [state, action] = useActionState(
    updateOrganizationSettingsAction,
    initialIdentityActionState,
  );

  return (
    <form action={action} className="space-y-6">
      <fieldset disabled={!canManage} className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="defaultTimezone">Default timezone</Label>
          <Input
            id="defaultTimezone"
            name="defaultTimezone"
            defaultValue={settings.defaultTimezone}
            aria-invalid={Boolean(state.fieldErrors?.defaultTimezone)}
          />
          <FieldError errors={state.fieldErrors?.defaultTimezone} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="locale">Locale</Label>
          <Input
            id="locale"
            name="locale"
            defaultValue={settings.locale}
            aria-invalid={Boolean(state.fieldErrors?.locale)}
          />
          <FieldError errors={state.fieldErrors?.locale} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="individualResultPolicy">
            Individual result visibility
          </Label>
          <select
            id="individualResultPolicy"
            name="individualResultPolicy"
            defaultValue={settings.individualResultPolicy}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm focus-visible:ring-3 focus-visible:outline-none disabled:opacity-50"
          >
            <option value="aggregate_only">Aggregate only</option>
            <option value="authorized_individual">
              Authorized individual access
            </option>
          </select>
          <p className="text-muted-foreground text-xs">
            Individual outcomes still require the privileged result permission.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="minimumAggregateCohortSize">
            Minimum aggregate cohort
          </Label>
          <Input
            id="minimumAggregateCohortSize"
            name="minimumAggregateCohortSize"
            type="number"
            min={2}
            defaultValue={settings.minimumAggregateCohortSize}
          />
          <FieldError errors={state.fieldErrors?.minimumAggregateCohortSize} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reviewConfidenceThreshold">
            Review confidence threshold
          </Label>
          <Input
            id="reviewConfidenceThreshold"
            name="reviewConfidenceThreshold"
            type="number"
            min={0}
            max={1}
            step={0.01}
            defaultValue={settings.reviewConfidenceThreshold}
          />
          <FieldError errors={state.fieldErrors?.reviewConfidenceThreshold} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxGraphDepth">Maximum graph depth</Label>
          <Input
            id="maxGraphDepth"
            name="maxGraphDepth"
            type="number"
            min={1}
            max={50}
            defaultValue={settings.maxGraphDepth}
          />
          <FieldError errors={state.fieldErrors?.maxGraphDepth} />
        </div>
      </fieldset>
      <ActionFeedback state={state} />
      {canManage ? <SubmitButton>Save policy</SubmitButton> : null}
    </form>
  );
}
