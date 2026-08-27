---
title: Socket.IO — 用 Engine.IO 传输层承载命名空间事件
description: 建立在 Engine.IO 之上的命名空间事件与房间广播框架
来源: https://github.com/socketio/socket.io
日期: 2026-05-30
分类: backend-api
难度: 初级
difficulty: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/socketio/socket.io
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 9978574e4f1d4e21593497f94c40053cd0fff359
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.8.3
---

## 是什么

Socket.IO 是一个建立在 Engine.IO 之上的实时事件框架。日常类比：Engine.IO 负责把电话线路接通并在线路不好时换通道；Socket.IO 负责会议号（namespace）、房间和“说一句等回执”。

你写：

```js
import { Server } from "socket.io";

const io = new Server(3000);
io.on("connection", (socket) => {
  socket.on("chat", (msg) => io.emit("chat", msg));
});
```

固定 `4.8.3` 会先挂 Engine.IO，默认路径 `/socket.io`，再把底层连接包成 `Client`。业务 `Socket` 属于某个 namespace，默认是 `/`。

## 为什么重要

不读固定 4.8.3 源码，下面这些合同很容易被旧教程带偏：

- 为什么“连上 WebSocket”并不等于已经加入某个 namespace
- 为什么握手 query 必须带 `EIO=4`，旧客户端默认会被拒
- 为什么 `socket.id` 不再等于 Engine.IO 的 sid
- 为什么本机 `io.emit` 不能自动打到另一台进程上的客户端

## 核心要点

固定版本的主链可以拆成五步：

1. **挂到 HTTP server**：`new Server(3000)` 或 `attach(httpServer)`。默认 `path` 为 `/socket.io`（写入 Engine.IO 时去掉尾斜杠）、`serveClient` 为真、`connectTimeout` 为 45000 ms。

2. **Engine.IO 握手与升级**：同仓 `engine.io@6.6.5` 默认 `transports=["polling","websocket"]`，`allowUpgrades=true`。`polling` 可升级到 `websocket` 或 `webtransport`。`EIO!=="4"` 被当成协议 3；默认 `allowEIO3=false` 时直接拒绝。心跳默认 `pingInterval=25000`、`pingTimeout=20000`，升级超时 10000 ms，`maxHttpBufferSize=1e6`。

3. **Client 必须加入 namespace**：底层 `connection` 之后，`Client` 启动 45 秒定时器；若还没有任何 namespace，就关闭连接。`io.of("/admin")` 有独立事件、房间和 middleware。

4. **事件、ack 与房间**：`emit` 若最后一个参数是函数，就登记 ack；`socket.timeout(ms)` 会让 ack 过期。`join` / `to(room).emit` 走 adapter。默认是进程内 `Adapter`；开启 `connectionStateRecovery` 才换成 `SessionAwareAdapter`，并默认备份 120 秒、恢复时跳过 middleware。

5. **身份与多节点**：协议 4 的 `socket.id` 由 `base64id.generateId()` 生成，源码写明不复用 Engine.IO sid。默认 emit 只覆盖本进程；跨进程要换 Redis 等 adapter，这不属于 4.8.3 核心默认。

## 实践示例

### 案例 1：房间广播仍停在本进程

```js
import { Server } from "socket.io";

const io = new Server(3000, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  socket.on("join", (room) => socket.join(room));
  socket.on("msg", ({ room, text }) => {
    io.to(room).emit("msg", { from: socket.id, text });
  });
});
```

`socket.id` 是 Socket.IO 会话 id，不是 Engine.IO sid。`io.to(room).emit` 只问当前 adapter；没换分布式 adapter 时，另一台机器上的成员收不到。

### 案例 2：带超时的 ack

```js
socket.emit("save", { id: 7 }, (ack) => {
  if (ack?.ok) console.log("saved");
});

socket.on("save", async (data, cb) => {
  await db.put(data);
  cb({ ok: true });
});

const reply = await socket.timeout(1000).emitWithAck("ping", "hi");
```

最后一个函数参数变成 ack；`timeout` 只约束这次等待，不是 Engine.IO 心跳。

### 案例 3：连接状态恢复不是默认行为

```js
const io = new Server(3000, {
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
});
```

只有显式打开时，adapter 才会换成 `SessionAwareAdapter`，并尝试恢复 rooms、`data` 和错过的包。`socket.recovered` 为真才表示这次走了恢复路径。

## 踩过的坑

1. **把 Engine.IO 连上当成业务连上**：Client 若 45 秒内不加入 namespace，服务端会关连接。只监听 `io.on("connection")` 时，别忘了客户端也要完成 namespace handshake。

