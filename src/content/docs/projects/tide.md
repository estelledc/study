---
title: Tide — async-std 阵营里 koa 风格的极简 Rust web 框架
来源: 'https://github.com/http-rs/tide'
日期: 2026-05-30
分类: backend-api
难度: 中级
---

## 是什么

Tide 是 http-rs 组织（async-std 团队）做的一个**极简 Rust web 框架**，写法上明显照着 Node 的 koa 抄。日常类比：如果说 axum / actix-web 是"装备齐全的赛车"，tide 就是**老款两厢手动挡**——挡少、内饰朴素、读说明书 30 分钟就能上路。

最小例子：

```rust
#[async_std::main]
async fn main() -> tide::Result<()> {
    let mut app = tide::new();
    app.at("/hello").get(|_req| async { Ok("hi") });
    app.listen("127.0.0.1:8080").await?;
    Ok(())
}
```

`app.at(path).get(handler)` 这套写法，和 koa 的 `router.get(path, handler)` 几乎一一对应。tide 最后一个 release 是 2021 年 12 月的 0.16.0-beta.2，仓库长期低活跃，但作为"async runtime + middleware + endpoint 怎么拼"的教学样本仍然非常清晰。

## 为什么重要

不理解 tide，下面这些事都没法解释：

- 为什么 Rust async web 框架早期会同时存在 tide / warp / actix-web / rocket 四套，背后是 async-std vs tokio 的运行时分裂
- 为什么"中间件链"在 Rust 里会写得像俄罗斯套娃，而不是 Express 那种 `app.use()` 一键挂上
- 为什么一个项目"5k star + 文档齐全"也可能被时代抛下——生态押注错运行时是致命的
- 为什么读 tide 源码比读 axum 源码容易：层数少、抽象浅，是入门 web 框架内部结构的好标本

## 核心要点

tide 的世界由**三件套**撑起来：

1. **Endpoint**：handler 抽象。任何 `async fn(Request<State>) -> tide::Result<Response>` 都自动实现 Endpoint trait。类比：饭馆里能"接菜单、出菜"的厨师都算 Endpoint，不挑你是谁。

2. **Middleware + Next**：中间件链。Middleware 拿到 Request 和 `Next`，自己决定要不要调 `next.run(req).await` 继续往下走。类比：流水线上每个工人手里有把"放行钥匙"，不放就拦截。

3. **Server\<State\>**：泛型 State。`tide::with_state(my_state)` 把任意类型 State 注入，handler 通过 `req.state()` 拿到——这是 Rust 里"无全局变量"的共享方式。类比：每张点餐单都附一份后厨档案，谁拿到单子谁顺手就有档案。

三件套加起来，就是一套**"async fn 当 handler、Box\<dyn Future\> 当中间件、泛型当依赖注入"**的最小 web 框架。

## 实践案例

### 案例 1：带共享状态的计数器

```rust
use tide::Request;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

#[derive(Clone)]
struct State { counter: Arc<AtomicU64> }

#[async_std::main]
async fn main() -> tide::Result<()> {
    let state = State { counter: Arc::new(AtomicU64::new(0)) };
    let mut app = tide::with_state(state);
    app.at("/hit").get(|req: Request<State>| async move {
        let n = req.state().counter.fetch_add(1, Ordering::SeqCst);
        Ok(format!("count: {}", n + 1))
    });
    app.listen("127.0.0.1:8080").await?;
    Ok(())
}
```

`with_state` 把计数器存进框架；handler 通过 `req.state()` 读出来。每次访问 `/hit`，counter 加一。

### 案例 2：写一个最小日志中间件

```rust
struct Log;
#[tide::utils::async_trait]
impl<S: Clone + Send + Sync + 'static> tide::Middleware<S> for Log {
    async fn handle(&self, req: tide::Request<S>, next: tide::Next<'_, S>) -> tide::Result {
        let path = req.url().path().to_string();
        let res = next.run(req).await;
        println!("{} -> {}", path, res.status());
        Ok(res)
    }
}

// 用法：app.with(Log);
```

中间件先记请求路径，调用 `next.run(req).await` 让请求继续往下走，最后打印状态码。**注册顺序就是执行顺序**。

### 案例 3：JSON echo

```rust
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize)]
struct Msg { text: String }

app.at("/echo").post(|mut req: tide::Request<()>| async move {
    let body: Msg = req.body_json().await?;
    Ok(tide::Body::from_json(&body)?)
});
```

