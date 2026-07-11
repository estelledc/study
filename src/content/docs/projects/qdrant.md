---
title: Qdrant — Rust 向量数据库
来源: https://github.com/qdrant/qdrant
日期: 2026-05-29
分类: 数据库 / 向量
难度: 中级
---

## 是什么

Qdrant 是 Andrey Vasnetsov 在 2021 年用 **Rust** 写的一个**向量数据库**——专门为 RAG（检索增强生成）、推荐系统、图像搜索这些"找最相似的几个"场景做的存储引擎。

日常类比：

- [[milvus]] 像**大型综合仓库**——分布式集群、功能齐全（标量 + 向量 + 流式），但运维重、占资源多
- Qdrant 像**精简快递分拣中心**——单个 Rust binary 起来就能跑，吞吐高、内存省、上手快

它在向量数据库这条赛道里和 Milvus / Pinecone（闭源 SaaS）/ Weaviate / [[chroma]] 同台竞争，定位是"够用 + 跑得快 + 部署简单"。

## 为什么重要

不了解 Qdrant，下面这些事说不清楚：

- 为什么 RAG 项目的"向量库选型"经常变成 Milvus vs Qdrant 的二选一——一个偏分布式重量级，一个偏单机轻量级
- 为什么用 Rust 写存储引擎成了潮流（SurrealDB 等同代 Rust 项目；ScyllaDB 则是更早的 C++ 高性能路线）——内存安全 + 无 GC + 接近 C 的吞吐
- 为什么 Qdrant 反复强调 **带过滤的向量检索**能比"先搜再筛"稳——大多数业务查询都是"在 tag=技术 的文档里找最相似的"
- 为什么 Apache 2.0 协议加上付费 SaaS（Qdrant Cloud）这种组合，是当下开源数据库最常见的商业模式

## 核心要点

Qdrant 的数据模型只有 **三层**：

1. **Collection（集合）**：一个命名空间，存一类向量。比如 `documents`、`images`、`products`，每个 Collection 固定向量维度（比如 OpenAI embedding 是 1536 维）和距离函数（Cosine / Dot / Euclid）。
2. **Point（点）**：一个数据单元 = 一个向量 + 一份 **payload**（任意 JSON 元数据）。比如 `{id: 42, vector: [0.1, 0.2, ...], payload: {category: "tech", author: "alice"}}`。
3. **Index（索引）**：默认走 **HNSW**（一种"层级跳表"图索引，工业界向量检索的事实标准）；payload 字段也可单独建索引，让 filter 走结构化索引而不是扫全表。

性能上的杀手锏是 **filterable HNSW（可过滤的图检索）**：

- 朴素做法：先 HNSW 找 Top-K，再用 payload 条件筛——很多候选被砍掉，召回和延迟都差
- 另一极端：先按 payload 砍候选再暴力算距离——候选一多就炸
- Qdrant：在 HNSW 图上为常见 payload 值加额外边，查询时按选择度规划——能走图就边走边过滤，太严就退回 payload 索引扫描

加上 **Quantization（量化）** 三档可选——Scalar（float32 → int8，约省 4 倍内存）/ Product（PQ，更省但有损）/ Binary（极致压缩，常配合 reranker）——大集合也能塞进有限内存。

## 实践案例

### 案例 1：本地 30 秒起一个 Qdrant

```bash
docker run -p 6333:6333 -p 6334:6334 \
  -v $(pwd)/qdrant_storage:/qdrant/storage \
  qdrant/qdrant
```

**逐部分解释**：

- 6333 是 REST 端口，6334 是 gRPC（Python client 走 gRPC 通常更快）
- `qdrant_storage` 持久化数据——容器重启不丢
- 浏览器打开 `http://localhost:6333/dashboard` 可看 Collection / 跑查询

### 案例 2：Python 建集合 + 写入向量

```python
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

client = QdrantClient(url="http://localhost:6333")

client.create_collection(
    collection_name="docs",
    vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
)

client.upsert(
    collection_name="docs",
    points=[
        PointStruct(
            id=1,
            vector=[0.1] * 1536,  # 真实场景换成 embedding 模型输出
            payload={"category": "tech", "title": "Rust 入门"},
        ),
    ],
)
```

**逐部分解释**：

1. `create_collection` 固定维度与距离——之后写入维度必须一致
2. `PointStruct` = id + vector + payload；payload 供后面 filter 用
3. `upsert` 有则更新、无则插入；生产里通常批量写

### 案例 3：filter + 向量搜索

```python
from qdrant_client.models import Filter, FieldCondition, MatchValue

results = client.search(
    collection_name="docs",
    query_vector=[0.1] * 1536,
    query_filter=Filter(
        must=[FieldCondition(key="category", match=MatchValue(value="tech"))]
    ),
    limit=5,
)
```

**逐部分解释**：