2. **默认拒绝 EIO3**：旧 v2 客户端或漏掉 `EIO=4` 的握手会得到 unsupported protocol version。`allowEIO3` 默认是 false，不是兼容开关常开。

3. **多节点仍用内存 adapter**：默认广播只在本进程。上线多副本却不配 sticky session 和外部 adapter 时，长轮询的 sid 可能落到另一台机器，表现为反复重连或丢房间消息。

4. **CORS / cookie 不是默认合同**：Engine.IO 默认 `cors=false` 且不发 cookie。跨域带 cookie 必须显式配置；源码默认不能推断“已经能跨域”。

## 适用 vs 不适用场景

**适用**：

- 浏览器与 Node 都要双向事件，并希望传输层能从 polling 升级到 WebSocket
- 需要 namespace / 房间 / ack，而不想自己实现扇出语义
- 已有 Socket.IO 客户端协议，两端版本能对齐到 4.x

**不适用**：

- 只要 RFC 6455 帧，不需要自定义协议 —— 直接用 [[ws]]
- 只要服务端单向推送 —— SSE 通常更简单
- 需要严格跨语言、标准 WebSocket only 的客户端生态
- 把未测量的“十万连接”或“比裸 ws 慢/快”写成默认事实

## 固定版本边界

- 本文绑定 `socketio/socket.io@9978574e...`，包版本 `4.8.3`，要求 Node >=10.2.0。
- 同提交里 `packages/engine.io` 自报 `6.6.5`，依赖声明为 `ws@~8.18.3`；不把后来的 `engine.io@6.6.9` 或独立审查的 `ws@8.21.3` 当成此页默认。
- 默认不恢复连接状态、不发 cookie、不启用 `perMessageDeflate`、不允许 EIO3。
- 本文未安装依赖、未跑上游测试或压测，状态保持 `UNVERIFIED`。

## 学到什么

1. **传输层和语义层是两份合同**——Engine.IO 管握手、升级、心跳；Socket.IO 管 namespace、房间、ack。
2. **默认 adapter 只覆盖本进程**——房间是字符串集合，不是跨机器对象。
3. **协议版本写在 query 里**——`EIO=4` 与 `allowEIO3` 决定旧客户端能不能进门。
4. **id 分层是有意的**——协议 4 不再把 Engine.IO sid 暴露成 `socket.id`。

## 应用型自测

1. 客户端只完成 Engine.IO 握手、45 秒内不加入任何 namespace，服务端会怎样？
2. 握手 query 没有 `EIO=4`，默认配置会接受吗？
3. 两台机器都跑默认 adapter，A 上的 `io.to("room").emit` 能到达 B 上的成员吗？

检查点：

1. `Client` 定时器到期后关闭底层连接。
2. 不会。源码把非 `EIO=4` 当成协议 3，默认 `allowEIO3=false` 拒绝。
3. 不能。默认内存 adapter 只广播本进程。

## 延伸阅读

- 官方文档：[socket.io/docs/v4](https://socket.io/docs/v4/)
- 固定源码：[socketio/socket.io](https://github.com/socketio/socket.io) —— 本文绑定提交 `9978574e4f1d4e21593497f94c40053cd0fff359`
- Engine.IO 协议：[github.com/socketio/engine.io-protocol](https://github.com/socketio/engine.io-protocol)
- [[ws]] —— Engine.IO 默认 WebSocket 引擎所基于的 Node 库
- [[express]] —— 常见的共享 HTTP server 挂载对象

## 关联

- [[ws]] —— 更薄的 RFC 6455 实现，没有房间和自动降级
- [[express]] —— 常把 Socket.IO attach 到同一 HTTP server
- [[fastify]] —— 同样能挂，但要自己拿到底层 server
- [[nestjs]] —— `@WebSocketGateway` 默认走 Socket.IO
- [[redis]] —— 官方多节点 adapter 的常见 pub/sub 后端
- [[centrifugo]] —— 独立实时网关，业务后端不自己 hold 连接
- [[soketi]] —— Pusher 协议兼容的自托管 WebSocket 服务

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[centrifugo]] —— Centrifugo — Go 写的开源实时消息服务器
- [[etherpad-lite]] —— Etherpad — 经典协作文本编辑器
- [[node-js]] —— Node.js — 服务端 JS 运行时之父
- [[soketi]] —— Soketi — 自己跑一台 Pusher，把实时通信费砍到零头
- [[ws]] —— ws — Node.js 上的 RFC 6455 WebSocket 实现
