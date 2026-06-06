---
title: Milvus — 开源向量数据库
来源: https://github.com/milvus-io/milvus
日期: 2026-05-29
子分类: 存储与查询
分类: 数据库
难度: 中级
schema_version: legacy-long
provenance: legacy-migrated
---

## 是什么

Milvus 是一个**开源的向量数据库**——把"找相似图片 / 文本 / 音频"这件事做成像 SQL 查询一样直白的引擎。它存的不是文字本身，而是 [[clip]] 这种模型把图片或文本"翻译"出来的高维数字向量。

日常类比：

- [[postgresql]] 按订单号查——你给"订单 123"，它给你这一行
- Milvus 按"长得像"查——你给一张猫的照片，它给你全库**最像这只猫**的 10 张

具体场景：你有 100 万张商品图，用户拍一张沙发照片想"找同款"。传统数据库做不到（像素 ≠ 标签）；Milvus 把每张图变成 768 维向量，比"哪条向量距离最近"。

## 为什么重要

不理解向量数据库，下面这些产品都讲不清：

- **RAG（检索增强生成）**：ChatGPT 答你的私有文档问题，背后是把文档切片 → 向量化 → 存进 Milvus → 提问时检索最相关 3 段塞进 prompt
- **推荐系统**：抖音 / 小红书算"猜你喜欢"，本质是把用户行为变成向量，找相似用户喜欢的内容
- **以图搜图 / 多模态搜索**：拼多多"拍立淘"、Google Lens 都是这类技术
- **赛道格局**：Pinecone（闭源 SaaS） / Weaviate / Qdrant / Chroma / Milvus 五家竞争。Milvus 是国产（Zilliz 出品）+ Apache 2.0 开源 + 唯一进入 LF AI & Data Foundation 的毕业项目

一句话：大模型时代每多一个 RAG 应用，向量数据库的市场就大一格。

## 核心要点

### 数据模型：Collection + Vector + Metadata

每条记录有两部分：

- **向量字段**：一串浮点数（如 `[0.12, -0.45, ..., 0.88]`，维度通常 128 / 768 / 1536）
- **标量字段**：传统的 id / category / timestamp / text

这种"向量 + 元数据"混合让你既能"按相似度排"又能"按业务条件过滤"。

### 索引：决定速度 vs 精度 vs 成本的三角

向量搜索本质是 **ANN（Approximate Nearest Neighbor，近似最近邻）**——精确比所有向量太慢，所以用索引牺牲一点准确率换 100 倍速度。

| 索引 | 特点 | 适合场景 |
|------|------|----------|
| **HNSW** | 层级图，内存占用大但查询最快 | 亿级以下、要低延迟 |
| **IVF** | 把向量分桶，磁盘存储省钱 | 十亿级、对延迟没那么苛刻 |
| **DiskANN** | 微软出品，磁盘上跑 HNSW 思路 | 百亿级、单机塞不下内存 |

### 混合查询：向量相似 + 标量 filter

```python
client.search(
    collection_name="docs",
    data=[query_vector],
    top_k=10,
    filter="category == 'tech' AND created_at > '2025-01-01'"
)
```

意思是"找最像 query 的文档，但只看 2025 之后的科技类"。这是 Milvus 区别于纯向量库（如早期 Faiss）的核心能力。

## 实践案例

### 案例 1：Docker 起 standalone

最简单的玩法——一台机器、一个 docker compose 命令：

```bash
git clone https://github.com/milvus-io/milvus
cd milvus/deployments/docker/standalone
docker compose up -d
```

启动后默认监听 `localhost:19530`。生产环境用 Kubernetes 集群版（分离 etcd / minio / pulsar 等组件）。

### 案例 2：Python SDK 写入 + 检索

```python
from pymilvus import MilvusClient

client = MilvusClient("http://localhost:19530")

# 建集合
client.create_collection(
    collection_name="docs",
    dimension=768,
)

# 写入
client.insert("docs", [
    {"id": 1, "vector": [0.1, 0.2, ...], "text": "向量数据库入门"},
    {"id": 2, "vector": [0.3, 0.1, ...], "text": "RAG 实战指南"},
])

# 检索
results = client.search(
    collection_name="docs",
    data=[query_vec],
    top_k=10,
    filter="text like '%RAG%'",
)
```

代码风格刻意做得像 [[postgresql]]——`create_collection` / `insert` / `search` 三步走，降低学习成本。

### 案例 3：与 LangChain 接 RAG

LangChain 已经把 Milvus 包成 vectorstore，三行代码接进去：

```python
from langchain_milvus import Milvus
vs = Milvus.from_documents(docs, embeddings, connection_args={"uri": "http://localhost:19530"})
retriever = vs.as_retriever(search_kwargs={"k": 4})
```

之后你的 RAG chain 就能从 Milvus 拉相关文档片段。

## 踩过的坑

1. **索引构建慢得离谱**：1000 万条 768 维向量 + HNSW 索引，单机几小时是常态。生产环境要么离线建好再 load，要么用 GPU 索引（Milvus 2.4+ 支持 NVIDIA cuVS）。

