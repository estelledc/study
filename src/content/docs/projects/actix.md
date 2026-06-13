---
title: Actix Web 零基础入门
来源: https://github.com/actix/actix-web
日期: 2026-06-13
分类: 后端 API
子分类: rust-ecosystem
provenance: pipeline-v3
---

# Actix Web 零基础入门

## 一、Actix Web 是什么？

想象你要开一家餐厅。

你不需要从零开始烧砖、种树做桌椅、养牛产奶做黄油——你只需要专注"做菜"和"招待客人"这两件事，其他基础设施都有现成的。

Actix Web 就是 Rust 语言里这样的"餐厅管理系统"。它是一个 Web 框架，帮你处理：

- 监听端口、接收网络请求
- 解析 HTTP 协议（URL、请求头、请求体）
- 把请求路由到对应的处理函数
- 把响应数据打包成 HTTP 回复发回去

它最大的特点是**极快**。在 TechEmpower 框架性能排行榜上，Actix Web 长期位居榜首，比很多知名框架快数倍。

## 二、核心概念

### 1. HttpServer —— 餐厅本身

`HttpServer` 是整个应用的入口。它负责：

- 监听指定的 IP 地址和端口（比如 `127.0.0.1:8080`）
- 管理多个工作线程（每个线程一个"厨师"）
- 启动和停止服务

### 2. App —— 餐厅菜单

`App` 定义了你提供哪些"菜"（路由）。每个路由对应一个处理函数（handler），告诉服务器收到某个 URL 请求时该做什么。

### 3. Handler（处理函数）—— 做菜的人

处理函数是一个普通的 Rust 函数，用属性宏（如 `#[get("/")]`）标记。它的职责很简单：收到请求，返回响应。

### 4. Responder（响应器）—— 端盘子的角色

任何实现了 `Responder` trait 的类型都可以作为返回值。字符串、JSON 数据、自定义结构体都能直接返回，Actix 会自动帮你包装成 HTTP 响应。

### 5. Extractor（提取器）—— 点餐员

Extractor 从 HTTP 请求中提取数据并传入处理函数。常见的有：

- `web::Path<T>` — 从 URL 路径中提取参数
- `web::Json<T>` — 从请求体中解析 JSON
- `web::Query<T>` — 从查询字符串（`?key=value`）中提取参数

### 6. Service（服务）—— 菜单上的每道菜

通过 `.service()` 方法注册路由。每个 service 就是一个 URL 模式 + 处理函数的绑定。

## 三、第一个程序：Hello World

这是 Actix Web 最基础的程序，运行后访问 `http://127.0.0.1:8080/` 就能看到 "Hello, World!"。

```rust
use actix_web::{get, web, App, HttpServer, Responder};

// 定义一个路由：访问 "/" 时调用 index 函数
#[get("/")]
async fn index() -> impl Responder {
    "Hello, World!"
}

// 主函数：启动服务器
#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| App::new().service(index))
        .bind(("127.0.0.1", 8080))?
        .run()
        .await
}
```

逐行拆解：

- `use actix_web::{get, web, App, HttpServer, Responder}` — 导入需要用到的组件
- `#[get("/")]` — 属性宏，声明这个函数处理 GET 请求的路径 `/`
- `async fn index()` — 异步函数，因为 Web 请求可能耗时（查数据库、调 API 等）
- `impl Responder` — 返回值实现了 Responder trait，这里直接返回字符串
- `HttpServer::new(|| ...)` — 创建服务器，闭包内配置 App
- `.bind(("127.0.0.1", 8080))?` — 绑定地址和端口
- `.run().await` — 启动服务器并等待请求

`#[actix_web::main]` 替代了标准的 `fn main()`，它在底层帮你启动了 Tokio 运行时（Rust 的异步运行时），所以你不需要手动写 `tokio::main`。

## 四、第二个程序：带参数的路由 + JSON 响应

实际应用中，你需要从 URL 获取参数，并返回结构化数据。

```rust
use actix_web::{get, post, web, App, HttpServer, Responder, Json};
use serde::{Deserialize, Serialize};

// 定义数据结构：用于解析请求体和返回 JSON
#[derive(Deserialize, Serialize)]
struct User {
    name: String,
    age: u32,
}

// 从 URL 路径中提取参数：GET /user/alice
#[get("/user/{name}")]
async fn get_user(name: web::Path<String>) -> impl Responder {
    let username = name.into_inner();
    format!("Hello, {}! Welcome to our service.", username)
}

// 接收 JSON 请求体：POST /user
#[post("/user")]
async fn create_user(user: Json<User>) -> impl Responder {
    let user_data = user.into_inner();
    format!(
        "Created user: {} (age: {})",
        user_data.name, user_data.age
    )
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| {
        App::new()
            .service(get_user)
            .service(create_user)
    })
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}
```

关键知识点：

- `{name}` 是路径参数占位符，匹配 `/user/alice`、`/user/bob` 等 URL
- `web::Path<String>` 是提取器，自动从 URL 中提取 `{name}` 的值
- `Json<User>` 是提取器，自动将请求体的 JSON 反序列化为 `User` 结构体
- `#[derive(Deserialize, Serialize)]` 来自 `serde` 库，让结构体能被序列化和反序列化
- `into_inner()` 从包装类型中提取内部值

## 五、Actix 生态的关键组件

Actix 不只是一个框架，而是一套完整的生态系统：

| 组件 | 作用 |
|------|------|
| actix-web | 核心 Web 框架 |
| actix-rt | 异步运行时（基于 Tokio） |
| actix-http | HTTP 协议实现 |
| awc | HTTP 客户端（Actix Web Client） |
| actix-files | 静态文件服务 |
| actix-session | Cookie/Redis 会话管理 |

它们共享同一个设计理念：**类型安全、高性能、模块化**。

## 六、为什么选 Actix Web？

- 性能：TechEmpower 排行榜常客，Rust 生态最快的 Web 框架之一
- 类型安全：利用 Rust 的所有权和类型系统，编译期就能捕获大量错误
- 宏简化：`#[get]`、`#[post]` 等属性宏让路由声明非常简洁
- 提取器系统：从请求中提取数据就像函数参数一样自然
- 成熟稳定：自 2017 年发布以来持续迭代，当前最新大版本为 4.x

## 七、下一步

- 官方文档：<https://actix.rs/docs/>
- 示例仓库：<https://github.com/actix/examples>
- Discord 社区：<https://discord.gg/NWpN5mmg3x>
- crates.io：<https://crates.io/crates/actix-web>
