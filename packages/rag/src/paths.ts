import { join } from "node:path";

// import.meta.dirname is undefined when a bundler (Next.js) inlines this file; fall back to INDEX_PATH/REPO_ROOT.
const here = import.meta.dirname as string | undefined;
export const REPO_ROOT = process.env.REPO_ROOT ?? (here ? join(here, "..", "..", "..") : process.cwd());
export const CORPUS_DIR = join(REPO_ROOT, "data", "corpus");
export const INDEX_PATH = process.env.INDEX_PATH ?? join(REPO_ROOT, "data", "index", "index.json");
export const QUERY_LOG = process.env.QUERY_LOG ?? join(REPO_ROOT, "data", "logs", "queries.jsonl");