2. **HNSW 是内存吃货**：每条向量除了原始 768 × 4 字节，还要存图结构指针。10 亿向量大约要 1.5 TB RAM——所以大规模场景必须切到 IVF 或 DiskANN。

3. **一致性级别四档容易混**：
   - **Strong**：写完立刻能读到，但慢
   - **Bounded**：默认，最多 5 秒延迟
   - **Session**：只保证自己写的自己能读到
   - **Eventually**：最快但可能读到旧数据
   选错了要么慢要么"明明插入了搜不到"。

4. **schema 改动重型操作**：加字段或换索引要先 `release` 整个集合，再 `rebuild`，期间不可用。提前规划比事后改便宜十倍。

5. **PK 自动 ID 的坑**：开 `auto_id` 后插入不能传 id，否则 silent fail；关 `auto_id` 又要自己保证不重——两边都踩过。

## 适用 vs 不适用

**适用**：

- 千万级到百亿级向量检索
- 需要混合查询（向量 + 业务字段过滤）
- 自部署 + 不愿被 Pinecone 这种闭源 SaaS 锁定
- 国内合规要求（数据不出境）

**不适用**：

- 数据量 < 10 万条 → SQLite + [[chroma]] 这种轻量库够用，不必上集群
- 需要事务 / 强一致 → 找传统关系数据库
- 只查 metadata 不查向量 → 退回 [[postgresql]] + pgvector 扩展更省心

## 历史小故事

- **2017 年**：上海 Zilliz 公司创立，最初做"非结构化数据管理"工具，FAISS（Facebook 出品）为起点
- **2019 年**：Milvus 1.0 开源，定位"为 AI 设计的向量数据库"
- **2021 年**：Milvus 2.0 重构成云原生分离式架构（计算 / 存储 / 协调分离）
- **2022 年**：加入 Linux Foundation AI & Data，成为该基金会**首个**毕业的向量数据库项目
- **2023 年**：ChatGPT 引爆 RAG 浪潮，Milvus 下载量年增 10 倍
- **2024 年**：Milvus 2.4 引入 GPU 索引和 sparse vector（稀疏向量，做关键词 + 语义混合搜索）

## 学到什么

1. **向量数据库不是新 SQL**——它解决的是"按语义找"而非"按主键找"，与关系库**互补**而非替代
2. **索引选择 = 三角妥协**：内存大小 / 查询延迟 / 准确率，HNSW / IVF / DiskANN 各占一角
3. **ANN 的本质是工程权衡**——精确最近邻是 NP 难类问题，工业界都用近似算法
4. **国产开源也能做到全球第一梯队**：Milvus 现在 GitHub 30k+ star，与 Pinecone 等闭源对手长期共存

## 延伸阅读

- 官方文档：[milvus.io](https://milvus.io/docs)（中英双语，例子完整）
- 论文：[Milvus: A Purpose-Built Vector Data Management System (SIGMOD 2021)](https://www.cs.purdue.edu/homes/csjgwang/pubs/SIGMOD21_Milvus.pdf)（讲设计哲学）
- HNSW 原论文：[Malkov & Yashunin 2018](https://arxiv.org/abs/1603.09320)（图索引的数学基础）
- [[clip]] —— 图文统一向量化模型，Milvus 最常见的输入源
- [[chroma]] —— 同赛道轻量竞品，本地小项目首选

## 关联

- [[clip]] —— OpenAI 把"图 + 文"统一到同一向量空间，Milvus 把这些向量存起来
- [[postgresql]] —— 关系库代表，Milvus 在 API 设计上学了它（create / insert / search）
- [[chroma]] —— 同赛道开源向量库，定位更轻量，Milvus 走集群路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ann-benchmarks]] —— ANN-Benchmarks — 近似最近邻算法的统一擂台
- [[chroma]] —— Chroma — Python 优先的向量数据库
- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[faiss]] —— FAISS — 向量检索的标准件库
- [[filip-2021]] —— FILIP — 把 CLIP 的图文对齐细化到 token 级
- [[haystack-2010]] —— Haystack — Facebook 十亿张照片怎么存
- [[hnswlib]] —— hnswlib — HNSW 论文作者写的参考实现，业界向量库都基于它
- [[lancedb]] —— LanceDB — 嵌入式向量库（进程内 + 对象存储）
- [[langchain]] —— LangChain — LLM 应用开发框架
- [[milvus-2021]] —— Milvus — 为向量检索而生的数据库
- [[mongo]] —— MongoDB — 文档数据库服务端开源实现
- [[opensearch]] —— OpenSearch — AWS 主导的 Apache 2.0 搜索引擎分叉
- [[pgvector]] —— pgvector — PostgreSQL 向量扩展
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[qdrant]] —— Qdrant — Rust 向量数据库
- [[rag-lewis-2020]] —— RAG (Lewis 2020) — 检索增强生成奠基
- [[vespa]] —— Vespa — Yahoo 检索 + 排序引擎
- [[weaviate]] —— Weaviate — 模块化向量数据库

