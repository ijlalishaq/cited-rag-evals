import { readdir, readFile } from "node:fs/promises";
import { extname, join, basename } from "node:path";
import { chunkDocument, DEFAULT_CHUNK_CONFIG, htmlToText, indexText } from "./chunk.js";
import type { Embedder } from "./embedders.js";
import { SearchIndex } from "./store.js";
import type { Chunk, ChunkConfig } from "./types.js";

/** Reads .md, .html and .txt files and chunks them. The file name (without extension) is the doc ID. */
export async function loadCorpus(dir: string, cfg: ChunkConfig = DEFAULT_CHUNK_CONFIG): Promise<Chunk[]> {
  const files = (await readdir(dir)).filter((f) => [".md", ".html", ".htm", ".txt"].includes(extname(f))).sort();
  const chunks: Chunk[] = [];
  for (const f of files) {
    const raw = await readFile(join(dir, f), "utf8");
    const docId = basename(f, extname(f));
    const md = extname(f).startsWith(".htm") ? htmlToText(raw) : raw;
    chunks.push(...chunkDocument(docId, md, cfg));
  }
  return chunks;
}

export async function buildIndex(chunks: Chunk[], embedder: Embedder, cfg: ChunkConfig, onProgress?: (done: number) => void) {
  const vectors: Float32Array[] = [];
  for (let i = 0; i < chunks.length; i += 64) {
    vectors.push(...(await embedder.embed(chunks.slice(i, i + 64).map(indexText), "passage")));
    onProgress?.(vectors.length);
  }
  return new SearchIndex(chunks, vectors, embedder.name, cfg);
}
