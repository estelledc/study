---
title: InstantSearch — 用 searchClient 合同拼即时搜索 UI
description: 绑定 InstantSearch.js 4.113.0，说明 searchClient 合同、start/dispose 与 microtask 合并搜索。
来源: https://github.com/algolia/instantsearch
日期: 2026-08-27
分类: 前端 / 搜索 UI
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/algolia/instantsearch
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: ec13aefaca895b91160f6309f355801c8bf909b3
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.113.0
---

## 是什么

InstantSearch.js 是一套即时搜索 UI 运行时。日常类比：[[algolia]] 客户端是运输队，InstantSearch 是把搜索框、分面、分页钉在同一块仪表盘上的调度台——状态变了就再发一趟查询。

本页绑定 `instantsearch.js@4.113.0` / `ec13aefa...`。同提交还有 `react-instantsearch-core@7.46.0` 与 `vue-instantsearch@4.29.5`，但正文只审 JS 核心。

```js
import instantsearch from "instantsearch.js";
import { searchBox, hits } from "instantsearch.js/es/widgets";

const search = instantsearch({
  indexName: "movies",
  searchClient, // 必须实现 search()
});
search.addWidgets([
  searchBox({ container: "#searchbox" }),
  hits({ container: "#hits" }),
]);
search.start();
```

工厂函数构造 `InstantSearch`。`searchClient` 缺失或没有 `search` 方法会直接抛错。

## 为什么重要

不理解这层运行时，下面这些事都会写错：

- 为什么 `start()` 只能成功一次，`dispose()` 之后才能再 `start()`
- 为什么加一串 widget 不会发一串请求
- 为什么给了 `_initialResults` 后，首屏不再打网络
- 为什么换 [[typesense]] 还能留下同一套 widget

## 核心要点

固定版本的主链可以拆成四层：

1. **对象模型**：根实例持有 `mainIndex`（一个 index widget）和可选 `compositionID`。传了 composition 就走 composition API，不再做多 index。

2. **`start()`**：只能调用一次。它用 `algoliasearch-helper@3.29.3` 建 `mainHelper`，把 `search` 改写成：有搜索 widget 时走 `searchOnlyWithDerivedHelpers()` 或 `searchWithComposition()`，有 recommend widget 时再 `recommend()`。

3. **调度**：`scheduleSearch` / `scheduleRender` 用 `defer` 折到 microtask，同一轮多次 refine 合并成一次。默认 `stalledSearchDelay` 是 200ms，超时后 `status` 变为 `stalled`。

4. **首搜规则**：`start()` 前已经有 widget 才自动搜；提供 `_initialResults` 时先 hydrate，并把第一次 `scheduleSearch` 换成 noop。`insights` 默认未设；结果带 `_automaticInsights` 时才自动挂 middleware。

## 实践示例

### 案例 1：自定义 searchClient，不绑死 Algolia

```js
instantsearch({
  indexName: "movies",
  searchClient: {
    search(requests) {
      return backend.search(requests); // 返回 { results }
    },
  },
}).start();
```

官方文档示例就是这个形状。[[typesense]] 的 InstantSearch adapter 也是填这个洞。

### 案例 2：受控状态，而不是默认 URL routing

```js
instantsearch({
  indexName: "movies",
  searchClient,
  onStateChange({ uiState, setUiState }) {
    setUiState(uiState);
  },
}).start();
```

设置 `onStateChange` 后实例变成受控：你负责把 UI 写回去。`searchFunction` 在 4.x 已弃用。

### 案例 3：先 hydrate 再 start，避免首屏空搜

若框架层写入 `_initialResults`，`start()` 会 `hydrateSearchClient`，并跳过第一次网络搜索。这是 SSR / 框架 flavor 的合同，不是“start 永远立刻请求”。

## 踩过的坑

1. **`start()` 调两次**：第二次抛错。要重启先 `dispose()`。
2. **`start()` 前一个 widget 都没有**：不会自动发搜索。
3. **把 InstantSearch 当成 Algolia 引擎**：它只调度 `searchClient` 和 helper。
4. **`compositionID` 再叠多 index**：固定实现明确不支持。
5. **把 200ms stalled 当成请求超时**：那是 UI 状态，不是 [[algolia]] transporter 的 2s read timeout。

## 适用 vs 不适用场景

**适用**：

- 用 widget / connector 拼搜索框、分面、hits
- 官方 Algolia 客户端或任何实现了 `search()` 的适配器
- 需要 URL routing、insights middleware 或 SSR hydrate

**不适用**：

- 只要命令式打一枪 API：直接用 [[algolia]] 客户端
- 离线、无后端的纯前端索引：看 [[minisearch]]
- 本页未展开的 React / Vue 封装细节——那些包只在同提交上对过身份
- 需要本页给出渲染性能或包体数字

## 固定版本边界

- 本文绑定 `algolia/instantsearch@ec13aefa...`，`instantsearch.js@4.113.0`。
- peer：`algoliasearch >= 3.1 < 6`；UI 组件 `instantsearch-ui-components@0.37.0`。
- 同提交的 React / Vue 包未作为本页 API 合同。
- 未安装依赖、未跑 Storybook / 上游测试、未发搜索请求，状态保持 `UNVERIFIED`。

## 学到什么

1. **UI 运行时和托管引擎是两份合同**——换 client 不必换 widget
2. **`start()` 是生命周期，不是幂等初始化**
3. **microtask 合并才是“边输边搜”不打爆 API 的原因**
4. **hydrate 与空 widget 树都会取消“start 必请求”的印象**

## 应用型自测

1. 构造实例后立刻 `start()`，但还没 `addWidgets`。会不会自动搜索？
2. `start()` 已经成功过一次，再调用一次会怎样？
3. 一次 keystroke 里连续 refine 三次，会发三次 `searchClient.search` 吗？

检查点：

1. 不会。没有 widget 时 `start()` 不 `scheduleSearch`。
2. 抛错。必须先 `dispose()`。
3. 不必然。`defer` 会把同一轮调度折成一次。

## 延伸阅读

- 官方文档：[What is InstantSearch?](https://www.algolia.com/doc/guides/building-search-ui/what-is-instantsearch/js/)
- 固定源码：[algolia/instantsearch](https://github.com/algolia/instantsearch) —— 本文绑定 `ec13aefaca895b91160f6309f355801c8bf909b3`
- 审查记录：仓库内 `docs/hosted-search-source-review-20260827-dw.md`
- [[algolia]] —— 官方 `searchClient` 实现
- [[typesense]] —— 用 adapter 接同一套 UI 的对照

## 关联

- [[algolia]] —— 默认 searchClient 与 host / retry 合同
- [[typesense]] —— InstantSearch adapter 对照
- [[meilisearch]] —— 另一条自托管搜索
- [[minisearch]] —— 无后端 UI 需求时的对照
- [[starlight]] —— 文档站默认 Pagefind，不一定要上 InstantSearch

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[algolia]] —— Algolia — 托管搜索的官方 JavaScript 客户端
