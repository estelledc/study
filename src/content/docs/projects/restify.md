---
title: restify — 先匹配路由再跑 use 链的 Node REST 服务器
来源: https://github.com/restify/node-restify
日期: 2026-08-27
分类: Web 框架
难度: 中级
difficulty: intermediate
description: REST-oriented Node HTTP server whose use() chain runs only after find-my-way matches a route.
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/restify/node-restify
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 784dd4182137850b95988ab478e7c206e1df98c1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 12.0.0
---

## 是什么

restify 是一个面向 REST 的 Node HTTP 服务器。日常类比：它不像一条“谁先注册谁先跑”的传送带，更像机场安检——`first` 可以在框架动手前拦人，`pre` 在分诊台前处理所有旅客，真正的柜台（`use` + 路由 handler）只在找到对应航班之后才开门。

你写：

```js
const restify = require("restify");
const server = restify.createServer();
server.get("/users/:id", (req, res, next) => {
  res.send({ id: req.params.id });
  next();
});
server.listen(8080);
```

`createServer()` 默认把 `name` 写成 `"restify"`、装一个 pino logger，并用 `find-my-way` 做 radix 路由。插件不会自动挂上：JSON body 和 query object 都要自己 `use`。

## 为什么重要

不理解 restify 12.0.0，下面这些事都没法解释：

- 为什么 `server.use(logger)` 在 404 上可能根本不跑
- 为什么没装 `queryParser` 时 `req.query` 是原始查询字符串，不是对象
- 为什么 `next("other-route")` 不再跳到具名路由，而是 500
- 为什么空 handler 链结束、却没写响应，会被框架补一个 `InternalServerError`

## 核心要点

固定 12.0.0 的主链可以拆成五步：

1. **`first` 先于框架**：同步函数看到的是尚未 decorate 的 Node `req`/`res`。返回 `false` 立刻停，不发 `after`，也不做路由。

2. **`_setupRequest` 再装饰**：补 `req.params = {}`、计时器、pino、`res.formatters`，并在 `name !== ''` 时写 `Server` 头。

3. **`pre` 对所有请求跑**：它在 lookup 之前。路径清洗、去重斜杠这类工作放这里。

4. **先 lookup，再 `use`**：`use()` 只在 `router.lookup` 命中后执行。未命中则走 default route：同路径其他 method 给 `405` + `Allow`，否则 `ResourceNotFoundError`。

5. **路由 handler 收尾**：callback 必须是 `(req, res, next)`；async 最多 `(req, res)`。`next(false)` 停链；`next("string")` 在本版本是 500，不是具名跳转。

## 实践示例

### 案例 1：pre 能看到 404，use 看不到

```js
const restify = require("restify");
const server = restify.createServer({ name: "" });

server.pre((req, res, next) => {
  req.log.info({ path: req.getUrl().pathname }, "pre");
  next();
});
server.use((req, res, next) => {
  req.log.info("use only after a match");
  next();
});
server.get("/ok", (req, res, next) => {
  res.send({ ok: true });
  next();
});
```

`GET /missing` 会进 `pre`，不会进 `use`。把全局观测放进 `use`，未匹配流量会漏掉。

### 案例 2：query 默认不是对象

```js
server.get("/search", (req, res, next) => {
  // 没装插件时，这是 "q=restify" 这种字符串
  res.send({ raw: req.query });
  next();
});

server.use(restify.plugins.queryParser());
```

`getQuery()` 永远返回去 `?` 后的原始串。`queryParser` 才用 `qs.parse` 覆盖 `req.query`；`mapParams` 必须显式 `true` 才会写进 `req.params`。

### 案例 3：async handler 不能带 next

```js
server.get("/async", async (req, res) => {
  res.send({ ok: true });
});

// 下面这种会被 Chain.add 拒绝：AsyncFunction 又带了第三参
// server.get("/bad", async (req, res, next) => { next(); });
```

callback 三参与 async 两参是互斥合同，不是“都能写”。

## 踩过的坑

