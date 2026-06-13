---
title: hyper — Rust HTTP 实现
来源: https://github.com/hyperium/hyper
日期: 2026-06-13
分类: 后端 API
子分类: rust-tools
provenance: pipeline-v3
---

# hyper — Rust HTTP 实现

## 一、从"快递站"说起：HTTP 是什么

想象你住在一栋大楼里，每个房间都是一个程序。

房间 A 想给房间 B 送一份文件，但不能直接走过去——它们之间隔着一堵墙。于是需要一个"快递员"：

- 房间 A 把文件打包好，写上收件地址，交给快递员
- 快递员把文件送到房间 B
- 房间 B 拆开包裹，看完回复，再把回信交给快递员送回去

这个"快递员系统"就是 **HTTP**。它是互联网上最通用的通信协议，你在浏览器里打开任何一个网页，背后都是 HTTP 在工作。

而 **hyper**，就是 Rust 语言世界里一个非常优秀的"快递员系统设计手册"。它不只是一个工具，更是一套让你自己搭建 HTTP 服务或客户端的底层积木。

## 二、hyper 是什么

hyper 是 Rust 生态中最著名的 HTTP 库之一，仓库地址：https://github.com/hyperium/hyper，已有超过 16,000 个 star。

它的定位是"低层 HTTP 库"——意思是它提供的是最基础的 HTTP 功能，像砖头和水泥。如果你想要一个完整的网站框架，可以在 hyper 之上搭建；如果你只想发个 HTTP 请求，也可以用更高级的库（比如 reqwest，它底层就是用的 hyper）。

关键特性：

- 同时支持 HTTP/1 和 HTTP/2 协议
- 异步设计：不阻塞，能同时处理成千上万个连接
- 性能极高：Rust 的零成本抽象让它几乎和 C 一样快
- 正确性经过大量生产环境验证
- 既可以做服务端（接收请求），也可以做客户端（发送请求）

## 三、核心概念

理解 hyper，需要先搞懂三个核心概念。

### 3.1 Request 和 Response

HTTP 世界只有两种东西：**请求（Request）**和**响应（Response）**。

每一次通信都是一问一答：

| 部分 | 说明 | 类比 |
|------|------|------|
| Method | 请求类型（GET / POST 等） | "我要读文件"还是"我要传文件" |
| URI | 目标地址 | 收件人的门牌号 |
| Headers | 元数据（内容类型、编码等） | 包裹上的标签："易碎品""加急" |
| Body | 实际内容 | 包裹里的东西 |

在 hyper 中，`Request` 和 `Response` 是两个核心结构体，贯穿整个库的使用。

### 3.2 Service（服务）

这是 hyper 最核心的抽象。

一个 Service 就是一个函数：收到一个 Request，返回一个 Future，这个 Future 最终会变成一个 Response。

用大白话说：**Service 就是你的服务器"怎么回应客人"的规则。**

```
客人敲门（Request）→ 服务员处理（Service）→ 端出菜品（Response）
```

hyper 提供了一个方便的宏 `service_fn`，可以把普通函数直接变成 Service。

### 3.3 异步与 Runtime

hyper 是异步的。这意味着：当一个请求在处理时（比如查数据库），CPU 不会傻等，而是去处理别的请求。

