---
title: Centrifugo — Go 写的开源实时消息服务器
来源: 'https://github.com/centrifugal/centrifugo'
日期: 2026-05-30
子分类: Web 后端
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

Centrifugo 是一个**独立部署的实时消息服务器**——你的业务后端只管"我要给这群用户推一条消息"，Centrifugo 负责"维持几十万条 WebSocket 长连接、按频道分发、断线重连补包"。日常类比：像小区**广播站**，住户（前端）订阅"楼栋频道"，物业（后端）只把通知投给广播站，广播站负责喊到每户音箱。

你不需要自己写 WebSocket 服务器、不需要自己解决"多机房之间消息怎么互通"。后端发一个 HTTP POST，几毫秒后所有订了这个 channel 的浏览器都收到 JSON。

```bash
# 后端发布
curl -X POST http://centrifugo:8000/api/publish \
  -H "X-API-Key: ..." \
  -d '{"channel":"news","data":{"text":"新公告"}}'
```

它对标的是 Pusher / Ably 这类闭源 SaaS——同样的能力，但 Go 写的、开源、自托管。

## 为什么重要

不理解 Centrifugo 这类"实时网关"的存在，下面这些事都没法解释：

- 为什么聊天 / 直播 / 协作文档不在业务后端开 WebSocket，而是单拉一个 server
- 为什么"百万在线"听起来很难，但 Centrifugo 单机就能扛——长连接和业务逻辑分层后，连接数和 RPS 不是一回事
- 为什么前端断网重连后，能"补"到刚才漏掉的消息——不是魔法，是 history + offset
- 为什么有了 Kafka / Redis 还要它——Kafka 给后端用，Centrifugo 给浏览器用，受众不同

## 核心要点

Centrifugo 的核心可以拆成 **三件事**：

1. **PUB/SUB 网关**：所有消息按"频道字符串"组织，发布方 publish、订阅方 subscribe。类比：邮政信箱号——你订几号箱就只收几号箱的信。channel 用 `chat:room42` 这种命名空间前缀，规则在配置里——一条消息从发布到送达通常 1-5ms。

2. **多种传输协议同一份语义**：客户端可以用 WebSocket（默认）、SSE（防火墙友好）、HTTP-streaming、gRPC、试验性 WebTransport 接入，server 内部统一成同一种消息流。前端选连接方式，业务逻辑不变。比如企业内网封了 WS 端口，前端改 SSE 就能跑。

3. **Broker 抽象 + 水平扩展**：单机时消息内存里走，多机时插一个 Redis（或 Nats / Tarantool）——所有 Centrifugo 节点共享 PUB/SUB 通道和 history 存储，客户端连哪个节点都能收到全部消息。换 broker 只改 config，业务代码不动。

附加能力：JWT 鉴权、presence（看 channel 里有谁）、history（最近 N 条消息可补拉）、Prometheus 指标、admin UI、客户端断线重连后用 offset 自动 recover 漏掉的消息。

## 实践案例

### 案例 1：浏览器订阅一个聊天房间

```js
import { Centrifuge } from 'centrifuge'

const centrifuge = new Centrifuge('wss://centrifugo.example.com/connection/websocket', {
  token: '<JWT 由你的后端签发>',
})

const sub = centrifuge.newSubscription('chat:room42')
sub.on('publication', (ctx) => {
  console.log('收到新消息：', ctx.data)
})
sub.subscribe()
centrifuge.connect()
```

JWT 里写明"这个用户能看哪些 channel"。Centrifugo 验签后才允许订阅，避免任何人都能监听任何 channel。

### 案例 2：后端用 HTTP API 推消息

```python
import requests

requests.post(
    "http://centrifugo:8000/api/publish",
    headers={"X-API-Key": "your-api-key"},
    json={
        "channel": "chat:room42",
        "data": {"user": "Alice", "text": "你好"},
    },
)
```

后端不需要懂 WebSocket。一次 HTTP 调用，Centrifugo 替你扇出到所有订阅者。

生产环境也常用 gRPC API，吞吐更高、双向流更省连接开销。如果一次要发给上千 channel，还能用 `broadcast` 接口批量提交，省掉 N 次 HTTP 往返。

### 案例 3：AI 流式响应

```python
# LLM 服务边推理边推 token
for token in llm.stream(prompt):
    publish(f"ai:user:{user_id}", {"delta": token})
publish(f"ai:user:{user_id}", {"done": True})
```

每用户一个 channel，前端订阅后就能像 ChatGPT 那样"边出字边渲染"。比业务后端自己 hold 住 WebSocket 简单——业务后端只发布、不维护连接。

## 踩过的坑

1. **默认 insecure 模式不能上生产**：开箱配置允许任何客户端无 token 订阅任何 channel，便于本地试玩。忘记切 JWT 鉴权 = 后端推什么外网都看得到。

