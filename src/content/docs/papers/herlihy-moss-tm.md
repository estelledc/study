---
title: Herlihy-Moss 事务内存 — 把数据库事务搬进 CPU
来源: 'Herlihy & Moss, "Transactional Memory: Architectural Support for Lock-Free Data Structures", ISCA 1993'
日期: 2026-05-30
子分类: 类型与 PL 理论
分类: 编程语言
难度: 中级
provenance: pipeline-v3
---

## 是什么

事务内存（Transactional Memory，**TM**）是一种**让多线程访问共享内存时像数据库事务一样工作**的机制：你把一段内存操作圈起来，告诉硬件"这一坨要么全做、要么全不做、中间不能被打断"。

日常类比：去银行转账。你不会先扣对方账户、再加自己账户、然后中间断电——银行用"事务"保证两步要么都成功要么都回滚。Herlihy-Moss 把这套机制塞进了 CPU。

写法长这样：

```c
do {
    LT  R1, [account_a]      // 事务读
    LTX R2, [account_b]      // 事务读+准备写
    sub R1, 100              // 普通运算
    add R2, 100
    ST  [account_a], R1      // 事务写（暂存）
    ST  [account_b], R2
} while (!Commit())          // 提交失败就重来
```

不需要锁、不会死锁、出错就自动重试。这就是 1993 年这篇 ISCA 论文画的饼。

## 为什么重要

不理解 TM，下面这些事都没法解释：

- 为什么 Intel CPU 在 2013 年的 Haswell 上加了一组叫 **TSX** 的新指令——那是这篇 1993 论文的工业落地
- 为什么 IBM POWER8 / ARM 都在跟进 HTM——20 年才把硬件做出来
- 为什么 Java 8+ 引入 `StampedLock`、Clojure 的 `dosync` 都说自己"事务式"——它们在软件层模仿这个想法（STM）
- 为什么 Intel TSX 在 2014/2019/2021 三次被微码禁用——侧信道攻击让它变成熔断/幽灵的亲戚

## 核心要点

Herlihy-Moss 的提议拆成 **三块**：

1. **6 条新指令**：`LT`（事务读）、`LTX`（事务读+预备写）、`ST`（事务写，暂存）、`Validate`（检查还有效吗）、`Commit`（一次性生效）、`Abort`（丢弃）。普通 load/store 不变。

2. **transactional cache**：在 L1 旁边再加一块小缓存，专门暂存事务的读写集。提交前所有 `ST` 都只在这里——别的核看不见。

3. **借用缓存一致性协议**：MESI 协议本来就在追踪"谁读了谁写了"。事务期间如果某行被别的核改了，硬件直接知道冲突——发起 abort，重试。

类比：写文档用 **Google Docs 离线模式**。你断网编辑（事务暂存），重新连网时如果别人没改这段就保存（commit），改了就让你看冲突再来一次（abort + retry）。

## 实践案例

### 案例 1：无锁链表插入

传统加锁版本要操心死锁、优先级反转、锁粒度。TM 版本：

```c
retry:
    LT   prev, [head]
    LT   curr, [prev->next]
    while (curr->key < new_key) {
        prev = curr
        LT curr, [curr->next]
    }
    LTX prev_next, [prev->next]
    ST  [new_node->next], curr
    ST  [prev->next], new_node
    if (!Commit()) goto retry
```

中间任何一步发现别的线程改了链表，硬件抛 abort，重新从头扫。**程序员不用想锁顺序**。

### 案例 2：Intel TSX 真实代码

2013 年 Haswell 上你能写：

```c
unsigned status = _xbegin();
if (status == _XBEGIN_STARTED) {
    // 事务区
    counter++;
    _xend();
} else {
    // abort 路径（fallback）
    pthread_mutex_lock(&fallback_lock);
    counter++;
    pthread_mutex_unlock(&fallback_lock);
}
```

**fallback 路径必须有**——因为 TSX 是"best effort"，硬件可以无理由 abort（中断、cache 装不下、跨核冲突）。这是 Herlihy-Moss 留下的一个现实包袱。

### 案例 3：STM 是软件版

