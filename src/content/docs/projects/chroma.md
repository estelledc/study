---
title: Chroma — Python 优先的向量数据库
来源: https://github.com/chroma-core/chroma
日期: 2026-05-29
分类: 数据库 / 向量
难度: 中级
---

## 是什么

Chroma 是 Anthropic 前员工 Jeff Huber 2023 年开源的"开发者优先"向量数据库。

日常类比：

- [[milvus]] / [[qdrant]] 像**大型仓库**——要起 Docker、要配集群、要管 schema，部署本身就是一个项目
- Chroma 像**手提包大小的库**——`pip install chromadb` 一行命令，进 Python 进程就能用，不用启服务

它的目标用户是**正在写 RAG demo 的开发者**：你只想验证"把这堆 markdown 灌进去能不能问出来"，不想先花一天部署一个数据库。Chroma 把启动成本压到了 5 行 Python。

它和 [[langchain]] / [[llamaindex]] 这两个最流行的 LLM 框架深度集成——这两个库的官方教程默认拿 Chroma 当存储后端。

## 为什么重要

- **入门 RAG 最简单**——`new Collection / add / query` 三个 API 就够了，新人不用理解什么是 embedding 维度、什么是 HNSW
- **embedding 自动化**——你给文字，Chroma 调 OpenAI / HuggingFace 算向量，把"文字 → 向量"这步藏起来
- **双轨部署**：本地 embedded 模式（`pip install` 进程内）和远端 server 模式（`chroma run`）共用同一套 API，从 demo 升级到 prod 几乎不用改代码
- **Apache 2.0 + Chroma Cloud**：开源够用，不够用付钱上云，商业模式清晰

## 核心要点

理解 Chroma 只需要抓住 3 个抽象：

1. **Collection（集合）**：一组向量 + metadata + 原文档的容器。类比关系数据库的"表"，但你 insert 的是文字、Chroma 自动算出向量并存起来。
2. **自动 embedding**：你只 `add(documents=["hello"])`，Chroma 调你配置的 embedding 函数（OpenAI / SentenceTransformer / 自定义）算出 1536 维（或别的）向量。换 embedding 模型只需要改一行 `embedding_function=...`。
3. **Filter（过滤器）**：`query()` 同时支持向量相似度（`query_texts`）和标量条件（`where={"author": "Jason"}`），把 SQL `WHERE` 和 ANN 检索拼到一个调用里——这是 RAG 真实场景里最常用的组合。

## 实践案例

### 案例 1：4 行代码起一个 RAG 后端

```python
import chromadb
client = chromadb.Client()
col = client.create_collection("docs")
col.add(documents=["hello"], ids=["1"])
col.query(query_texts=["hi"])
```

**逐行解释**：

- `chromadb.Client()` 起一个内存里的临时 client（进程退出就没了）
- `create_collection` 建一张"表"，默认 embedding 函数是本地 ONNX 跑的 `all-MiniLM-L6-v2`
- `add` 把文字 `"hello"` 灌进去，Chroma 自动算 384 维向量并和 `id=1` 一起存
- `query` 输入 `"hi"`，Chroma 算它的向量、做 ANN 检索、返回最相似的文档

整个流程**没出现一个数据库术语**——这就是 Chroma 的设计哲学。

### 案例 2：持久化到磁盘

```python
client = chromadb.PersistentClient(path="./db")
```

把 `Client()` 换成 `PersistentClient(path=...)`，数据就落到 `./db/chroma.sqlite3` 和一组 binary 文件。下次进程启动 `PersistentClient(path="./db")` 自动 reload。

底层是 SQLite 存元数据 + hnswlib 存向量索引——两个嵌入式库的组合，没有任何外部进程。

### 案例 3：接 OpenAI embedding

```python
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction

ef = OpenAIEmbeddingFunction(api_key="sk-...", model_name="text-embedding-3-small")
col = client.create_collection("docs", embedding_function=ef)
```

只换 `embedding_function`，业务代码不动。你想换成 Cohere / HuggingFace / 自己 finetune 的模型，写一个继承 `EmbeddingFunction` 的类即可——这是 Chroma 把"算 embedding"做成 plugin 的关键设计。

## 踩过的坑

1. **嵌入式 SQLite 文件大了会慢**——单机几 GB 数据后，metadata 查询和索引 reload 速度都开始退化。这不是 Chroma 的 bug，是 SQLite 的固有限制；过线后要走 server 模式。

2. **百万级以上向量需要迁移到 server / distributed 模式**——本地 hnswlib 索引内存常驻，一个 100 万 × 1536 维的 collection 就要 6GB+ RAM，本地 16GB MacBook 跑不了几个。

