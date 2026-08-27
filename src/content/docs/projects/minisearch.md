---
title: MiniSearch — 浏览器里的倒排索引全文搜索
来源: https://github.com/lucaong/minisearch
日期: 2026-05-30
分类: 搜索
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/lucaong/minisearch
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 3d239d1c3ae7aef1bf5d8945dd7b5f0709f646f5
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.2.0
---

## 是什么

MiniSearch 是一个零依赖的内存全文搜索库，跑在浏览器或 Node 里。日常类比：先把每篇文档拆成词，做成“词 → 文档”的卡片柜；查询时只抽相关卡片，再用 BM25+ 打分。它不是轻量版 [[elasticsearch]]，也不是 [[fuse.js]] 那种默认扫全文的模糊匹配器。

```js
import MiniSearch from 'minisearch'

const ms = new MiniSearch({ fields: ['title', 'body'] })
ms.addAll([
  { id: 1, title: '猫的图鉴', body: '布偶 / 暹罗 / 折耳' },
  { id: 2, title: '狗的图鉴', body: '柴犬 / 边牧 / 金毛' },
])
ms.search('暹罗')
```

`fields` 必填。默认 `idField` 是 `id`。默认搜索只做精确词匹配；前缀和模糊都要显式打开。

## 为什么重要

不读固定 7.2.0 源码，下面这些合同很容易被旧教程带偏：

- 为什么默认 `search('暹')` 对不上“暹罗”——`prefix` / `fuzzy` 默认都是 `false`
- 为什么空字符串查不到全部文档，却另有 `MiniSearch.wildcard`
- 为什么旧文里的 `split(/[\s\W]/)` 对不上当前默认分词
- 为什么 `replace` 不是原地改 posting list，而是 `discard` + `add`，还要靠 vacuum

## 核心要点

固定版本的主链可以拆成五层：

1. **倒排索引在 radix tree 上**：`SearchableMap` 实现带字符串键的 `Map`，并提供 `atPrefix` 与 `fuzzyGet`。它也从 `minisearch/SearchableMap` 单独导出。

2. **默认分词是 Unicode 空白/标点**：`/[\n\r\p{Z}\p{P}]+/u`。`processTerm` 默认只 `toLowerCase()`，不做 stemming，也不去停用词。连续汉字没有标点时仍是一个 token。

3. **默认搜索是精确词 + OR**：`prefix: false`、`fuzzy: false`、`maxFuzzy: 6`。分数模糊值按词长取整，但不会超过 6。默认 combine 是 OR。

4. **评分是 BM25+**：默认 `{ k: 1.2, b: 0.7, d: 0.5 }`。更高的 `k` 拉大词频差距，更高的 `b` 让长字段更吃亏。

5. **增量删除有两条路**：`remove(doc)` 要原文，立刻清 posting；`discard(id)` / `replace` 先打脏，再按 `minDirtFactor=0.1`、`minDirtCount=20` 自动 vacuum。

## 实践示例

### 案例 1：静态站先建索引，再 `loadJSON`

```js
const ms = new MiniSearch({
  fields: ['title', 'body'],
  storeFields: ['title', 'url'],
})
ms.addAll(allDocs)
const json = JSON.stringify(ms)
const live = MiniSearch.loadJSON(json, { fields: ['title', 'body'] })
live.search('图', { prefix: true })
```

`loadJSON` 必须拿到序列化时同一套 options，否则构造函数会抛错。空字符串默认无结果；要“全部文档”得用 `MiniSearch.wildcard`。

### 案例 2：`remove` 与 `replace` 不是同一条内存合同

```js
ms.remove(originalNote)          // 立刻改树
ms.replace({ id: 1, title: '新标题', body: '新正文' }) // discard + add
```

`replace` 依赖 vacuum 回收旧 term 引用。只改内存对象、却把旧正文传给 `remove`，索引会坏。

### 案例 3：自动补全只前缀最后一个词

