"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { requestReportAction } from "@/modules/reports/actions";
import { initialReportActionState } from "@/modules/reports/contracts";

export function ReportRequestForm({
  changeEventVersionId,
  cutoff,
  idempotencyKey,
}: {
  changeEventVersionId: string;
  cutoff: string;
  idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState(
    requestReportAction,
    initialReportActionState,
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input
        type="hidden"
        name="changeEventVersionId"
        value={changeEventVersionId}
      />
      <input type="hidden" name="cutoff" value={cutoff} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <Button type="submit" disabled={pending}>
        {pending ? "Generating…" : "Generate verifiable bundle"}
      </Button>
      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error"
              ? "text-destructive text-sm"
              : "text-muted-foreground text-sm"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
