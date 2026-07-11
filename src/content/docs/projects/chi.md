---
title: chi — Go 标准库友好的轻量 HTTP router
来源: 'https://github.com/go-chi/chi'
日期: 2026-05-30
分类: backend-api
难度: 初级
---

## 是什么

chi 是一个**用 Go 写的小型 HTTP 路由器（router）**：你给它一张 "URL 模式 → 处理函数" 的表，它负责把进来的请求送到对的函数。日常类比：像写字楼前台——访客说要找 7 楼的张三，前台查表后告诉他坐哪部电梯、走哪条走廊。chi 就是 Go 服务里的这个前台。

它最大的卖点是**和 Go 标准库 `net/http` 100% 兼容**：你写的处理函数仍然是标准的 `func(w http.ResponseWriter, r *http.Request)`，所以社区任何一个标准 net/http 中间件都能直接拿来用。

```go
r := chi.NewRouter()
r.Get("/users/{id}", func(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")  // 从 URL 取参数
    fmt.Fprintf(w, "user %s", id)
})
http.ListenAndServe(":8080", r)
```

## 为什么重要

不理解 chi 的角色，下面这些事都说不清：

- 为什么 Go 写 REST 服务可以**不用任何重型框架**也能写得清爽——chi 几乎是 net/http 的天然补丁
- 为什么大量 Go 开源项目（API gateway / SaaS 后端）都引 chi 而不是 gin——它没有自创 handler 签名
- 为什么"中间件" 在 Go 里看起来这么像洋葱——chi 的 `Use` 就是一层一层把 handler 包起来
- 为什么同样写 REST API，Go 比 Python 启动快 10 倍以上——背后是 chi 这种"零依赖 + 直接走 net/http" 的设计

## 核心要点

chi 的设计可以拆成 **三件事**：

1. **路由匹配用 Radix 树**：把所有 URL 模式存成一棵"按字符前缀分支" 的树，匹配时一边走树一边比字符。类比：像查英文字典——先找首字母 c，再找 ch，再找 chi。比一个一个 `if` 串快得多。

2. **中间件栈像洋葱**：`r.Use(logger)` 会把后续每个 handler 都用 logger 包一层；`r.With(auth).Get(...)` 只对这条路由加一层。类比：洋葱外层先碰到请求，剥到最里才是真正的业务函数。

3. **URL 参数走 context**：`{id}` 这种占位符匹配后，chi 把值塞进 `r.Context()`，handler 用 `chi.URLParam(r, "id")` 取。这避免了改请求对象本身，符合 Go 1.7+ 的 context 习惯。

## 实践案例

### 案例 1：最小 REST API

```go
package main
import ("net/http"; "github.com/go-chi/chi/v5")

func main() {
    r := chi.NewRouter()
    r.Get("/ping", func(w http.ResponseWriter, _ *http.Request) {
        w.Write([]byte("pong"))
    })
    http.ListenAndServe(":8080", r)
}
```

**逐部分解释**：`chi.NewRouter()` 造一个空路由表；`r.Get("/ping", ...)` 注册一条 "GET /ping → 返回 pong" 的规则；`http.ListenAndServe` 是 Go 标准库的，证明 chi 能直接当 `http.Handler` 用。

### 案例 2：叠中间件栈

```go
r := chi.NewRouter()
r.Use(middleware.Logger)      // 每个请求打日志
r.Use(middleware.Recoverer)   // 兜住 panic 不让进程崩
r.Get("/", home)              // 受上面两层保护
```

**逐部分解释**：`Use` 注册的中间件会按顺序包裹**之后**注册的所有 handler。请求进来时，先过 Logger（外层），再过 Recoverer，最后到 home；返回时反向往外走。

注意 `r.Use(...)` 的位置：chi 要求全局中间件在路由注册前声明；路由已经注册后再 `Use`，新版 chi 会直接报错，提醒你别让中间件覆盖范围变得含糊。

### 案例 3：嵌套子路由

```go
r.Route("/api/v1/users", func(r chi.Router) {
    r.Get("/", listUsers)            // GET /api/v1/users
    r.Post("/", createUser)
    r.Route("/{id}", func(r chi.Router) {
        r.Get("/", getUser)           // GET /api/v1/users/42
        r.Get("/posts", userPosts)    // GET /api/v1/users/42/posts
    })
})
```

**逐部分解释**：`Route` 创建一个共享前缀的子组，里面注册的所有路由都自动加上 `/api/v1/users` 前缀，且共享父路由的中间件——典型的 RESTful 资源嵌套写法。

## 踩过的坑

1. **中间件顺序非常敏感**：全局 `r.Use(auth)` 必须在任何 `r.Get(...)` / `r.Route(...)` 之前声明；chi v5 会在"已经有路由后再 Use"时报错。常见 bug 不是静默漏保护，而是启动时才发现注册顺序写反了。

2. **URL 参数在路由前取不到**：如果在全局中间件（router 级 Use）里调 `chi.URLParam(r, "id")`，会拿到空字符串——因为路由还没匹配，参数还没塞进 context。要拿参数得在 handler 或路由级中间件里。

