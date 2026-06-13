---
title: "snmalloc(2019) — 把释放内存变成寄快递"
来源: 'Liétar et al., "snmalloc: A Message Passing Allocator", ISMM 2019'
日期: 2026-06-13
分类: 操作系统
子分类: 内核与虚拟化
难度: 中级
provenance: pipeline-v3
---

## 是什么

snmalloc 是一种**用消息传递代替线程本地缓存**的内存分配器。日常类比：像一个快递中转站——你不在自己家门口处理所有退货，而是把要退的东西打包贴标签，送回当初发货的那个仓库处理。

普通内存分配器的思路是"各管各的"：每个线程有自己的小仓库（线程本地缓存），分配和释放都在自己仓库里操作，快是快，但一旦出现跨线程场景——线程 A 分配了一块内存，线程 B 用完要释放——就麻烦了。B 不能直接把内存塞回 A 的仓库，要么加锁（慢），要么暂存在自己这边等批量归还（占内存）。

snmalloc 换了一个思路：**每个线程有一个"邮箱"**。你要释放别人分配的内存？把对象打包扔进邮箱，后台自动寄回原主人。原主人在下次分配/释放时顺手拆邮件，把归还的内存收进自己的空闲列表。

这个设计在 ISMM 2019 上由微软研究院提出，后来被 DataFusion、Spice.ai 等项目采用，特别适合"一个线程分配、另一个线程释放"的生产者-消费者模式。

## 为什么重要

不理解 snmalloc，下面这些事就没法解释：

- 为什么 jemalloc / tcmalloc 在普通多线程场景下表现好，但在生产者-消费者模式下会出现性能悬崖
- 为什么有些高性能系统（如 DataFusion）在改用 snmalloc 后内存占用下降了 10-20%
- 什么是"无锁 MPSC 队列"以及为什么它能在入队只需一次原子操作、出队完全不需要同步
- 为什么 snmalloc 被称为"最安全的分配器"——它原生支持 CHERI 硬件能力（capability），安全加固的性能损失不到 5%

## 核心要点

snmalloc 的设计可以拆成三个关键机制：

**1. 消息传递而非线程缓存**

每个线程有一个 allocator 实例。当线程 A 释放了线程 B 分配的对象时，A 不会自己处理这块内存，而是把它打包成一条"消息"（包含对象地址 + 原主人 ID），扔进自己的出站桶里。攒够一批（默认约 1 MiB）后一次性发走。

类比：像公司不同部门之间的报销单——不是每个报销单单独跑到财务部，而是每个部门攒一叠，每周五统一送过去。

**2. 时间性基数树（Temporal Radix Tree）——路由消息**

关键问题：如果有 100 个线程，每个线程都要给其他 99 个线程发消息，难道要维护 99 个队列吗？

snmalloc 的解法：每个 allocator 只维护固定 64 个桶（2^6）。收件人地址的低 6 位决定消息进哪个桶。发消息时把桶的内容发给"这个桶里排在队首的 allocator"。那个 allocator 收到后：是给自己的就收下，不是自己的就用**接下来的 6 位**重新分桶，继续转发。在 48 位地址空间中最坏情况下只需要 7 跳。

类比：像公司前台收快递——前台按楼层号分拣（看地址后几位），每层的前台继续按房间号分拣。不需要每个房间都跟所有其他房间直接对接。

**3. 无锁 MPSC 队列——最小的同步开销**

每个 allocator 有一个 MPSC（多生产者、单消费者）队列用来接收消息。入队只需要**一次内存屏障 + 一次原子交换**（不是 CAS 循环），出队**完全不需要任何同步操作**。代价是牺牲了线性一致性（linearizability），但对"释放内存"这个场景来说完全够用——反正释放的内存什么时候真正回收对程序逻辑没有可见影响。

批处理是关键性能来源：一条原子操作可以把上千个对象一次性送过去。

## 实践案例

### 案例 1：生产者-消费者模式的天然适配

Web 服务器的典型场景：accept 线程分配请求缓冲区，worker 线程处理完请求后释放缓冲区。

```cpp
// 线程 1（accept）：分配缓冲区
void accept_loop() {
    while (true) {
        auto* buf = snmalloc::alloc<RequestBuffer>(4096);
        // 读取请求数据到 buf
        dispatch_to_worker(buf);  // 交给 worker
    }
}

// 线程 2（worker）：处理完释放
void worker_loop() {
    while (true) {
        auto* buf = get_next_request();  // 拿到 buf
        handle_request(buf);
        // 释放——buf 是线程 1 分配的
        // snmalloc 不会在这里做复杂操作，只是把 buf
        // 打进消息包，攒够一批后寄回线程 1
        snmalloc::free(buf);
    }
}
```

