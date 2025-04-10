// pnpm --filter @cre/evals check-gold — every evidence quote must appear in some chunk of the index.
import { INDEX_PATH, SearchIndex } from "@cre/rag";
import { containsEvidence, loadGold } from "../gold.js";

const gold = await loadGold(process.argv[2] ?? "gold/gold.jsonl");
const index = await SearchIndex.load(INDEX_PATH);
let bad = 0;
for (const item of gold) {
  if (item.answerable && item.evidence.length === 0) {
    console.error(`${item.id}: answerable but has no evidence`);
    bad++;
  }
  for (const e of item.evidence) {
    if (!index.chunks.some((c) => containsEvidence(c.text, e))) {
      console.error(`${item.id}: evidence not found in corpus: "${e}"`);
      bad++;
    }
  }
}
const byType = new Map<string, number>();
for (const g of gold) byType.set(g.type, (byType.get(g.type) ?? 0) + 1);
const counts = [...byType].map(([t, n]) => `${t}=${n}`);
console.log(`${gold.length} questions (${gold.filter((g) => g.smoke).length} smoke): ${counts.join(", ")}`);
if (bad) process.exit(1);
console.log("All evidence quotes found.");
