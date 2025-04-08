import { contentTerms } from "./tokenize.js";

/**
 * An embedder maps text to a vector so that texts with similar meaning land close together.
 * Queries and passages can be embedded differently (asymmetric retrieval), hence `kind`.
 */
export interface Embedder {
  readonly name: string;
  embed(texts: string[], kind: "query" | "passage"): Promise<Float32Array[]>;
}

function l2normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i]! /= n;
  return v;
}

/** FNV-1a 32-bit hash. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Offline stand-in for a neural embedder: the "hashing trick" over unigrams and bigrams.
 * It only captures word overlap, not meaning ("delete" and "remove" don't match), which is
 * exactly why real systems use neural embeddings. It exists so tests and CI need no downloads.
 */
export class HashEmbedder implements Embedder {
  readonly name: string;
  constructor(private readonly dim = 1024) {
    this.name = `hash-${dim}`;
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map((text) => {
      const v = new Float32Array(this.dim);
      const ts = contentTerms(text);
      const feats = [...ts, ...ts.slice(1).map((t, i) => `${ts[i]}_${t}`)];
      const counts = new Map<string, number>();
      for (const f of feats) counts.set(f, (counts.get(f) ?? 0) + 1);
      for (const [f, c] of counts) {
        const h = fnv1a(f);
        // The sign bit spreads collisions so they cancel out on average instead of piling up.
        v[h % this.dim]! += (h & 0x80000000 ? -1 : 1) * (1 + Math.log(c));
      }
      return l2normalize(v);
    });
  }
}

/**
 * BGE small via transformers.js (ONNX, runs on CPU). Downloads ~130 MB on first use.
 * BGE was trained with an instruction prefix on queries only, so we add it for queries.
 */
export class TransformersEmbedder implements Embedder {
  readonly name: string;
  private extractor?: Promise<(texts: string[], opts: object) => Promise<{ tolist(): number[][] }>>;

  constructor(private readonly model = "Xenova/bge-small-en-v1.5") {
    this.name = model;
  }

  private load() {
    this.extractor ??= import("@huggingface/transformers").then(
      (t) => t.pipeline("feature-extraction", this.model) as never,
    );
    return this.extractor;
  }

  async embed(texts: string[], kind: "query" | "passage"): Promise<Float32Array[]> {
    const extract = await this.load();
    const prefix = kind === "query" ? "Represent this sentence for searching relevant passages: " : "";
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += 32) {
      const batch = texts.slice(i, i + 32).map((t) => prefix + t);
      const tensor = await extract(batch, { pooling: "cls", normalize: true });
      out.push(...tensor.tolist().map((row) => Float32Array.from(row)));
    }
    return out;
  }
}

export function createEmbedder(kind = process.env.EMBEDDER ?? "offline"): Embedder {
  if (kind === "offline") return new HashEmbedder();
  if (kind === "local") return new TransformersEmbedder(process.env.EMBEDDING_MODEL);
  throw new Error(`Unknown EMBEDDER "${kind}" (expected offline | local)`);
}
