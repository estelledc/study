# HTTP server source review (writer V)

> 用途：记录 Express、Fastify 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：V
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、HTTP 服务、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- fallback unused：canonical `expressjs/express@5.2.1` 与 `fastify/fastify@5.12.1` 的 tag、npm `gitHead` 与 commit 一致，未改用其他 HTTP 服务端配对

## Express

- canonical source：`https://github.com/expressjs/express`
- revision：`dbac741a49a5a64336b70c06e85c2e2706e36336`
- package：`express@5.2.1`
- engines：`node >= 18`
- inspected：
  - `package.json`
  - `index.js`
  - `lib/express.js`
  - `lib/application.js`
  - `lib/utils.js`
  - `lib/request.js`
  - `lib/response.js`
  - `test/app.router.js`
  - `test/app.use.js`
  - `test/app.listen.js`
- observed：
  - `createApplication()` 返回调用 `app.handle()` 的函数；`listen()` 只创建 `http.createServer(this)`；
  - 路由与中间件委托给依赖 `router@^2.2.0`；`express.json/raw/text/urlencoded` 是 `body-parser` 再导出，`express.static` 是 `serve-static`；
  - 默认 `query parser` 为 `simple`（`querystring.parse`），`trust proxy` 为 false，`x-powered-by` 默认开启；
  - 应用测试证明 rejected promise 会进入四参数错误中间件；空 reject 变成 `Error: Rejected promise`；
  - 子应用靠 `fn.handle` + `fn.set` 识别，并在 `mount` 时用 `Object.setPrototypeOf` 继承 parent request/response/settings。

## Fastify

- canonical source：`https://github.com/fastify/fastify`
- revision：`7d196a998c422062a3aaa3f8041db91ad576cea0`
- package：`fastify@5.12.1`
- engines：`package.json` 无 `engines` 字段；`docs/Reference/LTS.md` 将 Fastify 5.0.0 标为 Node.js 20、22
- inspected：
  - `package.json`
  - `fastify.js`
  - `lib/hooks.js`
  - `lib/plugin-override.js`
  - `lib/plugin-utils.js`
  - `lib/handle-request.js`
  - `lib/route.js`
  - `lib/schema-controller.js`
  - `lib/validation.js`
  - `docs/Reference/LTS.md`
- observed：
  - 默认路由由 `find-my-way` 构建；插件启动由 `avvio` 负责；logger 依赖 `pino`；
  - `register()` 默认 `Object.create` 出子 instance；`Symbol.for('skip-override')` 为真时不封装；
  - schema 在 avvio `preReady` 编译校验器与序列化器，而不是在 `route()` 同步完成；`ready()`/`listen()` 会触发这条启动链；
  - 生命周期 hook 为 onTimeout、onRequest、preParsing、preValidation、preSerialization、preHandler、onSend、onResponse、onError、onRequestAbort；
  - handler 返回 `undefined` 时假定自己会 `reply.send`；thenable 走 `wrapThenable`；其他值直接 `reply.send`；
  - GET/HEAD/TRACE 视为 bodyless；DELETE/OPTIONS/PATCH/PUT/POST/QUERY 视为可能带 body。
