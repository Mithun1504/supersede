import "server-only";

import { z } from "zod";

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);

const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  NEXT_PUBLIC_APP_URL: optionalUrl.default("http://localhost:3000"),
  DATABASE_URL: optionalUrl,
  DATABASE_RUNTIME_URL: optionalUrl,
  WORKOS_API_KEY: optionalSecret,
  WORKOS_CLIENT_ID: optionalSecret,
  WORKOS_COOKIE_PASSWORD: optionalSecret,
  NEXT_PUBLIC_WORKOS_REDIRECT_URI: optionalUrl,
  R2_ACCOUNT_ID: optionalSecret,
  R2_ACCESS_KEY_ID: optionalSecret,
  R2_SECRET_ACCESS_KEY: optionalSecret,
  R2_BUCKET: optionalSecret,
  R2_ENDPOINT: optionalUrl,
  AWS_REGION: optionalSecret.default("us-east-1"),
  AWS_ACCESS_KEY_ID: optionalSecret,
  AWS_SECRET_ACCESS_KEY: optionalSecret,
  S3_AUDIT_BUCKET: optionalSecret,
  S3_ENDPOINT: optionalUrl,
  OPENAI_API_KEY: optionalSecret,
  OPENAI_PRIMARY_MODEL: optionalSecret.default("gpt-5.6"),
  GEMINI_API_KEY: optionalSecret,
  EMBEDDING_MODEL: optionalSecret.default("gemini-embedding-2"),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(768),
  INNGEST_EVENT_KEY: optionalSecret,
  INNGEST_SIGNING_KEY: optionalSecret,
  POSTMARK_SERVER_TOKEN: optionalSecret,
  POSTMARK_WEBHOOK_SECRET: optionalSecret,
  SENTRY_DSN: optionalUrl,
  SENTRY_AUTH_TOKEN: optionalSecret,
  REPORT_SIGNING_SECRET: optionalSecret,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cachedEnv ??= serverEnvSchema.parse(process.env);
  return cachedEnv;
}

export function isWorkOSConfigured(env = getServerEnv()): boolean {
  return Boolean(
    env.WORKOS_API_KEY &&
    env.WORKOS_CLIENT_ID &&
    env.WORKOS_COOKIE_PASSWORD &&
    env.WORKOS_COOKIE_PASSWORD.length >= 32,
  );
}

export function getConfigurationStatus(env = getServerEnv()) {
  return {
    database: Boolean(env.DATABASE_RUNTIME_URL || env.DATABASE_URL),
    workos: isWorkOSConfigured(env),
    openai: Boolean(env.OPENAI_API_KEY),
    embeddings: Boolean(env.GEMINI_API_KEY),
    workingStorage: Boolean(
      (env.R2_ENDPOINT || env.R2_ACCOUNT_ID) &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET,
    ),
    auditStorage: Boolean(
      env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.S3_AUDIT_BUCKET,
    ),
    inngest: Boolean(env.INNGEST_EVENT_KEY && env.INNGEST_SIGNING_KEY),
    sentry: Boolean(env.SENTRY_DSN),
  } as const;
}

export function requireEnv<K extends keyof ServerEnv>(
  key: K,
): NonNullable<ServerEnv[K]> {
  const value = getServerEnv()[key];

  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value as NonNullable<ServerEnv[K]>;
}
