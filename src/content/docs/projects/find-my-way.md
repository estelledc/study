---
title: find-my-way — 按 HTTP method 建 radix 树的 Node 路由器
description: 介绍 find-my-way 9.9.0 如何把每条 method 收成一棵树、lookup 如何 decode URL，以及 HEAD 不会自动改派成 GET。
来源: https://github.com/delvedor/find-my-way
日期: 2026-08-27
分类: Web 框架
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/delvedor/find-my-way
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 31aa3ae9c26a898d3f478c6bbfcd079ab85d1b99
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 9.9.0
---

## 是什么

find-my-way 是一个给 Node `http` 用的 radix tree HTTP 路由器。日常类比：它像按动词分柜的档案室——`GET` 一柜、`POST` 一柜；柜里再按路径前缀往下走，而不是把所有卡片摊在一张桌上从第一张看到最后一张。

你写：

```js
const http = require('node:http')
const router = require('find-my-way')()

router.on('GET', '/users/:id', (req, res, params) => {
  res.end(params.id)
})

http.createServer((req, res) => router.lookup(req, res)).listen(3000)
```

固定 9.9.0 的入口是 `lookup(req, res, ctx?, done?)`。它先从 request 推导 constraints，再 `find(method, url)`；找到 handler 就调用，找不到就走 `defaultRoute`，再没有就 `res.statusCode = 404` 后 `end()`。

## 为什么重要

不理解 method 树和 `lookup` 的解码边界，就解释不了下面几件事：

- 为什么注册 `GET /` 不会自动响应 `HEAD /`
- 为什么 `/:id?` 其实是两条路由，且可选段必须在最后
- 为什么重复注册同一 method + pattern + constraints 会抛错，而 [[itty-router]] 只是再 push 一条
- 为什么超长参数默认不是“截断后匹配”，而是失败（默认 `maxParamLength = 100`）

## 核心要点

固定 9.9.0 的主链可以拆成五步：

1. **按 method 建树**：`on(method, path, opts, handler, store)` 校验 path 以 `/` 或 `*` 开头。每个 method 一棵 `StaticNode`；`GET` 额外挂在 `_treeGET`，避免走 35 个 key 的 `this.trees` 字典。

2. **可选参数拆成两条**：`/:id?` 用 `OPTIONAL_PARAM_REGEXP` 认出来，必须是整段路径的结尾，然后分别注册带参数和不带参数的 path。`*` 必须是最后一个字符，参数名记成 `*`。

3. **字面冒号用 `::`**：扫描时看到 `::` 就跳过一层，不会当成 parametric node。`%` 在静态段里会先写成 `%25` 再进树。

4. **`lookup` → `find` → handler**：同步路径调用 `constrainer.deriveConstraints(req, ctx)`；若传入 `done`，constraints 变成异步回调。`find` 若 url 不以 `/` 开头，会按 `http`/`https` 绝对地址抽 path；fragment 或空 authority 走 `_onBadUrl`。query 默认交给 `fast-querystring`，空串得到 `{}`。

5. **匹配顺序靠回溯栈**：`getNextNode` 先找静态子节点，没有再取 parametric（regex / 带 `staticSuffix` 的排前面），wildcard 推进 brother stack。参数超长且配置了 `onMaxParamLength` 时走该回调，否则当未命中。

## 实践示例

### 案例 1：HEAD 必须单独注册

```js
const router = require('find-my-way')()
router.on('GET', '/ping', (req, res) => res.end('ok'))

router.find('HEAD', '/ping') // null
router.on('HEAD', '/ping', (req, res) => res.end())
```

`lib/http-methods.js` 把 `HEAD` 列成独立动词。`all('/ping', handler)` 会按这张表（Node 22.9.0 快照）逐个 `on`，其中包含 `HEAD`，但普通 `get()` 不会。Fastify 若要自动 HEAD，是框架层的事，不是这个库的默认。

### 案例 2：可选尾参数是两次 `on`

```js
router.on('GET', '/items/:id?', (req, res, params) => {
  res.end(params.id || 'all')
})
```

源码先断言可选段位于末尾，再注册 `/items/:id` 和 `/items`（空可选时退成 `/`）。它不是运行时的“这段可有可无”，而是两棵叶子。

