import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CHUNK_CONFIG } from "../src/chunk.js";
import { HashEmbedder } from "../src/embedders.js";
import { ExtractiveGenerator, formatPrompt, type Generator } from "../src/generate.js";
import { buildIndex, loadCorpus } from "../src/ingest.js";
import { ZERO_USAGE } from "../src/llm.js";
import { DEFAULT_PIPELINE_CONFIG, RagPipeline } from "../src/pipeline.js";
import { OverlapReranker } from "../src/rerankers.js";
import { LexicalVerifier } from "../src/verify.js";

const index = await buildIndex(await loadCorpus(join(import.meta.dirname, "fixtures")), new HashEmbedder(), DEFAULT_CHUNK_CONFIG);

function pipeline(generator: Generator = new ExtractiveGenerator()) {
  return new RagPipeline(index, new HashEmbedder(), new OverlapReranker(), generator, new LexicalVerifier(), DEFAULT_PIPELINE_CONFIG);
}

describe("RagPipeline", () => {
  it("answers with verified citations", async () => {
    const a = await pipeline().answer("How many listeners can be registered for a single event by default?");
    expect(a.abstained).toBe(false);
    expect(a.sentences[0]!.text).toContain("maximum of `10` listeners");
    expect(a.sentences[0]!.citations[0]).toMatch(/^events:\d+:\d+$/);
  });

  it("abstains when retrieval is weak", async () => {
    const a = await pipeline().answer("How do I configure a Kubernetes ingress?");
    expect(a).toMatchObject({ abstained: true, abstainReason: "low_retrieval_score" });
  });

  it("drops sentences the cited source does not support", async () => {
    const liar: Generator = {
      name: "liar",
      async generate() {
        return {
          answerable: true,
          sentences: [
            { text: "By default a maximum of 10 listeners can be registered for any single event.", sources: [1] },
            { text: "By default a maximum of 50 listeners can be registered for any single event.", sources: [1] },
            { text: "Kubernetes ingress controllers route external traffic.", sources: [1] },
          ],
          usage: ZERO_USAGE,
        };
      },
    };
    const a = await pipeline(liar).answer("How many listeners can be registered for a single event by default?");
    expect(a.draft).toHaveLength(3);
    expect(a.sentences.map((s) => s.text)).toEqual([
      "By default a maximum of 10 listeners can be registered for any single event.",
    ]);
    expect(a.dropped).toHaveLength(2);
  });

  it("ignores citation numbers that point at no source", async () => {
    const bad: Generator = {
      name: "bad",
      async generate() {
        return { answerable: true, sentences: [{ text: "Something.", sources: [99] }], usage: ZERO_USAGE };
      },
    };
    const a = await pipeline(bad).answer("How many listeners can be registered for a single event by default?");
    expect(a).toMatchObject({ abstained: true, abstainReason: "nothing_verified" });
  });
});

describe("formatPrompt", () => {
  it("wraps sources in tags so document text stays data", () => {
    const p = formatPrompt("q?", [{ n: 1, chunk: index.chunks[0]! }]);
    expect(p).toMatch(/<source id="1" doc="Events" section="[^"]+">/);
    expect(p.trim().endsWith("Question: q?")).toBe(true);
  });
});
