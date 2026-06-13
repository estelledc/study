---
title: Vapor — 用 Swift 写后端 API 的 Web 框架
来源: https://github.com/vapor/vapor
日期: 2026-06-13
子分类: 移动端
分类: 后端 API
provenance: pipeline-v3
---

## 是什么

Vapor 是 **Swift 生态里最成熟的服务端 Web 框架**——用你写 iOS / macOS 时已经熟悉的 Swift 语法，搭 HTTP 服务器、REST API、微服务，底层跑在 Apple 的 SwiftNIO 非阻塞 I/O 之上。

日常类比：

> 想象你家楼下开了一家「万能快递站」。顾客（浏览器 / App）把包裹（HTTP 请求）送来，门口有个**分拣员**（Router）看地址标签：`GET /users/42` 该去几号窗口。每个窗口（Route Handler）只做一件事：查数据库、改状态、回 JSON。Vapor 就是帮你把这家快递站的**门牌系统、窗口分工、打包规范**全部标准化——你不用自己从零拼 TCP 监听和 HTTP 解析，专注写「收到包裹后怎么处理」。

和 [[nestjs]]（Node.js）、[[fastapi]]（Python）的定位类似，但最大差异是：**前后端可以共用同一门语言**。团队已有 Swift/iOS 能力时，不必为了后端再养一套 TypeScript 或 Go 同学。

一句话：**Vapor = Swift 世界的 Express / Nest，自带类型安全路由 + Fluent ORM + 中间件管线。**

## 为什么重要

不理解 Vapor，下面几件事都解释不通：

- 为什么 Apple 推 Swift 全栈时，官方教程和示例项目默认选 Vapor 而不是自己再造轮子
- 为什么 Swift Server Work Group（SSWG）的 Todos 教程、OpenAPI 示例都以 Vapor 为 HTTP 层
- 为什么同一套 `Codable` 模型可以在 iOS 客户端和 Vapor 服务端**直接复用**，少写一层 DTO 转换
- 为什么 Vapor 4 全面拥抱 `async/await`，和 Swift 6 并发模型对齐，而不是继续堆回调

它代表一种后端范式：**用强类型 + 编译期检查，把「路由写错、JSON 字段拼错、SQL 注入」尽量挡在上线之前。**

## 核心要点

Vapor 的运转可以拆成 **五块**：

### 1. Application 与生命周期

`Application` 是整个服务的根对象，持有路由表、数据库连接、中间件栈、日志器。启动入口通常是 `entrypoint.swift` 里的 `async throws` 函数，在 `configure.swift` 里配数据库/中间件，在 `routes.swift` 里挂路由。

类比：Application 是快递总站大楼；`configure` 是装修（接水电、装监控）；`routes` 是贴门牌。

### 2. Routing（路由）

路由把 **HTTP 方法 + 路径** 映射到处理函数。路径里的 `:id` 是动态参数，值在 `req.parameters.get("id")` 里取。Vapor 底层用 RoutingKit 的 **Trie 路由树**，匹配速度快，适合 API 路由多的服务。

支持的路由辅助方法：`get`、`post`、`put`、`patch`、`delete`，以及通用的 `on(.HEAD, ...)`。

### 3. Content（请求/响应体）

请求体、响应体通过 Swift 的 `Codable` 自动编解码 JSON。定义好 `struct`，框架帮你 `try req.content.decode(MyDTO.self)` 和 `return dto`（自动变 JSON）。

### 4. Fluent ORM（可选但常用）

Fluent 是 Vapor 官方的 ORM：用 `Model` 协议描述表结构，用 `Migration` 建表/改表，用链式 API 查库，**不用手写 SQL**（需要时也可 raw SQL）。驱动支持 PostgreSQL、MySQL、SQLite、MongoDB 等。

### 5. Middleware（中间件）

中间件包在路由外面，形成洋葱模型：认证、日志、限流、CORS 都在进 handler 之前或出响应之后执行。可以挂在全局 `app.middleware.use(...)`，也可以只挂在某个 `routes.grouped(AuthMiddleware())` 上。

