---
title: Tower — 异步服务中间件
来源: https://github.com/tower-rs/tower
日期: 2026-06-13
分类: 后端 API
子分类: rust-tools
provenance: pipeline-v3
---

# Tower - 异步服务中间件

## 一句话是什么

Tower 是一个 Rust 库，帮你在写网络服务端和客户端时，用「可组合的小模块」来加功能，比如超时、重试、限流。它不自己处理网络，而是给你一个统一的接口标准，让你的代码和网络层（比如 HTTP、gRPC）解耦。

## 日常类比

想象你在一家餐厅里点菜：

- **Service（服务）** 就是一个服务员。你（客户端）把订单（请求）交给他，他拿去后厨，然后端回一道菜（响应）。
- **Middleware（中间件）** 就是在服务员和你的服务员之间，又加了几个"环节"。比如：
  - **超时中间件** = 前台经理，如果他发现你等的菜超过了 30 分钟，就直接说"抱歉，这道菜不做"。
  - **重试中间件** = 传菜员，如果第一次送菜被退回（出错了），他就再送一次。
  - **限流中间件** = 门口保安，餐厅快满的时候，他拦住新客人，让他们等一等。

Tower 的精妙之处在于：这些中间件是「协议无关」的。上面说的超时、重试，不管你是用 HTTP、gRPC 还是自己写的协议，都能直接用，不用改。

## 核心概念

Tower 有两个核心 trait，所有东西都围绕它们展开：

### Service（服务）

`Service` 就是"一个异步的请求处理函数"。抽象出来长这样：

```
async fn(Request) -> Result<Response, Error>
```

它不是什么复杂的类，就是一个trait，要求实现三个东西：

1. **`poll_ready`** - 问一下"你现在有空处理新请求吗？"（这叫 backpressure，背压机制）
2. **`call`** - 真正把请求丢进去处理，返回一个 Future
3. **`Response / Error / Future`** - 三种关联类型，说明你返回什么

所以一个 Service 就像是餐厅里那个接订单的服务员。

### Layer（层）

`Layer` 是"包装一个 Service，给它加行为的工具"。

如果 Service 是服务员，Layer 就是"加一个新环节的动作"。比如 `TimeoutLayer(30秒)` 这个动作，把一个普通服务员包装成一个"有超时机制的服务员"。

Layer 的核心方法就一个：

```rust
fn layer(&self, inner: S) -> Self::Service
```

意思是：给我一个服务，我给你返回一个新服务，这个新服务包了原来的。

### 两层的关系

```
Layer 是"动作"（动词）  -->  TimeoutLayer(30s)
Service 是"结果"（名词） -->  Timeout<Service>(30s)
```

你用多个 Layer 堆起来，就得到一层套一层的 Service 链。请求进来时，从最外层一层层剥下去，处理完再一层层包上来。

## 代码示例

### 示例 1：手写一个最简 Service

下面是一个最基本的 HTTP 式服务——不管你收到什么请求，都返回同样的内容：

```rust
use tower_service::Service;
use http::{Request, Response, StatusCode};
use std::future::{ready, Ready};
use std::task::{Context, Poll};

struct HelloWorld;

impl Service<Request<Vec<u8>>> for HelloWorld {
    type Response = Response<Vec<u8>>;
    type Error = std::convert::Infallible;
    type Future = Ready<Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, _cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, _req: Request<Vec<u8>>) -> Self::Future {
        let body = b"hello, world!\n".to_vec();
        let resp = Response::builder()
            .status(StatusCode::OK)
            .body(body)
            .unwrap();
        ready(Ok(resp))
    }
}
```

这个例子拆解一下：

- `type Response` = 返回什么（这里是一个 HTTP Response）
- `type Error` = 什么错误（`Infallible` 表示"永远不会出错"）
- `type Future` = 返回什么异步结果（`Ready` 表示"已经准备好了，不用等"）
- `call` = 真正处理请求的逻辑，收到任何请求都返回 "hello, world!"

### 示例 2：用 Timeout 中间件包装

Tower 内置了 `Timeout` 中间件，它可以给任何 Service 加上超时功能：

