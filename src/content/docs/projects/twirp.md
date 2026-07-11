---
title: Twirp — 用 protobuf 定义服务，但只走 HTTP/1.1 + JSON
来源: 'https://github.com/twitchtv/twirp'
日期: 2026-05-30
分类: backend-api
难度: 初级
---

## 是什么

Twirp 是 Twitch 2018 年开源的**轻量 RPC 框架**：你写一份 `.proto` 文件定义服务，Twirp 替你生成 server / client 代码——但传输层**退回普通 HTTP/1.1 + JSON 或二进制 protobuf**，不强制 HTTP/2，不上流式。

日常类比：像快递。gRPC 是专用冷链货车（HTTP/2，性能上限高，但需要专用车队和专用站点）。Twirp 是用普通快递柜（HTTP/1.1）寄一个**贴了标准条码的包裹**（protobuf 定义）——任何能拆普通快递的人都能收（curl / 浏览器 fetch / 普通 nginx 代理），代价是不能走冷链（没 streaming）。

写一份 `.proto`：

```proto
service Haberdasher {
  rpc MakeHat(Size) returns (Hat);
}
```

跑 `protoc --twirp_out=. haberdasher.proto`，生成 Go 代码。客户端用 `curl` 都能直接打：`curl -X POST -H "Content-Type: application/json" -d '{"inches":12}' http://localhost:8080/twirp/haberdasher.Haberdasher/MakeHat`。

## 为什么重要

不理解 Twirp 这套思路，下面这些事都没法解释：

- 为什么有了 gRPC 还要再造一个 RPC 框架——HTTP/2 + 自定义传输让代理、CDN、浏览器原生支持都得改
- 为什么 protobuf 服务定义 ≠ 必须用 HTTP/2——契约和传输是两件事，可以拆开
- 为什么后来的 Connect-RPC（Buf 团队）跟 Twirp 思路高度相似——简化派的延续
- 为什么大公司内部经常自造"轻量 RPC"——gRPC 全套对中等规模团队偏重

## 核心要点

Twirp 做减法的三个关键决定：

1. **传输回退到 HTTP/1.1**：丢掉 HTTP/2 强制，跑在 Go 标准库 `net/http` server 上。类比：放弃专车换标准货柜——所有现成基础设施（nginx / ELB / CDN / 浏览器）都能直接用。

2. **payload 双模式：JSON 或 binary protobuf**：调试时人看得懂（JSON），生产里要省字节就切 protobuf。类比：包裹里装的还是同一件商品，但你可以选纸盒（JSON）或真空压缩袋（protobuf），只换 `Content-Type` 头。

3. **路由用约定**：所有请求都打 `POST /twirp/<package>.<Service>/<Method>`。没有元数据头、没有 streaming、没有 trailer。类比：所有快递都从同一扇门进，门牌号写清楚就行。

三件加起来：契约（.proto）保留，复杂度（HTTP/2 / streaming）砍掉。

## 实践案例

### 案例 1：最小服务定义

写 `service.proto`：

```proto
syntax = "proto3";
package example;
service Echo {
  rpc Say(Msg) returns (Msg);
}
message Msg { string text = 1; }
```

跑 `protoc --go_out=. --twirp_out=. service.proto`，生成 `service.twirp.go`。Go 实现：

```go
type echoSrv struct{}
func (e *echoSrv) Say(ctx context.Context, m *Msg) (*Msg, error) {
  return &Msg{Text: "echo: " + m.Text}, nil
}
http.ListenAndServe(":8080", NewEchoServer(&echoSrv{}, nil))
```

10 行就跑起来了——没有 grpc.Server、没有 TLS 配置、没有 keepalive 调参。

### 案例 2：curl 直接调（Twirp 的招牌优势）

服务起在 8080，客户端不写代码：

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"text":"hello"}' \
  http://localhost:8080/twirp/example.Echo/Say
# {"text":"echo: hello"}
```

gRPC 对应做法要装 `grpcurl` 还得提供 `.proto` 反射。Twirp 路径写明，Body 是 JSON——和调一个普通 REST API 没区别。

### 案例 3：切到二进制模式省带宽

生产环境同一个 server 不动，客户端改 header：

```bash
curl -X POST \
  -H "Content-Type: application/protobuf" \
  --data-binary @msg.bin \
  http://localhost:8080/twirp/example.Echo/Say
