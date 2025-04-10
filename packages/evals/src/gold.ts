import { readFile } from "node:fs/promises";
import { z } from "zod";

export const GoldItemSchema = z.object({
  id: z.string(),
  type: z.enum(["single-fact", "numeric", "multi-hop", "unanswerable", "injection"]),
  /** Included in the fast subset CI runs on every pull request. */
  smoke: z.boolean(),
  question: z.string(),
  answerable: z.boolean(),
  /** Reference answer for the correctness judge; null when the system should abstain. */
  answer: z.string().nullable(),
  /**
   * Short quotes from the corpus that a correct answer must rest on. Matching quotes instead
   * of chunk IDs keeps the gold set valid when chunk size or chunk boundaries change.
   */
  evidence: z.array(z.string()),
});
export type GoldItem = z.infer<typeof GoldItemSchema>;

export async function loadGold(path: string, subset: "smoke" | "all" = "all"): Promise<GoldItem[]> {
  const lines = (await readFile(path, "utf8")).split("\n").filter((l) => l.trim());
  const items = lines.map((l, i) => {
    const parsed = GoldItemSchema.safeParse(JSON.parse(l));
    if (!parsed.success) throw new Error(`${path}:${i + 1}: ${parsed.error.message}`);
    return parsed.data;
  });
  const ids = new Set<string>();
  for (const it of items) {
    if (ids.has(it.id)) throw new Error(`Duplicate gold id ${it.id}`);
    ids.add(it.id);
  }
  return subset === "smoke" ? items.filter((i) => i.smoke) : items;
}

/** Normalisation for quote matching: drops Markdown emphasis, code ticks and blockquote markers. */
export function normalizeForMatch(text: string): string {
  return text
    .replace(/^>\s?/gm, "")
    .replace(/[`*_]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function containsEvidence(chunkText: string, evidence: string): boolean {
  return normalizeForMatch(chunkText).includes(normalizeForMatch(evidence));
}
