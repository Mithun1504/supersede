"use client";

import { useActionState } from "react";

import { ActionFeedback } from "@/components/forms/action-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { configureIntegrationAction } from "@/modules/integrations/actions";
import { initialIntegrationActionState } from "@/modules/integrations/contracts";

export function IntegrationForm({
  type,
}: {
  type: "slack" | "lms_xapi" | "hris_csv";
}) {
  const [state, action] = useActionState(
    configureIntegrationAction,
    initialIntegrationActionState,
  );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="type" value={type} />
      <div className="space-y-2">
        <Label htmlFor={`${type}-name`}>Connection name</Label>
        <Input
          id={`${type}-name`}
          name="name"
          defaultValue={
            type === "slack"
              ? "Workspace Slack"
              : type === "lms_xapi"
                ? "Learning record export"
                : "People CSV import"
          }
          required
        />
      </div>
      <ActionFeedback state={state} />
      <SubmitButton pendingLabel="Verifying…">Verify and activate</SubmitButton>
    </form>
  );
}
