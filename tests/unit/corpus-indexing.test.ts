import { describe, expect, it } from "vitest";

import { chunkDocument } from "@/modules/corpus/indexing";

describe("corpus indexing", () => {
  it("creates deterministic overlapping chunks with exact source offsets", () => {
    const source = Array.from(
      { length: 120 },
      (_, index) => `Sentence ${index} preserves threshold ${index}.`,
    ).join(" ");
    const first = chunkDocument(source);
    const second = chunkDocument(source);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(1);
    expect(first.map((chunk) => chunk.ordinal)).toEqual(
      first.map((_, index) => index),
    );
    for (const chunk of first) {
      expect(source.slice(chunk.startOffset, chunk.endOffset).trim()).toBe(
        chunk.text,
      );
      expect(chunk.checksum).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(first[1]!.startOffset).toBeLessThan(first[0]!.endOffset);
  });

  it("does not create searchable records for empty input", () => {
    expect(chunkDocument("  \r\n ")).toEqual([]);
  });
});
