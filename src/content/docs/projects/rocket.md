---
title: Rocket — 用 Rust attribute macro 把路由当函数签名写的 web 框架
来源: 'https://github.com/rwf2/Rocket'
日期: 2026-05-30
分类: backend-api
难度: 中级
---

## 是什么

Rocket 是 **Rust 上最像 Flask / Django 的 web 框架**，主张『handler 函数签名就是 API 文档』。日常类比：像一份**报关单**——你在函数参数里勾哪些项（路径段 / 查询串 / JSON body / 鉴权头），Rocket 这个海关就只放对得上号的请求过去，对不上的在你函数被调用前就退回去。

写一个最小服务长这样：

```rust
#[macro_use] extern crate rocket;

#[get("/hello/<name>/<age>")]
fn hello(name: &str, age: u8) -> String {
    format!("Hello {name}, age {age}")
}

#[launch]
fn rocket() -> _ {
    rocket::build().mount("/", routes![hello])
}
```

`#[get("/hello/<name>/<age>")]` 这一行 attribute macro 既声明路由也声明类型——age 不是数字直接 404，name 没填直接 404，全在 Rocket 内部消化掉。这正是 Rocket 跟 [[axum]] / [[actix-web]] 最大的差异：**它愿意用宏把更多事情藏在编译期**。

## 为什么重要

不理解 Rocket，下面这些事都没法解释：

- 为什么 Rust 社区流传『Rocket 是 Flask 转 Rust 的最佳路径』——它的 DX 确实最像 Python 派
- 为什么 2017-2023 年那么多 Rust 教程开头都让你 `rustup default nightly`——Rocket 0.4 强依赖 nightly
- 为什么 2024 年后又涌现一批『从 actix 迁回 Rocket』的帖子——0.5 终于 stable + 异步重写
- 为什么 Rust web 圈有『请求守卫』这个概念——它是 Rocket 发明的术语

## 核心要点

Rocket 的设计可以拆成 **三个支点**：

1. **attribute macro 声明路由**：`#[get("/path/<id>")]` 直接写在普通函数上，宏把路径模板、HTTP 方法、参数名称对齐到函数签名。类比：贴在快递盒子上的运单——盒子（函数）和运单（路由声明）粘在一起，不会错配。

2. **请求守卫（Request Guards）**：handler 的每个参数类型都得实现 `FromRequest` trait，Rocket 调你函数前先逐个『从请求里抽出来』，抽不出来就拒绝整个请求。鉴权、限流、租户隔离都靠这个统一抽象。

3. **Responder + Fairings**：返回类型实现 `Responder` 决定怎么写回 HTTP 响应（`String` 写文本、`Json<T>` 写 JSON、`Redirect` 写 302）。Fairings 是全局钩子（启动 / 进 / 出 / 关闭），用于日志、CORS、metric 这种跨路由关切。

三件合起来：**写 handler 像写普通带返回值的函数，认证和序列化全靠类型驱动**。

## 实践案例

### 案例 1：Hello World——路径参数自动类型转换

```rust
#[macro_use] extern crate rocket;

#[get("/hello/<name>/<age>")]
fn hello(name: &str, age: u8) -> String {
    format!("Hello {name}, age {age}")
}

#[launch]
fn rocket() -> _ {
    rocket::build().mount("/", routes![hello])
}
```

**逐部分解释**：

- `<name>` 是路径段，`name: &str` 接住；`<age>` 因为函数签名是 `u8`，传 `/hello/alice/abc` 直接 404
- `#[launch]` 是 Rocket 0.5 的入口宏，自动跑 tokio runtime
- `routes![hello]` 把 `#[get]` 标注过的函数收集成一个数组挂到 `/`

不需要单独写路由表 / 单独写参数解析，全在签名里说完。

### 案例 2：请求守卫——把鉴权写成『一个参数类型』

```rust
use rocket::request::{FromRequest, Outcome, Request};

struct ApiKey<'r>(&'r str);

#[rocket::async_trait]
impl<'r> FromRequest<'r> for ApiKey<'r> {
    type Error = ();
    async fn from_request(req: &'r Request<'_>) -> Outcome<Self, Self::Error> {
        match req.headers().get_one("x-api-key") {
            Some(k) if k == "secret" => Outcome::Success(ApiKey(k)),
            _ => Outcome::Error((rocket::http::Status::Unauthorized, ())),
        }
    }
}

#[get("/admin")]
fn admin(_key: ApiKey<'_>) -> &'static str { "ok" }
```

**逐部分解释**：

- 自定义 `ApiKey` 类型，给它实现 `FromRequest`：从 header 读 `x-api-key`
- handler 签名里只要参数 `_key: ApiKey<'_>` 出现，Rocket 就强制先跑这段守卫
- `Outcome::Error` 直接返回 401，`Success` 才会调用 admin 函数体

鉴权抽象成『多写一个参数类型』，不需要中间件链路。

### 案例 3：managed state + JSON 反序列化

