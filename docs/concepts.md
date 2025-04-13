# Concepts, in the order the code uses them

Short notes on each idea in this repo, with a pointer to where it lives. Read top to bottom once, then use it as a reference.

## 1. Chunking (`packages/rag/src/chunk.ts`)

An LLM can only read so much, and a retriever ranks whole units, so documents are cut into **chunks** of about 300–500 tokens.

- **Too big** and one chunk mixes several topics. Its embedding becomes a blur and the generator gets noise.
- **Too small** and a fact gets separated from the context that explains it.

We split at headings first (an API section is a natural unit), then pack paragraphs up to `maxTokens`. Code blocks are never split. Neighbouring chunks share about 50 tokens of **overlap**, so a sentence on a boundary appears whole in at least one chunk.

Every chunk gets a **stable ID**, `doc:section:chunk` (e.g. `fs:212:0`). Citations, logs and eval results all refer to chunks by ID, so the IDs must not change between runs.

The **contextual header** (`indexText`) prepends `Title > Section` to the chunk before indexing. A chunk that only says "Returns: {string}" can then still be found by a question about `path.extname`.

## 2. Sparse retrieval: BM25 (`bm25.ts`)

BM25 is keyword matching with three refinements:

- **TF saturation (k1)**: the 10th occurrence of a word adds much less than the 1st.
- **IDF**: rare words count more. "zlib" is informative; "the" isn't.
- **Length normalisation (b)**: a long chunk doesn't win just by containing more words.

BM25 is great at exact identifiers (`maxBuffer`, `ERR_OUT_OF_RANGE`), which matters a lot for API docs. It is blind to synonyms ("remove" ≠ "delete").

## 3. Dense retrieval: embeddings (`embedders.ts`)

An embedding model maps text to a vector (BGE-small: 384 numbers). It is trained so that a question and the passage that answers it end up close together, even with no words in common. Closeness is measured by **cosine similarity**. Because we L2-normalise the vectors, cosine is just a dot product (`rank.ts`).

- **Asymmetric retrieval:** BGE expects an instruction prefix on queries but not on passages, because questions and answers are different kinds of text.
- **Why no vector database?** ~1,750 chunks × 384 floats is under 3 MB. A brute-force scan takes milliseconds. Approximate-nearest-neighbour indexes (HNSW, IVF) only pay off at hundreds of thousands of vectors.
- **The offline `HashEmbedder`** uses the hashing trick over words. It is really a lexical method in vector form. Look at the ablation table to see how badly it does as "dense" retrieval. That gap is the value of a real embedding model.

## 4. Hybrid search and Reciprocal Rank Fusion (`rank.ts`, `retrieve.ts`)

Dense and sparse retrieval fail on different questions, so we run both and merge the rankings. Their scores aren't comparable (cosine ∈ [-1, 1], BM25 is unbounded), so **RRF** ignores scores and uses ranks only:

    score(d) = Σ over rankings 1 / (60 + rank(d))

A chunk ranked 3rd by both lists beats one ranked 1st by one list and absent from the other. The constant 60 damps the influence of the very top ranks.

## 5. Reranking with a cross-encoder (`rerankers.ts`)

The embedder encodes the question and the passage **separately** (a bi-encoder), which is why it can pre-compute all passage vectors. A **cross-encoder** reads `[question, passage]` together. Every question word can attend to every passage word, so it is much more accurate, but it needs one model call per pair.

The standard pattern is retrieve wide and cheap (top 30), rerank narrow and expensive, then keep 5–8. The rerank score also becomes a **confidence signal** for abstention.

## 6. Structured generation with citations (`generate.ts`, `llm.ts`)

Instead of asking for prose with `[1]` markers, we ask for JSON that matches a Zod schema:

```ts
{ answerable: boolean, sentences: [{ text, sources: number[] }] }
```

A 1.5B model on a CPU has no "JSON mode" to lean on, so `generateStructured` turns the Zod schema into a JSON Schema, puts it in the system prompt, pulls the first JSON object out of the reply and validates it, retrying up to three times. (Ollama can also constrain decoding to the schema, which we pass along when it is the backend.) Now every claim is a separate, machine-checkable object.

Sources are wrapped in `<source>` tags. The system prompt says their content is **data, not instructions**. This is the first defence against prompt injection from documents.

## 7. Verification, or attribution checking (`verify.ts`)

Models cite sources that don't actually say what the sentence says. For every **(sentence, cited source)** pair we ask: does this source alone entail the sentence? This is a **natural language inference** (NLI) task.

- Citations that fail are removed. Sentences left with no citation are dropped and kept in `dropped` for debugging.
- All pairs go in **one batched call**, so verification costs one model run, not N. On a CPU that is the difference between seconds and minutes.
- The default local verifier is an **NLI cross-encoder** (`NliVerifier`, DeBERTa-v3-xsmall). NLI models are trained on short premises, so it checks one- and two-sentence windows of the source and keeps the best entailment score.
- **Post-hoc attribution:** a sentence the generator left uncited is checked against every retrieved passage, and keeps any that entail it.
- The offline `LexicalVerifier` requires most content words, and every number, to appear in the source. It catches invented numbers but not negation ("must" vs "must not").

## 8. Abstention (`pipeline.ts`)

There are three gates, cheapest first:

1. **Low retrieval score:** the best rerank score is below a threshold. Don't even call the generator.
2. **Model declines:** the generator sets `answerable: false`.
3. **Nothing verified:** every sentence failed verification.

The threshold trades **refusal accuracy** (saying "I don't know" to unanswerable questions) against the **false refusal rate** (refusing answerable ones). Tune it on the gold set, never on the test set you report.

## 9. Evaluation (`packages/evals`)

- **Gold set** (`gold/gold.jsonl`): questions with reference answers and **evidence quotes**. Quotes, not chunk IDs, mark the right passages, so the gold set survives changes to chunk size. `pnpm check-gold` verifies every quote exists in the corpus.
- **Recall@k:** is the evidence in the top k retrieved chunks? If retrieval misses, nothing downstream can fix it, so measure this first.
- **MRR:** 1 / rank of the first relevant chunk. It rewards putting the evidence first.
- **Citation precision:** of all (sentence, citation) pairs shown, how many does the judge say are supported? We also report it **before** verification (`draftCitationPrecision`); the gap is what the verifier buys.
- **Citation recall:** the share of displayed sentences with at least one supporting citation.
- **Answer correctness:** an LLM judge compares the answer with the reference. Ideally the judge is a **different model** from the generator, to reduce self-preference; by default both are the same small local model to keep the download to one file, so treat its scores as rough. Calibrate it against ~50 hand labels before trusting it.
- **Bootstrap confidence intervals** (`stats.ts`): resample the per-question scores 1,000 times. With 26 questions, ±15 points is normal, so a 3-point "win" on the smoke set is noise. The full set exists to make differences meaningful.
- **Ablations** (`pnpm ablate`): change one component at a time to learn what each part contributes.
- **CI gate** (`gate.ts`): run the 26-question smoke set on every push and fail if a metric drops by more than 2 points against the committed baseline. In CI it runs offline so results are deterministic; a drop means the code changed, not the model's mood.
