---
title: Express — Node.js 最经典的 Web 框架
来源: 'https://github.com/expressjs/express'
日期: 2026-05-30
分类: projects
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/expressjs/express
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: dbac741a49a5a64336b70c06e85c2e2706e36336
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.2.1
---

## 是什么

Express 是一个把 Node `http` 请求做成中间件流水线的 Web 框架。日常类比：请求是传送带上的工件，每个工位拿到 `(req, res, next)`，做完自己的事再叫下一站。

你写：

```js
const express = require("express");
const app = express();
app.get("/hello", (req, res) => res.send("hi"));
app.listen(3000);
```

`express()` 返回一个函数；请求进来后走 `app.handle()`，再交给依赖包 `router`。`listen()` 只创建 `http.createServer(this)`，HTTPS 要自己另开服务器。

## 为什么重要

不理解 Express 5.2.1 的这层薄壳，就解释不了：

- 为什么路由、中间件和错误处理看起来像“都在 Express 里”，实现却在 `router`
- 为什么 `express.json()` 不再是框架核心，而是 `body-parser` 再导出
- 为什么 rejected promise 会进错误中间件，但 resolved promise 不会自动结束响应
- 为什么默认 query 解析是 Node `querystring`，不是 `qs` 的 nested object

## 核心要点

Express 主链可以拆成五步：

1. **创建 app 函数**：`createApplication()` 混入 EventEmitter 与 application prototype，并给 `req`/`res` 准备可继承原型。

2. **注册即入 router**：第一次访问 `app.router` 才惰性 `new Router()`。`app.use()` / `app.get()` 都是往这条栈里追加。

3. **请求进入 handle**：设置 `req.res`/`res.req`、可选 `X-Powered-By`、`res.locals`，然后 `this.router.handle(req, res, done)`。

4. **收尾靠 finalhandler**：调用方没给 callback 时，未处理错误由 `finalhandler` 写出响应。

5. **子应用是特殊中间件**：同时带 `handle` 与 `set` 的函数会被当成 mounted app；`mount` 时用 `Object.setPrototypeOf` 继承 parent 的 request/response/settings。

## 实践示例

### 案例 1：JSON 解析仍是可选中间件

```js
const express = require("express");
const app = express();

app.use(express.json());
app.post("/users", (req, res) => {
  res.json({ name: req.body?.name ?? null });
});
```

`express.json` 就是 `body-parser.json`。不注册它，`req.body` 不会自动出现。默认 query parser 是 `simple`；要嵌套对象得显式 `app.set("query parser", "extended")`。

### 案例 2：logger 订阅 finish，不阻塞 next

```js
function logger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
}
app.use(logger);
```

`next()` 先放行。耗时统计依赖响应 `finish`，不是等 logger 自己写完 body。

### 案例 3：rejected promise 进入四参数错误中间件

```js
app.get("/users/:id", async (req) => {
  throw new Error("boom");
});

app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message });
});
```

固定 5.2.1 的应用测试显示，中间件返回的 rejected promise 会传给后续 `(err, req, res, next)`。空 `Promise.reject()` 会变成 `Error: Rejected promise`。resolved promise 不会替你调用 `res.end()`。

## 踩过的坑

1. **以为 Express 自己实现了整条路由栈**：5.2.1 把 walk 交给 `router@^2.2.0`。arity 如何识别错误中间件，要以该依赖为准，不能只看 `lib/application.js`。

2. **忘记 `next()`**：请求会挂到客户端超时。条件分支漏掉一个出口仍然是第一常见问题。

3. **把默认 query parser 当成 qs**：默认 `simple` 使用 `querystring.parse`，没有 `extended` 的嵌套语义。

4. **把 `listen()` 当成协议无关入口**：它只包 HTTP。同时提供 HTTPS 要自己 `https.createServer(app)`。

## 适用 vs 不适用场景

**适用**：

- 需要 Connect 风格 `(req, res, next)` 与大量现有中间件的 Node HTTP 服务
- 教学、内部工具和已有 Express 代码的维护
- 想自己选择 body、cookie、session、CORS 实现的最小核心

**不适用**：

- 需要启动期编译 schema / 固定 hook 阶段的服务——看 [[fastify]]
- 需要框架级插件封装，而不是“先注册先执行”的线性栈
- 不能接受 Node `>= 18` 或必须由框架创建 HTTPS 服务器的部署

## 固定版本边界

- 本文绑定 `expressjs/express@dbac741a...`，tag / npm `gitHead` / 包版本均为 `5.2.1`。
- `engines.node` 为 `>= 18`。核心依赖包括 `router`、`body-parser`、`serve-static`、`finalhandler`。
- 本文未安装依赖、未跑上游测试、未监听端口，也未比较吞吐；状态保持 `UNVERIFIED`。

## 学到什么

1. **框架薄壳可以把生态合同稳定下来**——应用 API 仍是 `use`/`get`/`listen`，实现已经外移到独立 router 与 parser。
2. **默认值必须按版本读**——query parser、X-Powered-By、trust proxy 都不能靠旧教程外推。
3. **Promise 支持不等于自动完成响应**——rejection 会进入错误栈，resolve 不会替你 `send`。
4. **子应用继承靠原型，不是深拷贝**——mounted app 改 settings 可能看到 parent。

## 应用型自测

1. 不调用 `express.json()`，POST JSON 后 `req.body` 一定存在吗？
2. 中间件 `return Promise.resolve("ok")` 且不写 `res`，请求会自动 200 结束吗？
3. `app.listen(443)` 是否创建 HTTPS 服务器？

检查点：

