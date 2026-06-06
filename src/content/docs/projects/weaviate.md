---
title: Weaviate — 模块化向量数据库
来源: https://github.com/weaviate/weaviate
日期: 2026-05-29
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

Weaviate 是荷兰 Weaviate 公司 2019 年用 Go 写的**模块化向量数据库**——内置 OpenAI / Cohere / HuggingFace 等向量化模块，存原始数据时**自动调 embedding 模型**生成向量，不用你写一行向量化代码。

日常类比：[[milvus]] / [[qdrant]] 像普通冰箱——你买菜回家自己洗、切、贴标签，再放进去；Weaviate 像**智能冰箱**——你扔进食物它自动识别、贴标签（embedding），放进对应分区。

你写：

```python
client.data_object.create({"title": "太空探索"}, "Article")
```

Weaviate 内部自动调 OpenAI API 把这句话变成 1536 维向量，再存。**你只管业务数据，向量化它包了**。

## 为什么重要

不理解 Weaviate，下面这些事都难解释：

- 为什么有人**不写 embedding pipeline** 也能做语义搜索——Weaviate 把 embedding 调用内置成"模块"
- 为什么向量数据库能用 **GraphQL 查询**而不是 SQL / REST——Weaviate 选了 GraphQL 表达"标量过滤 + 向量近邻"组合
- 为什么向量数据库会形成 **Weaviate / [[milvus]] / [[qdrant]] / Pinecone 四强**——各家定位不同（模块化 / 性能 / 简洁 / 托管）
- 为什么开源项目能做云服务赚钱——Weaviate Cloud + 开源双轨是 2020 年代基础设施公司标配

## 核心要点

Weaviate 的设计可以拆成 **三个核心概念**：

1. **Class（数据类）**：类似 [[postgresql]] 的表——定义字段名、类型、向量化方式。例如 Article 类有 title / content / publishDate 字段。

2. **Module（模块）**：插件式架构——`text2vec-openai` 模块负责把文本调 OpenAI API 转向量；`text2vec-cohere` 走 Cohere；`generative-openai` 在查询结果上跑 GPT 生成。**换模块不用改业务代码**。

3. **GraphQL Query**：统一接口同时查标量字段 + 向量近邻。例如 `nearText: {concepts: ["space"]}` 让 Weaviate 自动把 "space" 转向量再检索。

三个加起来叫 **"vector-native + AI-native"** 设计。

## 实践案例

### 案例 1：Docker 一行起本地 Weaviate

```bash
docker run -p 8080:8080 \
  -e ENABLE_MODULES=text2vec-openai \
  -e OPENAI_APIKEY=sk-xxx \
  semitechnologies/weaviate
```

启动后 8080 端口暴露 GraphQL + REST API。**ENABLE_MODULES 决定加载哪些模块**——这一步是 Weaviate 与其他向量库最大区别。

### 案例 2：创建 Class（自动向量化）

```python
client.schema.create_class({
    "class": "Article",
    "vectorizer": "text2vec-openai",
    "properties": [
        {"name": "title", "dataType": ["text"]},
        {"name": "content", "dataType": ["text"]}
    ]
})

# 存数据时不用传向量
client.data_object.create(
    {"title": "Mars exploration", "content": "..."},
    "Article"
)
```

Weaviate 收到对象后**自动调 OpenAI API** 把 title + content 拼起来转向量，存进 HNSW 索引。

### 案例 3：GraphQL 语义查询

```graphql
{
  Get {
    Article(
      nearText: {concepts: ["space"]}
      limit: 5
    ) {
      title
      content
      _additional { distance }
    }
  }
}
```

Weaviate 把 "space" 实时转向量，HNSW 找最近的 5 篇文章返回。**查询里不出现向量** —— 这是 GraphQL + 模块化组合的力量。

## 踩过的坑

1. **模块依赖**：用 `text2vec-transformers` 本地模块时，要在 docker-compose 里**额外起一个 transformers 容器**。新人常以为 Weaviate 单容器够用，结果启动时报 "vectorizer service unreachable"。

