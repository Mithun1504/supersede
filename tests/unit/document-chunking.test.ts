import { describe, expect, it } from "vitest";

import { chunkText, sha256 } from "@/modules/corpus/chunking";

describe("document chunking", () => {
  it("preserves exact source offsets with overlap", () => {
    const content = `${"alpha ".repeat(80)}\n\n${"beta ".repeat(80)}`;
    const chunks = chunkText(content, {
      maxCharacters: 240,
      overlapCharacters: 40,
    });
    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) {
      expect(content.slice(chunk.startOffset, chunk.endOffset)).toBe(
        chunk.content,
      );
      expect(chunk.contentSha256).toBe(sha256(chunk.content));
    }
    expect(chunks[1]!.startOffset).toBeLessThan(chunks[0]!.endOffset);
  });

  it("rejects overlap that cannot make forward progress", () => {
    expect(() =>
      chunkText("content", { maxCharacters: 200, overlapCharacters: 200 }),
    ).toThrow(RangeError);
  });
});