1. 读作"在 category=tech 的文档里，找和 query 最像的 5 个"
2. 务必先对 `category` 调 `create_payload_index`，否则 filter 可能退化成扫集合
3. 新版 client 也可用 `query_points`；`search` 在教程里仍常见，语义相同

## 踩过的坑

1. **HNSW 内存爆**：100 万条 1536 维 float32 ≈ 6 GB，HNSW 图还要 +30%——单机 16 GB 就吃紧。可开 `on_disk: true` 或 Scalar Quantization（int8 约省 4 倍，召回常降 1–3%）。
2. **Snapshot 不是自动的**：备份要手动调 API 建 snapshot，没有内置"每天 3 点备份"。生产得自己写 cron + 上传对象存储。
3. **分布式不如 [[milvus]] 成熟**：Qdrant 1.x 才有 sharding + replication；跨节点 rebalance、故障恢复，Milvus（v2.4+）测得更充分。亿级以上、严苛可用性要谨慎评估。
4. **payload 索引选错性能差**：filter 字段没建索引，百万点查询可能慢到数百毫秒。建集合后记得对常用字段 `create_payload_index`。
5. **多向量场（Named Vectors）易漏参**：一个 point 存 dense + sparse 时，写入/查询要指定 `using`，少写就报 vector not found。

## 适用 vs 不适用场景

**适用**：

- 中小规模 RAG（< 1 亿向量）——单机往往够用
- 创业公司 / 个人项目 / 原型——Docker 起一下就能用
- 强调 filter 性能的业务——电商、推荐、多租户
- 想要 Apache 2.0 + 可选托管（Qdrant Cloud）

**不适用**：

- 十亿级以上 + 严苛 SLA → 选 [[milvus]] 或 Pinecone
- 已经深度用 PostgreSQL → pgvector / pgvecto.rs 更合适
- 完全 serverless 不想管 infra → Pinecone 更省心（但贵 + 闭源锁定）

## 历史小故事（可跳过）

- **2021 年**：Andrey Vasnetsov 在柏林创立 Qdrant，动机是"已有方案要么是研究代码（Faiss 不带服务）要么是 Java 重型方案"，他要 Rust 单 binary 工程化产品。
- **2022 年**：Qdrant Cloud SaaS 上线，开源版同步迭代。
- **2023 年**：v1.0 GA，HNSW 稳定，Scalar Quantization 支持，进入主流 RAG 教程选型列表。
- **2024 年**：v1.10 加稀疏向量 + 多向量场，支持 hybrid search，功能广度追上 Weaviate / Vespa 一档。

整体节奏：**约 3 年从 0 到主流选型之一**——背后是 RAG 需求爆炸 + Rust 工程化优势。

## 学到什么

1. **数据库赛道也讲定位**：不必人人做 Milvus 级巨兽，"轻量 + 单机 + 高性能"也能切市场
2. **Filterable 索引是工程优化典范**：观察真实查询（大多带过滤），在图索引上补边 + 查询规划，而不是死守"先全局再筛"
3. **量化是空间换召回率**：int8 / PQ / binary 对应数倍到数十倍压缩 + 若干百分点召回损失
4. **Apache 2.0 + SaaS 是常见商业模式**：相对更严的许可证，新一代向量库多选宽松协议 + 自营托管

## 延伸阅读

- 官方文档：[Qdrant Documentation](https://qdrant.tech/documentation/) ——Concepts 章节先读
- HNSW 原理：[Yu. Malkov, HNSW](https://arxiv.org/abs/1603.09320)
- 过滤检索说明：[Filterable HNSW](https://qdrant.tech/articles/filterable-hnsw/)
- 向量库横评：[Qdrant Benchmarks](https://qdrant.tech/benchmarks/) ——自家测自家，带怀疑看
- [[milvus]] —— 重量级分布式向量库
- [[chroma]] —— 更轻的嵌入式向量库

## 关联

- [[milvus]] —— 分布式向量库，与 Qdrant 同赛道但定位不同
- [[chroma]] —— Python 嵌入式向量库，比 Qdrant 更轻
- [[pgvector]] —— 已有 Postgres 时的嵌入式替代
- [[hnswlib]] —— HNSW 参考实现，业界向量库多受其影响
- [[weaviate]] —— 模块化向量数据库，hybrid search 对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ann-benchmarks]] —— ANN-Benchmarks — 近似最近邻算法的统一擂台
- [[chroma]] —— Chroma — Python 优先的向量数据库
- [[hnswlib]] —— hnswlib — HNSW 论文作者写的参考实现，业界向量库都基于它
- [[pgvector]] —— pgvector — PostgreSQL 向量扩展
- [[vespa]] —— Vespa — Yahoo 检索 + 排序引擎
- [[weaviate]] —— Weaviate — 模块化向量数据库