**逐部分解释**：

- `alloc<RequestBuffer>(4096)` 在线程 1 的 allocator 上分配，这块内存"属于"线程 1
- 线程 2 调用 `free(buf)` 时，snmalloc 不直接操作线程 1 的数据结构，而是把释放请求打包成消息
- 默认攒够 1 MiB 才真正发送，所以大量释放才触发一次原子操作
- 线程 1 下次做 `alloc` 或 `free` 时顺手处理收到的消息，把内存收回自己的空闲列表

### 案例 2：用 snmalloc 替换默认分配器

snmalloc 可以作为全局分配器替换系统的 malloc/free，只需链接即可：

```cpp
// 方式一：编译时链接替换（推荐）
// g++ -o myapp myapp.cpp -lsnmallocshim

// 方式二：LD_PRELOAD 运行时替换
// LD_PRELOAD=libsnmallocshim.so ./myapp

// 方式三：C++ 显式使用
#include <snmalloc.h>

void example() {
    // 用 snmalloc 的 arena 管理一组 allocator
    snmalloc::Alloc alloc;

    // 分配
    void* ptr = alloc.alloc(1024);

    // 使用...

    // 释放——即使在不同线程调用也没问题
    alloc.free(ptr);
}
```

**逐部分解释**：

- `libsnmallocshim` 是 snmalloc 提供的 shim 库，拦截所有 malloc/free/realloc 调用，透明替换
- `LD_PRELOAD` 方式不需要重新编译，适合快速测试
- 显式使用 `snmalloc::Alloc` 可以获得更多控制（如自定义 slab 大小、消息批处理阈值）
- 注意：snmalloc 要求最小分配对象为 16 字节（64 位系统），因为释放消息需要嵌入对象内部（入侵式队列）

### 案例 3：在 Rust 项目中使用 snmalloc

DataFusion 项目推荐使用 snmalloc-rs 来减少内存占用：

```rust
// Cargo.toml
// [dependencies]
// snmalloc-rs = "0.3"

use snmalloc_rs::SnMallocAllocator;

#[global_allocator]
static GLOBAL: SnMallocAllocator = SnMallocAllocator;

fn main() {
    // 所有 Box、Vec、String 的分配都走 snmalloc
    let data: Vec<u8> = vec![0; 1_000_000];
    println!("分配了 {} 字节", data.len());

    // data 在离开作用域时自动释放
    // 释放操作走消息传递路径
}
```

**逐部分解释**：

- `#[global_allocator]` 是 Rust 的全局分配器属性，设置后所有堆分配都经过 snmalloc
- `SnMallocAllocator` 是 snmalloc-rs 提供的包装类型
- DataFusion 实测：替换默认分配器后内存占用下降 10-20%
- 但要注意：Rust 默认分配器在单线程场景下可能更快，snmalloc 的优势在**多线程 + 跨线程释放**场景

## 踩过的坑

1. **单线程场景下不如 mimalloc**：snmalloc 的消息传递机制在只有一条线程时是纯开销——没有其他线程可发消息，队列和基数树都是摆设。这种情况用 mimalloc 或系统默认分配器更合适。

2. **小对象（< 16 字节）有额外开销**：snmalloc 的入侵式消息队列要求最小对象大小为 2 * 指针大小（64 位系统上 16 字节），因为释放消息本身要写在对象的内存里。如果程序大量分配 8 字节对象，snmalloc 会浪费不少内存。

3. **MPSC 队列不线性一致**：出队操作不需要原子指令，代价是队列的 back 指针不会在出队后更新。这对内存释放场景无害（反正回收的时机对程序不可见），但在调试或验证时可能让你困惑。

4. **消息批处理阈值需要调优**：默认 1 MiB 的批处理阈值在大部分场景下合理，但如果你每个对象只有几十字节，要攒几万个对象才触发一次发送，可能导致内存"挂起"太久。可以通过配置参数调整。

## 适用 vs 不适用场景

**适用**：
- 生产者-消费者多线程模式（一个线程分配，另一个线程释放）
- 需要高安全性保障的系统（snmalloc 有最强的安全加固，CHERI 原生支持）
- 高并发服务器（web server、数据库引擎、消息队列）中的请求处理流水线
- 跨线程分配/释放频繁的应用（如 actor 模型、CSP 风格并发）