---

## 实践案例

### 案例 1：最小可运行 API —— Hello + 带参数的路由

新建项目（需先安装 [Vapor Toolbox](https://github.com/vapor/toolbox)）：

```bash
vapor new MyAPI
cd MyAPI
swift run App serve
```

`Sources/App/routes.swift` 里最常见的起步代码：

```swift
import Vapor

func routes(_ app: Application) throws {
    // GET /  →  {"hello": "world"}
    app.get { req async throws -> [String: String] in
        ["hello": "world"]
    }

    // GET /users/:name  →  问候指定用户
    app.get("users", ":name") { req async throws -> String in
        guard let name = req.parameters.get("name") else {
            throw Abort(.badRequest)
        }
        return "Hello, \(name)!"
    }
}
```

**逐行解释**：

- 返回 `[String: String]` 或 `String`，Vapor 自动设 `Content-Type: application/json` 或 `text/plain`
- `:name` 是路径参数；取不到时 `Abort(.badRequest)` 直接回 400
- `async throws` 是 Vapor 4 推荐写法，和 Swift 并发一致

用 curl 验证：

```bash
curl http://127.0.0.1:8080/
curl http://127.0.0.1:8080/users/Jason
```

### 案例 2：REST Controller + Fluent 模型（Todo CRUD 骨架）

下面是一个完整的 **Todo API** 骨架：模型、迁移、控制器、路由注册。创建项目时可 `vapor new Todos --fluent --db postgres`。

**模型与迁移**（`Sources/App/Models/Todo.swift`）：

```swift
import Fluent
import Vapor

final class Todo: Model, Content, @unchecked Sendable {
    static let schema = "todos"

    @ID(key: .id) var id: UUID?
    @Field(key: "title") var title: String
    @Field(key: "is_done") var isDone: Bool

    init() {}

    init(id: UUID? = nil, title: String, isDone: Bool = false) {
        self.id = id
        self.title = title
        self.isDone = isDone
    }
}

struct CreateTodoMigration: AsyncMigration {
    func prepare(on database: Database) async throws {
        try await database.schema("todos")
            .id()
            .field("title", .string, .required)
            .field("is_done", .bool, .required, .custom("false"))
            .create()
    }

    func revert(on database: Database) async throws {
        try await database.schema("todos").delete()
    }
}
```

**控制器**（`Sources/App/Controllers/TodoController.swift`）：

```swift
import Fluent
import Vapor

struct TodoController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let todos = routes.grouped("api", "v1", "todos")
        todos.get(use: index)
        todos.post(use: create)
        todos.group(":todoID") { todo in
            todo.get(use: show)
            todo.put(use: update)
            todo.delete(use: delete)
        }
    }

    func index(req: Request) async throws -> [Todo] {
        try await Todo.query(on: req.db).all()
    }

    func create(req: Request) async throws -> Todo {
        let input = try req.content.decode(Todo.self)
        try await input.save(on: req.db)
        return input
    }

    func show(req: Request) async throws -> Todo {
        guard let todo = try await Todo.find(req.parameters.get("todoID"), on: req.db) else {
            throw Abort(.notFound)
        }
        return todo
    }

    func update(req: Request) async throws -> Todo {
        guard let todo = try await Todo.find(req.parameters.get("todoID"), on: req.db) else {
            throw Abort(.notFound)
        }
        let input = try req.content.decode(Todo.self)
        todo.title = input.title
        todo.isDone = input.isDone
        try await todo.save(on: req.db)
        return todo
    }

    func delete(req: Request) async throws -> HTTPStatus {
        guard let todo = try await Todo.find(req.parameters.get("todoID"), on: req.db) else {
            throw Abort(.notFound)
        }
        try await todo.delete(on: req.db)
        return .noContent
    }
}
```

**配置与注册**（节选 `configure.swift` / `routes.swift`）：

```swift
// configure.swift
try app.databases.use(.postgres(url: "postgres://localhost/todos"), as: .psql)
app.migrations.add(CreateTodoMigration())
try await app.autoMigrate()

// routes.swift
try app.register(collection: TodoController())
```

这套结构和 [[nestjs]] 的 `Module + Controller + Service` 很像，只是 Swift 用 `struct` 控制器 + 协议 `RouteCollection`，依赖通过 `req.db`、`req.application` 传入，而不是构造器注入。

### 案例 3：中间件保护路由组

登录接口公开，其余接口要 Bearer Token：

```swift
struct AuthMiddleware: AsyncMiddleware {
    func respond(to req: Request, chainingTo next: AsyncResponder) async throws -> Response {
        guard let token = req.headers.bearerAuthorization?.token,
              token == Environment.get("API_TOKEN") else {
            throw Abort(.unauthorized)
        }
        return try await next.respond(to: req)
    }
}

func routes(_ app: Application) throws {
    app.post("login") { req async throws -> [String: String] in
        // 校验用户名密码，签发 token …
        ["token": "issued-token"]
    }

    let protected = app.grouped(AuthMiddleware())
    protected.get("dashboard") { req async throws -> String in
        "secret data"
    }
}
```

`grouped` 同时支持**路径前缀**和**中间件**，可以嵌套：`app.grouped("api", "v1").grouped(AuthMiddleware())`。

---

## 与生态的关系

| 组件 | 作用 |
|------|------|
| **SwiftNIO** | 底层非阻塞网络 I/O，Vapor 的性能基石 |
| **Fluent** | ORM + 迁移，对接 [[postgresql]] / SQLite / MySQL |
| **Leaf** | 服务端模板引擎，做 HTML 页面（SSR） |
| **Queues** | 后台任务队列（邮件、定时任务） |
| **JWT / Redis 等** | 社区包，通过 Swift Package Manager 引入 |

官方文档：[docs.vapor.codes](https://docs.vapor.codes)。Swift 基金会维护的 [swift-server-todos-tutorial](https://github.com/swiftlang/swift-server-todos-tutorial) 演示了 Vapor + OpenAPI + PostgreSQL + OpenTelemetry 的生产向组合。

## 常见坑与选型建议

1. **别在 Linux 上指望 Xcode**：服务端开发常用 `swift build` / Docker；本地 Mac 开发体验最好。
2. **迁移要先 `autoMigrate` 或 `swift run App migrate`**：否则 Fluent 模型和真实表结构不一致会直接运行时崩溃。
3. **小脚本别硬上 Vapor**：纯 CLI 或单次任务用 `swift run` 即可；Vapor 适合长期运行的 HTTP 服务。
4. **和 Hummingbird 怎么选**：同属 SSWG 生态；Hummingbird 更轻、模块化；Vapor 电池更全（Fluent/Leaf/Queues 一条龙）。新项目 API 优先可先看团队是否已深度用 Fluent。

## 学习路径建议

1. `vapor new` 跑通 Hello World + `curl` 测路由
2. 读官方 **Basics → Routing**、**Fluent → Overview**，手写一个 3 资源的 CRUD
3. 加一个 `Middleware`（日志或 API Key），理解请求管线
4. 用 `XCTVapor` 写 HTTP 测试（`Tests/AppTests` 模板里已有示例）
5. 对接真实 [[postgresql]]，用 Docker Compose 起库，环境变量配 `DATABASE_URL`
6. 若有 iOS 客户端，把 `Codable` 模型抽到 Swift Package，前后端共用

## 小结

Vapor 把 **Swift 的类型系统** 延伸到服务端：路由、请求体、数据库行都是编译期可检查的。日常类比里它是「标准化快递分拣站」——你负责定义窗口逻辑，框架负责收包、路由、打包 JSON。配合 Fluent 和中间件，从零到可部署的 REST API 通常比换一门新语言学后端更快，尤其适合 **Swift 原生团队做全栈或 BFF 层**。
