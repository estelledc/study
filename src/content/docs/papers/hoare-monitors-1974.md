---
title: Hoare Monitors 1974 — 把锁和等待队列封进一个房间
来源: 'C.A.R. Hoare, "Monitors: An Operating System Structuring Concept", Communications of the ACM 17(10):549-557, 1974'
日期: 2026-05-29
分类: 操作系统
难度: 中级
---

## 是什么

Monitor（管程）是一种**把共享数据、操作数据的函数、进入规则、等待队列放在一起**的并发结构。

日常类比：一家银行不要让顾客自己抢柜台，也不要让顾客自己拿钥匙开保险柜。银行只开放几个窗口，顾客排队进去，窗口里面有账本和规则；同一时刻只有一个柜员改同一本账，钱不够时顾客先在指定队伍等。

Hoare 1974 的核心主张是：操作系统里每类资源都可以有一个小调度员。磁盘、缓冲区、打印机这些共享资源，不要把锁散在用户程序里，而要包成 monitor，让外部程序只能通过 `acquire`、`release`、`append`、`remove` 这类入口访问。

它比"到处写 semaphore P/V"更像今天的 `synchronized object`、`Mutex + Condvar` 或 Java monitor：锁是结构的一部分，不是调用者随手拿的一把工具。

## 为什么重要

不理解 monitor，下面这些事都没法解释：

- 为什么 Java 的 `synchronized` / `wait` / `notify` 会把"互斥"和"等待条件"绑在同一个对象上。
- 为什么条件变量不是一个布尔值：`notEmpty` 不是"当前非空"，而是一条等待队列。
- 为什么并发 bug 常常不是"没加锁"，而是"锁、状态和唤醒规则分散在不同地方"。
- 为什么操作系统教材会把 bounded buffer、readers-writers、disk scheduler 放在同一章讲：它们都是资源调度问题。

## 核心要点

1. **把门装在房间上**：monitor 的本地数据只能由 monitor 内部过程访问。类比银行账本只在柜台里面，顾客不能绕到后面自己改。

2. **自动互斥**：同一时刻最多一个进程在 monitor 过程里执行。类比一次只放一个人进小房间，避免两个人同时改同一张表。

3. **condition 是等待理由**：进程发现资源不满足条件时，对某个 condition 执行 `wait`；另一个进程改变状态后执行 `signal`。类比"等空柜台"和"等账户有余额"是两条不同队伍。

Hoare 还给出一个强语义：`signal` 会立刻把 monitor 使用权交给被唤醒者，中间不允许第三个进程插队。这让被唤醒者可以相信刚刚成立的条件还没被别人抢走。

## 实践案例

### 案例 1：单个资源调度器

```txt
monitor SingleResource:
  busy := false
  condition nonbusy
  acquire():
    if busy: wait(nonbusy)
    busy := true
  release():
    busy := false
    signal(nonbusy)
```

**逐部分解释**：

- `busy` 是本地状态，外面不能直接改。
- `acquire` 发现资源忙，就去 `nonbusy` 队伍睡觉，并临时让出 monitor。
- `release` 把资源标成空闲，再叫醒一个等待者。

### 案例 2：有界缓冲区

```txt
monitor BoundedBuffer:
  count := 0
  condition nonempty, nonfull
  append(x):
    if count == N: wait(nonfull)
    put x into buffer; count := count + 1
    signal(nonempty)
  remove():
    if count == 0: wait(nonempty)
    take x from buffer; count := count - 1
    signal(nonfull)
```

**逐部分解释**：

- 生产者满了就等 `nonfull`，消费者空了就等 `nonempty`。
- 两个等待理由分开，代码读起来像业务规则，而不是一堆 P/V 拼图。
- monitor 自动保护 `count`，所以生产者和消费者不会同时把计数改坏。

### 案例 3：读者写者

```txt
monitor ReadersWriters:
  readers := 0; writing := false
  condition okRead, okWrite
  startRead():
    if writing: wait(okRead)
    readers := readers + 1
  startWrite():
    if writing or readers > 0: wait(okWrite)
    writing := true
```

**逐部分解释**：

