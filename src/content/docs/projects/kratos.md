---
title: kratos — Go 微服务一锅出 HTTP 和 gRPC 两份服务
来源: 'https://github.com/go-kratos/kratos'
日期: 2026-05-30
子分类: Web 后端
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

kratos 是一个 Go 语言的**微服务框架**——你写一份业务逻辑，它同时给你生成 HTTP（给手机 App / 浏览器调）和 gRPC（给别的微服务调）两套服务。日常类比：像一家餐厅同一份菜谱，既能做堂食（HTTP/JSON 容易看懂）又能做外卖（gRPC/Protobuf 打包紧凑），不用厨师写两份。

先把两个新词说清楚：**gRPC** = 谷歌做的二进制 RPC（远程调用）协议，服务间互调首选；**Protobuf** = 用 `.proto` 文件描述接口的紧凑数据格式，比 JSON 小一半。类比的局限是：HTTP 和 gRPC 性能、调试体验差不少，类比里两份菜成本一样，实际两套服务的运行成本不一样。

它是 Go 中文社区最常用的微服务框架之一（GitHub 24k+ star），把过去要自己拼的几样东西打包到一起：服务注册发现、配置中心、中间件、日志、链路追踪、错误码。

```bash
kratos new helloworld   # 一行命令生成项目骨架
cd helloworld && kratos run
# :8000 HTTP 和 :9000 gRPC 同时跑起来
```

这套思路核心是 **API 优先**：你先写一份 `.proto` 文件描述接口（参数、返回、错误码），CLI 工具自动把骨架代码生成出来，剩下你只填业务逻辑。HTTP/JSON 还是 gRPC/Protobuf 都是从这份 proto 派生的。

## 为什么重要

不理解 kratos，下面这些事都没法解释：

- 为什么写一份 `.proto` 文件就能同时跑 HTTP 和 gRPC，不用自己写两套 handler
- 为什么 Go 微服务框架那么多（gin / echo / chi / fiber / go-zero / hertz），还需要 kratos 这一个
- 为什么有的中间件（鉴权、限流）写一次两边都生效，有的（CORS）就只能写在 HTTP 一侧
- 为什么 v2 升 v3 不是改个 import 路径就行，要逐处审 New() 调用

## 核心要点

kratos 把"微服务一堆套件"拆成 **三层抽象**：

1. **Transport 层**——HTTP Server 和 gRPC Server 都包成同一个 `app.Server` 接口。类比：插座面板，HTTP 和 gRPC 都是"插头"，业务逻辑只认面板不认插头形状。

2. **Service 层（CLI 生成）**——CLI 工具读你的 `.proto` 文件，调 protoc 生成 service 接口骨架；你只填业务实现，HTTP 和 gRPC 的路由解析它都帮你写好。

3. **可插拔组件**——注册中心（etcd / consul / nacos）、配置中心、日志后端都是接口，运行时决定用哪个。类比：电脑的 USB 口，鼠标键盘 U 盘随便插。

三层加起来，一个项目要做的事是：定义 proto → CLI 生成骨架 → 填业务 → 选组件接线。

## 实践案例

### 案例 1：用 CLI 生成第一个项目

```bash
go install github.com/go-kratos/kratos/cmd/kratos/v2@latest
kratos new helloworld
cd helloworld
go mod tidy
kratos run
```

跑起来看终端，会同时打两行：`HTTP 服务启动 :8000` 和 `gRPC 服务启动 :9000`。
打开 `cmd/helloworld/main.go` 你能看到三个东西：`httpSrv` / `grpcSrv` 各创建一次，最后 `kratos.New(kratos.Server(httpSrv, grpcSrv))` 把它们一起塞进同一个 app。两个端口、一份业务，靠的就是 Transport 抽象。

目录结构里 `api/`（proto 定义）/ `internal/biz`（业务核心）/ `internal/data`（数据访问）/ `internal/service`（接口实现）的分层，是 kratos 推荐的约定，照着填能省下纠结"代码放哪"的时间。

