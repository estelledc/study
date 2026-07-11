---
title: Socket.IO — 让浏览器和 Node.js 像打电话一样互相喊事件
来源: 'https://github.com/socketio/socket.io'
日期: 2026-05-30
分类: backend-api
难度: 初级
---

## 是什么

Socket.IO 是一个老牌 **Node.js 实时通信库**，让浏览器和服务器之间像打电话一样**双向收发事件**。日常类比：它像一个**配了备用线路的对讲机**——主线路（WebSocket）打不通，会自动切到副线路（HTTP 长轮询），上面说话的人完全感觉不到。

裸 WebSocket 像一根光纤：通了很快，没通就完全没办法。Socket.IO 在这根光纤外面包了一层**自动协商 + 备份通道 + 路由系统**，让你写：

```js
io.on('connection', (socket) => {
  socket.on('chat', (msg) => io.emit('chat', msg))
})
```

不用关心底层走的是 WebSocket 还是长轮询，也不用关心客户端断网后怎么重连。

## 为什么重要

不理解 Socket.IO，下面这些事都说不清楚：

- 为什么 2010 年代很多聊天 / 协作产品（Trello、Slack 早期）都基于它，而不是裸 WebSocket
- 为什么 Node.js 实时通信圈子里"Engine.IO + Socket.IO 两层"是反复出现的命名
- 为什么多节点部署 WebSocket 应用绕不开"sticky session"和"adapter"两个名词
- 为什么后来 SSE / WebTransport / [[trpc]] subscription 都要拿它当对照

## 核心要点

Socket.IO 由 **三件事** 拼出来：

1. **传输降级**：客户端连接时先 HTTP 握手拿到 sid 和支持列表，默认开一个 long-polling，再尝试**升级**到 WebSocket。类比：先派慢车把路探通，再换快车跑。失败也有车在跑。

2. **房间和命名空间**：`socket.join('room-42')` 把这个连接放进一个房间，`io.to('room-42').emit(...)` 只发给房间里的人。命名空间（`/admin` `/chat`）再上一层，把不同业务隔开。类比：电话里的会议号 + 分机号。

3. **多节点 adapter**：默认 emit 只在本机内存广播，装了 `@socketio/redis-adapter` 后，A 机器 emit 会通过 Redis pub/sub 让 B、C 机器上的客户端也收到。类比：本来每个对讲机基站只管自己那块，加个"卫星中继"后所有基站连成一张网。

这三件事加上**自动重连 + 心跳 + ack 回执**，构成了 Socket.IO 的全部对外承诺。

## 实践案例

### 案例 1：最小聊天室（房间广播）

服务端：

```js
import { Server } from 'socket.io'
const io = new Server(3000, { cors: { origin: '*' } })

io.on('connection', (socket) => {
  socket.on('join', (room) => socket.join(room))
  socket.on('msg', ({ room, text }) => {
    io.to(room).emit('msg', { from: socket.id, text })
  })
})
```

客户端：

```js
import { io } from 'socket.io-client'
const socket = io('http://localhost:3000')
socket.emit('join', 'room-42')
socket.on('msg', (m) => console.log(m.from, m.text))
```

`socket.id` 是这次连接的临时 ID，重连后会变。`io.to(room).emit` 只广播给加入了 `room-42` 的连接，避免全员通知。

### 案例 2：监控大屏的服务端推送

```js
let timer = null
function startPush(ms) {
  clearInterval(timer)
  timer = setInterval(() => {
    io.emit('stats', { cpu: os.loadavg()[0], qps: counter.get() })
  }, ms)
}
startPush(1000)

io.on('connection', (socket) => {
  socket.on('set-interval', (ms) => startPush(ms))  // 浏览器反向调采样
})
```

三步：① `startPush` 定时采集指标；② `io.emit('stats', …)` 推给所有连接；③ 客户端 `emit('set-interval')` 改频率。比起 SSE，多了这条**反向通道**。

### 案例 3：带 ack 的请求—回复

```js
// 客户端
socket.emit('save', { id: 7, body: 'hi' }, (ack) => {
  if (ack.ok) console.log('saved')
})

// 服务端
socket.on('save', async (data, cb) => {
  await db.put(data)
  cb({ ok: true })
})
```

`emit` 的最后一个参数是**回调**，服务端把它当函数调用，结果会原路返回。这套 ack 机制让 Socket.IO 既能"事件流"也能"请求/响应"。

## 踩过的坑

1. **多节点忘配 sticky session**：长轮询阶段一个客户端的 HTTP 请求必须**每次回到同一台机器**，否则 sid 在另一台找不到，每隔几秒就 reconnect。Nginx `ip_hash` 或 ELB cookie 黏滞是必备。