1. 不一定。JSON body 解析是可选中间件。
2. 不会。resolved promise 会被忽略，调用方仍需结束响应。
3. 不会。`listen()` 只调用 `http.createServer`。

## 延伸阅读

- 文档：[expressjs.com](https://expressjs.com)
- 固定源码：[expressjs/express](https://github.com/expressjs/express) —— 本文绑定提交 `dbac741a49a5a64336b70c06e85c2e2706e36336`
- 应用入口：[lib/application.js](https://github.com/expressjs/express/blob/dbac741a49a5a64336b70c06e85c2e2706e36336/lib/application.js)
- [[fastify]] —— schema / hook / 插件封装对照
- [[koa]] —— 同一作者的后继方向，async context 不同

## 关联

- [[fastify]] —— 启动期编译 schema，而不是运行期线性中间件
- [[koa]] —— 洋葱模型与 `ctx`，不再用三参数签名当唯一合同
- [[nestjs]] —— 默认可以架在 Express adapter 上
- [[sinatra]] —— Express 路由 DSL 的早期参照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[actix-web]] —— Actix Web — Rust 上长期占据 TechEmpower 榜首的 web 框架
- [[apollo-server]] —— Apollo Server — Node 端 GraphQL 服务端的事实标准
- [[aspnetcore]] —— ASP.NET Core — 微软跨平台 web 框架
- [[auth-js]] —— Auth.js — 让 OAuth 登录和会话存储变成两个抽象
- [[axum]] —— axum — 用 Rust 类型系统当『路由参数表』的 Web 框架
- [[bullmq]] —— BullMQ — Node.js 上的 Redis 任务队列
- [[chatwoot]] —— chatwoot — 把 11 种外部聊天渠道归一到同一张消息表
- [[chi]] —— chi — Go 标准库友好的轻量 HTTP router
- [[clack]] —— Clack — 给 Common Lisp 加一层标准化的 web 服务器接口
- [[commander]] —— commander.js — Node.js CLI 解析的声明式标准
- [[django]] —— Django — 全功能 batteries-included 的 Python web 框架
- [[echo]] —— Echo — 极简高性能 Go 框架，5 行起服务
- [[elysia]] —— Elysia — 长在 Bun 上的极致类型安全 Web 框架
- [[fastapi]] —— FastAPI — 用 Python 类型注解写 API
- [[fiber]] —— Fiber — 把 Express 写法搬到 Go 上的高性能 web 框架
- [[flask]] —— Flask — 用装饰器把 URL 接到函数上的 Python 微框架
- [[framer-motion]] —— Framer Motion — React 声明式动画
- [[gin]] —— Gin — Go 写 web API 的事实标准框架
- [[grape]] —— Grape — 用 Ruby DSL 专写 REST API 的轻量框架
- [[graphql-yoga]] —— GraphQL Yoga — 跨运行时的轻量 GraphQL 服务器
- [[hono]] —— Hono — 多运行时 Web 框架
- [[koa]] —— Koa — async/await + ctx 对象 + 洋葱模型 的极简 Node.js web 框架
- [[ktor]] —— Ktor — 用 Kotlin DSL 拼出来的异步 Web 框架
- [[ky]] —— ky — 把浏览器自带的 fetch 包成顺手工具
- [[laravel]] —— Laravel — 现代 PHP 全栈框架，Eloquent + Blade + Artisan 三件套
- [[librechat]] —— LibreChat — 让一份聊天 UI 同时连 OpenAI / Anthropic / Google / 本地模型，对话留在自己的服务器
- [[litestar]] —— Litestar — 类型驱动的 ASGI 框架（原 Starlite）
- [[msw]] —— MSW — 让 mock 不改业务代码，在网络层透明拦截
- [[nestjs]] —— NestJS — 把 Angular 思想搬到 Node.js 后端的企业级框架
- [[nginx]] —— nginx — 高性能 Web 服务器
- [[node-js]] —— Node.js — 服务端 JS 运行时之父
- [[nodemailer]] —— Nodemailer — Node.js 发邮件的事实标准
- [[pino]] —— pino — 日志不该阻塞热路径
- [[pocketbase]] —— PocketBase — 一个 Go 二进制就是完整的后端
- [[prom-client]] —— prom-client — Node 服务暴露监控指标的事实标准 SDK
- [[rails]] —— Ruby on Rails — 约定大于配置的全栈 Web 框架教科书
- [[rocket]] —— Rocket — 用 Rust attribute macro 把路由当函数签名写的 web 框架
- [[salvo]] —— Salvo — 把中间件和处理器统一成一个 Handler trait 的 Rust web 框架
- [[sinatra]] —— Sinatra — 用 Ruby 三行代码起一个 web 服务
- [[slim-framework]] —— Slim — PHP 圈最轻的 web 框架，专给小 API 用
- [[socket-io]] —— Socket.IO — 让浏览器和 Node.js 像打电话一样互相喊事件
- [[soketi]] —— Soketi — 自己跑一台 Pusher，把实时通信费砍到零头
- [[spring-boot]] —— Spring Boot — 用 Auto-configuration 把 Java 后端从 XML 地狱里救出来的事实标准框架
- [[starlette]] —— Starlette — FastAPI 底下那台轻量 ASGI 引擎
- [[supertokens]] —— SuperTokens — 自托管认证框架，把登录方式做成可拼装的 Recipe
- [[symfony]] —— Symfony — 把 PHP 框架拆成 30 个独立组件再拼起来
- [[vertx]] —— Vert.x — Eclipse 出品的 polyglot reactive JVM toolkit，用事件总线 + verticle 把 Node.js 那套搬到多语言
