"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function mutate(endpoint: string, body: Record<string, unknown> = {}) {
  const idempotencyKey = newIdempotencyKey();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({ ...body, idempotencyKey }),
  });
  const payload = (await response.json()) as {
    title?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(payload.message ?? payload.title ?? "The action failed.");
  }
  return payload;
}

function newIdempotencyKey() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export function MutationButton({
  endpoint,
  label,
  body,
  variant = "default",
}: {
  endpoint: string;
  label: string;
  body?: Record<string, unknown>;
  variant?: "default" | "outline" | "destructive";
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");
  const [error, setError] = useState<string>();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant={variant}
        disabled={state !== "idle"}
        onClick={async () => {
          setError(undefined);
          setState("pending");
          try {
            await mutate(endpoint, body);
            setState("done");
            router.refresh();
          } catch (cause) {
            setState("idle");
            setError(cause instanceof Error ? cause.message : "Action failed.");
          }
        }}
      >
        {state === "pending" ? "Saving…" : state === "done" ? "Saved" : label}
      </Button>
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function EdgeReviewActions({
  edgeId,
  edgeVersionId,
  evidenceQuote,
  loadBearingScore,
}: {
  edgeId: string;
  edgeVersionId: string;
  evidenceQuote: string;
  loadBearingScore: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const baseEndpoint = `/api/v1/workflow/edges/${edgeId}/versions/${edgeVersionId}`;
  async function override(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const form = new FormData(event.currentTarget);
      await mutate(`${baseEndpoint}/override`, {
        aiRationale: `Evidence quote: ${evidenceQuote}`,
        loadBearingScore,
        overrideClass: form.get("overrideClass"),
        reason: form.get("reason"),
      });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="grid min-w-64 gap-3">
      <MutationButton
        endpoint={`${baseEndpoint}/accept`}
        label="Accept reviewed edge"
        body={{
          aiRationale: `Evidence quote: ${evidenceQuote}`,
          loadBearingScore,
        }}
      />
      <details className="border-border rounded-md border p-3 text-sm">
        <summary className="cursor-pointer font-bold">
          Override classification
        </summary>
        <form className="mt-3 grid gap-3" onSubmit={override}>
          <label className="grid gap-2 text-xs font-medium">
            Reviewed classification
            <select
              className="border-input bg-background h-9 rounded-md border px-2"
              name="overrideClass"
            >
              <option value="load_bearing">Load bearing</option>
              <option value="peripheral">Peripheral</option>
            </select>
          </label>
          <Field label="Audited reason" name="reason" />
          <Button disabled={pending} type="submit" variant="outline">
            {pending ? "Saving…" : "Record override"}
          </Button>
          {error ? (
            <p className="text-destructive text-xs" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </details>
    </div>
  );
}

export function ChangeEntryForm({
  sourceId,
  oldSourceVersionId,
  newSourceVersionId,
}: {
  sourceId: string;
  oldSourceVersionId: string;
  newSourceVersionId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setError(undefined);
    try {
      await mutate("/api/v1/workflow/changes", {
        sourceId,
        oldSourceVersionId,
        newSourceVersionId,
        versionLabel: form.get("versionLabel"),
        oldRule: form.get("oldRule"),
        newRule: form.get("newRule"),
        affectedPopulation: form.get("affectedPopulation"),
        diffSummary: { enteredFrom: "governed-change-ui" },
      });
      formElement.reset();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Version label" name="versionLabel" />
        <Field label="Affected population" name="affectedPopulation" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TextArea label="Retired rule" name="oldRule" />
        <TextArea label="Replacement rule" name="newRule" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} type="submit">
          {pending ? "Recording…" : "Record source change"}
        </Button>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </div>
    </form>
  );
}

export function CaseDraftForm({
  changeEventId,
  changeEventVersionId,
  oldSourceVersionId,
  newSourceVersionId,
}: {
  changeEventId: string;
  changeEventVersionId: string;
  oldSourceVersionId: string;
  newSourceVersionId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setError(undefined);
    try {
      const form = new FormData(formElement);
      const ambiguityNote = String(form.get("ambiguityNote") ?? "").trim();
      await mutate("/api/v1/workflow/cases", {
        changeEventId,
        changeEventVersionId,
        versionLabel: form.get("versionLabel"),
        scenario: form.get("scenario"),
        oldAnswer: form.get("oldAnswer"),
        newAnswer: form.get("newAnswer"),
        rationale: form.get("rationale"),
        oldCitation: {
          sourceVersionId: oldSourceVersionId,
          quote: form.get("oldQuote"),
        },
        newCitation: {
          sourceVersionId: newSourceVersionId,
          quote: form.get("newQuote"),
        },
        ...(ambiguityNote ? { ambiguityNote } : {}),
      });
      formElement.reset();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="grid gap-4" onSubmit={submit}>
      <Field label="Version label" name="versionLabel" />
      <TextArea label="Clinical scenario" name="scenario" />
      <div className="grid gap-4 lg:grid-cols-2">
        <TextArea label="Old-rule answer" name="oldAnswer" />
        <TextArea label="New-rule answer" name="newAnswer" />
        <TextArea label="Exact old-source quote" name="oldQuote" />
        <TextArea label="Exact new-source quote" name="newQuote" />
      </div>
      <TextArea label="Decision rationale" name="rationale" />
      <label className="grid gap-2 text-sm font-medium">
        Ambiguity note (optional; prevents approval)
        <textarea
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 min-h-20 rounded-md border px-3 py-2 text-sm focus-visible:ring-3 focus-visible:outline-none"
          name="ambiguityNote"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} type="submit">
          {pending ? "Drafting…" : "Draft decision case"}
        </Button>
        {error ? (
          <p className="text-destructive text-xs" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function Field({ label, name }: { label: string; name: string }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <Input name={name} required />
    </label>
  );
}

function TextArea({ label, name }: { label: string; name: string }) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <textarea
        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 min-h-28 rounded-md border px-3 py-2 text-sm focus-visible:ring-3 focus-visible:outline-none"
        name={name}
        required
      />
    </label>
  );
}

export function ProbeResponseActions({
  assignmentId,
  remediationAssignmentId,
  hasResponse,
  remediationPassed,
}: {
  assignmentId: string;
  remediationAssignmentId: string | null;
  hasResponse: boolean;
  remediationPassed: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  async function submit(
    event: FormEvent<HTMLFormElement>,
    endpoint: string,
    mapper: (form: FormData) => Record<string, unknown>,
  ) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const form = new FormData(event.currentTarget);
      await mutate(endpoint, mapper(form));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
    } finally {
      setPending(false);
    }
  }
  if (!hasResponse) {
    return (
      <form
        className="border-primary/30 bg-primary/[0.03] grid gap-3 border p-4"
        onSubmit={(event) =>
          submit(
            event,
            `/api/v1/workflow/probes/${assignmentId}/complete`,
            (form) => ({ responseText: form.get("responseText") }),
          )
        }
      >
        <TextArea label="Your response" name="responseText" />
        <Button disabled={pending} type="submit">
          Submit response
        </Button>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </form>
    );
  }
  if (remediationAssignmentId && !remediationPassed) {
    return (
      <form
        className="border-primary/30 bg-primary/[0.03] grid gap-3 border p-4"
        onSubmit={(event) =>
          submit(
            event,
            `/api/v1/workflow/remediations/${remediationAssignmentId}/complete`,
            (form) => ({
              submittedPatch: form.get("submittedPatch"),
              feedback: form.get("feedback"),
              passed: true,
            }),
          )
        }
      >
        <TextArea label="Correction" name="submittedPatch" />
        <Field label="Reviewer feedback" name="feedback" />
        <Button disabled={pending} type="submit">
          Complete remediation
        </Button>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </form>
    );
  }
  return null;
}

export function ArtifactCorrectionActions({
  artifactId,
  parentArtifactVersionId,
}: {
  artifactId: string;
  parentArtifactVersionId: string;
}) {
  const router = useRouter();
  const [versionId, setVersionId] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const bodyText = String(form.get("bodyText"));
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(bodyText),
    );
    const fileSha256 = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    setPending(true);
    setError(undefined);
    try {
      const result = (await mutate(
        `/api/v1/workflow/artifacts/${artifactId}/versions`,
        {
          parentArtifactVersionId,
          versionLabel: form.get("versionLabel"),
          bodyText,
          fileSha256,
        },
      )) as { artifactVersionId?: string };
      if (!result.artifactVersionId)
        throw new Error("No version was returned.");
      setVersionId(result.artifactVersionId);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
    } finally {
      setPending(false);
    }
  }
  if (versionId) {
    return (
      <div className="border-success/30 bg-success/5 mt-3 rounded-md border p-3">
        <p className="text-success text-xs font-bold">
          Correction submitted for independent approval.
        </p>
        <p className="text-muted-foreground mt-1 font-mono text-xs">
          Version {versionId.slice(0, 8)}
        </p>
      </div>
    );
  }
  return (
    <details className="border-border mt-3 border-t pt-3">
      <summary className="cursor-pointer text-xs font-semibold">
        Submit correction version
      </summary>
      <form className="mt-3 grid gap-3" onSubmit={submit}>
        <Field label="Version label" name="versionLabel" />
        <TextArea label="Corrected content" name="bodyText" />
        <Button disabled={pending} type="submit" variant="outline">
          {pending ? "Creating…" : "Create correction"}
        </Button>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </form>
    </details>
  );
}

export function ArtifactOwnerAssignment({
  artifactId,
  members,
}: {
  artifactId: string;
  members: Array<{ id: string; displayName: string }>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const form = new FormData(event.currentTarget);
      await mutate(`/api/v1/workflow/artifacts/${artifactId}/assign-owner`, {
        ownerMembershipId: form.get("ownerMembershipId"),
        reason: form.get("reason"),
      });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <details className="border-border mt-3 border-t pt-3">
      <summary className="cursor-pointer text-xs font-semibold">
        Assign correction owner
      </summary>
      <form className="mt-3 grid gap-3" onSubmit={submit}>
        <label className="grid gap-2 text-xs font-medium">
          Owner
          <select
            className="border-input bg-background h-9 rounded-md border px-2"
            name="ownerMembershipId"
            required
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </select>
        </label>
        <Field label="Assignment reason" name="reason" />
        <Button disabled={pending} type="submit" variant="outline">
          {pending ? "Assigning…" : "Assign owner"}
        </Button>
        {error ? (
          <p className="text-destructive text-xs" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </details>
  );
}

export function ArtifactReviewActions({
  artifactId,
  artifactVersionId,
  locked,
  published,
}: {
  artifactId: string;
  artifactVersionId: string;
  locked: boolean;
  published: boolean;
}) {
  if (published) {
    return <p className="text-success mt-3 text-xs font-bold">Published</p>;
  }
  return (
    <div className="mt-3">
      <MutationButton
        endpoint={`/api/v1/workflow/artifacts/${artifactId}/versions/${artifactVersionId}/${locked ? "publish" : "approve"}`}
        label={locked ? "Publish approved correction" : "Approve correction"}
        variant={locked ? "default" : "outline"}
      />
    </div>
  );
}
