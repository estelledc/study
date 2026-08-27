---
title: route-recognizer — 把多条路由编进 NFA 再选出最静态的一条
description: 介绍 route-recognizer 0.3.4 如何用静态 / 动态 / 星段状态机识别路径，并按最少星段排序。
来源: https://github.com/tildeio/route-recognizer
日期: 2026-08-27
分类: 路由匹配
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/tildeio/route-recognizer
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 6832b404a3095fbed0caf97a2fa4cf7fe5e0ffa8
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.3.4
---

## 是什么

route-recognizer 是一个把多条路由登记进状态机、再对一个 URL 选出“最静态”匹配的小库。日常类比：它不是只读一块路牌，而是把整张街区地图先铺好；来人报地址时，先走字符自动机，并列命中再按“少星段、少动态、多静态”排序。

你写：

```js
const RouteRecognizer = require("route-recognizer");
const router = new RouteRecognizer();

router.add([{ path: "/posts/:id", handler: showPost }]);
router.recognize("/posts/1");
// => [{ handler: showPost, params: { id: "1" }, isDynamic: true }]
```

`handler` 对库来说是不透明对象。固定 0.3.4 的作者源在 `lib/route-recognizer.ts`，发布入口是 `dist/route-recognizer.js`。

## 为什么重要

不读固定 0.3.4 的分段与排序，就解释不了 Ember / `router.js` 这类嵌套路由为什么“看起来动态，实际先走静态”：

- 为什么 `/posts/edit` 和 `/posts/:id` 同时存在时，`/posts/edit` 会进静态那条
- 为什么 `recognize` 会剥掉 `#` 和 `?`，查询串另进 `queryParams`
- 为什么动态段默认要编解码，星段却原样留下
- 为什么同名路由的重复检查被注释掉，后登记的名字会盖住前面的

## 核心要点

固定 0.3.4 的主链可以拆成五步：

1. **登记一条或多段 handler**：`add([{ path, handler }, ...])` 描述嵌套路径。`map(callback)` 提供 `match("/admin").to("admin", ...)` DSL，最后仍回到 `add`。

2. **按 `/` 切成四类段**：去掉开头 `/` 后，空段是 Epsilon，`:id` 是 Dynamic，`*path` 是 Star，其余是 Static。动态和星段记入 `names`。

3. **字符级 NFA**：每个非空段先放一个 `/` 状态，再按类型挂后续状态。Dynamic 吃“不是 `/` 的一串”，Star 吃任意字符。

4. **识别后排序**：`recognize` 逐字符走 NFA，收集带 `handlers` 的接受态，再 `sortSolutions`：先比星段少，再比动态少，再比静态多。

5. **用正则回填参数**：胜出状态上的 `pattern` 这时才编译成 `RegExp`，从原始 path 取出捕获。查询串不进 NFA。

对照 [[path-to-regexp]]：那边一次编一条模板；这边先建表，再在冲突里挑一条。

## 实践示例

### 案例 1：静态段压过动态段

```js
router.add([{ path: "/posts/edit", handler: editPost }]);
router.add([{ path: "/posts/:id", handler: showPost }]);

router.recognize("/posts/edit");
// => [{ handler: editPost, params: {}, isDynamic: false }]
```

两条都能走到接受态时，`types` 里动态段更少、静态段更多的胜出。注释也写明：这套策略处理不好 `/posts/:id/new` 对 `/posts/edit/:id` 这种交错。

### 案例 2：嵌套 handler 各自带参数

```js
router.add([
  { path: "/posts/:id", handler: posts },
  { path: "/comments", handler: comments }
]);

router.recognize("/posts/1/comments");
// => [
//   { handler: posts, params: { id: "1" }, isDynamic: true },
//   { handler: comments, params: {}, isDynamic: false }
// ]
```

`add` 按数组顺序累加段，每个元素一份 handler。识别结果是 array-like 的 `RecognizeResults`，还挂着 `queryParams`。

### 案例 3：查询串不参与路径匹配

```js
router.add([{ path: "/foo/bar", handler: handler }]);
router.recognize("/foo/bar?show");
// queryParams => { show: "true" }
```

