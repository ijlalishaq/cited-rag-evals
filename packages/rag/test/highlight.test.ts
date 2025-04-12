import { describe, expect, it } from "vitest";
import { reflow, sentenceSpans, supportingSpan } from "../src/highlight.js";

const source =
  "The `node:events` module exposes EventEmitter. By default, a maximum of `10` listeners\ncan be registered for any single event. " +
  "This limit can be changed per instance.\n\n```js\nconst a = 1;\n```\n\n* `n` {integer} A list item";

describe("sentenceSpans", () => {
  it("returns offsets that slice back to sentences", () => {
    const parts = sentenceSpans(source).map((s) => source.slice(s.start, s.end));
    expect(parts).toEqual([
      "The `node:events` module exposes EventEmitter.",
      "By default, a maximum of `10` listeners\ncan be registered for any single event.",
      "This limit can be changed per instance.",
      "* `n` {integer} A list item",
    ]);
  });
});

describe("reflow", () => {
  it("joins hard-wrapped prose but keeps code and list lines", () => {
    expect(reflow("one\ntwo\n\n```js\na\nb\n```\n* x\n* y")).toBe("one two\n\n```js\na\nb\n```\n* x\n* y");
  });
});

describe("supportingSpan", () => {
  it("points at the sentence that supports the claim", () => {
    const span = supportingSpan("At most 10 listeners can be registered for a single event by default.", source)!;
    expect(source.slice(span.start, span.end)).toContain("maximum of `10` listeners");
  });

  it("returns null for an unrelated claim", () => {
    expect(supportingSpan("Kubernetes routes ingress traffic.", source)).toBeNull();
  });
});
