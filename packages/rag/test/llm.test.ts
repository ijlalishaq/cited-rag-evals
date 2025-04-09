import { describe, expect, it } from "vitest";
import { extractJson } from "../src/llm.js";

describe("extractJson", () => {
  it("parses a bare object", () => {
    expect(extractJson('{"ok":true}')).toEqual({ ok: true });
  });

  it("strips code fences and surrounding prose", () => {
    expect(extractJson('Here you go:\n```json\n{"a":[1,2]}\n```\nDone.')).toEqual({ a: [1, 2] });
  });

  it("throws when there is no object", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});