- 多个 reader 可以一起进，因为它们只读。
- writer 必须独占，因为写到一半被读会看到脏状态。
- 真正难点不在锁，而在"读者优先、写者优先、避免饥饿"这些调度策略。

## 踩过的坑

1. **把 condition 当成布尔变量**：condition 自身没有真假值，它只是等待队列；真正的真假要看 monitor 的本地状态。

2. **以为 `signal` 等于广播**：Hoare 论文里的 `signal` 只恢复一个等待者；想唤醒一批 reader，需要显式连续传递或另外设计。

3. **忘记 `wait` 会释放互斥权**：如果等待时还占着 monitor，释放资源的过程就永远进不来，系统会自己堵死。

4. **只证明互斥，不证明调度**：monitor 能让状态更新安全，但仍可能出现死锁、饥饿、长期超车和负载下抖动。

## 适用 vs 不适用场景

**适用**：

- 资源有明确本地状态，例如缓冲区数量、磁盘头方向、当前 reader 数。
- 调用者只需要几个入口过程，不应该直接碰内部数据。
- 等待理由能清楚命名，例如 `nonempty`、`nonfull`、`okWrite`。
- 希望把同步规则放进库或语言，而不是散在每个业务调用点。

**不适用**：

- 跨多个 monitor 同时拿资源的场景，容易形成循环等待。
- 需要全局最优调度的系统，单个 monitor 只看自己的局部信息。
- 极低层中断路径，进入 monitor 的开销可能太高。
- 只靠原子变量就能表达的短小无阻塞逻辑。

## 历史小故事（可跳过）

- **1965 年**：Dijkstra 提出信号量，给并发程序一个通用的 P/V 工具。
- **1972 年**：Brinch Hansen 提出 structured multiprogramming，把共享过程和数据组织得更像模块。
- **1974 年**：Hoare 在 CACM 发表这篇论文，把 monitor、condition、证明规则和多个 OS 例子放到一套概念里。
- **1978 年以后**：Hoare 转向 CSP，另一条路线是不共享内存、靠消息通信。
- **1980 年**：Mesa 系统采用更工程化的 monitor 语义，后来影响 Java、pthread condition variable 等实现。

## 学到什么

- **并发抽象的关键是边界**：共享数据必须和修改它的过程放在同一个边界里。
- **等待要按理由分队**：`nonempty`、`nonfull` 这种名字让调度规则变得可读。
- **同步语义会影响写法**：Hoare 语义下唤醒者立刻运行，Mesa 语义下通常要醒来后重新检查条件。
- **局部正确不等于系统顺滑**：论文最后强调 overload、等待时间方差、避免固定优先级，这些都是 OS 调度的现实问题。

## 延伸阅读

- 论文 PDF：[Hoare 1974 Monitors](https://pages.cs.wisc.edu/~remzi/Classes/736/Fall2010/Papers/hoare-monitors.pdf)
- DOI 页面：[ACM DOI 10.1145/355620.361161](https://doi.org/10.1145/355620.361161)
- 教材章节：[OSTEP Monitors](https://pages.cs.wisc.edu/~remzi/OSTEP/threads-monitors.pdf)
- [[dijkstra-1965]] —— 先有信号量，monitor 是把 P/V 封装成结构化模块。
- [[csp-hoare-1978]] —— Hoare 后来给出另一条并发路线：共享内存之外的消息通信。

## 关联

- [[monitors-1974]] —— 同一主题的既有入口，适合快速复习 monitor 直觉。
- [[the-os-1968]] —— Dijkstra 用分层和信号量证明 OS 可以被结构化。
- [[dijkstra-1965]] —— 信号量是 monitor 实现和对比的基础原语。
- [[csp-hoare-1978]] —— 从"共享资源受控访问"走向"进程之间只通信"。
- [[sequential-consistency-1979]] —— 并发程序要讲清楚"谁先谁后"，monitor 也在定义这种顺序。
- [[stm-shavit-touitou]] —— 另一种共享状态并发抽象：把冲突检测交给事务。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[lamport-bakery]] —— Lamport Bakery — 用取号排队解决并发互斥
