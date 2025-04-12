import { createPipeline, logQuery, QUERY_LOG, reflow, SearchIndex, supportingSpan, type RagAnswer, type RagPipeline, type Span } from "@cre/rag";

/** What the browser receives: citations renumbered 1..n in order of first use. */
export interface AskResponse {
  question: string;
  abstained: boolean;
  abstainReason?: string;
  sentences: { text: string; cites: number[] }[];
  sources: { n: number; chunkId: string; title: string; section: string; text: string; highlights: Span[] }[];
  timings: RagAnswer["timings"];
  config: RagAnswer["config"];
}

let pipeline: Promise<RagPipeline> | undefined;

/** Load the index once per server process; it's ~30 MB of JSON. */
export function getPipeline(): Promise<RagPipeline> {
  pipeline ??= SearchIndex.load(process.env.INDEX_PATH ?? `${process.env.REPO_ROOT}/data/index/index.json`).then((index) =>
    createPipeline(index),
  );
  return pipeline;
}

export function toResponse(a: RagAnswer): AskResponse {
  const order: string[] = [];
  for (const s of a.sentences) for (const id of s.citations) if (!order.includes(id)) order.push(id);
  const sources = order.map((chunkId, i) => {
    const src = a.sources.find((s) => s.chunkId === chunkId)!;
    const text = reflow(src.text);
    // Highlight the source sentence that best supports each claim citing this source.
    const highlights = a.sentences
      .filter((s) => s.citations.includes(chunkId))
      .map((s) => supportingSpan(s.text, text))
      .filter((s): s is Span => s !== null);
    return { n: i + 1, chunkId, title: src.title, section: src.section, text, highlights };
  });
  return {
    question: a.question,
    abstained: a.abstained,
    abstainReason: a.abstainReason,
    sentences: a.sentences.map((s) => ({ text: s.text, cites: s.citations.map((id) => order.indexOf(id) + 1) })),
    sources,
    timings: a.timings,
    config: a.config,
  };
}

export async function ask(question: string): Promise<AskResponse> {
  const answer = await (await getPipeline()).answer(question);
  await logQuery(QUERY_LOG, answer).catch(() => {}); // read-only hosts can't write logs; answering matters more
  return toResponse(answer);
}
