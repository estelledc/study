---
title: What is RCU, Fundamentally? — Linux 内核「读端几乎免费」的同步范式
来源: https://lwn.net/Articles/262464/
日期: 2026-06-13
子分类: 内核与虚拟化
分类: 操作系统
provenance: pipeline-v3
---

## 是什么

RCU（Read-Copy Update，读-拷贝-更新）是 2002 年进入 Linux 内核的一种同步机制。Paul McKenney 在 LWN 这篇《What is RCU, Fundamentally?》里把它拆成三个最底层的积木，而不是一堆 API 名词。

日常类比：小区公告栏。

- **读者**（内核里遍历路由表、 dentry 缓存的代码）可以随时抬头看公告，**不用排队领号、不用拿锁**。
- **管理员**（更新者）要改内容时，**不能当场撕掉旧纸**——可能还有人正盯着旧版念。正确流程是：先贴新版（或把旧条目标成「已撤下」），**等确认没有读者还在看旧版**，再把旧纸扔进碎纸机（`kfree`）。

这就是 RCU 的名字来源：**Read**（读者并发读）+ **Copy**（更新者先拷贝一份再改）+ **Update**（用指针替换发布新版本，再回收旧版本）。

和普通锁、读写锁的关键区别：

| 机制 | 读者与更新者 |
|------|----------------|
| 互斥锁 | 同一时刻只能一方工作 |
| 读写锁 | 多个读者 **或** 一个写者，写时读者要等 |
| RCU | **一个更新者** 可以与 **多个读者** 同时进行；读者**不直接**与更新者同步 |

RCU 靠**同时保留多个版本** + **等旧读者全部结束** 来保证一致性，而不是让读者在更新时阻塞。

## 为什么重要

不理解 RCU，下面这些事很难讲清楚：

- 为什么 Linux 路由表、文件系统 dentry、网络协议栈能在**高并发读**下仍保持极低延迟
- 为什么有人说 RCU 读侧在不可抢占内核里是「**零开销**」——`rcu_read_lock()` 可能根本不生成机器码
- 为什么删一个内核链表节点不能立刻 `kfree`，而要 `synchronize_rcu()` 或 `call_rcu()`
- 为什么 RCU 常被称作读写锁的替代品、**批量引用计数**、**穷人版 GC**、**存在性保证**——本质都是同一套三件套

McKenney 后来把 RCU 总结成一句 API 层面的定义：

> RCU 提供：发布-订阅机制、等待既有读者结束的手段、以及维护多版本以不伤害并发读者的纪律。

## 三大核心机制

### 1. 发布-订阅（Publish-Subscribe）——用于插入

更新者先把新对象**完全初始化**，再**发布**指针，让读者看见的是完整数据，不是半初始化垃圾。

问题：编译器和 CPU 可能**重排**赋值顺序。若 `gp = p` 先于 `p->a = 1` 执行，并发读者可能看到未初始化的字段（DEC Alpha 上读侧还有更诡异的乱序）。

解法：

- 更新侧用 `rcu_assign_pointer()` **发布**（带发布语义，相当于封装好的内存屏障）
- 读侧用 `rcu_dereference()` **订阅**（保证先拿到指针再解引用字段）
- 读侧临界区用 `rcu_read_lock()` / `rcu_read_unlock()` 标出边界

在 `CONFIG_PREEMPT=n` 的生产内核里，后两个 lock 调用**可能完全不生成代码**——它们只是告诉 RCU「这段代码算一次读侧临界区」，供 grace period 判断用。

### 2. 等待既有读者结束（Grace Period）——用于删除/替换

RCU 要等的不是「某个线程」，而是所有**在本次变更开始前已经启动**的 RCU 读侧临界区。

基本更新套路（McKenney 文中的伪代码三步）：

1. **改结构**：从链表摘掉、或 `list_replace_rcu()` 换成新节点
2. **等 grace period**：`synchronize_rcu()`（或异步的 `call_rcu()`）
3. **回收**：`kfree()` 旧对象

`synchronize_rcu()` 的直觉（RCU Classic）：读侧临界区**不能睡眠、不能阻塞**。因此只要每个 CPU 都发生过至少一次**上下文切换**，就能断定该 CPU 上所有「旧」读侧临界区已结束——因为还在临界区里的任务没法被切走。

概念上可极简写成：

```c
for_each_online_cpu(cpu)
    run_on(cpu);  /* 切到该 CPU，强迫一次 context switch */
```

真实内核实现要处理中断、NMI、CPU 热插拔等，远比这复杂；PREEMPT_RT 内核还用另一套基于计数器的方案。

重要细节：`synchronize_rcu()` **只等变更前已存在的读者**，变更**之后**新开始的读者不可能再拿到已删除元素的引用，因此无需等待他们。

### 3. 维护多版本（Multiple Versions）——让读者安全并发

删除或替换的瞬间，系统里可能同时存在：

- **版本 A**：仍包含旧元素 `5,6,7` 的链表（迟到的读者还在扫）
- **版本 B**：已摘掉或已替换的新链表（新读者看到）

每个读者在**自己的一次** `rcu_read_lock()`…`rcu_read_unlock()` 区间内，保证看到**某个一致快照**——要么旧版要么新版，不会是「指针已换、字段半更新」的 mashup。

旧版本占用的内存，必须等到 grace period 结束才能释放；这就是 RCU 与 GC 的相似处。

## 与 seqlock、读写锁的对比

**seqlock**：读者可以和写者并发，但若写者中途改过，读者可能被 `read_seqretry()` 要求**重做**——并发期间做的读工作可能作废。

**RCU**：读者在更新进行中仍能做**有用工作**，读到的要么是旧快照要么是新快照，不会被中途打断重试（代价是更新侧延迟回收、可能多占内存）。

