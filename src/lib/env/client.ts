import { z } from "zod";

const clientEnvSchema = z.object({
  appUrl: z.string().url(),
  sentryDsn: z.string().url().optional(),
});

export const clientEnv = clientEnvSchema.parse({
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
});
