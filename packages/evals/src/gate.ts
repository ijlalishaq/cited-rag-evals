import type { Metric, Metrics } from "./metrics.js";

/** Metrics the CI gate protects. falseRefusalRate is lower-is-better, the rest higher-is-better. */
export const GATED: { key: keyof Metrics; higherIsBetter: boolean }[] = [
  { key: "recall@5", higherIsBetter: true },
  { key: "citationPrecision", higherIsBetter: true },
  { key: "citationRecall", higherIsBetter: true },
  { key: "answerCorrectness", higherIsBetter: true },
  { key: "refusalAccuracy", higherIsBetter: true },
  { key: "falseRefusalRate", higherIsBetter: false },
];

export interface GateRow {
  metric: string;
  baseline: number;
  current: number;
  /** Change in percentage points, signed so that negative always means worse. */
  deltaPoints: number;
  failed: boolean;
}

export function compare(baseline: Metrics, current: Metrics, maxDropPoints = 2): GateRow[] {
  return GATED.map(({ key, higherIsBetter }) => {
    const b = (baseline[key] as Metric).value;
    const c = (current[key] as Metric).value;
    const delta = Number.isNaN(b) || Number.isNaN(c) ? 0 : (c - b) * 100 * (higherIsBetter ? 1 : -1);
    return { metric: key, baseline: b, current: c, deltaPoints: delta, failed: delta < -maxDropPoints };
  });
}
