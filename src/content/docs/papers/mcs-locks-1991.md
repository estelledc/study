---
title: MCS 锁 — 让每个线程自旋在自己的缓存行上
来源: Mellor-Crummey & Scott, "Algorithms for Scalable Synchronization on Shared-Memory Multiprocessors", ACM TOCS 1991
日期: 2026-06-01
分类: 操作系统
难度: 中级
---

## 是什么

MCS 锁是一种**让 N 个线程抢锁时总线流量保持 O(1) 而不是 O(N)** 的自旋锁。日常类比：从"全大厅人盯一个屏幕等叫号"换成"每人手里一张票，前面那位办完了亲手把下一张递给你"。

传统 test-and-set 锁就是前者：解锁时大家的 CPU 缓存同时失效、抢同一根总线，机器越大越糟糕。MCS 改成：

- 每个等待者**自带一个 qnode**（节点结构体），自旋在自己 qnode 的 `locked` 字段上
- 排成 FIFO 队列，前一个释放时**亲手**把后一个 qnode 的 `locked` 改成 false 唤醒它
- 整个切换只动两根 cache line（前驱的和后继的），与线程总数无关

这就是 Linux 内核 qspinlock 背后的核心算法；Java `AbstractQueuedSynchronizer` 用的是同期近亲 **CLH** 队列锁（见案例 3），不是直接搬 MCS。

## 为什么重要

不理解 MCS，下面这些事都没法解释：

- 为什么 Linux 内核 4.2 之后所有自旋锁都换成了 qspinlock，性能在 100+ 核机器上仍线性扩展
- 为什么 `java.util.concurrent.locks.ReentrantLock` 比 `synchronized` 在高并发下经常更快
- 为什么数据库锁管理器、JVM monitor、Go runtime 排队 mutex 全长得像同一种结构
- 为什么"自旋锁不能扩展"这种 1980 年代的偏见在 1991 年就被这篇论文推翻了

## 核心要点

MCS 锁的算法分**加锁** + **解锁**两段，关键是引入 qnode：

```c
struct qnode {
    struct qnode *next;
    bool locked;
};
struct lock {
    struct qnode *tail;  // 队尾原子指针
};
```

**加锁**（acquire）：

1. **入队**：原子 `swap(lock.tail, &my_qnode)`，拿到旧 tail（前驱 prev）
2. **若 prev 不为空**（前面有人）：把 `my_qnode.locked = true`，再让 `prev->next = &my_qnode`，然后**自旋等 `my_qnode.locked` 变 false**
3. **若 prev 为空**：直接拿到锁，无需自旋

**解锁**（release）：

1. **若 `my_qnode.next == NULL`**：可能没人排队。尝试 `CAS(lock.tail, &my_qnode, NULL)`。成功就直接走
2. **若 CAS 失败**：说明有后继正在入队，等 `my_qnode.next` 被填回来
3. **唤醒后继**：把 `next->locked = false`

整个过程的精髓是 **本地自旋**——每个线程只读写自己 cache line 上的 `locked` 字段，前驱写一次、自己读到，零跨核 invalidation。

## 实践案例

### 案例 1：传统 test-and-set 为什么扛不住

```c
while (atomic_exchange(&lock, 1) != 0)
    ;  // 自旋
```

8 个 CPU 同时自旋在 `lock` 上，cache line 在它们之间反复弹来弹去；锁持有者要释放时还要先把这条 line 抢回来。Anderson 1990 测过：16 核机器上吞吐量比 1 核还低。

MCS 把 `lock` 这个共享自旋目标换成 `my_qnode.locked`——每个 CPU 自旋在**自己**的 cache line 上，谁也不打扰谁。

### 案例 2：Linux qspinlock 怎么改进

Linux 内核 4.2（2015）默认自旋锁换成 qspinlock。它在 MCS 基础上做了两件事：

- **fast path**：无竞争时只用 `cmpxchg` 一次，不分配 qnode（朴素 MCS 在低竞争场景比 test-and-set 慢，因为多了入队步骤）
- **qnode 复用**：在 4 个 per-CPU qnode 池里循环用，避免栈分配开销

源码在 `kernel/locking/qspinlock.c`，论文还在被引用。

### 案例 3：Java AQS 是 MCS 的近亲

Doug Lea 的 `AbstractQueuedSynchronizer`（JDK 1.5，2004）用的是 CLH 队列锁——MCS 同期的另一个变体（Craig 1993）。区别：

- MCS 自旋在**自己**节点的 locked 上，前驱写后继
- CLH 自旋在**前驱**节点的状态上，后继读前驱

`ReentrantLock` / `Semaphore` / `CountDownLatch` / `FutureTask` 全部基于 AQS，整个 `java.util.concurrent` 的并发原语就是这一棵树。

## 踩过的坑