3. **`r.WithContext(ctx)` 返回新对象不是改原来的**：很多人写 `r.WithContext(ctx)` 然后还用旧的 r，等于白干。正确写法是 `r = r.WithContext(ctx)` 再往下传，或直接 `next.ServeHTTP(w, r.WithContext(ctx))`。

4. **`Mount` 和 `Route` 不一样**：`Route` 适合在同一个 router 里分组，天然沿用当前链路；`Mount` 是把另一个独立 `http.Handler` 挂到前缀下，父路由前面已经声明的中间件仍会包住它，但子 router 自己的中间件和参数上下文要单独管理。

## 适用 vs 不适用场景

**适用**：

- 用 Go 写 REST API / 微服务，想保留 net/http 兼容性的项目
- 中等复杂度路由（几十到几百条）+ 多层中间件栈的服务
- 团队希望换 router 不重写业务 handler 的工程（chi 用标准签名，迁移成本低）

**不适用**：

- 极致追求 throughput 的网关层 → 可以评估 fasthttp / fiber 这类非标准栈，但要放弃 net/http 生态；gin 仍基于 net/http，只是 API 风格更框架化
- 需要框架级"全家桶"（ORM / DI / config 模板都打包好）→ 选 [[express]] 风格的全家桶（在 Go 里类似 kratos / go-kit）
- 单文件脚本式工具，路由就 1-2 条 → 直接用 `http.HandleFunc` 就够，引 chi 反而过度设计

## 历史小故事（可跳过）

- **2015 年**：Peter Kieltyka 在做内部 API 服务时发现 net/http 的 ServeMux 太弱、gin 又太"自成一派"，于是抽出一个 idiomatic 的 router 开源。
- **2017 年**：Go 1.7 把 context 进了标准库，chi 借势把 URL 参数全面迁到 context，奠定"零依赖 + 标准签名" 的基调。
- **2020 年前后**：社区 benchmark 表明 chi 在简单参数场景做到 ~384 ns/op，与 gin 同档却没引入私有 handler 签名。
- **2023 年起**：弃用早期的 RealIP 中间件（容易被伪造 X-Forwarded-For 欺骗），改推 ClientIPFrom* 系列，强调安全默认值。
- **当下**：作为 v5 主线版本被广泛集成进 Go 生态，是大量 OpenAPI / GraphQL / gRPC-Gateway 项目默认的 HTTP 路由层。

## 学到什么

1. **路由器本质是"模式匹配 + 派发"**——把这一步独立出来，业务 handler 才能保持纯净
2. **兼容标准接口胜过创新签名**——chi 因为不发明 handler 类型，吃到了 net/http 整个生态的中间件红利
3. **中间件栈是嵌套包装**，不是回调队列，理解了"洋葱模型" 才不会写错顺序
4. **Radix 树**作为前缀匹配的经典数据结构，在 router、文件系统、IP 路由表里反复出现，值得专门学一次

## 延伸阅读

- 项目主页：[go-chi/chi GitHub](https://github.com/go-chi/chi)（README 极简，example 文件夹很值得读）
- 视频教程：[Go HTTP Routing Explained — chi vs net/http vs gin](https://www.youtube.com/results?search_query=go+chi+router+tutorial)
- 官方 example：[chi/_examples](https://github.com/go-chi/chi/tree/master/_examples)（covers logging / auth / REST / versioning）
- 数据结构：[[http-2]] —— HTTP/2 协议层，决定 router 上面能跑多快的 multiplexing
- 同类对比阅读：[[express]] —— Node.js 里的"中间件 + 路由表"鼻祖
- 框架对比：[[fastapi]] —— Python 端的现代 API 框架，对照看 Go 的极简风

## 关联

- [[express]] —— Node.js 的轻量 router + 中间件框架，chi 的设计哲学和它一脉相承
- [[fastapi]] —— Python 用类型注解写 API，chi 选择了另一条路：极简 + 标准接口
- [[flask]] —— Python 的轻量 web 框架，"装饰器注册路由" vs chi 的 method 调用注册可对照
- [[django]] —— Python 全家桶框架，chi 故意走相反方向（不打包 ORM / template）
- [[http-2]] —— HTTP/2 是 chi 这类 router 的下层协议，决定 keep-alive / multiplexing 行为
- [[tcp]] —— router 之下还有 TCP 连接管理，理解 socket 才能完整理解请求生命周期

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[actix-web]] —— Actix Web — Rust 上长期占据 TechEmpower 榜首的 web 框架
- [[encore]] —— Encore — 类型安全 Go/TS 后端框架，基础设施即代码
- [[kratos]] —— kratos — Go 微服务一锅出 HTTP 和 gRPC 两份服务
- [[poem]] —— poem — 一份 impl 块同时变 HTTP API + OpenAPI 文档站的 Rust 框架
- [[rocket]] —— Rocket — 用 Rust attribute macro 把路由当函数签名写的 web 框架