2. **channel 命名空间没配**：所有 channel 默认共享同一套 history / presence / 限流参数，业务一长大就发现"想给 chat 加 history、给 metrics 不加"做不到。前期就要按 `namespace:channel` 划好。

3. **当成可靠队列用**：Centrifugo 是 best-effort PUB/SUB，history 窗口（如最近 100 条 / 1 小时）外的消息会丢。**重要事件**（订单状态、支付）该走 Kafka / 持久消息队列，再由消费者发布到 Centrifugo 推前端。

4. **proxy hook 同步阻塞**：Centrifugo 支持把"连接 / 订阅 / 发布"事件 proxy 到你的业务后端做权限校验。这是同步调用——业务 API 慢一倍，整个 broker 的连接建立速度就慢一倍。proxy 必须毫秒级返回。

## 适用 vs 不适用场景

**适用**：
- 自托管聊天、弹幕、通知中心、在线协作（文档光标 / 白板）
- AI 流式响应（边生成边推前端），这是 2024 年后 Centrifugo 增长最快的场景
- 实时 dashboard、价格行情、游戏状态同步
- 已有业务后端不想改成长连接服务，想"加一层"实时能力

**不适用**：
- 需要"消息一定送达且持久"——用 Kafka / RabbitMQ / SQS
- 后端到后端的服务间通信——用 gRPC / NATS 直连，没必要绕 Centrifugo
- 极端低延迟（<5ms）的金融撮合 / 高频交易——用专用 UDP 协议
- 只有几百用户的小项目——用 socket.io 或框架自带 WebSocket 更简单

## 历史小故事（可跳过）

- **2015 年**：Alexander Emelin 用 Python + Tornado 写了第一版 Centrifugo，自用做实时面板，灵感来源是当时 Pusher 收费太贵。
- **2016-2017 年**：完整重写为 Go——`centrifuge` 是核心库，`centrifugo` 是封装好的 server 二进制；Go 的 goroutine 模型让长连接管理顺畅得多。
- **2020-2024 年**：v3 引入 protobuf 和 unidirectional 传输、v4 加 token-based subscriptions、v5 加 delta 压缩和实验性 WebTransport。
- **2026 年**：GitHub 9k+ star，被自托管 SaaS、游戏、AI 产品广泛选用，是开源实时消息服务器里最成熟的之一。

## 学到什么

1. **长连接和业务逻辑要分层**：业务后端处理 1k QPS，连接服务器处理 100k 长连接，两者扩展曲线完全不同，硬塞同一个进程会被拖垮
2. **协议多样性是产品力**：同一份 channel 语义暴露成 WebSocket / SSE / gRPC，前端按环境选最合适的，server 不变
3. **best-effort PUB/SUB 不是缺点**：实时类信号丢一个无所谓，过度追求"送达"会拖垮整体延迟，让业务自己挑
4. **broker 抽象让水平扩展便宜**：从单机到多机只是改个 config，不是重构架构，这是开源 server 比自研最大的省心点

## 延伸阅读

- 官方文档：[centrifugal.dev](https://centrifugal.dev/)（含教程、协议、SDK 一览，建议从 quickstart 跟一遍）
- GitHub：[centrifugal/centrifugo](https://github.com/centrifugal/centrifugo)（README 把对比 Pusher / Ably 的差异讲得很清楚）
- 设计文章：[Centrifugo v3 design overview](https://centrifugal.dev/blog)（解释为什么从 JSON 切到 protobuf）
- 同类对比：[[socket-io]] —— 库不是 server，更轻量但难水平扩展

## 关联

- [[socket-io]] —— 同样做实时消息，但 socket-io 是嵌入业务 server 的库，Centrifugo 是独立 server
- [[redis]] —— Centrifugo 默认 broker，跨节点 PUB/SUB + history 都靠它
- [[kafka]] —— 持久消息队列，常和 Centrifugo 配合：Kafka 落库，消费者推 Centrifugo
- [[nats]] —— 另一个轻量 PUB/SUB，可以替代 Redis 做 Centrifugo 的 broker
- [[grpc-go]] —— Centrifugo 的 server-to-server API 走 gRPC，吞吐比 HTTP 高
- [[envoy]] —— 部署时常放 envoy 做前置 TLS 终止 + 限流
- [[fastify]] —— 和 Centrifugo 互补：fastify 写业务 API，Centrifugo 接长连接

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[envoy]] —— Envoy — 把网络通信从业务代码里抠出来的代理进程
- [[fastify]] —— Fastify — 让 schema 替你写校验和序列化的 Node.js 框架
- [[grpc-go]] —— gRPC-Go — Google RPC 框架的官方 Go 实现
- [[redis]] —— Redis — 内存键值数据库
- [[socket-io]] —— Socket.IO — 让浏览器和 Node.js 像打电话一样互相喊事件
- [[synapse]] —— Synapse — Matrix 协议的参考 homeserver，让聊天像电邮一样能跨服务器互通