```js
ms.autoSuggest('cat fo', { fuzzy: 0.2 })
```

`autoSuggest` 默认 `combineWith: AND`，并且只有最后一个 token 走前缀。`fuzzy: 0.2` 表示编辑距离约为词长的 20%，再被 `maxFuzzy=6` 封顶。

## 踩过的坑

1. **把默认搜索当成前缀框**：没开 `prefix: true`，半个词通常是空结果。
2. **以为默认 tokenize 能切开中文**：没有空白或标点时，“我爱猫”仍是一个 term。
3. **空查询期待全量列表**：空字符串不是通配符；通配符是 `MiniSearch.wildcard`。
4. **把 `replace` 想成立刻释放内存**：它走 `discard`，脏引用要等 vacuum。

## 适用 vs 不适用场景

**适用**：

- 文档站、组件库、本地笔记等可以整库放进进程内存的全文检索
- 需要可序列化索引、离线查询、按文档增删的静态站或 local-first 客户端
- 想自己接分词 / stemming，而不是绑死某一种语言

**不适用**：

- 默认就要容错下拉、数据集很小 → [[fuse.js]]
- 千万级、多租户、需要服务端分片 → [[elasticsearch]] / [[meilisearch]]
- 语义检索 → 需要 embedding，不是词面倒排

## 固定版本边界

- 本文绑定 `lucaong/minisearch@3d239d1c3ae7aef1bf5d8945dd7b5f0709f646f5`，tag / npm latest 均为 `7.2.0`。
- npm tarball 未提供 `gitHead`；升级前应重新核对 tag 与打包提交是否仍一致。
- 无生产 `dependencies`；`package.json` 未声明 `engines`。
- 本文未安装依赖、运行 jest 或测量体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **倒排索引把“扫文档”变成“查词”**——默认合同是精确词，不是模糊框。
2. **分词正则属于公开合同**——旧的 `[\s\W]` 印象不能代替当前 Unicode 类。
3. **删除 API 分成立刻清理和延迟 vacuum**——`remove` 与 `discard`/`replace` 不是同一种内存行为。
4. **空查询和通配符是两件事**——wildcard 是显式符号，不是空字符串。

## 应用型自测

1. 只用默认 options，`search('暹')` 能命中正文含“暹罗”的文档吗？
2. `search('')` 会返回全部文档吗？
3. `replace` 之后，旧 term 的 posting 是否保证立刻从树上消失？

检查点：

1. 默认不能。需要 `prefix: true` 或自己分词。
2. 不会。空字符串无命中；全量要用 `MiniSearch.wildcard`。
3. 不保证。`replace` 是 `discard` + `add`，清理交给 vacuum。

## 延伸阅读

- 官方文档：[MiniSearch API](https://lucaong.github.io/minisearch/)
- 固定源码：[lucaong/minisearch](https://github.com/lucaong/minisearch) —— 本文绑定 `3d239d1c3ae7aef1bf5d8945dd7b5f0709f646f5`
- 审查记录：仓库内 `docs/client-search-source-review-20260827-de.md`
- 设计说明：[DESIGN_DOCUMENT.md](https://github.com/lucaong/minisearch/blob/master/DESIGN_DOCUMENT.md)
- [[fuse.js]] —— 默认 Bitap 扫描，对照倒排索引

## 关联

- [[fuse.js]] —— 小数据集模糊匹配，默认不建倒排
- [[elasticsearch]] —— 服务端 BM25 标杆
- [[meilisearch]] —— 服务端“用得轻”的对照
- [[starlight]] —— 默认搜索是 Pagefind，不是 MiniSearch
- [[astro]] —— 可在构建期自建 MiniSearch 索引

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[manticoresearch]] —— Manticore Search — 用 MySQL 协议连的搜索 + OLAP 引擎
- [[sonic]] —— Sonic — 极简前缀搜索引擎
- [[zincsearch]] —— ZincSearch — 单二进制 Go 写的 ES 替代
