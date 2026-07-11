---
title: poem — 一份 impl 块同时变 HTTP API + OpenAPI 文档站的 Rust 框架
来源: 'https://github.com/poem-web/poem'
日期: 2026-05-30
分类: 后端开发
难度: 中级
---

## 是什么

poem 是 sunli829（async-graphql 的作者孙立）发起的 **Rust 异步 Web 框架**。日常类比：像一台『一站式打印机』——你交一份带类型注解的函数集合，它同时吐出 HTTP server、OpenAPI 3 文档和 Swagger UI 三份产物，编译期保证三者口径一致。

它和 [[axum]] 走相反的路：

- axum：薄壳 + 复用 tower / tower-http 中间件生态
- poem：厚壳 + 自带 Endpoint / Middleware 抽象 + OpenAPI / gRPC / Lambda / WebSocket / SSE 全家桶

底层仍是 tokio + hyper，但中间件抽象不强制对接 tower。

```rust
#[handler]
fn hello(Path(name): Path<String>) -> String {
    format!("hello: {name}")
}
let app = Route::new().at("/hello/:name", get(hello));
```

`#[handler]` 把普通 async fn 包成 Endpoint，`Route::new().at` 注册路由——风格接近 [[fastapi]] 的『装饰器即声明』。

## 为什么重要

不理解 poem，下面这些事都没法解释：

- 为什么 Rust 里也能像 [[fastapi]] 那样『写 handler 顺手送一份 Swagger』，而不用挂第三方
- 为什么 NetEase / 海康威视 / Aptos / Databend 这类生产项目愿意用它而不是更主流的 axum
- 为什么 OpenAPI 文档可以从 `impl Api` 直接编译出来，不再写两份 spec
- 为什么 Rust web 生态会同时出现『薄壳派』axum 和『全家桶派』poem 两种活法

## 核心要点

poem 的设计可以拆成 **三个支点**：

1. **#[handler] 宏 = Endpoint 工厂**：普通 async fn 套上 `#[handler]` 就成了 Endpoint trait 实现。类比：包邮贴纸——贴上之后这个函数就『能被 Route 收件』。

2. **#[OpenApi] 宏 = 编译期文档生成**：在 `impl Api` 块上每个方法标 `#[oai(path="/x", method="get")]`，编译器在 build 时同时产出 HTTP endpoint 和 OpenAPI 3 spec。代码编不过 = 文档不合规——一致性由编译器担保。

3. **EndpointExt::with 链式中间件**：`route.with(Tracing).with(Cors::new())` 把中间件套上去，最后一个 `with` 包在最外层。中间件 trait 是 poem 自家定义的，不强制依赖 tower——好处是新手不用先学 Service / Layer，坏处是 tower-http 的现成中间件没法直接复用。

三个支点合起来：**写一份 impl 块，框架替你把 server、文档、Swagger UI 三件事全办了**。

## 实践案例

### 案例 1：Hello World——#[handler] + Route + Server

```rust
use poem::{get, handler, listener::TcpListener, web::Path, Route, Server};

#[handler]
fn hello(Path(name): Path<String>) -> String {
    format!("hello: {name}")
}

#[tokio::main]
async fn main() -> Result<(), std::io::Error> {
    let app = Route::new().at("/hello/:name", get(hello));
    Server::new(TcpListener::bind("0.0.0.0:3000")).run(app).await
}
```

**逐部分解释**：

- `#[handler]` 把普通 fn 包成 Endpoint，类型签名里 `Path<String>` 自动从 URL 抽段
- 路径参数语法是 `:name`，不是 axum 的 `{name}`——迁移时容易踩
- `Server::new(TcpListener::bind(..))` 起服务，无须额外接 hyper

### 案例 2：OpenAPI 一条龙——一份 impl 块出文档站

```rust
use poem_openapi::{payload::PlainText, param::Query, OpenApi, OpenApiService};

struct Api;
#[OpenApi]
impl Api {
    #[oai(path = "/hello", method = "get")]
    async fn index(&self, name: Query<Option<String>>) -> PlainText<String> {
        PlainText(format!("hello, {}", name.0.unwrap_or("world".into())))
    }
}

let api_service = OpenApiService::new(Api, "Hello", "1.0")
    .server("http://localhost:3000/api");
let ui = api_service.swagger_ui();
let app = Route::new().nest("/api", api_service).nest("/docs", ui);
```

**逐部分解释**：

- `#[OpenApi]` impl 块里每个方法标 `#[oai(...)]`，编译期同时产出 endpoint 和 spec
- `OpenApiService::new` 包成 service，`.swagger_ui()` 直接挂个文档站
- 改字段不改文档？不可能——代码编不过文档就编不出来

### 案例 3：中间件链——Tracing + Cors

```rust
use poem::{middleware::{Cors, Tracing}, EndpointExt, Route};

let app = Route::new()
    .at("/api", api_service)
    .with(Tracing)
    .with(Cors::new());
```

