import { createHash } from "node:crypto";

export type TextChunk = {
  position: number;
  content: string;
  contentSha256: string;
  startOffset: number;
  endOffset: number;
};

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function chunkText(
  content: string,
  options: { maxCharacters?: number; overlapCharacters?: number } = {},
): TextChunk[] {
  const maxCharacters = options.maxCharacters ?? 1_600;
  const overlapCharacters = options.overlapCharacters ?? 200;
  if (
    maxCharacters < 200 ||
    overlapCharacters < 0 ||
    overlapCharacters >= maxCharacters
  ) {
    throw new RangeError("Chunk size and overlap are invalid.");
  }

  const chunks: TextChunk[] = [];
  let startOffset = 0;
  while (startOffset < content.length) {
    let endOffset = Math.min(content.length, startOffset + maxCharacters);
    if (endOffset < content.length) {
      const breakAt = Math.max(
        content.lastIndexOf("\n\n", endOffset),
        content.lastIndexOf("\n", endOffset),
        content.lastIndexOf(" ", endOffset),
      );
      if (breakAt > startOffset + Math.floor(maxCharacters * 0.6)) {
        endOffset = breakAt + 1;
      }
    }

    const chunkContent = content.slice(startOffset, endOffset);
    chunks.push({
      position: chunks.length,
      content: chunkContent,
      contentSha256: sha256(chunkContent),
      startOffset,
      endOffset,
    });

    if (endOffset === content.length) break;
    startOffset = Math.max(startOffset + 1, endOffset - overlapCharacters);
  }
  return chunks;
}
