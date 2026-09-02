---
title: axum — 用函数签名当请求抽取表的 Rust Web 框架
来源: 'https://github.com/tokio-rs/axum'
日期: 2026-08-27
分类: 后端开发
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/tokio-rs/axum
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: c59208c86fded335cd85e388030ad59347b0e5ae
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.8.9
---

## 是什么

axum 是 Tokio 生态里的 **HTTP 路由 / 请求处理库**。日常类比：handler 的参数表就是报关单——你写 `Path<T>` / `Query<T>` / `Json<T>`，框架按类型从请求里抽字段；你返回实现了 `IntoResponse` 的值，它再写成 HTTP 响应。

它自己不造 runtime。固定 0.8.9 的 crate 文档写明：兼容目标是 [tokio] + [hyper]，runtime / transport 无关不是目标。中间件也不自建一套，而是复用 `tower::Service`。

```rust
async fn hello(Path(name): Path<String>) -> String {
    format!("hi, {name}")
}
let app = Router::new().route("/hello/{name}", get(hello));
```

`{name}` 是 0.8 默认语法。写成 `/:name` 会在注册时 panic，除非先 `without_v07_checks()`。

## 为什么重要

不按固定 0.8.9 源码读 axum，下面这些印象会对不上：

- 旧教程的 `:name` 路径在默认 Router 上会直接 panic，不是“也能用”
- 漏写 `with_state` 不是运行期 500，而是 `Router<S>` 还缺状态、不能交给 `serve`
- JSON 反序列化失败不是一律 400：语法错 400，类型对不上 422，缺 JSON Content-Type 是 415
- `TimeoutLayer` 来自独立的 `tower-http`，不是 axum 默认依赖

## 核心要点

固定 0.8.9 的主链可以拆成五步：

1. **签名即抽取**：参数实现 `FromRequest` 或 `FromRequestParts`。body 是一次性流，所以只有最后一个参数能实现 `FromRequest`（`Json` / `Form` / `Bytes` / `String`），其余必须是 `FromRequestParts`。两个 body extractor 会在编译期失败。

2. **`Router<S>` 表示还缺状态**：`S` 不是“已经持有的状态类型”。`with_state(value)` 之后类型变成 `Router<()>`。只有 `Router<()>` 实现 `Service`，才能 `axum::serve(listener, app)`。

3. **响应靠 `IntoResponse`**：`&'static str` 变成 `200` + `text/plain`；`Json<T>` 写成 `application/json`；`(StatusCode, Json<T>)` 同时改状态码。`Json` 序列化失败会变成 500。

4. **默认 body 上限 2_097_152 字节**：`Bytes` / `String` / `Json` / `Form` 都走这条限制，可用 `DefaultBodyLimit` 改或关掉。

5. **`serve` 很薄**：它用 hyper-util 接 listener，有意不提供复杂服务器配置；要调 HTTP/2 细节应直接用 hyper。默认 features 含 `http1`，`http2` 是可选 feature。

## 实践示例

### 案例 1：`serve` + `{name}` 路由

```rust
use axum::{routing::get, Router, extract::Path};

async fn hello(Path(name): Path<String>) -> String {
    format!("hi, {name}")
}

#[tokio::main]
async fn main() {
    let app = Router::new().route("/hello/{name}", get(hello));
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

`#[tokio::main]` 需要 tokio 的 `macros` 与 runtime feature。`serve` 文档写明配置面刻意很少。

### 案例 2：JSON 抽取与拒绝状态码

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
    (StatusCode::CREATED, Json(User { id: 1, name: req.name }))
}
```

`Json` 用 `serde_json::Deserializer::from_slice` 加 `serde_path_to_error`。缺 JSON Content-Type 是 415，JSON 语法错是 400，字段对不上是 422。

### 案例 3：`State` 必须在 body 之前

```rust
use axum::{extract::State, routing::post, Json, Router};

#[derive(Clone)]
struct AppState { /* db pool */ }

async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateUser>,
) -> String {
    let _ = state;
    body.name
}

let app = Router::new()
    .route("/users", post(create))
    .with_state(AppState {});
```

`State` 是 extractor，必须写在 body 参数左边。状态类型要 `Clone`；跨请求共享资源通常再包 `Arc`。

## 踩过的坑

1. **把漏写 `with_state` 当成运行期 500**：`Router<AppState>` 还缺状态，不能 `serve`。这是类型错误。
2. **继续写 `/:id`**：0.8 默认 `v7_checks` 会 panic，提示改成 `{id}`。
3. **两个 body extractor**：`String` 和 `Json<T>` 不能同时出现；编译器要求最后一个才是 `FromRequest`。
4. **跨 `.await` 借局部引用**：`Handler::Future` 是 `Send + 'static`，handler 里的借用不能活过 await。

## 适用 vs 不适用场景

**适用**：

- 已经在 tokio + hyper 上，想用类型签名写 HTTP API
- 需要直接复用 tower / tower-http 中间件（后者是独立 crate）
- 接受 MSRV 1.80，并接受默认只开 HTTP/1

**不适用**：

- 需要框架自带 actor 邮箱或 `#[get("/path")]` 宏路由——看 [[actix-web]] / [[rocket]]
- 不能开 tokio、或把 axum 当成 runtime 无关的 HTTP 核
- 想把静态阅读写成“已测吞吐 / 已在生产跑过”——本文没有这样做

## 固定版本边界