1. **qnode 生命周期**：qnode 必须在整个 acquire-release 期间有效。常见做法是放在调用者栈上，但**不能放进会被提前回收的嵌套作用域**——前驱可能正要写它，调用者一弹栈就 use-after-free

2. **解锁时 next 短暂为空**：线程 A 已 swap 进 tail 但还没来得及写 `prev->next = self`，前驱此时去读 `next` 会拿到 NULL。必须忙等几个周期让后继填回——这就是步骤 2 的 CAS 失败分支存在的原因

3. **低竞争反而更慢**：朴素 MCS 即使无人争抢也要走 swap + 检查路径，比 `test-and-set` 多几条原子指令。所以工业实现都加 fast path

4. **false sharing**：qnode 必须按 cache line（典型 64 byte）对齐，否则两个 qnode 落在同一行，两个 CPU 的"本地"自旋还是会互相 invalidate，优势全没

## 适用 vs 不适用场景

**适用**：

- 多核共享内存机器上的内核 / runtime 自旋锁（核数越多优势越大）
- 已知会有持续竞争的关键路径（数据库锁管理器、JVM monitor 升级路径）
- 需要 FIFO 公平性的场景——MCS 天然 FIFO，不会饿死
- 需要可证明扩展性上限的系统设计——MCS 的总线流量上界与线程数无关，便于做容量规划

**不适用**：

- 单核或几乎无竞争的场景——朴素 MCS 比 test-and-set 慢，须加 fast path
- 用户态短临界区——OS 调度 + futex 配合往往更省 CPU（自旋锁烧 CPU）
- cache 一致性弱或无的架构（部分嵌入式 NUMA）——CLH 变体可能更合适
- 需要可重入或读写锁——MCS 是基础原语，重入和读写要在上面再封一层

## 历史小故事（可跳过）

- **1980 年代末**：Sequent、SGI 的多处理器机器开始进 30+ CPU 时代，传统锁瓶颈暴露
- **1990 年**：Anderson 在 IEEE TPDS 提出基于数组的排队锁，第一次解决"O(N) 总线流量"，但每个等待者还是自旋在数组某格上，cache line 共享
- **1991 年**：Mellor-Crummey 和 Scott 在 Rochester 大学发表本文，**首次实现真正的本地自旋**，并附带 barrier 等其他可扩展同步原语。论文 41 页，是同步领域的 *Communications of the ACM* 级经典
- **1993 年**：Craig 提出 CLH 锁；Landin & Hagersten 1994 独立发明同款。CLH 与 MCS 同等重要，是 AQS 的直接祖先
- **2004 年**：Doug Lea 把 CLH 队列封进 `AbstractQueuedSynchronizer`，整个 `java.util.concurrent` 一夜之间有了底座
- **2015 年**：Linux 4.2 把所有自旋锁换成 qspinlock（基于 MCS）。距离论文发表 24 年

## 学到什么

1. **共享自旋是反模式**——任何让 N 个线程读写同一变量的设计都不会扩展。"本地化每个等待者的状态"是底层并发的通用解药
2. **队列是同步的万能数据结构**——锁、信号量、读写锁、屏障，下层都是某种 FIFO 队列。AQS 把这一点用到极致
3. **理论 → 24 年 → 工业默认**：1991 年的论文，2015 年才进 Linux 默认路径。底层基础设施的更新极慢，但一旦换了就影响每秒数十亿次锁操作
4. **fast-path 永远要有**：朴素算法在常见情况（无竞争）跑不过土办法，工程实现必须在常见路径上抄近道
5. **缓存一致性是隐形的成本中心**：算法复杂度 O(1) 不等于硬件成本 O(1)；要扩展性，得算到 cache line 级别

## 延伸阅读

- 论文 PDF：[Mellor-Crummey & Scott 1991](https://www.cs.rochester.edu/u/scott/papers/1991_TOCS_synch.pdf)（41 页，前 15 页是核心算法）
- Linux qspinlock 解析：[lwn.net/Articles/590243/](https://lwn.net/Articles/590243/)（Jonathan Corbet 写的内核教程）
- Doug Lea 讲 AQS：[The java.util.concurrent Synchronizer Framework](https://gee.cs.oswego.edu/dl/papers/aqs.pdf)（PLOS 2005）
- [[afs-1988]] —— 同期 Rochester 系的分布式系统经典
- [[amdahl-law-1967]] —— 解释为何"扩展性 O(1)"在多核时代是生死线

## 关联

- [[amdahl-law-1967]] —— Amdahl 定律：串行部分决定加速天花板，锁就是最大的串行部分
- [[afs-1988]] —— 同时代的并发设计，思路相通
- [[aries-1992]] —— 数据库恢复算法，锁管理器的常见 MCS 用户
- [[ssa]] —— 并发底层的另一根支柱：编译器层面的数据流抽象

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[lamport-bakery]] —— Lamport Bakery — 用取号排队解决并发互斥
