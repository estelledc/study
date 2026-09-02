---
title: Actix Web — 多 worker 工厂 + 类型 extractor 的 Rust Web 框架
来源: 'https://github.com/actix/actix-web'
日期: 2026-08-27
分类: backend-api
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/actix/actix-web
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 5723cf486522d47aad26390cf5b02e95654ae225
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.15.0
---

## 是什么

Actix Web 是一个 **Rust HTTP 框架**：`HttpServer` 按 worker 拉起线程，每个 worker 用工厂闭包各建一份 `App`，handler 再用类型 extractor 从请求里取路径、query 或 JSON。日常类比：总店按核数开收银台，每个柜台自己组装扫码枪和抽屉，但共享库存必须先包成可克隆的句柄。

```rust
use actix_web::{get, App, HttpServer, Responder};

#[get("/hello/{name}")]
async fn greet(name: actix_web::web::Path<String>) -> impl Responder {
    format!("Hello {name}!")
}

#[actix_web::main] // 或 #[tokio::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| App::new().service(greet))
        .bind(("127.0.0.1", 8080))?
        .run()
        .await
}
```

名字里的 actix 来自早期 actor crate。固定 4.15.0 的 HTTP 主线是函数 handler；`actix` actor / `actix-web-actors` 仍要 `System`，不能只靠 `#[tokio::main]`。

## 为什么重要

不按固定 4.15.0 源码读 Actix Web，下面这些印象会对不上：

- worker 默认数写在 `HttpServer::workers()` 里，依据是 `std::thread::available_parallelism()`，不是“随便猜几个核”
- 共享状态漏注册 `web::Data<T>` 时，extractor 会 500，不是编译期拦下
- 每个 worker 是单线程 runtime，同步阻塞会卡住该 worker 上的全部连接
- JSON 超限是 413，字段反序列化失败才是 400

## 核心要点

固定 4.15.0 的主链可以拆成五步：

1. **工厂 × worker × bind 地址**：`HttpServer::new(factory)` 的闭包至少每个 worker 跑一次。`run()` 再按每个成功 bind 的地址开一组 worker。2 个 worker × 2 个地址就是 4 次工厂实例化。

2. **默认 worker 数按 `available_parallelism()`**：`workers(n)` 要求 `n > 0`，否则 panic。`run()` 另一段文档写成 “physical cores”，与 `workers()` 的 API 注释不完全同词；本文按 `workers()` 合同写。

3. **类型 extractor**：`web::Path<T>` / `Query<T>` / `Json<T>` 实现 `FromRequest`。payload 只能被一个 extractor 消费。`Json` 默认 limit 是 `2_097_152` 字节。

4. **`web::Data<T>` 是 Arc 句柄**：共享可变状态应在 `HttpServer::new` 闭包外 `Data::new(...)`，再 `app_data` 进去。嵌套 `Scope` 会取“最近的一份”同类型数据。

5. **中间件后注册先执行**：`wrap()` 用 `Transform` 包当前 endpoint；文档写明请求先进入最后一次 `wrap` 的中间件。

## 实践示例

### 案例 1：宏路由 + 路径抽取

```rust
use actix_web::{get, App, HttpServer, Responder};

#[get("/hello/{name}")]
async fn greet(name: actix_web::web::Path<String>) -> impl Responder {
    format!("Hello {name}!")
}
```

`macros` 是默认 feature。也可以不用宏，改 `web::resource("/hello/{name}").route(web::get().to(greet))`。

### 案例 2：共享计数器必须在工厂外构造

```rust
use actix_web::{post, web, App, HttpServer};
use std::sync::Mutex;

struct AppState { count: Mutex<u32> }

#[post("/inc")]
async fn inc(data: web::Data<AppState>) -> String {
    let mut c = data.count.lock().unwrap();
    *c += 1;
    format!("now={}", *c)
}

let state = web::Data::new(AppState { count: Mutex::new(0) });
HttpServer::new(move || {
    App::new()
        .app_data(state.clone())
        .service(inc)
})
```

`Data` 内部是 `Arc`，clone 便宜。把 `Data::new` 写进工厂闭包会让每个 worker 各持一份。

### 案例 3：JSON 默认 2MB

```rust
use actix_web::{post, web};
use serde::Deserialize;

#[derive(Deserialize)]
struct Signup { email: String, password: String }

#[post("/signup")]
async fn signup(form: web::Json<Signup>) -> String {
    format!("registered: {}", form.email)
}
```

`JsonConfig::limit` 可改上限。overflow 是 413；`ContentType` / `Deserialize` 是 400；响应侧 `Serialize` 失败是 500。

## 踩过的坑

1. **漏掉 `app_data(web::Data::new(...))`**：`Data<T>` extractor 在找不到实例时写 500。
2. **在 handler 里跑同步阻塞**：每个 worker 单线程。大文件 `std::fs::read` 或 `thread::sleep` 会饿死该 worker；应 `web::block`（内部 `spawn_blocking`）或 async I/O。
3. **把 `#[tokio::main]` 用到 actor WebSocket**：HTTP 可以；`actix-web-actors` 仍要 `#[actix_web::main]` 建 `System`。
4. **`wrap()` 顺序按注册顺序理解**：最后 `wrap` 的中间件最先看到请求。把 Logger 放在认证前面还是后面，结果相反。
5. **`Route::to()` 写在 `Route::wrap()` 之后**：4.14.0 起会 panic，避免静默丢掉 route 中间件。

