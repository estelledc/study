# RPC source review (writer BO)

> 用途：记录 gRPC-Go 与 Connect-ES 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：BO
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、网络请求、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- slug 选择：目标是 grpc + connect-es；仓库没有独立 `connect-es` / `protobuf` 页，因此绑定现有 `grpc-go` 与 `connect-rpc`，并把后者的 canonical 从 `connect-go` 改为用户指定的 `connect-es`
- 回避：未改 open PR 已占用的 `trpc` / `graphql-yoga` 及其他开放 slug

## gRPC-Go

- canonical source：`https://github.com/grpc/grpc-go`
- revision：`030ee8becb20ce4315d6bf2dfa26bdd876169dc4`
- module / tag：`google.golang.org/grpc@v1.83.2`
- `version.go`：`Version = "1.83.2"`
- `go.mod`：`go 1.25.0`
- inspected：
  - `go.mod`
  - `version.go`
  - `README.md`
  - `clientconn.go`
  - `dialoptions.go`
  - `server.go`
  - `stream.go`
  - `interceptor.go`
  - `keepalive/keepalive.go`
  - `credentials/insecure/insecure.go`
  - `examples/features/keepalive/client/main.go`
- observed：
  - `NewClient` 不执行 I/O，首次 RPC 或显式 `Connect` 才建连；`Dial` / `DialContext` 已 deprecated，且默认 scheme 为 `passthrough` 而非 `dns`；
  - 未设置 `TransportCredentials` 或 `CredsBundle` 时 `validateTransportCredentials` 返回错误，要求显式 `grpc.WithTransportCredentials(insecure.NewCredentials())`；
  - `WithInsecure()` 仍存在，但是对 `insecure.NewCredentials()` 的 deprecated 包装；
  - 客户端默认 `idleTimeout=30m`、`maxCallAttempts=5`、接收消息上限 4MiB；服务端默认接收上限 4MiB、`connectionTimeout=120s`；
  - keepalive：客户端 `Time` 低于 10s 会被抬到 10s；服务端 `EnforcementPolicy.MinTime` 默认 5 分钟，`PermitWithoutStream` 默认 false；
  - unary / stream interceptor 是独立挂钩，`Chain*` 才会按顺序叠加。

## Connect-ES

- canonical source：`https://github.com/connectrpc/connect-es`
- revision：`104238c58152e324ac16a99563f5eeea8ae7136d`
- packages：`@connectrpc/connect@2.1.2`、`@connectrpc/connect-web@2.1.2`、`@connectrpc/connect-node@2.1.2`
- npm `gitHead`：与 GitHub tag `v2.1.2` 一致
- inspected：
  - `package.json`
  - `MIGRATING.md`
  - `packages/connect/package.json`
  - `packages/connect/src/index.ts`
  - `packages/connect/src/promise-client.ts`
  - `packages/connect/src/router.ts`
  - `packages/connect/src/interceptor.ts`
  - `packages/connect/src/connect-error.ts`
  - `packages/connect-web/src/connect-transport.ts`
  - `packages/connect-web/package.json`
  - `packages/connect-node/package.json`
  - `packages/connect-node/src/index.ts`
  - `packages/connect-node/src/node-transport-options.ts`
  - `packages/connect-node/src/connect-node-adapter.ts`
  - `packages/connect-node/src/node-readme.spec.ts`
- observed：
  - v2 删除 `createPromiseClient` 与 `protoc-gen-connect-es`；客户端入口是 `createClient`，服务描述来自 Protobuf-ES 的 `*_pb`；
  - `createConnectRouter` 默认同时启用 Connect、gRPC、gRPC-Web，至少一个协议必须开启；
  - `connect-web` 的 `createConnectTransport` 默认 `useBinaryFormat=false`（JSON），`useHttpGet=false`；
  - `connect-node` 默认 `useBinaryFormat=true`，`engines.node` 为 `>=20`；
  - `MIGRATING.md` 写明 Connect v2 支持 Node `18.14.1+`，与 `connect-node` 的 `engines` 不一致，本文分别披露，不合并成单一运行时保证；
  - interceptor 数组末尾最先包裹实际 HTTP 调用；
  - 浏览器 fetch transport 文档与实现面向 unary / server-streaming；bidi 仍要求 HTTP/2。
