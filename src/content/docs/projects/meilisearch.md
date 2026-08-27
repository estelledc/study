---
title: Meilisearch — 开发者友好的即时搜索引擎
来源: https://github.com/meilisearch/meilisearch
日期: 2026-05-29
分类: 数据库 / 搜索
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/meilisearch/meilisearch
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 577f7af28942b71782eab1e59f44ad8296ce0a92
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.53.1
---

## 是什么

Meilisearch 是 Meili 用 Rust 写的即时搜索 HTTP 服务。日常类比：它像一台插电就能出咖啡的家用机，而 [[elasticsearch]] 更像要配水管、电表和值班表的工业机房。

你扔进 JSON 文档，它通过 REST 返回 typo-tolerant 命中。固定 1.53.1 把引擎核心放在 `milli`，HTTP、任务队列和鉴权放在 `meilisearch` crate。默认听 `localhost:7700`。

```bash
# 开发环境可以不设 master key；production 必须提供至少 16 字节
curl -X POST 'http://localhost:7700/indexes/movies/documents' \
  -H 'Content-Type: application/json' \
  --data '[{"id": 1, "title": "Matrix"}]'
```

写接口返回的是 **202 enqueued task**，不是已经可搜的文档。

## 为什么重要

不读固定 1.53.1 源码，旧教程很容易把下面几件事写错：

- 默认排序是不是还是统一的 `attribute`
- 往不存在的 index POST 文档，会不会同步可搜
- production 能否继续无 key 裸奔
- Community Edition 是否已经带分片

## 核心架构与流程

主链可以拆成五步：

1. **HTTP 入口**：actix-web 路由接到 `/indexes/{uid}/documents` 或 `/search`。写操作走 Bearer 权限；`GET /health` 在设了 master key 后仍可匿名访问。
2. **任务入队**：文档增删改、settings 更新进入 `index-scheduler`。响应只保证入队，不保证 milli 已合并。
3. **主键与字段**：没有声明 primary key 时，从首份文档里找小写后缀为 `id` 的唯一字段；0 个或多个候选都会失败。未设置 `searchableAttributes` 时，已出现字段都会进入可搜索集合。
4. **milli 检索**：查询先建成 QueryGraph，再按 ranking rule 做 bucket sort。默认只看查询前十个词。
5. **默认 7 层排序**：`words` → `typo` → `proximity` → `attributeRank` → `sort` → `wordPosition` → `exactness`。统一 `attribute` 仍可配置，但不再是默认。

Community Edition 的 `Shards::processing_shard` 固定返回 `None`；分片属于 EE / BUSL 路径。

## 实践示例

### 案例 1：开发实例默认地址

```bash
meilisearch --http-addr localhost:7700
```

固定源码默认环境是 `development`。切到 `production` 必须给 `--master-key` 或 `MEILI_MASTER_KEY`，且长度至少 16 字节。本页没有实际启动进程。

### 案例 2：自动建 index，但先看 task

```bash
curl -X POST 'http://localhost:7700/indexes/movies/documents' \
  -H 'Content-Type: application/json' \
  --data '[{"id": 1, "title": "Matrix"}, {"id": 2, "title": "Inception"}]'
```

注释写明 index 不存在就会创建。返回体是 `taskUid` / `enqueued`。要确认可搜，需要再查 `/tasks/{uid}`，不能把 202 当成索引完成。

### 案例 3：用拆开后的默认排序理解 `matix`

```bash
curl -X POST 'http://localhost:7700/indexes/movies/search' \
  -H 'Content-Type: application/json' \
  --data '{"q":"matix"}'
```

默认 typo：`oneTypo=5`、`twoTypos=9`。`matix` 对 `Matrix` 是 1 个编辑，会进入 typo 桶。字段重要性由 `attributeRank` 决定，词在字段里的前后位置由后面的 `wordPosition` 决定。GET `/search` 在源码注释里被标为 discouraged。

## 踩过的坑

