import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { BM25 } from "../src/bm25.js";
import { HashEmbedder } from "../src/embedders.js";
import { buildIndex, loadCorpus } from "../src/ingest.js";
import { reciprocalRankFusion } from "../src/rank.js";
import { OverlapReranker } from "../src/rerankers.js";
import { retrieve } from "../src/retrieve.js";
import { SearchIndex } from "../src/store.js";
import { DEFAULT_CHUNK_CONFIG } from "../src/chunk.js";

const FIXTURES = join(import.meta.dirname, "fixtures");

async function fixtureIndex() {
  const chunks = await loadCorpus(FIXTURES);
  return buildIndex(chunks, new HashEmbedder(), DEFAULT_CHUNK_CONFIG);
}

describe("BM25", () => {
  it("ranks the document with the rare query term first", () => {
    const bm = new BM25(["the cat sat", "the dog sat", "the zebra sat"]);
    const s = bm.scores("zebra");
    expect(s[2]).toBeGreaterThan(0);
    expect(s[0]).toBe(0);
  });

  it("weights rare terms above common ones", () => {
    const bm = new BM25(["a the", "a the", "a zebra"]);
    expect(bm.idf("zebra")).toBeGreaterThan(bm.idf("a"));
  });
});

describe("reciprocalRankFusion", () => {
  it("rewards items ranked well in both lists", () => {
    const fused = reciprocalRankFusion([
      ["a", "b", "c"],
      ["b", "c", "a"],
    ]);
    expect(fused[0]!.id).toBe("b");
  });
});

describe("retrieve", () => {
  it("finds the right section in every mode", async () => {
    const index = await fixtureIndex();
    for (const mode of ["dense", "bm25", "hybrid"] as const) {
      const r = await retrieve(index, new HashEmbedder(), null, "default maximum listeners for an event", {
        mode,
        candidates: 5,
        keep: 2,
      });
      expect(r[0]!.chunk.section, mode).toBe("events.defaultMaxListeners");
    }
  });

  it("reranks and exposes rerank scores in [0, 1]", async () => {
    const index = await fixtureIndex();
    const r = await retrieve(index, new HashEmbedder(), new OverlapReranker(), "what happens to setTimeout delay larger than 2147483647", {
      mode: "hybrid",
      candidates: 5,
      keep: 2,
    });
    expect(r[0]!.chunk.section).toContain("setTimeout");
    for (const x of r) expect(x.rerankScore).toBeGreaterThanOrEqual(0);
    expect(r[0]!.rerankScore).toBeLessThanOrEqual(1);
  });
});

describe("SearchIndex", () => {
  it("round-trips through disk", async () => {
    const index = await fixtureIndex();
    const path = join(await mkdtemp(join(tmpdir(), "idx-")), "index.json");
    await index.save(path);
    const loaded = await SearchIndex.load(path);
    expect(loaded.chunks).toEqual(index.chunks);
    expect(Array.from(loaded.vectors[1]!)).toEqual(Array.from(index.vectors[1]!));
    expect(loaded.embedder).toBe("hash-1024");
  });
});
