---
title: Fastify — 让 schema 替你写校验和序列化的 Node.js 框架
来源: 'https://github.com/fastify/fastify'
日期: 2026-05-30
分类: web-frameworks
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/fastify/fastify
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 7d196a998c422062a3aaa3f8041db91ad576cea0
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.12.1
---

## 是什么

Fastify 是一个把路由、插件封装和 JSON Schema 编译绑在启动链上的 Node HTTP 框架。日常类比：先把模具（schema）和工位（hook）装进车间，开门营业后请求按固定阶段走，而不是每次现场决定插哪个中间件。

你写：

```js
const Fastify = require("fastify");
const app = Fastify();
app.get("/hi", async () => ({ msg: "hello" }));
await app.listen({ port: 3000 });
```

`listen()` / `ready()` 会先走 `avvio` 启动链。路由匹配默认交给 `find-my-way`；校验与序列化编译器分别来自 `@fastify/ajv-compiler` 和 `@fastify/fast-json-stringify-compiler`。

## 为什么重要

不理解 Fastify 5.12.1 的启动合同，就解释不了：

- 为什么 `register()` 里 `decorate` 的属性，父 instance 默认看不到
- 为什么 schema 不是在 `route()` 当下编译，而是等到 avvio `preReady`
- 为什么 handler 返回 `undefined`、thenable 或普通值，走三条不同出口
- 为什么 GET 默认不跑 body parser，QUERY 却强制要求 Content-Type

## 核心要点

Fastify 主链可以拆成五步：

1. **装配 instance**：`fastify()` 创建 router、404 封装、schema controller、hook 表和 logger。

2. **插件封装**：`register()` 默认 `Object.create(parent)` 出子 instance，并复制 hook / parser / schema 桶。函数带 `Symbol.for('skip-override')` 时不拆 scope。

3. **启动期编译**：路由先登记 context；`preReady` 才绑定生命周期 hook，并编译 body/params/query/headers 校验器与 response 序列化器。

4. **请求阶段固定**：常见成功路径是 onRequest → preParsing → 解析 body → preValidation → validate → preHandler → handler。另外还有 onTimeout、onError、onRequestAbort。

5. **handler 出口三分**：返回 `undefined` 表示自己会 `reply.send`；thenable 交给 `wrapThenable`；其他值直接 `reply.send(result)`。

## 实践示例

### 案例 1：response schema 在启动后生效

```js
app.post("/users", {
  schema: {
    body: {
      type: "object",
      required: ["name"],
      properties: { name: { type: "string" } }
    },
    response: {
      200: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" } } }
    }
  },
  handler: async () => ({ id: 1, name: "Ada", secret: "no" })
});
```

没有 schema 的路由不会走这条编译。`secret` 会不会从响应里消失，取决于序列化器对未声明字段的处理；本轮未运行 serializer，不能写成普遍保证。

### 案例 2：子插件看不见对面房间

```js
app.decorate("rootHelper", () => "global");

app.register(async (sub) => {
  sub.decorate("inSub", () => "only here");
  sub.get("/sub", async () => sub.inSub());
});
```

子能顺着原型看到 `rootHelper`。父默认没有 `inSub`。要“穿墙”得给插件打 `skip-override`（生态里通常由 `fastify-plugin` 设置）。

### 案例 3：返回值决定谁负责发响应

```js
app.get("/plain", async () => ({ ok: true }));
app.get("/manual", async (request, reply) => {
  reply.send({ ok: true });
});
```

第一段返回对象，框架 `reply.send`。第二段返回 `undefined`，框架假定 handler 已经或即将自己发送。两种混用时，重复 `send` 是运行期问题，本轮未执行。

## 踩过的坑

1. **把 hook 数记成“八个工位”**：生命周期 hook 还有 onTimeout、onError、onRequestAbort；application hook 另有 onRoute、onRegister、onReady、onListen、preClose、onClose。

2. **以为 `route()` 当下就编译 schema**：编译挂在 avvio `preReady`。只登记路由、从不 `ready()`/`listen()`/`inject()`，校验器不会出现。

3. **把 `register()` 当成 `app.use()`**：封装边界是默认行为，不是可选文档风格。

4. **从 `package.json` 读 Node 下限**：5.12.1 没有 `engines` 字段。LTS 文档把 Fastify 5 标成 Node.js 20、22；部署约束要另核。

## 适用 vs 不适用场景

**适用**：

- 需要 JSON Schema 同时约束输入校验和输出序列化的 HTTP API
- 想用 plugin encapsulation 做模块边界，而不是共享一个线性中间件数组
- 接受 `ready()` 启动栅栏，并主要在 Node HTTP/1.1 或 HTTP/2 上运行

**不适用**：

- 只要几行 `(req, res, next)`、现有 Connect 中间件已经够用——看 [[express]]
- 必须在登记路由的同步瞬间拿到编译后的 validator
- 本轮未验证的 Edge / 非 Node 运行时；不能把文档宣传写成已测兼容

## 固定版本边界

- 本文绑定 `fastify/fastify@7d196a99...`，tag / npm `gitHead` / 包版本均为 `5.12.1`。
- 核心依赖包括 `avvio`、`find-my-way`、`pino`、`@fastify/ajv-compiler`、`@fastify/fast-json-stringify-compiler`。
- GET/HEAD/TRACE 视为 bodyless；DELETE/OPTIONS/PATCH/PUT/POST/QUERY 视为可能带 body。
- 本文未安装依赖、未跑上游测试、未 listen，也未做吞吐对比；状态保持 `UNVERIFIED`。

