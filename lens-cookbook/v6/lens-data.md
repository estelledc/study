---
schema_version: 6
lens_id: data-retrieval-stack
title: lens-data-retrieval-stack
domain: lens
layer: app
status: active
owner: jason
verified_at: 2026-05-31
review_quarter: 2026Q2
total_budget_chars: 3000
hardware_assumption: 单租户中等规模；向量 1M-100M、文档 < 10TB、QPS 10-1000；可云托管或本地容器；不假设 GPU 集群
ring_summary: { adopt: 10, trial: 10, assess: 3, hold: 4 }
excludes: [sources, reading_list, getting_started, what_is_not]
wikilinks: [pgvector, qdrant, milvus, weaviate, chroma, hnsw-2018, diskann-2019, faiss-2017, duckdb-2019, clickhouse, airflow, dagster, debezium, kafka, rag-lewis-2020, graphrag, elasticsearch, sqlite-vss, lancedb, duckdb-vss]
out_of_corpus: [bigquery, colbert, ivf-pq, bm25, rrf, reranker, snowflake]
sources:
  - pgvector + HNSW 文档 / qdrant.tech / milvus.io
  - weaviate.io hybrid blog / chroma issues
  - duckdb.org / ClickHouse / BigQuery slot
  - airflow.apache.org / dagster.io SDA
  - debezium.io PG connector
  - Lewis 2020 RAG / Malkov 2018 HNSW / Cormack 2009 RRF
open_questions:
  - 向量+filter 联合执行计划无 benchmark 共识
  - rerank 1000→100 vs 100→10 无元方法
  - embedding 升级在线迁移无公认 SOP
  - 湖仓三家未把 ANN 下推到表层
  - DAG 中 LLM-step 失败语义无官方策略
  - BM25/dense 权重学习需带标注集
---

## 候选表

verified 2026-05-31。layer 全部 = app。

| 候选 | ring | 立场 | 触发条件 | layer |
|---|---|---|---|---|
| pgvector | adopt | pgvector: 起步 PG 内向量 | < 10M 且已 PG | app |
| Qdrant | trial | Qdrant: filter-first 向量库 | 强 filter+千万级 | app |
| Milvus | trial | Milvus: 亿级 sharding | > 1 亿 | app |
| Weaviate | assess | Weaviate: hybrid 模块化 | 模块化需求 | app |
| BM25 | adopt | BM25: 精确名词召回 | 精确名词/代码 | app |
| dense embed | adopt | dense: 同义改写召回 | 语义同义改写 | app |
| hybrid RRF | adopt | hybrid RRF: 三段默认混合 | k=60 默认 | app |
| reranker | adopt | reranker: top 精排 | top 敏感 | app |
| ColBERT | trial | ColBERT: 多向量召回上限 | 召回上限要求 | app |
| HNSW | adopt | HNSW: 内存 ANN 默认 | 默认 ANN | app |
| DiskANN | trial | DiskANN: SSD ANN 省内存 | SSD 大盘 | app |
| IVF-PQ | assess | IVF-PQ: 有损压缩极大规模 | 极大规模省内存 | app |
| DuckDB | adopt | DuckDB: 单机 OLAP 起步 | < 500GB | app |
| BigQuery | adopt | BigQuery: 云仓弹性 | > 1TB | app |
| ClickHouse | trial | ClickHouse: 自托管高 QPS | QPS>1k | app |
| Airflow | adopt | Airflow: 编排默认 | 招聘易+生态 | app |
| Dagster | trial | Dagster: asset-first 编排 | asset-first | app |
| Debezium | trial | Debezium: PG CDC | < 5min 同步 | app |

hold：Chroma cloud / snapshot 全量 / Annoy。

## 嵌入式向量库（embedded vector store）

无 server、单文件、< 100k vector、本地优先（CLI / 桌面 / 笔记应用）场景。layer 全部 = app。

| 候选 | ring | 立场 | 触发条件 | layer |
|---|---|---|---|---|
| sqlite-vss | adopt | sqlite-vss: SQLite 扩展、单文件 | 已用 SQLite + < 100k | app |
| LanceDB | trial | LanceDB: columnar 嵌入式 | 列存+版本化 | app |
| Chroma local | trial | Chroma local: Py 一行起 | 原型/notebook | app |
| DuckDB-VSS | trial | DuckDB-VSS: OLAP+向量同库 | 已用 DuckDB | app |
| pgvector embedded | assess | pgvector embedded: PG 单进程 | 已用 PG 且需嵌入 | app |

hold：Annoy（无更新）/ 自写 numpy（无 ANN）。

## ADR 索引

**ADR-1 向量库 pgvector 起步** (vendor-selection)

