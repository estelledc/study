# Cross-lens glossary candidates

Lens：vllm/frontend/backend/data/devops/aieng。≥ 2 lens 同名同义。

| term | def_zh | def_en | lens | first_paper | prio |
|---|---|---|---|---|---|
| streaming | 分片下发，客户端逐块消费 | Server emits chunks incrementally | aieng,frontend,vllm | RFC 2616 1999 | high |
| prefix/prompt cache | 共享前缀复用 KV 或计费 token 省 prefill | Reuse KV/billed tokens for shared prefix | aieng,vllm | Kwon 2023 PagedAttention | high |
| router | 多 provider/副本前置转发，含协议翻译 | Front-door dispatch with translation | aieng,vllm,backend | — | high |
| rate limit | 限单位时间请求/token，护下游公平 | Cap requests/tokens per window | backend,data,aieng | Turner 1986 token bucket | high |
| cold start | 新副本/容器/连接首请求高延迟 | First-request latency penalty | frontend,backend,vllm,devops | — | high |
| observability | metric+log+trace 三件套 | Metrics+logs+traces | devops,backend,data | Sigelman 2010 Dapper | high |
| SLO | 延迟/可用性量化目标 | Quantitative latency target | vllm,devops,backend | Beyer 2016 SRE Book | high |
| edge runtime | CDN POP 受限运行时冷启快 | Restricted CDN-edge runtime | frontend,backend | Cloudflare Workers 2017 | mid |
| schema validation | 边界结构化校验，错误前置 | Structured contract at boundaries | frontend,backend,data | JSON Schema 2009 | high |
| pgvector | Postgres 内 HNSW/IVF 向量检索 | HNSW/IVF inside Postgres | backend,data | Malkov 2018 HNSW | mid |
| SSE | 单向 HTTP 流，LLM 流默认 | One-way HTTP event stream | aieng,frontend | HTML5 EventSource 2009 | high |
| Kubernetes | 容器编排控制面 | Container orchestration plane | devops,vllm,backend | Verma 2015 Borg | high |
| CDC | WAL/binlog tail 变更流 | Tail WAL/binlog as change stream | data,backend | Debezium 2017 | mid |
| embedding | 文本/代码到稠密向量 | Map to dense vectors | data,aieng | Mikolov 2013 word2vec | high |
| OpenAI-compat API | /v1/chat/completions 跨层共认 | Cross-layer /v1 shape | vllm,aieng,backend | OpenAI 2023 | high |
| backpressure | 下游慢则上游限速防爆 | Slow downstream throttles upstream | frontend,backend,devops | Reactive Streams 2014 | mid |
| autoscaling | 按指标横扩吃突发 | Scale on metrics for bursts | devops,vllm,backend | Verma 2015 Borg | mid |
| GPU memory budget | 权重+KV+激活受 VRAM 约束 | W+KV+act bounded by VRAM | vllm,devops | — | mid |

## 备注

- prompt cache + prefix cache 合一：首付全后算尾部。
- router 三 lens 语义漂移（翻译/多副本/gateway）取最广义。
- cold start ms 到 s 同源（edge SSR / serverless / LoRA / 节点）。
- 未入选：TP / quantization / RSC / hybrid retrieval / vector index / circuit breaker / connection pool / BM25 / batching 仅单 lens；token 并入 streaming + rate limit。
