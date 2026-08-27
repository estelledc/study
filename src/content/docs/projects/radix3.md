---
title: radix3 — 无方法维的 Radix Tree 路由器
description: 固定 1.1.2 只按路径 insert/lookup，精确段压过占位，tag 与 npm gitHead 不一致
来源: https://github.com/unjs/radix3
日期: 2026-08-27
分类: Web 框架
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/radix3
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 293d3ae4d0d8719e4df62d921b2effdc2dc4567a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.1.2
---

## 是什么

radix3 是一个只认路径、不认 HTTP 方法的 Radix Tree 路由器。日常类比：它像一棵按路牌分叉的目录树——你插入的是“这条路通向哪份数据”，查找时只问路径，不问 GET 还是 POST。

你写：

```js
import { createRouter } from "radix3";

const router = createRouter();
router.insert("/path", { payload: "this path" });
router.insert("/path/:name", { payload: "named route" });
router.insert("/path/foo/**", { payload: "wildcard route" });

router.lookup("/path/fooval");
// { payload: "named route", params: { name: "fooval" } }
```

固定 `1.1.2` 里，`lookup` 把当初插入的 `data` 对象展开，需要时再挂上 `params`；没命中返回 `null`。方法维要调用方自己放进 `data`，树不管。

## 为什么重要

不理解 radix3 的节点类型和查找优先级，就解释不了下面几件事：

- 为什么 `/path/foo` 会压过 `/path/:name`，而不是“谁先注册谁赢”
- 为什么同层挂了两条不同深度的 `:param` 时，要看 `maxDepth` 而不是数组下标
- 为什么默认 `/foo` 和 `/foo/` 是同一条，打开 `strictTrailingSlash` 才分开
- 为什么今天 clone `unjs/radix3` 会进到 `h3js/rou3`，却不能把 1.1.2 的 API 当成 [[rou3]]

## 核心要点

查找链可以拆成五步：

1. **建树**：`createRouter({ strictTrailingSlash, routes })` 先规范化路径，再 `insert`。默认 `p.replace(/\/$/, "") || "/"`。

2. **三种节点**：普通段是 `NORMAL`；`:name` 和单独 `*` 是 `PLACEHOLDER`（只吃一段）；以 `**` 开头的是 `WILDCARD`（吃掉剩余段）。未命名 `*` 记 `_0`、`_1`…，未命名 `**` 记 `_`。

3. **静态快路径**：整条路径都没有占位或通配时，节点还会写进 `ctx.staticRoutesMap`。`lookup` 先查这张表。

4. **动态查找**：按 `/` 切开后，先取精确 `children.get(section)`；没有再进 `placeholderChildren`。多个 placeholder 时按 `maxDepth === remaining` 选（#95），否则取 `[0]`。走完仍无 `data` 才回退沿途记下的 wildcard。

5. **多匹配是另一条 API**：`toRouteMatcher(router).matchAll(path)` 不走 `lookup`，顺序是 wildcard → dynamic → static。`exportMatcher` / `createMatcherFromExport` 只搬运这张表。

## 实践示例

### 案例 1：精确段压过同层占位

```js
const router = createRouter();
router.insert("/path/:name", { kind: "param" });
router.insert("/path/foo", { kind: "static" });

router.lookup("/path/foo");   // { kind: "static" }
router.lookup("/path/bar");   // { kind: "param", params: { name: "bar" } }
```

`lookup` 先 `children.get("foo")`。精确 child 存在就不会进 placeholder。

### 案例 2：默认尾斜杠会被吃掉

```js
const loose = createRouter();
loose.insert("/route/without/trailing/slash", { id: 1 });
loose.lookup("/route/without/trailing/slash/"); // { id: 1 }

const strict = createRouter({ strictTrailingSlash: true });
strict.insert("/route/without/trailing/slash", { id: 1 });
strict.lookup("/route/without/trailing/slash/"); // null
```

测试把“有斜杠”和“无斜杠”两条都注册时，默认模式下两边能互相命中。

### 案例 3：通配吃剩余段，静态仍可更具体