这需要一个"调度中心"来管理所有并发任务——这就是 **Runtime**。hyper 默认配合 [tokio](https://tokio.rs) 使用，tokio 就是那个调度员，负责在合适的时间做合适的事。

## 四、代码示例：搭建一个 HTTP 服务器

下面是一个完整的"Hello, World!"服务器，使用 hyper 监听 3000 端口。

### 4.1 准备工作

在 `Cargo.toml` 中添加依赖：

```toml
[dependencies]
hyper = { version = "1", features = ["full"] }
tokio = { version = "1", features = ["full"] }
http-body-util = "0.1"
hyper-util = { version = "0.1", features = ["full"] }
```

### 4.2 完整代码

```rust
use std::convert::Infallible;
use std::net::SocketAddr;

use http_body_util::Full;
use hyper::body::Bytes;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response};
use hyper_util::rt::TokioIo;
use tokio::net::TcpListener;

// 第一步：定义你的"服务"——收到请求后怎么回应
async fn hello(_request: Request<hyper::body::Incoming>) -> Result<Response<Full<Bytes>>, Infallible> {
    // 构造一个响应：状态码 200，内容是 "Hello, World!"
    let response = Response::new(Full::new(Bytes::from("Hello, World!")));
    Ok(response)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // 第二步：绑定地址和端口
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    let listener = TcpListener::bind(addr).await?;

    println!("Server listening on http://127.0.0.1:3000");

    // 第三步：持续接受新的连接
    loop {
        let (stream, _) = listener.accept().await?;

        // 把底层的 TCP 流包装成 hyper 能理解的格式
        let io = TokioIo::new(stream);

        // 为每个连接创建一个新任务，这样就能同时处理多个请求
        tokio::task::spawn(async move {
            // 第四步：把这个连接和我们的 hello 服务绑定起来
            if let Err(err) = http1::Builder::new()
                .serve_connection(io, service_fn(hello))
                .await
            {
                eprintln!("Error serving connection: {:?}", err);
            }
        });
    }
}
```

运行后，打开浏览器访问 http://127.0.0.1:3000，就能看到 "Hello, World!"。

代码流程拆解：

1. 定义 `hello` 函数——这是你的服务逻辑
2. 用 `TcpListener::bind` 绑定端口，相当于在门口挂牌"营业了"
3. 在循环中 `accept` 新的连接，相当于不断有人来敲门
4. 用 `service_fn(hello)` 把你的函数包装成 hyper 能理解的 Service
5. `http1::Builder::new().serve_connection(...)` 把连接和服务绑在一起

## 五、代码示例：做一个 HTTP 客户端

除了搭建服务器，hyper 也能做客户端——主动去请求别人的服务。

```rust
use http_body_util::{BodyExt, Empty};
use hyper::Request;
use hyper::body::Bytes;
use hyper_util::rt::TokioIo;
use tokio::net::TcpStream;
use tokio::io::{self, AsyncWriteExt as _};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // 第一步：解析目标 URL
    let url = "http://httpbin.org/ip".parse::<hyper::Uri>()?;
    let host = url.host().expect("uri has no host");
    let port = url.port_u16().unwrap_or(80);
    let address = format!("{}:{}", host, port);

    // 第二步：建立 TCP 连接
    let stream = TcpStream::connect(address).await?;
    let io = TokioIo::new(stream);

    // 第三步：和服务器握手，创建客户端
    let (mut sender, conn) = hyper::client::conn::http1::handshake(io).await?;

    // 第四步：后台驱动连接状态
    tokio::task::spawn(async move {
        if let Err(err) = conn.await {
            println!("Connection failed: {:?}", err);
        }
    });

    // 第五步：构造并发送请求
    let authority = url.authority().unwrap().clone();
    let req = Request::builder()
        .uri(url)
        .header(hyper::header::HOST, authority.as_str())
        .body(Empty::<Bytes>::new())?;

    // 第六步：等待并打印响应
    let mut res = sender.send_request(req).await?;
    println!("Response status: {}", res.status());

    // 第七步：读取响应体（流式读取，边到边写）
    while let Some(next) = res.frame().await {
        let frame = next?;
        if let Some(chunk) = frame.data_ref() {
            io::stdout().write_all(chunk).await?;
        }
    }

    Ok(())
}
```

这段代码请求了 httpbin.org 的一个接口，它会返回你的 IP 地址。

流程拆解：

1. 解析 URL，拿到主机名和端口
2. 建立 TCP 连接——就像打电话拨号
3. 握手——确认对方准备好了
4. 构造一个 GET 请求，发给服务器
5. 服务器返回响应，我们逐块读取并打印出来

注意 Body 是"流式"的：不需要等整个响应下载完才处理，而是来一块处理一块。这对大文件传输特别重要。

## 六、生态关系图

hyper 在 Rust 生态中的位置：

```
                    你的应用
                       │
               ┌───────┴───────┐
               │  Axum / Warp  │   ← 高级 Web 框架（面向开发者）
               └───────┬───────┘
                       │
                    hyper          ← 底层 HTTP 库（我们在这里）
                       │
                    tokio          ← 异步运行时（调度员）
                       │
                   操作系统
```

- 如果你要写 Web 服务器：可以用 Axum 或 Warp，它们基于 hyper
- 如果你要发 HTTP 请求：可以用 reqwest，它底层也是 hyper
- 如果你想完全掌控 HTTP 的细节：直接用 hyper

## 七、总结

hyper 的核心思想其实很简单：

- 一切围绕 Request 和 Response 展开
- 用 Service 定义"收到请求怎么回应"
- 借助 tokio 实现高并发
- 保持低层，让你有最大的灵活性

理解了这三个概念（Request/Response、Service、异步），你就掌握了 hyper 的精髓。剩下的只是 API 的细节而已。
