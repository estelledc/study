---
title: polka — 把 Trouter 接到原生 http.Server 上的微服务器
来源: https://github.com/lukeed/polka
日期: 2026-08-27
分类: Web 框架
难度: 初级
difficulty: beginner
description: Tiny Node HTTP server that layers Trouter, middleware, and sub-apps on http.createServer.
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/lukeed/polka
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 302d74a2cbb66d9a20cdbe0c08bbd68ffba3ae46
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.5.2
---

## 是什么

polka 是一个极薄的 Node HTTP 服务器。日常类比：原生 `http.createServer` 是一扇门；polka 只在门上加了路由表、中间件队列和子应用挂载，没有 body 解析，也没有 `res.send`。

你写：

```js
const polka = require("polka");

polka()
  .get("/users/:id", (req, res) => {
    res.end(`User: ${req.params.id}`);
  })
  .listen(3000);
```

`polka()` 返回继承 Trouter 的实例。`listen()` 在没有传入 `options.server` 时才 `http.createServer()`，把 `handler` 挂到 `request` 上，然后原样转发 `server.listen` 参数。0.5.0 之后它返回 Polka 自身，不再返回 Promise。

## 为什么重要

不理解 polka 0.5.2，下面这些事都没法解释：

- 为什么没有中间件时，路由函数拿不到 `next`
- 为什么 `req.query` 来自 Node `querystring.parse`，不是 `qs`
- 为什么 `use("/users", child)` 之后，父应用不能再声明 `/users/:id`
- 为什么默认 404 其实是 `onError({ code: 404 })`

## 核心要点

固定 0.5.2 的主链可以拆成五步：

1. **解析 URL**：`@polka/url` 只切第一个 `?`。结果缓存在 `req._parsedUrl`，同一 `req.url` 不会重解析。

2. **找路由**：`this.find(req.method, pathname)` 来自 Trouter。命中则带 `req.params`。

3. **拼队列**：全局 `wares`，再加上第一段路径上的 `bwares`。`use("/api", fn)` 只在 `req.path` 第一段是 `/api` 时插入。

4. **子应用或 404**：未命中时，若第一段挂了另一个 Polka，就 `mutate` 掉前缀并转入子 `handler`；否则推进默认 `onNoMatch`。

5. **执行**：若中间件为空且只剩一个函数，直接 `(req, res)`。否则用 `next(err)` 循环；`res.finished` 为真就停。默认 `onError` 用 `err.code || err.status || 500`。

## 实践示例

### 案例 1：没有中间件时 handler 没有 next

```js
const polka = require("polka");

polka()
  .get("/", (req, res) => {
    res.end("ok");
  })
  .listen(3000);
```

源码在 `len === 0 && num === 1` 时直接 `fns[0](req, res)`。这时写 `next()` 会抛 `next is not a function`。加上任意 `use` 之后，同一条路由才会进入带 `next` 的循环。

### 案例 2：query 是 querystring，不是 qs

```js
polka().get("/search", (req, res) => {
  res.end(JSON.stringify(req.query));
});
```

`?a=1&a=2` 会按 Node `querystring.parse` 变成 `{ a: ["1","2"] }`。`?foo.bar=1` 不会变成嵌套对象。嵌套语义是 restify `queryParser`（`qs`）那一侧的合同。

### 案例 3：子应用独占第一段

```js
const users = polka().get("/:id", (req, res) => {
  res.end(req.params.id);
});

polka()
  .use("/users", users)
  // .get("/users/:id", ...)  // 会抛：Cannot mount ... because a Polka application already exists
  .listen(3000);
```

`add()` 用第一段路径当 key。父应用再声明同一段上的 method 路由会被硬拒绝，必须把 handler 写进子应用。

## 踩过的坑

1. **把 `listen()` 当 Promise**：0.5.0 起返回实例。`await polka().listen(3000)` 不会等到端口就绪。