2. **GraphQL 学习曲线**：习惯 REST / SQL 的人初次写 `Get { Article(nearText: {...}) }` 容易卡住——大括号嵌套、`_additional` 取元数据的语法都要专门学。

3. **Multi-tenancy 性能规划**：v1.20+ 支持每个 tenant 独立 shard，但 **tenant 数 > 10 万时**冷启动慢、内存占用高。要提前做容量规划。

4. **Hybrid search 调权重**：`hybrid: {query: "...", alpha: 0.5}` 的 alpha 是 BM25 vs 向量的权重——0.5 看似平均，实际语义偏强场景要 0.7+，关键词偏强要 0.3-。**没有通用值，要靠业务样本调**。

## 适用 vs 不适用场景

**适用**：
- RAG 应用——文档存进去自动 embed，无需写向量化 pipeline
- 多模态搜索——`multi2vec-clip` 模块支持文本 + 图片同空间
- 团队不想维护 embedding 服务——模块化设计降低运维成本
- 需要标量过滤 + 向量检索组合——GraphQL 表达力强

**不适用**：
- 极致写入吞吐场景（百万 QPS）→ 用 [[milvus]] 集群
- 已有成熟 embedding pipeline → 模块化反而增加层级
- 团队完全没用过 GraphQL → 学习成本高，可考虑 [[qdrant]] 的 REST API
- 单机超大规模（10 亿+ 向量） → Weaviate 分布式不如 Milvus 成熟

## 历史小故事（可跳过）

- **2019 年**：荷兰 SeMI Technologies 公司创立 Weaviate 项目。"SeMI" 来自 "Semantic Machine Intelligence"，从一开始就主打"语义"而非"纯向量"。
- **2021 年**：公司改名 Weaviate，专注向量数据库赛道。同年 v1.0 发布。
- **2023 年**：v1.20 加入 Multi-tenancy（多租户）支持，每个 tenant 独立 shard——给 SaaS 场景关键能力。
- **2024 年**：v1.27 引入 BlockMax WAND（Weak AND）算法加速 BM25 检索——让 hybrid search 性能跳一档。
- **2024 年**：Weaviate Cloud Services（WCS）成熟商业化，开源 + 托管双轨。

之后向量数据库赛道与 Pinecone / [[milvus]] / [[qdrant]] 四强格局基本稳定。

## 学到什么

1. **"向量化即服务"是一种产品哲学**——把 embedding 调用从应用层下沉到数据库层，是 Weaviate 与同行最大的差异点
2. **GraphQL 适合"组合查询"**——标量过滤 + 向量近邻在一个查询里表达，比 REST 自然
3. **模块化设计的代价**——灵活性强但部署复杂；要在 "易上手" 和 "可扩展" 之间权衡
4. **开源 + 云双轨是 2020s 基础设施公司常态**——开源做生态，云做收入

## 延伸阅读

- 官方文档：[Weaviate Docs](https://weaviate.io/developers/weaviate)（教程 + API 参考）
- GitHub 仓库：[weaviate/weaviate](https://github.com/weaviate/weaviate)（Go 源码 + issue 区）
- 性能基准：[ANN Benchmarks](https://ann-benchmarks.com/)（Weaviate / [[milvus]] / [[qdrant]] 公平对比）

## 关联

- [[milvus]] —— 同为向量数据库四强，定位"高性能集群"，与 Weaviate "模块化" 形成对比
- [[qdrant]] —— Rust 写的轻量级向量库，REST API 简洁，与 Weaviate GraphQL 思路相反
- [[postgresql]] —— Weaviate 的 Class 概念类似 PostgreSQL 的表

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[milvus]] —— Milvus — 开源向量数据库
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[qdrant]] —— Qdrant — Rust 向量数据库
- [[vespa]] —— Vespa — Yahoo 检索 + 排序引擎

