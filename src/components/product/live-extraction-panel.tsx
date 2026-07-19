"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { ConfidenceBar, StatusPill } from "@/components/product/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ExtractionResult = {
  live: boolean;
  artifactVersionId: string;
  persistedClaimCount: number;
  claims: Array<{
    text: string;
    exactQuote: string;
    confidence: number;
    reviewState: "suggested" | "needs_review";
    quoteVerified: boolean;
  }>;
  provenance?: { model: string; latencyMs: number; validated: boolean };
};

type ExtractionStatus = "idle" | "uploading" | "extracting";

export function LiveExtractionPanel({
  authenticated,
  authenticationAvailable,
  organizationReady,
  openAiConfigured,
}: {
  authenticated: boolean;
  authenticationAvailable: boolean;
  organizationReady: boolean;
  openAiConfigured: boolean;
}) {
  const router = useRouter();
  const textId = useId();
  const fileId = useId();
  const [text, setText] = useState("");
  const [result, setResult] = useState<ExtractionResult>();
  const [status, setStatus] = useState<ExtractionStatus>("idle");
  const [error, setError] = useState<string>();
  const [authExpired, setAuthExpired] = useState(false);

  async function extract(inputText: string, sourceHash?: string) {
    setStatus("extracting");
    setError(undefined);
    setResult(undefined);
    try {
      const hash = sourceHash ?? (await sha256(inputText));
      const response = await fetch("/api/v1/extractions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          documentTitle: "Live protocol extraction",
          sourceHash: hash,
          text: inputText,
          executionMode: "live",
        }),
      });
      const body = (await response.json()) as ExtractionResult & {
        detail?: string;
        title?: string;
      };
      if (response.status === 401) setAuthExpired(true);
      if (!response.ok) {
        throw new Error(body.detail ?? body.title ?? "Extraction failed.");
      }
      setResult(body);
      router.refresh();
    } catch (caught) {
      setResult(undefined);
      setError(messageFrom(caught));
    } finally {
      setStatus("idle");
    }
  }

  async function upload(file: File) {
    setStatus("uploading");
    setError(undefined);
    setResult(undefined);
    try {
      const signed = await requestJson<{
        uploadUrl: string;
        objectKey: string;
        requiredHeaders: Record<string, string>;
      }>("/api/v1/uploads/sign", {
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        byteSize: file.size,
      });
      const stored = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: signed.requiredHeaders,
        body: file,
      });
      if (!stored.ok) throw new Error("Private object upload failed.");
      const parsed = await requestJson<{
        extractedText: string;
        sha256: string;
      }>("/api/v1/uploads/parse", {
        objectKey: signed.objectKey,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
      });
      setText(parsed.extractedText);
      await extract(parsed.extractedText, parsed.sha256);
    } catch (caught) {
      setError(messageFrom(caught));
      setStatus("idle");
    }
  }

  const busy = status !== "idle";
  const canExtract =
    authenticated && organizationReady && openAiConfigured && !authExpired;
  const process = extractionProcess(status, Boolean(text), Boolean(result));

  return (
    <section className="app-surface overflow-hidden" aria-busy={busy}>
      <header className="border-border grid gap-5 border-b px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
        <div>
          <p className="data-label">Live source intake</p>
          <h2 className="mt-2 text-xl font-semibold">
            Add a source to the record
          </h2>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
            Extraction proposes claims and checks their quotes against the
            submitted text. A person still decides whether each claim is fit for
            use.
          </p>
        </div>
        <div>
          <Label htmlFor={fileId}>Upload source file</Label>
          <Input
            id={fileId}
            className="mt-2"
            type="file"
            disabled={busy || !canExtract}
            accept=".txt,.md,.markdown,.html,.htm,.docx,.xlsx,.pdf"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void upload(file);
            }}
          />
          <p className="text-muted-foreground mt-2 text-xs leading-5">
            TXT, Markdown, HTML, DOCX, XLSX, or text PDF · 25 MB maximum
          </p>
        </div>
      </header>

      <ol className="border-border divide-border grid border-b sm:grid-cols-4 sm:divide-x">
        {process.map((step, index) => (
          <li className="flex gap-3 px-4 py-3 sm:block" key={step.label}>
            <span className="text-muted-foreground font-mono text-xs tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 sm:mt-2">
              <p className="text-sm font-semibold">{step.label}</p>
              <p className="text-muted-foreground mt-0.5 text-xs leading-5">
                {step.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {!canExtract ? (
        <ExtractionAccessNotice
          authenticated={authenticated && !authExpired}
          authenticationAvailable={authenticationAvailable}
          organizationReady={organizationReady}
          openAiConfigured={openAiConfigured}
        />
      ) : null}

      <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="border-border min-w-0 p-4 sm:p-6 lg:border-r">
          <Label htmlFor={textId}>Source text</Label>
          <p className="text-muted-foreground mt-1 text-xs leading-5">
            Paste text here, or upload a file to populate this field.
          </p>
          <Textarea
            id={textId}
            value={text}
            disabled={busy || !canExtract}
            onChange={(event) => {
              setText(event.target.value);
              setResult(undefined);
            }}
            className="bg-muted/15 mt-3 field-sizing-fixed max-h-[32rem] min-h-72 resize-y font-mono text-xs leading-6"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              disabled={busy || !canExtract || !text.trim()}
              onClick={() => void extract(text)}
            >
              {busy ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : null}
              {status === "uploading"
                ? "Preparing source…"
                : status === "extracting"
                  ? "Extracting claims…"
                  : "Extract claims"}
            </Button>
            <span className="text-muted-foreground text-xs">
              Live execution · quote-matched claims enter the governed queue
            </span>
          </div>
          {error ? (
            <p role="alert" className="text-destructive mt-3 text-sm leading-6">
              {error}
            </p>
          ) : null}
        </div>
        <ExtractionResults result={result} />
      </div>
    </section>
  );
}

function ExtractionAccessNotice({
  authenticated,
  authenticationAvailable,
  organizationReady,
  openAiConfigured,
}: {
  authenticated: boolean;
  authenticationAvailable: boolean;
  organizationReady: boolean;
  openAiConfigured: boolean;
}) {
  let message = "Sign in with WorkOS to extract and persist governed claims.";
  if (!authenticated && !authenticationAvailable) {
    message =
      "Live source intake is disabled in this public demo. Review the seeded claims below; no sign-in is required.";
  } else if (authenticated && !organizationReady) {
    message = "Your WorkOS session is not connected to an organization tenant.";
  } else if (authenticated && organizationReady && !openAiConfigured) {
    message = "Live extraction requires OPENAI_API_KEY on the server.";
  }

  return (
    <div
      className="border-border bg-muted/20 flex flex-wrap items-center justify-between gap-4 border-b px-4 py-4 sm:px-6"
      role="status"
    >
      <div>
        <p className="text-sm font-semibold">Source intake is restricted</p>
        <p className="text-muted-foreground mt-1 text-sm leading-6">
          {message}
        </p>
      </div>
      {!authenticated && authenticationAvailable ? (
        <Button asChild>
          <Link href="/sign-in?returnTo=/app/review">Sign in to continue</Link>
        </Button>
      ) : null}
    </div>
  );
}

function ExtractionResults({
  result,
}: {
  result: ExtractionResult | undefined;
}) {
  if (!result) {
    return (
      <div className="grid min-h-80 place-items-center p-6 text-center">
        <div className="max-w-sm">
          <p className="text-sm font-semibold">No extraction run yet</p>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            Returned claims will appear with their exact passages, quote check,
            and review-priority signal.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0" aria-live="polite">
      <header className="border-border border-b p-4 sm:p-6">
        <p className="data-label">Latest extraction run</p>
        <h3 className="mt-2 text-lg font-semibold">
          {result.claims.length} proposed claims
        </h3>
        <p className="text-muted-foreground mt-1 text-xs leading-5">
          {result.persistedClaimCount} quote-verified claims added to the review
          queue.
        </p>
        <dl className="text-muted-foreground mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <div className="flex gap-1.5">
            <dt>Execution</dt>
            <dd className="text-foreground font-medium">
              {result.live ? "Live" : "Fallback"}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Model</dt>
            <dd className="text-foreground font-mono">
              {result.provenance?.model ?? "Not reported"}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Artifact</dt>
            <dd className="text-foreground font-mono">
              {result.artifactVersionId.slice(0, 8)}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Output</dt>
            <dd className="text-foreground font-medium">
              {result.provenance?.validated
                ? "Schema validated"
                : "Validation not reported"}
            </dd>
          </div>
        </dl>
      </header>
      <ol className="divide-border divide-y">
        {result.claims.map((claim, index) => (
          <li className="p-4 sm:p-6" key={`${claim.text}-${index}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="max-w-2xl text-sm leading-6 font-semibold">
                {claim.text}
              </p>
              <StatusPill
                tone={claim.reviewState === "suggested" ? "plum" : "warning"}
              >
                {claim.reviewState === "suggested"
                  ? "Normal queue"
                  : "Needs attention"}
              </StatusPill>
            </div>
            <figure className="border-border bg-muted/20 mt-3 border p-3">
              <figcaption className="data-label">Exact passage</figcaption>
              <blockquote className="mt-2 text-sm leading-6">
                “{claim.exactQuote}”
              </blockquote>
            </figure>
            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div>
                <p className="data-label mb-2">Review priority signal</p>
                <ConfidenceBar value={Math.round(claim.confidence * 100)} />
              </div>
              <span
                className={
                  claim.quoteVerified
                    ? "text-success text-xs font-medium"
                    : "text-warning text-xs font-medium"
                }
              >
                {claim.quoteVerified
                  ? "Exact quote verified"
                  : "Not persisted · quote needs verification"}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function extractionProcess(
  status: ExtractionStatus,
  hasText: boolean,
  hasResult: boolean,
) {
  return [
    {
      label: "Source",
      detail: hasText ? "Text ready" : "Paste or upload",
    },
    {
      label: "Prepare",
      detail:
        status === "uploading"
          ? "Parsing file"
          : hasText
            ? "Content available"
            : "Waiting for source",
    },
    {
      label: "Extract",
      detail:
        status === "extracting"
          ? "Live run in progress"
          : hasResult
            ? "Claims returned"
            : "Waiting for source",
    },
    {
      label: "Review",
      detail: hasResult ? "Claims ready to inspect" : "Human decision required",
    },
  ];
}

async function requestJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await response.json()) as T & {
    detail?: string;
    title?: string;
  };
  if (!response.ok) {
    throw new Error(parsed.detail ?? parsed.title ?? "Request failed.");
  }
  return parsed;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "The request failed.";
}
