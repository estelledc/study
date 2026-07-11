---
title: peerjs-server — 只管握手不管传话的 WebRTC 信令服务器
来源: https://github.com/peers/peerjs-server
日期: 2026-05-31
分类: 通信
难度: 入门
---

## 是什么

peerjs-server 是 PeerJS 客户端库的配套服务器，**唯一职责是帮两个浏览器互换"我在哪、我支持什么"的握手元数据**，让它们建立 WebRTC P2P 连接。**连上之后，数据完全不经过它**。

日常类比：它像一个婚介所——只负责让两个陌生人加上微信，加上之后两人怎么聊、聊多久，跟婚介所没关系。

最小用法：

```js
const { PeerServer } = require('peer')
const server = PeerServer({ port: 9000, path: '/myapp' })
```

服务器跑起来了。客户端只要带上同一个 `host:port` 和 `path`，就能注册一个 ID，然后用 ID 找别人。

## 为什么重要

WebRTC 这层没有"中央服务器"概念，但**两端在没连上之前根本不知道对方在哪**。怎么互换 IP/编解码能力？这一步叫**信令（signaling）**，必须由一个双方都能访问的"传话筒"代办。

WebRTC 标准故意没规定信令怎么实现——你可以用 websocket、http 长轮询、二维码，甚至打电话念。**peerjs-server 就是把这条传话筒做成现成的服务**：

- 客户端只需要 `new Peer(id)`，自动连上信令服务器、注册 ID、监听别人来连
- 想连别人就 `peer.connect(对方ID)`，服务器把握手包来回搬两次，连上之后退场
- **数据完全 P2P**：握手期间走服务器（几 KB 元数据），握手后传文件/视频/聊天全是浏览器对浏览器，服务器带宽压力极小

## 核心要点

要把 peerjs-server 用对，先记住它**只负责握手期**这一根主线。展开有 4 个要点：

1. **Peer ID 是入口**：每个客户端连上 server 时拿到一个 ID（可以让 server 随机生成，也可以客户端自己指定）。两端只要交换过 ID，就能连。
2. **WebSocket 长连接**：客户端注册后保持 ws 连接，等"有人来连我"。server 把握手包从 A 转给 B，再把 B 的回应转给 A。
3. **配置 4 件套**：`port` / `path`（路由前缀）/ `key`（连接密钥，默认 `peerjs`）/ `proxied`（反代后必开）。生产环境另加 SSL 证书或反代终结。
4. **嵌进 Express**：用 `ExpressPeerServer(httpServer, opts)`，把 peerjs-server 挂进已有 Node 后端的某个路径，复用同一个端口和域名。

## 实践案例

### 案例 1：独立部署 + 浏览器互连

```js
// server.js
const { PeerServer } = require('peer')
PeerServer({ port: 9000, path: '/myapp', key: 'my-secret' })
```

```html
<!-- 浏览器 A -->
<script src="https://unpkg.com/peerjs@1/dist/peerjs.min.js"></script>
<script>
  const peer = new Peer('alice', {
    host: 'localhost', port: 9000, path: '/myapp', key: 'my-secret'
  })
  peer.on('connection', conn => conn.on('data', d => console.log('from', conn.peer, d)))
</script>
```

```html
<!-- 浏览器 B -->
<script>
  const peer = new Peer('bob', { /* 同上 */ })
  peer.on('open', () => {
    const conn = peer.connect('alice')
    conn.on('open', () => conn.send('hi alice'))
  })
</script>
```

A 和 B 都连上 server，B 用 `peer.connect('alice')` 发起握手，server 转两轮，**之后 `conn.send` 的字节就走 P2P 了**。

### 案例 2：嵌进已有 Express 后端

```js
const express = require('express')
const { ExpressPeerServer } = require('peer')

const app = express()
app.get('/', (req, res) => res.send('hello'))
const server = app.listen(8080)
app.use('/peerjs', ExpressPeerServer(server, { path: '/' }))
```

业务接口 `/api/...` 和信令路由 `/peerjs` 共享一个端口，省一个域名一份 SSL 证书。

### 案例 3：自定义 ID 生成