1. **把默认排序仍写成 6 层 `attribute`**：1.53.1 默认已拆成 `attributeRank` + `wordPosition`。混用统一 `attribute` 和拆开规则会被拒绝。
2. **把 202 当可搜**：文档写入是异步 task；边灌边搜会看到空结果或旧快照。
3. **主键猜测失败**：字段叫 `movie_uid` 而没有 `id` 后缀，或同时有 `id` 与 `movie_id`，都会让推断失败。
4. **production 无 master key**：development 可以裸跑；production 缺 key 或短于 16 字节会直接拒绝启动。
5. **把 EE 分片当成 OSS 能力**：Community 路径不处理 shard。根许可证是 `MIT AND BUSL-1.1`。

## 适用 vs 不适用场景

**适用**：

- 站点 / App 内即时搜索，团队没有专职搜索运维
- 希望 JSON 进、REST 出，并接受异步索引合同
- 需要内置 typo、facet，以及可选的 embedder / hybrid search

**不适用**：

- 需要 Community Edition 水平分片
- 日志分析、复杂 pipeline aggregation
- 必须把「写入成功」等同于「立即可搜」
- 不能接受固定 1.53.1 的 7 层默认排序或 BUSL 边界

## 固定版本边界

- 本文绑定 `meilisearch/meilisearch@577f7af2...`，workspace / tag 均为 `1.53.1`。
- milli 含 OpenAI、Hugging Face、Ollama、REST、composite 与 manual embedder；本页未跑任何 embedding。
- 未声明性能、内存倍率或冷启动数字。
- 本文未编译、未启动、未发请求，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认排序会在小版本里拆开**——`attribute` 从一层变成 rank 与 position 两层，旧笔记不能外推。
2. **HTTP 202 只证明入队**——搜索引擎的写路径常常是任务队列，不是同步 commit。
3. **开发默认不是生产合同**——无 key 的 7700 端口只属于 `development`。
4. **开源二进制可以同时带 EE 死代码**——Community 返回 `None` 的分片函数，提醒许可证要按模块读。

## 应用型自测

1. 固定 1.53.1 新建 index，不改 settings。默认第一层打破平局的「字段重要性」规则叫什么？
2. POST 文档到不存在的 `movies` index，立刻 GET search，能否把 202 当成已可搜？
3. `--env production` 且不设 master key，进程会不会监听 7700？

检查点：

1. `attributeRank`，不是统一 `attribute`。
2. 不能。202 只表示 task enqueued。
3. 不会；production 必须提供至少 16 字节 master key。

## 延伸阅读

- 固定源码：[meilisearch/meilisearch](https://github.com/meilisearch/meilisearch) —— 本文绑定提交 `577f7af28942b71782eab1e59f44ad8296ce0a92`
- 官方文档：[meilisearch.com/docs](https://www.meilisearch.com/docs)
- 对比阅读：[[typesense]] —— 同赛道、schema-first 的 C++ 搜索引擎
- [[elasticsearch]] —— 工业级对照：mapping、聚合与集群运维更重
- [[tantivy]] —— 同语言的 library 路线，不是开箱 HTTP 服务

## 关联

- [[typesense]] —— 同定位的开源即时搜索；必须先声明 collection fields
- [[elasticsearch]] —— 功能更全、配置更重的分布式搜索
- [[tantivy]] —— Rust 搜索 library，Meilisearch 是 server 路线
- [[chroma]] —— 专用向量库；Meilisearch 把 embedder 收进同一引擎
- [[sonic]] —— 更瘦的 Rust 前缀搜索

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[elasticsearch]] —— Elasticsearch — 分布式搜索引擎
- [[librechat]] —— LibreChat — 让一份聊天 UI 同时连 OpenAI / Anthropic / Google / 本地模型，对话留在自己的服务器
- [[manticoresearch]] —— Manticore Search — 用 MySQL 协议连的搜索 + OLAP 引擎
- [[minisearch]] —— minisearch — 浏览器里的小型全文搜索引擎
- [[pouchdb]] —— PouchDB — 浏览器里的 CouchDB
- [[sonic]] —— Sonic — 极简前缀搜索引擎
- [[tantivy]] —— Tantivy — Rust 版 Lucene
- [[typesense]] —— Typesense — 高性能搜索引擎
- [[zincsearch]] —— ZincSearch — 单二进制 Go 写的 ES 替代
