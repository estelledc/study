---
title: Weaviate — 模块化向量数据库
来源: https://github.com/weaviate/weaviate
日期: 2026-05-29
分类: 数据库 / 向量
难度: 中级
---

## 是什么

Weaviate 是荷兰 Weaviate 公司 2019 年用 Go 写的**模块化向量数据库**——内置 OpenAI / Cohere / HuggingFace 等向量化模块，存原始数据时**自动调 embedding 模型**生成向量，不用你单独写向量化流水线。

日常类比：[[milvus]] / [[qdrant]] 像普通冰箱——你买菜回家自己洗、切、贴标签，再放进去；Weaviate 像**智能冰箱**——你扔进食物它自动识别、贴标签（embedding），放进对应分区。

你写（weaviate-client v4）：

```python
articles.data.insert({"title": "太空探索"})
```

Weaviate 内部自动调 OpenAI API 把这句话变成向量再存。**你只管业务数据，向量化它包了**。

## 为什么重要

不理解 Weaviate，下面这些事都难解释：

- 为什么有人**不写 embedding pipeline** 也能做语义搜索——Weaviate 把 embedding 调用内置成"模块"
- 为什么向量数据库能用 **GraphQL 查询**而不是 SQL / REST——用 GraphQL 表达"标量过滤 + 向量近邻"组合更自然
- 为什么常把 **Weaviate / [[milvus]] / [[qdrant]] / Pinecone** 放一起比——定位分别偏模块化 / 集群性能 / 简洁 API / 托管
- 为什么开源项目能做云服务赚钱——Weaviate Cloud + 开源双轨是 2020 年代基础设施公司常见路径

## 核心要点

Weaviate 的设计可以拆成 **三个核心概念**：

1. **Class / Collection（数据类）**：类似 [[postgresql]] 的表——定义字段名、类型、向量化方式。例如 Article 有 title / content 字段。

2. **Module（模块）**：插件式架构——`text2vec-openai` 调 OpenAI 转向量；`text2vec-cohere` 走 Cohere；`generative-openai` 在结果上跑生成。**换模块不用改业务代码**。

3. **GraphQL Query**：统一接口同时查标量字段 + 向量近邻。例如 `nearText: {concepts: ["space"]}` 让 Weaviate 先把 "space" 转向量再检索。

三个加起来叫 **"vector-native + AI-native"** 设计。

## 实践案例

### 案例 1：Docker 起本地 Weaviate

```bash
docker run -p 8080:8080 \
  -e AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED=true \
  -e ENABLE_MODULES=text2vec-openai \
  -e OPENAI_APIKEY=sk-xxx \
  semitechnologies/weaviate
```

三步：① 开匿名访问，本地不用先配 API Key 鉴权；② `ENABLE_MODULES` 决定加载哪些向量化模块——这是与其他向量库最大区别；③ 8080 暴露 GraphQL + REST。

### 案例 2：创建 Collection（自动向量化，v4）

```python
import weaviate
from weaviate.classes.config import Configure, Property, DataType

client = weaviate.connect_to_local()
client.collections.create(
    name="Article",
    vectorizer_config=Configure.Vectorizer.text2vec_openai(),
    properties=[
        Property(name="title", data_type=DataType.TEXT),
        Property(name="content", data_type=DataType.TEXT),
    ],
)
client.collections.get("Article").data.insert(
    {"title": "Mars exploration", "content": "..."}
)
```

三步：① `create` 声明类与向量化器；② `insert` 只传原文、不传向量；③ Weaviate 调 OpenAI 拼 title+content 转向量，写入 **HNSW**（像把相似书放邻近书架的近邻索引）。

### 案例 3：GraphQL 语义查询

```graphql
{
  Get {
    Article(nearText: {concepts: ["space"]}, limit: 5) {
      title
      content
      _additional { distance }
    }
  }
}
```

