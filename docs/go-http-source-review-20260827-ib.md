# Go HTTP source review (writer IB)

> 用途：记录 Gin、Fiber 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL IB
- evidence：GitHub metadata、固定提交静态源码与测试/文档阅读
- not executed：未安装两仓依赖，未运行上游 test、HTTP 服务、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/gin`、`research-worktrees/fiber`，不进入 Git
- fallback unused：canonical `gin-gonic/gin@v1.12.0` 与 `gofiber/fiber@v3.5.0` 的 tag 与 `Version` 常量一致，未改用其他 Go-HTTP 配对

## Gin

- canonical source：`https://github.com/gin-gonic/gin`
- GitHub tag：`v1.12.0`
- revision：`73726dc606796a025971fe451f0aa6f1b9b847f6`
- package：`github.com/gin-gonic/gin`，`const Version = "v1.12.0"`
- go：`go 1.25.0`
- inspected：
  - `go.mod`
  - `version.go`
  - `gin.go`
  - `routergroup.go`
  - `tree.go`
  - `context.go`
  - `utils.go`
  - `recovery.go`
  - `binding/binding.go`
  - `binding/default_validator.go`
  - `CHANGELOG.md`
- observed：
  - `New()` 造裸 `Engine`；`Default()` 再 `Use(Logger(), Recovery())`；
  - `Run()` 调 `resolveAddress()`：无参数时读 `PORT`，否则 `:8080`，再 `http.Server{Handler: engine.Handler()}.ListenAndServe()`；
  - `Handler()` 仅在 `UseH2C` 为真时包一层 `h2c.NewHandler`；`RunQUIC` 走 `quic-go/http3.ListenAndServeQUIC`；
  - 路由树在本仓 `tree.go`，按 method 分树；`go.mod` 无 `julienschmidt/httprouter`；
  - 同前缀不同通配符名、重复注册同一 path 会 `panic`；
  - `ServeHTTP` 从 `sync.Pool` 取 `*Context`，结束后 `Put`；`Copy()` 复制 Params/Keys 并把 `ResponseWriter` 置空；
  - `BindJSON` 走 `MustBindWith`：失败默认 `AbortWithStatus(400)`，`http.MaxBytesError` 走 413；不写 JSON 错误体；
  - `binding` 默认校验器是 `go-playground/validator/v10`；
  - 默认 `trustedProxies` 为 `0.0.0.0/0` 与 `::/0`，`Run()` 会打印 unsafe 警告。

## Fiber

- canonical source：`https://github.com/gofiber/fiber`
- GitHub tag：`v3.5.0`
- revision：`741d8511a75f408ddf93eb41b175df0165714f11`
- package：`github.com/gofiber/fiber/v3`，`const Version = "3.5.0"`
- go：`go 1.25.0`
- inspected：
  - `go.mod`
  - `app.go`
  - `listen.go`
  - `adapter.go`
  - `router.go`
  - `ctx.go`
  - `ctx_interface.go`
  - `req.go`
  - `res.go`
  - `README.md`
- observed：
  - `Handler` 类型是 `func(Ctx) error`；`Ctx` 是接口，默认实现 `DefaultCtx` 内嵌 `DefaultReq` / `DefaultRes`；
  - `New()` 默认 `toString = utils.UnsafeString`；`Config.Immutable` 为真时改 `toStringImmutable`；
  - 默认 `BodyLimit` 为 4 MiB，`JSONEncoder`/`JSONDecoder` 为 `encoding/json`；
  - `Listen()` 支持 TLS、`EnablePrefork`、`GracefulContext`；`ListenConfig` 无 HTTP/2 NextProto，AutoCert 写 `http/1.1` 与 `acme-tls/1`；
  - `toFiberHandler` 接受 Fiber handler、Express 风格 `(Req, Res, next)`、`net/http` handler 和 `fasthttp.RequestHandler`；`net/http` 经 `fasthttpadaptor.NewFastHTTPHandler`；
  - `Params` / `Path` 注释写明返回值只在 handler 内有效，跨请求必须复制或开 `Immutable`；
  - `JSON` 用 `app.config.JSONEncoder`，默认 Content-Type 为 `application/json; charset=utf-8`；
  - `Next()` 先加 `indexHandler`，本 route 的 handler 用完再 `app.next()` 找下一棵匹配；
  - 引擎依赖 `github.com/valyala/fasthttp v1.73.0`。
