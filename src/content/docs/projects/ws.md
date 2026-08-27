---
title: ws — Node.js 上的 RFC 6455 WebSocket 实现
description: Node.js 上的 RFC 6455 WebSocket 客户端与服务端实现
来源: https://github.com/websockets/ws
日期: 2026-08-27
分类: backend-api
难度: 初级
difficulty: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/websockets/ws
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: c791e707eab3c13dd9a261d2479c3cc4a49a6fed
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.21.3
---

## 是什么

ws 是一个只做 RFC 6455 WebSocket 的 Node.js 库。日常类比：它提供一根标准光纤和两端插头，不附带总机、会议号或自动换备用线路。

你写：

```js
import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 8080 });
wss.on("connection", (socket) => {
  socket.on("message", (data) => socket.send(data));
});
```

固定 `8.21.3` 同时导出客户端 `WebSocket` 和服务端 `WebSocketServer`。`browser` 入口直接抛错：浏览器用原生 `WebSocket`，不要打包这份 Node 实现。

## 为什么重要

不读固定 8.21.3 源码，下面这些边界很容易和 [[socket-io]] 混在一起：

- 为什么它能当 Engine.IO 的默认 `wsEngine`，自己却没有房间或长轮询
- 为什么服务端默认关掉 `perMessageDeflate`，客户端默认打开
- 为什么 `new WebSocketServer()` 必须在 `port` / `server` / `noServer` 里只选一个
- 为什么 `wss.clients` 只是可选 Set，广播要自己 `forEach`

## 核心要点

固定版本的主链可以拆成五步：

1. **选一种挂载方式**：构造器要求 `port`、`server`、`noServer` 三者恰好一个。只给 `port` 时，库会自建 HTTP server，非升级请求返回 426。

2. **HTTP Upgrade 握手**：`handleUpgrade` 校验 GET、`Upgrade: websocket`、`Sec-WebSocket-Key`（22 个 base64 字符加 `==`）以及 version 13 或 8。Accept 值按 RFC 6455 GUID `258EAFA5-E914-47DA-95CA-C5AB0DC85B11` 计算。`verifyClient` 可同步或异步拒绝。

3. **收发分层**：`Receiver` 拆帧，`Sender` 组帧。默认 `maxPayload` 为 100 MiB，`autoPong` 为真，`closeTimeout` 为 30000 ms。可选 peer `bufferutil` / `utf-8-validate` 只加速掩码和 UTF-8 校验，不是功能开关。

4. **压缩不对称**：服务端默认 `perMessageDeflate=false`；客户端默认 `true`。服务端未启用时，客户端即使 offer 也不会真正用上扩展。README 明确提示压缩有内存与 CPU 成本，本轮未测。

5. **没有业务扇出**：`clientTracking` 默认把连接放进 `Set`。房间、ack、自动重连、sticky session 都不在库内。`createWebSocketStream` 只是把已打开的 socket 包成 Duplex。

## 实践示例

### 案例 1：最小 echo

```js
import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 8080 });
wss.on("connection", (socket) => {
  socket.on("message", (data, isBinary) => {
    socket.send(data, { binary: isBinary });
  });
});
```

这是标准帧回显。没有 namespace，也没有“先 polling 再升级”。

### 案例 2：挂到已有 HTTP server

```js
import http from "node:http";
import { WebSocketServer } from "ws";

const server = http.createServer();
const wss = new WebSocketServer({ server, path: "/realtime" });

server.listen(3000);
wss.on("connection", (socket, req) => {
  socket.send(JSON.stringify({ path: req.url }));
});
```

`path` 只比较 pathname，query 被去掉。多条 WebSocket 服务共享同一 HTTP server 时，各自用不同 `path`，或改用 `noServer` 自己分发 `upgrade`。

### 案例 3：调用方自己广播

```js
wss.on("connection", (socket) => {
  socket.on("message", (data, isBinary) => {
    for (const client of wss.clients) {
      if (client !== socket && client.readyState === client.OPEN) {
        client.send(data, { binary: isBinary });
      }
    }
  });
});
```

`clients` 只在 `clientTracking` 为真时存在。这不是 Socket.IO 的房间；跨进程仍要自己做 pub/sub。

