---
title: Dijkstra 1965 — N 个进程怎么轮流上厕所而且谁也别卡死
来源: Edsger W. Dijkstra, "Solution of a Problem in Concurrent Programming Control", CACM 8(9):569, 1965
日期: 2026-06-01
分类: 操作系统
难度: 中级
---

## 是什么

这是计算机历史上**第一篇**用纯软件（只靠普通的读和写共享变量）解决"N 个并发进程怎么排队互斥"的论文。CACM 原文极短（大约一两页），作者是 Edsger Dijkstra。

日常类比：办公室只有 1 个洗手间，**N 个人**都要用。规则要满足三条：

1. **互斥**：同一时刻里面只能有 1 个人
2. **不卡死**：只要有人想用，**总会有某个**人能进去（不能所有人在门口僵住）
3. **不假设速度**：有人走得快、有人走得慢、有人临时去打水都不影响正确性

而且——你**不能**装感应锁，**不能**装抢答按钮，每个人只能往墙上的小黑板写自己的状态、读别人的状态。这个题在 1965 年看起来不可能，Dijkstra 给出了第一个答案。

## 为什么重要

不读这篇，下面这些事都没法解释：

- 为什么 Java 的 `synchronized`、Go 的 `sync.Mutex`、Rust 的 `Mutex<T>`、POSIX 的 `pthread_mutex` **都在做同一件事**——它们的"规约"就是 Dijkstra 这三条
- 为什么操作系统课本第一章讲完进程，第二章一定讲 P/V 信号量——P/V 也是 Dijkstra 1965 年发明的（同一年另一篇技术报告 EWD123）
- 为什么"自旋锁"、"读写锁"、"条件变量"、"管程（monitor）"听起来花样百出，但拆开看都是 Dijkstra 三条性质的不同强化版
- 为什么 Lamport、Hoare、Brinch Hansen 这些人都把 Dijkstra 1965 当起点

## 核心要点

论文要证明的命题是：**只用普通的共享内存读写**（没有原子 CAS、没有 test-and-set、没有 turn off 中断），N 个进程也能做到互斥 + 不卡死。

算法的**三件道具**（Dijkstra 起的名字）：

1. **`b[i]`**：每个进程 i 自己的"我现在没在抢"标志位
2. **`c[i]`**：每个进程 i 的"我已经决定要进去了"标志位
3. **`k`**：全局变量，写着"现在该谁优先"

进入临界区前，进程 i 大致做这件事：

```text
反复尝试：
  b[i] = false             # 我开始抢了
  while k != i:
    if c[k] == true:        # 当前指针指着的人已经走了
      k = i                 # 把指针抢过来
  c[i] = false              # 我决定要进去
  扫一遍所有别的 j：
    如果 c[j] == false：    # 有人也决定要进
      回到最开始重抢
进入临界区
出临界区时：c[i] = true; b[i] = true
```

**关键洞察**：`k` 不是"锁"，是一个"建议指针"。任何人都能在合适的时机把它改成自己的编号；但**改完之后还要再扫一圈**确认没人和自己同时决定——这一步是防双重进入的关键。

Dijkstra 在论文里**手工证明**了：（a）不可能两人同时进；（b）不会全体永远卡死。但他**坦白**：可能**某一个倒霉鬼**永远抢不到——这叫**饥饿**（starvation），论文不解决。一年后 Knuth 1966 改进了算法，给了无饥饿版。

## 实践案例

### 案例 1：现代 Mutex 的"祖先 DNA"

打开 Go 标准库 `sync/mutex.go`，你会看到一个状态字段，里面用位编码"是否锁着"、"是否有人在等"、"是否饥饿模式"。这个**饥饿模式**就是为了解决 Dijkstra 1965 没解决的那个问题——Go 1.9 加的，到这里历史绕了 52 年。

### 案例 2：为什么 x86 提供 `LOCK CMPXCHG`

Dijkstra 证明了"只用普通读写也能做"，但代价是算法**复杂、慢**——每次进临界区要扫描全部 N 个进程的标志位。所以现实里 CPU 厂商加了硬件原语：

```text
test-and-set    # 单条指令读+写
compare-and-swap # 单条指令比较+写
```

有了这些，Mutex 实现可以从 Dijkstra 算法的 O(N) 缩到 O(1)。Dijkstra 算法在工程上**几乎没人用**，但作为"存在性证明"，它告诉你：硬件原语是优化，不是必需。

### 案例 3：分布式锁也走同一条规约

Redlock、ZooKeeper、etcd 的分布式锁，对外接口看起来差异巨大，但**契约**都是这三条：互斥 + 不卡死 + 不依赖速度假设。每一篇分布式锁的争论文章（"Redlock 安不安全"那场 Martin Kleppmann vs Salvatore Sanfilippo 的辩论），核心都是在问"它真的同时满足这三条吗"。

### 案例 4：Java `synchronized` 关键字

Java 写：

```java
synchronized (obj) {
    counter++;
}
```

JVM 在底层做的事情，一层层拆开：

1. 进入块时尝试拿 `obj` 的对象头里那个 monitor lock
2. 拿不到 → 先 spin（短自旋，对应 Dijkstra 的 busy-wait）
3. 还拿不到 → 进 OS 等待队列，让出 CPU
4. 出块时唤醒一个等待者

这套流程的"正确性"靠 Dijkstra 三条性质保证；"性能"靠 CPU 的 `LOCK CMPXCHG` 指令保证。两层职责分得很清楚。

## 踩过的坑