**读写锁**：写者会阻塞新读者或等旧读者，读路径有锁开销。

**RCU**：读路径极快，但更新侧要承担 grace period 等待和版本堆积；适合**读多写少**。

## 代码示例 1：指针发布与读侧订阅

下面摘自 McKenney 文中的最小模式（Linux 内核风格）：

```c
struct foo {
    int a, b, c;
};
struct foo *gp = NULL;

/* --- 更新者（通常还需外层锁串行化多个更新者）--- */
void update_example(void)
{
    struct foo *p;

    p = kmalloc(sizeof(*p), GFP_KERNEL);
    p->a = 1;
    p->b = 2;
    p->c = 3;
    rcu_assign_pointer(gp, p);  /* 发布：读者从此可能看到 p */
}

/* --- 读者 --- */
void reader_example(void)
{
    struct foo *p;

    rcu_read_lock();
    p = rcu_dereference(gp);
    if (p != NULL)
        do_something_with(p->a, p->b, p->c);
    rcu_read_unlock();
}
```

若写成 `gp = p` 而不用 `rcu_assign_pointer()`，在弱内存模型机器上可能出现读者看到「指针非空但字段仍是 0」的灾难。

## 代码示例 2：链表替换（RCU 名字的由来）

搜索键 `key`，找到节点后**拷贝-修改-替换**，再等待、释放——这就是 Read-Copy-Update：

```c
struct foo {
    struct list_head list;
    int a, b, c;
};
LIST_HEAD(head);

void replace_by_key(int key)
{
    struct foo *p, *q;

    p = search(head, key);
    if (p == NULL)
        return;

    q = kmalloc(sizeof(*q), GFP_KERNEL);
    *q = *p;           /* Copy */
    q->b = 2;          /* Update */
    q->c = 3;
    list_replace_rcu(&p->list, &q->list);  /* 发布新版本 */
    synchronize_rcu();                     /* 等旧读者 */
    kfree(p);                              /* 回收旧版本 */
}
```

删除更简单，不需要拷贝：

```c
void delete_by_key(int key)
{
    struct foo *p;

    p = search(head, key);
    if (p == NULL)
        return;

    list_del_rcu(&p->list);   /* 读者不再能「合法」发现 p，但已持有引用的仍可读 */
    synchronize_rcu();
    kfree(p);
}
```

链表 API 还有 `list_add_rcu()`、`list_for_each_entry_rcu()` 等，内部已嵌入 `rcu_assign_pointer` / `rcu_dereference` 语义。`list_add_rcu()` 可与读者并发；**多个** `list_add` 之间仍需外层锁互斥。

## 读侧临界区的规则

`rcu_read_lock()` 到 `rcu_read_unlock()` 之间：

- 可以嵌套
- 可以跑几乎任意代码
- **不能**显式阻塞或睡眠（SRCU 变体允许睡眠，那是另一套 API）
- 退出临界区后**不得**再持有 RCU 保护数据的指针

违反最后一条，就会在 `kfree` 之后仍解引用 → use-after-free。

## 常见 API 速查

| 角色 | 典型原语 |
|------|----------|
| 读侧进入/退出 | `rcu_read_lock()` / `rcu_read_unlock()` |
| 读侧取指针 | `rcu_dereference()` |
| 更新侧发布 | `rcu_assign_pointer()`、`list_add_rcu()`、`list_replace_rcu()` |
| 等待 grace period | `synchronize_rcu()`、`synchronize_net()` |
| 异步回收 | `call_rcu(ptr, callback)` |
| 链表遍历 | `list_for_each_entry_rcu()` |

## 适用场景与代价

**适合**：

- 读远多于写（路由表、全局配置、只读遍历）
- 读路径延迟敏感，愿用更新侧延迟和内存换速度

**不适合 / 需警惕**：

- 写非常频繁（grace period 内可能堆很多版本；McKenney 也提醒极高更新率通常不是 RCU 首选）
- 读者需要睡眠（用 SRCU 或其他机制）
- 数据结构难以用「指针发布 + 延迟释放」表达

更新者虽不让读者**自旋或阻塞**，但仍可能通过**缓存失效**让并发读者付出 cache miss 代价（文后 Quick Quiz 6 的答案）——这是性能层面的「间接拖延」，不是逻辑上的锁等待。

## 小结

McKenney 这篇「Fundamentally」文章的核心信息可以压缩为：

1. **发布-订阅**：`rcu_assign_pointer` + `rcu_dereference`，保证读者看到完整初始化的对象。
2. **Grace period**：`synchronize_rcu()` 等待**变更前已启动**的所有读侧临界区结束。
3. **多版本纪律**：删除/替换后旧对象暂留，直到确认无读者再 `kfree`。

RCU 不是魔法，而是把同步成本从**读路径**挪到**更新路径**和**内存管理**上的工程权衡。Linux 调度器、网络、VFS 大量依赖这套范式，才能在多核上保持「读者像没锁一样快」。

## 延伸阅读

- 同系列 Part 2：[What is RCU? Part 2: Usage](https://lwn.net/Articles/263130/) — RCU 与读写锁、引用计数、GC、存在性保证的类比
- 同系列 Part 3：[RCU part 3: the RCU API](https://lwn.net/Articles/264090/) — 完整 API 表与 RCU 家族变体
- 内核文档：[What is RCU?](https://www.kernel.org/doc/html/latest/RCU/whatisRCU.html)

## 参考

- Paul E. McKenney & Jonathan Walpole, [What is RCU, Fundamentally?](https://lwn.net/Articles/262464/), LWN.net, 2007-12-17（LWN RCU 三部曲 Part 1）