2. **默认 404 可以改，但默认实现复用 onError**：`onNoMatch` 缺省是 `onError.bind(null, { code: 404 })`。自定义 `onError` 时，未匹配请求也会走同一函数。

3. **`next("text")` 的 body 是字符串本身**：默认 `onError` 看到 `err.length` 为真就 `res.end(err)`，状态码仍是 500。

4. **没有 body parser**：`req.body` 不会出现。JSON/form 要自己读流，或接第三方中间件。

5. **第一段挂载不是前缀树**：`/users/1/books` 的 `bwares` key 仍是 `/users`。更长前缀不会单独成组。

## 适用 vs 不适用场景

**适用**：

- 只要路由 + 中间件 + 原生 `res.end`，并接受自己接 body/静态文件
- 想把已有 `http.Server`（或测试里的假 server）通过 `options.server` 接进去
- 用子应用按第一段路径拆模块

**不适用**：

- 需要 REST 错误类型、内容协商 formatter、或“先匹配再跑 use”的模型——那是 [[restify]]
- 需要 `qs` 风格嵌套 query、或框架自带 JSON `res.send`
- 要把 readme 里相对 Express 的速度数字当成现行事实——本文没有复现 benchmark
- 想跟 `1.0.0-next.*` 的重写线混用；本页只绑定稳定 `0.5.2`

## 固定版本边界

- 本文绑定 `lukeed/polka@302d74a2...`，即 annotated tag `v0.5.2` 剥开后的提交。
- npm `polka@0.5.2` 未发布 `gitHead`；不以 registry 反推 revision。
- 仓内 `packages/polka` 依赖 `@polka/url@^0.5.0` 与 `trouter@^2.0.1`。Trouter 源码未做单独固定审查。
- npm `next` 指向 `1.0.0-next.28`，不在本页适用版本内。
- 本文未安装依赖、未跑上游 tape 测试、未测 wrk，状态保持 `UNVERIFIED`。

## 学到什么

1. **薄框架把 HTTP 语义留给 Node**——状态码、头、body 都还是 `ServerResponse`。
2. **中间件队列和路由匹配是分开的两张表**——全局 wares、按第一段的 bwares、Trouter handlers。
3. **默认 404 只是一种 onError**——改错误处理时要同时想未匹配路径。
4. **稳定线与 next 线不能混称为“当前 polka”**——0.5.2 仍是 latest。

## 应用型自测

1. 只有 `.get("/", handler)`、没有任何 `use`。`handler` 的第三参 `next` 存在吗？
2. 自定义 `onError` 后，访问未注册路径，会走 `onError` 还是单独的 404 函数？
3. 父应用 `use("/api", child)` 之后，再写 `parent.get("/api/health", ...)`，0.5.2 会怎样？

检查点：

1. 不存在；空中间件 + 单 handler 走 `(req, res)`。
2. 默认 `onNoMatch` 就是绑定了 `{code:404}` 的 `onError`；你只改 `onError` 时，未匹配也会进去。
3. `add()` 抛错，因为 `/api` 已被子应用占用。

## 延伸阅读

- 固定源码：[lukeed/polka](https://github.com/lukeed/polka) —— 本文绑定提交 `302d74a2cbb66d9a20cdbe0c08bbd68ffba3ae46`
- 路由依赖：[lukeed/trouter](https://github.com/lukeed/trouter)（本文未固定审查）
- [[express]] —— API 相近、中间件对 404 也会跑的对照
- [[restify]] —— 本轮对照：先 lookup 再 `use`
- [[hono]] —— Web 标准 Request/Response，不是 Node `http`

## 关联

- [[express]] —— 中间件签名最接近的对照
- [[restify]] —— REST 错误与分段生命周期的对照
- [[fastify]] —— 同样强调性能，但有 schema 与封装
- [[koa]] —— `await next()` 洋葱 vs polka 的单向 `next`
- [[hono]] —— 多运行时、标准 Fetch 对象