注意：`kratos run` 自身不依赖 protoc，但**案例 2** 用到的 `kratos proto add` 会调 protoc 生成代码，要先 `go install` 四个插件：`protoc-gen-go` / `protoc-gen-go-grpc` / `protoc-gen-go-http` / `protoc-gen-openapi`。第一次跑前装好，案例 2 才不会报 `program not found`。

### 案例 2：定义一份 proto，两套服务自动出来

```bash
kratos proto add api/helloworld/helloworld.proto
# 编辑 proto 加一个 GetUser rpc
kratos proto server api/helloworld/helloworld.proto -t internal/service
```

`internal/service/helloworld.go` 里会冒出一个 `GetUser(ctx, *GetUserRequest) (*GetUserReply, error)` 方法骨架。你只填里面的查数据库逻辑，剩下的事——HTTP 路由 `/v1/users/{id}`、gRPC 方法 `helloworld.Greeter/GetUser`——CLI 都生成了。一份业务实现，两套客户端都能调。

```protobuf
// api/helloworld/helloworld.proto 片段
service Greeter {
  rpc GetUser (GetUserRequest) returns (GetUserReply) {
    option (google.api.http) = { get: "/v1/users/{id}" };
  }
}
```

`google.api.http` 那行注解是关键：它告诉 CLI"这个 rpc 同时暴露成 GET /v1/users/{id}"。没这行就只生成 gRPC，加上就两套都出。

### 案例 3：写一个中间件，HTTP 和 gRPC 都生效

```go
import "github.com/go-kratos/kratos/v2/log"
import "github.com/go-kratos/kratos/v2/middleware/logging"

logger := log.NewStdLogger(os.Stdout)   // 用标准库 stdout 当日志后端
app := kratos.New(
    kratos.Name("helloworld"),
    kratos.Server(httpSrv, grpcSrv),
)
// 给两个 server 都装上日志中间件
httpSrv.Use(logging.Server(logger))
grpcSrv.Use(logging.Server(logger))
```

调用 HTTP 接口和 gRPC 接口，日志里都能看到 `trace_id`（trace_id = 一次请求穿过多个微服务时，用于把所有日志串起来的唯一标识，类似快递单号）。同一个中间件函数（来自 `middleware/logging`）对两边都生效——这就是 Transport 抽象的好处，不用为 HTTP 和 gRPC 分别写两个版本。

中间件本身签名是 `func(Handler) Handler`，Handler 收 `ctx` 和 `req`、返 `reply, error`，HTTP 和 gRPC 都被框架包成这个统一形态后再喂给中间件。所以鉴权 / 限流 / 链路追踪只写一次。

## 踩过的坑

1. **v2 升 v3 不是平滑升级**——v3 把隐式行为（自动注入 logger、默认中间件顺序）改成显式，老项目得逐处审 `kratos.New(...)` 调用，不是改 import 路径就完事，跨大版本前先看 CHANGELOG。

2. **CLI 缺 protoc 插件**——第一次跑 `kratos proto add` 经常报 `protoc-gen-go-http: program not found`，要先 `go install` protoc-gen-go / protoc-gen-go-grpc / protoc-gen-go-http / protoc-gen-openapi 四个，README 里那段经常被新人跳过。

3. **HTTP-only 中间件污染 gRPC**——CORS 这类只对浏览器有意义的中间件如果直接 `app.Use()` 装到通用层，gRPC 调用会被白白过一遍。要用 `selector.Server(...).Match(...)` 按路径或方法过滤，新人容易忘。

4. **本地开发不连 etcd 启动 panic**——默认配置 `discovery: etcd://...` 是给生产用的，本机调试要把 endpoint 改成 `direct://localhost:9000`，否则启动时连不上注册中心直接 panic，很多人第一次跑 example 卡这。

## 适用 vs 不适用场景

**适用**：