**不适用**：
- 纯单线程程序——消息传递机制是纯开销，用系统默认分配器或 mimalloc 更快
- 大量极小对象（< 16 字节）的场景——入侵式队列浪费内存
- 对分配器"实时性"要求极高的场景——消息批处理引入不可预测的延迟
- 不需要跨线程释放的简单多线程程序——普通线程缓存分配器（jemalloc）更成熟稳定

## 历史小故事（可跳过）

- **2019 年 6 月**：ISMM 2019 在美国凤凰城召开。微软研究院一个团队展示了 snmalloc，标题就直接点明核心："A Message Passing Allocator"。论文 14 页，作者来自微软剑桥研究院和帝国理工学院。

- **同一场会议**：微软另一个团队也发表了 **mimalloc**——另一种高性能分配器。同门师兄走不同路线：mimalloc 用线程本地堆 + 延迟释放，snmalloc 用消息传递。两个项目至今都在活跃维护。

- **2020-2022 年**：snmalloc 开始被工业项目采用。Apache DataFusion（Rust 查询引擎）推荐使用 snmalloc-rs 替换默认分配器，实测内存降低 10-20%。

- **2023 年（v0.6.0）**：snmalloc 加入了业界最强的安全加固特性——包括 CHERI 硬件能力（capability）支持、空闲列表保护、带 guard 的 memcpy。安全加固的性能损失不到 5%，远低于 mimalloc 的 secure 模式和 SCUDO。

- **与 mimalloc 的关系**：两种分配器都来自微软研究院，设计路线不同但互相吸取经验。snmalloc 开发者曾表示：snmalloc 的目标不是"比 mimalloc 快"，而是在生产者-消费者模式和安全加固这两个维度上做到最优。

## 学到什么

1. **内存分配器不一定要本地缓存**——snmalloc 证明了"消息传递"模式在特定场景下比线程本地缓存更优，关键是要找到正确的问题（生产者-消费者）去解决
2. **批处理是无锁编程的利器**——把上千次操作合并成一次原子操作，比任何精巧的锁算法都有效
3. **安全性不一定要牺牲性能**——snmalloc v0.6.0 做到了安全加固 < 5% 开销，打破了"安全就一定慢"的刻板印象
4. **设计要对着问题来**——snmalloc 不是"最快的通用分配器"（那是 mimalloc 擅长的），但它在自己瞄准的问题（跨线程释放 + 安全性）上是无可争议的冠军

## 延伸阅读

- 论文 PDF：[snmalloc: A Message Passing Allocator](https://github.com/microsoft/snmalloc/blob/main/snmalloc.pdf)（ISMM 2019，14 页）
- 源码与文档：[microsoft/snmalloc](https://github.com/microsoft/snmalloc)（GitHub，含 design 文档和 difference.md 与其他分配器对比）
- Rust 绑定：[snmalloc-rs](https://github.com/SchrodingerZhu/snmalloc-rs)（DataFusion 推荐使用）
- 竞品对比：[microsoft/mimalloc](https://github.com/microsoft/mimalloc)（同门出品，线程本地堆路线，通用场景更快）
- [[jemalloc-2006]] —— Meta 出品的老牌分配器，线程缓存 + arena 设计
- [[doligez-leroy-concurrent-gc]] —— OCaml 并发 GC，同样面对"多线程内存回收"问题但走的是 GC 路线

## 关联

- [[jemalloc-2006]] —— 线程缓存 + arena 设计，snmalloc 在 "为什么重要" 部分频繁对比的对象
- [[doligez-leroy-concurrent-gc]] —— 并发 GC 的经典，面对同一个问题（多线程回收）但解法完全不同的路线
- [[immix-mark-region]] —— 现代 GC 算法，展示了"标记-整理"与 snmalloc 的"消息传递回收"之间的思路差异
- [[hazard-pointers-2004]] —— 无锁内存回收的另一种经典方案，与 snmalloc 的 MPSC 队列思路互补
- [[rcu-2001]] —— RCU 也是推迟回收的思路，和 snmalloc 的批处理消息有精神上的相似：把回收"攒一攒再处理"
- [[volcano]] —— Volcano 查询执行引擎，DataFusion 的祖先之一，snmalloc 在此类查询引擎里大放异彩
- [[barrelfish-2009]] —— 多核 OS 研究项目，同样关注多核场景下的资源管理问题

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

