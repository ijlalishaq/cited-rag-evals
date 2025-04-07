import { approxTokens } from "./tokenize.js";
import type { Chunk, ChunkConfig } from "./types.js";

export const DEFAULT_CHUNK_CONFIG: ChunkConfig = { maxTokens: 400, overlapTokens: 50 };

interface Section {
  heading: string;
  body: string;
}

/** Removes markup that adds tokens but no meaning: HTML comments, anchors, link reference definitions. */
export function cleanMarkdown(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<a id="[^"]*"><\/a>/g, "")
    .replace(/^\[[^\]]+\]:\s+\S+.*$/gm, "")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/\n{3,}/g, "\n\n");
}

/** Very small HTML-to-text conversion; enough for simple pages. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n: string, t: string) => `\n${"#".repeat(Number(n))} ${t}\n`)
    .replace(/<\/(p|div|li|pre|tr)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Splits Markdown into sections at headings (h1-h4), ignoring `#` lines inside code fences. */
export function splitSections(md: string): { title: string; sections: Section[] } {
  const sections: Section[] = [];
  let title = "";
  let current: Section = { heading: "", body: "" };
  let inFence = false;

  for (const line of md.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const m = !inFence && /^(#{1,4})\s+(.*)$/.exec(line);
    if (m) {
      if (current.heading || current.body.trim()) sections.push(current);
      const heading = m[2]!.replace(/`/g, "").trim();
      if (m[1] === "#" && !title) title = heading;
      current = { heading, body: "" };
    } else {
      current.body += line + "\n";
    }
  }
  if (current.heading || current.body.trim()) sections.push(current);
  return { title, sections };
}

/** Splits on blank lines, but keeps each fenced code block whole. */
export function paragraphs(text: string): string[] {
  const out: string[] = [];
  let buf: string[] = [];
  let inFence = false;
  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === "") {
      if (buf.length) out.push(buf.join("\n").trim());
      buf = [];
    } else buf.push(line);
  }
  if (buf.length) out.push(buf.join("\n").trim());
  return out.filter(Boolean);
}

/**
 * Packs paragraphs into windows of about `maxTokens`, carrying the last `overlapTokens`
 * worth of words into the next window so a fact on a boundary appears whole in one chunk.
 */
export function windowText(text: string, cfg: ChunkConfig): string[] {
  const keepWords = Math.floor((cfg.overlapTokens * 3) / 4);
  const pieceWords = Math.max(1, Math.floor(((cfg.maxTokens - cfg.overlapTokens) * 3) / 4));

  // Paragraphs are the packing unit; a paragraph bigger than a chunk is cut by words.
  const units: string[] = [];
  for (const p of paragraphs(text)) {
    if (approxTokens(p) <= cfg.maxTokens) {
      units.push(p);
      continue;
    }
    const words = p.split(/\s+/);
    for (let i = 0; i < words.length; i += pieceWords) units.push(words.slice(i, i + pieceWords).join(" "));
  }

  const out: string[] = [];
  let buf: string[] = [];
  let fresh = false; // buf holds more than the carried-over overlap
  for (const u of units) {
    if (fresh && approxTokens([...buf, u].join("\n\n")) > cfg.maxTokens) {
      out.push(buf.join("\n\n"));
      const words = buf.join(" ").split(/\s+/);
      buf = keepWords > 0 ? [words.slice(-keepWords).join(" ")] : [];
      fresh = false;
    }
    buf.push(u);
    fresh = true;
  }
  if (fresh) out.push(buf.join("\n\n"));
  return out;
}

/** Turns one document into chunks with stable IDs `docId:section:chunk`. */
export function chunkDocument(docId: string, markdown: string, cfg: ChunkConfig = DEFAULT_CHUNK_CONFIG): Chunk[] {
  const { title, sections } = splitSections(cleanMarkdown(markdown));
  const chunks: Chunk[] = [];
  sections.forEach((s, si) => {
    const body = s.body.trim();
    if (!body) return;
    windowText(body, cfg).forEach((text, ci) => {
      chunks.push({ id: `${docId}:${si}:${ci}`, docId, title: title || docId, section: s.heading || title, text });
    });
  });
  return chunks;
}

/**
 * The text that gets embedded and keyword-indexed. Prefixing the title and section
 * ("contextual header") lets a chunk that only says "Returns a string" still match
 * a question about `path.basename`.
 */
export function indexText(c: Chunk): string {
  return `${c.title} > ${c.section}\n${c.text}`;
}
