import "server-only";

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";

import { getWorkingStorageClient } from "@/lib/storage/clients";
import { requireEnv } from "@/lib/env/server";
import { AppError } from "@/lib/errors/app-error";
import {
  MAX_UPLOAD_BYTES,
  parseUploadedDocument,
  validateUploadMetadata,
} from "@/modules/corpus";

const filenameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(
    (value) => !/[\0/\\]/.test(value),
    "Filename contains invalid characters.",
  );

export const signCorpusUploadRequestSchema = z.object({
  filename: filenameSchema,
  mimeType: z.string().trim().min(1).max(255),
  byteSize: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export const signCorpusUploadResponseSchema = z.object({
  objectKey: z.string(),
  uploadUrl: z.string().url(),
  expiresInSeconds: z.number().int().positive(),
  requiredHeaders: z.record(z.string(), z.string()),
  maximumBytes: z.number().int().positive(),
});

export const parseCorpusUploadRequestSchema = z.object({
  objectKey: z.string().min(1).max(512),
  filename: filenameSchema,
  mimeType: z.string().trim().min(1).max(255),
});

export const parsedCorpusUploadSchema = z.object({
  kind: z.enum(["text", "markdown", "html", "docx", "xlsx", "text_pdf"]),
  sha256: z.string(),
  byteSize: z.number().int().positive(),
  extractedText: z.string(),
  warnings: z.array(z.string()),
  metadata: z.object({
    filename: z.string(),
    mimeType: z.string(),
    parserVersion: z.literal("corpus_parser_v1"),
  }),
});

export async function signCorpusUpload(input: {
  organizationId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
}) {
  try {
    validateUploadMetadata(input);
  } catch (error) {
    throw invalidUpload(error);
  }

  const extension = input.filename.split(".").pop()?.toLowerCase() ?? "bin";
  const objectKey = `${tenantPrefix(input.organizationId)}${crypto.randomUUID()}.${extension}`;
  const command = new PutObjectCommand({
    Bucket: requireEnv("R2_BUCKET"),
    Key: objectKey,
    ContentType: input.mimeType,
    ContentLength: input.byteSize,
    Metadata: {
      "supersede-organization-id": input.organizationId,
      "supersede-original-filename": encodeURIComponent(input.filename),
    },
  });
  const expiresInSeconds = 300;
  const uploadUrl = await getSignedUrl(getWorkingStorageClient(), command, {
    expiresIn: expiresInSeconds,
  });
  if (
    !new URL(uploadUrl).searchParams
      .get("X-Amz-SignedHeaders")
      ?.split(";")
      .includes("content-length")
  ) {
    throw new Error("Object upload URL is missing its signed size constraint.");
  }

  return {
    objectKey,
    uploadUrl,
    expiresInSeconds,
    requiredHeaders: {
      "content-type": input.mimeType,
    },
    maximumBytes: MAX_UPLOAD_BYTES,
  };
}

export async function parseCorpusUpload(input: {
  organizationId: string;
  objectKey: string;
  filename: string;
  mimeType: string;
}) {
  if (!input.objectKey.startsWith(tenantPrefix(input.organizationId))) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "The uploaded object does not belong to this organization.",
      status: 403,
    });
  }

  const response = await getWorkingStorageClient().send(
    new GetObjectCommand({
      Bucket: requireEnv("R2_BUCKET"),
      Key: input.objectKey,
    }),
  );
  const contentLength = response.ContentLength ?? 0;
  if (contentLength < 1 || contentLength > MAX_UPLOAD_BYTES) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: `Uploaded files must be between 1 byte and ${MAX_UPLOAD_BYTES} bytes.`,
      status: 422,
    });
  }
  if (!response.Body) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "The uploaded object has no readable body.",
      status: 422,
    });
  }

  const bytes = await response.Body.transformToByteArray();
  try {
    return await parseUploadedDocument({
      filename: input.filename,
      mimeType: input.mimeType,
      bytes,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Upload parsing failed.";
    const ocrUnsupported = message.includes("require OCR");
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: ocrUnsupported
        ? "OCR not supported yet. Upload a text-based PDF."
        : message,
      status: 422,
      cause: error,
    });
  }
}

function tenantPrefix(organizationId: string) {
  return `organizations/${organizationId}/corpus/`;
}

function invalidUpload(error: unknown) {
  return new AppError({
    code: "VALIDATION_FAILED",
    message: error instanceof Error ? error.message : "Upload is invalid.",
    status: 422,
    cause: error,
  });
}
