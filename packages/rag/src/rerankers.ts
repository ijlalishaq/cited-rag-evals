import { indexText } from "./chunk.js";
import { contentTerms } from "./tokenize.js";
import type { Chunk } from "./types.js";

/**
 * A reranker scores (query, passage) pairs jointly. A cross-encoder reads both texts in one
 * forward pass, so it sees word-level interactions an embedder (which encodes each side
 * separately) cannot. It is too slow to run on the whole corpus, so it reorders the top ~30
 * candidates from first-stage retrieval. Scores are in [0, 1] so one abstention threshold works.
 */
export interface Reranker {
  readonly name: string;
  score(query: string, chunks: Chunk[]): Promise<number[]>;
}

/** Offline reranker: share of the query's content words found in the passage. */
export class OverlapReranker implements Reranker {
  readonly name = "overlap";

  async score(query: string, chunks: Chunk[]): Promise<number[]> {
    const q = [...new Set(contentTerms(query))];
    if (q.length === 0) return chunks.map(() => 0);
    return chunks.map((c) => {
      const words = new Set(contentTerms(indexText(c)));
      return q.filter((t) => words.has(t)).length / q.length;
    });
  }
}

/**
 * Cross-encoder via transformers.js; logits are squashed with a sigmoid. The default is
 * MiniLM-L6 trained on MS MARCO (~90 MB, 22M parameters), small enough to rerank 30
 * candidates on a laptop CPU in about two seconds.
 */
export class CrossEncoderReranker implements Reranker {
  readonly name: string;
  private loaded?: Promise<{ tokenizer: CallableFunction; model: CallableFunction }>;

  constructor(private readonly model = "Xenova/ms-marco-MiniLM-L-6-v2") {
    this.name = model;
  }

  private load() {
    this.loaded ??= import("@huggingface/transformers").then(async (t) => ({
      tokenizer: (await t.AutoTokenizer.from_pretrained(this.model)) as unknown as CallableFunction,
      model: (await t.AutoModelForSequenceClassification.from_pretrained(this.model)) as unknown as CallableFunction,
    }));
    return this.loaded;
  }

  async score(query: string, chunks: Chunk[]): Promise<number[]> {
    if (chunks.length === 0) return [];
    const { tokenizer, model } = await this.load();
    const inputs = tokenizer(
      chunks.map(() => query),
      { text_pair: chunks.map(indexText), padding: true, truncation: true },
    );
    const { logits } = (await model(inputs)) as { logits: { tolist(): number[][] } };
    return logits.tolist().map(([x]) => 1 / (1 + Math.exp(-(x ?? 0))));
  }
}

export function createReranker(kind = process.env.RERANKER ?? "offline"): Reranker | null {
  if (kind === "none") return null;
  if (kind === "offline") return new OverlapReranker();
  if (kind === "local") return new CrossEncoderReranker(process.env.RERANKER_MODEL);
  throw new Error(`Unknown RERANKER "${kind}" (expected offline | local | none)`);
}
