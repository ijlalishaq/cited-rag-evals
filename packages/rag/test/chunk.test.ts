import { describe, expect, it } from "vitest";
import { chunkDocument, cleanMarkdown, paragraphs, splitSections, windowText } from "../src/chunk.js";
import { approxTokens } from "../src/tokenize.js";

describe("splitSections", () => {
  it("ignores # lines inside code fences", () => {
    const md = "# Title\n\n## A\n\ntext\n\n```sh\n# not a heading\n```\n\n## B\n\nmore";
    const { title, sections } = splitSections(md);
    expect(title).toBe("Title");
    expect(sections.map((s) => s.heading)).toEqual(["Title", "A", "B"]);
    expect(sections[1]!.body).toContain("# not a heading");
  });
});

describe("cleanMarkdown", () => {
  it("drops comments and link references but keeps link text", () => {
    const out = cleanMarkdown("<!-- YAML\nadded: v1\n-->\nUse [`queueMicrotask()`][] instead.\n\n[`queueMicrotask()`]: globals.md#x");
    expect(out).toContain("Use `queueMicrotask()` instead.");
    expect(out).not.toContain("YAML");
    expect(out).not.toContain("globals.md");
  });
});

describe("paragraphs", () => {
  it("keeps a fenced block with blank lines together", () => {
    expect(paragraphs("a\n\n```js\nx\n\ny\n```\n\nb")).toEqual(["a", "```js\nx\n\ny\n```", "b"]);
  });
});

describe("windowText", () => {
  it("respects the size limit and overlaps neighbours", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} ${"word ".repeat(20)}`).join("\n\n");
    const chunks = windowText(text, { maxTokens: 120, overlapTokens: 20 });
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) expect(approxTokens(c)).toBeLessThanOrEqual(150);
    // the tail of chunk 0 starts chunk 1
    const tail = chunks[0]!.split(/\s+/).slice(-5).join(" ");
    expect(chunks[1]!.startsWith(tail) || chunks[1]!.includes(tail)).toBe(true);
  });

  it("splits a single huge paragraph", () => {
    const chunks = windowText("w ".repeat(2000), { maxTokens: 400, overlapTokens: 50 });
    expect(chunks.length).toBeGreaterThan(4);
  });
});

describe("chunkDocument", () => {
  it("assigns stable doc:section:chunk ids", () => {
    const md = "# Path\n\nintro\n\n## path.sep\n\nThe separator.";
    const a = chunkDocument("path", md);
    expect(a.map((c) => c.id)).toEqual(["path:0:0", "path:1:0"]);
    expect(a[1]).toMatchObject({ title: "Path", section: "path.sep", text: "The separator." });
    expect(chunkDocument("path", md)).toEqual(a);
  });
});
