import { createEmbedder } from "./embedders.js";
import { ExtractiveGenerator, LlmGenerator, type Generator } from "./generate.js";
import { chatModel, llmSettingsFromEnv } from "./llm.js";
import { DEFAULT_PIPELINE_CONFIG, RagPipeline, type PipelineConfig } from "./pipeline.js";
import { createReranker } from "./rerankers.js";
import type { SearchIndex } from "./store.js";
import { LexicalVerifier, LlmVerifier, NliVerifier, type Verifier } from "./verify.js";

export function createGenerator(): Generator {
  const s = llmSettingsFromEnv();
  if (s.provider === "offline") return new ExtractiveGenerator();
  return new LlmGenerator(chatModel(s.provider, s.generatorModel), `${s.provider}:${s.generatorModel}`);
}

/**
 * VERIFIER picks how (sentence, source) pairs are checked, both in the pipeline and by the
 * citation judge: lexical (word overlap, no model), nli (DeBERTa NLI cross-encoder, ~70 MB)
 * or llm (ask the chat model). Defaults: lexical when offline, nli otherwise, because a 1.5B
 * chat model rejected almost every correct citation when I tried it as the verifier.
 */
export function createVerifier(role: "verifier" | "judge" = "verifier"): Verifier {
  const s = llmSettingsFromEnv();
  const kind = process.env.VERIFIER || (s.provider === "offline" ? "lexical" : "nli");
  if (kind === "lexical") return new LexicalVerifier();
  if (kind === "nli") return new NliVerifier();
  if (kind !== "llm") throw new Error(`Unknown VERIFIER "${kind}" (expected lexical | nli | llm)`);
  if (s.provider === "offline") throw new Error("VERIFIER=llm needs LLM_PROVIDER=local or ollama");
  const model = role === "judge" ? s.judgeModel : s.generatorModel;
  return new LlmVerifier(chatModel(s.provider, model), `${s.provider}:${model}`);
}

/** Builds a pipeline from environment variables (see .env.example) plus explicit overrides. */
export function createPipeline(index: SearchIndex, overrides: Partial<PipelineConfig> & { reranker?: string } = {}) {
  const { reranker, ...config } = overrides;
  const embedder = createEmbedder();
  if (embedder.name !== index.embedder) {
    throw new Error(`Index was built with "${index.embedder}" but EMBEDDER gives "${embedder.name}". Re-run ingest.`);
  }
  return new RagPipeline(index, embedder, createReranker(reranker), createGenerator(), createVerifier(), {
    ...DEFAULT_PIPELINE_CONFIG,
    ...config,
  });
}
