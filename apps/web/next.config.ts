import { join } from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // @cre/rag ships TypeScript source; let Next compile it.
  transpilePackages: ["@cre/rag"],
  // The repo is linted as a whole with `pnpm lint`.
  eslint: { ignoreDuringBuilds: true },
  // @cre/rag uses NodeNext-style "./x.js" imports for .ts files; map them back to .ts.
  webpack: (cfg, { isServer }) => {
    cfg.resolve.extensionAlias = { ".js": [".ts", ".js"] };
    // Loaded with import() at runtime only when EMBEDDER/RERANKER=local; never bundle the ONNX runtime.
    if (isServer) cfg.externals.push({ "@huggingface/transformers": "import @huggingface/transformers" });
    return cfg;
  },
  env: { REPO_ROOT: process.env.REPO_ROOT ?? join(process.cwd(), "..", "..") },
};

export default config;
