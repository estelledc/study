---
title: warp — Rust 里把请求处理拼成 Filter 积木的 web 框架
来源: 'https://github.com/seanmonstar/warp'
日期: 2026-05-30
分类: 后端 API
难度: 中级
---

## 是什么

warp 是一个 **Rust 异步 web 框架**，由 hyper 作者 seanmonstar 维护，核心抽象叫 **Filter**——把"路由匹配 / 提取参数 / 校验 header / 解析 body"通通做成可组合的小函数，用 `.and()`、`.or()` 像积木一样拼起来。日常类比：像安检通道——每一关只负责一件事（看身份证 / 过 X 光 / 验登机牌），过得了所有关的人才到柜台办手续。

你写：

```rust
let hello = warp::path!("hello" / String)
    .map(|name| format!("Hello, {}!", name));
```

这一行就完成了：路由匹配 `/hello/:name`、提取 `name: String`、调用 handler 返回字符串。warp 在编译期把整条 Filter 链的输出类型推出来，handler 的参数列表是自动对上的。

底层基于 `hyper`（HTTP 引擎）和 `tokio`（async runtime），与 actix-web / axum / rocket 同处 Rust web 框架第一梯队。

## 为什么重要

不理解 warp，下面这些事都没法解释：

- 为什么 Rust web 框架能用类型安全组合（而不是字符串路由表）做出路由
- 为什么同一份 Rust 后端，axum 用 `Router::new().route(...)`、warp 用 `.and().or()`，路线分歧的根因在哪
- 为什么"函数式组合中间件"听起来优雅，写多了又会被编译错误劝退
- 为什么 hyper 作者要先做 warp 才做别的——它是 hyper 上层最早的"工程化包装"之一

## 核心要点

warp 的设计可以拆成 **三件事**：

1. **Filter 是一道关卡**：每个 Filter 要么"提取出一个值"（从 path 抽出名字、从 header 抽出 token），要么"拒绝请求"（rejection，像安检没过）。输出是个 **元组**——`Filter<Extract = (String,)>` 表示这关给后面递一张写着 String 的纸条。

2. **`.and()` 串关，`.or()` 换通道**：`a.and(b)` 把两关的纸条拼成更长的元组；`a.or(b)` 是前者拒了才试后者（换通道），不是 HTTP 短路。最后 `.map()` / `.and_then()` 拿到完整元组写 handler。

3. **编译器替你对签名**：你不用手写"这个 handler 收 path + JSON + Authorization"，编译器从 Filter 链推出来。错一个就编译失败——像拼图缺一块，盖不上。

三件事加起来：路由 = Filter 树，中间件 = Filter 装饰，handler = 链末端的 `.map()`。

## 实践案例

### 案例 1：最小 JSON API

```rust
use warp::Filter;

#[tokio::main]
async fn main() {
    let hi = warp::path!("hi" / String)
        .map(|name| format!("hi {}", name));
    warp::serve(hi).run(([127, 0, 0, 1], 3030)).await;
}
```

**逐行解释**：

- `warp::path!("hi" / String)` 匹配 `/hi/:name`，把 `:name` 提取成 `String`
- `.map(|name| ...)` 拿到 `String`，返回响应
- `warp::serve(...).run(...)` 起 HTTP server

整段不用宏定义路由表，类型推导自动对上。

### 案例 2：组合鉴权 Filter

```rust
fn auth() -> impl Filter<Extract = (String,), Error = warp::Rejection> + Clone {
    warp::header::<String>("authorization")
        .and_then(|token: String| async move {
            if token.starts_with("Bearer ") { Ok(token) }
            else { Err(warp::reject::not_found()) }
        })
}

let protected = warp::path!("me")
    .and(auth())
    .map(|token: String| format!("token ok: {}", token));
```

**逐步解释**：

- `auth()` 读 `authorization` 头；像 Bearer 就放行并抽出 token，否则 reject
- `path!("me").and(auth())` 先匹配 `/me`，再过鉴权关——两关纸条拼成 `(token,)`
- `.map(|token| ...)` 只在两关都过了才跑；任何路由 `.and(auth())` 就能复用

### 案例 3：WebSocket echo

```rust
use futures_util::{SinkExt, StreamExt}; // split / forward 需要

let ws = warp::path("ws")
    .and(warp::ws())
    .map(|ws: warp::ws::Ws| {
        ws.on_upgrade(|websocket| async move {
            let (tx, rx) = websocket.split();
            rx.forward(tx).await.ok();
        })
    });
```

**逐步解释**：

- `path("ws").and(warp::ws())`：路径对上且客户端要升级成 WebSocket
- `on_upgrade`：HTTP 握手成功后切到长连接（像电话从拨号切到通话）
- `split` + `forward`：把收到的帧原样发回；依赖 `futures_util`

## 踩过的坑

