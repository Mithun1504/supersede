import "server-only";

import { randomUUID } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getServerEnv, requireEnv } from "@/lib/env/server";
import { AppError } from "@/lib/errors/app-error";
import { getWorkingStorageClient } from "@/lib/storage/clients";

export type StoredObject = {
  provider: "r2" | "minio";
  bucketAlias: string;
  objectKey: string;
};

export function workingStorageLocation(): Pick<
  StoredObject,
  "provider" | "bucketAlias"
> {
  const env = getServerEnv();
  return {
    provider: env.R2_ENDPOINT ? "minio" : "r2",
    bucketAlias: requireEnv("R2_BUCKET"),
  };
}

export async function createQuarantineUploadUrl({
  objectKey,
  mimeType,
  sha256,
}: {
  objectKey: string;
  mimeType: string;
  sha256: string;
}): Promise<{ uploadUrl: string; requiredHeaders: Record<string, string> }> {
  const { bucketAlias } = workingStorageLocation();
  const checksum = Buffer.from(sha256, "hex").toString("base64");
  const command = new PutObjectCommand({
    Bucket: bucketAlias,
    Key: objectKey,
    ContentType: mimeType,
    ChecksumSHA256: checksum,
  });
  try {
    return {
      uploadUrl: await getSignedUrl(getWorkingStorageClient(), command, {
        expiresIn: 15 * 60,
      }),
      requiredHeaders: {
        "content-type": mimeType,
        "x-amz-checksum-sha256": checksum,
      },
    };
  } catch (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "A private upload URL could not be created.",
      status: 503,
      cause: error,
    });
  }
}

export async function readWorkingObject(
  object: StoredObject,
): Promise<Uint8Array> {
  try {
    const response = await getWorkingStorageClient().send(
      new GetObjectCommand({
        Bucket: object.bucketAlias,
        Key: object.objectKey,
      }),
    );
    if (!response.Body) throw new Error("Object body is empty.");
    return response.Body.transformToByteArray();
  } catch (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "The uploaded object could not be read from quarantine.",
      status: 503,
      cause: error,
    });
  }
}

export async function putDerivedText({
  organizationId,
  documentHash,
  content,
}: {
  organizationId: string;
  documentHash: string;
  content: string;
}): Promise<StoredObject> {
  const env = getServerEnv();
  const bucket = requireEnv("R2_BUCKET");
  const objectKey = `${organizationId}/derived/${documentHash.slice(0, 2)}/${documentHash}-${randomUUID()}.txt`;
  try {
    await getWorkingStorageClient().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: Buffer.from(content, "utf8"),
        ContentType: "text/plain; charset=utf-8",
        Metadata: { organization: organizationId, sha256: documentHash },
      }),
    );
  } catch (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Working storage is unavailable. Try again shortly.",
      status: 503,
      cause: error,
    });
  }
  return {
    provider: env.R2_ENDPOINT ? "minio" : "r2",
    bucketAlias: bucket,
    objectKey,
  };
}

export async function deleteWorkingObject(object: StoredObject): Promise<void> {
  try {
    await getWorkingStorageClient().send(
      new DeleteObjectCommand({
        Bucket: object.bucketAlias,
        Key: object.objectKey,
      }),
    );
  } catch {
    // Lifecycle cleanup is the final backstop. Do not hide the primary DB error.
  }
}
