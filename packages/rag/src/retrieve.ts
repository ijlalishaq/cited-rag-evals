import { dot, reciprocalRankFusion, topK } from "./rank.js";
import type { Embedder } from "./embedders.js";
import type { Reranker } from "./rerankers.js";
import type { SearchIndex } from "./store.js";
import type { RetrievalMode, RetrievedChunk } from "./types.js";

export interface RetrieveOptions {
  mode: RetrievalMode;
  /** How many first-stage candidates go to the reranker. */
  candidates: number;
  /** How many passages are handed to the generator. */
  keep: number;
}

export const DEFAULT_RETRIEVE_OPTIONS: RetrieveOptions = { mode: "hybrid", candidates: 30, keep: 6 };

/**
 * Two-stage retrieval. Stage 1 is cheap and wide (dense, BM25, or both fused with RRF).
 * Stage 2 reranks the candidates with a cross-encoder. Returns the full ranked candidate
 * list; callers take the first `keep` for generation, evals use the rest for Recall@k.
 */
export async function retrieve(
  index: SearchIndex,
  embedder: Embedder,
  reranker: Reranker | null,
  query: string,
  opts: RetrieveOptions = DEFAULT_RETRIEVE_OPTIONS,
): Promise<RetrievedChunk[]> {
  const pool = Math.max(opts.candidates, 50);

  const denseRanking = async () => {
    const [q] = await embedder.embed([query], "query");
    const scores = index.vectors.map((v) => dot(q!, v));
    return topK(scores, pool).map((i) => ({ chunk: index.chunks[i]!, score: scores[i]! }));
  };
  const bm25Ranking = () => {
    const scores = index.bm25.scores(query);
    return topK(scores, pool)
      .filter((i) => scores[i]! > 0)
      .map((i) => ({ chunk: index.chunks[i]!, score: scores[i]! }));
  };

  let ranked: RetrievedChunk[];
  if (opts.mode === "dense") ranked = await denseRanking();
  else if (opts.mode === "bm25") ranked = bm25Ranking();
  else {
    const [dense, bm25] = [await denseRanking(), bm25Ranking()];
    ranked = reciprocalRankFusion([dense.map((r) => r.chunk.id), bm25.map((r) => r.chunk.id)]).map(
      ({ id, score }) => ({ chunk: index.get(id)!, score }),
    );
  }
  ranked = ranked.slice(0, opts.candidates);

  if (!reranker) return ranked;
  const scores = await reranker.score(query, ranked.map((r) => r.chunk));
  return ranked
    .map((r, i) => ({ ...r, rerankScore: scores[i]! }))
    .sort((a, b) => b.rerankScore - a.rerankScore);
}
