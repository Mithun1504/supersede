"use client";

import Link from "next/link";
import { useActionState } from "react";

import { ActionFeedback } from "@/components/forms/action-feedback";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createCorpusAction } from "@/modules/corpus/actions";
import { initialCorpusActionState } from "@/modules/corpus/contracts";

export function CreateCorpusForm() {
  const [state, action] = useActionState(
    createCorpusAction,
    initialCorpusActionState,
  );
  return (
    <form action={action} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">Corpus name</Label>
        <Input id="name" name="name" required minLength={2} maxLength={255} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" maxLength={4000} />
      </div>
      <ActionFeedback state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Creating…">Create corpus</SubmitButton>
        {state.objectPath ? (
          <Button asChild variant="outline">
            <Link href={state.objectPath}>Open corpus</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
