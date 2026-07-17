import { describe, expect, it } from "vitest";

import { estimateOpenAiCostMinor } from "@/modules/ai/cost";

describe("OpenAI cost accounting", () => {
  it("uses the approved GPT-5.6 Sol standard rates", () => {
    expect(estimateOpenAiCostMinor("gpt-5.6", 100_000, 100_000)).toBe(350);
  });

  it("applies the Sol long-context multiplier", () => {
    expect(estimateOpenAiCostMinor("gpt-5.6-sol", 300_000, 10_000)).toBe(345);
  });

  it("rejects an unpriced model so budgets cannot silently undercount", () => {
    expect(() => estimateOpenAiCostMinor("unknown", 100, 100)).toThrow(
      "No approved cost rate",
    );
  });
});