## 踩过的坑

1. **在打包器里当浏览器客户端**：`browser.js` 的全部工作就是抛错。同构代码需要原生 WebSocket 或单独包装，不能指望这份 Node 实现。

2. **同时传 `port` 和 `server`**：构造器会抛 `TypeError`。共享 HTTP server 时只传 `server`；自己监听时只传 `port`。

3. **以为压缩已经打开**：服务端默认关闭 permessage-deflate。只在客户端看到默认 `true` 就推断“线上已压缩”，与源码不符。

4. **把 `clients` 当成集群成员表**：它只跟踪当前进程里被这个 server 接受的连接。关了 `clientTracking` 后连这个 Set 都没有。

## 适用 vs 不适用场景

**适用**：

- Node 服务端需要标准 WebSocket，客户端是浏览器原生对象
- 要自己控制升级、子协议、`verifyClient` 或把 socket 接到现有 HTTP server
- 作为 [[socket-io]] / Engine.IO 底下的帧引擎，而不是业务协议

**不适用**：

- 需要自动长轮询降级、房间、ack 或连接状态恢复 —— 用 [[socket-io]]
- 需要独立实时网关、多协议接入和历史补包 —— 看 [[centrifugo]] 一类产品
- 浏览器里直接 `import "ws"`
- 把未测量的吞吐或“比 Socket.IO 快 N 倍”写成库的默认承诺

## 固定版本边界

- 本文绑定 `websockets/ws@c791e707...`，包版本 `8.21.3`，要求 Node >=10.0.0。
- GitHub tag、npm `gitHead` 与该 commit 一致。
- 服务端默认不压缩、最大消息 100 MiB、关闭握手等 30 秒；客户端默认协议 13、跟随重定向关闭。
- Socket.IO 4.8.3 树内声明的是 `ws@~8.18.3`，不是本页的 8.21.3。
- 本文未安装 optional peer、未跑 Autobahn 或压测，状态保持 `UNVERIFIED`。

## 学到什么

1. **标准帧库不替你做产品语义**——握手、掩码、pong 在库内；房间和重连在库外。
2. **挂载方式是互斥合同**——`port` / `server` / `noServer` 选错会在构造期失败。
3. **默认值两侧不对称**——客户端愿谈压缩，服务端默认不谈。
4. **browser 字段是拒绝而不是 polyfill**——它防止把 Node 实现打进浏览器。

## 应用型自测

1. `new WebSocketServer({ port: 8080, server })` 会怎样？
2. 只在浏览器打包 `import WebSocket from "ws"`，运行时会得到可用客户端吗？
3. 服务端用全部默认选项，客户端默认 `perMessageDeflate: true`，能否断言消息已被压缩？

检查点：

1. 抛 `TypeError`：三者只能指定一个。
2. 不会。`browser.js` 抛错，要求使用原生 `WebSocket`。
3. 不能。服务端默认关闭扩展，协商不会启用压缩。

## 延伸阅读

- 固定源码：[websockets/ws](https://github.com/websockets/ws) —— 本文绑定提交 `c791e707eab3c13dd9a261d2479c3cc4a49a6fed`
- API 文档：[doc/ws.md](https://github.com/websockets/ws/blob/8.21.3/doc/ws.md)
- RFC 6455：[datatracker.ietf.org/doc/html/rfc6455](https://datatracker.ietf.org/doc/html/rfc6455)
- [[socket-io]] —— 在 ws 之上再加 Engine.IO 传输与事件语义
- [[centrifugo]] —— 不把连接持有放在业务 Node 进程里

## 关联

- [[socket-io]] —— 默认 WebSocket 引擎指向 `ws.Server`
- [[express]] —— 常把 `WebSocketServer({ server })` 挂到同一 HTTP server
- [[fastify]] —— 同样需要拿到底层 server 或自己处理 upgrade
- [[centrifugo]] —— 独立实时服务器，对比“库 vs 网关”
- [[soketi]] —— 另一条自托管实时路径，协议是 Pusher 而不是裸帧

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[socket-io]] —— Socket.IO — 用 Engine.IO 传输层承载命名空间事件
