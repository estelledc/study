---
title: "Hoare Monitors 1974 — 把锁藏进对象里，让并发代码读起来像普通函数"
来源: 'C.A.R. Hoare, "Monitors: An Operating System Structuring Concept", CACM 17(10):549-557, 1974'
日期: 2026-06-01
子分类: 内核与虚拟化
分类: 操作系统
难度: 中级
provenance: pipeline-v3
---

## 是什么

Monitor（管程）是 Hoare 在 1974 年发明的一种**并发编程结构**。一个 monitor 把"共享数据"和"操作这些数据的过程"绑成一个对象，然后**自动**保证：同一时刻最多只有一个线程在这个对象里跑。

日常类比：一间共享厨房有 5 个人想用。Dijkstra 1965 的方案是给厨房门装锁，每个人**自己记得**进门前 lock、出门前 unlock，忘一次就出事。Hoare 说：换一种思路——把厨房改造成**一台投币咖啡机**，外面排队，里面只能容一个人，机器自己控制门。你不用管锁，只管按按钮。

写成代码就是：

```pascal
monitor BoundedBuffer:
    buf: array[0..N-1] of Item
    count: 0..N

    procedure put(x: Item):
        while count = N: wait(notFull)
        buf[count] := x; count := count + 1
        signal(notEmpty)

    procedure get(): Item
        while count = 0: wait(notEmpty)
        ...
```

线程调 `buf.put(x)` 时**不需要**写 `lock(...)` `unlock(...)`，monitor 自己管。这就是 Java `synchronized`、C# `lock`、Pthread 的 mutex+cond 的祖宗。

## 为什么重要

不理解 monitor，下面这些事都没法解释：

- 为什么 Java 每个对象都自带一把锁、一个 `wait()` 一个 `notify()`——这是 1974 年 Hoare 的设计直接搬过来
- 为什么 `wait` 醒来后**必须**用 `while` 重检条件，写 `if` 是经典 bug——这是 Mesa 语义的代价
- 为什么 Go 选了 channel 不选 monitor，但 channel 解决的是同一类问题
- 为什么 Concurrent Pascal、Modula-2、Ada 这些 1970-80 年代的语言把 monitor 当一等公民

## 核心要点

monitor 由 **三件东西**组成：

1. **共享数据 + 一组过程**：数据是私有的，外界只能通过过程访问。这一步像 OOP 的封装。

2. **隐式互斥锁**：同一时刻最多一个线程能在 monitor 里执行任意一个过程。线程进过程时自动获锁，出过程时自动放锁。**程序员不写锁**。

3. **条件变量**（condition variable）：用来**等事件**。两个原语：
   - `wait(c)`：当前线程释放锁，挂在条件 c 上睡觉
   - `signal(c)`：唤醒一个挂在 c 上的线程

注意：condition variable **不存值**，只是一个等待队列。它和"信号量"不同——信号量记得"被 V 过几次"，condition 不记。所以唤醒后必须重检条件。

## 实践案例

### 案例 1：生产者-消费者（bounded buffer）

```java
class BoundedBuffer {
    private Object[] buf = new Object[N];
    private int count = 0;

    public synchronized void put(Object x) throws InterruptedException {
        while (count == N) wait();      // 满了就睡
        buf[count++] = x;
        notifyAll();                    // 叫醒可能在等"非空"的人
    }

    public synchronized Object get() throws InterruptedException {
        while (count == 0) wait();      // 空了就睡
        Object x = buf[--count];
        notifyAll();
        return x;
    }
}
```

这就是 Hoare 论文里的第一个例子，原版用 Pascal 写。Java 把 `synchronized` 当 monitor 实现，每个对象自带一把锁和**一个**条件变量（所以这里只能 `notifyAll`，没法分别叫醒"等满"和"等空"的人）。Java 5 后的 `ReentrantLock` + 多个 `Condition` 才补回 Hoare 原版的能力。

### 案例 2：为什么 wait 必须配 while

新人常写：

```java
if (count == 0) wait();   // 错！
```

为什么错？看时间线：

1. 线程 A 看到 count=0，wait 睡了
2. 线程 B 放进一个，count=1，notify
3. 线程 A 被唤醒，**还没拿回锁**
4. 线程 C 抢先拿锁，把 count 取走，count=0
5. 线程 A 拿到锁，继续执行——但 count 已经是 0，崩

所以 Java/C#/Pthread 的 wait 都用 **while**：醒来再确认一次条件。这背后是 **Mesa 语义**：signal 不立即切换，唤醒者只是被放回就绪队列。

### 案例 3：Hoare 语义 vs Mesa 语义

