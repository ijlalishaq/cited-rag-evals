import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { BM25 } from "./bm25.js";
import { indexText } from "./chunk.js";
import type { Chunk, ChunkConfig } from "./types.js";

/** On-disk index. Vectors are packed into one base64 Float32 buffer to keep the file compact. */
interface IndexFile {
  version: 1;
  embedder: string;
  dim: number;
  chunkConfig: ChunkConfig;
  createdAt: string;
  chunks: Chunk[];
  vectors: string;
}

/**
 * Everything retrieval needs, held in memory. A few thousand 384-dim vectors is a few MB,
 * so brute-force search is fast and a vector database would be overkill at this size.
 */
export class SearchIndex {
  readonly bm25: BM25;
  private readonly byId: Map<string, number>;

  constructor(
    readonly chunks: Chunk[],
    readonly vectors: Float32Array[],
    readonly embedder: string,
    readonly chunkConfig: ChunkConfig,
  ) {
    this.bm25 = new BM25(chunks.map(indexText));
    this.byId = new Map(chunks.map((c, i) => [c.id, i]));
  }

  get(id: string): Chunk | undefined {
    const i = this.byId.get(id);
    return i === undefined ? undefined : this.chunks[i];
  }

  async save(path: string): Promise<void> {
    const dim = this.vectors[0]?.length ?? 0;
    const packed = new Float32Array(this.vectors.length * dim);
    this.vectors.forEach((v, i) => packed.set(v, i * dim));
    const file: IndexFile = {
      version: 1,
      embedder: this.embedder,
      dim,
      chunkConfig: this.chunkConfig,
      createdAt: new Date().toISOString(),
      chunks: this.chunks,
      vectors: Buffer.from(packed.buffer).toString("base64"),
    };
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(file));
  }

  static async load(path: string): Promise<SearchIndex> {
    const file = JSON.parse(await readFile(path, "utf8")) as IndexFile;
    const buf = Buffer.from(file.vectors, "base64");
    const packed = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    const vectors = file.chunks.map((_, i) => packed.slice(i * file.dim, (i + 1) * file.dim));
    return new SearchIndex(file.chunks, vectors, file.embedder, file.chunkConfig);
  }
}
