import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Usage } from "./types.js";

/**
 * Where the language model runs. Everything here is free and local:
 * - offline: no model at all (extractive generator + lexical checks), for tests and CI
 * - local:   a small instruct model run in-process on the CPU with transformers.js (ONNX)
 * - ollama:  any model you have pulled into a local Ollama server
 */
export type Provider = "offline" | "local" | "ollama";

export interface LlmSettings {
  provider: Provider;
  generatorModel: string;
  /** Judging with a different model than the one that generated reduces self-preference bias. */
  judgeModel: string;
}

/**
 * The smallest interface the pipeline needs from a model: a system prompt and a user prompt
 * in, text out. `schema` is a hint for backends that can constrain output to JSON Schema.
 */
export interface ChatModel {
  readonly name: string;
  complete(system: string, prompt: string, schema?: object): Promise<{ text: string; usage: Usage }>;
}

// Qwen2.5 1.5B (4-bit, ~1 GB) is about the smallest model that reliably follows the JSON
// format; 0.5B mostly ignores it. Generator and judge share it by default to keep the
// download to one model; set JUDGE_MODEL to something else to reduce self-preference.
const DEFAULT_MODELS: Record<Provider, { generator: string; judge: string }> = {
  offline: { generator: "extractive", judge: "lexical" },
  local: { generator: "onnx-community/Qwen2.5-1.5B-Instruct", judge: "onnx-community/Qwen2.5-1.5B-Instruct" },
  ollama: { generator: "qwen2.5:1.5b", judge: "llama3.2:3b" },
};

export function llmSettingsFromEnv(env = process.env): LlmSettings {
  const provider = (env.LLM_PROVIDER || "offline") as Provider;
  if (!(provider in DEFAULT_MODELS)) {
    throw new Error(`Unknown LLM_PROVIDER "${provider}" (expected offline | local | ollama)`);
  }
  const defaults = DEFAULT_MODELS[provider];
  return {
    provider,
    generatorModel: env.GENERATOR_MODEL || defaults.generator,
    judgeModel: env.JUDGE_MODEL || defaults.judge,
  };
}

const models = new Map<string, ChatModel>();

/** One instance per (provider, model), so the generator, verifier and judge share loaded weights. */
export function chatModel(provider: Provider, modelId: string): ChatModel {
  const key = `${provider}:${modelId}`;
  let m = models.get(key);
  if (!m) {
    if (provider === "local") m = new TransformersChatModel(modelId);
    else if (provider === "ollama") m = new OllamaChatModel(modelId);
    else throw new Error(`No language model for provider "${provider}"`);
    models.set(key, m);
  }
  return m;
}

/**
 * Runs an instruct model in-process with transformers.js (ONNX runtime on the CPU).
 * The weights download once (~1 GB for the default) into the transformers.js cache.
 * Calls are queued: one model instance can only run one generation at a time.
 */
export class TransformersChatModel implements ChatModel {
  readonly name: string;
  private generator?: Promise<CallableFunction & { tokenizer: CallableFunction }>;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly model: string,
    private readonly dtype = process.env.LOCAL_LLM_DTYPE || "q4",
    private readonly maxNewTokens = Number(process.env.LOCAL_LLM_MAX_TOKENS || 400),
  ) {
    this.name = `local:${model}`;
  }

  private load() {
    this.generator ??= import("@huggingface/transformers").then(
      (t) => t.pipeline("text-generation", this.model, { dtype: this.dtype as never }) as never,
    );
    return this.generator;
  }

  complete(system: string, prompt: string): Promise<{ text: string; usage: Usage }> {
    const run = this.queue.then(async () => {
      const generate = await this.load();
      const messages = [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ];
      const out = (await generate(messages, { max_new_tokens: this.maxNewTokens, do_sample: false })) as {
        generated_text: { role: string; content: string }[];
      }[];
      const text = out[0]?.generated_text.at(-1)?.content ?? "";
      // Rough token counts (chars / 4) are enough to compare prompt sizes between configs.
      return { text, usage: { inputTokens: Math.round((system.length + prompt.length) / 4), outputTokens: Math.round(text.length / 4) } };
    });
    this.queue = run.catch(() => {});
    return run;
  }
}

/** Talks to a local Ollama server (https://ollama.com), which can constrain output to a JSON Schema. */
export class OllamaChatModel implements ChatModel {
  readonly name: string;

  constructor(
    private readonly model: string,
    private readonly baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434",
  ) {
    this.name = `ollama:${model}`;
  }

  async complete(system: string, prompt: string, schema?: object): Promise<{ text: string; usage: Usage }> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: schema,
        options: { temperature: 0 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };
    return {
      text: body.message?.content ?? "",
      usage: { inputTokens: body.prompt_eval_count ?? 0, outputTokens: body.eval_count ?? 0 },
    };
  }
}

/**
 * Structured output on a small model: put the JSON Schema at the END of the user prompt
 * (a 1.5B model given several thousand tokens of sources forgets format instructions that
 * sit in the system prompt, and answers in plain prose), parse the reply leniently (code fences and surrounding prose stripped), validate it with Zod, and
 * retry once if the model produced something that doesn't fit. We get typed
 * objects instead of free text, which is what makes each citation machine-checkable.
 */
export async function generateStructured<S extends z.ZodType>(
  model: ChatModel,
  schema: S,
  system: string,
  prompt: string,
  attempts = 2,
): Promise<{ object: z.infer<S>; usage: Usage }> {
  const jsonSchema = zodToJsonSchema(schema, { $refStrategy: "none" });
  const jsonPrompt = `${prompt}

Reply with a single JSON object and nothing else, starting with {. It must match this JSON Schema:
${JSON.stringify(jsonSchema)}`;
  let usage = ZERO_USAGE;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    const result = await model.complete(system, jsonPrompt, jsonSchema);
    usage = addUsage(usage, result.usage);
    try {
      return { object: schema.parse(extractJson(result.text)), usage };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`No valid JSON after ${attempts} attempts: ${String(lastError)}`);
}

/** Pull the outermost JSON object out of a reply that may wrap it in fences or prose. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1]! : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON object in reply");
  return JSON.parse(body.slice(start, end + 1));
}

export const ZERO_USAGE: Usage = { inputTokens: 0, outputTokens: 0 };

export function addUsage(a: Usage, b: Usage): Usage {
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens };
}
