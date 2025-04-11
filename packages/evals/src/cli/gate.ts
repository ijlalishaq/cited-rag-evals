// pnpm gate --report ../../evals-out/smoke.json --baseline baselines/smoke-offline.json [--max-drop 2] [--update]
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { compare } from "../gate.js";
import type { EvalReport } from "../run.js";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    report: { type: "string" },
    baseline: { type: "string", default: "baselines/smoke-offline.json" },
    "max-drop": { type: "string", default: "2" },
    update: { type: "boolean", default: false },
  },
});
if (!values.report) throw new Error("--report is required");

const report = JSON.parse(await readFile(values.report, "utf8")) as EvalReport;
if (values.update) {
  const { results: _results, ...summary } = report;
  await writeFile(values.baseline, JSON.stringify(summary, null, 2) + "\n");
  console.log(`Baseline updated: ${values.baseline}`);
  process.exit(0);
}

const baseline = JSON.parse(await readFile(values.baseline, "utf8")) as Omit<EvalReport, "results">;
const rows = compare(baseline.metrics, report.metrics, Number(values["max-drop"]));
const f = (x: number) => (Number.isNaN(x) ? "n/a" : (x * 100).toFixed(1));
console.log("| Metric | Baseline | Current | Δ points | |\n| --- | --- | --- | --- | --- |");
for (const r of rows) {
  console.log(`| ${r.metric} | ${f(r.baseline)} | ${f(r.current)} | ${r.deltaPoints.toFixed(1)} | ${r.failed ? "FAIL" : "ok"} |`);
}
const failed = rows.filter((r) => r.failed);
if (failed.length) {
  console.error(`\nQuality gate failed: ${failed.map((r) => r.metric).join(", ")} dropped more than ${values["max-drop"]} points.`);
  process.exit(1);
}
console.log("\nQuality gate passed.");
