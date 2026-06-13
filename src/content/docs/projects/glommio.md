---
title: Glommio — Datadog 的 thread-per-core 异步运行时
来源: https://github.com/DataDog/glommio
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

# Glommio — Datadog 的 thread-per-core 异步运行时

## 一句话概括

Glommio 是一个 Rust 库，让每个 CPU 核只跑一个线程，从而彻底消除锁竞争和上下文切换，实现极高的 I/O 吞吐和极低的延迟。

## 从日常类比开始

想象一家餐厅有 10 张桌子（CPU 核），传统做法是派 10 个服务员（线程），每人负责一张桌子。但当某张桌子同时来了两拨客人，两个服务员就得抢着上菜——他们需要"协商"（加锁），还可能互相等待（上下文切换）。

Glommio 的做法是：每张桌子固定一个专属服务员，这个服务员终身只服务这一张桌子。没有抢菜、没有等待、没有协商。每个服务员用自己的方式记住客人点了什么（异步状态机），客人到了就记下来，等厨房做好再端上去。因为每个服务员只盯一桌，根本不需要"协商锁"。

这就是 **thread-per-core**（每核一线程）的核心思想。

## 核心概念

### 1. Thread-per-Core

每个 CPU 核绑定一个执行线程，操作系统调度器不会把这个线程挪到别的核上。结果就是：

- 同一个核上永远只有一个线程在执行
- 同一份数据在同一时间只被一个线程访问
- **完全不需要锁**（这是最大的优势）

### 2. io_uring

Glommio 建立在 Linux 的 `io_uring` 之上。`io_uring` 是 Linux 内核提供的一套异步 I/O API，允许应用程序把读写请求提交到内核，内核做完后通过共享内存通知应用，整个过程几乎零系统调用开销。

Glommio 为每个线程注册三组 ring buffer：

- **Main ring**：大多数 I/O 操作走这里
- **Latency ring**：对延迟敏感的操作走这里，Glommio 会优先处理
- **Poll ring**：用于 NVMe 设备的高 IOPS 场景，不依赖中断

### 3. Cooperative Scheduling（协作式调度）

因为每个核只有一个线程，如果一个任务死循环不放手，整个核就卡死了。所以 Glommio 采用协作式调度：长任务需要主动让出 CPU。关键函数是 `yield_if_needed()`，它会检查是否有延迟敏感的任务在排队，如果有就让出控制权。

### 4. Task Queue（任务队列）与 Shares（份额）

Glommio 允许在一个核上创建多个任务队列，每个队列可以设置：

- **Shares**：决定各队列分配多少 CPU 时间比例
- **Latency**：标记是否为延迟敏感任务

比如一个队列占 2 份、另一个占 1 份，前者就会拿到大约 2/3 的 CPU 时间。

## 为什么不用传统的多线程？

传统多线程有两个大痛点：

1. **锁很贵**：线程之间共享数据时必须加锁，加锁本身消耗 CPU，更重要的是线程会花大量时间在"等待锁"上
2. **上下文切换很贵**：Linux 下一次线程切换大约花费 5 微秒。而现代 NVMe 磁盘的 I/O 延迟已经低于 4 微秒了——切换线程比做 I/O 还慢！

Thread-per-core 从根本上消灭了这两个问题。

## 代码示例

### 示例 1：最基本的 Glommio 程序

这是最简单的用法，创建一个异步执行器并运行一段异步代码：

```rust
use glommio::prelude::*;

fn main() {
    // 创建一个默认的 LocalExecutor（不绑定特定 CPU）
    let ex = LocalExecutorBuilder::default()
        .spawn(|| async move {
            // 在这里写你的异步代码
            println!("Hello from Glommio!");
            
            // 异步延迟 1 秒
            Timer::new(Duration::from_secs(1)).await;
            println!("Waited 1 second asynchronously");
        })
        .expect("Failed to spawn executor");
    
    ex.join();
}
```

关键点：
- `LocalExecutorBuilder::default()` 创建一个执行器
- `.spawn()` 接收一个 async 闭包，在里面写异步逻辑
- `Timer::new(...).await` 是非阻塞等待，不会占用 CPU

### 示例 2：绑定 CPU 核 + 多任务队列

这个例子展示了如何把执行器绑到特定的 CPU 核上，并创建不同优先级的任务队列：

