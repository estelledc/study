---
schema_version: 4
lens_id: data-retrieval-stack
title: lens-data-retrieval-stack
domain: lens
layer: app
owner: jason
verified_at: 2026-05-31
review_quarter: 2026Q2
total_budget_chars: 3000
hardware_assumption: 单租户中等规模；向量 1M-100M、文档 < 10TB、QPS 10-1000；可云托管或本地容器；不假设 GPU 集群
ring_summary: { adopt: 7, trial: 6, assess: 2, hold: 2 }
excludes: [glossary, sources+reading_list, getting_started, what_is_not]
provider_coverage_checklist:
  - pgvector
  - Postgres
  - Qdrant
  - Milvus
  - Weaviate
  - Chroma
  - DuckDB
  - ClickHouse / BigQuery
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

## 1. 选型铁律

1. <10M 向量+已 PG → pgvector
2. 强 filter+千万级 → Qdrant
3. 默认 BM25+dense+rerank 三段
4. <500GB DuckDB；>1TB BigQuery
5. <5min → Debezium；>1h → snapshot
6. HNSW 先调 ef_construction

## 2. 候选表

verified 2026-05-31。layer 全部 = app。

| 候选 | ring | 立场 | 触发条件 | layer |
|---|---|---|---|---|
| pgvector | adopt | 向量起步 | < 10M | app |
| Qdrant | trial | 向量升级 | filter-first | app |
| Milvus | trial | 大规模 | > 1 亿 | app |
| Weaviate | assess | hybrid 模块 | 模块化 | app |
| BM25 | adopt | 召回基线 | 精确名词 | app |
| dense embed | adopt | 语义召回 | 同义改写 | app |
| hybrid RRF | adopt | 混合默认 | k=60 | app |
| reranker | adopt | 精排 | top 敏感 | app |
| ColBERT | trial | 多向量 | 召回上限 | app |
| HNSW | adopt | 内存索引 | 默认 ANN | app |
| DiskANN | trial | SSD 索引 | 省内存 | app |
| IVF-PQ | assess | 有损压缩 | 极大规模 | app |
| DuckDB | adopt | 单机 OLAP | < 500GB | app |
| BigQuery | adopt | 云仓 | > 1TB | app |
| ClickHouse | trial | 自托管 | QPS>1k | app |
| Airflow | adopt | 编排默认 | 招聘易 | app |
| Dagster | trial | 资产编排 | asset-first | app |
| Debezium | trial | CDC | < 5min | app |

hold：Chroma / snapshot 全量 / Annoy。

## 3. 迷你 ADR

**ADR-1 向量库 pgvector 起步** (vendor-selection)
## context
已用 PG 14+，文档 50 万级、QPS < 50。引专用向量库要双库一致+备份+监控全做新；不引则受 PG planner 与 HNSW build 限制。
## decision
默认 pgvector + HNSW；超 1000 万向量或 P99 > 200ms 迁 Qdrant。
## alternatives
Qdrant（拒：当前规模双栈成本高）；Milvus（拒：shard 过剩）；Chroma（拒：信号弱）。
## consequences
省一套服务、ACID 自带 metadata；HNSW build 慢、并发写膨胀、缺 pre-filter；回滚低（pg_dump+维度对齐）。

**ADR-2 OLAP 仓库 DuckDB+BQ** (vendor-selection)
## context
< 500GB DuckDB 与 ClickHouse 集群打平；> 1TB DuckDB 内存吃紧。BQ 零运维但按量贵。处跨阈值。
## decision
< 500GB DuckDB+Parquet on S3；> 1TB BigQuery；不自建 ClickHouse 除非 QPS>1k。
## alternatives
ClickHouse（拒：运维过剩）；Snowflake（拒：credit 不可预测）；StarRocks（拒：英文生态薄）。
## consequences
DuckDB 无运维 CI 可跑、BQ 弹性；DuckDB 不支持高并发写、BQ 扫描计费易踩；正向迁移重导 Parquet。

**ADR-3 HNSW 参数调优** (implementation-tuning)
## context
默认 M=16, ef_construction=64, ef_search=40 在 100 万向量、1024 维下召回@10 ≈ 0.92，业务要求 ≥ 0.97。
## decision
固定 M = 24，ef_construction = 200，ef_search = 100。
## rationale
M↑ 抬全局连通；ef_construction=200 在 build +30% 内换 0.97+；ef_search=100 兼顾 P99；扫 64/100/200。
## consequences
召回稳 0.97+；索引体积 +30%、build ×2；ef_search↑ 拉延迟可在线调；回滚改回默认。

**ADR-4 检索三段式 BM25+dense+rerank** (architecture)
## context
纯 dense 对精确名词/缩写/代码召回 < 60%；纯 BM25 对同义改写无能。RAG 业内默认三段式。
## decision
BM25 + dense hybrid（RRF k=60）+ reranker top-50 → top-10。
## consequences
召回 +15-30%；rerank 把精确命中前置；3 跳延迟 +200-500ms；RRF 单边权重不可 tune。
## rollback
端到端 P95 > 1.5s 持续 1h 时关 reranker 退 hybrid，仍超则关 BM25 退 dense-only，半天平移。

## 4. 决策树

```
Q1 量级？ <1M→Q2 / 1M-100M→Q3 / >100M→Q4
Q2 已 PG？ Y→pgvector(ADR-1) / N→Qdrant
Q3 强 filter？ Y→Qdrant / N→Milvus
Q4 内存全驻？ Y→Milvus / N→DiskANN
Q5 召回<0.95→加 BM25 hybrid
Q6 top 敏感→加 reranker(ADR-4)
Q7 <5min→Debezium / 日级→DuckDB(ADR-2)
Q8 召回<0.97→调 HNSW(ADR-3)
```

## 5. 缺口与待补

1. 向量+filter 执行计划无 benchmark 共识
2. rerank 切点 1000→100 vs 100→10 无元方法
3. embedding 升级在线迁移无 SOP
4. 湖仓三家未把 ANN 下推到表层
5. DAG 中 LLM-step 失败语义无策略
6. BM25/dense 权重学习需标注集
