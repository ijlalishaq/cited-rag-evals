import { chatModel, contentTerms, createVerifier, generateStructured, llmSettingsFromEnv, type ChatModel, type Verifier } from "@cre/rag";
import { z } from "zod";

/** Grades a system answer against the gold reference answer. */
export interface CorrectnessJudge {
  readonly name: string;
  isCorrect(question: string, reference: string, answer: string): Promise<boolean>;
}

const JUDGE_SYSTEM = `You grade answers to questions about the Node.js documentation.
Compare the candidate answer with the reference answer.
The candidate is correct if it states the key facts of the reference and contradicts none of them.
Extra correct detail is fine. Missing the key fact, or a wrong number, is incorrect.`;

const VerdictSchema = z.object({ reasoning: z.string(), correct: z.boolean() });

export class LlmCorrectnessJudge implements CorrectnessJudge {
  constructor(
    private readonly model: ChatModel,
    readonly name: string,
  ) {}

  async isCorrect(question: string, reference: string, answer: string): Promise<boolean> {
    const prompt = `Question: ${question}\n\nReference answer: ${reference}\n\nCandidate answer: ${answer}`;
    try {
      const { object } = await generateStructured(this.model, VerdictSchema, JUDGE_SYSTEM, prompt);
      return object.correct;
    } catch (err) {
      console.warn(`judge: ${String(err)}`);
      return false;
    }
  }
}

/** Offline judge: the answer must contain at least half of the reference's content words. */
export class OverlapCorrectnessJudge implements CorrectnessJudge {
  readonly name = "overlap";

  async isCorrect(_question: string, reference: string, answer: string): Promise<boolean> {
    const ref = [...new Set(contentTerms(reference))];
    const got = new Set(contentTerms(answer));
    return ref.length > 0 && ref.filter((t) => got.has(t)).length / ref.length >= 0.5;
  }
}

export interface Judges {
  correctness: CorrectnessJudge;
  /** Re-checks citations independently of the pipeline's own verifier. */
  citations: Verifier;
}

export function createJudges(): Judges {
  const s = llmSettingsFromEnv();
  if (s.provider === "offline") return { correctness: new OverlapCorrectnessJudge(), citations: createVerifier("judge") };
  const model = chatModel(s.provider, s.judgeModel);
  return { correctness: new LlmCorrectnessJudge(model, `${s.provider}:${s.judgeModel}`), citations: createVerifier("judge") };
}
