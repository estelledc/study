---
title: Centrifugo — Go 写的开源实时消息服务器
来源: 'https://github.com/centrifugal/centrifugo'
日期: 2026-08-27
分类: backend-api
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/centrifugal/centrifugo
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: e108c4e8f3b9f78d21663f985e754ef4d6908ed1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.9.3
---

## 是什么

Centrifugo 是独立部署的实时 PUB/SUB 服务器：业务后端用 HTTP 或 gRPC API 往 channel 发消息，浏览器或 SDK 维持长连接并订阅。日常类比：小区广播站——住户订楼栋频道，物业只把通知交给广播站，不自己拉线到每户音箱。

```bash
curl -X POST http://127.0.0.1:8000/api/publish \
  -H "X-API-Key: your-api-key" \
  -d '{"channel":"news","data":{"text":"新公告"}}'
```

固定 lightweight tag `v6.9.3` 指向 `e108c4e8...`。模块路径 `github.com/centrifugal/centrifugo/v6`，Go 1.26，核心库 `centrifuge`。源码里 `internal/build.Version` 是占位 `0.0.0`，对外版本以 tag 为准。HTTP 默认端口 `8000`。

## 为什么重要

不按 v6 配置和 ACL 读，下面这些旧印象会对不上：

- 为什么「开箱就能无 token 订阅任何 channel」不是默认行为
- 为什么 history / 断线补包默认并不存在
- 为什么 Tarantool 不再出现在 broker 类型里
- 为什么只开 WebSocket 时，SSE / WebTransport 路径根本没挂上

## 核心架构与流程

固定 6.9.3 的主链可以拆成五步：

1. **进程入口**：`main` 调 `app.Centrifugo()`，再挂 `version` / `checkconfig` / `gentoken` 等 cobra 子命令。`configureEngines` 给 `centrifuge.Node` 装 broker 和 presence manager。

2. **Engine 与 Broker**：默认 `engine.type=memory`（内存 broker + 内存 presence，重启丢失、不分布式）。分开写时，`broker.type` 可以是 `memory` / `redis` / `nats` / `postgres` / `redisnats`。本提交没有 Tarantool broker。

3. **传输默认只开 WebSocket**：默认前缀 `/connection/websocket`。双向 SSE、HTTP-stream、WebTransport 以及各 `uni_*`、gRPC API 都是 flag 默认 false。WebTransport 在配置文档里标 experimental，前缀 `/connection/webtransport`。

4. **服务端 API**：HTTP API 默认前缀 `/api`。`/api` 仍走 legacy `OldRoute()`；同时挂 `/api/publish`、`/api/broadcast` 等拆分路由。鉴权先看 `X-API-Key`，否则 `Authorization: apikey <KEY>`，再否则 `?api_key=`。`http_api.insecure` 关掉鉴权；空 key 在非 insecure 时直接 401。gRPC API 默认关，flag 默认端口 10000。

5. **连接与订阅 ACL**：无 token 时只有 `client.allow_anonymous_connect_without_token` 或 `client.insecure` 才会接受空 user 连接。订阅还要过 channel 选项：token 里的 `Subs`、subscribe proxy、`allow_subscribe_for_client` / `allow_subscribe_for_anonymous`，或 `client.insecure`。默认这些开关都是关的，乱订会 `PermissionDenied`。namespace 分隔符默认 `:`（`chat:room42` 用 `chat` 这份选项）。

History 默认 `history_size=0`（关闭）。`force_recovery` / `allow_recovery` 必须配合理的 size 与 TTL；客户端 history / recovery 拉取上限默认 300。单连接默认最多订 128 个 channel。

## 实践示例

### 案例 1：浏览器订一个房间

```js
import { Centrifuge } from "centrifuge"

const centrifuge = new Centrifuge("wss://centrifugo.example.com/connection/websocket", {
  token: "<JWT 由你的后端签发>",
})
const sub = centrifuge.newSubscription("chat:room42")
sub.on("publication", (ctx) => console.log(ctx.data))
sub.subscribe()
centrifuge.connect()
```

路径对应默认 WebSocket prefix。JWT 走 `client.token`；也可以单独开 `subscription_token`。没有 `allow_subscribe_*` 且 token 未授权该 channel 时，订阅会被拒。SDK 本身在独立仓，本页未绑定其 revision。

### 案例 2：后端 HTTP 发布

