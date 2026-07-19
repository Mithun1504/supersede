import { getGeminiClient } from "@/ai/providers/gemini";
import { getServerEnv } from "@/lib/env/server";

async function main() {
  const env = getServerEnv();
  if (!env.GEMINI_API_KEY) {
    throw new Error(
      "Live embedding is unavailable until Gemini is configured.",
    );
  }
  const response = await getGeminiClient().models.embedContent({
    model: env.EMBEDDING_MODEL,
    contents: [
      "Hold treatment unless the fictional coagulation marker is at least 68.",
    ],
    config: {
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: env.EMBEDDING_DIMENSIONS,
      title: "Supersede live embedding release gate",
    },
  });
  const dimensions = response.embeddings?.[0]?.values?.length ?? 0;
  if (dimensions !== env.EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected ${env.EMBEDDING_DIMENSIONS} embedding dimensions, received ${dimensions}.`,
    );
  }
  console.log(
    JSON.stringify({
      live: true,
      model: env.EMBEDDING_MODEL,
      dimensions,
      taskType: "RETRIEVAL_DOCUMENT",
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Live gate failed.");
  process.exitCode = 1;
});
