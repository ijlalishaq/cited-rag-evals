"use client";

import { useState, type FormEvent } from "react";
import type { AskResponse } from "@/lib/answer";

const EXAMPLES = [
  "What is the default highWaterMark for a readable stream?",
  "Why is Buffer.allocUnsafe considered unsafe?",
  "If a variable is in the environment and in --env-file, which wins?",
  "What port does Express listen on by default?",
];

/** Renders `code` spans and strips _emphasis_ / **bold** markers from doc text. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/g).map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 1 ? (
          <code key={i}>{part.slice(1, -1)}</code>
        ) : (
          part.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/(^|\W)_([^_]+)_(?=\W|$)/g, "$1$2")
        ),
      )}
    </>
  );
}

function Highlighted({ text, spans }: { text: string; spans: { start: number; end: number }[] }) {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let at = 0;
  sorted.forEach((s, i) => {
    if (s.start < at) return;
    parts.push(text.slice(at, s.start), <mark key={i}>{text.slice(s.start, s.end)}</mark>);
    at = s.end;
  });
  parts.push(text.slice(at));
  return <pre className="passage">{parts}</pre>;
}

export default function Home() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(q: string, e?: FormEvent) {
    e?.preventDefault();
    if (!q.trim()) return;
    setQuestion(q);
    setLoading(true);
    setError(null);
    setActive(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setResult(data);
      setActive(data.sources[0]?.n ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const source = result?.sources.find((s) => s.n === active);

  return (
    <main>
      <header>
        <h1>Ask the Node.js docs</h1>
        <p className="muted">Every sentence cites a passage that a verifier checked. If the docs don&apos;t say, it says so.</p>
      </header>

      <form onSubmit={(e) => submit(question, e)}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about any Node.js API…"
          aria-label="Question"
          maxLength={500}
        />
        <button disabled={loading || !question.trim()}>{loading ? "Thinking…" : "Ask"}</button>
      </form>
      <div className="examples">
        {EXAMPLES.map((q) => (
          <button key={q} className="chip" onClick={() => submit(q)} disabled={loading}>
            {q}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      {result && (
        <section className="result">
          <div className="answer">
            {result.abstained ? (
              <p className="abstain">
                I can&apos;t find this in the Node.js documentation.
                <span className="muted"> ({result.abstainReason?.replaceAll("_", " ")})</span>
              </p>
            ) : (
              <p>
                {result.sentences.map((s, i) => (
                  <span key={i}>
                    <Inline text={s.text} />
                    {s.cites.map((n) => (
                      <button
                        key={n}
                        className={`cite ${active === n ? "on" : ""}`}
                        onClick={() => setActive(n)}
                        aria-label={`Show source ${n}`}
                      >
                        {n}
                      </button>
                    ))}{" "}
                  </span>
                ))}
              </p>
            )}
            <p className="meta muted">
              {result.timings.totalMs.toFixed(0)} ms · {result.config.mode}
              {result.config.reranker ? ` + ${result.config.reranker}` : ""} · {result.config.generator} · verifier{" "}
              {result.config.verifier}
            </p>
          </div>

          {source && (
            <aside className="source">
              <div className="tabs">
                {result.sources.map((s) => (
                  <button key={s.n} className={`cite ${active === s.n ? "on" : ""}`} onClick={() => setActive(s.n)}>
                    {s.n}
                  </button>
                ))}
              </div>
              <h2>
                {source.title} › <code>{source.section}</code>
              </h2>
              <p className="muted small">{source.chunkId}</p>
              <Highlighted text={source.text} spans={source.highlights} />
            </aside>
          )}
        </section>
      )}
    </main>
  );
}
