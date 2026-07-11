---
title: axum — 用 Rust 类型系统当『路由参数表』的 Web 框架
来源: 'https://github.com/tokio-rs/axum'
日期: 2026-05-30
分类: 后端开发
难度: 中级
---

## 是什么

axum 是 Tokio 官方团队出的 **Rust 异步 Web 框架**。日常类比：像一个会读你菜单的服务员——你只在 handler 函数签名里写『我要一份 JSON 格式的 user』，他自动从请求里抓出来递给你；你 return 一个 user，他自动把它打包成 200 + JSON 写回去。

它不是从零造轮子，而是站在三件套之上：

- **tokio**：异步 runtime（管所有 await 在哪个线程跑）
- **hyper**：HTTP 协议层（管字节进字节出）
- **tower**：通用 Service 抽象（中间件、超时、限流复用整个生态）

axum 自己只做**最薄的一层**：路由 + extractor + IntoResponse。

```rust
async fn hello(Path(name): Path<String>) -> String {
    format!("hi, {name}")
}
let app = Router::new().route("/hello/{name}", get(hello));
```

签名里的 `Path<String>` 告诉 axum『从 URL 抽路径参数』，返回 `String` 告诉 axum『写成 text/plain 200』。一行声明，无宏。

## 为什么重要

不理解 axum，下面这些事都没法解释：

- 为什么 Rust 写 web 服务从『又难又罗嗦』变成『跟 FastAPI 差不多顺手』
- 为什么 Tokio 官方放弃推 hyper 直接用，转而推一个上层框架
- 为什么 shuttle.rs / Cloudflare workers-rs / 大量生产 API 都默认选它，而不是更老的 actix-web
- 为什么社区把 tower 当成 Rust 后端的 servlet——axum 是它的最佳门面

## 核心要点

axum 的设计可以拆成 **三个支点**：

1. **类型即配置**：handler 的每个参数类型都会被 axum 当成『从请求里抽什么』的指令。`Path<T>` 抽 URL 段、`Query<T>` 抽 query string、`Json<T>` 抽 body。类比：报关单——你勾哪些项，海关就检查哪些项。

2. **Router 也是 Service**：Router 实现了 tower 的 Service trait。把它套一层 TimeoutLayer 还是 Service，套两层还是 Service。中间件直接用 tower-http 现成的（trace / cors / compression），不需要 axum 专属包装。

3. **handler 推导无宏**：不像 rocket 用 `#[get("/path")]` attribute macro，axum 把 `get(handler)` 写成普通函数调用。编译器从 handler 签名推出 trait 边界，所有错误是普通编译错（虽然有时长达几屏，但都是真错）。

三个支点合起来：**写 handler 像写普通函数，组装服务像搭乐高 tower 中间件**。

## 实践案例

### 案例 1：Hello World——一个路由一个函数

```rust
use axum::{routing::get, Router};

async fn root() -> &'static str {
    "Hello, axum!"
}

#[tokio::main]
async fn main() {
    let app = Router::new().route("/", get(root));
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000")
        .await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

**逐部分解释**：

- `#[tokio::main]` 把 `main` 包装成异步 runtime 入口
- `Router::new().route(...)` 注册一条路由——HTTP 方法用 `get(handler)` 表达
- `axum::serve(listener, app)` 把 router 接到 hyper 的 server 上
- 整个程序没用任何宏路由，handler 就是一个返回 `&'static str` 的普通 async fn

### 案例 2：JSON API——extractor + IntoResponse 一条龙

```rust
use axum::{Json, routing::post, http::StatusCode};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct CreateUser { name: String }

#[derive(Serialize)]
struct User { id: u64, name: String }

async fn create_user(Json(req): Json<CreateUser>)
    -> (StatusCode, Json<User>)
{
    let user = User { id: 1, name: req.name };
    (StatusCode::CREATED, Json(user))
}
```

**逐部分解释**：

- 参数 `Json<CreateUser>` 让 axum 自动 `serde_json::from_slice` 反序列化 body
- 返回 `(StatusCode, Json<User>)` 让 axum 写回 201 + Content-Type: application/json
- 反序列化失败（缺字段、JSON 不合法）axum 自动返回 400，不用自己 try/catch
- handler 还是普通 async fn——零 axum 专属语法

### 案例 3：套 tower 中间件——超时 + 请求日志

```rust
use axum::{routing::get, Router};
use tower_http::{trace::TraceLayer, timeout::TimeoutLayer};
use std::time::Duration;

let app = Router::new()
    .route("/slow", get(|| async { "ok" }))
    .layer(TimeoutLayer::new(Duration::from_secs(5)))
    .layer(TraceLayer::new_for_http());
```

**逐部分解释**：

- `TimeoutLayer` 来自 `tower-http`，**不是 axum 自己的**——这是关键卖点
- 套两层 layer 后，Router 仍然是 Service，可以再被外层包
- 同样写法可换成 CorsLayer / CompressionLayer / RateLimitLayer，全部即插即用
- 这就是 axum『站在 tower 肩上』的实际体感