`req.body_json()` 自动用 serde 反序列化；`Body::from_json` 反过来序列化回去。`tide::Result<T>` 用 `?` 简化错误处理。

## 踩过的坑

1. **把 tide 当 2026 年生产首选**：仓库基本停更，新生态围绕 axum/tokio 走；新项目应该选 axum，把 tide 当历史教材。

2. **运行时混用**：tide 绑 async-std，把 tokio-only 的库（如 `reqwest` 默认 feature）直接塞进 handler，会触发 "no reactor running" 类报错——必须用 async-std 兼容的版本或包一层 `async_compat`。

3. **State 写法错位**：忘记 `with_state` 直接 `tide::new()`，handler 拿到的是 `Request<()>`，调用 `req.state()` 会编译报错。新人常被泛型类型推不出搞晕。

4. **中间件顺序写反**：`app.with(Log).with(Auth)` 的执行顺序是先 Log 再 Auth；如果想"先鉴权再日志"得调过来。把日志放在 auth 之后会漏记被拒绝的请求。

## 适用 vs 不适用场景

**适用**：
- 学习 Rust async web 框架内部结构（源码量小、层次清晰）
- 写小工具 / 内部 demo（团队已有 async-std 经验）
- 教学：演示"endpoint + middleware + state"三件套
- 维护已有 tide 项目，不想立刻迁移

**不适用**：
- 2026 年新建生产服务（社区主流是 axum，生态、维护、招聘都更好）
- 需要 tokio 生态库（如 sqlx 默认 runtime、tonic gRPC）的项目
- 要求长期 LTS / 安全更新的金融、政企场景
- 团队完全没 Rust 经验：Rust 学习曲线本身就陡，再叠停更框架风险更高

## 历史小故事（可跳过）

- **2018 年**：Rust async/await 还没稳定，async-std 团队提出"和 tokio 不一样"的运行时主张，tide 作为旗舰 web 框架立项。
- **2019-2020 年**：tide 0.x 系列快速迭代，吸引一批喜欢 koa 风格的用户；同期 actix-web 因 unsafe 风波短暂受挫，给 tide 一段红利期。
- **2021 年 12 月**：发布 0.16.0-beta.2，之后 commit 节奏明显放缓。
- **2022 年起**：axum 凭借"tokio 嫡系 + tower 中间件复用"快速吃下市场份额，tide 进入事实归档状态。
- **2026 年回看**：tide 没死，但已经是历史教材里的"那个时代漂亮但下错注的小框架"。

## 学到什么

1. **生态押注比 API 设计更决定生死**：tide API 漂亮，但绑 async-std 输给绑 tokio 的 axum
2. **极简框架是好教材**：层数少、源码薄，适合拿来读"web 框架到底由哪几个 trait 拼起来"
3. **中间件 + Next 模式可移植**：从 koa 到 tide 到 axum 的 tower，套路一致——理解一个就懂一片
4. **"5k star"不是护城河**：技术选型要看活跃度、依赖运行时是否主流，star 数只是历史快照

## 延伸阅读

- 官方仓库：[http-rs/tide](https://github.com/http-rs/tide)（README + 各类 example 可读）
- 文档：[docs.rs/tide](https://docs.rs/tide)（API 参考，标榜 100% 文档覆盖）
- 设计博客：tide 早期作者写过若干篇"middleware-based web framework"博文，可搜 "async-std tide blog"
- [[axum]] —— 现在 Rust web 的事实主流，对照看 handler / middleware 设计差异
- [[actix-web]] —— 同代但活下来的另一支，actor 模型路线
- [[warp]] —— 同时期的 Filter 风格 web 框架，路线又一支

## 关联

- [[axum]] —— 2026 年 Rust web 主流；从 tide 迁出去通常迁到 axum
- [[actix-web]] —— 同期 Rust web 框架，actor 路线，生态延续到今天
- [[warp]] —— 同时期，Filter 组合路线，和 tide 都属于"小而美"派
- [[rocket]] —— 同期更"魔法重"的对照组，宏驱动路由
- [[poem]] —— 后来同样走极简路线的 Rust web 框架，吸取了 tide 的教训
- [[hughes-fp-matters]] —— middleware/Next 链本质是函数组合，FP 思想直接落地

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[salvo]] —— Salvo — 把中间件和处理器统一成一个 Handler trait 的 Rust web 框架