- 一个服务同时要被 App / 浏览器（HTTP）**和**别的微服务（gRPC）调用——一份 proto 出两套
- 团队需要统一的日志 / 错误码 / 链路追踪规范，不想每个项目各搞一套
- 接口频繁变更，靠 Protobuf 做契约比手写 OpenAPI 维护成本低

**不适用**：

- 只对外提供 RESTful HTTP 的小服务——直接用 [[gin]] / [[echo]] / [[chi]] / [[fiber]]，不用扛 protoc 工具链
- 团队没人写过 Protobuf 也不打算学——CLI 全靠 .proto 驱动，绕不开
- 性能敏感的 RPC 密集型场景且只用 gRPC——可以考虑更轻的纯 gRPC 方案（hertz / grpc-go 直接用）

## 历史小故事（可跳过）

- **2019 年**：起源于一家国内视频网站的内部 Go 微服务框架，开源到 GitHub
- **2020 年**：受 [go-kit](https://github.com/go-kit/kit) / [go-micro](https://github.com/go-micro/go-micro) / [google/go-cloud](https://github.com/google/go-cloud) / [go-zero](https://github.com/zeromicro/go-zero) 几个项目影响，逐步形成"Transport + Middleware + 可插拔组件"风格
- **2021 年**：发布 v2，重写了 Transport 抽象，把 HTTP 和 gRPC 真正拉到同一层
- **2023 年**：发布 v3，砍核心依赖、把隐式行为改显式（"explicit is better than implicit"），要求 Go 1.25+
- **现在**：社区 maintainer 来自多家公司，是中文 Go 社区最活跃的微服务项目之一，star 数 24k+

## 学到什么

1. **抽象的价值不是"多包一层"，是"省一份重复代码"**——Transport 抽象让你写一遍中间件 HTTP+gRPC 都生效
2. **CLI + 代码生成** 是 Go 微服务降低样板代码的主流路线，写 proto 比手写 handler 节省的不只是字数
3. **可插拔组件** 让框架不绑定具体基础设施，etcd / consul / nacos 换一个不用改业务代码
4. **大版本升级要看显式 vs 隐式的取舍**——v3 选了显式，代价是迁移成本，收益是调试时不再"猜默认行为"

## 延伸阅读

- 官方文档：[go-kratos.dev](https://go-kratos.dev/)（中英文都有，例子从 helloworld 一路到完整电商）
- GitHub examples：[go-kratos/examples](https://github.com/go-kratos/examples)（按场景分目录，找最像自己业务的抄）
- 视频教程：B 站搜 "kratos 微服务"，社区 maintainer 自己讲过几场，重点看 v3 那场
- [[etcd]] —— kratos 默认推荐的注册中心
- [[jaeger]] —— OpenTelemetry 链路追踪后端，kratos 自带集成

## 关联

- [[gin]] —— 单一 HTTP 框架，比 kratos 轻；不需要 gRPC 时首选
- [[echo]] —— 另一个 HTTP-only 选项，性能和 gin 接近
- [[chi]] —— 标准库风格 router，比 kratos 更裸；适合微服务里只挑路由功能用
- [[fiber]] —— Express 风格 HTTP 框架，迁移自 Node 团队友好
- [[etcd]] —— kratos 注册中心默认选项
- [[jaeger]] —— 链路追踪后端，kratos OpenTelemetry 集成默认对接
- [[prometheus]] —— 监控指标，kratos middleware/metrics 默认输出 prometheus 格式

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chi]] —— chi — Go 标准库友好的轻量 HTTP router
- [[echo]] —— Echo — 极简高性能 Go 框架，5 行起服务
- [[etcd]] —— etcd — 分布式键值数据库
- [[fiber]] —— Fiber — 把 Express 写法搬到 Go 上的高性能 web 框架
- [[gin]] —— Gin — Go 写 web API 的事实标准框架
- [[go-zero]] —— go-zero — 一份契约文件生成整套 Go 微服务
- [[grpc-go]] —— gRPC-Go — Google RPC 框架的官方 Go 实现
- [[prometheus]] —— Prometheus — 时序监控系统