Shavit & Touitou 1995 把这套东西用纯软件实现——慢但不需要新硬件。Clojure 的 `(dosync ...)` 就是 STM。你能用今天的 JVM 直接跑 1993 这篇论文的精神。

## 踩过的坑

1. **事务大小受 cache 容量限制**：transactional cache 装不下你的读写集，硬件只能 abort。Intel TSX 的 L1 只有 32KB，复杂事务直接放弃。

2. **中断 / 系统调用必 abort**：你在事务里调 `printf`，多半 abort——内核态的访问跑不了事务。所以 TM 适合纯计算、不适合 I/O。

3. **活锁**：两个事务互相把对方踢掉，永远没人能 commit。Herlihy-Moss 没解决这个，工业实现要靠"几次 abort 后退化为加锁"。

4. **侧信道**：Intel TSX 在 2019 因为 **TAA**（TSX Async Abort）漏洞被微码禁用——abort 时能泄漏推测执行的数据。这是 1993 论文没预见的安全代价。

## 适用 vs 不适用场景

**适用**：
- 短小、纯内存的关键区（链表/哈希表/计数器）
- 读多写少、冲突概率低的场景
- 想避免死锁的复杂锁顺序

**不适用**：
- 涉及 I/O 或系统调用的临界区
- 工作集超过 L1 cache 的事务
- 高冲突场景（活锁吃光所有重试）
- 需要严格延迟保证的实时系统（abort 不可预测）

## 历史小故事（可跳过）

- **1991 年**：Herlihy 在 PODC 发表 wait-free synchronization，理论漂亮但实现代价大
- **1993 年**：Herlihy + Moss 在 ISCA 提出硬件 TM，**没人能造出来**——纯学术
- **1995 年**：Shavit-Touitou 软件实现 STM，证明思想可跑
- **2007 年**：Sun Rock 处理器要做 HTM，项目取消
- **2011 年**：IBM Blue Gene/Q 第一个商用 HTM
- **2013 年**：Intel Haswell TSX 进入消费级 CPU——20 年后真的落地
- **2014/2019/2021**：TSX 三次因 bug 或漏洞被禁用/弱化

20 年从论文到芯片，再因为安全问题撤一半回去——事务内存是计算机系统里**理论领先工程极远**的标本案例。

## 学到什么

1. **借用别处成熟的抽象**：数据库的 ACID 概念用了 30 年，搬到 CPU 立刻有威力。这是 Herlihy 跨界思维的胜利。
2. **乐观并发 vs 悲观并发**：锁是悲观（先防御再做事），TM 是乐观（先做错了再回滚）。低冲突时乐观赢，高冲突时悲观赢。
3. **理论 → 算法 → 硬件**：每一步隔 5-10 年。1991 → 1993 → 2011 → 2013。
4. **安全是事后才补的课**：1993 论文不谈侧信道，2019 才被现实教做人。

## 延伸阅读

- 论文 PDF：[Herlihy-Moss 1993](https://www.cs.brown.edu/~mph/HerlihyM93/herlihy93transactional.pdf)（12 页，可读性高）
- 综述：[The Art of Multiprocessor Programming](https://www.elsevier.com/books/the-art-of-multiprocessor-programming/herlihy/978-0-12-415950-1)（Herlihy 自己的书，第 18 章详写 TM）
- 视频：[Maurice Herlihy — Transactional Memory（Stanford EE380）](https://www.youtube.com/watch?v=S2H4tD7jVqY)
- Intel TSX 编程手册：[Intel SDM Vol 1, Ch 16](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html)
- [[shavit-touitou-stm]] —— STM 软件版
- [[linearizability]] —— Herlihy 1990 的可线性化定义，是 TM 正确性基础

## 关联

- [[shavit-touitou-stm]] —— 软件事务内存，1995 实现版
- [[linearizability]] —— TM 提交的语义就是可线性化
- [[lamport-bakery]] —— 经典锁算法，TM 试图替代
- [[michael-scott-queue]] —— 无锁队列，与 TM 同期的另一条路线
- [[x86-tso]] —— Intel TSX 落地依赖的内存模型

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