```rust
use rocket::{State, serde::json::Json};
use serde::Deserialize;

struct Db { url: String }

#[derive(Deserialize)]
struct NewUser { email: String }

#[post("/users", data = "<user>")]
fn create(db: &State<Db>, user: Json<NewUser>) -> String {
    format!("save {} into {}", user.email, db.url)
}

#[launch]
fn rocket() -> _ {
    rocket::build()
        .manage(Db { url: "postgres://...".into() })
        .mount("/", routes![create])
}
```

**逐部分解释**：

- `.manage(Db {...})` 注入一个全局单例，handler 用 `db: &State<Db>` 拿到引用
- `data = "<user>"` 告诉 Rocket『body 反序列化成名为 user 的参数』
- `Json<NewUser>` 自动按 serde 规则解析，类型不对自动 422

整段没有显式调 `serde_json::from_slice`、没有手抓 body，行为靠类型推导出来。

## 踩过的坑

1. **0.4 vs 0.5 教程混着抄会编译失败**——很多旧文一上来就 `rustup default nightly` 加 `proc-macro-hack`，2024 年后用 0.5 stable Rust，宏路径从 `rocket_codegen::*` 改到 `rocket::*`，老代码一搬一片报错，建议只看官方 0.5 docs。

2. **请求守卫三态 Success/Error/Forward 容易写错**——`Outcome::Forward` 不是『拒绝请求』而是『让这条路由放弃，继续 match 下一条』，写守卫时返回 `Forward` 但没有兜底路由，最终客户端只看到 404，根本看不到守卫拒绝的原因。

3. **handler 参数顺序有隐式语义**——Rocket 解析成『先 path 段 → 再 query / state / 守卫 → 再 body』，乱顺序看似能编译但 422 来得莫名其妙；建议照着 routes! 报错信息排，或者所有 path 段先写。

4. **Fairings 没办法按路由分层**——它只能 attach 在整个 Rocket 实例上，所有请求都会过；想做『仅 /admin 路径下加日志』只能在守卫里写 if，或拆 Rocket 实例 mount 到不同前缀，不像 [[axum]] 的 tower middleware 能精确套到某棵子树。

## 适用 vs 不适用场景

**适用**：

- 团队从 Flask / Django 迁过来，想要熟悉的『装饰器风格』而不是函数式中间件链
- API 鉴权 / 多租户 / 上下文注入逻辑很重，希望写成『一个守卫类型』编译器替你检查所有 handler 都用上
- 想要『写少一点样板就能跑起来』的内部工具 / 教学项目

**不适用**：

- 需要按路由树细粒度套中间件（认证 / 限流 / trace 各加一层）—— [[axum]] 基于 tower 更合适
- 极限性能 / TechEmpower 卷王场景—— [[actix-web]] 在裸吞吐上仍领先
- 团队完全不接受『attribute macro 黑魔法』、坚持 explicit-over-implicit ——选 axum 这种『handler 是普通 fn pointer』的更顺

## 历史小故事（可跳过）

- **2016 年**：Sergio Benitez 在 Stanford 读 PhD 期间启动 Rocket，灵感来自 Flask + Sinatra
- **2017 年**：0.3 发布，nightly procedural macro 做编译期路由/参数校验，社区震撼
- **2018-2022 年**：长期是 Rust 上『最易上手 web 框架』，但 nightly 依赖让生产团队望而却步
- **2023 年 11 月**：0.5.0 首个 stable，迁到 stable Rust + tokio + hyper；治理迁到 RWF2
- **2024 年 5 月**：0.5.1 补丁发布，企业选型讨论明显回暖

## 学到什么

1. **类型系统能替你做的，框架就替你做掉**——鉴权、参数解析、响应序列化做成 trait，编译器在调 handler 前检查
2. **attribute macro 是 DX 利器也是技术债**——0.4 的 nightly 依赖卡死很多团队，DSL 越魔法越难升级
3. **请求守卫 vs 中间件不是同一个抽象**——守卫绑参数类型，中间件绑路由/服务，组合方式完全不同
4. **stable + governance 才是进生产的两道门**——0.5 stable + RWF2 让 Rocket 重新进入企业选型清单

## 延伸阅读

- 官方文档：[rocket.rs](https://rocket.rs/)（Quickstart + Guide 零基础友好）
- GitHub：[rwf2/Rocket](https://github.com/rwf2/Rocket)
- [[actix-web]] —— Rust 另一主流 web 框架，吞吐导向
- [[axum]] —— Tokio 官方，tower 中间件生态
- [[fastapi]] —— Python 上类型驱动 web 的代表，思路最像

## 关联

- [[axum]] —— 同领域、tower middleware 派、无宏路由声明
- [[actix-web]] —— 同领域、actor 起家、TechEmpower 卷王
- [[fastapi]] —— Python『类型即文档』代表，思路最像 Rocket
- [[express]] —— Node 老牌动态类型 web，反衬静态类型代价
- [[gin]] —— Go 高性能 web，路由用方法链而非 attribute
- [[chi]] —— Go 极简路由库，对比 Rocket『宏 + 类型』重量级

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

