---
title: GraphRAG — 微软的知识图谱 + RAG
来源: 'Edge et al., "From Local to Global: A Graph RAG Approach to Query-Focused Summarization", Microsoft 2024'
日期: 2026-05-29
分类: AI / NLP
难度: 中级
---

## 是什么

GraphRAG 是 Microsoft 2024 年开源的"先用 LLM 把文档建成知识图谱，再基于图节点检索 + 总结"的 RAG 进化版。

日常类比：

- 传统 [[rag-lewis-2020]] 是**按段落查**——你问问题，它从一堆文档里找出"和你的问题字面最接近的几段话"，再把这几段塞给 LLM 答。
- GraphRAG 是**先画族谱**——读完整本书后，先抽出"人物 + 关系网"（Bloom 是 Stephen 的朋友 / Stephen 住在 Dublin），下次问问题时按关系网回答。

差别是：vector RAG 是"翻字典查近似词"，GraphRAG 是"先画地图再导航"。

## 为什么重要

不理解 GraphRAG，下面这些事都没法解释：

- 为什么 vanilla RAG 答不好"这本书讲什么"——只能拼几段局部，看不到全局
- 为什么后续 LightRAG / nano-graphrag / RAG-Fusion 都跟着做图检索——GraphRAG 把"图 + RAG"这条路走通了
- 为什么 Microsoft 开源后 GitHub 拿到 30k+ Star、社区一年内出了几十个变种
- 为什么企业知识库 / Notion AI / Microsoft Copilot 全库问答开始用图——它让 LLM 看到的是**概念关系**而不是**碎片文本**

## 核心要点

GraphRAG 流程拆成 **三步**：

1. **Indexing（建图）**：用 LLM 把每段文档读一遍，抽出实体（人 / 地 / 组织 / 事件）和关系（A 认识 B / A 在 B 工作）。然后跑社区检测算法，把图切成一层层"小社区 → 大社区 → 全局"——每个社区写一段自然语言 summary。

2. **Local search（按邻居查）**：用户问具体事实题（"Bloom 的朋友是谁"），先在图里找到 Bloom 这个节点，再看它的 1-hop 邻居，把这些邻居 + 它们对应的原文喂给 LLM。

3. **Global search（按社区总结查）**：用户问全局题（"这本书的主线是什么"），不能只看几个节点——要 map-reduce：让 LLM 对每个社区 summary 各答一遍，再合并 top-N 答案。

三步加起来：把 retrieval 从"找一段相似文本"升级成"对整库做主题级摘要"。

## 实践案例

### 案例 1：用 GraphRAG 读《尤利西斯》

输入小说全文 → GraphRAG 自动抽出：

- **实体**：Leopold Bloom（人）/ Stephen Dedalus（人）/ Dublin（地）/ June 16 1904（事件）
- **关系**：Bloom is friend of Stephen / Stephen lives in Dublin / story takes place on June 16 1904
- **社区**：Level 0 划分大主题（"Bloom 一日游"/"Stephen 的精神挣扎"），Level 2 划分细主题（"Bloom 进酒馆见到的人"）

整个过程**没有人手工标 schema**——LLM 自己读自己抽。

### 案例 2：问"这本书的主线是什么"

走 **Global search**：

1. 取出 Level 2 所有 community summary（约几十段）
2. 对每段 summary，让 LLM 单独回答"主线是什么" + 自评 helpfulness 0-100 分
3. 排序取 top-20，让 LLM 把这 20 段答案合并成 final answer

输出："Bloom 一日漫游 Dublin、与 Stephen 偶遇、内心独白构成意识流主线..."——综合了多个社区的视角。

vector RAG 在同一题上**只能找出几段最像"主线"字面的句子**，拼不出全局。

### 案例 3：问"Bloom 见过谁"

走 **Local search**：

1. 在图里找到 Bloom 节点
2. 拿 Bloom 的所有 1-hop 邻居（Stephen / Molly / Boylan / barkeeper...）
3. 收集这些节点对应的原文片段，喂 LLM

输出："Bloom 在 6 月 16 日依次见过 Stephen Dedalus、酒馆老板、Boylan..."——这是图原生擅长的"邻居查询"。

## 踩过的坑

1. **索引贵**：1M tokens corpus 索引一次约 $30-50（GPT-4 turbo 价位）。每个 chunk 都要喂 LLM 抽实体——总调用次数 ≈ chunk 数 × 2（base + 二次询问"还有遗漏吗"）。临时一次性查询完全划不来。

2. **LLM 抽错的 entity 会传染下游**：LLM 可能把 "Bloom" 抽成两个不同实体（"Bloom" 和 "Leopold Bloom"）。如果合并失败，社区会被错切，下游 summary 会错——但 LLM 答得很自信，看不出来。

