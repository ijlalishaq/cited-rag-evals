import { describe, expect, it } from "vitest";
import { candidateWindows, LexicalVerifier } from "../src/verify.js";

describe("LexicalVerifier", () => {
  const source = "By default, a maximum of `10` listeners can be registered for any single event.";

  it("accepts a sentence grounded in the source", async () => {
    const { supported } = await new LexicalVerifier().check([{ id: 0, sentence: "A maximum of 10 listeners can be registered per event by default.", source }]);
    expect(supported).toEqual([true]);
  });

  it("rejects an invented number even when the words overlap", async () => {
    const { supported } = await new LexicalVerifier().check([{ id: 0, sentence: "A maximum of 20 listeners can be registered for any single event.", source }]);
    expect(supported).toEqual([false]);
  });
});

describe("candidateWindows", () => {
  it("returns short windows, the ones sharing most words with the claim first", () => {
    const source = "Alpha is a letter. The default timeout is 5000 ms. Gamma rays are light. Delta is a river mouth.";
    const windows = candidateWindows(source, "The default timeout is 5000 ms.", 2);
    expect(windows[0]).toBe("The default timeout is 5000 ms.");
    expect(windows).toHaveLength(2);
    expect(windows.every((w) => w.split(". ").length <= 2)).toBe(true);
  });
});
