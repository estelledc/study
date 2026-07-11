---
title: ConnectRPC — 让 gRPC 在浏览器里裸跑的 RPC 协议
来源: 'https://github.com/connectrpc/connect-go'
日期: 2026-05-30
分类: 后端 / RPC 框架
难度: 中级
---

## 是什么

**ConnectRPC** 是 Buf 团队推出的开源 RPC 库——同一份 `.proto` 接口文件，能同时被浏览器、移动端、和老的 gRPC 客户端调用，**不需要 grpc-web 那套额外的代理转协议**。日常类比：像一个会三种语言的接待员——客人用普通话（HTTP/JSON）、广东话（gRPC-Web）还是英语（gRPC over HTTP/2）说话，他都能听懂同一个意思，不用先把客人送进翻译室再带出来。

你写一份 `.proto`：

```proto
service Greeter {
  rpc SayHello (HelloRequest) returns (HelloReply);
}
```

跑 `protoc-gen-connect-go` 生成代码后，**同一个 server 二进制**接受三种协议的请求；浏览器端直接 `fetch('/greet.v1.GreeterService/SayHello', {body: JSON.stringify(...)})` 就能调，连特殊客户端库都可以不用。

## 为什么重要

不理解 Connect，下面这些事都没法解释：

- 为什么有了 gRPC，还要再造一个 RPC 协议——因为 gRPC 强依赖 HTTP/2，**浏览器原生 fetch / XHR 跑不了 gRPC**
- 为什么不用 grpc-web 就够了——grpc-web 需要单独跑一个 Envoy 代理把浏览器请求转成 gRPC，部署一套两份运维
- 为什么 curl 一行就能调 Connect 服务——它是普通的 HTTP POST + JSON，跟 REST 一样能 grep 日志、能 Postman 调试
- 为什么很多 Go 项目从 grpc-go 平迁到 connect-go——server 兼容旧 gRPC 客户端，新增浏览器路径，**老路不断**

## 核心要点

Connect 的设计可以拆成 **三件事**：

1. **三协议同口**：一个 server 监听一个端口，按请求 `Content-Type` 自动分流——`application/grpc` 走 gRPC、`application/grpc-web` 走 gRPC-Web、`application/connect+json` 走 Connect 自己的协议。类比：餐厅只有一扇门，进来的人是堂食 / 外卖 / 自助，门口接待员一眼分流。

2. **Connect 协议本身**：跑在 HTTP/1.1 上的简化 RPC——请求方法走 `POST /service.Method`，body 是 Protobuf 二进制或 JSON，错误用 HTTP 状态码 + JSON 错误体。**没有 HTTP/2 trailer 那一套**，所以浏览器、curl、Cloudflare Worker 都能直接发。

3. **统一 SDK**：Go / TypeScript / Swift / Kotlin 共用同一份 schema 生成代码，调用姿势在四种语言里高度一致。类比：四种语言的 SDK 像四份翻译本，源头是同一份 `.proto` 合同。

中间还有一层 **interceptor**（拦截器），跟 gRPC-Go 一样可以插日志 / 鉴权 / 重试，迁移成本低。

## 实践案例

### 案例 1：Go 后端 + curl 调试

```go
mux := http.NewServeMux()
path, handler := greetv1connect.NewGreeterHandler(&Server{})
mux.Handle(path, handler)
http.ListenAndServe(":8080", h2c.NewHandler(mux, &http2.Server{}))
```

调试时直接 curl，**不用任何 RPC 工具**：

```bash
curl -X POST -H "Content-Type: application/json" \
  --data '{"name":"world"}' \
  http://localhost:8080/greet.v1.GreeterService/SayHello
```

返回普通 JSON。换成 grpc-go 就要 `grpcurl` 才能调。

### 案例 2：浏览器端零代理直连

```ts
import { createPromiseClient } from "@connectrpc/connect"
import { createConnectTransport } from "@connectrpc/connect-web"
import { GreeterService } from "./gen/greet_connect"

const client = createPromiseClient(GreeterService,
  createConnectTransport({ baseUrl: "/api" })
)
const res = await client.sayHello({ name: "world" })
```

浏览器到后端走的是普通 HTTP/1.1，**没有中间 proxy**。同样的代码换成 grpc-web 必须先部署一个 Envoy。

### 案例 3：从 grpc-go 渐进迁移

老服务 server 用的是 `grpc.NewServer()`，客户端散布全公司。改 server：

```go
// 同一个 mux 同时挂 connect handler 和 grpc handler
mux := http.NewServeMux()
mux.Handle(greetv1connect.NewGreeterHandler(svc))    // connect / grpc-web
grpcServer := grpc.NewServer()
pb.RegisterGreeterServer(grpcServer, svc)            // 老 grpc 客户端
// 用 cmux 或 h2c handler 同时承接两路
```

旧客户端**完全无感**，浏览器路径多出来一条，**不用同时维护两份服务实现**。

## 踩过的坑

1. **`http.ListenAndServe` 不能直接上生产**：默认 server 没超时、连接池随便、没 trace。文档明确说 "not fit for production"——必须自己装 `ReadHeaderTimeout` / `IdleTimeout` / OpenTelemetry interceptor 才能上线。

