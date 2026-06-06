---
title: Qdrant — Rust 向量数据库
来源: https://github.com/qdrant/qdrant
日期: 2026-05-29
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
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
- 为什么用 Rust 写数据库突然成了潮流（同期还有 SurrealDB、ScyllaDB 用 C++ 也是这个思路）——内存安全 + 没 GC + 接近 C 的吞吐
- 为什么 Qdrant 反复强调 **filter-first**（先过滤再算相似度）能比传统方案快几倍——大多数业务查询都是"在 tag=技术 的文档里找最相似的"，不是全库找
- 为什么 Apache 2.0 协议加上付费 SaaS（Qdrant Cloud）这种组合，是当下开源数据库最常见的商业模式

## 核心要点

Qdrant 的数据模型只有 **三层**：

1. **Collection（集合）**：一个命名空间，存一类向量。比如 `documents`、`images`、`products`，每个 Collection 固定向量维度（比如 OpenAI embedding 是 1536 维）和距离函数（Cosine / Dot / Euclid）。
2. **Point（点）**：一个数据单元 = 一个向量 + 一份 **payload**（任意 JSON 元数据）。比如 `{id: 42, vector: [0.1, 0.2, ...], payload: {category: "tech", author: "alice"}}`。
3. **Index（索引）**：默认走 **HNSW**（一种"层级跳表"图索引，工业界向量检索的事实标准）；payload 字段也可以单独建索引，让 filter 走 B-tree 而不是扫全表。

性能上的杀手锏是 **filter-first**：

- 传统做法是先用 HNSW 找最相似的 100 个，再用 payload 条件筛——很多被 filter 砍掉，浪费向量计算
- Qdrant 反过来——先用 payload 索引砍候选集到 1 万个，再在这 1 万个里跑 HNSW

加上 **Quantization（量化）** 三档可选——Scalar（float32 → int8，省 4 倍内存）/ Product（PQ，省更多但有损）/ Binary（极致压缩，配合 reranker 用）——大集合也能塞进有限内存。

## 实践案例

### 案例 1：本地 30 秒起一个 Qdrant

```bash
docker run -p 6333:6333 -p 6334:6334 \
  -v $(pwd)/qdrant_storage:/qdrant/storage \
  qdrant/qdrant
```

- 6333 是 REST 端口，6334 是 gRPC 端口（Python client 走 gRPC 更快）
- `qdrant_storage` 目录持久化所有数据——容器重启不丢
- 浏览器打开 `http://localhost:6333/dashboard` 有个内置 Web UI，可以看 Collection / 跑查询

### 案例 2：Python 建集合 + 写入向量

```python
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

client = QdrantClient(url="http://localhost:6333")

# 建集合：1536 维（OpenAI text-embedding-3-small）+ 余弦距离
client.create_collection(
    collection_name="docs",
    vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
)

# 写入一条
client.upsert(
    collection_name="docs",
    points=[
        PointStruct(
            id=1,
            vector=[0.1] * 1536,  # 真实场景是 embedding 模型输出
            payload={"category": "tech", "title": "Rust 入门"},
        ),
    ],
)
```

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

读作"在 category=tech 的文档里，找和 query 最像的 5 个"。Qdrant 内部先用 payload 索引砍 candidate set，再 HNSW——比"先 HNSW 后过滤"通常快 2-10 倍。

## 踩过的坑

1. **HNSW 内存爆**：100 万条 1536 维 float32 向量 ≈ 6 GB，HNSW 图本身还要 +30%——单机 16 GB 就吃紧。要么开 `on_disk: true` 把向量丢磁盘（损失一点延迟），要么开 Scalar Quantization（int8 省 4 倍内存，召回率下降 1-3%）。
2. **Snapshot 不是自动的**：Qdrant 的备份要手动调 API 创建 snapshot，没有"每天 3 点自动备份"这种内置策略。生产环境得自己写 cron 脚本 + 上传 S3。
3. **分布式不如 [[milvus]] 成熟**：Qdrant 1.x 才有 sharding + replication，但跨节点 rebalance、节点故障恢复这些场景，Milvus（已经 v2.4+）测试得更充分。亿级以上数据量、对可用性要求高的场景要谨慎评估。
4. **payload 索引选错性能差**：filter 字段如果没建 payload 索引，filter 就退化成"全集合扫"——百万点级别一次查询能慢到 500ms。建 collection 之后记得对常用 filter 字段调 `create_payload_index`。
5. **多向量场（Named Vectors）配置易错**：v1.10 加的"一个 point 存多个向量"（比如同时存 dense + sparse），写入和查询时要指定 `using` 参数，少写一个就报"vector not found"——文档里这块翻得不深。

