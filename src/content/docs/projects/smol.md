---
title: smol — 小而美的 async runtime
来源: https://github.com/smol-rs/smol
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

# smol — 小而美的 async runtime

## 什么是 async runtime？

先想象一个场景：你有 100 封邮件要发给不同客户，每封邮件都需要等待邮件服务器回复"已收到"才能算完成。

**同步写法**：一封一封发，发完一封再发下一封。100 封可能要花很久。

**异步写法**：把 100 封信同时交给 100 个邮递员去送信，谁先回来就先处理谁的回复。100 封几乎同时完成。

Async runtime 就是那个"安排邮递员送信"的系统。Rust 里最知名的 runtime 是 Tokio，但它像个大型物流集团——功能强大但体积不小。**smol** 的设计哲学恰恰相反：只做最小可用集，轻、快、简洁。

## 一句话定义

> smol 是一个小而快的 Rust async runtime，它将多个小型异步 crate 重新导出为一个统一工具包。

关键词：**re-exports**（重新导出）。smol 自己不发明轮子，而是把已有的好轮子装在一个箱子里给你。

## 核心生态（smol 的积木盒）

smol 背后是 smol-rs 组织维护的一套异步 crate：

| 组件 | 作用 | 日常类比 |
|------|------|----------|
| async-channel | 异步生产者-消费者消息通道 | 一个共享邮箱，多人投递、单人领取 |
| async-executor | 异步任务执行器 | 工头，分配和调度任务 |
| async-fs | 异步文件系统操作 | 不阻塞主线程的文件读写 |
| async-io | I/O 类型异步适配器 + 定时器 | 把普通 I/O 变异步的转换器 |
| async-lock | 异步锁（互斥锁、读写锁、信号量） | 多人排队使用一个厕所 |
| async-net | 异步网络（TCP/UDP） | 异步版本的 TCP/UDP 连接 |
| async-process | 异步进程管理 | 异步启动和管理子进程 |
| async-task | 任务抽象（构建执行器的基础） | 任务的"身份证" |
| blocking | 阻塞 I/O 线程池 | 把耗时操作放到后台线程 |
| futures-lite | 轻量级 futures 组合子库 | 让异步任务更容易组合的工具 |
| polling | 跨平台 I/O 事件多路复用 | epoll/kqueue 的统一接口 |

## 关键概念

### Executor（执行器）

执行器是 async runtime 的心脏。它的工作是：不断检查有哪些异步任务可以推进，有就推进，没有就等待 I/O 事件。smol 提供两种：

- **Executor** — 全局单线程执行器，`smol::spawn()` 默认挂在这里
- **LocalExecutor** — 线程局部执行器，只执行当前线程创建的任务

### Task（任务）

一个 `async` 函数体就是一个 Task。你可以用 `smol::spawn()` 把它派发到执行器上运行。任务之间共享执行器资源，执行器自动调度。

### block_on

Rust 的 `async` 函数不能直接在 `main` 里调用（`main` 默认不是 async 的）。你需要一个"启动器"来运行它。`smol::block_on()` 就是这个启动器：它创建执行器、启动 async 块、等到 async 块全部完成后退出。

### Unblock

有些代码不能异步化（比如同步文件 I/O）。Unblock 把这些耗时操作放到后台线程池，让主线程继续处理异步任务。

## 代码示例

### 示例 1：HTTP GET 请求

最基础的用法：连接一个网站，获取首页内容。

```rust
use smol::{io, net, prelude::*, Unblock};
use std::io::{self, Write};

fn main() -> io::Result<()> {
    // block_on 是"启动器"，启动异步执行器
    smol::block_on(async {
        // 建立 TCP 连接到 example.com:80
        let mut stream = net::TcpStream::connect("example.com:80").await?;

        // 构造 HTTP GET 请求
        let req = b"GET / HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n";

        // 发送请求（await 等待网络 I/O 完成）
        stream.write_all(req).await?;

        // 把标准输出包装成异步可用形式
        let mut stdout = Unblock::new(std::io::stdout());

        // 从 stream 复制到 stdout（类似 Unix 的 cp）
        io::copy(stream, &mut stdout).await?;

        Ok(())
    })
}
```

逐行说明：

1. `smol::block_on(async { ... })` — 启动异步执行器并运行整个代码块
2. `net::TcpStream::connect(...).await` — 异步建立 TCP 连接，`.await` 表示"等连接建立好再继续"
3. `stream.write_all(req).await` — 异步发送 HTTP 请求
4. `Unblock::new(std::io::stdout())` — 因为 `println!` 用的标准输出是同步的，需要包装成异步版本
5. `io::copy(stream, &mut stdout).await` — 异步地把网络数据流复制到终端

### 示例 2：并发多任务 + 异步通道

展示 smol 的并发能力：启动多个任务，通过异步通道通信。

```rust
use smol::{channel, Executor};
use std::time::Duration;

fn main() -> smol::io::Result<()> {
    // 创建一个局部的单线程执行器
    let ex = Executor::new();

    // 创建一个容量为 4 的异步通道
    let (tx, rx) = channel::spawn(4);

    ex.run(async {
        // 启动 5 个"生产者"任务：每个发送一些数字
        for i in 0..5 {
            let tx = tx.clone();
            smol::spawn(async move {
                // 模拟一些异步工作（等待 100 毫秒）
                smol::Timer::after(Duration::from_millis(100 * (i as u64 + 1))).await;
                println!("Task {} sending: {}", i, i * 10);
                tx.send(i * 10).await.unwrap();
            });
        }

        // 在同一个执行器中接收所有消息
        for _ in 0..5 {
            let val = rx.recv().await.unwrap();
            println!("Received: {}", val);
        }
    })
}
```

关键行为：

- `Executor::new()` 创建一个局部执行器
- `channel::spawn(4)` 创建一个容量为 4 的异步通道。多个任务可以向 `tx` 发消息，`rx` 逐一接收
- `smol::spawn(...)` 把每个闭包派发到执行器上并发运行
- `Timer::after(...)` 异步等待一段时间，不阻塞线程
- `ex.run(...)` 运行 async 块，直到所有任务完成

这个程序会输出类似：

```
Task 0 sending: 0
Received: 0
Task 1 sending: 10
Received: 10
Task 2 sending: 20
Received: 20
Task 3 sending: 30
Received: 30
Task 4 sending: 40
Received: 40
```

每个任务依次等待更长时间后发送，执行器逐个推进。

## smol vs Tokio：怎么选？

| | smol | Tokio |
|---|---|---|
| 体积 | ~30KB 编译产物 | 数 MB |
| 编译速度 | 秒级 | 分钟级 |
| 生态 | 小而精，核心够用 | 庞大，啥都有 |
| 适用场景 | CLI 工具、小服务、嵌入式 | 大型后端服务、高并发场景 |
| 学习曲线 | 低 | 较高 |
| 线程调度 | 单线程默认，可多线程 | 内置多线程调度器 |

smol 的设计哲学是"够用就好"。如果你的项目不需要 Tokio 的全部重量，smol 是更优雅的选择。

## 兼容 tokio

smol 提供了 `async-compat` 适配器，可以用 tokio 的库（或反之）。这意味着 smol 的生态不是孤岛，可以和 tokio 生态互通。

## 总结

smol 用组合而非重造的方式，把 Rust 异步生态中最核心的 11 个 crate 装进一个箱子。它证明了"小而美"不只是口号——11 个 crate、一个统一 API、零额外依赖，就能构建出一个完整的异步运行时。

对于初学者来说，smol 也是更好的学习入口：它的源码比 Tokio 更简短易读，适合逐步理解 async runtime 的工作原理。
