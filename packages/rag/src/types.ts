/** A retrievable unit of text. `id` is stable: `${docId}:${sectionIndex}:${chunkIndex}`. */
export interface Chunk {
  id: string;
  docId: string;
  /** Document title, e.g. "File system". */
  title: string;
  /** Heading of the section the chunk came from, e.g. "fs.readFile(path[, options], callback)". */
  section: string;
  text: string;
}

export interface ChunkConfig {
  /** Target chunk size in approximate tokens. */
  maxTokens: number;
  /** Tokens repeated between neighbouring chunks of the same section. */
  overlapTokens: number;
}

export type RetrievalMode = "dense" | "bm25" | "hybrid";

export interface RetrievedChunk {
  chunk: Chunk;
  /** Score from first-stage retrieval (cosine, BM25 or RRF, depending on mode). */
  score: number;
  /** Cross-encoder score in [0, 1], present when a reranker ran. */
  rerankScore?: number;
}

export interface CitedSentence {
  text: string;
  /** Chunk IDs that support this sentence. */
  citations: string[];
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}
