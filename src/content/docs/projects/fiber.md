---
title: Fiber — 用 fasthttp 与可适配 handler 写 Express 风格 Go API 的框架
来源: 'https://github.com/gofiber/fiber'
日期: 2026-08-27
分类: 后端框架
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/gofiber/fiber
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 741d8511a75f408ddf93eb41b175df0165714f11
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.5.0
---

## 是什么

Fiber 是一个把 Express 风格的路由/中间件 API 架在 `fasthttp` 上的 Go Web 框架。日常类比：柜台话术抄自熟悉的咖啡店（`app.Get`、`c.JSON`），后厨灶具却换成了另一套炉子；菜单 squint 一眼能点，出餐规则不能按标准厨房（`net/http`）来想。

你写：

```go
app := fiber.New()
app.Get("/hello", func(c fiber.Ctx) error {
    return c.SendString("Hello, World")
})
app.Listen(":3000")
```

固定 `3.5.0` 的模块路径是 `github.com/gofiber/fiber/v3`。`Handler` 类型是 `func(Ctx) error`；`Ctx` 是接口，默认实现 `DefaultCtx` 内嵌 `DefaultReq` / `DefaultRes`。

## 为什么重要

不理解固定 `3.5.0` 的合同，就解释不了：

- 为什么 `c.Params("id")` 不能直接存进 goroutine
- 为什么 v3 又能登记 `net/http.HandlerFunc`，却仍不是标准库服务器
- 为什么 `Listen()` 开了 TLS 也不等于开了 HTTP/2
- 为什么 `fiber.New()` 默认不做字符串拷贝

## 核心要点

固定 `3.5.0` 可以拆成五步：

1. **造 App**：`New()` 建 `sync.Pool`、hooks、mount 表和 `State`。默认 `toString` 是 `utils.UnsafeString`；`Config.Immutable` 为真才换成拷贝版。

2. **登记多种 handler**：`Get`/`Use` 经 `toFiberHandler`。可接受 Fiber handler、Express 风格 `(Req, Res, next)`、`net/http` handler，以及 `fasthttp.RequestHandler`。

3. **请求走 fasthttp**：真正的连接对象是 `*fasthttp.RequestCtx`。`net/http` 登记项用 `fasthttpadaptor.NewFastHTTPHandler` 包一层，拿不到 `fiber.Ctx` 能力。

4. **匹配后走 Next**：`DefaultCtx.Next()` 先加 `indexHandler`；本 route 的 handler 跑完再 `app.next()` 找下一棵匹配。

5. **写出响应**：`JSON` 调 `app.config.JSONEncoder`（默认 `encoding/json.Marshal`），Content-Type 默认 `application/json; charset=utf-8`。handler 返回的 error 交给 `ErrorHandler`。

## 实践示例

### 案例 1：默认 handler 要返回 error

```go
app.Get("/", func(c fiber.Ctx) error {
    return c.SendString("ok")
})
```

这是 `Handler = func(Ctx) error`。`toFiberHandler` 也接受不返回 error 的 `func(Ctx)`，会包成「调用后返回 nil」。原生 Fiber handler 仍以返回 error 为正路。

### 案例 2：路径参数只在 handler 内有效

```go
app.Get("/users/:id", func(c fiber.Ctx) error {
    id := c.Params("id")
    return c.JSON(fiber.Map{"id": id})
})
```

`Params` 从当前 route 的 `values` 表取值。注释写明：返回值只在 handler 内有效。要丢进 goroutine，先 `id := string(c.Params("id"))` 复制，或 `fiber.New(fiber.Config{Immutable: true})`。

### 案例 3：v3 可以直接挂 net/http

```go
app.Get("/legacy", func(w http.ResponseWriter, r *http.Request) {
    _, _ = w.Write([]byte("served by net/http"))
})
```

`adapter.go` 把 `http.HandlerFunc` / `http.Handler` 交给 `fasthttpadaptor`。这能复用旧端点，但不给 `c.Params` / `c.JSON`，也有适配层开销。需要双向挂整棵应用时，另走 adaptor 中间件。

## 踩过的坑

1. **把 Params/Path 当自己的字符串**：默认 `Immutable` 为 false，底层可能是 fasthttp 缓冲区别名。请求结束后内容会变。

2. **把「能登记 net/http」当成「就是 net/http 服务器」**：监听栈仍是 fasthttp。标准库中间件、OTel 默认 `http.Handler` 探测不能假定直接可用。

