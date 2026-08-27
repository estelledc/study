---
title: itty-router — 用线性正则表匹配 Request 的微型路由器
description: 介绍 itty-router 5.0.24 如何把 method 推进 routes 数组、用正则吃路径，以及 IttyRouter / Router / AutoRouter 三条 fetch 合同。
来源: https://github.com/kwhitley/itty-router
日期: 2026-08-27
分类: Web 框架
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/kwhitley/itty-router
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: ec4264f429c04e5f2a40a5b5466b9414254601d1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.0.24
---

## 是什么

itty-router 是一个面向 Web 标准 `Request` 的微型 HTTP 路由器。日常类比：它不像邮局按邮编前缀分拣，而像把每条路线写成一张卡片，来信时从上往下对卡片——哪张先对上、handler 先给出非空结果，就停。

你写：

```js
import { IttyRouter } from 'itty-router'

const router = IttyRouter()
router.get('/users/:id', ({ params }) => new Response(params.id))
export default { fetch: router.fetch }
```

固定 5.0.24 里，`router.get` 并不是预先建好的方法表；对象的 `__proto__` 是一个 `Proxy`，`get` 任意属性名都会把 `prop.toUpperCase()`、编译后的 `RegExp` 和 handlers 推进 `routes`。入口始终是 `fetch(request, ...args)`。

## 为什么重要

不理解“线性正则表 + 首个非空返回”，就解释不了下面几件事：

- 为什么注册顺序就是匹配顺序，后写的更具体路径抢不过先写的宽路径
- 为什么 `router.all` 能吃任意 method，而 `HEAD` 不会自动改派成 `GET`
- 为什么裸 `IttyRouter` 没命中时 `fetch` 变成 `undefined`，`AutoRouter` 却会给出 404 JSON
- 为什么 `:path+` 能跨斜杠，而普通 `:id` 在同一段里停

## 核心要点

固定 5.0.24 的主链可以拆成五步：

1. **用 Proxy 收路由**：`IttyRouter` 与 `Router` 把 `base + route` 编进正则。顺序是去重斜杠、`:name+` 贪婪（`[^]+`）、`:name` 命名（字符类里的 `$1` 是替换串回填的前缀，例如 `/` 会变成 `[^/]`）、转义 `.`、可选通配 `*`，最后加 `/*$` 吃尾斜杠。

2. **先解析 query**：`fetch` 用 `new URL(request.url)`，再把 `searchParams` 写入 `request.query`。同一个 key 出现两次时收成数组。

3. **线性扫描**：对 `routes` 逐条看 `method == request.method || method == 'ALL'`，再用 `url.pathname.match(regex)`。命中后写入 `request.params`（来自 named groups）和 `request.route`。

4. **handler 返回非空即停**：`await handler(request.proxy ?? request, ...args)` 只要不是 `null`/`undefined` 就 `return`。`IttyRouter` 没有 before/catch/finally；扫完仍无响应时函数结束，得到 `undefined`。

5. **Router / AutoRouter 加生命周期**：`Router` 的 `before` 在进路由表前跑，第一个非空返回就跳出；`catch` 接 `try` 里的错误，没有就原样抛；`finally` 用 `??` 保留已有响应。`AutoRouter` 在 `before` 最前面插入 `withParams`，`catch` 固定为 `error`，`finally` 先把空响应换成 `missing`（默认 `error(404)`），再交给 `format`（默认 `json`）。

## 实践示例

### 案例 1：三条路由器不是同一个默认值

```js
import { IttyRouter, Router, AutoRouter } from 'itty-router'

const tiny = IttyRouter()
const staged = Router({ catch: (err) => new Response(err.message, { status: 500 }) })
const auto = AutoRouter()
```

`tiny.fetch` 只扫表。`staged.fetch` 才有 before/catch/finally。`auto` 是 `Router` 的预设：参数代理、错误转 JSON、空结果变 404，再 `JSON.stringify`。

### 案例 2：贪婪参数和命名参数

```js
const router = IttyRouter()
router.get('/files/:path+', ({ params }) => new Response(params.path))
router.get('/users/:id', ({ params }) => new Response(params.id))
```

`:path+` 编译成 `(?<path>[^]+)`，可以含斜杠。`:id` 编译时把前缀 `/` 写进字符类，所以停在下一段。`:name+` 的替换发生在普通 `:name` 之前，否则 `+` 会被吃进名字。

### 案例 3：CORS 预检是短路，不是中间件链

```js
import { AutoRouter, cors } from 'itty-router'

const { preflight, corsify } = cors()
const router = AutoRouter({
  before: [preflight],
  finally: [corsify],
})
```

