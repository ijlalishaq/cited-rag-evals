// pnpm --filter @cre/evals ablate [--subset smoke|all]
// Runs the same gold set through several pipeline variants so each component's effect is measured.
import { parseArgs } from "node:util";
import { createPipeline, INDEX_PATH, SearchIndex, type RetrievalMode } from "@cre/rag";
import { loadGold } from "../gold.js";
import { createJudges } from "../judge.js";
import type { Metric } from "../metrics.js";
import { runEval } from "../run.js";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    gold: { type: "string", default: "gold/gold.jsonl" },
    subset: { type: "string", default: "all" },
    reranker: { type: "string", default: process.env.RERANKER || "offline" },
  },
});
const subset = values.subset === "smoke" ? "smoke" : "all";
const gold = await loadGold(values.gold, subset);
const index = await SearchIndex.load(INDEX_PATH);
const judges = createJudges();

const variants: { label: string; mode: RetrievalMode; reranker: string; verify: boolean }[] = [
  { label: "dense", mode: "dense", reranker: "none", verify: true },
  { label: "bm25", mode: "bm25", reranker: "none", verify: true },
  { label: "hybrid", mode: "hybrid", reranker: "none", verify: true },
  { label: "hybrid + rerank", mode: "hybrid", reranker: values.reranker, verify: true },
  { label: "hybrid + rerank, no verify", mode: "hybrid", reranker: values.reranker, verify: false },
];

const pct = (m: Metric) => (Number.isNaN(m.value) ? "n/a" : (m.value * 100).toFixed(1));
console.log("| Variant | Recall@5 | MRR | Cit. precision | Cit. recall | Correct | Refusal acc. | False refusal | p95 ms |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const v of variants) {
  const pipeline = createPipeline(index, { mode: v.mode, reranker: v.reranker, verify: v.verify });
  const { metrics: m } = await runEval({ pipeline, judges, gold, goldFile: values.gold, subset, label: v.label });
  console.log(
    `| ${v.label} | ${pct(m["recall@5"])} | ${pct(m.mrr)} | ${pct(m.citationPrecision)} | ${pct(m.citationRecall)} | ` +
      `${pct(m.answerCorrectness)} | ${pct(m.refusalAccuracy)} | ${pct(m.falseRefusalRate)} | ${m.latencyP95Ms.toFixed(0)} |`,
  );
}