### context
已用 PG 14+，文档 50 万级、QPS < 50。引专用向量库要双库一致+备份+监控全做新；不引则受 PG planner 与 HNSW build 限制。

### decision
默认 pgvector + HNSW；超 1000 万向量或 P99 > 200ms 迁 Qdrant。

### alternatives
Qdrant（拒：当前规模双栈成本高）；Milvus（拒：shard 过剩）；Chroma（拒：信号弱、社区放缓）。

### consequences
省一套服务、ACID 自带 metadata；HNSW build 慢、并发写膨胀、缺 pre-filter；回滚低（pg_dump+维度对齐）。

**ADR-2 OLAP 仓库 DuckDB+BQ** (vendor-selection)

### context
< 500GB DuckDB 与 ClickHouse 集群打平；> 1TB DuckDB 内存吃紧。BQ 零运维但按量贵。处跨阈值。

### decision
< 500GB DuckDB+Parquet on S3；> 1TB BigQuery；不自建 ClickHouse 除非 QPS>1k。

### alternatives
ClickHouse（拒：运维过剩）；Snowflake（拒：credit 不可预测）；StarRocks（拒：英文生态薄）。

### consequences
DuckDB 无运维 CI 可跑、BQ 弹性；DuckDB 不支持高并发写、BQ 扫描计费易踩；正向迁移重导 Parquet。

**ADR-3 HNSW 参数调优** (implementation-tuning)

### context
默认 M=16, ef_construction=64, ef_search=40 在 100 万向量、1024 维下召回@10 ≈ 0.92，业务要求 ≥ 0.97。

### decision
M = 24, ef_construction = 200, ef_search = 100。

### rationale
M↑ 抬全局连通；ef_construction=200 在 build +30% 内换 0.97+；ef_search=100 兼顾 P99；扫 64/100/200。

### consequences
召回稳 0.97+；索引体积 +30%、build ×2；ef_search↑ 拉延迟可在线调；回滚改回默认。

**ADR-5 嵌入式向量库 sqlite-vss** (vendor-selection)

### context
应用是单机 / CLI / 桌面工具，无 server，向量 < 100k，离线运行；引服务化向量库（Qdrant/Milvus）成本不成比例。

### decision
默认 sqlite-vss + SQLite 单文件；向量 > 100k 或需列存版本化迁 LanceDB；已用 DuckDB 的离线分析场景用 DuckDB-VSS 同库。

### alternatives
LanceDB（拒：起步包大、Py/Rust 双栈）；Chroma local（拒：API 起步快但持久化 + 升级 churn）；pgvector embedded（拒：PG 嵌入式不主流）；自写 numpy（拒：无 ANN、> 10k 即崩）。

### consequences
零部署、单文件备份；扩展加载在部分发行版受限；向量数 > 100k 时召回延迟陡升、需迁出；schema 变更走 SQLite migration。

### rollback
向量数破 100k 或 P99 > 100ms 持续 1h → 导出 parquet 迁 LanceDB；保留 SQLite 元数据双写 1 周观察。

**ADR-4 检索三段式 BM25+dense+rerank** (architecture)

### context
纯 dense 对精确名词/缩写/代码召回 < 60%；纯 BM25 对同义改写无能。RAG 业内默认三段式。

### decision
BM25 + dense hybrid（RRF k=60）+ reranker top-50 → top-10。

### consequences
召回 +15-30%；rerank 把精确命中前置；3 跳延迟 +200-500ms；RRF 单边权重不可 tune。

### rollback
端到端 P95 > 1.5s 持续 1h 时关 reranker 退 hybrid，仍超则关 BM25 退 dense-only，半天平移。

## 决策树

```
Q0 成本/规模门：向量 < 100k 且 QPS < 100？
   Y→Q0.5
   N→Q1
Q0.5 是否单机部署（无 server）？
   Y→sqlite-vss(ADR-5)；已 DuckDB→DuckDB-VSS；列存版本化→LanceDB
   N→pgvector 单机起步(ADR-1)，跳过 Milvus/Qdrant；Q5 起按需加段
Q1 量级？ <1M→Q2 / 1M-100M→Q3 / >100M→Q4
Q2 已 PG？ Y→pgvector(ADR-1) / N→Qdrant
Q3 强 filter？ Y→Qdrant / N→Milvus
Q4 内存全驻？ Y→Milvus / N→DiskANN
Q5 召回<0.95→加 BM25 hybrid
Q6 top 敏感→加 reranker(ADR-4)
Q7 <5min→Debezium / 日级→DuckDB(ADR-2)
Q8 召回<0.97→调 HNSW(ADR-3)
```

## 外迁 excludes

- sources / reading_list / getting_started / what_is_not 各 stub
