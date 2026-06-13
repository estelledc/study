---
title: Crossbeam — Rust 并发原语工具集
来源: https://github.com/crossbeam-rs/crossbeam
日期: 2026-06-13
分类: 其他
子分类: rust-tools
provenance: pipeline-v3
---

## 什么是 Crossbeam

想象你有一个大厨房，里面有很多厨师（线程）同时做饭。Rust 标准库只给了你一个平底锅（`std::sync::Mutex`），遇到菜量大了就排长队。Crossbeam 就像一套专业厨具——传送带（Channel）、自动分拣机（Work-Stealing Deque）、安全回收站（Epoch-based GC），让多个厨师可以高效协作，不互相挡路。

Crossbeam 是 Rust 生态中最成熟的并发工具库之一，核心特点：

- 零拷贝、低延迟——用无锁（lock-free）算法替代传统锁
- 模块化——拆成 `crossbeam-channel`、`crossbeam-deque`、`crossbeam-epoch` 等独立子 crate
- 与标准库互补——不替代 `std::sync`，而是填补它没有的高性能抽象

## 核心概念

### 1. Chan（多-producer 多-consumer Channel）

`crossbeam-channel` 提供了比 `std::sync::mpsc` 更强大的消息传递机制：

- 支持有界（bounded）和无界（unbounded）两种
- 非阻塞收发：`try_send` / `try_recv` 不会阻塞线程
- 内置 select 语法：同时监听多个 channel，哪个就绪处理哪个
- 可配合迭代器：`receiver.iter()` 自动阻塞直到所有 sender 关闭

### 2. Work-Stealing Deque（工作窃取双端队列）

每个线程维护自己的任务队列。空闲线程可以从忙线程的队列"偷"任务来做。这是 rayon 等并行库的底层调度机制：

- `Worker<T>`：本地队列，`push`（尾部入队）和 `pop`（头部出队）
- `Injector<T>`：全局注入器，所有线程都可以往里推任务
- `Stealer<T>`：允许其他线程从 Worker 窃取任务

### 3. Epoch-based Memory Reclamation（基于纪元的内存回收）

无锁数据结构最难的问题是：一个线程正在读取某个节点时，另一个线程把它删了，就会野指针。Epoch GC 的解决方案是：

- 线程进入"读临界区"前声明自己在使用
- 删除的节点不会立即释放，而是挂起等待
- 所有线程都离开读临界区后，才安全释放

## 代码示例 1：使用 Chan 实现生产者-消费者模型

这是 Crossbeam 最常见的用法。下面的例子模拟了日志系统：多个业务线程生产日志，一个日志线程消费并打印。

```rust
use crossbeam_channel::{bounded, Sender};
use std::thread;
use std::time::Duration;

fn main() {
    // 创建有界 channel（容量 10），满了之后 sender 会阻塞等待
    let (sender, receiver) = bounded::<String>(10);

    // 启动 3 个生产者线程
    let producers: Vec<_> = (0..3)
        .map(|id| {
            let tx = sender.clone();
            thread::spawn(move || {
                for i in 0..5 {
                    let msg = format!("[Producer {}] log #{}", id, i);
                    tx.send(msg).unwrap();
                    thread::sleep(Duration::from_millis(10));
                }
            })
        })
        .collect();

    // receiver 可以被迭代——iter() 会一直阻塞，直到所有 sender 被关闭
    for msg in receiver.iter() {
        println!("{}", msg);
    }

    // 等待所有生产者完成
    for producer in producers {
        producer.join().unwrap();
    }
}
```

关键点：

- `bounded(10)` 创建了容量为 10 的有界 channel，这是背压（backpressure）机制——生产者满了就等待，不会无限堆积内存
- `sender.clone()` 创建多个 sender，它们共享同一个底层通道，所以可以 `Receiver` 能收到所有生产者的消息
- `receiver.iter()` 的巧妙之处：它会自动阻塞，直到所有 clone 出来的 sender 都 drop 掉

## 代码示例 2：Work-Stealing Deque 实现简易任务调度器

这个例子展示 Crossbeam 的调度原语。模拟一个小型并行计算框架：

