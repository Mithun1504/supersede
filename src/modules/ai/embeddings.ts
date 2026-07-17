import "server-only";

import { GoogleGenAI } from "@google/genai";

import { getServerEnv } from "@/lib/env/server";
import { AppError } from "@/lib/errors/app-error";
import { getGeminiClient } from "@/modules/ai/clients";

export type EmbeddingTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export async function embedTexts(
  contents: string[],
  taskType: EmbeddingTask,
  client: GoogleGenAI = getGeminiClient(),
): Promise<number[][]> {
  if (contents.length === 0) return [];
  const env = getServerEnv();
  try {
    const response = await client.models.embedContent({
      model: env.EMBEDDING_MODEL,
      contents,
      config: {
        taskType,
        outputDimensionality: env.EMBEDDING_DIMENSIONS,
        autoTruncate: false,
      },
    });
    const values = response.embeddings?.map((embedding) => embedding.values);
    if (
      !values ||
      values.length !== contents.length ||
      values.some(
        (embedding) =>
          !embedding || embedding.length !== env.EMBEDDING_DIMENSIONS,
      )
    ) {
      throw new Error("Embedding provider returned an unexpected shape.");
    }
    return values as number[][];
  } catch (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Semantic retrieval is temporarily unavailable.",
      status: 503,
      cause: error,
    });
  }
}