1. **Dijkstra 算法不解决饥饿**：论文里只承诺"系统不卡死"，没承诺"每个人都能进"。如果你抄这段算法去做生产代码，倒霉的进程可能**永远**饿死。Knuth 1966、Eisenberg-McGuire 1972 才修了这个。

2. **现代 CPU 的内存模型让纯软件算法变危险**：Dijkstra 假设"读写是顺序一致的"——你写完 `b[i]`，别人读 `b[i]` 立刻能看到。**真实 CPU 不是这样**：x86 有 store buffer，ARM 是弱内存模型。直接搬这个算法到 C 代码，没加 `memory_order_seq_cst` 或者 `volatile`，会**悄悄出错**。这也是为什么 1965 的算法不能直接用于今天裸 C 代码。

3. **"忙等"代价高**：算法用 `while` 循环不停读共享变量。在多核 CPU 上这会**疯狂吃 cache 一致性带宽**——所有核心反复 invalidate 同一行 cache，性能崩盘。所以现实 Mutex 都会"先自旋一小会儿，等不到就让出 CPU 进内核睡觉"。

4. **Dijkstra 用"假定关键区不死循环"做证明前提**：如果某个进程进了临界区然后**死循环**，整个系统永远卡住。这条假设今天的 OS 内核里仍然成立——所以内核临界区代码必须**短、不阻塞**。

5. **N 进程版本比 2 进程版本难推广**：Dekker 1962 解决 2 进程时，对称性可以让算法很短。推广到 N 进程时引入了"全局指针 k"，复杂度跳了一个量级。这也提示我们：**并发算法的难度往往和参与者数量非线性相关**。

## 适用 vs 不适用场景

**适用**（理论价值）：
- 学习"互斥"作为规约的标准三条性质
- 理解为什么 Mutex / Semaphore / Monitor 的接口长那样
- 在没有硬件原语的极端环境（早期嵌入式、形式化模型）

**不适用**（工程实践）：
- 任何带 cache 的现代多核 CPU——必须配 memory barrier
- 性能敏感场景——硬件 CAS 永远更快
- 需要无饥饿——用 Knuth 1966 / 改良版
- 跨进程或跨机器——用信号量、内核 mutex、分布式锁

## 历史小故事（可跳过）

- **1962 年**：荷兰数学家 Th. J. Dekker 给 Dijkstra 一个**只针对 2 个进程**的解法，没有正式发表。Dijkstra 把它推广到 N 个。
- **1965 年早期**：Dijkstra 在埃因霍温理工大学带研究生写 THE 操作系统，需要一种通用的同步原语。他写出本文。
- **1965 年同年**：Dijkstra 在内部技术报告 EWD123《Cooperating Sequential Processes》里发明 **P/V 信号量**——两个荷兰语单词的首字母（Passering / Vrijgave，"通过 / 释放"）。这份报告 1968 才正式发表。
- **1966 年**：Knuth 写信指出"会饿死"，并给出无饥饿版。Dijkstra 公开承认。
- **1968–74 年**：Brinch Hansen 和 Hoare 把信号量包装成更高层的"管程（monitor）"——这就是后来 Java `synchronized` 的直接来源。

整条族谱：**Dekker 1962 → Dijkstra 1965（本文）→ 信号量 → 管程 → POSIX → 各语言 Mutex**。

## 学到什么

1. **规约 vs 实现**：Dijkstra 没给最快的算法，他给了"什么叫正确的互斥算法"。后来所有实现都是在不同硬件上**重新满足**这份规约
2. **三条性质是底线**：互斥、无死锁、不依赖速度。少一条就不算同步原语，多一条（如无饥饿）算 bonus
3. **饥饿和死锁不是一回事**：死锁是"全体卡住"，饥饿是"某个倒霉的卡住"。前者影响系统，后者影响公平
4. **理论 → 硬件 → 库**：Dijkstra 证明可行 → CPU 提供 CAS 加速 → OS / 语言库封装成 Mutex。每一层的约束和 trade-off 都不一样

## 延伸阅读

- 论文 PDF：[Dijkstra 1965 — Solution of a Problem in Concurrent Programming Control](https://dl.acm.org/doi/10.1145/365559.365617)（CACM 短文，密度极高）
- EWD123 中文导读：[Cooperating Sequential Processes](https://www.cs.utexas.edu/~EWD/transcriptions/EWD01xx/EWD123.html)（信号量的诞生地）
- 教科书：Andrew Tanenbaum《Modern Operating Systems》第 2 章互斥
- 视频：[Brian Will — The Mutual Exclusion Problem](https://www.youtube.com/results?search_query=mutual+exclusion+problem+dijkstra)
- [[lamport-bakery]] —— Lamport 1974 面包店算法，无饥饿版，连原子读写都不要

## 关联

- [[lamport-bakery]] —— Lamport 把 Dijkstra 的算法改成无饥饿、无原子读写
- [[lamport-tla-1994]] —— TLA 是验证这类同步算法的现代工具
- [[hoare-csp-1978]] —— CSP 用消息传递替代共享内存，绕开 Dijkstra 题目
- [[turing-1936]] —— 可计算性的祖宗，并发原语解决的是"如何让多个图灵机协作"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[lamport-tla-1994]] —— TLA — 把状态机和时序逻辑捏成一个公式
- [[monitors-1974]] —— Hoare Monitors 1974 — 把锁藏进对象里，让并发代码读起来像普通函数
- [[turing-1936]] —— Turing 1936 可计算性

