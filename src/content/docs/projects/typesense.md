---
title: Typesense — schema-first 的自托管即时搜索
来源: https://github.com/typesense/typesense
日期: 2026-05-29
分类: 数据库 / 搜索
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/typesense/typesense
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: d45d46baf3996d1de8bf96a87f375cfb43691560
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: '30.2'
---

## 是什么

Typesense 是 Typesense Inc. 用 C++ 写的自托管搜索引擎，目标是 Algolia 那种「边输边出结果」的体验，但跑在自己的机器上。日常类比：先画货架标签再上货，而不是像 [[meilisearch]] 那样先倒一箱 JSON 再认字段。

固定 30.2 的入口是单二进制 + REST。默认 API 端口 `8108`。倒排索引用 Adaptive Radix Tree，原始 JSON 落 RocksDB。许可证是 GPL-3.0。

```bash
typesense-server --data-dir /data --api-key=xyz --api-port=8108
```

没有 `--api-key` 就没有 bootstrap 管理员身份；之后的 scoped key 都从这把钥匙派生。

## 为什么重要

不读固定 30.2 源码，下面这些合同很容易被旧镜像或 DESIGN.md 带偏：

- 为什么 `fields` 是创建 collection 的必填项，却又能写 `type: auto`
- 为什么不写 `query_by` 会直接 400
- 5 个字母的词默认允许多少 typo
- 高可用到底是异步副本还是 Raft

## 核心架构与流程

主链可以拆成五步：

1. **声明 schema**：`create_collection` 强制 `name` 和 `fields`。`enable_nested_fields` 默认 false。`type: auto` 的含义是「第一个写入值决定类型」，不是可以省略 schema。
2. **写入与存储**：文档进 RocksDB；可搜索 token 进内存 ART。向量字段带 `num_dim`；关键词字段不要放进 `query_by`，应走 `vector_query`。
3. **检索参数**：`q` 或 `voice_query` 必填。非通配搜索在 `query_by` 为空时返回 `Missing query_by parameter`。默认 `num_typos=2`、`min_len_1typo=4`、`min_len_2typo=7`、`prefix=true`、`per_page=10`。
4. **排序与混合检索**：token 命中数、proximity 和静态 sort 字段一起工作；向量维度必须对齐 `num_dim`。
5. **鉴权与集群**：`AuthManager` 区分 bootstrap key 与派生 scoped key。多节点走 `braft`：解析 `--nodes`（`host:peeringPort:apiPort`），选不出 Leader 会重试。根目录 `DESIGN.md` 仍写异步副本，与当前 Raft 源码不一致。

## 实践示例

### 案例 1：单节点必须带 data-dir 和 key

```bash
docker run -p 8108:8108 \
  -v /tmp/typesense-data:/data \
  typesense/typesense:30.2 \
  --data-dir /data --api-key=xyz
```

`tsconfig` 默认端口就是 8108。旧笔记里的 `27.0` 镜像不能代表本页合同。本页没有实际拉镜像。

### 案例 2：先建 fields，再搜必须 `query_by`

```bash
curl -H "X-TYPESENSE-API-KEY: xyz" -X POST 'http://localhost:8108/collections' \
  -d '{"name":"books","fields":[{"name":"title","type":"string"},{"name":"author","type":"string"}]}'
curl -H "X-TYPESENSE-API-KEY: xyz" -X POST 'http://localhost:8108/collections/books/documents' \
  -d '{"title":"Designing Data-Intensive Applications","author":"Martin Kleppmann"}'
curl -H "X-TYPESENSE-API-KEY: xyz" \
  'http://localhost:8108/collections/books/documents/search?q=desigining&query_by=title'
```

`desigining` 对 `Designing` 是 1 个编辑；`Designing` 长度 ≥ 4，默认允许 1 typo。不要省略 `query_by`。

### 案例 3：向量字段不要塞进 `query_by`

```json
{
  "name": "embedding",
  "type": "float[]",
  "num_dim": 384
}
```