```js
const router = createRouter({
  routes: {
    "polymer/**:id": { kind: "wild" },
    "polymer/another/route": { kind: "static" },
  },
});

router.lookup("polymer/another/route"); // { kind: "static" }
router.lookup("polymer/foo/bar/baz");
// { kind: "wild", params: { id: "foo/bar/baz" } }
```

通配参数是从当前段起 `join("/")`，不是再按段切开。

## 踩过的坑

1. **把 GitHub tag `v1.1.2` 当成 npm 1.1.2**：tag 落在祖先 `56a908e8...`，该提交 `package.json` 仍是 `1.1.1`。npm `gitHead` 才是 `293d3ae4...`。

2. **以为 `remove` 会拆掉空子树**：`remove` 用 `Object.keys(node.children)` 判断 `Map` 是否为空，对 `Map` 恒为 `[]`，父节点上的 placeholder / wildcard 指针清扫不完整。测试对 placeholder remove 仍标 TODO。

3. **把 `*` 当成跨段通配**：单独 `*` 是一段 placeholder；跨段是 `**` / `**:name`。

4. **用 `lookup` 收集中间件层**：单次 `lookup` 只返回一份 data。要“所有命中层”得走 `toRouteMatcher`.

5. **把方法写进路径**：树没有 method 维。GET/POST 共存要自己放进 `data`，或换 [[rou3]]。

## 适用 vs 不适用场景

**适用**：

- 只要路径 → 数据，方法由外层框架处理
- 需要静态 O(1) 加一层占位 / 通配
- 接受 `lookup` 返回展开后的 data 对象

**不适用**：

- 必须按 HTTP 方法分桶，或需要 URLPattern 风格的正则约束
- 依赖 `remove` 完整回收子节点
- 要用本轮未测的 benchmark 数字做选型

## 固定版本边界

- 本文绑定 `293d3ae4...`。npm `radix3@1.1.2` 的 `gitHead` 与 `package.json` 的 `name/version` 一致。
- GitHub 上 `unjs/radix3` 重定向到 `h3js/rou3`；包字段仍写 `unjs/radix3`。
- 轻量 tag `v1.1.2` 指向祖先，不是本页 revision。
- README 写明基于 `charlieduong94/radix-router`。
- 未安装依赖、未跑 vitest / bench，状态保持 `UNVERIFIED`。

## 学到什么

1. **无方法维的 trie 把“谁更具体”写进节点类型，而不是注册顺序。**
2. **静态表和动态走树是两条路**——纯字面路径不会去数 placeholder。
3. **tag 名等于版本号，不是身份证明**——要以 `package.json` + npm `gitHead` 对一下。
4. **后继包 [[rou3]] 换了函数式 API 和返回形**，不能把 1.1.2 的 `insert/lookup` 抄过去。

## 应用型自测

1. `/path/:name` 和 `/path/foo` 都在树上时，`lookup("/path/foo")` 走哪条？
2. 未命名 `*` 和未命名 `**` 的 params key 分别是什么？
3. 默认模式下 `lookup("/foo/")` 会不会先剥掉尾斜杠？Git tag `v1.1.2` 是不是 npm `1.1.2` 的提交？

检查点：

1. 精确 child `/path/foo`，不会进 `:name`。
2. `*` → `_0`（多个则 `_1`…）；`**` → `_`。
3. 会。默认剥尾斜杠。tag `v1.1.2` 不是 npm gitHead。

## 延伸阅读

- 固定源码：[h3js/rou3](https://github.com/h3js/rou3) 上的提交 `293d3ae4d0d8719e4df62d921b2effdc2dc4567a`（`unjs/radix3` 重定向到此仓）
- 对照入口：`src/router.ts`、`src/matcher.ts`、`tests/router.test.ts`
- 后继 API：[[rou3]]
- 同样把路径树当核心、但自带方法与中间件的框架：[[hono]]、[[fastify]]

## 关联

- [[rou3]] —— 同一仓库谱系上的后继路由器，方法维和 `{ data, params }` 返回形
- [[hono]] —— 自带 TrieRouter / SmartRouter，不直接依赖本包
- [[unstorage]] —— 同属 unjs 风格的小型工具，但管的是存储驱动而不是路径树

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[rou3]] —— rou3 — 带方法维的后继路径路由器
