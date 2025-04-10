// pnpm ask "How do I read a file line by line?" [--mode hybrid|dense|bm25] [--reranker offline|local|none]
import { parseArgs } from "node:util";
import { createPipeline } from "../factory.js";
import { logQuery } from "../log.js";
import { INDEX_PATH, QUERY_LOG } from "../paths.js";
import { SearchIndex } from "../store.js";
import type { RetrievalMode } from "../types.js";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  allowPositionals: true,
  options: {
    mode: { type: "string", default: "hybrid" },
    reranker: { type: "string" },
    debug: { type: "boolean", default: false },
  },
});
const question = positionals.join(" ").trim();
if (!question) throw new Error('Usage: pnpm ask "your question"');

const pipeline = createPipeline(await SearchIndex.load(INDEX_PATH), {
  mode: values.mode as RetrievalMode,
  reranker: values.reranker,
});
const a = await pipeline.answer(question);
await logQuery(QUERY_LOG, a);

if (a.abstained) {
  console.log(`I can't find this in the documentation. (${a.abstainReason})`);
} else {
  const used = [...new Set(a.sentences.flatMap((s) => s.citations))];
  for (const s of a.sentences) console.log(`${s.text} ${s.citations.map((c) => `[${used.indexOf(c) + 1}]`).join("")}`);
  console.log("\nSources:");
  used.forEach((id, i) => {
    const src = a.sources.find((s) => s.chunkId === id)!;
    console.log(`  [${i + 1}] ${src.title} > ${src.section}  (${id})`);
  });
}
if (values.debug) {
  console.log("\nDropped by verifier:", a.dropped);
  console.log("Top retrieved:", a.retrieved.slice(0, 8));
}
console.log(`\n${a.timings.totalMs.toFixed(0)} ms, ${a.usage.inputTokens}+${a.usage.outputTokens} tokens`);
