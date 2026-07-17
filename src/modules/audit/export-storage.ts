import "server-only";

import { createHash } from "node:crypto";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { z } from "zod";

import { requireEnv } from "@/lib/env/server";
import {
  getAuditStorageClient,
  getWorkingStorageClient,
} from "@/lib/storage/clients";
import type { AuditExportBundle } from "@/modules/audit/export-bundle";

const storageRequestSchema = z
  .object({
    organizationId: z.uuid(),
    changeEventId: z.uuid(),
    changeEventVersionId: z.uuid().optional(),
    retentionMode: z.enum(["standard", "object_lock"]),
    retainUntil: z.date().optional(),
  })
  .superRefine((value, context) => {
    if (value.retentionMode === "object_lock" && !value.retainUntil) {
      context.addIssue({
        code: "custom",
        path: ["retainUntil"],
        message: "Object Lock exports require a retention deadline.",
      });
    }
    if (value.retainUntil && value.retainUntil <= new Date()) {
      context.addIssue({
        code: "custom",
        path: ["retainUntil"],
        message: "The retention deadline must be in the future.",
      });
    }
  });

export type StoreAuditExportRequest = z.input<typeof storageRequestSchema>;

export async function storeAuditExport(
  bundle: AuditExportBundle,
  rawRequest: StoreAuditExportRequest,
): Promise<{
  bucket: string;
  objectKey: string;
  sha256: string;
  retentionMode: "standard" | "object_lock";
  retainUntil?: string;
}> {
  const request = storageRequestSchema.parse(rawRequest);
  const objectLock = request.retentionMode === "object_lock";
  const bucket = requireEnv(objectLock ? "S3_AUDIT_BUCKET" : "R2_BUCKET");
  const storageClient = objectLock
    ? getAuditStorageClient()
    : getWorkingStorageClient();
  const objectKey = [
    "organizations",
    request.organizationId,
    "changes",
    request.changeEventId,
    ...(request.changeEventVersionId
      ? ["versions", request.changeEventVersionId]
      : []),
    bundle.filename,
  ].join("/");
  const digest = createHash("sha256").update(bundle.bytes).digest();

  await storageClient.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: bundle.bytes,
      ContentLength: bundle.bytes.byteLength,
      ContentType: "application/zip",
      ChecksumSHA256: digest.toString("base64"),
      Metadata: {
        "manifest-schema": String(bundle.manifest.schemaVersion),
        "release-sha": bundle.manifest.releaseSha,
        "template-version": bundle.manifest.templateVersion,
        "retention-mode": request.retentionMode,
      },
      ...(request.retentionMode === "object_lock"
        ? {
            ObjectLockMode: "GOVERNANCE" as const,
            ObjectLockRetainUntilDate: request.retainUntil,
          }
        : {}),
    }),
  );

  return {
    bucket,
    objectKey,
    sha256: digest.toString("hex"),
    retentionMode: request.retentionMode,
    ...(request.retainUntil
      ? { retainUntil: request.retainUntil.toISOString() }
      : {}),
  };
}
