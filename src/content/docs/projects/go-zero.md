---
title: go-zero — 一份契约文件生成整套 Go 微服务
来源: 'https://github.com/zeromicro/go-zero'
日期: 2026-05-30
分类: backend-api
难度: 中级
---

## 是什么

**go-zero** 是一个 Go 微服务框架。它做两件事：把线上"防爆"的能力（超时、限流、熔断、过载丢请求）默认开起来；再配一把代码生成器 `goctl`，读一份契约文件就帮你把项目骨架敲完。

日常类比：像装了**安全气囊和 ABS 的汽车**——你不用记每次出门要不要打开，它默认在那儿。同时附送一个"4S 店流水线"，你画个图纸（`.api` 文件），整辆车的钢架就装好了，你只剩"把座椅塞进去"（业务逻辑）这一步。

写一行：

```
goctl api go -api greet.api -dir greet
```

go-zero 就给你生成一个 8888 端口能跑的 HTTP 服务，里面已经接好了限流、链路追踪、参数校验。你只要在 `logic/greetlogic.go` 里写"这个请求该返回啥"。

## 为什么重要

不理解 go-zero，下面这些事都不容易解释清楚：

- 为什么国内 Go 团队从单体切微服务时，常常第一个选它而不是 [[gin]] + 自己拼组件
- 为什么"代码生成"在微服务里这么重要——人手写 boilerplate 会漏掉熔断、忘加 metrics
- 为什么"默认弹性"和"按需启用弹性"是两种很不一样的工程文化
- 为什么和 [[kratos]]、go-kit 同样定位的框架，社区却分成三派

## 核心要点

go-zero 的设计可以拆成 **三块**：

1. **契约即源**：你写一份 `.api`（HTTP）或 `.proto`（RPC）文件描述接口，`goctl` 读它生成路由、handler、参数校验、客户端 SDK。类比：先画建筑图纸，再让机器去打地基；图纸改了重新生成，业务代码不动。

2. **默认弹性**：框架运行时自带四件套——**链式超时**（context 一路传到底）、**令牌桶限流**、**自适应熔断**（按错误率自己开关）、**过载降载**（CPU 高时主动丢请求）。类比：开车时安全气囊不需要你按按钮，撞了它自己弹。

3. **依赖注入靠 ServiceContext**：把 `Redis`、`MySQL`、配置都挂到一个叫 `ServiceContext` 的结构体上，每个 logic 函数都能拿到。类比：办公室里的"公共工具柜"，谁要扳手都从同一个柜子取，不需要每个工位自带。

## 实践案例

### 案例 1：一份 .api 文件生成整套 HTTP 服务

写 `greet.api`：

```
type Request {
  Name string `path:"name"`
}
type Response {
  Message string `json:"message"`
}
service greet-api {
  @handler GreetHandler
  get /greet/from/:name(Request) returns (Response)
}
```

跑 `goctl api go -api greet.api -dir greet`，得到约 15 个文件（路由、配置、handler、logic、types）。`logic/greetlogic.go` 留空给你写：

```go
func (l *GreetLogic) Greet(req *types.Request) (*types.Response, error) {
  return &types.Response{Message: "hello " + req.Name}, nil
}
```

`go run greet.go -f etc/greet-api.yaml` 起 8888 端口，参数校验和限流已经接上了。

### 案例 2：通过 ServiceContext 挂 Redis

在 `internal/svc/servicecontext.go` 里：

```go
type ServiceContext struct {
  Config config.Config
  Cache  *redis.Redis
}

func NewServiceContext(c config.Config) *ServiceContext {
  return &ServiceContext{
    Config: c,
    Cache:  redis.New(c.RedisHost),
  }
}
```

`logic` 里直接用 `l.svcCtx.Cache.Get(key)`。这样换 Redis 实现或加 MySQL 时，只改 ServiceContext 一处，所有 logic 都跟着拿到。

### 案例 3：一份 .proto 生成 RPC，再由 HTTP 调它

先写最小 `greet.proto`：

```protobuf
syntax = "proto3";
package greet;
message Request { string name = 1; }
message Response { string message = 1; }
service Greet { rpc Ping(Request) returns (Response); }
```

**逐步做**：

1. `goctl rpc protoc greet.proto --go_out=. --go-grpc_out=. --zrpc_out=.` 生成 RPC server 骨架与客户端。
2. 在生成的 `internal/logic` 里实现 `Ping`，返回 `"hello " + in.Name`。
3. HTTP 侧仍用案例 1 的 `.api`；在 `ServiceContext` 里挂上 RPC client，logic 里调用 `l.svcCtx.GreetRpc.Ping(...)`。

这样对外是 HTTP、对内是 RPC。生成代码默认可接 [[etcd]] 做服务发现；比手写 `grpc` + gateway + 中间件少很多样板，但要遵守“只改 logic”。

## 踩过的坑

