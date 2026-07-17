import { Buffer } from "node:buffer";
import { extname } from "node:path";

import JSZip from "jszip";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

import { AppError } from "@/lib/errors/app-error";

export const supportedUploadMimeTypes = [
  "text/plain",
  "text/markdown",
  "text/html",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export type SupportedUploadMimeType = (typeof supportedUploadMimeTypes)[number];

export type ParsedDocument = {
  content: string;
  detectedMimeType: SupportedUploadMimeType;
  parserName: string;
  parserVersion: string;
  pageCount: number | null;
  warnings: Array<{ code: string; message: string }>;
  manifest: Record<string, unknown>;
};

const extensionsByMime: Record<SupportedUploadMimeType, readonly string[]> = {
  "text/plain": [".txt"],
  "text/markdown": [".md", ".markdown"],
  "text/html": [".html", ".htm"],
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
};

export async function validateFileIdentity({
  filename,
  declaredMimeType,
  bytes,
}: {
  filename: string;
  declaredMimeType: string;
  bytes: Uint8Array;
}): Promise<SupportedUploadMimeType> {
  const normalizedDeclared = declaredMimeType
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (
    !supportedUploadMimeTypes.includes(
      normalizedDeclared as SupportedUploadMimeType,
    )
  ) {
    throw validationError("This file type is not supported.");
  }
  const declared = normalizedDeclared as SupportedUploadMimeType;
  let detected: SupportedUploadMimeType;
  const startsWith = (...values: number[]) =>
    values.every((value, index) => bytes[index] === value);

  if (startsWith(0x25, 0x50, 0x44, 0x46, 0x2d)) {
    detected = "application/pdf";
  } else if (startsWith(0x50, 0x4b)) {
    let archive: JSZip;
    try {
      archive = await JSZip.loadAsync(bytes);
    } catch (error) {
      throw new AppError({
        code: "VALIDATION_FAILED",
        message: "The Office document container is invalid.",
        status: 422,
        cause: error,
      });
    }
    if (archive.file("word/document.xml")) {
      detected =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else if (archive.file("xl/workbook.xml")) {
      detected =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    } else {
      throw validationError(
        "Only DOCX and XLSX Office containers are supported.",
      );
    }
  } else {
    if (bytes.subarray(0, Math.min(bytes.length, 8_192)).includes(0)) {
      throw validationError("The uploaded text file contains binary data.");
    }
    detected = declared.startsWith("text/") ? declared : "text/plain";
  }

  if (declared !== detected) {
    throw validationError(
      "The declared MIME type does not match the detected file type.",
    );
  }
  if (!extensionsByMime[detected].includes(extname(filename).toLowerCase())) {
    throw validationError(
      "The filename extension does not match the detected file type.",
    );
  }
  return detected;
}

export const detectDocumentType = (
  bytes: Uint8Array,
  filename: string,
  declaredMimeType: string,
) => validateFileIdentity({ bytes, filename, declaredMimeType });

export async function parseDocument({
  bytes,
  filename,
  declaredMimeType,
}: {
  bytes: Uint8Array;
  filename: string;
  declaredMimeType: string;
}): Promise<ParsedDocument> {
  const mimeType = await validateFileIdentity({
    filename,
    declaredMimeType,
    bytes,
  });

  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    const content = decodeUtf8(bytes);
    return nativeResult(content, mimeType, "supersede-native-text");
  }
  if (mimeType === "text/html") {
    const html = decodeUtf8(bytes);
    const content = html
      .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p\s*>/gi, "\n\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return nativeResult(content, mimeType, "supersede-html-text");
  }
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return {
      ...nativeResult(result.value, mimeType, "mammoth"),
      parserVersion: "1.12.0",
      warnings: result.messages.map((message) => ({
        code: message.type,
        message: message.message,
      })),
      manifest: { parser: "mammoth", layoutPreservation: "paragraphs" },
    };
  }
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
    const sheets = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      return `# Sheet: ${name}\n${sheet ? XLSX.utils.sheet_to_csv(sheet) : ""}`;
    });
    return {
      ...nativeResult(sheets.join("\n\n"), mimeType, "sheetjs"),
      parserVersion: "0.18.5",
      pageCount: workbook.SheetNames.length,
      manifest: {
        parser: "sheetjs",
        sheets: workbook.SheetNames,
        formulaEvaluation: false,
      },
    };
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({
    data: bytes,
    stopAtErrors: true,
    useWorkerFetch: false,
    useWasm: false,
  }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const pageText = await page.getTextContent();
    const content = pageText.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(`\n\n--- Page ${pageNumber} ---\n\n${content}`);
  }
  const content = pages.join("").trim();
  if (content.replace(/--- Page \d+ ---/g, "").trim().length < 20) {
    throw validationError(
      "This PDF appears image-only. OCR is not enabled; upload a text PDF or paste the text.",
    );
  }
  return {
    content,
    detectedMimeType: mimeType,
    parserName: "pdfjs-dist",
    parserVersion: "6.1.200",
    pageCount: document.numPages,
    warnings: [],
    manifest: {
      parser: "pdfjs-dist",
      pageMarkers: true,
      coordinateDetail: "page",
    },
  };
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "The text document is not valid UTF-8.",
      status: 422,
      cause: error,
    });
  }
}

function nativeResult(
  content: string,
  mimeType: SupportedUploadMimeType,
  parserName: string,
): ParsedDocument {
  if (content.trim().length < 20) {
    throw validationError(
      "The parsed document does not contain enough readable text.",
    );
  }
  return {
    content,
    detectedMimeType: mimeType,
    parserName,
    parserVersion: "1.0.0",
    pageCount: null,
    warnings: [],
    manifest: { parser: parserName },
  };
}

function validationError(message: string): AppError {
  return new AppError({
    code: "VALIDATION_FAILED",
    message,
    status: 422,
  });
}