2. **streaming 仍要 HTTP/2**：Connect 单元调用走 HTTP/1.1 没问题，但 server-streaming / client-streaming / bidi 需要 HTTP/2 才能稳定，浏览器更只能拿到 server-streaming 一种。所以"Connect = HTTP/1.1"是单元 RPC 才成立，**streaming 没省掉 HTTP/2**。

3. **JSON / Protobuf 默认值不同**：connect-go 默认走 Protobuf 二进制，curl 调试要显式 `Content-Type: application/json`；不指定就拿到一堆乱码。新人容易以为服务挂了。

4. **多语言 SDK 版本对齐**：`protoc-gen-connect-go` v1.16 和 `@connectrpc/connect-es` v1.4 都各自演进，trailer 处理偶有兼容性 bug。生产环境**必须把生成器版本和运行时版本钉死在 monorepo 里**。

## 适用 vs 不适用场景

**适用**：
- 同一份 schema 同时服务后端 + Web + 移动（省掉 OpenAPI / GraphQL 两套）
- 已有 gRPC 服务，想加浏览器路径但不想跑 grpc-web proxy
- 调试 / 灰度 / 抓包以日志友好为先（需要 curl / Postman / grep 日志）
- 单元 RPC 占绝对主导，streaming 偶尔用

**不适用**：
- 重度 streaming 场景（推送、双向语音）→ 直接用 gRPC over HTTP/2 更省心
- 性能极限（百万 QPS、单字节都要省）→ 原生 gRPC + HTTP/2 比 Connect JSON 路径快
- 生态完全没有 Protobuf 工具链 → REST + OpenAPI 学习曲线低很多

## 历史小故事（可跳过）

- **2020 年**：Buf（前 Uber 工程师创立）做 Protobuf 工具链，发现 grpc-web 太复杂、文档少、调试痛苦
- **2022 年 8 月**：Buf 开源 connect-go + Connect 协议规范，主打 "gRPC + HTTP + 浏览器三合一"
- **2023 年**：陆续放出 connect-es（TypeScript）、connect-swift、connect-kotlin
- **2024 年**：项目捐给 CNCF Sandbox，标志获得云原生社区背书

至此 RPC 协议生态从"gRPC vs grpc-web"两极变成"gRPC / Connect / REST"三极并存。

## 学到什么

1. **协议简化是工程胜负手**——Connect 没发明新东西，只是把 gRPC 的 HTTP/2 强依赖去掉、trailer 改 JSON、流变可选；就解决了"浏览器调 gRPC 难"
2. **三协议同口路由**是降低迁移成本的范式——老客户端不用改，新客户端走新路，**老路不断是迁移成功的关键**
3. **schema 单一来源**比"REST 还是 RPC"之争更值得追求——`.proto` 一份，多端共享类型，比维护两套（OpenAPI + Protobuf）更可持续
4. **生产化默认配置**永远是开源库的第一坑——`http.ListenAndServe` 这种 demo 写法不能直接上线，把超时 / observability / 连接池写进 README 才负责
5. **兼容性比新颖性更值钱**——Connect 选择主动兼容 gRPC，而不是另起炉灶；这让它有条件吃下既有 gRPC 用户基数，而不是从零做用户教育

## 延伸阅读

- 官方主页：[connectrpc.com](https://connectrpc.com/)（含 Go / TS / Swift / Kotlin 各语言入门）
- 协议规范：[Connect Protocol Reference](https://connectrpc.com/docs/protocol)（一页讲完线协议）
- 设计动机：[Buf 原始博客 — Connect: A better gRPC](https://buf.build/blog/connect-a-better-grpc)
- 视频教程：[Connect: gRPC 的轻量替代品](https://www.youtube.com/results?search_query=connect+rpc+buf)（主分享会录像）
- 同类对比：grpc-web 官方仓库 README（看 grpc-web 路径有多复杂就懂 Connect 在解什么痛）
- [[grpc-go]] —— Connect 兼容的老协议，理解它能更快理解 Connect 在做什么减法
- [[http-2]] —— gRPC 强依赖 HTTP/2，Connect 把这个依赖打散

## 关联

- [[grpc-go]] —— 同一团队消费的对象，Connect 服务能直接被 grpc-go 客户端调用
- [[http-2]] —— gRPC 必需，Connect 单元调用不需要，streaming 仍需要
- [[fastapi]] —— 同样以 schema 优先（Pydantic）但走 OpenAPI/REST 路线，对比可见 RPC 派思路差异
- [[fastify]] —— Node 的 schema-first 框架，对比可见 schema 单源思想在 REST 阵营也有
- [[axum]] —— Rust 的 web 框架，思路是 handler-first 而非 schema-first，对比可见两派工程哲学
- [[trpc]] —— TypeScript 的"端到端类型推导"RPC，思路最接近 Connect 但限定 TS 全栈

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apollo-server]] —— Apollo Server — Node 端 GraphQL 服务端的事实标准
- [[capnproto]] —— Capn Proto — 数据布局即 wire format 的零拷贝序列化 + RPC
- [[graphql-yoga]] —— GraphQL Yoga — 跨运行时的轻量 GraphQL 服务器
- [[thrift]] —— Thrift — 写一份 IDL 自动生成 28 种语言的 RPC 代码
- [[trpc]] —— tRPC — TS 端到端类型安全 RPC
- [[twirp]] —— Twirp — 用 protobuf 定义服务，但只走 HTTP/1.1 + JSON
