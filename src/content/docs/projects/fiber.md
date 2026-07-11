---
title: Fiber — 把 Express 写法搬到 Go 上的高性能 web 框架
来源: 'https://github.com/gofiber/fiber'
日期: 2026-05-30
分类: backend-api
难度: 初级
---

## 是什么

Fiber 是一个 **Go 语言的 web 框架**，让你**用 Express（Node.js）的写法来写 Go 服务**。日常类比：像把熟悉的 iPhone 输入法装到了一台安卓手机上——硬件换了，按键习惯没换。

你写：

```go
app := fiber.New()
app.Get("/hello", func(c fiber.Ctx) error {
    return c.SendString("Hello, World")
})
app.Listen(":3000")
```

如果你写过 Express，这一段几乎一字不差能照搬：`app.get` → `app.Get`，`res.send` → `c.SendString`。底层却跑在 **fasthttp**——一个比 Go 标准库 `net/http` 更快、内存分配更少的 HTTP 引擎。所以你写得像 Node，跑得像优化过的 Go。

## 为什么重要

不理解 Fiber，下面这些事都没法解释：

- 为什么很多公司从 Node.js 迁到 Go，但工程师没怎么"重学"——Fiber 这类框架把迁移成本降到几乎为零
- 为什么基准测试里 Fiber 经常排在 Go 框架前列——它绕开了标准库的设计权衡
- 为什么 Fiber 的"零分配"会带来意外坑——同一个对象被多个请求反复用
- 为什么 Go 社区对 Fiber 的态度分裂——有人爱它生产力，有人嫌它不兼容标准生态

## 核心要点

Fiber 做的事可以拆成 **三件**：

1. **抄 Express 的 API**：`app.Get/Post/Put`、`app.Use(中间件)`、`c.Params/c.Query/c.Body`——这些方法名和参数顺序基本和 Express 4.x 一致。类比：Fiber 是"Express 翻译器"，词典换成了 Go。

2. **底层换成 fasthttp**：fasthttp 不用标准库的 `net/http`，它**复用请求/响应对象**（通过 `sync.Pool`），避免每个请求都 new 一份。类比：餐厅不每来一桌客人就买新桌椅，而是把桌椅擦干净给下一桌用。

3. **零拷贝 + unsafe 提速**：从字节流里取 header、URL、body 时，尽量不复制，直接指向同一段内存。类比：你不抄录原文，直接拿原书的页码。代价是这块内存请求结束就回收，存到外面就读到别人的内容。

## 实践案例

### 案例 1：三行启动一个 HTTP 服务

```go
package main

import "github.com/gofiber/fiber/v3"

func main() {
    app := fiber.New()
    app.Get("/", func(c fiber.Ctx) error {
        return c.SendString("Hello, World")
    })
    app.Listen(":3000")
}
```

**逐部分解释**：

- `fiber.New()` 造一个 app 实例，对应 Express 的 `const app = express()`
- `app.Get("/", handler)` 注册根路径的 GET 处理器，handler 拿到 `c`（Context，Express 里是 req+res 合一）
- `c.SendString` 设置响应体；`return` 那个 error 用来传错（nil 代表 OK）
- `Listen(":3000")` 在 3000 端口起服务，阻塞在这里

跟 Express 唯一的差别：handler 要 `return error`。这是 Go 风格。

### 案例 2：路径参数 + JSON 返回

```go
type User struct {
    ID   string `json:"id"`
    Name string `json:"name"`
}

app.Get("/users/:id", func(c fiber.Ctx) error {
    id := c.Params("id")
    return c.JSON(User{ID: id, Name: "Ada"})
})
```

**逐部分解释**：

- `:id` 是路径参数占位符，访问 `/users/42` 时 `c.Params("id")` 返回 `"42"`
- `c.JSON` 自动设 `Content-Type: application/json` 并把结构体序列化
- 结构体字段后面的 `` `json:"id"` `` 是 Go 的标签语法，告诉序列化器输出小写 `id`

请求 `curl localhost:3000/users/42` 拿到 `{"id":"42","name":"Ada"}`。

### 案例 3：中间件链

```go
app.Use(func(c fiber.Ctx) error {
    fmt.Println("收到请求:", c.Path())
    return c.Next()
})

app.Get("/secret", authMiddleware, func(c fiber.Ctx) error {
    return c.SendString("欢迎进入秘密区")
})
```

**逐部分解释**：

- `app.Use` 注册全局中间件，每个请求都先经过它
- `c.Next()` 把控制权交给下一环；不调用就把链断了（适合做"未授权直接返回"）
- `app.Get` 第二个参数起可以塞多个 handler，从左到右依次跑——和 Express `app.get(path, mw1, mw2, final)` 完全一样

## 踩过的坑

1. **Context 会被回收复用**：handler 返回后，那个 `c` 会被洗干净给下一个请求用。如果你把 `c.Params("id")` 存进 goroutine 或全局 map 异步处理，**很可能读到后续请求的脏数据**。要存就先 `s := string(c.Params("id"))` 复制一份。

