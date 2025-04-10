import type { EvalReport } from "./run.js";
import type { Metric, Metrics } from "./metrics.js";

const pct = (x: number) => (Number.isNaN(x) ? "n/a" : `${(x * 100).toFixed(1)}%`);

function cell(m: Metric): string {
  return Number.isNaN(m.value) ? "n/a" : `${pct(m.value)} [${pct(m.ci[0])}, ${pct(m.ci[1])}] (n=${m.n})`;
}

export const HEADLINE: (keyof Metrics)[] = [
  "recall@5",
  "mrr",
  "citationPrecision",
  "draftCitationPrecision",
  "citationRecall",
  "answerCorrectness",
  "refusalAccuracy",
  "falseRefusalRate",
];

export function toMarkdown(r: EvalReport): string {
  const lines = [
    `## Eval: ${r.label}`,
    "",
    `Gold: \`${r.goldFile}\` (${r.subset}, ${r.results.length} questions) · git ${r.gitSha ?? "?"} · ${r.createdAt}`,
    "",
    `Pipeline: mode=${r.config.mode}, reranker=${r.config.components.reranker ?? "none"}, embedder=${r.config.components.embedder}, ` +
      `generator=${r.config.components.generator}, verifier=${r.config.components.verifier}, keep=${r.config.keep}, ` +
      `abstainThreshold=${r.config.abstainThreshold}`,
    `Judges: correctness=${r.judges.correctness}, citations=${r.judges.citations}`,
    "",
    "| Metric | Value [95% CI] |",
    "| --- | --- |",
    ...HEADLINE.map((k) => `| ${k} | ${cell(r.metrics[k] as Metric)} |`),
    `| latency p50 / p95 | ${r.metrics.latencyP50Ms.toFixed(0)} ms / ${r.metrics.latencyP95Ms.toFixed(0)} ms |`,
    `| mean tokens / query | ${r.metrics.meanTokens.toFixed(0)} |`,
    "",
  ];
  const failures = r.results.filter((x) => (x.answerable ? x.correct === false || (x.recallAt?.[5] ?? 1) < 1 : !x.abstained));
  if (failures.length) {
    lines.push("### Failures", "", "| id | type | recall@5 | abstained | answer |", "| --- | --- | --- | --- | --- |");
    for (const f of failures) {
      const ans = f.answer.replace(/\|/g, "\\|").slice(0, 120) || "—";
      lines.push(`| ${f.id} | ${f.type} | ${f.recallAt ? pct(f.recallAt[5]!) : "—"} | ${f.abstained ? f.abstainReason : "no"} | ${ans} |`);
    }
  }
  return lines.join("\n") + "\n";
}
