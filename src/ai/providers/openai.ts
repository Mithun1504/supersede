import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

import type { AiRunProvenance } from "@/ai/contracts/provenance";
import type { GovernedAiTask } from "@/ai/prompts/governed";
import { getServerEnv, requireEnv } from "@/lib/env/server";
import { AppError } from "@/lib/errors/app-error";

let client: OpenAI | undefined;

export function getOpenAIClient(): OpenAI {
  const apiKey = getServerEnv().OPENAI_API_KEY;
  if (!apiKey) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Live extraction is unavailable until OpenAI is configured.",
      status: 503,
    });
  }

  client ??= new OpenAI({
    apiKey,
    maxRetries: 0,
    timeout: 120_000,
  });

  return client;
}

type RunStructuredAiTaskOptions<T extends z.ZodType> = {
  task: GovernedAiTask<T>;
  input: unknown;
  sourceHashes: string[];
  retrievalChunkIds?: string[];
  model?: string;
  idempotencyKey?: string;
};

export async function runStructuredOpenAiTask<T extends z.ZodType>({
  task,
  input,
  sourceHashes,
  retrievalChunkIds = [],
  model = requireEnv("OPENAI_PRIMARY_MODEL"),
  idempotencyKey,
}: RunStructuredAiTaskOptions<T>): Promise<{
  output: z.output<T>;
  provenance: AiRunProvenance;
}> {
  const startedAt = Date.now();
  const response = await getOpenAIClient().responses.parse(
    {
      model,
      instructions: task.instructions,
      input: JSON.stringify(input),
      text: {
        format: zodTextFormat(task.outputSchema, task.name),
      },
    },
    idempotencyKey
      ? { headers: { "Idempotency-Key": idempotencyKey } }
      : undefined,
  );
  const output = response.output_parsed;

  if (!output) {
    throw new Error(`OpenAI returned no parsed output for ${task.name}`);
  }

  const provenance: AiRunProvenance = {
    provider: "openai",
    model,
    promptVersion: task.promptVersion,
    schemaVersion: task.schemaVersion,
    sourceHashes,
    retrievalChunkIds,
    externalResponseId: response.id,
    latencyMs: Date.now() - startedAt,
    validated: true,
    ...(response.usage?.input_tokens === undefined
      ? {}
      : { inputTokens: response.usage.input_tokens }),
    ...(response.usage?.output_tokens === undefined
      ? {}
      : { outputTokens: response.usage.output_tokens }),
  };

  return {
    output,
    provenance,
  };
}
