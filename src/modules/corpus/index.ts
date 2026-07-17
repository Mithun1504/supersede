import { createHash } from "node:crypto";

import mammoth from "mammoth";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import readXlsxFile from "read-excel-file/node";

export type SupportedDocumentKind =
  "text" | "markdown" | "html" | "docx" | "xlsx" | "text_pdf";

export type ParsedDocument = {
  kind: SupportedDocumentKind;
  sha256: string;
  byteSize: number;
  extractedText: string;
  warnings: string[];
  metadata: {
    filename: string;
    mimeType: string;
    parserVersion: "corpus_parser_v1";
  };
};

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const mimeKinds: Record<string, SupportedDocumentKind> = {
  "text/plain": "text",
  "text/markdown": "markdown",
  "text/html": "html",
  "application/xhtml+xml": "html",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/pdf": "text_pdf",
};

export async function parseUploadedDocument(input: {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  maxBytes?: number;
}): Promise<ParsedDocument> {
  if (!input.filename.trim()) {
    throw new Error("filename is required");
  }
  const maxBytes = input.maxBytes ?? MAX_UPLOAD_BYTES;
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > maxBytes) {
    throw new Error(`upload must be 1..${maxBytes} bytes`);
  }

  const kind = detectDocumentKind(input.filename, input.mimeType);
  assertSignature(kind, input.bytes);
  const byteSize = input.bytes.byteLength;
  const sha256 = `sha256:${createHash("sha256").update(input.bytes).digest("hex")}`;
  const parsed = await parseBytes(kind, input.bytes);

  return {
    kind,
    sha256,
    byteSize,
    extractedText: parsed.text,
    warnings: parsed.warnings,
    metadata: {
      filename: input.filename,
      mimeType: input.mimeType,
      parserVersion: "corpus_parser_v1",
    },
  };
}

export function validateUploadMetadata(input: {
  filename: string;
  mimeType: string;
  byteSize: number;
}): SupportedDocumentKind {
  if (!input.filename.trim()) {
    throw new Error("filename is required");
  }
  if (!Number.isInteger(input.byteSize) || input.byteSize < 1) {
    throw new Error("upload size must be a positive whole number");
  }
  if (input.byteSize > MAX_UPLOAD_BYTES) {
    throw new Error(`upload exceeds the ${MAX_UPLOAD_BYTES} byte limit`);
  }

  return detectDocumentKind(input.filename, input.mimeType);
}

export function verifyQuotedEvidence(documentText: string, quote: string) {
  const startOffset = documentText.indexOf(quote);
  if (startOffset < 0) {
    return { verified: false as const };
  }

  return {
    verified: true as const,
    startOffset,
    endOffset: startOffset + quote.length,
  };
}

function detectDocumentKind(
  filename: string,
  mimeType: string,
): SupportedDocumentKind {
  const byMime = mimeKinds[mimeType.toLowerCase()];
  if (byMime) return byMime;

  const extension = filename.toLowerCase().split(".").pop();
  if (extension === "txt") return "text";
  if (extension === "md" || extension === "markdown") return "markdown";
  if (extension === "html" || extension === "htm") return "html";
  if (extension === "docx") return "docx";
  if (extension === "xlsx") return "xlsx";
  if (extension === "pdf") return "text_pdf";

  throw new Error(`unsupported upload type: ${mimeType || filename}`);
}

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function parseBytes(kind: SupportedDocumentKind, bytes: Uint8Array) {
  if (kind === "text" || kind === "markdown" || kind === "html") {
    const rawText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return {
      text: kind === "html" ? stripHtml(rawText) : rawText,
      warnings: [] as string[],
    };
  }

  if (kind === "docx") {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return {
      text: normalizeExtractedText(result.value),
      warnings: result.messages.map(
        (message) => `docx:${message.type}:${message.message}`,
      ),
    };
  }

  if (kind === "xlsx") {
    const rows = getXlsxRows(await readXlsxFile(Buffer.from(bytes)));
    return {
      text: rows
        .map((row) =>
          row.map((cell) => (cell === null ? "" : String(cell))).join("\t"),
        )
        .filter(Boolean)
        .join("\n"),
      warnings: [] as string[],
    };
  }

  const text = await extractPdfText(bytes);
  if (!text) {
    throw new Error("image-only or textless PDFs require OCR before ingestion");
  }
  return { text, warnings: [] as string[] };
}

function getXlsxRows(result: unknown): unknown[][] {
  if (!Array.isArray(result)) return [];
  const first = result[0];

  if (
    first &&
    typeof first === "object" &&
    "data" in first &&
    Array.isArray(first.data)
  ) {
    return first.data;
  }

  return result.every(Array.isArray) ? result : [];
}

async function extractPdfText(bytes: Uint8Array) {
  // pdfjs evaluates DOMMatrix at module load. Vercel does not expose that Web
  // API in Node, so load the native server implementation first and keep the
  // heavy PDF runtime out of non-PDF upload/signing routes.
  if (!("DOMMatrix" in globalThis)) {
    const { DOMMatrix } = await import("@napi-rs/canvas");
    Object.defineProperty(globalThis, "DOMMatrix", {
      configurable: true,
      value: DOMMatrix,
      writable: true,
    });
  }
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: bytes,
    useSystemFonts: true,
  });
  const document = await task.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .filter((item): item is TextItem => "str" in item)
          .map((item) => item.str)
          .join(" "),
      );
    }
  } finally {
    await task.destroy();
  }

  return normalizeExtractedText(pages.join("\n"));
}

function assertSignature(kind: SupportedDocumentKind, bytes: Uint8Array) {
  if ((kind === "docx" || kind === "xlsx") && !hasZipSignature(bytes)) {
    throw new Error(`${kind} upload failed ZIP signature check`);
  }
  if (kind === "text_pdf" && !hasPdfSignature(bytes)) {
    throw new Error("PDF upload failed signature check");
  }
}

function hasZipSignature(bytes: Uint8Array) {
  return (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
  );
}

function hasPdfSignature(bytes: Uint8Array) {
  return new TextDecoder("ascii").decode(bytes.slice(0, 5)) === "%PDF-";
}

function normalizeExtractedText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