1. **手挪生成文件再次 goctl 会冲突**：`goctl api go` 默认会重新生成 handler 和 routes，你如果手动改了文件名或目录，第二次跑会覆盖或重复。养成"只改 logic、不改骨架"的习惯。

2. **etc/*.yaml 不能丢，端口默认 8888 经常撞车**：第一次起服务大概率 `bind: address already in use`，因为本地另一个 go-zero demo 也在 8888；先改 yaml 的 `Port` 字段。

3. **默认限流阈值不一定适合你**：内置的令牌桶和自适应熔断阈值是按"典型 HTTP API"调的，长连接、大文件下载、低 QPS 后台任务用默认值容易被误杀，要在 `etc/*.yaml` 里覆盖 `MaxConns`、`Timeout`。

4. **.api 不是业界标准 IDL**：迁出 go-zero 时，`.api` 文件没法直接被别的工具吃，需要重写成 OpenAPI 或 protobuf。锁定风险比 [[kratos]] 大一点。

## 适用 vs 不适用场景

**适用**：

- 国内中小团队从 0 搭 Go 微服务，需要"开箱能跑"+"线上不出事"
- 团队成员对 Go 微服务最佳实践不熟，需要框架替他们做正确决策
- 接口契约稳定、变更不频繁的业务（电商订单、IM、社交流）

**不适用**：

- 极轻量的单体或 BFF——用 [[gin]] 就够了，go-zero 太重
- 需要高度自定义链路（gRPC interceptor 顺序、自定义降级策略）——go-kit 更灵活
- 多语言后端混合栈，已经在用 Spring Cloud / NestJS——硬塞 go-zero 不划算
- 强 IDL 标准化场景（跨公司、对外开放 API）——直接 protobuf + grpc-gateway 更通用

## 历史小故事（可跳过）

- **2018 年**：起源于一个国内团队从 Java + MongoDB 单体切 Go 微服务时，需要一套"新人来了能直接写业务"的脚手架，于是内部造了 go-zero。
- **2020 年 8 月**：开源到 GitHub，第一个 README 强调"七大件套：API/RPC/限流/熔断/降载/缓存/链路"。
- **2021—2022 年**：goctl 工具链快速迭代，加上 `.api` DSL 让中小团队上手成本骤降，star 数破万。
- **2023 年起**：和 [[kratos]]、go-kit 形成"国内 Go 微服务三大框架"格局，社区里讨论的不再是"该不该用框架"，而是"选哪一个"。

## 学到什么

1. **框架的价值不在功能多，而在默认值好**：go-zero 把线上常踩的坑变成默认开启，新人也不会忘记加熔断
2. **代码生成 > 库**：写一份契约让机器生成项目，比手写更不容易漏；改契约重新生成，业务代码可以不动
3. **依赖注入不需要 IoC 容器**：一个 ServiceContext 结构体加构造函数就能解决 Go 项目的依赖管理
4. **默认弹性是一种工程文化**：能不能"默认安全"取决于框架作者愿不愿意替使用者做决定

## 延伸阅读

- 官方文档：[go-zero.dev](https://go-zero.dev/)（中文齐全，按场景分章）
- 视频：[1 小时入门 go-zero](https://www.bilibili.com/video/BV1Eb4y1G7nv)（讲 .api → 跑起来全过程）
- 设计原型：[Google SRE Book — Handling Overload](https://sre.google/sre-book/handling-overload/)（go-zero 自适应熔断的思想来源）
- 同类对比：[[kratos]] —— B 站开源，更偏组件库化；[[gin]] —— 极简路由，没有内置弹性

## 关联

- [[gin]] —— 极简 HTTP 路由，go-zero 不用它，自己实现了一套但风格相近
- [[kratos]] —— 同代国内 Go 微服务框架，更模块化、不强代码生成
- [[etcd]] —— go-zero RPC 默认的服务发现后端
- [[redis]] —— ServiceContext 里最常挂的缓存依赖
- [[mysql]] —— 业务数据库，goctl model 能从 SQL 反向生成 model 代码
- [[prometheus]] —— 默认 metrics 暴露格式
- [[jaeger]] —— 默认链路追踪后端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dendrite]] —— Dendrite — Go 写的第二代 Matrix homeserver，组件可拆可合
- [[encore]] —— Encore — 类型安全 Go/TS 后端框架，基础设施即代码
- [[etcd]] —— etcd — 分布式键值数据库
- [[gin]] —— Gin — Go 写 web API 的事实标准框架
- [[gqlgen]] —— gqlgen — Go 用 schema 先写好再让编译器生成 GraphQL server
- [[grpc-go]] —— gRPC-Go — Google RPC 框架的官方 Go 实现
- [[kratos]] —— kratos — Go 微服务一锅出 HTTP 和 gRPC 两份服务
- [[mysql]] —— MySQL — 全球最流行关系数据库
- [[prometheus]] —— Prometheus — 时序监控系统
- [[redis]] —— Redis — 内存键值数据库

