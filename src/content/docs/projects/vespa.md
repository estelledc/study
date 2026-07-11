---
title: Vespa — Yahoo 检索 + 排序引擎
来源: https://github.com/vespa-engine/vespa
日期: 2026-06-01
分类: 数据库 / 搜索 / 推荐
难度: 中级
---

## 是什么

Vespa 是一个**把"倒排索引 + 向量检索 + 结构化过滤 + 机器学习排序"塞进同一引擎、单条查询毫秒级跑完**的开源服务系统。

日常类比：

- [[elasticsearch]] 像图书馆查目员——按关键词找书，顺手打个相关度分
- 向量库（[[milvus]] / [[qdrant]] / [[weaviate]]）像"以图搜图"机器——只会比相似度
- Vespa 像电商首页背后的推荐人——同时看关键词、点击历史、库存、出价，再用机器学习模型融合打分

Yahoo 内部用了二十多年（搜索、邮件、新闻、广告、推荐），2017 年 Apache 2.0 开源，2023 年独立成公司 Vespa.ai。

## 为什么重要

理解 Vespa 比"又一个搜索引擎"价值大，因为它是少数**把"找回 + 排序"当一件事设计**的开源系统：

- **推荐默认架构**（召回 → 粗排 → 精排）在 Vespa 里是一份配置，不用拼三个服务
- **混合检索**（关键词 + 向量）是 RAG 标配，Vespa 早就放进同一条查询
- **一阶段廉价、二阶段深模型**是工业排序标准做法（参考 [[colbert-2020]]），做成 schema 里的 rank profile
- **写入即可查**——不像 Elasticsearch 要等 refresh，对在线广告 / 实时推荐关键
- 用户：Spotify、Pinterest、Vinted、OkCupid、Yahoo Mail 搜索

## 核心要点

抓三个概念就够：

1. **文档 schema（.sd 文件）**：每个字段声明类型、怎么建索引、进哪个打分公式。类比：一张菜谱——食材（字段）写清切法（索引）和上桌顺序（rank）。标题可同时建倒排（关键词）+ 存向量（语义）+ 当排序特征。

2. **分阶段排序（rank profile）**：命中后先跑 **first-phase**（content 节点本地，必须便宜：BM25 关键词分、向量点积）；再跑 **second-phase**（仍在 content 节点，对本地 top-N 重排，适合 XGBoost 等）；最贵的模型用 **global-phase**（container 上对全局合并后的 top-K 精排，适合 ONNX 神经网络）。类比：海选 → 复赛 → 决赛，越往后选手越少、评委越严。

3. **拓扑：content + container + admin**：**content** 存数据、跑一/二阶段 rank，按 bucket（数据分片）分布；**container** 接 HTTP/gRPC、路由查询、跑 global-phase；**admin/config** 管 schema 部署。张量（tensor）是一等公民——rank 表达式可直接写"用户向量 × 文档向量"。

## 实践案例

### 案例 1：起服务 + 最小 hybrid schema

```bash
docker run -d --name vespa --hostname vespa-tutorial \
  -p 8080:8080 -p 19071:19071 vespaengine/vespa:latest
# 等就绪：curl http://localhost:19071/state/v1/health
```

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

**逐部分解释**：

1. Docker 只起引擎；真正可查还要把含 `.sd` 的 application package 打成 zip，POST 到 `19071` 部署
2. `title` 建倒排索引（像书的目录）；`embedding` 用 HNSW（[[hnsw-2018]]，近邻图）做向量近邻
3. `hybrid` 的 first-phase 把 BM25（关键词相关度）和向量接近度相加——最朴素的混合排序

### 案例 2：YQL 查询 = 关键词 OR 向量邻居

```json
{
  "yql": "select * from doc where userInput(@q) or ({targetHits:50}nearestNeighbor(embedding,q_emb))",
  "ranking.profile": "hybrid",
  "input.query(q_emb)": [0.12, -0.04, 0.0],
  "q": "深度学习推荐"
}
```

**逐部分解释**：

1. YQL 是 Vespa 的查询语言（像给引擎写的 SQL 方言）
2. `userInput(@q)` 走关键词；`nearestNeighbor` 取向量 top-50
3. `ranking.profile: hybrid` 决定用哪套打分；喂文档后 `POST /search/` 即可验证