三步：① `nearText` 把 "space" 实时转向量；② HNSW 找最近 5 篇；③ `_additional.distance` 看有多近。**查询里不出现向量**——这是 GraphQL + 模块化的组合力量。

## 踩过的坑

1. **模块依赖**：用 `text2vec-transformers` 时要在 docker-compose 里**额外起 transformers 容器**，否则报 "vectorizer service unreachable"。
2. **GraphQL 学习曲线**：习惯 REST / SQL 的人初次写 `Get { Article(nearText: {...}) }` 容易卡在大括号嵌套和 `_additional`。
3. **Multi-tenancy 容量**：v1.20+ 每 tenant 独立 shard，**tenant 数 > 10 万**时冷启动慢、内存高，要提前规划。
4. **Hybrid 权重**：`hybrid: {query: "...", alpha: 0.5}` 里 alpha 是 **BM25（关键词打分）vs 向量** 的权重——语义偏强用 0.7+，关键词偏强用 0.3-，没有通用值。

## 适用 vs 不适用场景

**适用**：
- RAG 应用——文档存进去自动 embed，无需自建向量化 pipeline
- 多模态搜索——`multi2vec-clip` 支持文本 + 图片同空间
- 团队不想维护 embedding 服务——模块化降低运维成本
- 需要标量过滤 + 向量检索组合——GraphQL 表达力强

**不适用**：
- 极致写入吞吐（百万 QPS 级）→ 用 [[milvus]] 集群
- 已有成熟 embedding pipeline → 模块层反而多余
- 团队完全没用过 GraphQL → 学习成本高，可考虑 [[qdrant]] REST
- 单机超大规模（10 亿+ 向量）→ 分布式成熟度不如 Milvus

## 历史小故事（可跳过）

- **2019 年**：荷兰 SeMI Technologies 创立 Weaviate。"SeMI" 来自 Semantic Machine Intelligence，主打语义而非纯向量。
- **2021 年**：公司改名 Weaviate，同年 v1.0 发布。
- **2023 年**：v1.20 加入 Multi-tenancy，每 tenant 独立 shard，面向 SaaS。
- **2024–2025 年**：BlockMax WAND 于 v1.29 技术预览、v1.30 正式默认，加速 BM25 / hybrid。
- **同期**：Weaviate Cloud 商业化，开源 + 托管双轨；与 Pinecone / [[milvus]] / [[qdrant]] 常被放在同一对比组。

## 学到什么

1. **"向量化即服务"是产品哲学**——embedding 从应用层下沉到数据库层，是 Weaviate 与同行最大差异
2. **GraphQL 适合组合查询**——标量过滤 + 向量近邻在一个查询里表达，比 REST 自然
3. **模块化有代价**——灵活但部署更复杂，要在易上手与可扩展之间权衡
4. **开源 + 云双轨**是 2020s 基础设施公司常态——开源做生态，云做收入

## 延伸阅读

- 官方文档：[Weaviate Docs](https://weaviate.io/developers/weaviate)（教程 + API）
- GitHub：[weaviate/weaviate](https://github.com/weaviate/weaviate)（Go 源码）
- 性能基准：[ANN Benchmarks](https://ann-benchmarks.com/)（与 [[milvus]] / [[qdrant]] 对比）
- 相关笔记：[[milvus]]、[[qdrant]]、[[vespa]]

## 关联

- [[milvus]] —— 向量库对比组里偏高性能集群，对照 Weaviate 的模块化
- [[qdrant]] —— Rust 轻量向量库，REST 简洁，对照 GraphQL 路线
- [[postgresql]] —— Class / Collection 概念类似表
- [[vespa]] —— 检索 + 排序引擎，另一条"搜索即平台"路线
- [[faiss]] —— Meta 向量近邻库，常被嵌进自建 pipeline，对照"库内向量化"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[llama-index]] —— LlamaIndex — 给大模型接上私有资料库
- [[qdrant]] —— Qdrant — Rust 向量数据库
- [[vespa]] —— Vespa — Yahoo 检索 + 排序引擎
