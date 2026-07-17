export type RankedChunk = {
  id: string;
  documentVersionId: string;
  content: string;
  contentSha256: string;
  documentContentSha256: string;
  startOffset: number;
  endOffset: number;
  lexicalScore: number | null;
  semanticScore: number | null;
};

export type FusedRetrievalChunk = RankedChunk & {
  rank: number;
  fusedScore: number;
};

export function reciprocalRankFuse(
  lexical: RankedChunk[],
  semantic: RankedChunk[],
  limit = 16,
  rankConstant = 60,
): FusedRetrievalChunk[] {
  const scores = new Map<string, { chunk: RankedChunk; score: number }>();
  for (const [index, chunk] of lexical.entries()) {
    scores.set(chunk.id, {
      chunk,
      score:
        (scores.get(chunk.id)?.score ?? 0) + 1 / (rankConstant + index + 1),
    });
  }
  for (const [index, chunk] of semantic.entries()) {
    const current = scores.get(chunk.id);
    scores.set(chunk.id, {
      chunk: current?.chunk ?? chunk,
      score: (current?.score ?? 0) + 1 / (rankConstant + index + 1),
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
    .slice(0, limit)
    .map(({ chunk, score }, rank) => ({ ...chunk, rank, fusedScore: score }));
}