```rust
use glommio::{
    executor,
    Latency,
    LocalExecutorBuilder,
    Placement,
    Shares,
    Timer,
};
use std::time::Duration;

fn main() {
    // 把这个执行器固定绑定到 CPU 第 0 核
    let ex = LocalExecutorBuilder::new(Placement::Fixed(0))
        .spawn(|| async move {
            // 创建两个任务队列：
            // tq_critical: 2 份份额，延迟敏感
            let tq_critical = executor()
                .create_task_queue(
                    Shares::Static(2),
                    Latency::Matters(Duration::from_millis(5)),
                    "critical",
                );
            
            // tq_batch: 1 份份额，不关心延迟
            let tq_batch = executor()
                .create_task_queue(
                    Shares::Static(1),
                    Latency::NotImportant,
                    "batch",
                );
            
            // 把任务分配到不同的队列
            let task1 = glommio::spawn_local_into(
                async move {
                    println!("Critical task running on tq_critical");
                    // 模拟长时间运行的任务
                    for i in 0..100 {
                        // 主动让出 CPU，给其他队列机会
                        yield_if_needed().await;
                    }
                },
                tq_critical,
            ).unwrap();
            
            let task2 = glommio::spawn_local_into(
                async move {
                    println!("Batch task running on tq_batch");
                    for i in 0..100 {
                        yield_if_needed().await;
                    }
                },
                tq_batch,
            ).unwrap();
            
            task1.await;
            task2.await;
        })
        .expect("Failed to spawn executor");
    
    ex.join();
}
```

这个例子里你可以看到几个重要概念：

- `Placement::Fixed(0)` 把执行器钉在 CPU 0 上
- `Shares::Static(2)` 和 `Shares::Static(1)` 决定了两个队列的 CPU 时间分配比例约为 2:1
- `Latency::Matters(Duration::from_millis(5))` 告诉 Glommio 这个队列里的任务对延迟很敏感，如果超过 5 毫秒没被执行就要报警
- `yield_if_needed().await` 是协作式调度的关键——长循环中定期调用，让其他队列有机会运行

### 示例 3：TCP 网络编程

Glommio 提供了完整的网络 API，支持超时和组合操作：

```rust
use glommio::{
    net::TcpStream,
    timer::Timer,
    LocalExecutor,
};
use futures_lite::future::FutureExt;
use std::time::Duration;

fn main() {
    let ex = LocalExecutor::default();
    
    ex.run(async {
        // 定义一个超时逻辑
        let timeout = async {
            Timer::new(Duration::from_secs(10)).await;
            Err(std::io::Error::new(
                std::io::ErrorKind::TimedOut,
                "Connection timed out",
            ).into())
        };
        
        // 尝试连接，10 秒超时
        let stream = TcpStream::connect("example.com:80")
            .or(timeout)
            .await?;
        
        println!("Connected to example.com!");
        
        Ok::<_, glommio::error::GlommioError<std::io::Error>>(())
    })
    .unwrap();
}
```

这里展示了 Glommio 的 `FutureExt::or()` 方法，可以把一个网络请求和一个定时器组合起来，实现超时控制。

## 使用前提

Glommio 有一些硬性要求：

1. **Linux 5.8+**，必须支持 `io_uring`
2. **至少 512 KiB 的锁定内存**（memlock），需要在 `/etc/security/limits.conf` 中配置
3. 只在 Linux 上运行，不支持 macOS / Windows

## 总结

| 特性 | 传统多线程 | Glommio (thread-per-core) |
|------|-----------|--------------------------|
| 锁 | 需要 | 不需要 |
| 上下文切换 | 频繁发生 | 几乎不发生 |
| I/O 模型 | 线程池 + epoll | io_uring |
| 延迟稳定性 | 受锁竞争影响 | 非常稳定 |
| 适用场景 | 通用 | 高并发 I/O 密集型 |

Glommio 最适合的场景是：高吞吐、低延迟的 I/O 密集型服务，比如数据库、消息队列、代理服务器等。如果你在做的是 CPU 密集型计算或者 Web 前端，那它可能不适合你。

## 延伸阅读

- Glommio 官方博客：https://www.datadoghq.com/blog/engineering/introducing-glommio/
- Glommio 文档：https://docs.rs/glommio/
- io_uring 介绍：https://kernel.dk/io_uring.pdf
- Seastar（C++ 版 thread-per-core 框架）：http://seastar.io/
