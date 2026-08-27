---
title: Fuse.js — 用 Bitap 在浏览器里做模糊匹配
description: 用 Bitap 在浏览器里做模糊匹配，默认扫描字段而不是倒排索引。
来源: https://github.com/krisk/Fuse
日期: 2026-08-27
分类: 搜索
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/krisk/Fuse
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 45bac9fe2e71fe8c680c861a35a8b226c4ae6d5a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.5.0
---

## 是什么

Fuse.js 是一个零依赖的模糊匹配库。日常类比：默认不是先做“词 → 文档”卡片柜，而是拿着查询去扫每条字段字符串，用 Bitap 看它离目标有多近。分数越小越好：`0` 是完全命中。

```js
import Fuse from 'fuse.js'

const fuse = new Fuse(
  [{ title: 'Old Man\'s War', author: 'John Scalzi' }],
  { keys: ['title', 'author'] },
)
fuse.search('olda')
```

`keys` 默认是空数组。对象文档若不声明 key，默认路径下没有可搜字段。字符串数组则直接搜元素本身。

## 为什么重要

不读固定 7.5.0 源码，下面这些合同很容易被旧 demo 带偏：

- 为什么它能容忍拼写错误，却不是 [[minisearch]] 那种倒排 + BM25
- 为什么空查询会倒出全部文档，而 MiniSearch 的空字符串是空结果
- 为什么 `keys` 权重就算写成 `2` 和 `1`，计分前也会被归一化到和为 1
- 为什么打开 `useTokenSearch` / `useExtendedSearch` 可能直接抛错——这两条路受构建开关约束

## 核心要点

固定版本的主链可以拆成五步：

1. **默认搜索器是 Bitap**：`createSearcher` 只有注册到的 Extended / Token 搜索器认领查询时才换路，否则 `new BitapSearch`。默认实现扫的是 `FuseIndex` 里已经抽好的字段字符串。

2. **默认阈值相当松**：`threshold=0.6`、`location=0`、`distance=100`。得分公式把错误率和离 `location` 的距离加在一起；`ignoreLocation` 为真时只看错误率。

3. **空查询是“列出全部”**：`query.trim()` 为空时，直接映射 `_docs`，再按 `limit` 切片。这和 MiniSearch 的空字符串合同相反。

4. **权重和字段长度会改分**：`KeyStore` 把各 key 的 weight 除以总和。字段长度 norm 是 `1/sqrt(词数)`，词边界按 ASCII 空白和 NBSP 计；7.5.0 起 tab / 换行不再被当成一个词。

5. **`limit` 在排序开启时走堆**：`shouldSort && limit > 0` 时用 `MaxHeap`，并用 `idx` 打破 comparator 平局，使 top-N 等于“全排序再 slice”。`shouldSort: false` 则保持集合顺序再切片。

## 实践示例

### 案例 1：默认 Bitap 与分数方向

```js
const fuse = new Fuse(['apple', 'apply', 'banana'], {
  includeScore: true,
  threshold: 0.4,
})
fuse.search('appl')
```

默认 `shouldSort: true`，更小的 `score` 排前面。`includeScore` 默认是 `false`，不设就看不到分数。

### 案例 2：对象字段、归一化权重和空查询

```js
const fuse = new Fuse(books, {
  keys: [
    { name: 'title', weight: 2 },
    { name: 'author', weight: 1 },
  ],
})
fuse.search('   ')                 // 全部文档
fuse.search('scalzi', { limit: 5 })
```

`2` 和 `1` 会先被除掉以 `3`，变成约 `0.667` / `0.333`。逻辑查询和对象查询都读这套归一化权重，而不是 `FuseIndex` 里的原始数字。

### 案例 3：长 pattern 与 `Fuse.match`

```js
import Fuse from 'fuse.js'

Fuse.match('old', 'Old Man\'s War', { ignoreLocation: true })
// Fuse.match('x', 'x', { useTokenSearch: true }) // 抛错
```

Bitap 的机器字长是 32；更长的 pattern 会被切成多块。`Fuse.match` 是一次性字符串比较，明确拒绝 `useTokenSearch`，因为 token 路径需要语料统计。

## 踩过的坑

1. **把 Fuse 当成倒排引擎**：默认每条记录都要跑搜索器。数据集变大后，合同仍是扫描，不是 posting list。
2. **空输入当“没有结果”**：空白查询会返回整个集合。
3. **在 basic 构建里开扩展语法**：`useExtendedSearch` / `useTokenSearch` 在对应 `process.env` 关闭时直接抛错。
4. **`minMatchCharLength > 1` 时短命中会消失**：精确匹配快捷路径算出的高亮区间若被滤空，`isMatch` 会改成 `false`。

## 适用 vs 不适用场景

**适用**：

- 下拉框、命令面板、小列表的容错匹配
- 需要 `includeMatches` 高亮、逻辑表达式或现成 Bitap 分数的客户端
- 字符串数组或少量对象字段，不必先设计分词器

**不适用**：

- 文档站全文、可序列化倒排、按文档增量更新 → [[minisearch]]
- 需要默认 BM25 和词级统计 → MiniSearch 或服务端引擎
- 把 `useTokenSearch` 当成稳定默认能力——它默认关闭，且受构建开关约束

## 固定版本边界

- 本文绑定 `krisk/Fuse@45bac9fe2e71fe8c680c861a35a8b226c4ae6d5a`，GitHub tag `v7.5.0`，npm latest 为 `7.5.0`。
- npm `gitHead` 是 `457fe762...`，比 tag 多一次只改 `docs/getting-started.md` 的提交；`src/` 相同。本页绑定 tag 提交。
- 无生产 `dependencies`；`engines.node` 为 `>=10`。
- 本文未安装依赖、运行 vitest 或测量体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **模糊匹配和全文检索不是同一条主链**——Bitap 扫字符串，倒排查词。
2. **默认分数方向和空查询都是合同**——越小越好；空白查询等于列出全部。
3. **构建开关会删掉整条 API 路**——扩展语法和 token 搜索不是“设个 option 就有”。
4. **权重数字在进分之前已经被改写**——没归一化的 weight 不能拿来解释当前排名。

## 应用型自测

1. `new Fuse(docs)` 不传 `keys`，对象文档的 `search('scalzi')` 默认能搜到 `author` 吗？
2. `search('   ')` 返回空数组，还是全部文档？
3. 在未打开 token 构建开关时，`useTokenSearch: true` 会怎样？

检查点：

1. 不能。默认 `keys: []`，对象记录没有可搜路径。
2. 全部文档。空白字符串走“列出 `_docs`”。
3. 构造时抛 `TOKEN_SEARCH_UNAVAILABLE`。

## 延伸阅读

- 官方文档：[fusejs.io](https://www.fusejs.io/)
- 固定源码：[krisk/Fuse](https://github.com/krisk/Fuse) —— 本文绑定 `45bac9fe2e71fe8c680c861a35a8b226c4ae6d5a`
- 审查记录：仓库内 `docs/client-search-source-review-20260827-de.md`
- [[minisearch]] —— 倒排 + BM25+ 的对照

## 关联

- [[minisearch]] —— 内存倒排全文搜索
- [[elasticsearch]] —— 服务端 Bitap/BM25 之外的工业对照
- [[meilisearch]] —— 服务端容错搜索
- [[starlight]] —— 静态站搜索默认不是 Fuse.js

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
