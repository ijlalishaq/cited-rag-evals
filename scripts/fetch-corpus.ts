// Downloads a slice of the Node.js API docs (MIT licensed) at a pinned tag into data/corpus/.
// Pinning the tag and the page list keeps the corpus, and therefore the gold set and eval
// numbers, reproducible. 17 core pages (~1.4 MB, ~1,900 chunks) are plenty to learn on and
// embed in a minute or two on a laptop CPU. Set NODE_DOCS_PAGES=all to fetch every page.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const TAG = process.env.NODE_DOCS_TAG ?? "v22.11.0";
const BASE = `https://raw.githubusercontent.com/nodejs/node/${TAG}/doc/api`;
const OUT = join(import.meta.dirname, "..", "data", "corpus");

async function get(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.text();
    if (attempt >= 4) throw new Error(`GET ${url} -> ${res.status}`);
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
}

const PAGES = [
  "buffer", "child_process", "cli", "esm", "events", "fs", "globals", "http", "modules",
  "os", "path", "process", "stream", "timers", "util", "worker_threads", "zlib",
];

const files =
  process.env.NODE_DOCS_PAGES === "all"
    ? [...(await get(`${BASE}/index.md`)).matchAll(/\]\(([a-z0-9_-]+\.md)\)/g)].map((m) => m[1]!)
    : PAGES.map((p) => `${p}.md`);
await mkdir(OUT, { recursive: true });

let done = 0;
const queue = [...new Set(files)];
await Promise.all(
  Array.from({ length: 8 }, async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      await writeFile(join(OUT, f), await get(`${BASE}/${f}`));
      done++;
    }
  }),
);
console.log(`Fetched ${done} files from Node.js ${TAG} into ${OUT}`);