## 适用 vs 不适用场景

**适用**：

- 需要多 worker、默认 HTTP/2、压缩和 cookie 都在默认 features 里的 Rust HTTP 服务
- 已有 actix-web 4.x 代码，或需要 `#[get]` 宏路由
- 接受 MSRV 1.88，以及“每个 worker 一份 App”的工厂模型

**不适用**：

- 团队不能接受 Rust 生命周期 / 单线程 worker 的阻塞纪律
- 想要 tower `Service` 中间件生态、而不是 `Transform` / `wrap`——看 [[axum]]
- 想把静态阅读写成 TechEmpower 名次或吞吐结论——本文没有跑 benchmark

## 固定版本边界

- 本文绑定 `actix/actix-web@5723cf486522d47aad26390cf5b02e95654ae225`。lightweight tag `web-v4.15.0` 直接指向该提交；`actix-web/Cargo.toml` 版本为 `4.15.0`。
- workspace `rust-version` 为 `1.88`。4.15.0 增加 `Error::add_response_mapper()`，并移除实验 feature `experimental-io-uring`。
- crates.io API 本轮 403，未用 registry 交叉核验。
- 本文未安装依赖、未跑上游测试、未监听端口、未比较吞吐；状态保持 `UNVERIFIED`。

## 学到什么

1. **多 worker 不是“一个 App 被线程共享”**——工厂会按 worker × 地址反复建 App。
2. **`Data<T>` 是显式 Arc 句柄**——漏注册是 500，不是“编译器替你补上”。
3. **单线程 worker 把阻塞变成可用性 bug**——`web::block` 才是同步工作的出口。
4. **名字里的 actor 不是 HTTP 主线**——4.15.0 日常路径是函数 handler + extractor。

## 应用型自测

1. 不调用 `workers()` 时，worker 数按什么 API 决定？
2. handler 取 `web::Data<AppState>` 但 App 没 `app_data`，默认响应是什么？
3. `#[tokio::main]` 能否替代 `#[actix_web::main]` 去跑 `actix-web-actors`？

检查点：

1. `HttpServer::workers()` 文档：`std::thread::available_parallelism()`。
2. 500。`Data<T>` 找不到实例会 Internal Server Error。
3. 不能。actor / 这条 WebSocket 路径仍要 `System`。

## 延伸阅读

- 固定源码：[actix/actix-web](https://github.com/actix/actix-web) —— 本文绑定提交 `5723cf486522d47aad26390cf5b02e95654ae225`
- 指南：[actix.rs](https://actix.rs/)
- crate 文档：[docs.rs/actix-web/4.15.0](https://docs.rs/actix-web/4.15.0/actix_web/)
- [[axum]] —— tower Service + 签名抽取对照
- [[rocket]] —— 宏路由另一条 Rust 路线
- [[express]] —— 动态 handler 对照，没有 worker 工厂

## 关联

- [[axum]] —— `Router<S>` / `with_state` vs `HttpServer` 工厂 + `Data`
- [[rocket]] —— attribute macro 路由
- [[warp]] —— Filter 组合，不是 factory + extractor
- [[express]] —— 单进程中间件栈，对照多 worker 工厂
- [[fastapi]] —— 类型注解抽取的另一条语言路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[axum]] —— axum — 用 Rust 类型系统当『路由参数表』的 Web 框架
- [[bevy]] —— Bevy — 用 Rust 写游戏的现代 ECS 引擎
- [[embassy]] —— Embassy — 让单片机也能用 async/await
- [[embedded-hal]] —— embedded-hal — Rust 嵌入式硬件抽象的统一接口
- [[helidon]] —— Helidon — 让 Java 微服务用同步代码写出反应式性能
- [[lucia]] —— Lucia — 主动把自己降级为"学习资源"的 TS 认证库
- [[matrix-rust-sdk]] —— matrix-rust-sdk — Matrix 客户端的"共享发动机"
- [[micronaut]] —— Micronaut — 编译期搞定 DI 的 JVM 云原生框架
- [[plug]] —— Plug — 把 HTTP 中间件写成『conn 进 conn 出』的纯函数
- [[poem]] —— poem — 一份 impl 块同时变 HTTP API + OpenAPI 文档站的 Rust 框架
- [[robyn]] —— Robyn — Rust 内核驱动的 Python 高性能 Web 框架
- [[rocket]] —— Rocket — 用 Rust attribute macro 把路由当函数签名写的 web 框架
- [[salvo]] —— Salvo — 把中间件和处理器统一成一个 Handler trait 的 Rust web 框架
- [[slim-framework]] —— Slim — PHP 圈最轻的 web 框架，专给小 API 用
- [[tide]] —— Tide — async-std 阵营里 koa 风格的极简 Rust web 框架
- [[warp]] —— warp — Rust 里把请求处理拼成 Filter 积木的 web 框架