3. **换 embedding 模型 = 整个 collection 重 embed**——Chroma 不会自动重算。你把 `text-embedding-ada-002` 换成 `text-embedding-3-small`，旧数据的向量维度对不上，要 dump 文档 → 重建 collection → 重 add。

4. **集群 / 分布式弱于 [[milvus]] / [[qdrant]]**——这两个一开始就为分布式设计；Chroma 的 distributed 模式（Rust 内核）是 2024 后补的，多 region / 高吞吐场景成熟度不如它们。

## 适用 vs 不适用场景

**适用**：

- 个人 RAG demo / 小团队原型——5 行起一个本地后端，省掉 Pinecone 注册和 Docker 编排
- 100 万以下向量、单机能装下的场景——hnswlib 性能够用、运维成本几乎为零
- 想本地保密数据、不愿上云的 LLM 应用——`PersistentClient` 把所有数据留在你机器上
- 已经在用 [[langchain]] / [[llamaindex]]——它们默认就支持 Chroma，省一层适配

**不适用**：

- 亿级向量 / 多 region / 高写入吞吐——选 [[milvus]] 或 [[qdrant]]
- 已有 Postgres 想复用基础设施——选 pgvector，少装一套服务
- 企业级混合检索（向量 + 关键字 + GraphQL filter）——选 Weaviate
- 不想自己运维想全托管——选 Pinecone（serverless 体验最佳）

## 历史小故事（可跳过）

- **2022 年底**：Jeff Huber（Anthropic 前员工）和 Anton Troynikov 看到 ChatGPT 之后 RAG 兴起，但开发者起一个 demo 都要先部署 Pinecone——他们觉得这件事应该像 SQLite 那么简单
- **2023-04**：Chroma 第一版开源，主打"`pip install chromadb` 5 行起 RAG"，YC W23 同期支持
- **2023 全年**：[[langchain]] / [[llamaindex]] 把 Chroma 收为默认向量存储，star 数一年内从 0 到 1 万
- **2024 v0.5**：加 multi-tenancy（一个 server 承载多个租户的 collection 隔离）
- **2024-Q4**：Chroma Cloud Beta 上线，托管服务和开源同源
- **2025 v1.0 GA**：Rust 内核做完，distributed 模式开放给企业用户

## 学到什么

1. **"工具 vs 服务"是产品设计的根本分水岭**——同样是向量数据库，做成 SDK（pip install）和做成 SaaS（注册账号）是两个完全不同的产品，目标用户也不同。
2. **嵌入式优先（embedded-first）是个被低估的策略**——SQLite、DuckDB、Chroma 都走这条路：先让用户在本地用得爽，再提供升级路径。开发者第一次接触就是 5 行代码 vs 30 分钟部署，留存率天差地别。
3. **embedding 应该是 plugin 而不是配置**——把"算向量"做成接口，让用户能自由换模型，是这类 SDK 长寿的关键。Chroma 现在支持 20+ embedding provider，全靠这个抽象。
4. **API 不变、部署形态可变** 是 SDK 设计的硬功夫——`Client` / `PersistentClient` / `HttpClient` / `CloudClient` 同一组方法、四种后端，用户从 demo 升 prod 不用重写代码。

## 延伸阅读

- 官方文档：[docs.trychroma.com](https://docs.trychroma.com/)（quickstart 5 分钟跑通）
- 创始人访谈：[Jeff Huber on Latent Space Podcast](https://www.latent.space/p/chroma)（讲为什么做 embedded-first）
- HNSW 算法（Chroma 本地索引内核）：[Yu Malkov 原论文](https://arxiv.org/abs/1603.09320)
- [[langchain]] —— LLM 应用框架，Chroma 是它默认向量存储之一
- [[llamaindex]] —— RAG 编排框架，同样默认支持 Chroma

## 关联

- [[langchain]] —— LLM 应用层框架，Chroma 是它的默认向量后端之一
- [[llamaindex]] —— RAG 检索编排层，与 Chroma 深度集成
- [[milvus]] —— 大规模分布式向量数据库，Chroma 在亿级场景的对照组
- [[qdrant]] —— Rust 高性能向量数据库，Chroma distributed 模式的同代竞品

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[realm]] —— REALM — 把检索器和 BERT 一起预训练的第一篇论文
- [[dgraph]] —— Dgraph — 分布式图数据库
- [[llama-index]] —— LlamaIndex — 给大模型接上私有资料库
- [[llamaindex]] —— LlamaIndex — LLM 数据框架
- [[meilisearch]] —— MeiliSearch — 开发者友好的搜索引擎
- [[memgraph]] —— Memgraph — 内存图数据库
- [[milvus]] —— Milvus — 开源向量数据库
- [[neo4j]] —— Neo4j — 主流图数据库
- [[pgvector]] —— pgvector — PostgreSQL 向量扩展
- [[qdrant]] —— Qdrant — Rust 向量数据库