```js
PeerServer({
  port: 9000,
  generateClientId: () => `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
})
```

默认 ID 是 36 位 UUID 风格随机串。如果想用业务侧的用户 ID（比如登录后塞进去），传 `generateClientId` 接管。

## 踩过的坑

1. **误以为数据走服务器**：很多人配完后担心带宽炸——其实只有几 KB 的握手元数据走 server，之后全 P2P。**反过来真正要担心的是握手期 server 单点**：server 挂了新连接就建不了，但已建立的连接不受影响。
2. **反向代理后忘开 `proxied: true`**：server 会按"客户端 IP"做并发限制和心跳，但反代后所有请求来自代理 IP，全部用户被当一个 → 限频立刻把所有人挤掉。打开 `proxied: true` 后会读 `X-Forwarded-For`。
3. **`/peers` 端点慎开**：默认关闭，`allow_discovery: true` 才暴露。开了之后**任何人都能拉到所有在线 ID**，相当于把通讯录公开。需要发现机制时建议在业务侧自己存。
4. **默认 key `peerjs` 不改**：所有公网 PeerJS 客户端都能用你的 server 当顺风车，自建后必须改 key 或加业务鉴权。
5. **STUN 配了 TURN 没配**：peerjs-server **完全不管 NAT 穿透**——这是 WebRTC 客户端 config 里 `iceServers` 的事。生产环境约 10-20% 用户在严格 NAT 后，必须配 TURN（coturn 自建或买）。
6. **Cloudflare 反代要打开 ws 支持并关 caching**：默认 Cloudflare 把 ws 当普通 http，握手会被截。

## 适用 vs 不适用场景

**适用**：

- 浏览器 P2P 文件/数据分享的信令后端（拿现成的，不想自己写 ws 转发）
- 实时协作工具的轻量握手服务（光标、白板的 P2P 同步）
- 视频通话原型（产品验证阶段，不上 SFU）
- 局域网或同 WiFi 房间的设备撮合（局域网内 P2P 命中率高，TURN 都不用配）

**不适用**：

- 多人视频会议（4 人以上）→ 用 SFU（livekit / mediasoup），P2P 全连接 N² 撑不住
- 需要数据流经服务器审计 / 录制 → P2P 设计上就绕过 server，不要拧
- 完全去中心化场景 → 用 libp2p 的 circuit relay 或 DHT，不需要中心信令
- 已经在用 simple-peer + 自己写的 ws 信令 → 没必要换，simple-peer 故意不绑信令服务器

## 历史小故事（可跳过）

- **2013 起**：PeerJS 客户端库把 WebRTC 包装成易用 JS API，配套需要一个信令服务器，peerjs-server 同期诞生
- **2018 前后**：peers org 接手维护，把 server 重写成 TypeScript，加上 Express 中间件模式
- **2023-12**：发布 v1.0.2，进入稳定维护期，主要修 bug 和跟随 WebRTC 标准更新；4.7k stars / 1.1k forks

## 学到什么

1. **信令和数据分离是 WebRTC 的设计精髓**：握手用什么完全自由，传完即可下线。peerjs-server 只挑"握手期"这一段做成产品。
2. **"什么不做"也是产品定位**：peerjs-server 不做 NAT 穿透、不做 TURN 中继、不做发现/鉴权（除了一个 key），把责任边界划清楚，反而活了 10 年。
3. **客户端 + 服务端配套发布**很省事——PeerJS 用户拿来即用，不像 simple-peer 那样把信令通道完全甩给用户。代价是耦合 PeerJS 协议，跟其他 WebRTC 库不通。
4. **Express 中间件模式**让小服务能寄生进大后端：少一个端口、少一份 SSL、少一份 ops 负担。这种设计模式值得借鉴。
5. **同一个 WebRTC 生态**里，peerjs-server 和 simple-peer 是两条思路：前者"我都帮你弄好"，后者"我只给你引擎你自己接管子"。理解差异比记参数重要。

## 延伸阅读

- 官方 README + docker 镜像：[github.com/peers/peerjs-server](https://github.com/peers/peerjs-server)（必读，配置项全在这）
- PeerJS 客户端：[github.com/peers/peerjs](https://github.com/peers/peerjs)（信令协议的另一头）
- WebRTC for the Curious：[webrtcforthecurious.com](https://webrtcforthecurious.com/)（免费电子书，把 ICE/SDP/信令讲到协议级）
- coturn：[github.com/coturn/coturn](https://github.com/coturn/coturn)（peerjs-server 不管 TURN，要配兜底就用这个）

## 关联

- [[simple-peer]] —— 同一个 WebRTC 生态另一条路：极简包装，信令通道完全交给用户
- [[fastify]] —— 想自己实现轻量信令转发时的轻量后端选择
- [[playwright]] —— 自动化测试 P2P 应用时常用，开两个 context 模拟两端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