```

服务端按 Content-Type 自动选解码器——同一个 endpoint，调试用 JSON，跑量用 protobuf。

## 踩过的坑

1. **没 streaming**：只支持一发一收（unary RPC）。要做实时推送、长连接、大文件分块上传，必须另起 WebSocket / SSE / 普通 HTTP——别想着 Twirp 一把梭。

2. **JSON 模式 vs protobuf 模式行为不完全一致**：JSON 下 unknown field 默认丢、enum 大小写敏感、int64 在 JS 端会溢出（要传字符串）。两种模式都跑一遍 e2e 测试是必须。

3. **错误码体系是 Twirp 自定义**：有自己的 ErrorCode 枚举（`invalid_argument` / `not_found` / `internal` 等），跟 gRPC status code 不直接互通。前端如果同时调 Twirp 和 gRPC 服务，得写错误转译胶水。

4. **客户端语言生态偏 Go/Python**：官方主推这两个，Ruby / JS / Java 靠社区实现，质量参差。跨语言团队选型前先确认目标语言的 plugin 维护活跃度。

## 适用 vs 不适用场景

**适用**：

- 团队已经在用 protobuf，想保留契约但减负——不想吃 HTTP/2 全套
- 服务前面有 nginx / ELB / CDN，需要标准 HTTP/1.1 兼容
- 微服务之间调用以 unary RPC 为主（一发一收），不需要双向流
- 调试友好优先于极致性能（curl 即可联调，省得开 grpcurl）

**不适用**：

- 需要 streaming / server-push / 双向通道——必须 gRPC 或 WebSocket
- 极致低延迟 / 高吞吐场景，HTTP/2 多路复用 + 头压缩的优势用得上
- 客户端是浏览器且要从代码生成 client——直接看 `[[connect-rpc]]`，它专门补了浏览器
- 团队没用 protobuf——上 Twirp 反而比直接写 REST + OpenAPI 重

## 历史小故事（可跳过）

- **2017 年内部**：Twitch 工程团队用 gRPC 一段时间，发现 HTTP/2 强制让运维、调试、负载均衡 都得重新搞一套——内部工具链不顺手
- **2018 年 1 月**：Twitch 在博客发布 Twirp 1.0，开源到 `github.com/twitchtv/twirp`。设计原则就一句："像 gRPC 但只走 HTTP/1.1，curl 能调"
- **2018-2020**：Twitch 内部高流量服务大规模迁移，社区也有公司跟进——但热度不如 gRPC
- **2023 年**：Buf 团队发布 Connect-RPC，思路一脉相承（protobuf + HTTP/1.1 友好）但补回了浏览器、streaming——可以视作 Twirp 思想的下一代
- **现在**：Twirp 仍在维护（v8），主要用户是 Go 生态中等规模团队

## 学到什么

1. **契约和传输是两件事**——protobuf 定义不必绑死 HTTP/2，可以独立选传输
2. **简化派的设计哲学**：减掉 streaming + HTTP/2 换来 curl 友好 + 标准基础设施兼容，对中等规模团队是好交易
3. **生态先行**：Twirp 的客户端语言覆盖不如 gRPC 广，选型先看你团队语言栈
4. **简化的代价**：丢掉 streaming 不可逆——业务需求一旦演化到要长连接，就得加另一套机制

## 延伸阅读

- 官方文档：[twitchtv.github.io/twirp](https://twitchtv.github.io/twirp/) （Getting Started + 示例）
- 发布博客：[Twirp: a sweet new RPC framework for Go (2018)](https://blog.twitch.tv/en/2018/01/16/twirp-a-sweet-new-rpc-framework-for-go-5f2febbf35f/)
- [[grpc-go]] —— Twirp 的对照组，理解 Twirp 砍了什么
- [[connect-rpc]] —— 思想继任者，补了浏览器和 streaming
- [[http-2]] —— Twirp 故意不用的传输层

## 关联

- [[grpc-go]] —— 都是 protobuf RPC，但 gRPC 走 HTTP/2 + streaming，Twirp 走 HTTP/1.1
- [[connect-rpc]] —— Buf 出品的 Twirp 思想继任者，补回浏览器支持
- [[http-2]] —— Twirp 故意绕开的传输层，理解二者差异需先懂这层
- [[trpc]] —— 同样追求"轻量 RPC"，但走 TypeScript 端到端类型而非 protobuf
- [[fastify]] —— 标准 HTTP 框架的代表，Twirp server 跑在类似的"裸 HTTP"层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
