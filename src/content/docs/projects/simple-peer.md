---
title: simple-peer — 三行代码把两个浏览器直接连起来
来源: https://github.com/feross/simple-peer
日期: 2026-05-31
分类: 通信
难度: 入门
---

## 是什么

simple-peer 是 feross 写的一个 npm 包，**把浏览器原生的 WebRTC P2P API 简化成「new 一个对象、监听两个事件、就连通了」的程度**。

日常类比：原生 WebRTC 像让你自己装一台发动机——活塞、火花塞、油路全得手接；simple-peer 是把发动机封进一个铁壳，留两根管子（事件）和一个开关（构造函数）给你。

最小用法：

```js
const peer = new Peer({ initiator: true })
peer.on('signal', data => sendToOther(data))   // 出口 1：握手数据
peer.on('connect', () => peer.send('hello'))   // 出口 2：连通后能发数据
peer.on('data',    data => console.log(data))  // 出口 3：收数据
```

加上对端镜像写一份，**握手完成后数据面走 P2P 直连**（信令仍要你自己送；ICE 还可能短暂问 STUN，穿不过时才会经 TURN 中继）。

## 为什么重要

P2P（点对点）通信在浏览器里是 WebRTC 提供的，但原生 API 需要管 5 件事：`RTCPeerConnection` / SDP / ICE candidate / DataChannel / MediaStream。新手写通一个最简 demo 通常要 200 行起步，还要踩一堆 NAT 穿透的坑。

simple-peer 的价值：

- **API 表面砍到 5 个**：constructor、`.signal()`、`.send()`、`data` 事件、`stream` 事件
- **被实战检验**：WebTorrent（浏览器 BT 客户端）的底层就是它，几百万用户跑过
- **信令通道不锁死**：你想用 websocket、二维码、甚至手抄一段字符串，都行——库不管这个
- **同时支持数据和音视频**：`peer.send(buffer)` 发数据，构造时传 `stream` 选项发摄像头流

## 核心要点

WebRTC 连两个浏览器，本质上要走完 **3 步**：

1. **信令（signaling）**：双方还没连上时，得先互相告诉对方「我在哪个 IP、支持哪些编解码」——这段元数据交换叫信令。simple-peer 把这一步抽象成 `signal` 事件（出元数据）和 `.signal(data)` 方法（喂入对方的元数据）。
2. **NAT 穿透**：家用网络的电脑都藏在路由器后面，公网看不见。WebRTC 用 ICE 算法尝试打洞，配合 STUN（发现自己的公网地址）和 TURN（穿不过时的中继兜底）。
3. **DataChannel / MediaStream**：穿透成功后，两端开一条 P2P 通道传字节或音视频。

simple-peer 把第 2、3 步全藏起来；用户**只剩第 1 步要操心**——把 `signal` 事件出来的字符串，想办法送到对端，再喂回去。

构造选项里只有 4 个常用参数需要记：

- `initiator: true`——主动发起方（双方必有一个 true，一个 false 或省略）
- `stream`——传 MediaStream（音视频）就在构造时塞进去
- `config: { iceServers: [...] }`——传你的 STUN/TURN 列表
- `trickle: false`——把 ICE candidate 攒齐再一次性发，调试时省事

## 实践案例

### 案例 1：用 WebSocket 当信令通道连两个浏览器

```js
// 客户端通用代码
const ws = new WebSocket('wss://my-signaling-server')
const peer = new Peer({ initiator: location.hash === '#init' })
peer.on('signal', data => ws.send(JSON.stringify(data)))
ws.onmessage = e => peer.signal(JSON.parse(e.data))
peer.on('connect', () => peer.send('hi from peer'))
peer.on('data', d => console.log('got:', d.toString()))
```

服务器端只做一件事：把 A 发来的消息转给 B，反之亦然。**握手完后服务器就可以下线**——之后所有数据走 P2P。

### 案例 2：手抄 signal 字符串（极简演示）

打开两个标签页，A 标签控制台打印 `signal` 事件的 JSON，复制粘贴到 B 标签的 `peer.signal(...)`，再把 B 出的 JSON 抄回 A，**两个标签页就直连了，全程没用服务器**。这个 demo 是理解 WebRTC 信令本质的最佳起点。

### 案例 3：传摄像头流（视频通话原型）

```js
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => {
    const peer = new Peer({ initiator: true, stream })
    peer.on('stream', remoteStream => {
      document.querySelector('video').srcObject = remoteStream
    })
  })
```

构造时传 `stream`，对端会在 `stream` 事件里拿到对方摄像头——10 行写出视频通话原型。

### 案例 4：传大文件（按 16KB 切片）

```js
const CHUNK = 16 * 1024
function sendFile(peer, file) {
  let offset = 0
  const reader = new FileReader()
  reader.onload = e => {
    peer.send(e.target.result)
    offset += CHUNK
    if (offset < file.size) readSlice(offset)
    else peer.send(JSON.stringify({ done: true, name: file.name }))
  }
  function readSlice(o) { reader.readAsArrayBuffer(file.slice(o, o + CHUNK)) }
  readSlice(0)
}
```

