---
title: MeiliSearch — 开发者友好的搜索引擎
来源: https://github.com/meilisearch/meilisearch
日期: 2026-05-29
分类: 数据库 / 搜索
难度: 中级
---

## 是什么

MeiliSearch 是法国 Meili 公司 2018 年用 **Rust** 写的"开发者优先"的全文搜索引擎，主打两件事：**装上立即能用** + **拼写容错好**。

日常类比：

- [[elasticsearch]] 像大型工业搜索机房——功能强大，但配 mapping、分词器、聚合管道要花一星期
- MeiliSearch 像开箱即用的家用咖啡机——插电、加水、按一下，几分钟就有可用结果，不用先考一张 barista 证

典型场景：博客搜索、电商商品搜索、文档站搜索、应用内搜索（in-app search）。不是给"全公司日志检索"准备的，是给"前端 / 全栈开发者一个人也能上手"准备的。

## 为什么重要

不理解 MeiliSearch 的设计取舍，下面这些事会困惑：

1. **即装即用**：默认配置就能用，不像 [[elasticsearch]] 要先调 mapping、分词器、refresh interval。新手 5 分钟出搜索页面。
2. **拼写容错出色**：用户搜 `matix`，仍能命中 `Matrix`——typo tolerance 是内置默认行为，不是高级特性。
3. **Rust 实现快**：单机毫秒级响应（10ms 以内），冷启动也快，没有 JVM 那种"先慢后稳"的暖机问题。
4. **Open Source + SaaS 双轨**：Community Edition 自托管仍是 **MIT**（可商用）；Enterprise Edition 的分片等高级能力走 **BUSL**。托管版叫 **Meilisearch Cloud**。和 [[supabase]] / Mongo 走的是同一类商业路径。

## 核心要点

MeiliSearch 的"为什么这么快、这么省心"可以拆成三件事：

### 1. 文档 = JSON，无 schema 强制

你不需要先定义 schema。直接扔 JSON：

```json
{ "id": 1, "title": "Matrix", "year": 1999, "tags": ["sci-fi", "action"] }
```

MeiliSearch 自己读字段类型。不用像 [[elasticsearch]] 那样先 PUT mapping。

### 2. 自动 indexing

文档进来，引擎自动建倒排索引、自动选可搜索字段（默认所有字符串字段都可搜）。
你后期可以收紧——比如说"只搜 `title` 和 `tags`，`description` 不搜"——但**默认能跑**。

### 3. Ranking rules（默认 6 层排序）

搜索结果按默认规则依次比较，前一层比不出胜负才看下一层（官方默认顺序）：

| 层 | 含义 | 例子 |
|---|---|---|
| words | 命中查询词数多的优先 | 搜 `the matrix`，命中 2 词的排前 |
| typo | 拼写错误数少的优先 | 搜 `matix`，`Matrix`（错 1 个）排前 |
| proximity | 词在文档里挨得近的优先 | "neo matrix" 比 "neo ... matrix" 排前 |
| attribute | 命中重要字段的优先 | 命中 `title` 比命中 `description` 排前 |
| sort | 用户指定的自定义排序字段 | 按 `price:asc` 在同分档内再排 |
| exactness | 完全精确匹配的优先 | 完整匹配 `matrix` 比模糊匹配排前 |

这 6 层是默认顺序，可增删重排。理解这套规则，调搜索质量就有抓手。

## 实践案例

### 案例 1：Docker 一行起服务

```bash
docker run -p 7700:7700 getmeili/meilisearch
```

跑完直接访问 `localhost:7700`。这是它对 [[elasticsearch]] 最大的差异——后者首次启动要调内存参数、改 vm.max_map_count、设密码。

### 案例 2：curl 直接加文档

```bash
curl -X POST 'http://localhost:7700/indexes/movies/documents' \
  -H 'Content-Type: application/json' \
  --data '[{"id": 1, "title": "Matrix"}, {"id": 2, "title": "Inception"}]'
```

不用先建 index，POST 文档时如果 `movies` 索引不存在会自动创建。

### 案例 3：拼写容错搜索

```bash
curl 'http://localhost:7700/indexes/movies/search?q=matix'
```

返回结果里 `Matrix` 仍排在第一。`matix` 少一个字母，typo 容错默认开启，对长度 ≥ 5 的词允许 1 个错字，长度 ≥ 9 允许 2 个。

### 案例 4：限定可搜字段

```bash
curl -X PATCH 'http://localhost:7700/indexes/movies/settings' \
  -H 'Content-Type: application/json' \
  --data '{"searchableAttributes": ["title", "tags"]}'
```

把 `description` 排除在搜索范围外——常用于"只想搜标题和标签，不想搜正文"的场景。

## 踩过的坑

1. **大版本数据格式不兼容**：v0 → v1、v1 → v2 升级时索引数据结构变过，需要 `dump` 导出再 `restore` 导入。直接拷数据目录会报错。每次大版本升级前先看 changelog 的 breaking changes。

