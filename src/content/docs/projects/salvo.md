---
title: Salvo — 把中间件和处理器统一成一个 Handler trait 的 Rust web 框架
来源: 'https://github.com/salvo-rs/salvo'
日期: 2026-05-30
分类: 后端开发
难度: 中级
---

## 是什么

Salvo 是一个 **Rust 异步 Web 框架**，定位『简单到写一个函数就能当 handler』。日常类比：像一家餐厅决定不再区分『厨师』和『传菜员』——所有人都挂同一种围裙、用同一种工作流，谁路过哪张桌子都能接活。框架里的 middleware 和路由 handler 长得一模一样，挂在路由树的任意节点都行。

它和 [[axum]] / [[actix-web]] 一样跑在 hyper + tokio 之上，区别在于上层抽象选择：

- **统一 Handler**：一个 `#[handler]` 过程宏把普通 async fn 变成 `Handler` trait 实现。中间件、路由处理器都是 Handler，没有第二种类型
- **树状路由**：`Router` 可以无限嵌套 push 子路由，`hoop` 在任意子树挂中间件
- **开箱主义**：OpenAPI 自动生成、WebSocket、HTTP/2-3、Let's Encrypt、gRPC 都内置

```rust
#[handler]
async fn hello() -> &'static str { "Hello, Salvo" }
let router = Router::new().get(hello);
```

## 为什么重要

不理解 Salvo，下面这些事都没法解释：

- 为什么 Rust web 圈在 axum / actix-web 之外还要再造一个框架，Salvo 想解决什么差异化问题
- 为什么『中间件 == handler』这个看似激进的统一能让代码量真的减少
- 为什么国内中文社区的 Rust 后端项目里 Salvo 出现频率高于英文圈
- 为什么 OpenAPI 自动生成、ACME 自动证书在 Salvo 里是开箱默认而不是第三方拼接

## 核心要点

Salvo 的设计可以拆成 **三个支点**：

1. **Handler 即一切**：用 `#[handler]` 装饰一个 async fn，编译器自动给它实现 `Handler` trait。同一个 trait 既能当中间件也能当业务处理器，挂的位置决定身份。类比：万能员工——同一份合同，分到前台是接待、分到后厨是切菜。

2. **Router 树状嵌套**：`Router::with_path("/api").push(子路由)` 可以无限往下嵌，`hoop(middleware)` 在当前节点开始的整棵子树都生效。类比：组织架构图——总监给子部门定的规矩，所有下属都要遵守，但平级不互相影响。

3. **Depot 取代『context 对象』**：请求级的共享数据塞 `Depot`（类型擦除的 key-value 存储），handler 之间通过 `depot.insert("user", u)` / `depot.obtain::<User>()` 传递。类比：餐厅传菜带的小托盘——前一个工位放上去，后一个工位拿下来。

三个支点合起来：**写一个函数就是 handler，组装服务就是 router 拼树，跨层数据走 depot**。

## 实践案例

### 案例 1：Hello World——一个 handler 一个路由

```rust
use salvo::prelude::*;

#[handler]
async fn hello() -> &'static str {
    "Hello, Salvo!"
}

#[tokio::main]
async fn main() {
    let router = Router::new().get(hello);
    let acceptor = TcpListener::new("127.0.0.1:5800").bind().await;
    Server::new(acceptor).serve(router).await;
}
```

**逐部分解释**：

- `#[handler]` 把 `hello` 这个普通 async fn 编译成 `impl Handler`
- `Router::new().get(hello)` 注册『GET / 走 hello』，链式调用很像构建 DSL
- `TcpListener::new(...).bind().await` 是 Salvo 的 acceptor 抽象（也支持 RustlsListener / QuinnListener 走 HTTPS / HTTP3）
- 整个程序没有显式实现 trait，过程宏帮你做了

### 案例 2：JSON API + OpenAPI 自动文档

```rust
use salvo::prelude::*;
use salvo::oapi::extract::*;
use serde::{Deserialize, Serialize};

#[derive(Deserialize, ToSchema)]
struct CreateUser { name: String }

#[derive(Serialize, ToSchema)]
struct User { id: u64, name: String }

#[endpoint]
async fn create(body: JsonBody<CreateUser>) -> Json<User> {
    Json(User { id: 1, name: body.into_inner().name })
}
```

**逐部分解释**：

- `#[endpoint]` 是 `#[handler]` 的增强版——同时把 schema 信息注入 OpenAPI registry
- `JsonBody<CreateUser>` 自动 deserialize 请求体，失败则自动返回 400
- 返回 `Json<User>` 自动 serialize + Content-Type: application/json
- 启动时挂个 `OpenApi::new(...).into_router("/swagger.json")` 就有 swagger.json，连带 SwaggerUi 子路由几行接通

### 案例 3：树状路由 + 鉴权 hoop——保护一个子树

```rust
#[handler]
async fn jwt_auth(req: &mut Request, depot: &mut Depot,
                   res: &mut Response, ctrl: &mut FlowCtrl) {
    if req.header::<String>("authorization").is_none() {
        res.status_code(StatusCode::UNAUTHORIZED);
        ctrl.skip_rest();
    }
}

let router = Router::new()
    .push(Router::with_path("health").get(|| async { "ok" }))
    .push(Router::with_path("api")
        .hoop(jwt_auth)
        .push(Router::with_path("users").get(list_users)));
```

