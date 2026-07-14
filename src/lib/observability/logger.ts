import "server-only";

import pino from "pino";

import { getServerEnv } from "@/lib/env/server";

export const logger = pino({
  base: { service: "supersede-web" },
  level: getServerEnv().LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "request.headers.authorization",
      "request.headers.cookie",
      "email",
      "probeAnswer",
      "documentText",
      "signedUrl",
      "token",
      "accessToken",
      "refreshToken",
    ],
    censor: "[REDACTED]",
  },
});