### 案例 3：constraints 让同一 path 能并存

```js
router.on('GET', '/', { constraints: { host: 'api.example.com' } }, handlerA)
router.on('GET', '/', { constraints: { host: 'admin.example.com' } }, handlerB)
```

`constrainer.validateConstraints` 通过后，`handlerStorage` 按 constraints 存多份 handler。method + pattern + constraints 完全相同才会抛 `already declared`。`lookup` 用 request 推导出的 constraints 去取匹配项。

## 踩过的坑

1. **把 README 的 “crazy fast” 写成已测倍数**：本轮未跑 `benchmark/`，也未对比 [[itty-router]] 的线性扫描。匹配结构是 radix tree，速度数字不是本页证据。

2. **以为 `find('GET', '/x')` 能服务 `HEAD`**：method 树分开。未建 `HEAD` 树时 `find` 直接 `null`。

3. **把坏百分号编码当成普通 404**：`safeDecodeURI` 抛错时走 `_onBadUrl`；没配 `onBadUrl` 就返回 `null`，再落到 defaultRoute / 404。

4. **在中间段落写 `/:opt?`**：断言要求可选参数是最后一段，否则抛错。

5. **用未声明的 method 字符串**：`on('FOO', ...)` 会因为不在 `httpMethods` 里失败。自定义动词要先改这张表，本页未覆盖那条扩展路径。

## 适用 vs 不适用场景

**适用**：

- Node `http.Server` / Fastify 这类要 `lookup(req, res)` 的服务
- 路由很多，希望按路径前缀走树，并且接受“同 path 不同 constraints”的并存
- 需要 `ignoreTrailingSlash`、`caseSensitive`、自定义 `querystringParser`

**不适用**：

- 运行时只有 `Request`，想直接 `export default { fetch }`——看 [[itty-router]] / [[hono]]
- 需要本库自动把 `HEAD` 映射到 `GET`
- 想把“比某某路由器快 N 倍”写进选型结论——本轮未测
- 目标 Node 低于 20（`engines.node` 为 `>=20`）

## 固定版本边界

- 本文绑定 `delvedor/find-my-way@31aa3ae9c26a898d3f478c6bbfcd079ab85d1b99`，tag `v9.9.0`、package 与 npm `gitHead` 均为同一提交。
- 运行时依赖 `fast-querystring`、`safe-regex2`、`fast-deep-equal`；默认 `caseSensitive=true`、`maxParamLength=100`、`allowUnsafeRegex=false`。
- 本文未安装依赖、未跑 borp / tstyche / bench，状态保持 `UNVERIFIED`。

## 学到什么

1. **HTTP 路由器先按 method 分柜，再按 path 走路**——`HEAD` 不是 `GET` 的别名，除非上层自己改派。
2. **可选参数是编译期复制，不是运行期开关**。
3. **未命中、坏 URL、超长参数是三条出口**——不要都叫 404。
4. **树的“快”来自结构，不来自本页未跑的 benchmark 表**。

## 应用型自测

1. 只注册了 `GET /ping` 时，`find('HEAD', '/ping')` 是什么？
2. `/:id?` 会往 `this.routes` 里推进几条？
3. 没有 `defaultRoute` 且 `find` 为 null 时，`lookup` 对 `res` 做什么？

检查点：

1. `null`。`HEAD` 与 `GET` 不是同一棵树。
2. 两条：完整参数 path 和去掉可选段的 path。
3. `res.statusCode = 404` 然后 `res.end()`。

## 延伸阅读

- 仓库：[delvedor/find-my-way](https://github.com/delvedor/find-my-way) —— 本文绑定提交 `31aa3ae9c26a898d3f478c6bbfcd079ab85d1b99`
- 对照：[[itty-router]] —— Fetch 入口 + 线性正则表
- 上层：[[fastify]] —— 默认路由器就是 find-my-way
- 同主题：[[hono]] —— 另一套 `fetch` 路由器竞选

## 关联

- [[fastify]] —— 把这棵树嵌进 schema 编译与 logger
- [[itty-router]] —— 不要用 radix 语义去解释它的 `routes` 数组
- [[hono]] —— SmartRouter 竞选，不是 method 分柜

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[itty-router]] —— itty-router — 用线性正则表匹配 Request 的微型路由器