3. **社区切片靠玄学参数**：max_cluster_size = 10 是论文默认，对叙事文本（小说 / 新闻）合理。换到学术论文（高度连通的引用图）或代码库，会切出几千个微社区，summary 一大半重复或空洞。

4. **更新成本高**：corpus 加一篇新文档，默认要全部 reindex。3.x 之后才支持 incremental，但实体身份变化（同一实体的关系网随时间漂移）仍然没法优雅处理。

## 适用 vs 不适用场景

**适用**：

- 1M+ tokens 的稳定企业知识库做全局问答（"我们去年的核心战略主题是什么"）
- 需要解释"答案来自哪些实体"的场景——图天然 explainable
- 多跳推理 / 跨文档连点（"A 公司和 B 公司的共同投资人是谁"）
- 内容稳定 + 复用次数多——索引成本被反复摊薄

**不适用**：

- 小语料（< 100k tokens）→ 直接塞 long-context 模型（Claude 200k）
- FAQ / 简单事实问答 → vanilla [[rag-lewis-2020]] 已经够用
- 高频更新语料（每天新增千页）→ 用 LightRAG 或 FastGraphRAG，索引便宜
- LLM API 预算紧 → vanilla vector RAG 或 LightRAG（去掉 community 步骤）

## 历史小故事（可跳过）

- **2020 年**：[[rag-lewis-2020]] Lewis 发表 RAG，把 retriever + generator 端到端联训，但检索是 flat passage，没图结构。
- **2022 年前后**：Knowledge Graph + LLM 早期结合（Neo4j + LangChain demo / Freebase QA 复活），但依赖人工 ontology，跨域不可用。
- **2024 年 4 月**：Microsoft Research 发 GraphRAG 论文 + 开源——把 LLM 当 graph extractor 绕开人工 ontology，是这条路线的拐点。
- **2024 年 9 月**：HKUDS 发 LightRAG，去掉 community detection 步骤改用 dual-level retrieval，索引成本降 10 倍——证明 community 不是必须的。
- **2025 年**：LangChain / LlamaIndex / Neo4j 都加了 graph-aware retriever，"图 + RAG"成主流 RAG 框架的标配。

## 学到什么

1. **LLM 可以当 extractor，不只当 generator**——这是 GraphRAG 最被低估的洞见。任何"开放域抽信息"任务都可以用 LLM 替代人工 schema 工程。
2. **图结构必须再压扁回自然语言**——LLM 不擅长读节点列表，所以必须给每个社区写 summary。"图很美但要喂回文本"是工程现实。
3. **map-reduce 是处理大集合 query 的通用 pattern**——不只是 RAG，任何"对一堆元素答一个问题"都可以拆成 map（每个独立答）+ reduce（合并 top-N）。
4. **检索的"颗粒度"是新的设计维度**——passage / entity / community / global，每一层都是一种选择，不存在"最好"只存在"最适合"。

## 延伸阅读

- 论文 27 页 PDF：[arXiv 2404.16130](https://arxiv.org/abs/2404.16130)（核心是 Figure 1 + Section 2 pipeline + Section 4 评测）
- 官方实现：[microsoft/graphrag](https://github.com/microsoft/graphrag)（25k+ Star，Python 包发到 PyPI）
- 轻量版：[HKUDS/LightRAG](https://github.com/HKUDS/LightRAG)（去掉 community 步骤，更快更省）
- 视频讲解：YouTube 搜索 "GraphRAG explained Microsoft" 有多个 1 小时讲座
- [[rag-lewis-2020]] —— 前作：把检索 + 生成端到端绑定的奠基

## 关联

- [[rag-lewis-2020]] —— 前作：flat passage 检索；GraphRAG 把检索目标升级成 community summary
- [[react]] —— Agentic RAG 路线，主张运行时动态 retrieve 而非预编译 graph
- [[retro]] —— 同期检索增强语言模型，但走 chunk-level 检索而非图

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cytoscape-js]] —— Cytoscape.js — 浏览器里画图（节点 + 边）的图论库
- [[gcn-2017]] —— GCN 2017 — 把卷积搬到图结构上的最简版本
- [[graphsage-2017]] —— GraphSAGE 2017 — 给没见过的节点也能算嵌入
- [[hnsw-2018]] —— HNSW — 多层近邻图让向量检索从 O(N) 降到近似 O(log N)
- [[personalized-pagerank-2003]] —— Personalized PageRank — 给每个人一份属于自己的网页排名
- [[rag-lewis-2020]] —— RAG (Lewis 2020) — 检索增强生成奠基
- [[react]] —— React UI 组件库
- [[replug-2023]] —— REPLUG — 不动 LLM 一根毛，只把检索器调到它的"口味"上
- [[retro]] —— RETRO — DeepMind 的检索增强 LLM
- [[self-rag-2023]] —— Self-RAG — 让模型自己决定何时该查资料

