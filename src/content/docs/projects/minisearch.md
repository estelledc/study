---
title: minisearch — 浏览器里的小型全文搜索引擎
来源: 'https://github.com/lucaong/minisearch'
日期: 2026-05-30
分类: projects
难度: 中级
---

## 是什么

minisearch 是一个**纯 JavaScript 写的全文搜索引擎**，零依赖、约 27KB（gzip 后），可以直接跑在浏览器或 Node 里。日常类比：像把一台**字典 + 评分员**塞进网页——你给它一堆文档，用户输入关键字，它从内存里翻出最相关的几条。

```js
import MiniSearch from 'minisearch'

const ms = new MiniSearch({ fields: ['title', 'body'] })
ms.addAll([
  { id: 1, title: '猫的图鉴', body: '布偶 / 暹罗 / 折耳' },
  { id: 2, title: '狗的图鉴', body: '柴犬 / 边牧 / 金毛' }
])
ms.search('暹罗')   // → [{ id: 1, score: 1.83, ... }]
```

它不是"轻量版 Elasticsearch"，而是**一种主张**：很多产品的搜索数据规模在**几十万 doc 以下**（文档站、博客、组件库、本地笔记），根本不需要后端，浏览器装得下。

## 为什么重要

不理解 minisearch 这类前端搜索引擎，下面这些事就解释不清楚：

- 为什么 VitePress 等文档框架的"搜索框"在断网时仍然能用——索引就在你浏览器里（同类思路还有 [[starlight]] 默认的 Pagefind）
- 为什么静态博客可以**零运维**做出"输入即时高亮结果"的搜索体验
- 为什么有些"快"，是因为索引数据结构选对了（前缀树 vs 线性扫）
- 为什么"千万级文档全文检索"和"几万条记录的浏览器内检索"是两件事，工具不能混用

## 核心要点

minisearch 的内部由四块拼装而成：

1. **倒排索引**：把"文档 → 词"翻成"词 → 文档"。类比：图书馆从"书架排号"翻成"主题索引卡"，找"暹罗"时直接跳到那张卡，看上面写着哪些书有这个词。

2. **Radix Tree（压缩前缀树）**：把所有词按前缀折成一棵树。类比：电话簿不会把"张三 / 张四 / 张五"分三页排，而是合并到"张"这个分支下。这让前缀搜索（"张" 找全部姓张的）和容错搜索都变成树上的局部 walk。

3. **BM25+ 评分**：信息检索里的标准排序公式，关注三件事——这个词在文档里出现的频次、这个词在多少篇文档里出现过（越罕见越值钱）、文档长度（长文档要被压一下分）。

4. **增量编辑**：可以随时 add / remove / replace 一篇文档，不用重建整个索引——这是它相对老牌 Lunr.js 的关键优势。

## 实践案例

### 案例 1：给静态文档站加搜索

```js
// build time：把所有 markdown 喂进 minisearch
import MiniSearch from 'minisearch'
const ms = new MiniSearch({
  fields: ['title', 'body'],
  storeFields: ['title', 'url']
})
ms.addAll(allDocs)            // allDocs 来自 markdown 解析
fs.writeFileSync('search-index.json', JSON.stringify(ms))
```

```js
// 浏览器运行时：加载索引、即时搜
const ms = MiniSearch.loadJSON(json, { fields: ['title', 'body'] })
input.oninput = () => render(ms.search(input.value, { prefix: true }))
```

**逐部分解释**：

- build 时 `addAll` 一次性算好倒排索引，再 `JSON.stringify(ms)` 序列化落盘。
- 浏览器用 `MiniSearch.loadJSON` 把 JSON 复活成可查询实例，无需再扫原文。
- `prefix: true` 让用户没打完也能出结果（"图" 就匹配"图鉴"）。

### 案例 2：本地笔记 app 的增量索引

```js
const ms = new MiniSearch({ fields: ['title', 'body'] })

function onNoteCreate(note) { ms.add(note) }
function onNoteEdit(note)   { ms.replace(note) }
function onNoteDelete(note) { ms.remove(note) }
```

**逐部分解释**：

- `add` / `replace` / `remove` 只改倒排索引里相关 term，不重建整棵树。
- 这是相对 Lunr.js 的关键优势：笔记每秒改一次时，仍能保持交互延迟可接受。

### 案例 3：自动补全（autoSuggest）

```js
ms.autoSuggest('cat fo', { fuzzy: 0.2 })
// → [{ suggestion: 'cat food', score: 2.4, terms: [...] }, ...]
```

**逐部分解释**：

- `autoSuggest` 把最后一个未打完的 token 当前缀在树上 walk。
- `fuzzy: 0.2` 容忍约 20% 字符出错（"foof" 也能匹配"food"），用于挽救手抖。

## 踩过的坑

