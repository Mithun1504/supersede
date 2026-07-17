"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { decideReviewTaskAction } from "@/modules/review/actions";
import { initialReviewActionState } from "@/modules/review/contracts";

export function ReviewDecisionForm({
  reviewTaskId,
  candidateText,
  allowEdit,
}: {
  reviewTaskId: string;
  candidateText: string;
  allowEdit: boolean;
}) {
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    startedAt.current = performance.now();
  }, []);
  const [state, action, pending] = useActionState(
    decideReviewTaskAction,
    initialReviewActionState,
  );
  return (
    <form
      action={action}
      className="space-y-3"
      onSubmit={(event) => {
        const input = event.currentTarget.elements.namedItem("activeSeconds");
        if (input instanceof HTMLInputElement && startedAt.current !== null) {
          input.value = String(
            Math.min(
              3_600,
              Math.round((performance.now() - startedAt.current) / 1_000),
            ),
          );
        }
      }}
    >
      <input type="hidden" name="reviewTaskId" value={reviewTaskId} />
      <input type="hidden" name="activeSeconds" defaultValue="0" />
      {allowEdit ? (
        <label className="block text-xs font-medium">
          Claim text
          <textarea
            name="editedText"
            defaultValue={candidateText}
            minLength={3}
            maxLength={4000}
            className="border-input bg-background mt-1 min-h-20 w-full rounded-lg border p-2 text-sm"
          />
        </label>
      ) : null}
      <label
        className="block text-xs font-medium"
        htmlFor={`reason-${reviewTaskId}`}
      >
        Decision note (optional)
      </label>
      <input
        id={`reason-${reviewTaskId}`}
        name="reason"
        className="border-input bg-background h-8 w-full rounded-lg border px-2 text-sm"
        maxLength={2000}
      />
      <div className="flex flex-wrap gap-2">
        <Button name="action" value="accepted" size="sm" disabled={pending}>
          Accept
        </Button>
        {allowEdit ? (
          <Button
            name="action"
            value="edited"
            size="sm"
            variant="secondary"
            disabled={pending}
          >
            Save reviewer edit
          </Button>
        ) : null}
        <Button
          name="action"
          value="rejected"
          size="sm"
          variant="destructive"
          disabled={pending}
        >
          Reject
        </Button>
        <Button
          name="action"
          value="deferred"
          size="sm"
          variant="outline"
          disabled={pending}
        >
          Defer
        </Button>
      </div>
      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error"
              ? "text-destructive text-xs"
              : "text-muted-foreground text-xs"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
