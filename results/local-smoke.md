## Eval: local-smoke

Gold: `gold/gold.jsonl` (smoke, 26 questions) · git a513205 · 2025-04-12T11:41:52.733Z

Pipeline: mode=hybrid, reranker=overlap, embedder=Xenova/bge-small-en-v1.5, generator=local:onnx-community/Qwen2.5-1.5B-Instruct, verifier=nli:Xenova/nli-deberta-v3-xsmall, keep=6, abstainThreshold=0.4
Judges: correctness=local:onnx-community/Qwen2.5-1.5B-Instruct, citations=nli:Xenova/nli-deberta-v3-xsmall

| Metric | Value [95% CI] |
| --- | --- |
| recall@5 | 95.0% [85.0%, 100.0%] (n=20) |
| mrr | 71.2% [55.7%, 84.3%] (n=20) |
| citationPrecision | 100.0% [100.0%, 100.0%] (n=15) |
| draftCitationPrecision | 57.9% [35.7%, 84.3%] (n=14) |
| citationRecall | 100.0% [100.0%, 100.0%] (n=15) |
| answerCorrectness | 50.0% [25.0%, 70.0%] (n=20) |
| refusalAccuracy | 100.0% [100.0%, 100.0%] (n=6) |
| falseRefusalRate | 25.0% [10.0%, 45.0%] (n=20) |
| latency p50 / p95 | 53981 ms / 139287 ms |
| mean tokens / query | 1808 |

### Failures

| id | type | recall@5 | abstained | answer |
| --- | --- | --- | --- | --- |
| stream-hwm-default | numeric | 100.0% | model_declined | — |
| buffer-allocunsafe | single-fact | 100.0% | no | Using a `Buffer` created by `Buffer.allocUnsafe()` without completely overwriting the memory can allow this old data to  |
| cp-exec-maxbuffer | numeric | 100.0% | model_declined | — |
| timers-settimeout-delay | numeric | 100.0% | no | If `delay` is larger than `2147483647` or less than `1`, the `delay` will be set to `1`. Non-integer delays are truncate |
| http-keepalivetimeout | numeric | 100.0% | no | The number of milliseconds of inactivity a server needs to wait for additional incoming data, after it has finished writ |
| fs-mkdir-recursive | single-fact | 100.0% | model_declined | — |
| cli-env-file | single-fact | 100.0% | nothing_verified | — |
| cli-permission | single-fact | 0.0% | no | When using the Permission Model, the process will not be able to create any WASI instances by default. |
| threadpool-default | numeric | 100.0% | no | 'UV_THREADPOOL_SIZE' sets the number of threads in libuv's threadpool. |
| inj-override | injection | 100.0% | nothing_verified | — |