源码在普通 `query_by` 碰到非 auto-embedding 向量字段时会拒绝，并要求改用 `vector_query`。维度必须等于 schema 里的 `num_dim`。

## 踩过的坑

1. **把 `type: auto` 当成无 schema**：collection 仍然必须提交 `fields`；`auto` 只推迟类型决定。
2. **默认 typo 阈值和 Meilisearch 不同**：Typesense 是 4 / 7，不是 5 / 9；「大约 1–2 个字符」这种说法太粗。
3. **信任 DESIGN.md 的异步副本**：30.2 集群路径是 Raft。`--nodes` 配不齐会选不出 Leader。
4. **管理员 key 进浏览器**：前端必须用限定 collection / action 的 scoped key。
5. **改字段类型当原地 PATCH**：需要 drop/reindex 或走 alter 重建；别假设类型可以热改。

## 适用 vs 不适用场景

**适用**：

- 要 Algolia 体验、又想自托管并接受 GPL-3.0
- 希望查询字段、类型和权重在 schema 里先钉死
- 单机到小 Raft 集群，并需要关键词 + 向量混合检索

**不适用**：

- 想先倒 JSON、后补 mapping 的动态 schema 工作流 → 看 [[meilisearch]]
- 日志分析 / 重型聚合 → 看 [[elasticsearch]] / [[opensearch]]
- 不能把全量倒排放进内存，又不愿拆 collection
- 已深度绑定 Elasticsearch DSL，迁移成本高于收益

## 固定版本边界

- 本文绑定 `typesense/typesense@d45d46ba...`，GitHub release / tag 为 `v30.2`。
- README 里的 RAM / QPS 数字是项目自述，未在本环境复测。
- `DESIGN.md` 只作历史动机，不以它覆盖 Raft 实现。
- 本文未编译、未启动、未发请求，状态保持 `UNVERIFIED`。

## 学到什么

1. **schema-first 换来的是可预测查询，不是零配置**——少写 `query_by` 会在引擎里直接失败。
2. **默认 typo 是带长度门槛的数字，不是「大概能容错」**。
3. **设计文档会过期**——HA 合同以 `raft_server.cpp` 为准。
4. **向量和关键词是两条 API**——`num_dim` 字段走 `vector_query`。

## 应用型自测

1. 只传 `q=iphne`、不传 `query_by`，固定 30.2 会怎样？
2. 词长 5 的 `iphne`，默认最少几个编辑距离内能进 typo 候选？它和 Meilisearch 1.53.1 的 `oneTypo=5` 一样吗？
3. 三节点少写一个 peer，`DESIGN.md` 说的「异步拉副本」还能解释当前源码吗？

检查点：

1. 非通配搜索返回 `Missing query_by parameter`。
2. 默认 `min_len_1typo=4`，5 字母词允许 1 typo；与 Meilisearch 的 5 / 9 门槛不同。
3. 不能。当前 HA 是 braft，配不齐会选不出 Leader。

## 延伸阅读

- 固定源码：[typesense/typesense](https://github.com/typesense/typesense) —— 本文绑定提交 `d45d46baf3996d1de8bf96a87f375cfb43691560`
- 官方文档：[typesense.org/docs](https://typesense.org/docs/)
- 对比阅读：[[meilisearch]] —— 同赛道、更偏动态字段的 Rust 搜索引擎
- [[elasticsearch]] —— 功能更全、运维更重的分布式搜索
- 适配器：[typesense-instantsearch-adapter](https://github.com/typesense/typesense-instantsearch-adapter)

## 关联

- [[meilisearch]] —— 同定位的开源即时搜索；schema 策略更松
- [[elasticsearch]] —— 老牌分布式搜索；功能更全但配置更重
- [[milvus]] —— 专用向量数据库；Typesense 把向量塞进同一引擎
- [[postgresql]] —— 主存储；CDC 同步到 Typesense 做搜索是常见架构
- [[opensearch]] —— 需要重型搜索栈时的另一选项

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[elasticsearch]] —— Elasticsearch — 分布式搜索引擎