2. **大文档（> 10KB）建议拆 chunk**：单条文档过大会拖慢索引速度，也会让排序质量下降（proximity 计算变模糊）。把长文章按段落拆成多条文档，每条带 `article_id` 关联，搜出来再聚合回去。

3. **内存吃货**：MeiliSearch 把索引大量驻留内存，1GB 文档常吃 3-5GB RAM。和 [[elasticsearch]] 把冷数据落盘的策略不同——它假设"你的搜索数据不会大到内存装不下"。超大数据集（百 GB 以上）还是选 [[elasticsearch]]。

4. **复杂聚合查询弱**：MeiliSearch 主打"搜出来 + 简单 facet 过滤"，不擅长 [[elasticsearch]] 那种 nested aggregation、pipeline aggregation、子聚合。需要做"按类别统计、按时间分桶、再下钻"的场景，它不是合适工具。

5. **首次索引慢**：批量灌 100 万文档要几分钟到几十分钟。生产环境上线前要预先建好索引，不能边接流量边建。

## 适用 vs 不适用场景

**适用**：
- 应用内搜索（in-app search）—— 博客、文档站、电商、SaaS 搜索框
- 中小数据量（< 10GB）+ 要求毫秒级响应
- 对拼写容错有要求的用户搜索（C 端产品）
- 团队里没有专职搜索工程师，但前端 / 全栈要快速上线搜索

**不适用**：
- 大数据量日志检索（> 100GB） → 用 [[elasticsearch]]
- 需要复杂聚合、分布式分片、多集群联邦 → 用 [[elasticsearch]]
- 需要 SQL 风格的关系查询 → 用 PostgreSQL 全文搜索 + [[supabase]]
- 离线批处理搜索（不需要实时） → 用 Lucene / Tantivy 库

## 历史

- **2018 年**：法国创业团队 Meili 成立，Quentin de Quelen 等人用 Rust 写第一版。当时 [[elasticsearch]] 已经是工业标准，他们瞄准"开发者体验"这个缝。
- **2020 年**：v0.x 系列开源在 GitHub，主打 typo tolerance。社区开始关注。
- **2022 年**：v1.0 发布，API 稳定，宣布生产可用。商业化 Meilisearch Cloud 上线。
- **2024 年**：v1.10 加了向量检索（vector search）+ Multi-Search（一次请求查多个 index），切入 RAG 场景，对标 [[chroma]] / Qdrant。

整个轨迹：**先做对开发者体验 → 再做对工业用例**，和 [[supabase]] / [[caddy]] 是同一种"反巨人"的路线。

## 学到什么

1. **默认即可用** 是产品哲学——"配置三天才能用"是工业基建心态，"五分钟出结果"是产品心态
2. **取舍是设计**——选了"小数据 + 毫秒响应 + 内存吃货"，就放弃了"百 GB + 分布式 + 聚合查询"
3. **typo tolerance 不是高级特性**——C 端用户打字必然出错，把容错当默认行为是对真实场景的尊重
4. **Rust 在基础设施层是合理选择**——单机性能高、内存安全、二进制小、冷启动快，对 [[elasticsearch]] 那种"JVM 慢热"是直接降维

## 延伸阅读

- 官方文档：meilisearch.com/docs
- [[elasticsearch]] —— 工业级老牌搜索引擎，对照看取舍
- [[chroma]] —— 向量数据库，MeiliSearch v1.10 后两者功能开始重叠

## 关联

- [[elasticsearch]] —— 工业级搜索的反面参照，复杂但能力全
- [[chroma]] —— 向量检索专用，MeiliSearch 后期切入这个赛道
- [[supabase]] —— 同样走"开源 + SaaS 双轨"的反巨人路线
- [[caddy]] —— 同样靠"默认即可用"赢开发者心
- [[bun]] —— 同样是"用更现代语言重写老工具"的代表

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bun]] —— Bun — JS 全能运行时
- [[caddy]] —— Caddy — 自动 HTTPS Web 服务器
- [[chroma]] —— Chroma — Python 优先的向量数据库
- [[elasticsearch]] —— Elasticsearch — 分布式搜索引擎
- [[librechat]] —— LibreChat — 让一份聊天 UI 同时连 OpenAI / Anthropic / Google / 本地模型，对话留在自己的服务器
- [[manticoresearch]] —— Manticore Search — 用 MySQL 协议连的搜索 + OLAP 引擎
- [[minisearch]] —— minisearch — 浏览器里的小型全文搜索引擎
- [[pouchdb]] —— PouchDB — 浏览器里的 CouchDB
- [[sonic]] —— Sonic — 极简前缀搜索引擎
- [[supabase]] —— Supabase — Firebase 的开源替代
- [[tantivy]] —— Tantivy — Rust 版 Lucene
- [[zincsearch]] —— ZincSearch — 单二进制 Go 写的 ES 替代

