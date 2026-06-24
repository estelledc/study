---
title: WebSocket RFC 6455 — 让浏览器和服务器开一条不挂断的双向电话
来源: Fette & Melnikov, "The WebSocket Protocol", IETF RFC 6455, 2011
日期: 2026-05-31
分类: 网络协议
难度: 中级
---

## 是什么

WebSocket 是一套**让浏览器和服务器在一条 TCP 连接上来回说话、谁先开口都行**的协议。日常类比：HTTP 像写信（你寄一封、对方回一封，回完信封就扔），WebSocket 像打开电话（接通后两边可以随时讲话，不用每句话都重新拨号）。

你写：

```js
const ws = new WebSocket('wss://example.com/chat')
ws.onmessage = (e) => console.log('服务器主动说：', e.data)
ws.send('我要说的话')
```

浏览器和服务器**握一次手**，之后任何一方有消息就直接发，不用对方先问。这就是 RFC 6455 的全部承诺。

## 为什么重要

不理解 WebSocket，下面这些事都会变成黑盒：

- 为什么聊天 / 实时协作 / 行情推送的页面不再用每秒轮询，而是『打开就一直连着』
- 为什么有时候 WebSocket 在公司网络下莫名断线、回家就好——企业负载均衡器（LB）默认空闲 60 秒就掐
- 为什么 WebSocket 用 `ws://` 和 `wss://` 而不是 `http://`——握手是 HTTP，之后协议**完全切换**
- 为什么选型时『WebSocket vs SSE vs 长轮询』看起来都能做推送，但只有 WebSocket 是真双向

## 核心要点

WebSocket 协议可以拆成 **三层**：

1. **握手（Handshake）**：复用 HTTP/1.1 的 `Upgrade` 机制。客户端发一个看起来像普通 HTTP 的请求，带 `Upgrade: websocket` 和一个随机 16 字节的 `Sec-WebSocket-Key`；服务器回 `101 Switching Protocols` 和算出来的 `Sec-WebSocket-Accept`（把 key 拼上一个固定 GUID 后 SHA-1 + base64）。这一步只是为了**借 80/443 端口穿透防火墙**。

2. **帧格式（Framing）**：握手后协议切换。每条消息按帧发：1 字节包含 `FIN`（是不是最后一片）和 `opcode`（0x1=文本 / 0x2=二进制 / 0x8=关闭 / 0x9=ping / 0xA=pong），然后是长度字段（1-9 字节变长编码），客户端发的帧还要带 4 字节 mask 给 payload 异或。

3. **生命周期**：随时任意一方可以发 `close` 帧（带状态码 1000 正常 / 1001 离开 / 1006 异常）；中间用 `ping/pong` 保活。

三层加起来：**借 HTTP 上车、之后开自己的车、想下车就下车**。

## 实践案例

### 案例 1：握手到底长什么样

客户端发：

```http
GET /chat HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
```

服务器算：把 key 拼上固定 GUID `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`，SHA-1 后 base64，得到 `s3pPLMBiTxaQ9kYGzzhZRbK+xOo=`。

服务器回：

```http
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

那个 GUID 是协议**写死的常量**，目的是『证明对方真懂 WebSocket、不是被骗了 HTTP』。

### 案例 2：为什么客户端必须 mask

```
客户端 → 服务器：每个帧的 payload 必须用 4 字节随机 key 异或
服务器 → 客户端：不用 mask
```

听起来多此一举，但根因是：早期有些**中间代理**（透明 HTTP 缓存）会把看起来像 HTTP 请求的字节当 HTTP 处理，导致缓存毒化。Mask 让 payload 的字节分布不可预测，代理无法把它误读成 HTTP 请求。这条不对称设计**只为了兼容 2011 年那批老代理**。

### 案例 3：企业 LB 掐链怎么发生的

```
[浏览器] ←→ [公司出口 LB] ←→ [服务器]
                idle 60s 默认杀连接