**逐部分解释**：

- `.with` 不是 `.layer`——poem 自家的 EndpointExt 扩展方法
- 顺序：最后一个 `with` 包在最外层，请求先过 `Cors`，响应反着走
- Tracing / Cors 都是 poem 自带，无需额外引 tower-http

## 踩过的坑

1. **#[handler] 漏写或路径写错** → 编译期 trait bound 报错十几行，最后一行往往是 `not implemented IntoResponse`，按那一行往上找漏标的函数。
2. **路径参数语法混淆**：原生 poem Route 用 `:name`，poem-openapi 的 `#[oai(path=..)]` 也用 `:name`，但导出的 OpenAPI spec 里会自动转成 `{name}`——从 axum 迁过来的人最容易写错。
3. **中间件套用顺序反直觉**：`.with(A).with(B)` 是『B 包 A 包路由』，所以 B 先看到请求。调试 401 / 超时谁先生效要默念这个顺序。
4. **poem-openapi Schema 嵌套限制**：复杂 enum / Option<Vec<复杂结构>> 经常报『missing IntoSchema』，解法是拆扁平结构再 `#[derive(Object)]`，或为外层手写 `IntoSchema`。

## 适用 vs 不适用场景

**适用**：

- Rust 后端要带 OpenAPI 3 文档的 HTTP API（poem 的杀手锏）
- 想一站式拿 gRPC / Lambda / WebSocket / SSE 而不想自己拼生态的项目
- 团队里有 [[fastapi]] 经验、想保留『装饰器即文档』体验
- 中小团队、希望少做技术选型决策的内部工具与业务 API

**不适用**：

- 已经深度绑定 tower / tower-http 中间件 → [[axum]] 复用度更高
- 极致性能基准压榜（actor 路线略胜）→ [[actix-web]] 仍是 TechEmpower 常客
- 只想写超薄微服务、不要任何宏 → [[warp]] 的 Filter 组合或 hyper 直用更轻
- 不需要 OpenAPI、又想要 Go 风路由组 → [[chi]] / [[echo]] / [[gin]] 在各自语言里更顺

## 历史小故事（可跳过）

- **2021 年**：sunli829 在 async-graphql 之外发起 poem，目标是给 Rust 一个『FastAPI 体验』的 web 框架
- **2022-2023**：poem-openapi 子项目稳定，#[OpenApi] 宏成为卖点；NetEase / 海康威视等公司开始投产
- **2024 年**：1.x → 4.x 系列稳定，gRPC / Lambda / MCP server 集成相继加入
- **2025 年**：4.4k+ star，1500+ commits，进入『活跃维护、API 趋稳』阶段
- **2026 年**：仍由 sunli829 主维护，社区围绕 poem-openapi 生态形成稳定一档

## 学到什么

1. **薄壳 vs 全家桶是两种合理活法**：[[axum]] 选 tower 生态拼装，poem 选自家全家桶——没有谁更对，只有谁更贴你团队的工作习惯
2. **编译期文档一致性是 Rust 类型系统的红利**：把 OpenAPI spec 也变成『编译产物』，跑通一次就再不会和代码漂移
3. **宏不是洪水猛兽**：`#[handler]` / `#[OpenApi]` 只是把样板代码放在编译期生成，错了照样有编译错——和『运行期反射』完全不同
4. **生态深度可以补人才稀缺**：Rust 工程师少，但 poem 把『起一个带文档的 API』压到 50 行内，让小团队也能上船

## 延伸阅读

- 官方 README + examples：[github.com/poem-web/poem](https://github.com/poem-web/poem)（含 50+ 可跑示例）
- docs.rs API 文档：[docs.rs/poem](https://docs.rs/poem/latest/poem/) 与 [docs.rs/poem-openapi](https://docs.rs/poem-openapi/latest/poem_openapi/)
- async-graphql 项目（同作者）——理解 sunli829 的宏设计风格
- [[fastapi]] 官方 tutorial——poem-openapi 的精神原型
- [[axum]] examples 目录——同代 Rust 框架对照阅读

## 关联

- [[axum]] —— Rust 同代薄壳框架，对照看『tower 生态拼装』vs『全家桶』
- [[actix-web]] —— Actor 路线 Rust 老大哥，性能基准常胜
- [[rocket]] —— attribute macro 路由派，宏密度更高但生态更窄
- [[warp]] —— Filter 组合派，类型推导重，poem 的反面教材
- [[fastapi]] —— Python 类型驱动 + OpenAPI 鼻祖，poem-openapi 的精神原型
- [[gin]] —— Go 轻量 web 框架，对照看不同语言的『轻量』含义
- [[http-2]] —— poem 通过 hyper 自动支持 HTTP/2，无需额外配置

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[salvo]] —— Salvo — 把中间件和处理器统一成一个 Handler trait 的 Rust web 框架
- [[tide]] —— Tide — async-std 阵营里 koa 风格的极简 Rust web 框架
