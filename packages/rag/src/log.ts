import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { RagAnswer } from "./pipeline.js";
import type { Usage } from "./types.js";

/** USD cost from token counts, if per-million-token prices are configured. */
export function estimateCost(usage: Usage, env = process.env): number | null {
  const pin = Number(env.PRICE_INPUT_PER_MTOK);
  const pout = Number(env.PRICE_OUTPUT_PER_MTOK);
  if (!pin || !pout) return null;
  return (usage.inputTokens * pin + usage.outputTokens * pout) / 1e6;
}

/** One JSON line per query: enough to replay, debug and chart latency and cost later. */
export async function logQuery(path: string, a: RagAnswer): Promise<void> {
  const line = {
    at: new Date().toISOString(),
    question: a.question,
    abstained: a.abstained,
    abstainReason: a.abstainReason,
    answer: a.sentences,
    dropped: a.dropped.length,
    retrieved: a.retrieved.slice(0, 10),
    topScore: a.topScore,
    timings: a.timings,
    usage: a.usage,
    costUsd: estimateCost(a.usage),
    config: a.config,
  };
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, JSON.stringify(line) + "\n");
}
