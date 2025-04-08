// pnpm ingest [--corpus dir] [--max-tokens 400] [--overlap 50] [--out path]
import { parseArgs } from "node:util";
import { createEmbedder } from "../embedders.js";
import { buildIndex, loadCorpus } from "../ingest.js";
import { CORPUS_DIR, INDEX_PATH } from "../paths.js";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    corpus: { type: "string", default: CORPUS_DIR },
    out: { type: "string", default: INDEX_PATH },
    "max-tokens": { type: "string", default: "400" },
    overlap: { type: "string", default: "50" },
  },
});

const cfg = { maxTokens: Number(values["max-tokens"]), overlapTokens: Number(values.overlap) };
const t0 = performance.now();
const chunks = await loadCorpus(values.corpus, cfg);
const docs = new Set(chunks.map((c) => c.docId)).size;
const sections = new Set(chunks.map((c) => c.id.split(":").slice(0, 2).join(":"))).size;
console.log(`Chunked ${docs} docs into ${sections} sections and ${chunks.length} chunks`);

const embedder = createEmbedder();
const progress = (n: number) => process.stdout.isTTY && process.stdout.write(`\rEmbedded ${n}/${chunks.length}`);
const index = await buildIndex(chunks, embedder, cfg, progress);
await index.save(values.out);
console.log(`\nSaved ${values.out} (${embedder.name}) in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