- 本文绑定 `tokio-rs/axum@c59208c86fded335cd85e388030ad59347b0e5ae`。annotated tag `axum-v0.8.9` 解引用到该提交；`axum/Cargo.toml` 版本为 `0.8.9`。同提交还挂 `axum-macros-v0.5.1` 与 `axum-extra-v0.12.6`。
- workspace `rust-version` 为 `1.80`；`axum-core` 路径依赖版本是 `0.5.5`。
- crates.io API 本轮 403，未用 registry `gitHead` 交叉核验。
- 本文未安装依赖、未跑上游测试、未监听端口、未比较吞吐；状态保持 `UNVERIFIED`。

## 学到什么

1. **函数签名可以当抽取配置**——但 body 只能出现一次，而且必须在最后。
2. **`Router<S>` 的 `S` 是“还缺的状态”**，不是“已经注入的状态”。
3. **拒绝状态码要按 rejection 变体读**——JSON 不是一律 400。
4. **tower 中间件是生态，不是默认依赖**——`TimeoutLayer` 要自己加 `tower-http`。

## 应用型自测

1. `Router::new().route("/:id", get(handler))` 在固定 0.8.9 默认会怎样？
2. handler 写了 `State<AppState>` 却不调用 `with_state`，`axum::serve` 能通过编译吗？
3. `Json<T>` 字段缺失时默认是 400 吗？

检查点：

1. 会 panic。默认禁止以 `:` 开头的段，应写成 `{id}`。
2. 不能。只有 `Router<()>` 能 `serve`。
3. 不是。`JsonDataError` 是 422；400 是语法错，415 是缺 JSON Content-Type。

## 延伸阅读

- 固定源码：[tokio-rs/axum](https://github.com/tokio-rs/axum) —— 本文绑定提交 `c59208c86fded335cd85e388030ad59347b0e5ae`
- crate 文档：[docs.rs/axum/0.8.9](https://docs.rs/axum/0.8.9/axum/)
- [[actix-web]] —— 多 worker 工厂 + 宏路由对照
- [[rocket]] —— attribute macro 路由对照
- [[warp]] —— Filter 组合对照
- [[express]] —— 薄框架对照，但没有类型抽取

## 关联

- [[actix-web]] —— 同语言另一条 Web 主链：工厂 / worker / 宏
- [[rocket]] —— 宏驱动路由，不是 tower Service
- [[warp]] —— Filter 积木，不是 handler 签名抽取
- [[express]] —— Node 薄框架，对照“签名抽取 vs 中间件函数”
- [[fastapi]] —— 类型注解驱动 API 的另一条语言路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aspnetcore]] —— ASP.NET Core — 微软跨平台 web 框架
- [[bevy]] —— Bevy — 用 Rust 写游戏的现代 ECS 引擎
- [[conduit]] —— Conduit — Rust 写的极简 Matrix homeserver，单二进制 + 嵌入式数据库
- [[connect-rpc]] —— ConnectRPC — 让 gRPC 在浏览器里裸跑的 RPC 协议
- [[express]] —— Express — Node.js 最经典的 Web 框架
- [[hanami]] —— Hanami — Ruby 里既不是 Rails 也不是 Sinatra 的第三选择
- [[helidon]] —— Helidon — 让 Java 微服务用同步代码写出反应式性能
- [[ktor]] —— Ktor — 用 Kotlin DSL 拼出来的异步 Web 框架
- [[matrix-js-sdk]] —— matrix-js-sdk — Matrix Web/Node 端的"老大哥"客户端 SDK
- [[matrix-rust-sdk]] —— matrix-rust-sdk — Matrix 客户端的"共享发动机"
- [[micronaut]] —— Micronaut — 编译期搞定 DI 的 JVM 云原生框架
- [[phoenix]] —— Phoenix — Elixir/OTP 上的实时 web 框架
- [[plug]] —— Plug — 把 HTTP 中间件写成『conn 进 conn 出』的纯函数
- [[poem]] —— poem — 一份 impl 块同时变 HTTP API + OpenAPI 文档站的 Rust 框架
- [[quarkus]] —— Quarkus — 让 Java 启动比 Node 还快的云原生框架
- [[rails]] —— Ruby on Rails — 约定大于配置的全栈 Web 框架教科书
- [[robyn]] —— Robyn — Rust 内核驱动的 Python 高性能 Web 框架
- [[rocket]] —— Rocket — 用 Rust attribute macro 把路由当函数签名写的 web 框架
- [[salvo]] —— Salvo — 把中间件和处理器统一成一个 Handler trait 的 Rust web 框架
- [[sinatra]] —— Sinatra — 用 Ruby 三行代码起一个 web 服务
- [[slim-framework]] —— Slim — PHP 圈最轻的 web 框架，专给小 API 用
- [[spin]] —— Spin — 用 WebAssembly 模块当 serverless handler 的开源框架
- [[spring-boot]] —— Spring Boot — 用 Auto-configuration 把 Java 后端从 XML 地狱里救出来的事实标准框架
- [[symfony]] —— Symfony — 把 PHP 框架拆成 30 个独立组件再拼起来
- [[tide]] —— Tide — async-std 阵营里 koa 风格的极简 Rust web 框架
- [[vertx]] —— Vert.x — Eclipse 出品的 polyglot reactive JVM toolkit，用事件总线 + verticle 把 Node.js 那套搬到多语言
- [[warp]] —— warp — Rust 里把请求处理拼成 Filter 积木的 web 框架