```

WebSocket 静默 60 秒后，LB 不知道这条 TCP 还有人用，发个 RST 关掉。浏览器侧收到 close 帧 = 1006（异常）。

**修法**：应用层每 30 秒主动发 `ping` 帧（opcode 0x9），LB 看到流量就重置 idle 计时器。这就是为什么所有真用 WebSocket 的 SDK 都内置心跳——**RFC 给了 ping/pong，但什么时候发是应用决定的**。

## 踩过的坑

1. **以为 WebSocket 是 HTTP**：F12 网络面板里 WebSocket 连接握手后的帧**不出现在 XHR/fetch 里**，要切到 WS 标签看。新人常以为『接口不通』其实只是看错地方。

2. **wss:// 不是新协议**：就是 TLS 之上跑 WebSocket，等价于 https 之于 http。不需要额外证书，复用 443 端口的 TLS 配置。

3. **subprotocol 必须 echo**：客户端 `Sec-WebSocket-Protocol: chat, superchat`，服务器要么回**列表里的一个**值，要么不回这个头。回了客户端没给的值，客户端应主动断开。

4. **permessage-deflate 不是免费午餐**：压缩扩展（RFC 7692）默认能省 70% 流量，但每帧都要 CPU 解压。移动端弱网 + 小帧消息（< 100 字节）反而更慢。

5. **Origin 头要校验**：浏览器自动带 `Origin`，但**非浏览器客户端**（curl / 自写 Go 客户端）可以伪造任意 Origin。服务器靠 Origin 防 CSWSH 时要清楚这只挡浏览器。

## 适用 vs 不适用场景

**适用**：

- 实时双向通信——聊天、协作编辑、白板、在线游戏
- 服务器主动推送状态变化——行情 tick、订单状态、通知中心
- 低延迟要求（< 100ms）——HTTP 长轮询撑不住

**不适用**：

- **纯下行推送**——服务器只发不收，用 SSE（Server-Sent Events）更轻，自动重连且能穿绝大多数代理
- **请求-响应业务**——查列表 / 提交表单，HTTP/2 或 HTTP/3 已经够好
- **P2P 媒体流**——视频通话用 WebRTC，自带 NAT 穿透和拥塞控制
- **严格代理环境**——某些企业代理只放行明文 HTTP，wss 也过不去时只能 fallback 长轮询

## 历史小故事（可跳过）

- **2008 年**：Ian Hickson 在 HTML5 工作组提出 `TCPConnection` API 草案，想给浏览器加双向通信。最早叫 WebSocket 的版本只有几页纸。
- **2009-2010 年**：协议反复改了 17 个版本，因为发现早期版本能被透明代理利用做缓存毒化攻击——这就是 mask 设计的来源。
- **2011 年 12 月**：RFC 6455 正式发布，作者 Ian Fette（Google）和 Alexey Melnikov（Isode）。
- **2012 年起**：Chrome / Firefox / Safari 全部默认支持。
- **2015 年起**：HTTP/2 的服务器推送（Server Push）想替代 WebSocket，但实际场景下 Server Push 几乎没人用，WebSocket 仍是主流。
- **2022 年**：RFC 8441 让 WebSocket 也能跑在 HTTP/2 之上（一条 H2 流跑一条 WS），但浏览器支持度仍参差。

## 学到什么

1. **协议复用是工程智慧**——不发明新端口、新握手，借 HTTP 上车，过防火墙省心
2. **不对称设计有历史包袱**——客户端 mask、服务器不 mask，看起来奇怪，但是为兼容老代理
3. **协议给机制、应用给策略**——RFC 定义 ping/pong 帧，**什么时候发**是应用层的事
4. **选型要看维度**——双向 / 单向 / 请求响应 / P2P，每个场景有最匹配的协议，WebSocket 不是『更好的 HTTP』

## 延伸阅读

- 协议原文 71 页 PDF：[RFC 6455](https://www.rfc-editor.org/rfc/rfc6455)（密度极高，建议先看 §1.2 概览和 §5 帧格式）
- 互动教程：[MDN — Writing WebSocket servers](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers)（用伪码讲清楚握手和帧解析）
- 压缩扩展：[RFC 7692 permessage-deflate](https://www.rfc-editor.org/rfc/rfc7692)（最常用扩展）
- HTTP/2 上的 WebSocket：[RFC 8441](https://www.rfc-editor.org/rfc/rfc8441)（让 WS 复用 H2 流）
- [[http-1.1]] —— WebSocket 握手依赖 HTTP/1.1 Upgrade 机制
- [[tls-1.3]] —— wss:// 就是 TLS over WebSocket

## 关联

- [[http-1.1]] —— 握手层借的车，没 HTTP/1.1 Upgrade 就上不了 80/443
- [[tls-1.3]] —— wss:// 是 TLS 之上跑 WebSocket，等价于 https 之于 http
- [[http2]] —— 同时代的多路复用方案，目标重叠但定位不同
- [[http3-quic]] —— 下一代传输层，QUIC + WebTransport 是 WebSocket 的潜在替代
- [[webrtc]] —— P2P 媒体流场景下 WebSocket 的另一面，但常用 WebSocket 做信令

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ice-rfc-5245]] —— ICE (RFC 5245) — 让两台藏在 NAT 后面的设备找到彼此
- [[mogul-1995-persistent-http]] —— Mogul 1995 — 为什么 HTTP 必须改成"一根连接复用多次请求"