## 踩过的坑

1. **handler 不满足 Handler trait 报错几屏**：写错一个参数类型（比如 `Json<CreateUser>` 写成 `CreateUser`），编译器会把 `Send + Sync + 'static + FromRequest` 全部摊开喷你脸上。真因往往是『某个参数没实现 FromRequest』或『返回类型没实现 IntoResponse』，先看最后一行 trait 名字定位。
2. **State 共享要用 `with_state`，不是全局变量**：数据库连接池、配置不能塞 `static`。正确做法：定义 `AppState { db: Pool }`（必须 `Clone`，一般用 `Arc` 包），`Router::new().with_state(state)`，handler 写 `State(app): State<AppState>` 提取。漏写 `with_state` 运行期 500。
3. **吃 body 的 extractor 必须最后一个**：`Json` / `Form` / `Bytes` / `String` 都会消费请求体，签名里只能出现一次且必须最右。多个 body extractor 同时写 0.7+ 编译期就拦，但 0.6 之前是运行期 panic，老代码升级要扫一遍。
4. **handler 内不能跨 await 持有借用**：handler 返回的 Future 要 `'static`，所以函数体内 `let s = some_string.as_str(); other_async().await; use(s);` 会被借用检查器拦下来。常见解：换成 `String`（owned）或在 await 前 drop 借用。

## 适用 vs 不适用场景

**适用**：

- Rust 后端 HTTP API / GraphQL 网关 / 微服务（事实默认选择）
- 想直接复用 tower / tower-http 中间件生态的项目
- 团队已经在 tokio + hyper 上，想升级到更舒服的上层
- 中等复杂度业务——CRUD、鉴权、日志、限流都有现成 layer

**不适用**：

- 完全不想接触 async Rust → 用 Go / Node 更省心
- 需要 actor 模型 + 内置 actor 邮箱 → [[actix-web]] 的 Actix actor 更原生
- 写脚本级超小服务（< 50 行）→ 直接 hyper 反而更短，axum 的依赖偏重
- 团队完全没 Rust 经验且工期紧 → 借用检查器学习成本不小，先用 [[fastapi]] 或 [[express]] 上线，团队稳了再迁

## 历史小故事（可跳过）

- **2021 年中**：Tokio 团队的 David Pedersen 发布 axum 0.1，目标是『给 tokio 生态一个官方推荐的 web 框架』——hyper 太底层、warp 类型推导太重
- **2022 年**：axum 0.5 / 0.6 期间 API 多次破坏性变更，State extractor 改造、Body 类型重整，生产用户痛但每次都更好
- **2023 年**：tower-http 中间件生态成熟，axum 因为站在 tower 上获得免费收益（trace / cors / timeout / compression / auth）
- **2024 年**：shuttle.rs、Cloudflare workers-rs 等 PaaS 把 axum 列为默认选择
- **2025-2026**：axum 0.8 发布，API 趋稳，hyper 1.0 也稳了，整个栈进入『可以放心写生产服务』阶段

## 学到什么

1. **类型系统可以当 API 配置语言**：FastAPI 用 Python 类型注解、axum 用 Rust 类型，本质都是『让函数签名告诉框架做什么』
2. **薄框架 + 强生态 > 厚框架 + 自造轮子**：axum 自己代码量很小，靠 tower 抓住整个中间件生态
3. **异步 Rust 的人体工程学需要专门设计**：不是套 async/await 就完事——extractor、IntoResponse、Handler trait 都是为了让借用检查器和你和平共处而设计
4. **0.x 不代表不能用**：0.x 期间多次破坏升级，但每次都让 API 更好；现在 0.8 已是事实生产标准

## 延伸阅读

- 官方 README + examples 目录：[github.com/tokio-rs/axum](https://github.com/tokio-rs/axum)（最权威，含 30+ 个可跑示例）
- docs.rs API 文档：[docs.rs/axum/latest/axum](https://docs.rs/axum/latest/axum/)（每个 trait 都有解释）
- David Pedersen 在 RustConf 的演讲：『axum: a focused web framework』（讲设计取舍）
- [[actix-web]] —— Rust 最早成熟的 web 框架，actor 模型路线
- [[fastapi]] —— Python 类型驱动 web，axum 的精神近亲
- [[http-2]] —— hyper 底层支持 HTTP/2，axum 自动继承

## 关联

- [[actix-web]] —— Rust 同代 web 框架，actor 路线对比 axum 的 tower 路线
- [[fastapi]] —— 类型注解驱动 API 的 Python 鼻祖，思路一致语言不同
- [[express]] —— Node 的薄框架代表，axum 在 Rust 世界扮演类似角色
- [[gin]] —— Go 的轻量 web 框架，对照阅读能看清『Rust 异步 + 类型』给 web 带来什么
- [[nestjs]] —— TypeScript 装饰器驱动框架，与 axum 的『类型驱动』形成对比
- [[http-2]] —— axum 通过 hyper 自动支持 HTTP/2，无需额外配置

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

