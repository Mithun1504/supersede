import { describe, expect, it } from "vitest";

import { aiRunProvenanceSchema } from "@/ai/contracts/provenance";

describe("AI run provenance contract", () => {
  it("requires versioned prompts and source hashes", () => {
    const result = aiRunProvenanceSchema.safeParse({
      provider: "openai",
      model: "gpt-5.6",
      promptVersion: "claim_extraction_v1",
      schemaVersion: "1",
      sourceHashes: ["sha256:fixture"],
      retrievalChunkIds: [],
      latencyMs: 125,
      validated: true,
    });

    expect(result.success).toBe(true);
  });
});
