---
title: Koa — 用 ctx 与可替换 compose 编排洋葱中间件的 Node 框架
来源: https://github.com/koajs/koa
日期: 2026-05-30
分类: 工具库
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/koajs/koa
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 6984592d41946ed746f15afcb05554e073f64dad
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.2.1
---

## 是什么

Koa 是一个只负责中间件链与 `ctx` 包装的 Node web 框架。日常类比：它给你水电和承重墙——`app.use()` 登记函数，`callback()` 把它们交给 `koa-compose`（或你传入的 `compose`），每个请求新建 `ctx`；路由、body 解析、CORS 都不在这个仓库里。

你写：

```js
const Koa = require('koa');
const app = new Koa();
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  ctx.set('X-Time', `${Date.now() - start}ms`);
});
app.use(async (ctx) => { ctx.body = { ok: true }; });
app.listen(3000);
```

`listen()` 只是 `http.createServer(app.callback()).listen(...)`。固定 `3.2.1` 的 CommonJS 入口是 `lib/application.js`，ESM 入口是 `gen-esm-wrapper` 生成的 `dist/koa.mjs`。

## 为什么重要

不理解 Koa，下面这些事都没法解释：

- 为什么 `await next()` 能同时表示“把控制权交给下游”和“等下游全部结束再回来”
- 为什么 core 没有 router，却仍能用 `ctx.body` / `ctx.throw()` 写完响应
- 为什么 v3 不再把 generator 中间件当成一等公民
- 为什么 stream / Blob / `Response` 都能当 `ctx.body`，错误路径却仍取决于有没有 `error` 监听器

## 核心要点

固定 `3.2.1` 可以拆成四步：

1. **登记中间件**：`use(fn)` 只接受 function，推进 `this.middleware`。不再转换 Koa v1 generator。

2. **合成链**：`callback()` 调用 `this.compose(this.middleware)`，默认 `compose` 来自依赖 `koa-compose@^4.1.0`，也可在构造时传入 `options.compose`。

3. **每请求一个 ctx**：`createContext()` 从 `context` / `request` / `response` prototype 派生对象，挂上原生 `req` / `res`，并设置 `ctx.state = {}`。若构造时打开 `asyncLocalStorage`，请求会跑在 `AsyncLocalStorage.run(ctx, ...)` 里，`app.currentContext` 才能读到当前 ctx。

4. **默认 404 再 respond**：`handleRequest()` 先把 `res.statusCode` 设为 404，再 `fnMiddleware(ctx).then(respond).catch(ctx.onerror)`。`respond()` 按 body 类型分支：空状态码、HEAD、`null`、Buffer、string、stream / Blob / `ReadableStream` / `Response`，最后才 `JSON.stringify`。

## 实践示例

### 案例 1：洋葱进出顺序

```js
app.use(async (ctx, next) => { console.log('1 in'); await next(); console.log('1 out'); });
app.use(async (ctx, next) => { console.log('2 in'); await next(); console.log('2 out'); });
app.use(async (ctx) => { console.log('3 in'); ctx.body = 'ok'; });
// 一次请求：1 in / 2 in / 3 in / 2 out / 1 out
```

`await next()` 之前是进入路径，之后是回流路径。这是 compose 递归 `dispatch(i)` 的结果，不是框架另做的两套 hook。

### 案例 2：错误沿 Promise 冒泡

```js
app.use(async (ctx, next) => {
  try { await next(); }
  catch (err) { ctx.status = err.status || 500; ctx.body = { msg: err.message }; }
});
app.use(async (ctx) => { ctx.throw(404, 'user not found'); });
```

`ctx.throw()` 把参数交给 `http-errors` 的 `createError(...args)` 再 throw。下游 reject 后，上游 `await next()` 的 try/catch 可以接住。v3 迁移文档提醒：带 properties 的旧签名 `(status, message, properties)` 已随 `http-errors@2` 变成 `(status, error, properties)`。

### 案例 3：自己拼 router，而不是找内置

```js
const Router = require('@koa/router');
const bodyParser = require('koa-bodyparser');
const router = new Router();
router.post('/users', (ctx) => { ctx.body = ctx.request.body; });
app.use(bodyParser());
app.use(router.routes());
app.use(router.allowedMethods());
```

`@koa/router`、`koa-bodyparser` 都是独立包。固定 core 只保证中间件数组与 `ctx` 合同；包版本和类型扩展要单独核验。

## 踩过的坑

1. **把 v1 generator 当还活着**：v3 迁移文档写明旧中间件签名已删除。`use()` 只检查 `typeof fn === 'function'`，不会帮你 `koa-convert`。继续 `function* (next) { yield next; }` 不会得到洋葱语义。

2. **ALS 默认是关的**：只有 `new Koa({ asyncLocalStorage: true })` 或传入 `AsyncLocalStorage` 实例才会设置 `ctxStorage`。直接读 `app.currentContext` 在默认构造下是 `undefined`。

3. **stream 错误走 `Stream.pipeline`**：`respond()` 对 stream / Blob / `ReadableStream` / `Response` 使用 `Stream.pipeline`。出错时只有 `app.listenerCount('error') > 0` 才会调用 `ctx.onerror`。`callback()` 若发现没有 error 监听器，会先挂上默认 `this.onerror`；若你移除了所有监听器，stream 错误不会再进 `ctx.onerror`，但也不应再假设“必须手写 `stream.on('error', ctx.onerror)`”才是唯一路径。