1. **默认 tokenize 切不出中文**：`split(/[\s\W]/)` 把"我爱猫"当成一个 token，根本没拆开。需要自己接 `nodejieba` / `kuromoji` 等分词器，通过 `tokenize` 选项注入。

2. **索引必须全量驻内存**：几十万文档以上，index JSON 可能有 50MB+，前端首屏加载会卡。这种规模该考虑 chunked index 方案（如 pagefind）。

3. **fuzzy 阈值是相对值，长 query 会失控**：`fuzzy: 0.3` 对 20 字 query 等于允许 6 个字符错，结果会被噪声淹没。应用层最好对长 query cap 住绝对编辑距离。

4. **不内置 stemming / stop-word**：英文搜 `running` 默认找不到 `run`。需要自己接 `natural` / `stemmer` 在 `processTerm` 钩子里做词形归一。

## 适用 vs 不适用场景

**适用**：

- 文档站、博客、组件库、help center 等中小规模（< 几十万 doc）的全文搜索
- 静态站点 + CDN 部署，没有后端环境却想要搜索功能
- 本地优先（local-first）应用：笔记、待办、Wiki 客户端
- 需要可序列化索引 + 离线可用的场景

**不适用**：

- 千万级文档或多租户 SaaS 搜索 → 用 [[elasticsearch]] 或 [[meilisearch]]
- 中文为主且对召回率要求高 → 默认 tokenize 不行，要自带分词器或换专门方案
- 语义搜索 / 向量检索 → minisearch 是 lexical match（按词面），不懂同义；需要 embedding + 向量库
- 100 条以内的"模糊匹配下拉框" → Fuse.js 在小数据集上更轻

## 历史小故事（可跳过）

- **2018 年**：Luca Ongaro 第一版 minisearch 发布。当时前端做全文搜索的事实标准是 Lunr.js（2014 年起步），但 Lunr 索引不能增量、fuzzy 是线性扫整个 term 表。
- **2019 年初**：作者写博客解释设计取舍——为什么用 Radix Tree、为什么换成 BM25+、为什么坚持零依赖。
- **2020-2022 年**：VitePress 等文档框架采用 / 推荐 minisearch；同期 [[starlight]] 选择另一条前端搜索路线 Pagefind，两者都证明"索引可进静态产物"。
- **2025 年**：v7.x 稳定版，单人维护 7 年仍在迭代，~6k★、API 几乎没破坏性改动。

## 学到什么

1. **搜索引擎不必很大**——核心机制（倒排索引 + 前缀树 + BM25 + 编辑距离）压成 27KB 也能跑，关键在数据结构选得对
2. **"前端 vs 后端"是个商业决策而不是技术上限**——minisearch 把这条线往前推了，许多产品根本不需要搜索服务器
3. **零依赖是一种工程美德**——单作者、7 年、API 稳定，部分原因正是没有依赖随之腐烂
4. **算法选型决定数量级**——同样是"前缀 + fuzzy"，Radix Tree + 矩阵剪枝比 Lunr 的线性扫快几个数量级，不是常数项优化

## 延伸阅读

- 官方文档：[MiniSearch API](https://lucaong.github.io/minisearch/)（API 全 + 示例）
- 设计博客：[How MiniSearch is implemented](https://lucaong.github.io/minisearch/blog/)（作者亲自讲数据结构选型）
- 论文背景：Robertson & Zaragoza, *The Probabilistic Relevance Framework: BM25 and Beyond* (2009)（BM25 / BM25+ 公式来源）
- [[elasticsearch]] —— 服务端工业级 IR 标杆，BM25 也是它的默认评分
- [[starlight]] —— 默认用 Pagefind 做静态站搜索；和 minisearch 同属"索引进前端产物"，实现不同
- [[meilisearch]] —— 同样想"用得轻的搜索"，但是走服务端路线

## 关联

- [[elasticsearch]] —— 同类问题的服务端答案；千万级文档时升级到它
- [[meilisearch]] —— Rust 写的服务端搜索，定位"比 ES 简单"，和 minisearch 的"完全前端"是两条路
- [[astro]] —— 静态站生成器，可在 build time 用 minisearch 自建索引
- [[starlight]] —— 默认搜索是 Pagefind，不是 minisearch；选型时不要混为一谈
- [[docusaurus]] —— Meta 的文档框架，自带 lunr / Algolia 二选一，可换 minisearch

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[docusaurus]] —— Docusaurus — 一组 plugin 协作出来的文档站框架
- [[elasticsearch]] —— Elasticsearch — 分布式搜索引擎
- [[manticoresearch]] —— Manticore Search — 用 MySQL 协议连的搜索 + OLAP 引擎
- [[meilisearch]] —— MeiliSearch — 开发者友好的搜索引擎
- [[sonic]] —— Sonic — 极简前缀搜索引擎
- [[starlight]] —— Starlight — Astro 文档站点主题
- [[zincsearch]] —— ZincSearch — 单二进制 Go 写的 ES 替代

