import "server-only";

import OpenAI from "openai";

import { requireEnv } from "@/lib/env/server";

let client: OpenAI | undefined;

export function getOpenAIClient(): OpenAI {
  client ??= new OpenAI({
    apiKey: requireEnv("OPENAI_API_KEY"),
    maxRetries: 0,
    timeout: 120_000,
  });

  return client;
}
