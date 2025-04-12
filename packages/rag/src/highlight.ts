import { contentTerms } from "./tokenize.js";

export interface Span {
  start: number;
  end: number;
}

/**
 * Joins hard-wrapped Markdown lines into paragraphs for display, leaving code fences,
 * list items, headings, quotes and tables on their own lines.
 */
export function reflow(text: string): string {
  const out: string[] = [];
  let inFence = false;
  for (const line of text.split("\n")) {
    const fence = /^\s*(```|~~~)/.test(line);
    const prev = out[out.length - 1];
    const startsBlock = /^\s*([*+-]\s|\d+\.\s|#|>|\|)/.test(line) || line.trim() === "";
    if (inFence || fence || startsBlock || prev === undefined || prev.trim() === "" || /^\s*(```|~~~)/.test(prev)) {
      out.push(line);
    } else {
      out[out.length - 1] = `${prev} ${line.trim()}`;
    }
    if (fence) inFence = !inFence;
  }
  return out.join("\n");
}

/**
 * Sentence spans (character offsets). A sentence ends at . ! or ? followed by whitespace,
 * or at a blank line; single line breaks (hard wraps) don't end one. Code fences are skipped.
 */
export function sentenceSpans(text: string): Span[] {
  const spans: Span[] = [];
  let start = 0;
  let inFence = false;
  const push = (end: number) => {
    const raw = text.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const body = raw.trim();
    if (body && !inFence && !body.startsWith("```")) spans.push({ start: start + lead, end: start + lead + body.length });
    start = end;
  };
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith("```", i) && (i === 0 || text[i - 1] === "\n")) {
      push(i);
      inFence = !inFence;
      const eol = text.indexOf("\n", i);
      i = eol === -1 ? text.length - 1 : eol;
      if (!inFence) start = i + 1;
      continue;
    }
    if (inFence) continue;
    const c = text[i]!;
    const next = text[i + 1];
    if ((c === "." || c === "!" || c === "?") && (next === undefined || /\s/.test(next))) push(i + 1);
    else if (c === "\n" && (next === "\n" || /^\s*([*+-]\s|\d+\.\s)/.test(text.slice(i + 1, i + 6)))) push(i);
  }
  inFence = false;
  push(text.length);
  return spans;
}

/**
 * Finds the sentence in `source` that best supports `claim`, by share of the claim's content
 * words it contains (FR-11). Returns null when nothing overlaps enough to be worth pointing at.
 */
export function supportingSpan(claim: string, source: string, minOverlap = 0.3): Span | null {
  const want = [...new Set(contentTerms(claim))];
  if (want.length === 0) return null;
  let best: { span: Span; score: number } | null = null;
  for (const span of sentenceSpans(source)) {
    const have = new Set(contentTerms(source.slice(span.start, span.end)));
    const score = want.filter((t) => have.has(t)).length / want.length;
    if (!best || score > best.score) best = { span, score };
  }
  return best && best.score >= minOverlap ? best.span : null;
}