## 学到什么

1. **封装是对象原型，不是目录约定**——`Object.create` 决定 decorate 的可见范围。
2. **编译发生在启动栅栏，不在 API 调用瞬间**——schema 收益以 `preReady` 为界。
3. **返回值是协议的一部分**——`undefined` / Promise / 普通值对应三种发送责任。
4. **方法集合决定 parser**——bodyless 与 bodywith 是源码里的两张表，不是文档口误。

## 应用型自测

1. 只 `app.route(...)`、从不 `ready()` 或 `listen()`，response schema 会在登记当下编译吗？
2. 普通 `register()` 里 `decorate('x')` 后，父 instance 默认能读到 `x` 吗？
3. handler `return undefined` 且不调用 `reply.send`，框架会自动把返回值序列化出去吗？

检查点：

1. 不会。编译发生在 avvio `preReady`。
2. 不能。默认会 `Object.create` 出子 scope。
3. 不会。`undefined` 表示 handler 自己负责发送。

## 延伸阅读

- 文档：[fastify.dev](https://fastify.dev/)
- 固定源码：[fastify/fastify](https://github.com/fastify/fastify) —— 本文绑定提交 `7d196a998c422062a3aaa3f8041db91ad576cea0`
- 封装实现：[lib/plugin-override.js](https://github.com/fastify/fastify/blob/7d196a998c422062a3aaa3f8041db91ad576cea0/lib/plugin-override.js)
- 请求出口：[lib/handle-request.js](https://github.com/fastify/fastify/blob/7d196a998c422062a3aaa3f8041db91ad576cea0/lib/handle-request.js)
- [[express]] —— 线性中间件对照
- [[pino]] —— Fastify 默认 logger 依赖

## 关联

- [[express]] —— 同一层 HTTP 服务器，扩展模型完全不同
- [[pino]] —— 日志实现来自依赖，不是 Fastify 手写的同步 `console`
- [[nestjs]] —— 可以选择 Fastify adapter
- [[fastapi]] —— 另一条 schema-first 路线，运行时与编译器都不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apollo-server]] —— Apollo Server — Node 端 GraphQL 服务端的事实标准
- [[appwrite]] —— Appwrite — 自己能装一遍的开源 Firebase
- [[bullmq]] —— BullMQ — Node.js 上的 Redis 任务队列
- [[centrifugo]] —— Centrifugo — Go 写的开源实时消息服务器
- [[connect-rpc]] —— ConnectRPC — 让 gRPC 在浏览器里裸跑的 RPC 协议
- [[discord-js]] —— discord.js — Node.js Discord API 客户端事实标准
- [[elysia]] —— Elysia — 长在 Bun 上的极致类型安全 Web 框架
- [[express]] —— Express — Node.js 最经典的 Web 框架
- [[fiber]] —— Fiber — 把 Express 写法搬到 Go 上的高性能 web 框架
- [[got]] —— got — Node 端 HTTP 客户端的瑞士军刀
- [[grape]] —— Grape — 用 Ruby DSL 专写 REST API 的轻量框架
- [[graphql-yoga]] —— GraphQL Yoga — 跨运行时的轻量 GraphQL 服务器
- [[haraka]] —— Haraka — 用 Node.js 写插件链式架构的 SMTP 服务器
- [[ink]] —— ink — 用 React 组件树写终端 CLI
- [[jimp]] —— jimp — 哪都能跑的纯 JS 图像处理库
- [[koa]] —— Koa — async/await + ctx 对象 + 洋葱模型 的极简 Node.js web 框架
- [[ky]] —— ky — 把浏览器自带的 fetch 包成顺手工具
- [[lucia]] —— Lucia — 主动把自己降级为"学习资源"的 TS 认证库
- [[msw]] —— MSW — 让 mock 不改业务代码，在网络层透明拦截
- [[nestjs]] —— NestJS — 把 Angular 思想搬到 Node.js 后端的企业级框架
- [[next-js]] —— Next.js — React 全栈框架
- [[node-js]] —— Node.js — 服务端 JS 运行时之父
- [[nodemailer]] —— Nodemailer — Node.js 发邮件的事实标准
- [[peerjs-server]] —— peerjs-server — 只管握手不管传话的 WebRTC 信令服务器
- [[pino]] —— pino — 日志不该阻塞热路径
- [[pocketbase]] —— PocketBase — 一个 Go 二进制就是完整的后端
- [[postgres-js]] —— postgres.js — 写 SQL 但语法层就防注入的 Node 客户端
- [[prom-client]] —— prom-client — Node 服务暴露监控指标的事实标准 SDK
- [[sanic]] —— Sanic — 性能向 async Python 框架，对标 Node.js 高吞吐
- [[sharp]] —— sharp — 让 Node.js 处理图像快到不像 JS
- [[simple-peer]] —— simple-peer — 三行代码把两个浏览器直接连起来
- [[socket-io]] —— Socket.IO — 让浏览器和 Node.js 像打电话一样互相喊事件
- [[soketi]] —— Soketi — 自己跑一台 Pusher，把实时通信费砍到零头
- [[spin]] —— Spin — 用 WebAssembly 模块当 serverless handler 的开源框架
- [[steel-browser]] —— Steel Browser — 把 Chromium 包成 LLM agent 用的远端服务
- [[twirp]] —— Twirp — 用 protobuf 定义服务，但只走 HTTP/1.1 + JSON
- [[vertx]] —— Vert.x — Eclipse 出品的 polyglot reactive JVM toolkit，用事件总线 + verticle 把 Node.js 那套搬到多语言
