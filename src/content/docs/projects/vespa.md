---
title: Vespa — Yahoo 检索 + 排序引擎
来源: https://github.com/vespa-engine/vespa
日期: 2026-06-01
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

Vespa 是一个**把"倒排索引 + 向量检索 + 结构化过滤 + 机器学习排序模型"塞进同一台引擎、并且单条查询能在毫秒级跑完整套流程**的开源服务系统。

日常类比：

- [[elasticsearch]] 像图书馆的查目员——按关键词找书，顺手算个相关度分数
- 向量库（[[milvus]] / [[qdrant]] / [[weaviate]]）像"以图搜图"机器——只会比相似度
- Vespa 像电商首页背后的智能推荐人——同时考虑"你输入了什么词、过去点过什么、库存还有没有、广告主出价多少"，最后用一个机器学习模型把所有信号融合，几十毫秒返回排序好的结果

Vespa 在 Yahoo 内部用了二十多年（搜索、邮件、新闻、广告、推荐都跑在它上面），2017 年以 Apache 2.0 开源，2023 年独立成公司。

## 为什么重要

理解 Vespa 比"知道又一个搜索引擎"价值大，因为它是少数几个**把"找回 + 排序"当一件事来设计**的开源系统：

- **推荐系统**默认架构（召回 → 粗排 → 精排）在 Vespa 里就是一份配置，不用拼三个服务
- **混合检索**（关键词 + 向量）现在是 RAG 标配，Vespa 早就把两者放进一个查询里
- **一阶段廉价、二阶段深模型**是工业排序的标准做法（参考 [[colbert-2020]] 的迟交互思路），Vespa 的两阶段 rank profile 把这个思路做成 schema 字段
- **写入即可查**——不像 Elasticsearch 要等 refresh 才能搜到刚写的文档，对在线广告 / 实时推荐场景关键
- 用户：Spotify 个性化、Pinterest、Vinted、OkCupid、Yahoo Mail 搜索

## 核心要点

理解 Vespa 抓四个概念就够：

### 文档 schema（.sd 文件）

每个字段声明三件事：**类型、索引方式、出现在哪个 rank profile**。比如标题字段可以同时建倒排索引（关键词检索用）+ 存稠密向量（语义检索用）+ 当作 rank 模型特征。冷启动靠这份配置文件驱动。

### 两阶段排序（rank profile）

每条查询命中文档后跑两轮：

- **first-phase**：在 content 节点本地跑，必须便宜——BM25、向量点积、字段加权和
- **second-phase**：把 first-phase 选出的 top-N（默认 100）送回 container 节点，跑昂贵函数——XGBoost / LightGBM / ONNX 神经网络精排

这一招让你能用 BERT 级模型排序但延迟仍在 50ms 内。

### 张量（tensor）一等公民

Vespa 内置稠密 + 稀疏张量类型，rank 表达式就是张量代数。比如可以写"用户向量 × 文档向量 + 类目 onehot × 偏置"这种打分函数，不必先序列化到外部 ML 服务。

### 拓扑：content + container + admin

- **content node** 存数据、跑一阶段 rank，按 bucket 分布到多机
- **container node** 接 HTTP / gRPC，做查询路由 + 二阶段 rank + 业务逻辑（Java 写）
- **admin / config server** 管 schema 部署和拓扑变更

## 实践案例

### 案例 一：本地起一个单节点

```bash
docker run -d --name vespa --hostname vespa-tutorial \
  -p 8080:8080 -p 19071:19071 \
  vespaengine/vespa:latest
```

等 30 秒，访问 `http://localhost:19071/state/v1/health` 返回 ok 即就绪。

### 案例 二：写一个最小 schema

```text
schema doc {
  document doc {
    field title type string { indexing: index | summary }
    field embedding type tensor<float>(x[384]) {
      indexing: attribute | index
      attribute { distance-metric: angular }
      index { hnsw { max-links-per-node: 16 } }
    }
  }

  rank-profile hybrid {
    first-phase {
      expression: bm25(title) + closeness(field, embedding)
    }
  }
}
```

这一份文件让 title 同时支持关键词检索和向量近邻（HNSW，参考 [[hnsw-2018]]），`hybrid` rank profile 用相加方式做最朴素的混合排序。

### 案例 三：查询 = YQL + rank 选择

```json
{
  "yql": "select * from doc where userInput(@q) or ({targetHits:50}nearestNeighbor(embedding,q_emb))",
  "ranking.profile": "hybrid",
  "input.query(q_emb)": [0.12, -0.04, "..."],
  "q": "深度学习推荐"
}
```

YQL 同时表达"关键词命中 OR 向量 top-50 邻居"，rank profile 决定怎么打分。

### 案例 四：把 ONNX 模型挂上去做精排