## 适用 vs 不适用场景

**适用**：

- 中小规模 RAG（< 1 亿向量）——单机 Qdrant 足够，不用搞集群
- 创业公司 / 个人项目 / 原型验证——Docker 起一下就能用，运维成本极低
- 强调 filter 性能的业务——电商、推荐、多租户场景，filter-first 优势明显
- 想要 Apache 2.0 协议 + 可选托管 SaaS（Qdrant Cloud）

**不适用**：

- 十亿级以上数据 + 严苛 SLA → 选 [[milvus]] 或 Pinecone（分布式更成熟）
- 已经深度用 PostgreSQL → pgvector / pgvecto.rs 嵌入现有 DB 更合适
- 完全 serverless 不想管 infra → Pinecone 更省心（但贵 + 闭源锁定）

## 历史小故事（可跳过）

- **2021 年**：Andrey Vasnetsov 在德国柏林创立 Qdrant，最初的 motivation 是"已有向量库要么是研究代码（Faiss 不带服务）要么是 Java 重型方案"，他想要一个"Rust 单 binary 就能跑"的工程化产品。
- **2022 年**：Qdrant Cloud SaaS 上线，开源版本同步迭代。
- **2023 年**：v1.0 GA，HNSW 实现稳定，Scalar Quantization 支持，开始进入主流 RAG 教程的"推荐选型"列表。
- **2024 年**：v1.10 加 BM25（稀疏向量）+ 多向量场——支持 hybrid search（dense + sparse 一起跑），追上 Weaviate / Vespa 的功能广度。

整体节奏：**3 年从 0 到主流选型之一**，对开源数据库来说算非常快——背后是 RAG 浪潮带来的需求爆炸 + Rust 工程化优势。

## 学到什么

1. **数据库赛道也讲"定位"**：不是每个产品都要做 Milvus 那种全功能巨兽，做"轻量 + 单机 + Rust 高性能"也能切出一块大市场
2. **Filter-first 是工程优化思路的典范**：观察真实查询模式（"大部分都带过滤"），把传统"先全局检索再筛"的顺序反过来——这种打破默认假设的优化，是数据库工程师的核心技能
3. **量化（Quantization）是空间换召回率**：int8 / PQ / binary 三档，对应 4-32 倍内存压缩 + 1-10% 召回率下降。理解这个 tradeoff 才能做容量规划
4. **Apache 2.0 + SaaS 是当下开源数据库标配商业模式**：MongoDB 走 SSPL 搞砸过一次，新一代（Qdrant / [[chroma]] / Weaviate）都选了更宽松的协议 + 自营托管服务

## 延伸阅读

- 官方文档：[Qdrant Documentation](https://qdrant.tech/documentation/) ——Concepts 章节先读
- HNSW 原理：[Yu. Malkov, "Efficient and robust approximate nearest neighbor search using HNSW"](https://arxiv.org/abs/1603.09320) ——HNSW 算法原始论文
- 向量库横评：[Qdrant Benchmarks](https://qdrant.tech/benchmarks/) ——官方对比，看时要带怀疑（自家测自家）
- [[milvus]] —— 重量级分布式向量库，Qdrant 的主要对手
- [[chroma]] —— 极简嵌入式向量库，定位更轻

## 关联

- [[milvus]] —— 分布式向量库，与 Qdrant 同赛道但定位不同
- [[chroma]] —— Python 嵌入式向量库，比 Qdrant 更轻

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ann-benchmarks]] —— ANN-Benchmarks — 近似最近邻算法的统一擂台
- [[chroma]] —— Chroma — Python 优先的向量数据库
- [[hnswlib]] —— hnswlib — HNSW 论文作者写的参考实现，业界向量库都基于它
- [[llama-index]] —— LlamaIndex — LLM 数据框架与 RAG 四件套
- [[milvus]] —— Milvus — 开源向量数据库
- [[pgvector]] —— pgvector — PostgreSQL 向量扩展
- [[vespa]] —— Vespa — Yahoo 检索 + 排序引擎
- [[weaviate]] —— Weaviate — 模块化向量数据库

