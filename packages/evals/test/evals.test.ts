import { describe, expect, it } from "vitest";
import { compare } from "../src/gate.js";
import { containsEvidence } from "../src/gold.js";
import { aggregate, type QuestionResult } from "../src/metrics.js";
import { bootstrapCI } from "../src/stats.js";

describe("containsEvidence", () => {
  it("ignores markdown emphasis, code ticks, blockquotes and line breaks", () => {
    const chunk = "> Stability: 1.1. Enable this API with the\n> `--experimental-sqlite` CLI flag.\n**Default:** `65536` (64 KiB)";
    expect(containsEvidence(chunk, "Enable this API with the --experimental-sqlite CLI flag")).toBe(true);
    expect(containsEvidence(chunk, "Default: 65536 (64 KiB)")).toBe(true);
    expect(containsEvidence(chunk, "Default: 16384")).toBe(false);
  });
});

describe("bootstrapCI", () => {
  it("is deterministic and brackets the mean", () => {
    const xs = [1, 0, 1, 1, 0, 1, 1, 1, 0, 1];
    const [lo, hi] = bootstrapCI(xs);
    expect(bootstrapCI(xs)).toEqual([lo, hi]);
    expect(lo).toBeLessThan(0.7);
    expect(hi).toBeGreaterThan(0.7);
  });
});

function result(over: Partial<QuestionResult>): QuestionResult {
  return {
    id: "x",
    type: "single-fact",
    question: "q",
    answerable: true,
    abstained: false,
    answer: "a",
    recallAt: { 1: 1, 5: 1, 10: 1, 30: 1 },
    reciprocalRank: 1,
    citationPairs: { supported: 1, total: 1 },
    draftCitationPairs: { supported: 1, total: 2 },
    citedSentences: { supported: 1, total: 1 },
    correct: true,
    latencyMs: 10,
    tokens: 0,
    ...over,
  };
}

describe("aggregate", () => {
  it("separates answerable and unanswerable questions", () => {
    const m = aggregate([
      result({}),
      result({ abstained: true, correct: false, recallAt: { 1: 0, 5: 0.5, 10: 1, 30: 1 }, reciprocalRank: 0.5 }),
      result({ answerable: false, abstained: true, recallAt: null, reciprocalRank: null, correct: null }),
      result({ answerable: false, abstained: false, recallAt: null, reciprocalRank: null, correct: null }),
    ]);
    expect(m["recall@5"].value).toBe(0.75);
    expect(m.answerCorrectness.value).toBe(0.5);
    expect(m.falseRefusalRate.value).toBe(0.5);
    expect(m.refusalAccuracy.value).toBe(0.5);
    expect(m.draftCitationPrecision.value).toBe(0.5);
  });
});

describe("compare (CI gate)", () => {
  const base = aggregate([result({}), result({ correct: false })]);

  it("passes when nothing drops", () => {
    expect(compare(base, base).some((r) => r.failed)).toBe(false);
  });

  it("fails when a metric drops by more than the allowed points", () => {
    const worse = aggregate([result({ correct: false }), result({ correct: false })]);
    const row = compare(base, worse).find((r) => r.metric === "answerCorrectness")!;
    expect(row.deltaPoints).toBeCloseTo(-50);
    expect(row.failed).toBe(true);
  });

  it("treats a rise in false refusals as a drop", () => {
    const refusing = aggregate([result({}), result({ abstained: true, correct: false })]);
    const row = compare(base, refusing).find((r) => r.metric === "falseRefusalRate")!;
    expect(row.failed).toBe(true);
  });
});