### 案例 3：global-phase 挂 ONNX 做精排

```text
rank-profile deep inherits hybrid {
  global-phase {
    rerank-count: 20
    expression: onnx(reranker).score
  }
  onnx-model reranker {
    file: models/cross-encoder.onnx
    input input_ids: tokens
  }
}
```

**逐部分解释**：

1. first-phase 在各 content 节点廉价筛候选；合并后再进 global-phase
2. `rerank-count: 20` 只对全局前 20 跑昂贵模型，延迟可控（常目标 <50ms）
3. ONNX 是可移植神经网络格式；cross-encoder 适合决赛精排，不要误挂在 second-phase

## 踩过的坑

1. **学习曲线比 ES 陡**：`.sd` + YQL + application package zip 上传，没有"发 JSON 就能搜"的顺手感
2. **两份语言**：content 层 C++、container 层 Java——自定义逻辑要懂 Java，核心索引是 C++ 模板
3. **资源吃得多**：单节点建议 ≥4GB 内存；ES 1GB 能凑合，开发机容易卡
4. **扩容打满网卡**：加节点后 bucket 再平衡要调 `merge-throttling-policy`，文档藏得深

## 适用 vs 不适用场景

**适用**：

- **推荐 / 广告 / 个性化**——召回+粗排+精排一体，P99 常可压到几十毫秒
- **混合检索（RAG）**——倒排+向量+过滤一体，比"ES + 单独向量库"运维简单
- **写入即查**——实时库存、实时排序信号
- **线上 ML 排序**——XGBoost 放 second-phase，大 ONNX 放 global-phase

**不适用**：

- **日志聚合**——选 [[elasticsearch]] / [[opensearch]]
- **小项目 / 原型**——schema 成本远高于"装个 ES 发 JSON"
- **只要纯向量**——选 [[milvus]] / [[qdrant]] / [[weaviate]]，更轻
- **强 SQL 分析**——选列存数仓，Vespa 不是 OLAP

## 历史小故事（可跳过）

- **2003**：Yahoo 整合挪威 Fast Search 相关团队，做成内部统一 serving 平台
- **2010 前后**：Yahoo Mail / News / Search / Ads 迁到这套引擎，支撑超大规模在线查询
- **2017-05**：Apache 2.0 开源，命名 Vespa
- **2020 起**：加 HNSW ANN，追向量浪潮
- **2022+**：tensor + ONNX + global-phase 成深度精排标配（契合 [[colbert-2020]]）
- **2023**：Vespa.ai 从 Yahoo 拆出独立成公司

## 学到什么

1. **检索 + 排序应一起设计**——拆成两服务常输在跨网络延迟和特征不一致
2. **分阶段 rank 是工业默认**——content 侧廉价/中等，container 侧最贵精排
3. **配置驱动 vs API 驱动**——Vespa 用 schema+zip 部署，上手陡但运维稳；ES 相反
4. **向量不是新东西**——张量一等公民比当下"向量库"热潮早很多年

## 延伸阅读

- 官方教程：[Vespa Quickstart](https://docs.vespa.ai/en/getting-started.html)
- 分阶段排序：[Phased Ranking](https://docs.vespa.ai/en/ranking/phased-ranking.html)
- 混合检索：[Hybrid search explained](https://blog.vespa.ai/hybrid-search-explained/)
- 源码：[vespa-engine/vespa](https://github.com/vespa-engine/vespa) → `searchcore/` + `container-search/`

## 关联

- [[elasticsearch]] —— 更偏日志分析；Vespa 偏排序 / 推荐
- [[opensearch]] —— ES 的 Apache 分叉
- [[milvus]] —— 纯向量库；Vespa 把向量当多种信号之一
- [[qdrant]] —— Rust 向量库，更轻
- [[weaviate]] —— 模块化向量库，思路有重叠
- [[bm25-okapi]] —— first-phase 常用关键词分
- [[hnsw-2018]] —— 向量索引算法基础
- [[colbert-2020]] —— 迟交互模型，可挂 global-phase 精排

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[weaviate]] —— Weaviate — 模块化向量数据库