3. **以为 Listen 会开 HTTP/2**：`ListenConfig` 没有 h2 NextProto；AutoCert 只写 `http/1.1` 与 `acme-tls/1`。需要 HTTP/2 / HTTP/3 时不要把 Fiber 默认监听当答案。

4. **超大 body**：默认 `BodyLimit` 是 4 MiB。超过限制由 fasthttp 拒收，不是 handler 里才发现。

5. **v2 的 `*fiber.Ctx` 记忆**：v3 是接口 `fiber.Ctx`。旧指针代码要改签名。

## 适用 vs 不适用场景

**适用**：

- 已有 Express 手感、愿意接受 fasthttp 生命周期的 HTTP/1.1 API
- 要在同一棵树上混挂少量 `net/http` 旧 handler
- 明确知道 Params/Body 不能跨请求持有

**不适用**：

- 还在 Go < 1.25——固定树 `go.mod` 是 `go 1.25.0`
- 必须默认 HTTP/2、HTTP/3 或纯 `net/http.Server`
- 团队完全按标准库生态选中间件，不想维护适配层
- 把未绑定的 TechEmpower / star 数字当依据

## 固定版本边界

- 本文绑定 `gofiber/fiber@741d8511...`，tag `v3.5.0` 与 `const Version = "3.5.0"` 一致。
- 模块路径 `github.com/gofiber/fiber/v3`，`go 1.25.0`。引擎依赖 `valyala/fasthttp v1.73.0`。
- `Listen()` 另支持 TLS、`EnablePrefork`、`GracefulContext`；本文未启动监听。
- 本文未安装依赖、未跑上游测试、未测吞吐，状态保持 `UNVERIFIED`。

## 学到什么

1. **熟悉的方法名可以盖住另一套运行时**——API 像 Express，连接模型是 fasthttp。
2. **v3 的适配是登记期转换，不是换引擎**——`net/http` handler 被包进 fasthttp 回调。
3. **零拷贝是可选违约**——默认不安全跨请求持有；`Immutable` 用拷贝换安全。
4. **返回 error 是控制流**——和 Gin 的 `Abort()` + 状态码是两条合同。

## 应用型自测

1. 默认配置下，把 `c.Params("id")` 的返回值存进 goroutine 安全吗？
2. `app.Get("/x", http.HandlerFunc(...))` 在 3.5.0 会不会直接 panic？
3. `app.Listen(":443", fiber.ListenConfig{CertFile: "...", CertKeyFile: "..."})` 会不会自动协商 HTTP/2？

检查点：

1. 不安全。默认 `Immutable` 为 false，字符串可能是缓冲区别名。
2. 不会。`toFiberHandler` 接受 `http.HandlerFunc`，经 fasthttpadaptor 转换。
3. 不会。Listen 的 TLS/AutoCert NextProto 没有 `h2`。

## 延伸阅读

- 固定源码：[gofiber/fiber](https://github.com/gofiber/fiber) —— 本文绑定提交 `741d8511a75f408ddf93eb41b175df0165714f11`
- 应用入口：[app.go](https://github.com/gofiber/fiber/blob/741d8511a75f408ddf93eb41b175df0165714f11/app.go)
- handler 适配：[adapter.go](https://github.com/gofiber/fiber/blob/741d8511a75f408ddf93eb41b175df0165714f11/adapter.go)
- 对照：[[gin]] 走 `net/http` 与 MustBind；[[express]] 是 API 模板

## 关联

- [[gin]] —— 同主题的 `net/http` + Context 池对照
- [[express]] —— Fiber 方法名的直接前辈
- [[fastify]] —— 另一条「性能优先但仍要适配生态」的路线
- [[koa]] —— `next()` 返回值驱动下游的近亲思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[actix-web]] —— Actix Web — Rust 上长期占据 TechEmpower 榜首的 web 框架
- [[gqlgen]] —— gqlgen — Go 用 schema 先写好再让编译器生成 GraphQL server
- [[krakend]] —— KrakenD — 把多个后端聚合成一次响应的高性能 API 网关
- [[kratos]] —— kratos — Go 微服务一锅出 HTTP 和 gRPC 两份服务
- [[pocketbase]] —— PocketBase — 一个 Go 二进制就是完整的后端
- [[spring-boot]] —— Spring Boot — 用 Auto-configuration 把 Java 后端从 XML 地狱里救出来的事实标准框架
