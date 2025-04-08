/** Indices of the `k` highest scores, best first. */
export function topK(scores: ArrayLike<number>, k: number): number[] {
  return Array.from({ length: scores.length }, (_, i) => i)
    .sort((a, b) => scores[b]! - scores[a]!)
    .slice(0, k);
}

/** Dot product. With unit-length vectors this equals cosine similarity. */
export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

/**
 * Reciprocal Rank Fusion: score(d) = sum over rankings of 1 / (k + rank(d)).
 * It merges rankings using positions only, so it doesn't matter that cosine and BM25
 * scores live on different scales. k = 60 is the value from the original paper.
 */
export function reciprocalRankFusion(rankings: string[][], k = 60): { id: string; score: number }[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1)));
  }
  return [...scores].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
}