1. **把 `use` 当全局中间件**：它只服务已匹配路由。日志、审计、跨域预检如果依赖 `use`，404/405 路径不会经过。

2. **以为 `next("name")` 还能跳路由**：12.0.0 的测试把 `next("bar")` 断言成 500 `InternalServerError`。旧 CHANGES 里的具名跳转不能当现行合同。

3. **未写响应就 `next()`**：handler 链结束且还没 `headersSent` 时，框架会补 500“reached the end of the handler chain without writing a response”。

4. **`handleUncaughtExceptions: true` 不是免费的**：默认实现加载已弃用的 `domain`，文档写明有明显性能代价。

5. **`strictFormatters` 默认 true**：`res.send()` 找不到对应 formatter 会失败，不会悄悄当纯文本发出去。

## 适用 vs 不适用场景

**适用**：

- 需要 REST 错误类型、`405`/`Allow`、以及“先匹配再跑业务中间件”的 API 服务
- 已经接受 Node `>=22`，并准备显式安装 body/query 插件
- 希望 `res.send(Error)` 走 `restify-errors` 的 statusCode

**不适用**：

- 想要 Express 那种“`use` 对所有请求都跑、包括 404”的全局中间件模型
- 需要在 handler 里 `next("otherRoute")` 做内部跳转
- 只能跑 Node 20 或更早版本
- 要把静态阅读写成吞吐或冷启动结论——本文没有运行 benchmark

## 固定版本边界

- 本文绑定 `restify/node-restify@784dd418...`，GitHub tag 与 npm `restify@12.0.0` 的 `gitHead` 一致。
- 固定依赖包含 `find-my-way@^9.6.0`、`pino@^8.7.0`、`qs@^6.15.2`、`restify-errors@^8.0.2`。
- `useSemicolonDelimiter` 默认 false，以对齐 find-my-way 9.x；`ignoreTrailingSlash` 默认 false。
- 本文未安装依赖、未跑上游测试、未发网络请求，状态保持 `UNVERIFIED`。

## 学到什么

1. **中间件位置决定观测面**——`first` / `pre` / `use` / 路由 handler 看到的请求集合不同。
2. **插件不是框架默认**——query 对象和 JSON body 都是 opt-in，缺省行为更接近裸 Node。
3. **错误通道也有版本**——同名 API `next("string")` 在 12.0.0 已不是具名路由跳转。
4. **formatter 是发送合同**——`res.send` 不是 `res.end` 的别名。

## 应用型自测

1. 只注册了 `GET /items`，请求 `POST /items`。`use` logger 会跑吗？客户端更可能看到 404 还是 405？
2. 未安装 `queryParser`，请求 `GET /x?a=1`。`req.query` 是 `{a:"1"}` 还是 `"a=1"`？
3. 路由 handler 调用 `next("home")`，且存在名为 `home` 的另一条路由。12.0.0 会跳过去吗？

检查点：

1. `use` 不跑，因为 lookup 失败；default route 会先查其他 method，因此是 405。
2. 是原始字符串 `"a=1"`。
3. 不会跳；固定测试把它变成 500。

## 延伸阅读

- 固定源码：[restify/node-restify](https://github.com/restify/node-restify) —— 本文绑定提交 `784dd4182137850b95988ab478e7c206e1df98c1`
- 路由实现：[find-my-way](https://github.com/delvedor/find-my-way)（独立包，本文未做固定审查）
- [[express]] —— `use` 对未匹配请求也会跑的对照
- [[fastify]] —— 同样用 find-my-way，但 plugin 封装和 schema 编译不同
- [[polka]] —— 另一端：中间件先跑、路由后匹配

## 关联

- [[express]] —— Node 中间件链的常见对照
- [[fastify]] —— radix 路由同源，生命周期不同
- [[koa]] —— 洋葱模型 vs restify 的 pre/use 分段
- [[nestjs]] —— 企业级封装，底层常换宿主
- [[polka]] —— 本轮对照的极简 HTTP 服务器
