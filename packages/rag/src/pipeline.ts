import type { Embedder } from "./embedders.js";
import type { Generator, Passage } from "./generate.js";
import { addUsage } from "./llm.js";
import type { Reranker } from "./rerankers.js";
import { retrieve, type RetrieveOptions } from "./retrieve.js";
import type { SearchIndex } from "./store.js";
import type { CitedSentence, RetrievalMode, Usage } from "./types.js";
import type { Claim, Verifier } from "./verify.js";

export interface PipelineConfig extends RetrieveOptions {
  /** Abstain when the best rerank score is below this. Only applies when a reranker runs. */
  abstainThreshold: number;
  /** Skip verification (for ablations that measure what it buys). */
  verify: boolean;
  /**
   * Small models often write a correct sentence and forget its source numbers. When set, such
   * a sentence is checked against every passage and keeps the ones that support it
   * (post-hoc attribution). The draft metrics still count it as uncited.
   */
  attributeUncited: boolean;
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  mode: "hybrid",
  candidates: 30,
  keep: 6,
  abstainThreshold: 0.4,
  verify: true,
  attributeUncited: true,
};

export type AbstainReason = "low_retrieval_score" | "model_declined" | "nothing_verified";

export interface RagAnswer {
  question: string;
  abstained: boolean;
  abstainReason?: AbstainReason;
  /** What the user sees: verified sentences with the chunk IDs that support them. */
  sentences: CitedSentence[];
  /** Sentences the verifier removed, kept for debugging and the failure gallery. */
  dropped: CitedSentence[];
  /** The generator's output before verification, with chunk IDs instead of numbers. */
  draft: CitedSentence[];
  /** Passages shown to the generator, numbered as the model saw them. */
  sources: { n: number; chunkId: string; title: string; section: string; text: string }[];
  /** Full ranked candidate list (IDs and scores), used for Recall@k. */
  retrieved: { chunkId: string; score: number; rerankScore?: number }[];
  topScore: number | null;
  timings: { retrieveMs: number; generateMs: number; verifyMs: number; totalMs: number };
  usage: Usage;
  config: { mode: RetrievalMode; reranker: string | null; embedder: string; generator: string; verifier: string };
}

/** retrieve -> (abstain?) -> generate -> verify -> answer with sources */
export class RagPipeline {
  constructor(
    readonly index: SearchIndex,
    readonly embedder: Embedder,
    readonly reranker: Reranker | null,
    readonly generator: Generator,
    readonly verifier: Verifier,
    readonly config: PipelineConfig = DEFAULT_PIPELINE_CONFIG,
  ) {}

  async answer(question: string): Promise<RagAnswer> {
    const t0 = performance.now();
    const ranked = await retrieve(this.index, this.embedder, this.reranker, question, this.config);
    const t1 = performance.now();

    const passages: Passage[] = ranked.slice(0, this.config.keep).map((r, i) => ({ n: i + 1, chunk: r.chunk }));
    const topScore = this.reranker ? (ranked[0]?.rerankScore ?? 0) : null;
    const base: RagAnswer = {
      question,
      abstained: false,
      sentences: [],
      dropped: [],
      draft: [],
      sources: passages.map(({ n, chunk }) => ({ n, chunkId: chunk.id, title: chunk.title, section: chunk.section, text: chunk.text })),
      retrieved: ranked.map((r) => ({ chunkId: r.chunk.id, score: r.score, rerankScore: r.rerankScore })),
      topScore,
      timings: { retrieveMs: t1 - t0, generateMs: 0, verifyMs: 0, totalMs: t1 - t0 },
      usage: { inputTokens: 0, outputTokens: 0 },
      config: {
        mode: this.config.mode,
        reranker: this.reranker?.name ?? null,
        embedder: this.embedder.name,
        generator: this.generator.name,
        verifier: this.config.verify ? this.verifier.name : "none",
      },
    };

    // Gate 1: weak evidence. Cheaper and safer than asking a model to answer from bad passages.
    if (topScore !== null && topScore < this.config.abstainThreshold) {
      return { ...base, abstained: true, abstainReason: "low_retrieval_score" };
    }

    const draft = await this.generator.generate(question, passages);
    const t2 = performance.now();
    const idFor = (n: number) => passages.find((p) => p.n === n)?.chunk.id;
    const draftSentences = draft.sentences.map((s) => ({
      text: s.text,
      citations: [...new Set(s.sources.map(idFor).filter((id): id is string => id !== undefined))],
    }));
    base.draft = draftSentences;
    base.usage = draft.usage;
    base.timings.generateMs = t2 - t1;

    // Gate 2: the model itself says the sources don't answer the question.
    if (!draft.answerable || draftSentences.length === 0) {
      base.timings.totalMs = t2 - t0;
      return { ...base, abstained: true, abstainReason: "model_declined" };
    }

    if (!this.config.verify) {
      base.timings.totalMs = t2 - t0;
      return { ...base, sentences: draftSentences.filter((s) => s.citations.length > 0) };
    }

    // Gate 3: check every (sentence, cited source) pair; keep only citations that hold up.
    const claims: (Claim & { s: number; chunkId: string })[] = [];
    const everyPassage = passages.map((p) => p.chunk.id);
    draftSentences.forEach((s, si) =>
      (s.citations.length === 0 && this.config.attributeUncited ? everyPassage : s.citations).forEach((chunkId) =>
        claims.push({ id: claims.length, s: si, chunkId, sentence: s.text, source: this.index.get(chunkId)!.text }),
      ),
    );
    const { supported, usage } = await this.verifier.check(claims);
    const t3 = performance.now();

    const sentences: CitedSentence[] = [];
    const dropped: CitedSentence[] = [];
    draftSentences.forEach((s, si) => {
      const ok = claims.filter((c) => c.s === si && supported[c.id]).map((c) => c.chunkId);
      if (ok.length) sentences.push({ text: s.text, citations: ok });
      else dropped.push(s);
    });

    const answer: RagAnswer = {
      ...base,
      sentences,
      dropped,
      usage: addUsage(base.usage, usage),
      timings: { ...base.timings, verifyMs: t3 - t2, totalMs: t3 - t0 },
    };
    return sentences.length ? answer : { ...answer, abstained: true, abstainReason: "nothing_verified" };
  }
}