浏览器里一次 `send` 太大容易不稳定，实战常按约 16KB 切片；WebTorrent 的文件分发就是类似切片 + 序号拼回。

## 踩过的坑

1. **信令通道得自己配**：库不带 server。生产环境通常上 websocket 转发；本地调试可手抄。**忘了配 = 永远连不上**。
2. **NAT 穿透失败率约 10-20%**：双方都在严格 NAT 后面时打不通，必须在构造时传 `config: { iceServers: [...] }` 含 TURN server 兜底，否则少量用户连不上。免费 STUN 够用，TURN 一般要自建或买（coturn 是常见自建方案）。
3. **大消息要自己切片**：DataChannel 并没有「协议写死 16KB」的硬上限，但一次塞太大缓冲/兼容性容易出问题；实战（含 WebTorrent）常按约 16KB 切片，对端按序号拼回。
4. **Node 端依赖 wrtc 装得慢**：wrtc 是 native 包，编译/下载预编译产物在 Apple Silicon 上有过几个月没 prebuild 的窗口，要么用 `@roamhq/wrtc` fork，要么只在浏览器跑。
5. **getUserMedia 要 https**：localhost 例外。线上调试发现摄像头拿不到 stream，检查是不是 http 页面。

## 适用 vs 不适用场景

**适用**：
- 浏览器 P2P 数据/文件分享（WebTorrent 类）
- 实时协作（光标、白板、轻状态同步）想省服务器带宽
- 视频通话原型（产品验证阶段，不上 SFU）
- 局域网游戏房间直连

**不适用**：
- 多人视频会议（4 人以上）→ 用 SFU 方案（livekit / mediasoup），P2P 全连接 N² 复杂度撑不住
- 严苛低延迟实时游戏 → WebRTC DataChannel 比 UDP 多一层握手开销
- 需要内置信令服务器 → 用 PeerJS（自带 server，更省事）
- 跨多协议 P2P（不止 WebRTC）→ 用 libp2p

## 历史小故事（可跳过）

- **2013**：feross 在念博士时为 WebTorrent 造的副产品——他要在浏览器里跑 BitTorrent，必须先把 WebRTC P2P 用顺
- **2014**：simple-peer 单独开源，立刻被几十个 P2P 实验项目采用
- **2015-2018**：WebTorrent 出圈，simple-peer 跟着进入主流
- **现在**：进入稳定期，主要做 bug 修和跟随 WebRTC 标准更新；feross 同时维护 [standard](https://github.com/standard/standard) 和 WebTorrent 全家桶

## 学到什么

1. **好 API 的本质是减事**：原生 WebRTC 5 个概念，simple-peer 留下 1 个（signal 字符串怎么送过去），其他全封装。这种「**留 1 个决策给用户、其余包死**」是经典封装思路。
2. **信令通道与数据通道分离**是 WebRTC 设计的关键——握手用什么完全不限，传完即可下线。
3. **EventEmitter 模式适合异步握手流程**：`signal`/`connect`/`data`/`close` 四个事件把一个复杂状态机表达得直观。
4. **库不解决的问题也是设计**：simple-peer 不带信令 server、不带 TURN，迫使用户理解 WebRTC 的责任边界，长期看是好事。
5. **副产品反客为主**：feross 本来是为 WebTorrent 造工具，结果工具单独流行起来——副产品独立成包是开源界常见路径。
6. **维护策略**：feross 不追新 feature，主要修 bug 和跟标准。这种克制让库 10 年下来还能用，没有突破性 break。

## 延伸阅读

- 官方 README + examples：[github.com/feross/simple-peer](https://github.com/feross/simple-peer)（必读，自带 5 个可跑 demo）
- WebRTC for the Curious：[webrtcforthecurious.com](https://webrtcforthecurious.com/)（免费电子书，从协议层讲清 ICE/SDP/DataChannel）
- WebTorrent 源码：[github.com/webtorrent/webtorrent](https://github.com/webtorrent/webtorrent)（看 simple-peer 在大型工程里怎么用）
- coturn：[github.com/coturn/coturn](https://github.com/coturn/coturn)（自建 TURN server 的事实标准）

## 关联

- [[webrtc-rs]] —— Rust 实现的 WebRTC 协议栈，看「另一边」浏览器之外怎么跑 WebRTC
- [[libp2p]] —— 更通用的 P2P 协议栈，传输层不限于 WebRTC
- [[playwright]] —— 自动化测试 P2P 应用时常用，能开两个 context 模拟两端
- [[fastify]] —— 想搭信令服务器时的轻量后端选择，websocket 转发够用

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[fastify]] —— Fastify — 让 schema 替你写校验和序列化的 Node.js 框架
- [[peerjs-server]] —— peerjs-server — 只管握手不管传话的 WebRTC 信令服务器
- [[playwright]] —— Playwright — 跨浏览器自动化测试
- [[webrtc-rs]] —— webrtc-rs — Rust 纯实现 WebRTC 协议栈，对标 Go 世界的 Pion

