import { execSync } from "node:child_process";
import type { RagPipeline } from "@cre/rag";
import type { GoldItem } from "./gold.js";
import type { Judges } from "./judge.js";
import { aggregate, scoreQuestion, type Metrics, type QuestionResult } from "./metrics.js";

export interface EvalReport {
  label: string;
  createdAt: string;
  gitSha: string | null;
  goldFile: string;
  subset: string;
  config: RagPipeline["config"] & { components: Record<string, string | null> };
  judges: { correctness: string; citations: string };
  metrics: Metrics;
  results: QuestionResult[];
}

function gitSha(): string | null {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

export async function runEval(opts: {
  pipeline: RagPipeline;
  judges: Judges;
  gold: GoldItem[];
  goldFile: string;
  subset: string;
  label: string;
  onProgress?: (done: number, total: number) => void;
  /** Questions in flight at once; defaults to EVAL_CONCURRENCY or 1. */
  concurrency?: number;
  /** Results from an interrupted run, by gold id; those questions are not asked again. */
  resume?: Map<string, { result: QuestionResult; components: Record<string, string | null> }>;
  /** Called as each new question finishes, e.g. to checkpoint it. */
  onResult?: (result: QuestionResult, components: Record<string, string | null>) => void | Promise<void>;
}): Promise<EvalReport> {
  const { pipeline, judges, gold } = opts;
  const results: QuestionResult[] = new Array(gold.length);
  let components: Record<string, string | null> = {};
  // An Ollama server can serve a few requests at once, so questions can run in parallel. The in-process
  // local model queues its calls anyway, so leave this at 1 for LLM_PROVIDER=local. Results keep gold order.
  const concurrency = Math.max(1, opts.concurrency ?? Number(process.env.EVAL_CONCURRENCY ?? 1));
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < gold.length) {
      const i = next++;
      const item = gold[i]!;
      const cached = opts.resume?.get(item.id);
      if (cached) {
        components = cached.components;
        results[i] = cached.result;
      } else {
        const answer = await pipeline.answer(item.question);
        components = answer.config;
        results[i] = await scoreQuestion(item, answer, pipeline.index, judges);
        await opts.onResult?.(results[i], components);
      }
      opts.onProgress?.(++done, gold.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, gold.length) }, worker));
  return {
    label: opts.label,
    createdAt: new Date().toISOString(),
    gitSha: gitSha(),
    goldFile: opts.goldFile,
    subset: opts.subset,
    config: { ...pipeline.config, components },
    judges: { correctness: judges.correctness.name, citations: judges.citations.name },
    metrics: aggregate(results),
    results,
  };
}
