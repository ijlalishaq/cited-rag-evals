import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { RagAnswer } from "./pipeline.js";

/** One JSON line per query: enough to replay, debug and chart latency later. */
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
    config: a.config,
  };
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, JSON.stringify(line) + "\n");
}
