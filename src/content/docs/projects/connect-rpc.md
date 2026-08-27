---
title: ConnectRPC — TypeScript 实现（connect-es）
来源: https://github.com/connectrpc/connect-es
日期: 2026-05-30
分类: 后端 / RPC 框架
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/connectrpc/connect-es
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 104238c58152e324ac16a99563f5eeea8ae7136d
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.1.2
---

## 是什么

Connect-ES 是 ConnectRPC 的 TypeScript 实现。日常类比：还是那份 `.proto` 合同，但接待员改讲三种 HTTP 方言——Connect（普通 POST / 可选 JSON）、gRPC-Web、gRPC。浏览器可以用 fetch 直接打，不必先架一层 grpc-web 代理。

固定 2.1.2 的核心包是 `@connectrpc/connect`。浏览器传输在 `@connectrpc/connect-web`，Node 传输和 adapter 在 `@connectrpc/connect-node`。npm `gitHead` 与 GitHub tag `v2.1.2` 都指向同一提交。

你不再从 `*_connect.ts` 生成客户端：v2 删掉了 `protoc-gen-connect-es`，服务描述来自 Protobuf-ES 的 `*_pb`。

## 为什么重要

不理解 v2 合同，旧例子会直接编译失败：

- 为什么 `createPromiseClient` 已经不存在
- 为什么 `import { Greeter } from "./gen/greet_connect"` 对不上生成物
- 为什么浏览器默认拿到 JSON，Node 默认却是二进制 protobuf
- 为什么“一个 server 三种协议”是 router 默认值，不是额外插件

## 核心要点

1. **客户端入口是 `createClient(service, transport)`**：`index.ts` 从 `promise-client.ts` 导出它。按 `methodKind` 分成 unary / server_streaming / client_streaming / bidi_streaming，分别返回 `Promise` 或 `AsyncIterable`。

2. **Router 默认三协议**：`createConnectRouter()` 里 `grpc`、`grpcWeb`、`connect` 只要不是显式 `false` 就会注册。三个都关会抛 `ConnectError`（`invalid_argument`）。Node 侧用 `connectNodeAdapter({ routes })` 把 router 接到 `http` / `http2`。

3. **传输默认值按运行时分叉**：`connect-web` 的 `createConnectTransport` 默认 `useBinaryFormat = false`（JSON），`useHttpGet = false`。`connect-node` 的默认是 `useBinaryFormat ?? true`。调试时不要用浏览器的默认去猜 Node。

4. **Interceptor 是洋葱，数组末尾最先执行**：类型是 `(next) => (req) => ...`。请求从外到内，真正的 HTTP 调用在最里层。

5. **错误带 Code**：`ConnectError` 把 status code 前缀进 `message`，并保留 `metadata` 与 protobuf `details`。不能把它当成普通 `Error.message` 字符串比较。

## 实践示例

### 案例 1：浏览器 unary，走默认 JSON

```ts
import { createClient } from "@connectrpc/connect"
import { createConnectTransport } from "@connectrpc/connect-web"
import { ElizaService } from "./gen/connectrpc/eliza/v1/eliza_pb"

const client = createClient(
  ElizaService,
  createConnectTransport({ baseUrl: "/api" }),
)
const { sentence } = await client.say({ sentence: "hello" })
```

这是 v2 合同：服务来自 `*_pb`，客户端是 `createClient`。旧页里的 `createPromiseClient` 与 `@connectrpc/connect-web` 的 `createPromiseClient` 导入在 2.1.2 不存在。未设 `useBinaryFormat` 时，web transport 走 JSON。

### 案例 2：Node 上同时接三种协议

```ts
import * as http2 from "node:http2"
import type { ConnectRouter } from "@connectrpc/connect"
import { connectNodeAdapter } from "@connectrpc/connect-node"
import { ElizaService } from "./gen/connectrpc/eliza/v1/eliza_pb"

function routes(router: ConnectRouter) {
  router.rpc(ElizaService.method.say, async (req) => ({
    sentence: `you said: ${req.sentence}`,
  }))
}

http2.createServer(connectNodeAdapter({ routes })).listen(8080)
```

未关闭任何协议时，同一 handler 可被 Connect、gRPC-Web 和 gRPC 客户端调用。`router.service(svc, impl)` 若漏实现某个方法，router 会补一个 `unimplemented` 错误处理，而不是悄悄 404。

### 案例 3：curl 打 Connect JSON，不必上 grpcurl

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  --data '{"sentence":"hello"}' \
  http://localhost:8080/connectrpc.eliza.v1.ElizaService/Say