`preflight` 看到 `OPTIONS` 就 `return new Response(null, { status: 204 })` 并补 CORS 头，**不会**再往下走。`corsify` 若响应已有 `access-control-allow-origin`，或 status 是 101，就原样返回；否则克隆响应再追加头。`origin: '*'` 且 `credentials: true` 时，允许源改成请求的 `Origin`。

## 踩过的坑

1. **把 itty-router 当成 radix 路由器**：匹配代价随**已注册条数**走，不随路径段数走。对照 [[find-my-way]] 的 method 树。

2. **以为 `HEAD` 会走 `GET`**：只有显式 `router.head` 或 `router.all` 能对上 `HEAD`。这和 Hono 核心把 `HEAD` 改派成 `GET` 不同。

3. **在 `IttyRouter` 上指望 404**：未命中就是 `undefined`。要默认 JSON 404 用 `AutoRouter`，或自己在 `Router({ finally })` 里补。

4. **把 `withParams` 当成改 `request.params`**：它只给 `request.proxy` 套一层 `Proxy`，读不到的属性再回退到 `params`。`fetch` 传给 handler 的是 `request.proxy ?? request`。

5. **把 npm `5.0.24` 的 `gitHead` 当成 tag 提交**：npm 指向父提交 `dbf8bffa...`（当时 `package.json` 仍是 `5.0.23`）。本页绑定 annotated tag `v5.0.24` → `ec4264f4...`，相对父提交只改版本号。

## 适用 vs 不适用场景

**适用**：

- 运行时已经给你 `Request` / `Response`，例如 Workers、Bun、Deno
- 路由表很小，希望读源码就能看懂匹配，而不是先学一棵树
- 需要 `IttyRouter` 的最小表，或 `AutoRouter` 的 404 / JSON / 参数代理预设

**不适用**：

- 路由条数会涨到需要按路径段数匹配——看 [[find-my-way]]
- 必须在 Node `http.Server` 上直接 `lookup(req, res)`，又不想自己把 IncomingMessage 包成 `Request`
- 要把 README 里的体积或速度数字当成已测结论——本轮未测

## 固定版本边界

- 本文绑定 `kwhitley/itty-router@ec4264f429c04e5f2a40a5b5466b9414254601d1`，annotated tag `v5.0.24`，仓内 version 为 `5.0.24`。
- npm `itty-router@5.0.24` 的 `gitHead` 是父提交 `dbf8bffa255cb44ab8ee782fa55672501c1050e4`；`src/` 与 tag 无 diff。
- `package.json` 未声明 `engines`。本文未安装依赖、未跑 bun test，状态保持 `UNVERIFIED`。

## 学到什么

1. **路由器的合同是“怎么停”，不只是“怎么写路径”**——首个非空返回、未命中是 `undefined` 还是 404，都要写进选型。
2. **Proxy 方法名不等于预注册 HTTP 动词表**——`ALL` 是字符串比较，不是树合并。
3. **生命周期是加在 `Router` 上的**——不要用 AutoRouter 的 404 去解释裸 `IttyRouter`。
4. **CORS 预检是直接 204**——顺序必须写进 `before`，不能假设它会 `next()`。

## 应用型自测

1. `IttyRouter().fetch(new Request('https://x/nope'))` 在未注册路由时返回什么？
2. `:file+` 和 `:file` 哪个能匹配 `/a/b/c`？
3. `AutoRouter` 的 `catch` 和默认 `missing` 分别是什么？

检查点：

1. `undefined`。没有 before/finally，扫完就结束。
2. 只有 `:file+`。贪婪捕获用 `[^]+`，普通命名参数在段内停。
3. `catch` 是 `error`；`missing` 默认 `() => error(404)`，再交给 `json`。

## 延伸阅读

- 仓库：[kwhitley/itty-router](https://github.com/kwhitley/itty-router) —— 本文绑定提交 `ec4264f429c04e5f2a40a5b5466b9414254601d1`
- 对照：[[find-my-way]] —— Fastify 用的 radix 路由器，按 method 建树
- 同主题入口：[[hono]] —— 也是 `fetch(request)`，但默认 SmartRouter 竞选
- 文档：[itty.dev/itty-router](https://itty.dev/itty-router)

## 关联

- [[find-my-way]] —— 线性正则表 vs method radix tree
- [[hono]] —— 同样面向 Fetch；`HEAD` 改派语义不同
- [[fastify]] —— 上层框架选的是 find-my-way，不是 itty-router

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[find-my-way]] —— find-my-way — 按 HTTP method 建 radix 树的 Node 路由器
