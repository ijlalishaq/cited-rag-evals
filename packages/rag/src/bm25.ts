import { terms } from "./tokenize.js";

/**
 * Okapi BM25: a keyword relevance score. For each query term it rewards documents that
 * contain the term (with diminishing returns via k1), weights rare terms higher (IDF),
 * and normalises for document length (b).
 */
export class BM25 {
  private readonly tf: Map<string, number>[] = [];
  private readonly df = new Map<string, number>();
  private readonly lengths: number[] = [];
  private avgLength = 0;

  constructor(
    docs: string[],
    private readonly k1 = 1.2,
    private readonly b = 0.75,
  ) {
    for (const doc of docs) {
      const counts = new Map<string, number>();
      const ts = terms(doc);
      for (const t of ts) counts.set(t, (counts.get(t) ?? 0) + 1);
      for (const t of counts.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      this.tf.push(counts);
      this.lengths.push(ts.length);
    }
    this.avgLength = this.lengths.reduce((a, n) => a + n, 0) / Math.max(1, docs.length);
  }

  idf(term: string): number {
    const n = this.tf.length;
    const df = this.df.get(term) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  /** Scores every document against the query. */
  scores(query: string): Float64Array {
    const out = new Float64Array(this.tf.length);
    const qs = [...new Set(terms(query))];
    for (const q of qs) {
      if (!this.df.has(q)) continue;
      const idf = this.idf(q);
      this.tf.forEach((counts, i) => {
        const f = counts.get(q);
        if (!f) return;
        const norm = 1 - this.b + (this.b * this.lengths[i]!) / this.avgLength;
        out[i]! += (idf * (f * (this.k1 + 1))) / (f + this.k1 * norm);
      });
    }
    return out;
  }
}
