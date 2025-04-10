// pnpm eval [--subset smoke|all] [--mode hybrid|dense|bm25] [--reranker offline|local|none] [--no-verify] [--label name]
// Finished questions are checkpointed to <out>/<label>.partial.jsonl; rerunning the same label resumes from it.
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createPipeline, INDEX_PATH, REPO_ROOT, SearchIndex, type RetrievalMode } from "@cre/rag";
import { loadGold } from "../gold.js";
import { createJudges } from "../judge.js";
import { toMarkdown } from "../report.js";
import type { QuestionResult } from "../metrics.js";
import { runEval } from "../run.js";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    gold: { type: "string", default: "gold/gold.jsonl" },
    subset: { type: "string", default: "all" },
    mode: { type: "string", default: "hybrid" },
    reranker: { type: "string" },
    "no-verify": { type: "boolean", default: false },
    threshold: { type: "string" },
    label: { type: "string" },
    out: { type: "string", default: join(REPO_ROOT, "evals-out") },
  },
});

const subset = values.subset === "smoke" ? "smoke" : "all";
const gold = await loadGold(values.gold, subset);
const index = await SearchIndex.load(INDEX_PATH);
const pipeline = createPipeline(index, {
  mode: values.mode as RetrievalMode,
  reranker: values.reranker,
  verify: !values["no-verify"],
  ...(values.threshold ? { abstainThreshold: Number(values.threshold) } : {}),
});
const label = values.label ?? `${subset}-${values.mode}`;

await mkdir(values.out, { recursive: true });
type Checkpoint = { result: QuestionResult; components: Record<string, string | null> };
const partialPath = join(values.out, `${label}.partial.jsonl`);
const resume = new Map<string, Checkpoint>();
try {
  for (const line of (await readFile(partialPath, "utf8")).split("\n").filter(Boolean)) {
    const c = JSON.parse(line) as Checkpoint;
    resume.set(c.result.id, c);
  }
  process.stderr.write(`Resuming ${label}: ${resume.size} questions already scored\n`);
} catch {
  // No checkpoint: fresh run.
}

const report = await runEval({
  pipeline,
  judges: createJudges(),
  gold,
  goldFile: values.gold,
  subset,
  label,
  onProgress: (d, t) => process.stderr.write(`\r${d}/${t}`),
  resume,
  onResult: (result, components) => appendFile(partialPath, JSON.stringify({ result, components }) + "\n"),
});
process.stderr.write("\n");

await writeFile(join(values.out, `${label}.json`), JSON.stringify(report, null, 2));
await writeFile(join(values.out, `${label}.md`), toMarkdown(report));
console.log(toMarkdown(report));
await rm(partialPath, { force: true });
console.log(`Wrote ${join(values.out, label)}.{json,md}`);