2. **不兼容 net/http 生态**：fasthttp 不实现 `net/http.Handler` 接口，所以社区那些标准库中间件（prometheus exporter、opentelemetry 默认包）不能直接用，要找 fasthttp 适配版或自己包一层。

3. **unsafe + 升级 Go 偶尔翻车**：内部用 `unsafe.Pointer` 做零拷贝字符串转换，Go 运行时小版本改动有时会让旧版本 Fiber 在新 Go 下出诡异内存问题。v3 才把 Go 1.25+ 的兼容性补齐。

4. **WebSocket / HTTP-2 / HTTP-3 滞后**：fasthttp 长期不支持 HTTP/2，做需要 server push、gRPC-Web、现代浏览器多路复用的服务前要先确认协议支持。需要 HTTP/2 就别选 Fiber。

## 适用 vs 不适用场景

**适用**：

- Node.js 团队迁 Go——Express 写法直接搬，培训成本低
- 性能敏感的纯 HTTP/1.1 API 网关、BFF 层、内部服务
- 中小型 REST/GraphQL API，且不依赖标准库 prometheus / otel 中间件
- 需要极致 RPS 的场合（基准测试里它经常领先 [[gin]]/[[echo]] 和标准库）

**不适用**：

- 需要 HTTP/2、HTTP/3、gRPC、WebTransport——选 [[caddy]] / 标准库 / Hertz
- 重度依赖标准库生态的项目（OTel auto-instrumentation、k8s 控制平面 SDK）
- 长连接 / 复杂 WebSocket 场景——fasthttp 的 WS 支持不如 gorilla/websocket 成熟
- 团队完全是 Go 老兵不熟 Express——那不如直接 Gin / Echo / 标准库，少一层抽象

## 历史小故事（可跳过）

- **2020 年初**：比利时开发者 Fenny van Es 在 GitHub 开了 fiber 仓库，最早只是想给自己写个"像 Express 的 Go 框架"，文档第一版几乎是 Express 文档的逐句翻译
- **2020 下半年**：fasthttp 作者 Aliaksandr Valialkin 给 Fiber 提 PR 贡献性能优化，Fiber 开始进入 Go 社区视野
- **2022 年**：v2 稳定 API，路由器换成基于 trie 的实现，开始登顶 TechEmpower Plaintext 测试
- **2024 年**：v3 把 `*fiber.Ctx` 改成 `fiber.Ctx` interface，为未来支持多 HTTP 引擎（不只 fasthttp）留口子。这是个**破坏性升级**，旧代码全要改
- **2026 年**：35k+ stars，是 Go 社区前几热门的 web 框架之一，但仍被部分 Gopher 视为"非正统"

## 学到什么

1. **熟悉的 API 是迁移成本最大的杠杆**——Fiber 卖点不是性能而是"你已经会写"
2. **零拷贝 + 对象池能把性能榨到极致**，但要付出"对象不能跨请求持有"的契约成本
3. **不兼容标准库 = 生态税**——选框架时别只看基准测试，要看你需要的中间件有没有
4. **API 抄前辈不丢人**——Express 的 router/middleware 设计已被 Koa/Fastify/Hono/Fiber 反复验证

## 延伸阅读

- 官方文档：[Fiber Documentation](https://docs.gofiber.io/)（v3 的 API 参考 + getting started 例子）
- fasthttp 介绍：[valyala/fasthttp](https://github.com/valyala/fasthttp)（Fiber 的引擎，单独读能理解为什么快）
- 对比测试：[TechEmpower Web Framework Benchmarks](https://www.techempower.com/benchmarks/)（看 Fiber/Gin/Echo 在同一标尺下的差距）
- 设计反思：[Why I don't use Fiber in production](https://lukasmalkmus.com/post/why-i-dont-use-fiber/)（生态税的真实案例）
- [[express]] —— Fiber 抄的对象，理解 Express 的中间件链就理解了 Fiber

## 关联

- [[express]] —— Fiber 完全照抄它的 API，迁移者无缝过渡
- [[fastify]] —— Node 端"性能 + Express-like"的同类思路
- [[hono]] —— 跨 runtime 的轻量框架，API 风格也走 Express 路线
- [[koa]] —— Express 的精神续作，中间件 next 模型 Fiber 也借鉴了
- [[caddy]] —— Go 生态中 HTTP/2/3 一站式支持的反例
- [[fastapi]] —— Python 端"用熟悉的语法降低门槛"的同类哲学

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[actix-web]] —— Actix Web — Rust 上长期占据 TechEmpower 榜首的 web 框架
- [[gqlgen]] —— gqlgen — Go 用 schema 先写好再让编译器生成 GraphQL server
- [[krakend]] —— KrakenD — 把多个后端聚合成一次响应的高性能 API 网关
- [[kratos]] —— kratos — Go 微服务一锅出 HTTP 和 gRPC 两份服务
- [[pocketbase]] —— PocketBase — 一个 Go 二进制就是完整的后端
- [[spring-boot]] —— Spring Boot — 用 Auto-configuration 把 Java 后端从 XML 地狱里救出来的事实标准框架