2. **CORS 漏 credentials**：跨域 + 携带 cookie 的场景必须显式 `cors: { origin, credentials: true }`，否则浏览器静默断开，服务端日志看着却"没异常"，新人最常踩。

3. **多机房 emit 装不上 adapter**：默认 emit 只在本进程广播，没装 `@socketio/redis-adapter` 时，A 机器 emit 出去 B 机器上的客户端永远收不到，本地测试一切正常一上线就漏消息。

4. **客户端服务端版本协议错配**：v2 客户端连 v4 服务端会握手失败，错误信息只有 400，根因要看 protocol 数字。升级时**两端必须同步**或服务端开 `allowEIO3` 兼容。

## 适用 vs 不适用场景

**适用**：

- 双向事件流（聊天、协作光标、在线状态）—— 浏览器和服务端都频繁主动说话
- 需要兼容老旧网络环境（公司内网、移动 4G、严格代理）—— long-polling fallback 救命
- 中等规模实时应用 —— 房间 + adapter 已经够用，不需要自己造广播层

**不适用**：

- 极致性能 / 海量连接（10 万 +）—— 用 [[fastify]] + 裸 ws 或 uWebSockets.js 更省 CPU
- 服务端单向推送为主 —— SSE（Server-Sent Events）更简单，自带断线重连
- 完全跨语言客户端 —— 协议是 Socket.IO 自定义的，非 JS 客户端少且不统一
- 需要严格二进制 / 自定义协议 —— 直接用 ws 或 gRPC 更合适

## 历史小故事（可跳过）

- **2010 年**：Guillermo Rauch 创建 Socket.IO。当时 IE 一直没原生 WebSocket，Firefox/Safari 支持也不齐，**long-polling 自动 fallback** 是它最大卖点。
- **2012 年**：v0.9 流行，被 Trello、Slack 早期、各种 dashboard 采用，几乎成了 Node.js 实时通信代名词。
- **2014 年**：v1.0 拆分为 **Engine.IO（传输层）+ Socket.IO（语义层）**。这次解耦让传输逻辑可单独演进。
- **2017 年**：v2.0 发布（同年 5 月）；二进制与 ack 等能力在 v1/v2 线继续打磨，客户端/服务端仍大致兼容。
- **2020–2021 年**：v3（2020-11）做破坏性协议升级（与 v2 不互通）；v4（2021）在此基础上重写底层，TypeScript 更友好，多节点 adapter（Redis、Postgres、MongoDB）成体系。

## 学到什么

1. **传输降级是产品力**：当一个库帮你解决"30% 用户连不上"的尾部问题，开发者愿意为它付额外抽象成本
2. **分层是长寿的秘诀**：Engine.IO/Socket.IO 拆开后，每层可以独立演进而不破坏对外 API
3. **房间是状态而不是对象**：把"哪些连接订阅了哪些频道"抽成轻量字符串集合，比"建一个 Channel 类"灵活
4. **多节点的难点不在协议，在状态**：sid、房间成员关系如何在多机共享，决定了你的 adapter 架构

## 延伸阅读

- 官方文档：[socket.io/docs](https://socket.io/docs/v4/)（中文翻译完整，例子可直接跑）
- 视频：[Fireship — Socket.io in 100 seconds](https://www.youtube.com/watch?v=1BfCnjr_Vjg)（先建立直觉再读文档）
- Engine.IO 协议规范：[github.com/socketio/engine.io-protocol](https://github.com/socketio/engine.io-protocol)（看握手包长什么样）
- [[express]] —— Socket.IO 最常和它一起用，共享 HTTP server
- [[redis]] —— 官方多节点 adapter 默认依赖它做 pub/sub

## 关联

- [[express]] —— 最常配的 HTTP 框架，Socket.IO 直接挂在它的 server 上
- [[fastify]] —— 同样能挂，性能更好但 plugin 集成稍多步骤
- [[nestjs]] —— 内置 `@WebSocketGateway` 装饰器，本质是 Socket.IO 的薄包装
- [[redis]] —— 多节点广播的默认 pub/sub 后端
- [[nats]] —— Redis 之外的另一种 adapter 选项，更轻量
- [[trpc]] —— 同样是高阶通信抽象，但走 HTTP/SSE 而非 WebSocket
- [[http-2]] —— Server Push 是另一种"服务端主动说话"路径，但用法很不一样

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[centrifugo]] —— Centrifugo — Go 写的开源实时消息服务器
- [[etherpad-lite]] —— Etherpad — 经典协作文本编辑器
- [[node-js]] —— Node.js — 服务端 JS 运行时之父
- [[soketi]] —— Soketi — 自己跑一台 Pusher，把实时通信费砍到零头