1. **编译错误信息巨长**：Filter 链类型推导嵌套深，写错一个 `.and()` 顺序，编译器刷几十行 `Filter<Extract = (...,...,...)>` 错误，新手容易劝退。诀窍：从最小可编译版本逐段加 Filter。

2. **`.or()` 不是 HTTP 短路**：`.or()` 只在前者 **reject** 时尝试后者，不是"前者返 4xx 就走后者"。把 `.or()` 当 nginx `try_files` 用会出错。

3. **错误处理必须显式 `recover()`**：Filter 链末尾忘写 `.recover(handle_rejection)`，所有 rejection 默认变 404，让人困惑"我明明返了 401 怎么变 404"。

4. **接 tower 生态需要适配层**：warp 的中间件不是 `tower::Service`，要用 tower 的限流 / 熔断中间件得包一层 adapter——这是 axum 后来在路由层选 tower 的原因之一。

## 适用 vs 不适用场景

**适用**：

- 中小型 JSON API / WebSocket（大约几十个路由以内），喜欢函数式风格
- 需要细粒度组合 Filter（多种鉴权 / 多种 body 类型混合）
- 已经在用 hyper 生态，想要薄包装

**不适用**：

- 团队不熟函数式组合 / 类型推导——上手门槛比 axum 高
- 重度依赖 tower 限流/熔断中间件 → 用 axum
- 要"路由表集中声明" → actix-web 或 rocket 的宏路由
- 大型多人协作 → axum 的 `Router` 更直观

## 历史小故事（可跳过）

- **2018 年前后**：seanmonstar 在 hyper 上层做 warp，发布到 crates.io；当时 Rust 异步还没 stable，`async/await` 1.39 之后大家才开始大规模写
- **2019-2020 年**：warp 成为 Rust web 框架早期代表之一，与 actix-web、rocket 形成三足
- **2021 年**：tokio 团队推出 axum，路由层借鉴 tower::Service 思路，与 warp 路线分化但生态高度互通（都跑 hyper）
- **如今**：warp 仍活跃维护、10k star，社区典型用法是"小型服务 + 喜欢函数式"；axum 因为 tower 生态更广泛，新项目占比上升

## 学到什么

1. **Filter 抽象 = "把请求处理变成函数组合"**——这是从 Haskell servant、Scala finagle 一脉相承的思路，不是 Rust 独创
2. **类型推导越强，编译错误越长**——这是函数式 web 框架的通病，warp / servant 都中招
3. **生态选型比"哪个最优雅"重要**：tower 中间件生态决定了 axum 后来居上，warp 的孤立 Filter 抽象是双刃剑
4. **同一个底层（hyper），上层框架可以走完全不同的设计路线**——warp 选函数式组合，axum 选 Service trait，actix-web 选 actor 模型

## 延伸阅读

- 官方文档：[docs.rs/warp](https://docs.rs/warp/latest/warp/)（Filter trait 一节必读）
- 例子集合：[github.com/seanmonstar/warp/tree/master/examples](https://github.com/seanmonstar/warp/tree/master/examples)（30+ 例子涵盖 WebSocket / TLS / 静态文件）
- 对比文章：搜 "warp vs axum rust" 能看到很多生态讨论
- [[axum]] —— tokio 团队的 web 框架，路由走 tower::Service
- [[actix-web]] —— actor 模型 web 框架，性能 benchmark 常年第一梯队
- [[rocket]] —— 宏驱动路由，强调"看着像 Flask 一样直观"

## 关联

- [[axum]] —— 同样基于 hyper / tokio，路由层选 tower::Service 而非 Filter
- [[actix-web]] —— 另一条路线：actor 模型 + 宏路由
- [[rocket]] —— 宏驱动 web 框架，DX 偏 Flask 风格
- [[hindley-milner]] —— warp 的类型推导背后是 Rust 编译器的 HM 系派生
- [[fastapi]] —— Python 类比物：用类型注解推导 handler 签名

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[fastify]] —— Fastify — 让 schema 替你写校验和序列化的 Node.js 框架
- [[kitty]] —— kitty — GPU 加速终端，把分屏和图片协议焊在一个二进制里
- [[nushell]] —— nushell — 让命令之间传 Excel 表而不是传纸条
- [[plug]] —— Plug — 把 HTTP 中间件写成『conn 进 conn 出』的纯函数
- [[poem]] —— poem — 一份 impl 块同时变 HTTP API + OpenAPI 文档站的 Rust 框架
- [[salvo]] —— Salvo — 把中间件和处理器统一成一个 Handler trait 的 Rust web 框架
- [[slim-framework]] —— Slim — PHP 圈最轻的 web 框架，专给小 API 用
- [[spin]] —— Spin — 用 WebAssembly 模块当 serverless handler 的开源框架
- [[tide]] —— Tide — async-std 阵营里 koa 风格的极简 Rust web 框架
- [[wezterm]] —— WezTerm — Rust 写的 GPU 加速终端，配置用 Lua 还自带多路复用
- [[zsh]] —— zsh — 比 bash 更聪明的兼容派 shell