```rust
use crossbeam_deque::{Injector, Stealer, Worker, Steal};
use std::sync::Arc;
use std::thread;

/// 任务调度器：优先做本地任务，没有时才偷别人的
fn find_task<T>(local: &Worker<T>, global: &Injector<T>, stealers: &[Stealer<T>]) -> Option<T> {
    // 1. 先试试自己队列里有没有任务
    local.pop().or_else(|| {
        // 2. 没有就尝试从全局注入器批量偷取
        std::iter::repeat_with(|| {
            global.steal_batch_and_pop(local)
                .or_else(|| stealers.iter().map(|s| s.steal()).collect())
        })
        .find(|result| !result.is_retry())
        .and_then(|result| result.success())
    })
}

fn main() {
    // 全局任务注入器
    let injector = Arc::new(Injector::new());

    // 每个工作线程有自己的本地队列
    let worker1 = Worker::new_fifo();
    let worker2 = Worker::new_fifo();

    // 获取对方的窃取句柄
    let stealer1 = worker1.stealer();
    let stealer2 = worker2.stealer();

    // 往全局注入器添加任务
    for i in 0..10 {
        injector.push(format!("task-{}", i));
    }

    // 给 worker1 本地推几个任务
    worker1.push("local-task-1".to_string());
    worker1.push("local-task-2".to_string());

    // 模拟 worker1 线程
    let injector1 = injector.clone();
    let worker1_local = worker1.clone();
    let stealers = vec![&stealer2];
    let handle1 = thread::spawn(move || {
        // 先处理本地任务
        while let Some(task) = worker1_local.pop() {
            println!("Worker1 processing: {}", task);
        }
        // 本地没了，去偷全局的
        if let Some(task) = find_task(&worker1_local, &injector1, &stealers) {
            println!("Worker1 stole: {}", task);
        }
    });

    // 模拟 worker2 线程
    let injector2 = injector.clone();
    let worker2_local = worker2.clone();
    let stealers2 = vec![&stealer1];
    let handle2 = thread::spawn(move || {
        // 从全局偷批量任务
        match injector2.steal_batch_and_pop(&worker2_local) {
            Steal::Success(task) => println!("Worker2 batch stole: {}", task),
            Steal::Empty => println!("Injector empty"),
            Steal::Retry => println!("Retry needed"),
        }
    });

    handle1.join().unwrap();
    handle2.join().unwrap();
}
```

这个调度策略的核心逻辑是 **LIFO（后进先出）+ 窃取用 FIFO（先进先出）**：

- 本地 `pop` 用 LIFO，因为刚推进去的任务更可能还有关联性，缓存友好
- 被偷走的任务用 FIFO，避免一个线程总是偷到另一个线程正在处理的任务，减少冲突

## Crossbeam 子 crate 一览

| 子 crate | 提供什么 | 类比 |
|---|---|---|
| `crossbeam-channel` | Chan 消息传递 | 传送带 |
| `crossbeam-deque` | Work-Stealing Deque | 自动分拣机 |
| `crossbeam-epoch` | 纪元式内存回收 | 安全回收站 |
| `crossbeam-queue` | 并发队列（ArrayQueue, SegQueue） | 排队机 |
| `crossbeam-utils` | 原子操作、作用域线程等基础工具 | 工具箱 |
| `crossbeam-skiplist` | 无锁跳表（Map/Set） | 快速索引 |

## 为什么学 Crossbeam

1. 它是 rayon 等高级并行库的底层依赖，理解 Crossbeam 才能理解 Rust 并行编程的全貌
2. 它展示了无锁编程的核心思想——不靠锁，而是靠"大家约定好时机"来协作
3. 它的 API 设计哲学（如 Chan 的迭代器接口）体现了 Rust "用组合代替复杂性"的理念

## 下一步

- 实际项目中使用 `crossbeam-channel` 替代 `std::sync::mpsc`
- 学习 `crossbeam-epoch` 的 pin/guard 机制，理解纪元如何工作
- 阅读 rayon 源码，看它如何在 Crossbeam 之上构建任务调度
