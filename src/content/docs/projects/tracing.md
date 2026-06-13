---
title: Rust Tracing — 结构化日志与追踪入门
来源: https://github.com/tokio-rs/tracing
日期: 2026-06-13
分类: 编程语言
子分类: rust-tools
provenance: pipeline-v3
---

# Rust Tracing — 结构化日志与追踪入门

## 什么是 Tracing？

想象你在餐厅里点餐。传统日志就像一张便签纸："上了菜"——你不知道上了什么、给谁上的、花了多久。而 tracing 像是餐厅的订单管理系统：每一道菜（事件）都绑定到一个订单（span），订单有开始时间、结束时间，还有菜品之间的先后关系。这就是 tracing 要解决的核心问题——**在复杂的异步程序中，让开发者能看清"发生了什么、什么时候发生、在哪个上下文中发生"**。

tracing 是由 Tokio 团队开发的 Rust 库，专为异步系统设计。它不只是日志，更是一种结构化的诊断框架。

## 核心概念

### Span（跨度）

Span 代表一段**有时间跨度的执行过程**。它有进入时间和退出时间，可以嵌套。比如一个 HTTP 请求的处理过程就是一个 span，它内部可能包含数据库查询 span、缓存读取 span 等。

### Event（事件）

Event 代表一个**瞬间发生的事情**，类似日志消息。但事件可以发生在某个 span 的内部，因此天然带有上下文信息。

### Subscriber（订阅者）

Subscriber 是数据的消费者，负责接收 span 和事件并做出处理——写入文件、发送到远程服务、输出到控制台等。tracing 本身不提供具体的 subscriber，而是由生态中的其他 crate（如 `tracing-subscriber`）来实现。

## 代码示例一：基础用法

```rust
use tracing::{info_span, event, Level};

fn main() {
    // 设置一个将数据输出到控制台的订阅者
    let subscriber = tracing_subscriber::fmt()
        .with_max_level(Level::TRACE)
        .finish();
    tracing::subscriber::set_global_default(subscriber).unwrap();

    // 创建一个名为 "request" 的 span
    let span = info_span!("request", method = "GET", path = "/users/42");
    let _enter = span.enter();

    // 在 span 内部记录事件
    event!(Level::INFO, "handling request");
    event!(Level::DEBUG, "checking cache", cache_hit = false);
    event!(Level::INFO, "querying database", table = "users");
    event!(Level::INFO, "request complete", status = 200_u32);
}
```

输出示例：

```
Jun 13 10:00:00.001  INFO request{method=GET path=/users/42}: handling request
Jun 13 10:00:00.002 DEBUG request{method=GET path=/users/42}: checking cache cache_hit=false
Jun 13 10:00:00.005  INFO request{method=GET path=/users/42}: querying database table=users
Jun 13 10:00:00.010  INFO request{method=GET path=/users/42}: request complete status=200
```

注意每个输出行都包含了 span 名称和方法、路径等信息——这就是结构化的力量，你可以按字段过滤和聚合。

## 代码示例二：函数级自动追踪

手动管理 span 很繁琐，tracing 提供了 `#[instrument]` 属性宏，自动为函数创建 span：

```rust
use tracing::{info_span, event, Level, instrument};

#[instrument]
fn fetch_user(user_id: u32) -> String {
    event!(Level::DEBUG, "looking up user in database", user_id);
    // 模拟数据库查询
    format!("User {}", user_id)
}

#[instrument(fields(role = "admin"))]
fn process_request(user_id: u32, action: &str) {
    event!(Level::INFO, "processing action", %action);
    let user = fetch_user(user_id);
    event!(Level::INFO, user = %user, "action completed");
}

fn main() {
    let subscriber = tracing_subscriber::fmt()
        .with_max_level(Level::TRACE)
        .finish();
    tracing::subscriber::set_global_default(subscriber).unwrap();

    process_request(42, "delete_account");
}
```

`#[instrument]` 会自动做三件事：调用函数时创建 span、函数名作为 span 名称、函数参数自动记录为字段。`%` 前缀表示用 Display 格式输出，`?` 前缀表示用 Debug 格式输出。

## 关键要点

- **Span 是时间段，Event 是时间点**：这是理解 tracing 最关键的区别
- **层级关系**：span 可以嵌套，形成一棵树，清晰展示调用关系
- **零开销**：被过滤掉的 span 和事件在编译期就会被消除，不会有任何运行时开销
- **与 log 兼容**：可以通过 `log` feature 同时输出传统日志
- **生态丰富**：`tracing-subscriber` 提供控制台输出、JSON 输出等；`tracing-opentelemetry` 可对接分布式追踪系统

## 进一步学习

- 官方文档：https://docs.rs/tracing
- GitHub 仓库：https://github.com/tokio-rs/tracing
- 示例代码：https://github.com/tokio-rs/tracing/tree/main/examples
- 订阅者实现：`tracing-subscriber` crate
- 与 OpenTelemetry 集成：`tracing-opentelemetry` crate