4. **`ctx.state` 没有框架级类型**：每次请求都是新的 `{}`。TypeScript 默认推不出 `ctx.state.user`；跨插件扩展要自己补模块增强，这不是 core 保证的。

5. **core 行数不是“约 600”**：固定树里 `lib/` 合计 2062 行，其中 `application.js` 344 行。README 写的 “~570 SLOC” 只覆盖“常见 HTTP 方法”，不能当成整个框架体积。

## 适用 vs 不适用场景

**适用**：

- 想先读完中间件控制流再决定路由/校验方案的中小型服务
- 需要可替换 `compose` 或把 ctx 放进 `AsyncLocalStorage` 的定制宿主
- 已经接受“自己组装 router / body / cors”的插件生态

**不适用**：

- 需要框架内置 schema、生命周期 hook 或模块封装——那些合同不在这个仓库
- 还必须跑 Koa v1 generator 中间件
- 边缘 runtime 优先且需要一等 TypeScript 路由类型的场景
- 把 README 的 SLOC 或未绑定 benchmark 当成选型依据

## 固定版本边界

- 本文绑定 `koajs/koa@6984592d...`，annotated tag `v3.2.1` 与 npm `koa@3.2.1` 的 `gitHead` 均为该提交。
- `engines.node` 为 `>= 18`。v3 删除 generator 中间件，并把 `ctx.response.redirect('back')` 换成 `ctx.back()`。
- 查询串改走 `URLSearchParams`；body 增加 Blob / `ReadableStream` / `Response` 分支。
- 依赖 `koa-compose@^4.1.0`、`http-errors@^2.0.0`。本文未打开 compose 源码仓库，不把 compose 行数写成 Koa core 事实。
- 本文未安装依赖、未跑上游测试、未监听端口或测量吞吐，状态保持 `UNVERIFIED`。

## 学到什么

1. **极简核心把控制流和插件边界拆开**——洋葱在 compose，业务能力在独立包。
2. **默认 404 是显式赋值**——没有中间件写 body 时，并不是“没有响应”，而是 `handleRequest` 先写下 404。
3. **响应类型表比“字符串或 JSON”更宽**——stream 与 WHATWG body 都走 `respond()`，错误策略也写在那里。
4. **v3 的破坏是文档化的**——Node 18、去掉 generator、`http-errors` v2、`ctx.back()` 都要按迁移说明核对，不能靠 v2 记忆。

## 应用型自测

1. `new Koa()` 之后立刻读 `app.currentContext`，能拿到本次请求的 ctx 吗？
2. 没有中间件设置 `ctx.body` 时，`handleRequest()` 先把状态码写成什么？
3. `ctx.body` 是 Node stream，且应用上没有任何 `error` 监听器时，`respond()` 还会调用 `ctx.onerror` 吗？

检查点：

1. 不能。默认不创建 `ctxStorage`；要构造时打开 `asyncLocalStorage`。
2. `404`。这是 `handleRequest()` 在跑中间件之前写下的。
3. 不会。`Stream.pipeline` 只在 `listenerCount('error') > 0` 时转发到 `ctx.onerror`。

## 延伸阅读

- 固定源码：[koajs/koa](https://github.com/koajs/koa) —— 本文绑定提交 `6984592d41946ed746f15afcb05554e073f64dad`
- 迁移说明：仓库内 `docs/migration-v2-to-v3.md`
- 中间件合成依赖：[koajs/compose](https://github.com/koajs/compose)（独立包，本文未固定其 revision）
- 对照：[[nestjs]] 用模块图换掉“自己拼插件”

## 关联

- [[nestjs]] —— 同主题的模块 + DI 对照
- [[express]] —— 同作者上一代 `(req, res, next)` 模型
- [[hono]] —— 多运行时、类型更先的后辈对照
- [[fastify]] —— 固定 lifecycle hook 与 schema 的另一条路线
- [[node-js]] —— `http.createServer` 仍是 `listen()` 的底座

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apollo-server]] —— Apollo Server — Node 端 GraphQL 服务端的事实标准
- [[clack]] —— Clack — 给 Common Lisp 加一层标准化的 web 服务器接口
- [[commander]] —— commander.js — Node.js CLI 解析的声明式标准
- [[echo]] —— Echo — 极简高性能 Go 框架，5 行起服务
- [[elysia]] —— Elysia — 长在 Bun 上的极致类型安全 Web 框架
- [[express]] —— Express — Node.js 最经典的 Web 框架
- [[fiber]] —— Fiber — 把 Express 写法搬到 Go 上的高性能 web 框架
- [[hono]] —— Hono — 多运行时 Web 框架
- [[ktor]] —— Ktor — 用 Kotlin DSL 拼出来的异步 Web 框架
- [[nestjs]] —— NestJS — 把 Angular 思想搬到 Node.js 后端的企业级框架
- [[node-js]] —— Node.js — 服务端 JS 运行时之父
- [[pino]] —— pino — 日志不该阻塞热路径