```python
import requests
requests.post(
    "http://centrifugo:8000/api/publish",
    headers={"X-API-Key": "your-api-key"},
    json={"channel": "chat:room42", "data": {"user": "Alice", "text": "你好"}},
)
```

一次 HTTP 调用由 Node 扇出到当前订阅者。多 channel 可用 `/api/broadcast`。生产也可开 gRPC API，但默认未监听。

### 案例 3：本地试玩必须显式 insecure

README 的 Docker 示例带 `--client.insecure --admin.enabled --admin.insecure`。这是本地试用开关：`client.insecure` 会放行匿名连接并在 subscribe 路径上 `ClientInsecure` 放行。日志会打 `INSECURE client mode`。生产应改 JWT 或 connect proxy，并给 HTTP API 配非空 key。

## 踩过的坑

1. **把 insecure 当成开箱默认**：三个 insecure 都是 opt-in。默认既不匿名乱连，也不允许随意 subscribe。
2. **以为 history 自动补包**：`history_size` 默认 0；recovery 依赖 history，窗口外的消息不会从 Centrifugo 找回来。
3. **把 Tarantool 写成现支持 broker**：固定 v6 的 `broker.type` 没有这一项。
4. **只开 WS 却按 SSE / WebTransport 文档连**：那些 handler 默认没注册。
5. **把未绑定的毫秒延迟、在线人数或 star 当容量证明**：本页没有运行或对照基准。

## 适用 vs 不适用场景

**适用**：

- 已有业务 HTTP/gRPC 后端，想把长连接和扇出拆到独立进程
- 能接受默认内存 engine，或显式改 Redis / NATS / Postgres broker
- 需要同一套 channel 语义，再按需打开 SSE / uni 传输

**不适用**：

- 必须持久、必达的业务事件——应先落自己的队列 / 数据库，再 publish
- 后端到后端的服务通信——不必绕浏览器用的实时网关
- 把未测延迟写成「一定低于 5ms」或「单机百万在线」

## 固定版本边界

- 本文绑定 `centrifugal/centrifugo@e108c4e8...`，lightweight tag `v6.9.3`。
- 客户端 SDK、`centrifuge` 库内部实现未单独固定页面。
- 未启动进程、未连 Redis / NATS / Postgres、未跑上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **长连接层和业务层是分开的进程合同**——后端 publish，Centrifugo 管连接。
2. **默认安全面是关的**：insecure、匿名订阅、history 都要显式打开。
3. **v6 的 broker 清单已经换过**——不要把旧笔记里的 Tarantool 抄进现配置。
4. **传输是按 flag 挂 mux 的**——文档里的 SSE / WebTransport 不是默认监听集。

## 应用型自测

1. 不设任何 insecure / allow_subscribe 标志时，匿名客户端能订 `chat:room42` 吗？
2. 默认 `engine.type` 是 Redis 吗？broker 还支持 Tarantool 吗？
3. HTTP API 只接受 `Authorization: apikey`，不认 `X-API-Key` 吗？

检查点：

1. 不能。默认订阅 ACL 拒绝；要 token.Subs、proxy、`allow_subscribe_*` 或 `client.insecure`。
2. 默认是 `memory`。本提交 `broker.type` 没有 Tarantool。
3. 不是。中间件先比 `X-API-Key`，再比 `Authorization: apikey`，再比 `api_key` 查询参数。

## 延伸阅读

- 文档：[centrifugal.dev](https://centrifugal.dev/)
- 固定源码：[centrifugal/centrifugo](https://github.com/centrifugal/centrifugo) —— 本文绑定提交 `e108c4e8f3b9f78d21663f985e754ef4d6908ed1`
- 审查记录：仓库内 `docs/caddy-centrifugo-source-review-20260827-fn.md`
- [[socket-io]] —— 嵌入业务进程的库，不是独立 server
- [[redis]] —— 水平扩展时的常见 broker

## 关联

- [[socket-io]] —— 库 vs 独立 server
- [[redis]] —— Redis engine / broker
- [[nats]] —— at-most-once broker 选项
- [[kafka]] —— consumers 可从 Kafka 吃命令；不是默认 broker
- [[envoy]] —— 常放在前面做 TLS

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[synapse]] —— Synapse — Matrix 协议的参考 homeserver，让聊天像电邮一样能跨服务器互通
