# Realtime WebSocket source review (writer AB)

> 用途：记录 Socket.IO、ws 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer AB
- evidence：GitHub release/tag metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、网络请求、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：A–AA 已分配主题与开放 PR 占用页（含 `zustand`、`jotai`、`react-hook-form`、`tanstack-form`、`mcp-ts-sdk`、`ollama`、`aichat`、`shell-gpt`、`haystack`、`langfuse`）

## Socket.IO

- canonical source：`https://github.com/socketio/socket.io`
- revision：`9978574e4f1d4e21593497f94c40053cd0fff359`
- package：`socket.io@4.8.3`
- tag：`socket.io@4.8.3`（lightweight tag，对象即上述 commit）
- inspected：
  - `packages/socket.io/package.json`
  - `packages/socket.io/lib/index.ts`
  - `packages/socket.io/lib/client.ts`
  - `packages/socket.io/lib/namespace.ts`
  - `packages/socket.io/lib/socket.ts`
  - `packages/socket.io/lib/broadcast-operator.ts`
  - `packages/engine.io/package.json`
  - `packages/engine.io/lib/server.ts`
  - `packages/engine.io/lib/transports/index.ts`
  - `packages/socket.io-adapter/lib/index.ts`
- observed：
  - Socket.IO server 默认 `path` 为 `/socket.io`，`serveClient` 默认真，`connectTimeout` 默认 45000 ms；构造时若传入 http server 或端口会 `attach`；
  - 默认 adapter 是内存 `Adapter`；开启 `connectionStateRecovery` 时改用 `SessionAwareAdapter`，并默认 `maxDisconnectionDuration=120000`、`skipMiddlewares=true`；
  - Engine.IO 连接建立后，`Client` 必须在 `connectTimeout` 内加入至少一个 namespace，否则关闭连接；默认 namespace 是 `/`；
  - Engine.IO 4.x 协议要求 query `EIO=4`；`EIO!=="4"` 被当成协议 3，默认 `allowEIO3=false` 时拒绝握手；
  - 同仓 `engine.io@6.6.5` 默认 `pingInterval=25000`、`pingTimeout=20000`、`upgradeTimeout=10000`、`maxHttpBufferSize=1e6`、`transports=["polling","websocket"]`、`allowUpgrades=true`；`polling.upgradesTo` 含 `websocket` 与 `webtransport`；
  - Engine.IO 默认 `wsEngine` 为 `ws.Server`；`perMessageDeflate` 仅在调用方传入真值时启用；cookie 默认不发；
  - Socket.IO 协议 4 的 `socket.id` 由 `base64id.generateId()` 生成，不复用 Engine.IO sid；协议 3 才复用 engine id（非 `/` namespace 加 `nsp#` 前缀）；
  - `emit` 若最后一个参数是函数，则登记 ack；`timeout` flag 可使 ack 过期；房间广播走 adapter，默认只覆盖本进程。
- provenance：
  - GitHub tag `socket.io@4.8.3`、npm `socket.io@4.8.3` 的 `gitHead` 与上述 commit 一致；
  - 同仓是 monorepo，该提交里 `packages/engine.io` 自报 `6.6.5`，依赖 `ws@~8.18.3`；本页绑定 socket.io 发布提交，不把后来单独发布的 `engine.io@6.6.9` 当成 4.8.3 合同；
  - 未猜测未拉取的 npm 安装树精确 lock。

## ws

- canonical source：`https://github.com/websockets/ws`
- revision：`c791e707eab3c13dd9a261d2479c3cc4a49a6fed`
- package：`ws@8.21.3`
- tag：`8.21.3`（lightweight tag，对象即上述 commit）
- inspected：
  - `package.json`
  - `index.js`
  - `browser.js`
  - `lib/websocket.js`
  - `lib/websocket-server.js`
  - `lib/receiver.js`
  - `lib/sender.js`
  - `lib/permessage-deflate.js`
  - `lib/constants.js`
  - `lib/stream.js`
  - `README.md`
- observed：
  - 无 production `dependencies`；`bufferutil` 与 `utf-8-validate` 是 optional peer；`browser.js` 直接抛错，要求浏览器用原生 `WebSocket`；
  - `WebSocketServer` 必须且只能指定 `port`、`server`、`noServer` 三者之一；默认 `maxPayload=100 * 1024 * 1024`、`perMessageDeflate=false`、`autoPong=true`、`clientTracking=true`、`closeTimeout=30000`；
  - 升级握手校验 GET、`Upgrade: websocket`、`Sec-WebSocket-Key`（22 字符 base64 + `==`）以及 version 13 或 8；Accept 使用 RFC 6455 GUID `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`；
  - 客户端默认 `protocolVersion=13`、`perMessageDeflate=true`、`followRedirects=false`、`maxRedirects=10`、`autoPong=true`；`handshakeTimeout` 写入 HTTP `timeout`；
  - `createWebSocketStream` 把已打开的 WebSocket 包成 Duplex；库本身不提供房间、自动重连或长轮询降级；
  - 服务端 `clients` 只是可选 Set，广播要调用方自己遍历。
- provenance：
  - GitHub latest release、tag `8.21.3` 与 npm `ws@8.21.3` 的 `gitHead` 均为上述 commit；
  - 与 Socket.IO 4.8.3 树内声明的 `ws@~8.18.3` 不是同一发布；本页审查独立的当前 8.21.3，不声称 Engine.IO 已升级到该补丁。
