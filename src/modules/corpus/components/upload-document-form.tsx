"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { artifactKinds, sourceKinds } from "@/modules/corpus/contracts";

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; message: string }
  | { status: "error"; message: string }
  | { status: "success"; message: string; objectPath: string };

type Problem = { title?: string; detail?: string };

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & Problem;
  if (!response.ok) {
    throw new Error(
      body.detail || body.title || "The upload could not be completed.",
    );
  }
  return body;
}

function inferMimeType(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return (
    {
      txt: "text/plain",
      md: "text/markdown",
      markdown: "text/markdown",
      html: "text/html",
      htm: "text/html",
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }[extension ?? ""] ?? "application/octet-stream"
  );
}

export function UploadDocumentForm({
  corpora,
  curatedDemoUploads,
}: {
  corpora: Array<{ id: string; name: string }>;
  curatedDemoUploads: boolean;
}) {
  const [documentType, setDocumentType] = useState<"source" | "artifact">(
    "source",
  );
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const selectClass =
    "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm focus-visible:ring-3 focus-visible:outline-none";

  async function submit(formData: FormData) {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setState({ status: "error", message: "Choose a document to upload." });
      return;
    }
    try {
      setState({ status: "uploading", message: "Verifying document…" });
      const digest = await sha256(file);
      const session = await responseJson<{
        uploadSessionId: string;
        uploadUrl: string;
        requiredHeaders: Record<string, string>;
      }>(
        await fetch("/api/v1/uploads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            mimeType: inferMimeType(file),
            sizeBytes: file.size,
            sha256: digest,
            idempotencyKey: crypto.randomUUID(),
          }),
        }),
      );

      setState({ status: "uploading", message: "Uploading securely…" });
      const storageResponse = await fetch(session.uploadUrl, {
        method: "PUT",
        headers: session.requiredHeaders,
        body: file,
      });
      if (!storageResponse.ok) {
        throw new Error(
          "Private storage rejected the upload. Check storage CORS configuration.",
        );
      }

      setState({ status: "uploading", message: "Extracting and indexing…" });
      const result = await responseJson<{
        objectPath: string;
        duplicate: boolean;
      }>(
        await fetch(`/api/v1/uploads/${session.uploadSessionId}/complete`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            corpusId: formData.get("corpusId"),
            documentType,
            sourceKind:
              documentType === "source" ? formData.get("kind") : undefined,
            artifactKind:
              documentType === "artifact" ? formData.get("kind") : undefined,
            title: formData.get("title"),
            externalReference: formData.get("externalReference") || undefined,
            versionLabel: formData.get("versionLabel"),
            effectiveAt: `${String(formData.get("effectiveAt"))}T00:00:00.000Z`,
            curatedDemoAcknowledged: curatedDemoUploads,
          }),
        }),
      );
      setState({
        status: "success",
        message: result.duplicate
          ? "Document linked using an existing verified extraction."
          : "Document uploaded, extracted, and indexed.",
        objectPath: result.objectPath,
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "The upload failed.",
      });
    }
  }

  return (
    <form action={submit} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="upload-corpus">Corpus</Label>
          <select id="upload-corpus" name="corpusId" className={selectClass}>
            {corpora.map((corpus) => (
              <option key={corpus.id} value={corpus.id}>
                {corpus.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="upload-object-type">Governed object</Label>
          <select
            id="upload-object-type"
            name="documentType"
            className={selectClass}
            value={documentType}
            onChange={(event) =>
              setDocumentType(event.target.value as "source" | "artifact")
            }
          >
            <option value="source">Authoritative source</option>
            <option value="artifact">Downstream artifact</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="upload-kind">Kind</Label>
          <select id="upload-kind" name="kind" className={selectClass}>
            {(documentType === "source" ? sourceKinds : artifactKinds).map(
              (kind) => (
                <option key={kind} value={kind}>
                  {kind.replaceAll("_", " ")}
                </option>
              ),
            )}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="upload-title">Title</Label>
          <Input id="upload-title" name="title" required minLength={2} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="upload-version">Version label</Label>
          <Input
            id="upload-version"
            name="versionLabel"
            required
            placeholder="2026.1"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="upload-effective">Effective date</Label>
          <Input
            id="upload-effective"
            name="effectiveAt"
            type="date"
            required
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="upload-reference">
            Canonical or external reference
          </Label>
          <Input
            id="upload-reference"
            name="externalReference"
            placeholder="Optional stable identifier or URL"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="upload-file">Document</Label>
          <Input
            id="upload-file"
            name="file"
            type="file"
            required
            accept=".txt,.md,.markdown,.html,.htm,.pdf,.docx,.xlsx"
            disabled={!curatedDemoUploads || state.status === "uploading"}
          />
          <p className="text-muted-foreground text-xs">
            TXT, Markdown, HTML, PDF, DOCX, or XLSX. Image-only PDFs require OCR
            before upload.
          </p>
        </div>
      </div>
      {!curatedDemoUploads ? (
        <p role="alert" className="text-destructive text-sm">
          File promotion is disabled until a malware scanner is configured.
          Paste exact text below in the meantime.
        </p>
      ) : null}
      {state.status !== "idle" ? (
        <div
          role={state.status === "error" ? "alert" : "status"}
          aria-live="polite"
          className={
            state.status === "error"
              ? "text-destructive text-sm"
              : "text-muted-foreground text-sm"
          }
        >
          {state.message}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={state.status === "uploading" || !curatedDemoUploads}
        >
          {state.status === "uploading" ? "Processing…" : "Upload document"}
        </Button>
        {state.status === "success" ? (
          <Button asChild variant="outline">
            <Link href={state.objectPath}>Open record</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
