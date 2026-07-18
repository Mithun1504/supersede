"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  FileSearch,
  LoaderCircle,
  LockKeyhole,
  Quote,
  Sparkles,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfidenceBar, StatusPill } from "@/components/product/status";
import { WorkflowRail } from "@/components/product/product-ui";

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

export function LiveExtractionPanel({
  authenticated,
  organizationReady,
  openAiConfigured,
}: {
  authenticated: boolean;
  organizationReady: boolean;
  openAiConfigured: boolean;
}) {
  const router = useRouter();
  const textId = useId();
  const fileId = useId();
  const [text, setText] = useState("");
  const [result, setResult] = useState<ExtractionResult>();
  const [status, setStatus] = useState<"idle" | "uploading" | "extracting">(
    "idle",
  );
  const [error, setError] = useState<string>();
  const [authExpired, setAuthExpired] = useState(false);

  async function extract(inputText: string, sourceHash?: string) {
    setStatus("extracting");
    setError(undefined);
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
      if (!response.ok)
        throw new Error(body.detail ?? body.title ?? "Extraction failed.");
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
  return (
    <section className="app-surface overflow-hidden">
      <div className="border-border/70 grid gap-5 border-b p-4 sm:p-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-2">
          <p className="text-primary text-xs font-semibold tracking-[0.14em] uppercase">
            Live completion gate
          </p>
          <h2 className="text-xl font-semibold">
            Extract claims from a real source
          </h2>
          <p className="text-muted-foreground text-sm leading-6">
            GPT-5.6 proposes claims with exact quotes. Confidence prioritizes
            review; it never approves a claim.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={fileId}>Or upload a supported file</Label>
          <Input
            id={fileId}
            type="file"
            disabled={busy || !canExtract}
            accept=".txt,.md,.markdown,.html,.htm,.docx,.xlsx,.pdf"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void upload(file);
            }}
          />
          <p className="text-muted-foreground text-xs">
            TXT, Markdown, HTML, DOCX, XLSX, or text PDF · 25 MB maximum
          </p>
        </div>
      </div>
      <div className="border-border/70 bg-muted/15 border-b px-4 py-4 sm:px-6">
        <WorkflowRail
          steps={[
            {
              title: "Upload",
              detail: text ? "Source ready" : "Paste or choose a file",
              state: text
                ? "complete"
                : status === "uploading"
                  ? "current"
                  : "pending",
              icon: Upload,
            },
            {
              title: "Parse",
              detail:
                status === "uploading"
                  ? "Reading source"
                  : text
                    ? "Content available"
                    : "Waiting for source",
              state:
                status === "uploading"
                  ? "current"
                  : text
                    ? "complete"
                    : "pending",
              icon: FileSearch,
            },
            {
              title: "Extract",
              detail:
                status === "extracting"
                  ? "Generating claims"
                  : result
                    ? `${result.claims.length} claims returned`
                    : "Schema-constrained",
              state:
                status === "extracting"
                  ? "current"
                  : result
                    ? "complete"
                    : "pending",
              icon: Sparkles,
            },
            {
              title: "Review",
              detail: result
                ? "Ready for human review"
                : "Human approval required",
              state: result ? "current" : "pending",
              icon: CheckCircle2,
            },
          ]}
        />
      </div>
      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-2">
        <div className="space-y-3">
          {!canExtract ? (
            <ExtractionAccessNotice
              authenticated={authenticated && !authExpired}
              organizationReady={organizationReady}
              openAiConfigured={openAiConfigured}
            />
          ) : null}
          <Label htmlFor={textId}>Protocol text</Label>
          <Textarea
            id={textId}
            value={text}
            disabled={busy || !canExtract}
            onChange={(event) => setText(event.target.value)}
            className="bg-muted/20 min-h-72 resize-y font-mono text-xs leading-6"
          />
          <Button
            disabled={busy || !canExtract || !text.trim()}
            onClick={() => void extract(text)}
          >
            {busy ? (
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Sparkles className="size-4" aria-hidden="true" />
            )}
            {status === "uploading"
              ? "Parsing upload…"
              : status === "extracting"
                ? "Extracting…"
                : "Run live extraction"}
          </Button>
          {error ? (
            <p role="alert" className="text-destructive text-sm leading-6">
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
  organizationReady,
  openAiConfigured,
}: {
  authenticated: boolean;
  organizationReady: boolean;
  openAiConfigured: boolean;
}) {
  let message = "Sign in with WorkOS to extract and persist governed claims.";
  if (authenticated && !organizationReady) {
    message = "Your WorkOS session is not connected to an organization tenant.";
  } else if (authenticated && organizationReady && !openAiConfigured) {
    message =
      "Live extraction requires OPENAI_API_KEY in the server environment.";
  }

  return (
    <div
      className="border-primary/30 bg-primary/5 rounded-xl border p-4"
      role="status"
    >
      <div className="flex items-start gap-3">
        <LockKeyhole
          className="text-primary mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-semibold">Governed action</p>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            {message}
          </p>
          {!authenticated ? (
            <Button asChild className="mt-3">
              <Link href="/sign-in?returnTo=/app/review">
                Sign in to run extraction
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
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
      <div className="border-border bg-muted/20 dot-grid grid min-h-72 place-items-center rounded-xl border border-dashed p-8 text-center">
        <p className="text-muted-foreground max-w-xs text-sm leading-6">
          Live claims, verified quotes, and review priority will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">
          {result.claims.length} extracted claims
        </h3>
        <StatusPill tone="success">
          Live · {result.provenance?.model}
        </StatusPill>
      </div>
      <p className="text-muted-foreground text-xs">
        {result.persistedClaimCount} quote-verified claims added to the governed
        review queue · artifact {result.artifactVersionId.slice(0, 8)}
      </p>
      {result.claims.map((claim, index) => (
        <article
          className="border-border app-surface-interactive rounded-xl border p-4"
          key={`${claim.text}-${index}`}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm leading-6 font-medium">{claim.text}</p>
            <StatusPill
              tone={claim.reviewState === "suggested" ? "plum" : "warning"}
            >
              {claim.reviewState === "suggested"
                ? "Normal review"
                : "Needs attention"}
            </StatusPill>
          </div>
          <div className="mt-3 flex gap-2">
            <Quote
              className="text-primary mt-1 size-4 shrink-0"
              aria-hidden="true"
            />
            <blockquote className="text-muted-foreground text-sm leading-6">
              “{claim.exactQuote}”
            </blockquote>
          </div>
          <div className="mt-3 flex items-center justify-between gap-4">
            <ConfidenceBar value={Math.round(claim.confidence * 100)} />
            <span className="text-muted-foreground text-xs">
              {claim.quoteVerified
                ? "Exact quote verified"
                : "Quote needs verification"}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
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
  if (!response.ok)
    throw new Error(parsed.detail ?? parsed.title ?? "Request failed.");
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
