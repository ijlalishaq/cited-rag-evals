// Tiny, dependency-free text utilities shared by BM25, the offline embedder and the offline judge.

const STOPWORDS = new Set(
  (
    "a an and are as at be been but by can could did do does for from has have how if in into is it its " +
    "of on or should so than that the their them then there these they this to was what when where which " +
    "while who why will with would you your i we our not no yes using use used"
  ).split(" "),
);

/** Lowercased alphanumeric terms. `fs.readFileSync()` -> ["fs", "readfilesync"]. */
export function terms(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/** Terms without stopwords: the words that carry meaning for matching. */
export function contentTerms(text: string): string[] {
  return terms(text).filter((t) => !STOPWORDS.has(t));
}

/**
 * Rough token count. Real tokenizers average about 0.75 words per token for English prose,
 * so whitespace words * 4/3 is close enough for sizing chunks without loading a tokenizer.
 */
export function approxTokens(text: string): number {
  const words = text.match(/\S+/g)?.length ?? 0;
  return Math.ceil((words * 4) / 3);
}

/** Splits prose into sentences. Good enough for docs; not a full sentence boundary detector. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z`[(])|\n{2,}/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
}

/** Case- and whitespace-insensitive form used for substring checks in evals. */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}
