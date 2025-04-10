import type { CitedSentence, RagAnswer, SearchIndex } from "@cre/rag";
import { containsEvidence, type GoldItem } from "./gold.js";
import type { Judges } from "./judge.js";
import { bootstrapCI, mean, percentile } from "./stats.js";

/** Everything we measured for one gold question. Null means "not applicable to this question". */
export interface QuestionResult {
  id: string;
  type: GoldItem["type"];
  question: string;
  answerable: boolean;
  abstained: boolean;
  abstainReason?: string;
  answer: string;
  /** Fraction of evidence quotes found in the top k retrieved chunks. */
  recallAt: Record<number, number> | null;
  /** 1 / rank of the first chunk containing any evidence quote (0 if none in the candidates). */
  reciprocalRank: number | null;
  /** Supported (sentence, citation) pairs / all pairs, for what the user sees. */
  citationPairs: { supported: number; total: number };
  /** Same, for the generator's draft before verification: shows what the verifier buys. */
  draftCitationPairs: { supported: number; total: number };
  /** Displayed sentences with at least one supporting citation / displayed sentences. */
  citedSentences: { supported: number; total: number };
  correct: boolean | null;
  latencyMs: number;
  tokens: number;
}

export const RECALL_KS = [1, 5, 10, 30];

export function retrievalScores(item: GoldItem, answer: RagAnswer, index: SearchIndex) {
  if (!item.answerable || item.evidence.length === 0) return { recallAt: null, reciprocalRank: null };
  const texts = answer.retrieved.map((r) => index.get(r.chunkId)!.text);
  const recallAt: Record<number, number> = {};
  for (const k of RECALL_KS) {
    const top = texts.slice(0, k);
    recallAt[k] = item.evidence.filter((e) => top.some((t) => containsEvidence(t, e))).length / item.evidence.length;
  }
  const first = texts.findIndex((t) => item.evidence.some((e) => containsEvidence(t, e)));
  return { recallAt, reciprocalRank: first === -1 ? 0 : 1 / (first + 1) };
}

async function judgeCitations(sentences: CitedSentence[], index: SearchIndex, judges: Judges) {
  const claims = sentences.flatMap((s, si) =>
    s.citations.map((id) => ({ si, sentence: s.text, source: index.get(id)!.text })),
  );
  const { supported } = await judges.citations.check(claims.map((c, id) => ({ id, sentence: c.sentence, source: c.source })));
  const perSentence = sentences.map((_, si) => claims.some((c, i) => c.si === si && supported[i]));
  return {
    pairs: { supported: supported.filter(Boolean).length, total: claims.length },
    sentences: { supported: perSentence.filter(Boolean).length, total: sentences.length },
  };
}

export async function scoreQuestion(item: GoldItem, answer: RagAnswer, index: SearchIndex, judges: Judges): Promise<QuestionResult> {
  const text = answer.sentences.map((s) => s.text).join(" ");
  const shown = await judgeCitations(answer.sentences, index, judges);
  const draft = await judgeCitations(answer.draft, index, judges);
  let correct: boolean | null = null;
  if (item.answerable && item.answer) {
    correct = !answer.abstained && (await judges.correctness.isCorrect(item.question, item.answer, text));
  }
  return {
    id: item.id,
    type: item.type,
    question: item.question,
    answerable: item.answerable,
    abstained: answer.abstained,
    abstainReason: answer.abstainReason,
    answer: text,
    ...retrievalScores(item, answer, index),
    citationPairs: shown.pairs,
    draftCitationPairs: draft.pairs,
    citedSentences: shown.sentences,
    correct,
    latencyMs: answer.timings.totalMs,
    tokens: answer.usage.inputTokens + answer.usage.outputTokens,
  };
}

export interface Metric {
  value: number;
  ci: [number, number];
  n: number;
}

function metric(xs: number[]): Metric {
  return { value: mean(xs), ci: bootstrapCI(xs), n: xs.length };
}

/** Micro-averaged ratio (sum of numerators / sum of denominators), bootstrapped by question. */
function ratioMetric(parts: { supported: number; total: number }[]): Metric {
  const used = parts.filter((p) => p.total > 0);
  const total = used.reduce((a, p) => a + p.total, 0);
  const value = total ? used.reduce((a, p) => a + p.supported, 0) / total : NaN;
  // Bootstrapping per-question ratios gives a slightly different estimator; fine for an interval.
  return { value, ci: bootstrapCI(used.map((p) => p.supported / p.total)), n: used.length };
}

export function aggregate(results: QuestionResult[]) {
  const answerable = results.filter((r) => r.answerable);
  const unanswerable = results.filter((r) => !r.answerable);
  const withRetrieval = answerable.filter((r) => r.recallAt);
  const recallAt = (k: number) => metric(withRetrieval.map((r) => r.recallAt![k]!));
  const latencies = results.map((r) => r.latencyMs);
  return {
    "recall@1": recallAt(1),
    "recall@5": recallAt(5),
    "recall@10": recallAt(10),
    "recall@30": recallAt(30),
    mrr: metric(withRetrieval.map((r) => r.reciprocalRank!)),
    citationPrecision: ratioMetric(results.map((r) => r.citationPairs)),
    draftCitationPrecision: ratioMetric(results.map((r) => r.draftCitationPairs)),
    citationRecall: ratioMetric(results.map((r) => r.citedSentences)),
    answerCorrectness: metric(answerable.filter((r) => r.correct !== null).map((r) => Number(r.correct))),
    refusalAccuracy: metric(unanswerable.map((r) => Number(r.abstained))),
    falseRefusalRate: metric(answerable.map((r) => Number(r.abstained))),
    latencyP50Ms: percentile(latencies, 50),
    latencyP95Ms: percentile(latencies, 95),
    meanTokens: mean(results.map((r) => r.tokens)),
  };
}

export type Metrics = ReturnType<typeof aggregate>;