```text
rank-profile deep inherits hybrid {
  second-phase {
    rerank-count: 100
    expression: onnx(reranker).score
  }
  onnx-model reranker {
    file: models/cross-encoder.onnx
    input input_ids: tokens
  }
}
```

first-phase 用 BM25 + 向量选 100 篇，second-phase 跑 cross-encoder 神经网络精排。这就是工业级语义搜索的常见架构。

## 踩过的坑

1. **学习曲线比 Elasticsearch 陡**：schema 用自定义 DSL（.sd 文件）、查询用 YQL、配置用 application package + zip 上传，没有"开箱发 JSON 就能搜"的那种顺手感

2. **两份语言**：content 层 C++、container 层 Java——加自定义打分逻辑要懂 Java；想看核心索引代码要懂 C++ 模板地狱

3. **资源吃得多**：单节点起步要 4GB 内存才舒服；Elasticsearch 单节点 1GB 能凑合，开发机装 Vespa 容易卡

4. **社区比 ES 小一个数量级**：Stack Overflow 答案少、ChatGPT 回答常常胡编 schema 语法。官方文档要硬啃

5. **bucket 再平衡踩坑**：扩容加节点后数据迁移有时打满网卡，需要调 `merge-throttling-policy`，文档藏得深

## 适用 vs 不适用场景

**适用**：

- **推荐 / 广告 / 个性化**——召回 + 粗排 + 精排在一个引擎里，延迟可控
- **混合检索（RAG / 语义搜索）**——倒排 + 向量 + 过滤一体，比"ES + 单独向量库"运维简单
- **写入即查**——实时商品库存、实时排序信号
- **要把 ML 模型做线上排序**——XGBoost / ONNX 直接跑，不用外挂 service

**不适用**：

- **日志聚合 / 可观测性**——选 [[elasticsearch]] 或 [[opensearch]]，Vespa 不是为这设计
- **小项目 / 原型**——schema 配置成本远高于"装个 ES 发 JSON"
- **只要纯向量检索**——选 [[milvus]] / [[qdrant]] / [[weaviate]]，更轻
- **强 SQL 分析**——选列存数据仓，Vespa 不是 OLAP

## 历史小故事（可跳过）

- **2003**：Yahoo 收购挪威搜索引擎 Fast Search & Transfer 的核心团队，整合成 Yahoo 内部统一 serving 平台
- **2010 前后**：Yahoo Mail / News / Search / Ads 全部搬到这套引擎，每天处理千亿次查询
- **2017-05**：Apache 2.0 开源，命名 Vespa
- **2020 年起**：加 HNSW ANN，开始追向量浪潮
- **2022+**：tensor 类型 + ONNX 跑深度模型成标配，与 ColBERT 等迟交互模型契合（参考 [[colbert-2020]] / [[colbert-v2]]）
- **2023**：Vespa.ai 从 Yahoo 拆出独立成公司

## 学到什么

1. **检索 + 排序应该一起设计**——拆成两个服务往往输在跨网络延迟和特征不一致
2. **两阶段 rank 是工业默认**——一阶段廉价召回，二阶段昂贵精排，源自信息检索几十年共识
3. **配置驱动 vs API 驱动**——Vespa 选了配置驱动（schema 文件 + zip 包部署），上手陡但运维稳；ES 选了 API 驱动，反过来
4. **向量不是新东西**——Vespa 把张量做成一等公民比当下大火的"向量库"早很多年，老系统的设计有时候是后来者的天花板

## 延伸阅读

- 官方教程：[Vespa Quickstart](https://docs.vespa.ai/en/getting-started.html)（30 分钟跑通混合检索）
- 论文式总结：[Vespa.ai blog — Hybrid search](https://blog.vespa.ai/hybrid-search-explained/)
- 推荐系统视角：[Yahoo Research — Personalization at Scale](https://research.yahoo.com/)
- 源码导读：[github.com/vespa-engine/vespa](https://github.com/vespa-engine/vespa) → `searchcore/`（C++ 核心）+ `container-search/`（Java 路由层）

## 关联

- [[elasticsearch]] —— 同样是搜索引擎，更偏日志分析；Vespa 偏排序 / 推荐
- [[opensearch]] —— ES 的 Apache 分叉
- [[milvus]] —— 纯向量库，做语义召回；Vespa 是把向量当作多种信号之一
- [[qdrant]] —— Rust 写的向量库，更轻
- [[weaviate]] —— 模块化向量库，与 Vespa 思路重叠
- [[tantivy]] —— Rust 重写的 Lucene，单机搜索引擎库
- [[bm25-okapi]] —— Vespa first-phase 默认排序函数
- [[hnsw-2018]] —— Vespa 向量索引的算法基础
- [[colbert-2020]] —— 迟交互模型，可以跑在 Vespa second-phase 做语义精排
- [[youtube-two-tower-2019]] —— 推荐系统召回模型，Vespa 是承载它做线上检索的引擎之一