```

这只覆盖 Connect + JSON 路径。Node 客户端默认二进制；web 客户端默认 JSON。同一服务、两种默认，日志里看到“乱码”往往是 Content-Type 不匹配，不是服务挂了。

## 踩过的坑

1. **继续用 v1 生成器**：`protoc-gen-connect-es` 已删除。生成物应来自 `protoc-gen-es` / `@bufbuild/protoc-gen-es`，导入 `*_pb`。

2. **把 web 默认当成全平台默认**：浏览器 JSON，Node 二进制。给 Node 客户端写 curl 对照时必须显式改 `useBinaryFormat` 或改请求头。

3. **以为 GET 会自动开启**：`useHttpGet` 默认 false，且只对声明为无副作用的方法生效。

4. **把 Node 版本读成单一数字**：`MIGRATING.md` 写 Connect v2 支持 Node **18.14.1+**；`@connectrpc/connect-node` 的 `engines.node` 是 `>=20`。部署前按你实际引用的包读，不要把两行合成“官方最低 18”。

5. **在浏览器里假设 bidi 可用**：web transport 注释写明面向 unary 与 server-streaming。双向流仍要 HTTP/2，浏览器能力不能从“Connect 能跑在 HTTP/1.1”推出来。

## 适用 vs 不适用场景

**适用**：

- 一份 Protobuf 契约同时给 Web、Node 和现有 gRPC 客户端
- 需要 curl / 普通 HTTP 调试的单元 RPC
- 已迁移到 Protobuf-ES v2 的 TypeScript 仓库

**不适用**：

- 还停在 Connect-ES v1 生成物（`*_connect.ts` + `createPromiseClient`）且不打算跑 `connect-migrate`
- 重度浏览器双向流——先确认传输与运行时，而不是只换 SDK 名字
- 没有 Protobuf 工具链、只想手写 JSON REST

## 固定版本边界

- 本文绑定 `connectrpc/connect-es@104238c58152e324ac16a99563f5eeea8ae7136d`。
- npm：`@connectrpc/connect@2.1.2` 的 `gitHead` 与该提交一致；`connect-web` / `connect-node` 同版本。
- peer：`@bufbuild/protobuf ^2.7.0`。
- slug 仍是既有 `connect-rpc`；canonical 从旧的 `connect-go` 改为本次指定的 `connect-es`。Go 实现不在本页证据范围内。
- 本文未安装依赖、未跑 Jasmine / conformance、未发网络请求，状态保持 `UNVERIFIED`。

## 学到什么

1. **协议默认开启，运行时默认分叉**——三协议是 router 的默认；JSON/二进制却按 web/Node 分开。
2. **v2 把代码生成交还给 Protobuf-ES**——少一个插件，换来必须改导入和客户端工厂。
3. **Interceptor 顺序与 gRPC-Go 的 Chain 不同**——这里是数组末尾最先包到 HTTP。
4. **浏览器友好不等于四种 stream 都友好**——HTTP/1.1 只稳住单元路径。

## 应用型自测

1. 在 2.1.2 里 `createPromiseClient(ElizaService, transport)` 还能用吗？
2. `createConnectTransport({ baseUrl })` 在浏览器里默认发 protobuf 二进制吗？
3. `createConnectRouter({ grpc: false, grpcWeb: false, connect: false })` 会得到空 router 还是抛错？

检查点：

1. 不能。该函数已删除，应改 `createClient`。
2. 不会。web 默认 `useBinaryFormat=false`。
3. 抛 `ConnectError`：至少一个协议必须启用。

## 延伸阅读

- 固定源码：[connectrpc/connect-es](https://github.com/connectrpc/connect-es) —— 本文绑定提交 `104238c58152e324ac16a99563f5eeea8ae7136d`
- 协议说明：[Connect Protocol](https://connectrpc.com/docs/protocol)
- 迁移说明：仓库内 `MIGRATING.md`（v1 → v2）
- [[grpc-go]] —— 官方 Go 实现，默认 HTTP/2 + 显式凭据
- [[twirp]] —— 更早的 protobuf-over-HTTP 思路，没有三协议同口

## 关联

- [[grpc-go]] —— 同一契约的 Go / HTTP/2 实现；Connect router 默认仍接待 gRPC 客户端
- [[twirp]] —— HTTP/1.1 + protobuf/JSON，但没有 gRPC 兼容层
- [[trpc]] —— TypeScript 端到端类型 RPC，契约来自 TS 而不是 `.proto`
- [[fastify]] —— `@connectrpc/connect-fastify` 可把 router 挂上去，框架本身不是 RPC 运行时

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apollo-server]] —— Apollo Server — Node 端 GraphQL 服务端的事实标准
- [[capnproto]] —— Capn Proto — 数据布局即 wire format 的零拷贝序列化 + RPC
- [[graphql-yoga]] —— GraphQL Yoga — 跨运行时的轻量 GraphQL 服务器
- [[thrift]] —— Thrift — 写一份 IDL 自动生成 28 种语言的 RPC 代码
- [[trpc]] —— tRPC — TS 端到端类型安全 RPC
- [[twirp]] —— Twirp — 用 protobuf 定义服务，但只走 HTTP/1.1 + JSON
