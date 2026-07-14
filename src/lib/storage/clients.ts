import "server-only";

import { S3Client } from "@aws-sdk/client-s3";

import { getServerEnv, requireEnv } from "@/lib/env/server";

let workingStorage: S3Client | undefined;
let auditStorage: S3Client | undefined;

export function getWorkingStorageClient(): S3Client {
  const env = getServerEnv();
  const endpoint =
    env.R2_ENDPOINT ??
    `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;

  workingStorage ??= new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
    forcePathStyle: Boolean(env.R2_ENDPOINT),
  });

  return workingStorage;
}

export function getAuditStorageClient(): S3Client {
  const env = getServerEnv();

  auditStorage ??= new S3Client({
    region: env.AWS_REGION,
    ...(env.S3_ENDPOINT
      ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true }
      : {}),
    credentials: {
      accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
    },
  });

  return auditStorage;
}
