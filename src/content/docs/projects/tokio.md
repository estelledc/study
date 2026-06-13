---
title: Tokio — Rust 异步编程的事实标准
来源: https://github.com/tokio-rs/tokio
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

## 从日常类比开始

想象你在一家餐厅工作。

**传统同步编程** 就像你只有一个厨师：点一道菜，做完再点下一道。如果某道菜需要等水烧开（比如网络请求），厨师就干站着等，什么也不做。

**异步编程** 就像你有很多厨师：一个在等水开的时候，马上去切菜、准备其他菜。水开了再回去处理那道菜。

**Tokio** 就是这个餐厅的"总调度系统"——它管着厨师（线程）、订单（任务）和厨房设备（网络 I/O），让所有事情高效运转，不浪费任何人的时间。

Tokio 是 Rust 生态中最流行的异步运行时（async runtime）。Rust 标准库只提供了 `async` / `await` 语法，但真正跑起来需要一个"引擎"来调度异步任务——这就是 Tokio 做的事。

---

## 核心概念

### 1. 运行时（Runtime）

运行时是 Tokio 的心脏，它包含三件套：

- **I/O 事件循环**：监听操作系统的事件队列（Linux 用 epoll，macOS 用 kqueue，Windows 用 IOCP），知道什么时候网络数据到了、文件读完了。
- **任务调度器**：管理异步任务的执行顺序，决定哪个任务该跑、哪个该等。
- **定时器**：处理 `sleep`、超时、定时任务等时间相关的操作。

### 2. 任务（Task）

Tokio 里的异步任务叫"task"，可以用 `tokio::spawn` 创建一个新任务，它比线程轻得多——一个线程上可以跑成千上万个 task。

### 3. 阻塞线程 vs 非阻塞 I/O

Tokio 提供了三种调度器模式：

- **multi-thread runtime**（多线程）：默认模式，用多个工作线程，自动分配任务。适合大多数场景。
- **current-thread runtime**（单线程）：所有任务跑在同一个线程上。适合 wasm 等场景。
- **local runtime**：处理不能跨线程发送的任务。

---

## 代码示例

### 示例一：TCP 回显服务器（最经典的入门程序）

这个示例展示了一个最简单的 Tokio 服务器：接到什么数据，原样发回去。

```rust
use tokio::net::TcpListener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 在 127.0.0.1:8080 上监听连接
    let listener = TcpListener::bind("127.0.0.1:8080").await?;
    println!("Server listening on port 8080");

    // 无限循环接受新连接
    loop {
        // accept() 是异步的——没人连接时，当前任务会挂起，不占 CPU
        let (mut socket, _) = listener.accept().await?;

        // tokio::spawn 创建一个新 task 处理这个连接
        // 这样主循环可以继续接受其他连接，互不阻塞
        tokio::spawn(async move {
            let mut buf = [0; 1024];

            loop {
                // read() 异步读取数据，读到 0 表示客户端断开了
                let n = match socket.read(&mut buf).await {
                    Ok(0) => return,       // 连接关闭
                    Ok(n) => n,            // 读取的字节数
                    Err(e) => {
                        eprintln!("read error: {:?}", e);
                        return;
                    }
                };

                // write_all() 异步写入数据
                if let Err(e) = socket.write_all(&buf[0..n]).await {
                    eprintln!("write error: {:?}", e);
                    return;
                }
            }
        });
    }
}
```

**关键理解**：

- `#[tokio::main]` 是一个宏，它把普通 `main` 函数变成异步入口，并在幕后创建了一个 multi-thread runtime。
- `.await` 不是"暂停整个程序"，而是"暂停当前这个任务，让调度器去跑其他任务"。
- `tokio::spawn` 创建的 task 共享同一个 runtime，比线程更轻。

---

### 示例二：并发下载多个 URL

这个示例展示 Tokio 的并发优势：同时发起多个网络请求，而不是一个个等。

```rust
use std::time::Instant;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let urls = vec![
        "https://www.rust-lang.org",
        "https://tokio.rs",
        "https://www.wikipedia.org",
    ];

    // 记录开始时间
    let start = Instant::now();

    // 用 join_all 同时发起所有请求
    let mut handles = vec![];
    for url in &urls {
        let handle = tokio::spawn(fetch_url(url.to_string()));
        handles.push(handle);
    }

    // 等所有 task 完成，收集结果
    for handle in handles {
        match handle.await {
            Ok(Ok((url, len))) => println!("{}: {} bytes", url, len),
            Ok(Err(e)) => eprintln!("error: {}", e),
            Err(e) => eprintln!("task panicked: {:?}", e),
        }
    }

    println!("Total time: {:.2}s", start.elapsed().as_secs_f64());
    Ok(())
}

async fn fetch_url(url: String) -> Result<(String, usize), Box<dyn std::error::Error>> {
    // 这里用 reqwest 做 HTTP 请求（需要添加 reqwest 依赖）
    // let body = reqwest::get(&url).await?.text().await?;
    // Ok((url, body.len()))

    // 用 tokio::time::sleep 模拟网络延迟
    println!("Fetching {} ...", url);
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    Ok((url, 12345))
}
```

**关键理解**：

- `tokio::spawn` 让每个 URL 的获取独立成一个 task，它们可以真正并行等待网络响应。
- 如果是三个同步请求，串行需要 1500ms；Tokio 里大约 500ms 就完成了。
- `join_all`（或手动的 handle 收集）用于等待所有并发任务完成。

---

## Tokio 的生态全家桶

Tokio 不只是运行时本身，它还维护了一个完整的工具链：

- **axum**：Web 框架（类似 Express.js，但用 Rust 写的）
- **hyper**：HTTP 协议的底层实现
- **tonic**：gRPC 实现
- **tower**：可组合的网络服务组件库
- **tracing**：结构化日志和性能追踪
- **bytes**：高效的字节缓冲区处理
- **mio**：底层操作系统 I/O 多路复用封装

---

## 学习建议

1. **先跑通官方教程**：https://tokio.rs/tokio/tutorial — 从"Hello World"到 TCP 服务器，一步步来。
2. **理解 async/await 的工作方式**：Rust 的异步和其他语言不同——`Future` 是惰性的，必须放到 runtime 上"驱动"才会执行。
3. **mini-redis 示例**：Tokio 仓库里的 mini-redis 是一个完整的 Redis 克隆，是最好的实战教材。
4. **注意阻塞陷阱**：在 async 函数里做同步阻塞操作会卡住整个线程。用 `tokio::task::spawn_blocking` 来跑阻塞代码。

---

## 常见误区

| 误区 | 真相 |
|------|------|
| `async` 就是多线程 | async 不等于并发。Tokio 的 runtime 负责并发，async 只是语法 |
| `.await` 会创建新线程 | `.await` 只是挂起当前 task，由 runtime 调度 |
| Tokio 比同步慢 | 在高 I/O 场景下，Tokio 因为不浪费线程等待，反而更快、更省资源 |
| 每个任务都要 `spawn` | 小任务直接 `.await` 就行，`spawn` 有开销 |

---

*来源：https://github.com/tokio-rs/tokio*
