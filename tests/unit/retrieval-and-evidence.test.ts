import { describe, expect, it } from "vitest";

import { verifyExactQuote } from "@/modules/ai/evidence";
import { reciprocalRankFuse } from "@/modules/ai/ranking";

const chunk = (id: string) => ({
  id,
  documentVersionId: "d",
  content: id,
  contentSha256: "a".repeat(64),
  documentContentSha256: "b".repeat(64),
  startOffset: 0,
  endOffset: 1,
  lexicalScore: null,
  semanticScore: null,
});

describe("evidence verification", () => {
  it("returns exact UTF-16 offsets without normalization", () => {
    expect(verifyExactQuote("alpha 🚀 beta", "🚀 beta", 10)).toEqual({
      exact: true,
      startOffset: 16,
      endOffset: 23,
    });
  });
  it("rejects absent and undersized quotes", () => {
    expect(verifyExactQuote("alpha", "alp").exact).toBe(true);
    expect(verifyExactQuote("alpha", "al").exact).toBe(false);
    expect(verifyExactQuote("alpha", "beta").exact).toBe(false);
  });
});

describe("reciprocal rank fusion", () => {
  it("promotes results present in both rankings deterministically", () => {
    const result = reciprocalRankFuse(
      [chunk("lexical"), chunk("both")],
      [chunk("semantic"), chunk("both")],
      3,
    );
    expect(result.map((item) => item.id)).toEqual([
      "both",
      "lexical",
      "semantic",
    ]);
    expect(result.map((item) => item.rank)).toEqual([0, 1, 2]);
  });
});