| 维度 | Hoare 语义（1974） | Mesa 语义（1980） |
|---|---|---|
| signal 后谁先跑 | 立即切到唤醒者，发信号者暂停 | 发信号者继续，唤醒者排队等锁 |
| 条件检查 | 用 if 也对（醒来时条件一定成立） | 必须 while（醒来要重检） |
| 实现成本 | 高，要做上下文切换 | 低，普通入队 |
| 工业语言选谁 | 几乎没人 | Java/C#/Pthread 全选这个 |

Mesa 之所以赢，是因为**性能**和**实现简单**——代价是程序员要会写 while。

## 踩过的坑

1. **嵌套 monitor 死锁**：A.foo() 里持有 A 的锁，又调 B.bar() 想拿 B 的锁；同时 B.bar() 想拿 A 的锁。环出现，死锁。Java 的 `synchronized` 没救，只能靠程序员注意调用顺序。

2. **wait 用 if 不用 while**：见案例 2。Mesa 语义下唤醒和拿锁中间可能被插队。

3. **signal 丢失**：如果 signal 时没人在 wait，信号就消失了——condition variable 不存。所以 wait 前必须先在锁内**检查条件**，不要"先 wait 再确认"。

4. **notifyAll vs notify**：如果不确定该叫醒谁，`notifyAll` 全叫醒；用 `notify` 可能叫错人导致死锁。Java 默认推荐 `notifyAll`。

5. **synchronized 是可重入锁**：同一线程可以多次进同一对象的 synchronized 块。这是 Java 的设计选择，原版 Hoare monitor 没这条；不可重入锁会让递归调用立刻死锁。

## 适用 vs 不适用场景

**适用**：

- 共享数据结构需要互斥访问（队列、缓冲区、缓存）
- 等待某个状态变化（"队列非空"、"任务完成"）
- 数据规模不大、并发线程不多——锁竞争还能容忍

**不适用**：

- 高并发读多写少 → 用读写锁（RWLock）或无锁结构
- 大规模消息传递、跨进程通信 → 用 channel（CSP / Go）或队列
- 需要精确控制公平性 → monitor 默认无序，要自己实现优先级

## 历史小故事（可跳过）

- **1965 年**：Dijkstra 发明信号量（semaphore）和 P/V 操作。能用，但**太底层**——程序员写 P/V 像写汇编，容易忘配对、容易死锁。
- **1971 年**：Brinch Hansen 在 RC 4000 操作系统里把信号量包成 "shared class"。雏形。
- **1974 年**：Hoare 在 CACM 发表 9 页论文（17(10):549-557），正式定义 monitor，给出 5 个例子（bounded buffer、disk head scheduler、reader-writer、alarm clock、磁盘队列）。
- **1975 年**：Brinch Hansen 在 Concurrent Pascal 里实现 monitor。第一个工业语言。
- **1980 年**：Lampson & Redell 在 Xerox PARC 的 Mesa 语言里改成 Mesa 语义。这套被 Java 1995 年继承。
- **1995 年**：Java `synchronized` + `wait/notify` 把 monitor 推向千万开发者。

## 学到什么

1. **抽象层次**：semaphore（信号量）→ monitor（管程）→ channel（CSP），每一层都把"程序员要操心的事"减一些
2. **隐式 vs 显式**：monitor 把锁藏起来，代价是控制力下降；显式锁灵活但易错。两条路都活到现在
3. **语义选择有工程后果**：Hoare 语义优雅但慢，Mesa 语义粗糙但快——工业最终选了快的，并把"while 重检"写进每本教科书
4. **OOP 和并发同源**：monitor 把"数据 + 操作"绑一起，正是 OOP 的封装思想；Simula 67 的 class 和 Hoare monitor 是孪生兄弟

## 延伸阅读

- 论文 9 页 PDF：[Hoare 1974 Monitors](https://www.cs.cmu.edu/~crary/819-f09/Hoare74.pdf)（CACM 原文，配图清晰）
- Mesa 语义对照：[Lampson & Redell 1980, "Experience with Processes and Monitors in Mesa"](https://dl.acm.org/doi/10.1145/358818.358824)
- Java 实现：Brian Goetz, *Java Concurrency in Practice*（第 14 章把 wait/notify 讲透）
- [[dijkstra-1965]] —— monitor 的前身，第一个软件互斥方案
- [[csp-hoare-1978]] —— Hoare 1978 年的另一条路：用 channel 代替共享内存

## 关联

- [[dijkstra-1965]] —— monitor 抽象掉的就是 Dijkstra 信号量
- [[csp-hoare-1978]] —— 同一作者，4 年后给出"消息传递"的对照方案
- [[hoare-logic]] —— Hoare 1969 年的另一项工作，用断言证明顺序程序正确性
- [[simula-67]] —— monitor 的"封装"思想直接来自 Simula 的 class