**逐部分解释**：

- 第一棵子树 `/health` 不挂 hoop，公开访问
- 第二棵子树 `/api` 用 `hoop(jwt_auth)` 挂中间件，下面所有 push 进来的子路由都自动套
- `FlowCtrl::skip_rest` 提前结束流程，类似 express 不调 `next()`
- `Depot` 没出现是因为这个例子没用上——真实业务里中间件会 `depot.insert("user", u)` 传给 handler

## 踩过的坑

1. **`#[handler]` 改了函数签名后报错追不到源**：因为宏展开生成 impl Handler，签名错（漏 `async`、参数类型不能 extract、返回类型不 impl Writer）会让编译器在 trait bound 上喷整屏，先看 `expected ... found ...` 最后一行 trait 名定位真因
2. **hoop 挂的层级决定影响范围**：`Router::new().hoop(mw).push(a).push(b)` 的 mw 影响 a 和 b；但 `Router::new().push(a).hoop(mw).push(b)` 的 mw 只影响 b（顺序 sensitive），新手常以为 hoop 是 builder 风格无序的
3. **Depot 是类型擦除的，错 key 不报错只 panic**：`depot.obtain::<User>()` 取不到时返回 `Err`，但代码常用 `unwrap()` 上线就 500，建议封一层 `must_user(depot) -> User` 集中处理
4. **handler 返回 Result<T, E> 时 E 必须 impl Writer**：不像 axum 默认把 anyhow::Error 当 500，Salvo 要求自定义错误类型实现 `Writer` trait 才能自动转响应——常见做法定义 `AppError` enum 然后 impl Writer

## 适用 vs 不适用场景

**适用**：

- 想要『写函数就是 handler』的极简体感，且需要内置 OpenAPI / Let's Encrypt / HTTP3 的项目
- 中文文档/社区为主的 Rust 后端团队（中文资料密度高于 axum）
- 中等复杂度业务，喜欢树状路由 + 子树挂中间件的组织方式
- 想试试 Rust web 但又怕 actix-web 的 actor 抽象 / [[rocket]] 的宏魔法

**不适用**：

- 已经深度依赖 tower/tower-http 中间件生态 → [[axum]] 直接复用更省心
- 极致性能压榜（TechEmpower 之类） → [[actix-web]] 历史最优
- 团队没 Rust 经验且工期紧 → 先用 [[fastapi]] 或 [[express]] 上线再迁
- 需要 actor 模型原生支持 → actix 系更对路

## 历史小故事（可跳过）

- **2019 年**：开发者 Chrislearn 启动 Salvo，目标是『让 Rust web 像 koa 一样易写』，反对 actix 的复杂度和 rocket 早期需要 nightly 的门槛
- **2021 年**：跟随 tokio 1.0 + hyper 0.14 进入稳定期，`#[handler]` 宏定型
- **2023 年**：内置 OpenAPI 模块成熟，可以用 `#[endpoint]` 同时做路由和文档
- **2024 年**：跟进 hyper 1.0 大版本，加入 HTTP/3 (QUIC) 与 ACME 自动证书
- **2025-2026**：版本走到 0.94+，4.4k+ stars，unsafe forbidden，中文社区活跃

## 学到什么

1. **抽象统一可以减少认知负担**：把 middleware 和 handler 合成同一个 trait，写法一致后，新手不用先记两套 API
2. **路由树 + 子树中间件**比平铺 `app.use(mw)` 更适合大型 API 网关——子树继承 + 子树独享同时存在
3. **类型擦除 Depot 是双刃剑**：方便跨 handler 共享，但失去编译期保护，需要团队约定『统一封装 must_xxx 取数』的风格
4. **小众框架靠开箱体验突围**：在 axum 已成事实标准的环境下，Salvo 用『内置 OpenAPI / ACME / HTTP3』和『中文文档优先』找到生态位

## 延伸阅读

- 官方 README + examples：[github.com/salvo-rs/salvo](https://github.com/salvo-rs/salvo)（80+ 可跑示例）
- 官方文档站：[salvo.rs](https://salvo.rs)（中英双语，中文部分更详细）
- docs.rs API：[docs.rs/salvo/latest/salvo](https://docs.rs/salvo/latest/salvo/)（trait / 宏 / Listener 全列）
- [[axum]] —— 官方 tokio 阵营对照阅读，看『统一 Handler』vs『tower Service』两种思路
- [[actix-web]] —— Rust 最早成熟 web 框架，actor 模型路线
- [[rocket]] —— 用宏当配置语言的早期代表，对照 Salvo 的『宏只装饰单函数』

## 关联

- [[axum]] —— Tokio 官方 web 框架，类型驱动 + tower 中间件，与 Salvo 的统一 Handler 思路对照
- [[actix-web]] —— Rust 性能榜首框架，actor 模型路线，与 Salvo 的极简路线对比
- [[rocket]] —— 宏驱动 Rust web 框架，与 Salvo 的『宏只点缀』形成对比
- [[warp]] —— Filter 组合子风格，与 Salvo 的树状路由是两种组织方式
- [[poem]] —— 同样主打 OpenAPI 自动生成的 Rust 框架，定位重叠最多
- [[tide]] —— async-std 阵营 koa 风格框架，理念相近（极简 + 中间件）
- [[fastapi]] —— Python 类型驱动 API 框架，OpenAPI 自动生成思路一致

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
