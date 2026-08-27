# Server + WebSocket source review GH

> 用途：记录 `srvx` 与 `crossws` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-gh` 标记 2026-08-27 平行 writer GH，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer GH
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test / bench / CLI，未 listen 端口，未建立 WebSocket，未测 bundle 或吞吐
- worktrees：本机 `research-worktrees/srvx` 与 `research-worktrees/crossws`（gitignored），不进入 Git
- slugs：新建 `srvx` 与 `crossws` 两页；二者构成 HTTP server + WebSocket 配对

## srvx

- canonical source：`https://github.com/h3js/srvx`
- tag：`v0.12.7`（annotated tag，peel 后与提交同一对象）
- revision：`053be62e5e9e1f1966ab8592f1254ac40ac00317`
- package：`srvx@0.12.7`（MIT，`engines.node >= 20.16.0`）
- npm：`srvx@0.12.7` 为 latest；packument **没有** `gitHead`，revision 只由 GitHub annotated tag 与仓内 `package.json` version 对齐
- inspected：
  - `package.json`
  - `src/types.ts`
  - `src/adapters/generic.ts`
  - `src/adapters/node.ts`
  - `src/adapters/bun.ts`
  - `src/_middleware.ts`
  - `src/_plugins.ts`
  - `src/_utils.ts`
  - `src/body-limit.ts`
  - `README.md`
  - `examples/hello-world/server.ts`
- observed：
  - 公共入口是 `serve({ fetch })`，不是路由器；条件 exports 按运行时选 adapter（node / bun / deno / workerd / browser / default generic）；
  - 另有显式子路径：`aws-lambda`、`bunny`、`service-worker`、`cli`、`static`、`body-limit`、`log`、`tracing`、`mtls`、`loader`；
  - 默认端口 `PORT` 或 `3000`，hostname 来自 `HOST` 否则全接口；`trustProxy` 默认 `false`；
  - `gracefulShutdown` 默认 true，在 `CI` / `TEST` 环境关闭；默认超时 5s 或 `SERVER_SHUTDOWN_TIMEOUT`；
  - middleware 在构造时从后往前折叠，之后再改 `server.options.middleware` 无效；
  - `error` 以 unshift 中间件包住 `next()`；
  - generic adapter 的 `serve()` 是空操作，只暴露 `fetch`；
  - Node adapter 对非 origin-form / 非合法 absolute-form / 非 `*` 的 request-target 直接 400；TLS 时默认 HTTP/2（`allowHTTP1: true`），`node.http2` 无证书会抛错；`exclusive` 为 `!reusePort`；
  - `maxRequestBodySize` 默认 `undefined`（不限制）；Bun 映射原生 `maxRequestBodySize` 并在 handler 前 413；Node/Deno 走流式限制，溢出错误是 `ERR_BODY_TOO_LARGE` / `statusCode: 413`。

## crossws

- canonical source：`https://github.com/h3js/crossws`
- tag：`v0.4.12`（annotated tag，peel 后与提交同一对象）
- revision：`6d366f8b6d2ddd0276fd9eb9962a223f1a68429e`
- package：`crossws@0.4.12`（MIT；仓内 LICENSE 为 MIT，GitHub `licenseInfo` 显示 Other，以仓内文件为准）
- npm：`crossws@0.4.12` 为 latest；packument **没有** `gitHead`；optional peer `srvx >= 0.11.5`
- inspected：
  - `package.json`
  - `LICENSE`
  - `src/index.ts`
  - `src/hooks.ts`
  - `src/adapter.ts`
  - `src/peer.ts`
  - `src/adapters/node.ts`
  - `src/server/_resolve.ts`
  - `src/server/node.ts`
  - `src/server/default.ts`
  - `src/server/_types.ts`
  - `README.md`
- observed：
  - 0.2.x 已移除 `createCrossWS` / `Caller` / `WSRequest` / `CrossWS`；现入口是 hooks + adapter + `crossws/server`；
  - hooks：`upgrade` / `open` / `message` / `close` / `drain` / `error` / `ping` / `pong`；
  - `resolve` 按连接 `context` WeakMap 只跑一次，失败会驱逐缓存以便重试；同步抛错被规范成 rejected Promise；
  - 默认 namespace 是 URL pathname；`getNamespace` 或 upgrade 返回值可覆盖；
  - 子协议默认不回显；优先级为 upgrade `{ protocol }` → hook 设置的 `sec-websocket-protocol` → `handleProtocols`；
  - `idleTimeout` 默认 30 秒；Node 用 `ws` + `crossws-ping` 心跳模拟，Bun/Deno/uWS 映射原生 idle；
  - `crossws/server` 在 Node 上把 `upgrade` 接到 srvx `node.server`；默认 resolver 调 `server.fetch`，从 `Symbol.for("crossws.hooks")` 或 `response.crossws` 取 hooks；
  - 无 hooks 的 4xx/5xx（除 101，以及带 request hooks 的 426）会把该 Response 当作 upgrade 拒绝；孤立 426 会 warnOnce；
  - 内联 hook 与默认 fetch resolver 互斥；用户自定义 `resolve` 会绕过两个通道；
  - 默认 `crossws/server`（非 Node/Bun/Deno/workerd）走 SSE adapter 并 `console.warn`；
  - native pub/sub（bun / uWebSockets）按 topic 全应用广播，namespace 隔离只是尽力而为。