```rust
use tower::ServiceBuilder;
use tower::timeout::TimeoutLayer;
use tower::util::service_fn;
use std::time::Duration;

// 先定义一个慢吞吞的服务——处理一个请求需要花 5 秒
let slow_service = service_fn(|request: String| async move {
    tokio::time::sleep(Duration::from_secs(5)).await;
    Ok::<_, std::convert::Infallible>(format!("处理了请求: {}", request))
});

// 用 Timeout 中间件包装它，设定 1 秒超时
let fast_service = ServiceBuilder::new()
    .layer(TimeoutLayer::new(Duration::from_secs(1)))
    .service(slow_service);

// 现在调用 fast_service 时，超过 1 秒就会自动超时失败，
// 而不会傻等 5 秒
```

这里 `ServiceBuilder` 就是一个"组装工具"，它按照你指定的顺序，把一层层的 Layer 套在 Service 外面。上面的代码等于说：

> "先给 slow_service 套一层 1 秒的 Timeout，得到 fast_service"

如果请求处理超过 1 秒，客户端收到的就是一个超时错误，而不必等到 5 秒。

### 示例 3：叠加多个中间件

Tower 最强大的地方在于多个中间件可以自由组合：

```rust
use tower::ServiceBuilder;
use tower::timeout::TimeoutLayer;
use tower::retry::RetryLayer;
use tower::util::service_fn;
use std::time::Duration;

let service = service_fn(|request: String| async move {
    // 模拟一个偶尔失败的服务
    if request == "bad" {
        Err::<String, String>("服务错误".to_string())
    } else {
        Ok(format!("处理了请求: {}", request))
    }
});

let robust_service = ServiceBuilder::new()
    // 第一层：3 秒超时
    .layer(TimeoutLayer::new(Duration::from_secs(3)))
    // 第二层：最多重试 2 次
    .layer(RetryLayer::new(3))
    // 第三层：实际服务
    .service(service);
```

这个 `robust_service` 同时具备：超时保护 + 自动重试。请求进来时，先经过超时检查，再通过重试逻辑，最后到达你的业务服务。

## Tower 生态

Tower 不只是一个 crate，它由几个 crate 组成：

| Crate | 作用 |
|-------|------|
| `tower` | 核心库，包含常用的中间件实现 |
| `tower-service` | `Service` trait 的独立 crate（最稳定） |
| `tower-layer` | `Layer` trait 的独立 crate（最稳定） |
| `tower-test` | 测试工具 |

`Service` 和 `Layer` 这两个 trait 被单独拆出来，是因为它们是整个 Rust 异步生态的"通用接口"。很多库都基于它们：

- **hyper** — HTTP/1.1 和 HTTP/2 实现，直接用了 Service 作为集成点
- **tonic** — gRPC 实现，基于 hyper + tower
- **warp** — 轻量级 Web 框架，支持 tower middleware

## 关键设计决策

### 为什么不用"直接处理 HTTP"的方式？

如果每次加功能都要写一个新的 HTTP handler，代码会重复。Tower 的 approach 是把"通用行为"（超时、重试、日志）从"具体协议"（HTTP、gRPC）中抽出来，形成一个通用模型。

### Service 的 poll_ready 有什么用？

这是 Tower 的"背压"机制。想象餐厅服务员已经很忙了（正在做菜），你不能再给他新订单。`poll_ready` 就是问："你现在有空接新订单吗？"如果忙，就返回 Pending，等做完手头的活再通知你。

### Layer 为什么是"元函数"？

因为 Layer 的输入是 Service，输出也是 Service。它包装（decorate）了一个 Service，给它加上额外行为。多个 Layer 可以链式组合，形成 Service 的"洋葱模型"——请求从外到内穿过每一层，响应从内到外再穿过每一层。

## 学习路线建议

从零基础的角度，建议按以下顺序理解：

1. 先搞懂 **Service trait**：输入请求，输出响应（一个异步函数）
2. 再搞懂 **Layer trait**：输入 Service，输出新 Service（一个包装器）
3. 看 **ServiceBuilder**：怎么用 Layer 拼装出最终的服务
4. 最后看中间件：Timeout、Retry、RateLimit 等具体实现

## 总结

Tower 的核心思想是：**用通用接口统一网络和中间件**。不管你的协议是什么，超时、重试、限流这些通用行为都可以通过 Service + Layer 的组合来加，不用为每个协议写一遍。