`#` 之后丢掉。`?` 之后走 `parseQueryString`：没有 `=` 的键当成 `"true"`，`+` 先换成 `%20` 再 decode；decode 失败得到空串。`generateQueryString` 会按 key 排序，数组写成 `key[]=`。

## 踩过的坑

1. **以为后登记的动态路由会盖住静态路由**：识别按 `types` 排序，不是按插入顺序。

2. **把 `queryParams` 写在 `add()` 的 route 对象上当成白名单**：`Route` 类型有这个字段，但 `recognize` 仍解析并保留查询串里出现的键，包括未声明的 `other`。

3. **依赖同名路由报错**：`add(..., { as })` 里重复名字检查被注释掉。后写的 `this.names[name]` 会覆盖。

4. **关掉编解码后仍当默认行为**：`ENCODE_AND_DECODE_PATH_SEGMENTS` 默认 true。关掉后 `recognize` 改走 `decodeURI`，动态段也不再 `decodeURIComponent`。

5. **把 README 的 “under 2k” 当成本轮测量**：文档写过体积，本轮未安装 Ember CLI、未打包、未跑 bench。

## 适用 vs 不适用场景

**适用**：

- 需要先注册一批路由，再对一个 URL 选出嵌套 handler 列表
- 希望静态路径自然压过 `:id` 和 `*path`
- 调用方自己解释 `handler`，只要识别与 `generate`

**不适用**：

- 只想把单条 `/users/:id` 编成正则——[[path-to-regexp]] 更小
- 还要类型化 path / loader——[[tanstack-router]]
- 不能接受查询串“能解析就收下”、或不能接受同名路由静默覆盖
- 需要本轮验证的 bundle 或 Ember CLI 构建产物

## 固定版本边界

- 本文绑定 `tildeio/route-recognizer@6832b404a3095fbed0caf97a2fa4cf7fe5e0ffa8`。tag `v0.3.4` 与 npm `route-recognizer@0.3.4` 的 `gitHead` 指向同一提交。
- `package.json` 无运行时依赖；`main` 为 `dist/route-recognizer.js`，`module` / `jsnext:main` 为 `dist/route-recognizer.es.js`。
- 源码里 `static VERSION = "VERSION_STRING_PLACEHOLDER"`，发布构建才会替换。
- 默认 `ENCODE_AND_DECODE_PATH_SEGMENTS = true`；`normalizeSegment` 只保留 `%` 与 `/` 的百分号编码。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **识别是“先走自动机，再排序”**——冲突不是谁先 `add` 谁赢。
2. **动态段和星段的捕获合同不同**——`([^/]+)` vs `(.+)`，以及是否 decode。
3. **查询串是第二张表**——NFA 只看 path，`?` 与 `#` 被提前剪掉。
4. **名字只是 generate 的索引**——重复 `as` 不会失败，只是后写覆盖。

## 应用型自测

1. 同时登记 `/posts/edit` 和 `/posts/:id` 后，`recognize("/posts/edit")` 会进哪条？
2. `recognize("/foo?show")` 的 `queryParams.show` 是什么？
3. 两次 `add(..., { as: "post" })` 会不会抛错？

检查点：

1. 静态 `/posts/edit`。排序先看更少动态段。
2. 字符串 `"true"`。没有 `=` 的查询键被写成这个字面量。
3. 不会。重复名字检查被注释掉，后登记覆盖 `this.names.post`。

## 延伸阅读

- 文档：[tildeio/route-recognizer](https://github.com/tildeio/route-recognizer)
- 固定源码：[tildeio/route-recognizer](https://github.com/tildeio/route-recognizer) —— 本文绑定提交 `6832b404a3095fbed0caf97a2fa4cf7fe5e0ffa8`
- [[path-to-regexp]] —— 单模板编正则，不维护路由表
- [[tanstack-router]] —— 另一条“路由是类型”的对照

## 关联

- [[path-to-regexp]] —— 单模板 vs 多路由 NFA
- [[express]] —— Express 自己维护栈，不使用这套 recognizer
- [[tanstack-router]] —— 类型化路由树，运行时匹配合同不同
- [[msw]] —— 测试层按单条 handler 匹配，更接近 path-to-regexp

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
