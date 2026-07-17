"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  startExtractionAction,
  type ExtractionActionState,
} from "@/modules/ai/actions";

const initialExtractionState: ExtractionActionState = { status: "idle" };

export function ExtractionButton({
  artifactVersionId,
  configured,
}: {
  artifactVersionId: string;
  configured: boolean;
}) {
  const [state, action, pending] = useActionState(
    startExtractionAction,
    initialExtractionState,
  );
  return (
    <div className="mt-3 space-y-2">
      <form action={action}>
        <input
          type="hidden"
          name="artifactVersionId"
          value={artifactVersionId}
        />
        <Button type="submit" size="sm" disabled={!configured || pending}>
          {pending ? "Extracting and verifying…" : "Extract claims"}
        </Button>
      </form>
      {!configured ? (
        <p className="text-muted-foreground text-xs">
          Configure OpenAI and Gemini credentials to enable evidence-backed
          extraction.
        </p>
      ) : null}
      {state.message ? (
        <Alert
          role={state.status === "error" ? "alert" : "status"}
          variant={state.status === "error" ? "destructive" : "default"}
        >
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
