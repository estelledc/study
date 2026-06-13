---
title: Practical Lock-Freedom — Epoch-based Reclamation（按「时代」延迟回收共享内存）
来源: https://www.cl.cam.ac.uk/research/srg/netos/papers/2007-cpwl.pdf
日期: 2026-06-13
子分类: 内核与虚拟化
分类: 操作系统
provenance: pipeline-v3
---

## 是什么

**Epoch-based Reclamation（EBR，按时代回收）** 是一套让用户态 lock-free 数据结构**安全 `free` 已删节点**的机制。它最早由 Keir Fraser 在博士论文 *Practical Lock-Freedom*（2003）里系统化，并作为 Cambridge **MCAS / WSTM / OSTM** 非阻塞 API 的默认回收方案，出现在后来的期刊论文 *Concurrent Programming Without Locks*（Fraser & Harris，**TOCS 2007**；你手上的 PDF 即此文）。

日常类比：**夜市换班的三只回收桶**。

- 摊主（线程）每开始一轮「碰共享货架」的工作，先看门口黑板上的**班次号**（global epoch），记在自己小本子上（local epoch）。
- 某件货从货架上撤下时，**不能当场扔进碎纸机**——可能还有顾客正拿着旧价签比价。摊主把废货扔进**当前班次对应的回收桶**（limbo list）。
- 等黑板确认「**所有正在干活的摊主都看过最新班次**」，**上上班次**那只桶里的货才能统一销毁——因为再早一班次的顾客，最晚也在「上一班次」结束前离开了货架区。

技术上，EBR 解决的是 lock-free 里的经典难题：**读者拿着裸指针遍历时，写者不能把节点立刻 `free`**。EBR 把「等所有读者离开」这件事，编码成**全局 epoch 计数 + 每线程本地 epoch + 三个 limbo 桶**，读者路径几乎不用登记「我正在看哪本书」（对比 Hazard Pointer 的前台卡片）。

## 为什么重要

不理解 EBR，下面这些事很难讲清楚：

- 为什么 **crossbeam-epoch**、**Folly `folly::Synchronized`** 周边、不少 C++ lock-free 容器默认走 epoch 而不是 hazard pointer
- 为什么 Fraser/Harris 能在 2007 年做出**与精细锁设计性能相当甚至更好**的 skip-list、红黑树——回收开销若用 SMR/HP 每条边都 `memory barrier`，BST 实测会慢 **20%+**（Fraser 论文原话）
- 为什么 EBR 常被称作 **QSBR（Quiescent-State Based Reclamation）的自动化版**：程序员不用手写「静默点」，库在临界区入口帮你记账
- 为什么用户态 EBR **不是严格 lock-free**：一个线程在临界区里被挂起，可能**永远拖住回收**——这和 Linux RCU 在内核里「靠调度切换推进 grace period」形成对照

JPDC 2007 的横评（Hart 等）结论也很直白：**没有全局最优的回收方案**；EBR 在读多、读者开销敏感、能接受偶发内存延迟时往往占优。

## 核心概念

### 1. Limbo list（炼狱单）——先登记，后销毁

对象从共享堆上逻辑删除后，进入当前 epoch 的 **limbo list**，而不是立刻 `free`。思想来自 Kung & Lehman 的并行 GC、Pugh skip-list 等早期工作；Fraser 的改进是：**用 epoch 判断何时 limbo 里再也没有合法引用**，并只维护 **三个** 桶循环复用，改善 cache locality。

删除节点的责任规则（skip-list 特例）：

- 正常：谁 CAS 成功摘掉节点，谁把它扔进 limbo。
- 插入与删除并发：节点可能「还在往高层插」就被逻辑删了。此时用 per-node **deferral flag**：插入与删除都尝试置位，**后完成的一方**负责入 limbo——因为只有两个操作可能创建/销毁共享引用。

### 2. Global epoch 与 local epoch

- **Global epoch** `e`：全系统当前「时代」编号（通常 `mod 3` 循环）。
- **Local epoch**：每个线程在进入**访问共享对象的操作**时，把本地 epoch 更新为当前的 `e`。
- **关键不变量**：对象进入 limbo 时，共享堆里已没有指向它的引用；仍可能存在的引用只能是 **(i) 私有的**，且 **(ii) 属于在对象入 limbo 之前就已开始当前操作的线程**。

因此：当**所有正在临界区里的线程**的 local epoch 都 ≥ 当前 global epoch 时，**两个 epoch 之前**填满的那只 limbo 桶可以安全清空。

### 3. 为什么需要三个桶，而不是两个？

直觉上「大家都看到 epoch `e` 了，上一桶就能回收」——**不够**。线程进入新 epoch 的时刻**不同步**：在任意时刻，往往有线程正从 `e-1` 迁到 `e`，它们手里还可能握着 `e-1` 时代 limbo 对象的私有指针。所以要再等一轮，才安全复用 `e-1` 的桶。Fraser 用 **三个 limbo list** 轮转；Hart 等的图示把这三段称为 **fuzzy barrier**。

### 4. 推进 epoch 的「模糊屏障」

线程每次进入临界区时，以一定概率扫描「当前正在临界区内的线程列表」：

- 若每个这样的线程的 local epoch **都等于** global epoch，则把**最老**的 limbo list 并入 free list，并 `global_epoch++`。
- **不参与扫描的线程**：当前不在临界区、处于 quiescent 的线程——避免「睡觉的线程」阻塞回收（QSBR 里程序员要保证静默；EBR 在实现里排除它们）。

回收工作**分散到所有 mutator**，不需要专职 GC 线程。

### 5. 与论文其它部分的边界

2007 年 PDF 的主体是 **MCAS / WSTM / OSTM** 三套非阻塞 API；EBR 在实现章（Fraser 博士论文 §5.2.3）负责**应用层节点**回收。与之对照：

| 对象类型 | 回收方式 |
|----------|----------|
| MCAS/FSTM **操作描述符**（大块、短命） | 引用计数，用完即复用 |
| 跳表/红黑树 **节点**、STM 对象块 | **EBR** |
| 需要严格 lock-free 进度、不能容忍卡住 | 改用 Michael SMR / Hazard Pointer（读者每条边要 announce） |

## 代码示例

### 示例 1：读者 / 写者共用的 EBR 临界区骨架（C 风格伪代码）

下面是把 Fraser 描述翻译成最常见的 **enter → 用结构 → retire → leave** 四件套。真实库（如 crossbeam-epoch）会再加 pin 计数、缓存行对齐等细节。

```c
/* 每线程状态 */
typedef struct {
    uint64_t local_epoch;   /* 本线程已观察到的时代 */
    bool     in_critical;   /* 是否在访问共享 lock-free 结构 */
} tls_ebr_t;

static _Atomic uint64_t global_epoch;
static limbo_list_t   limbo[3];   /* 三个回收桶，下标 epoch % 3 */

void ebr_enter(tls_ebr_t *tls) {
    tls->in_critical = true;
    tls->local_epoch = atomic_load_explicit(&global_epoch, memory_order_acquire);
    /* 以一定概率尝试推进时代并清空最老 limbo */
    ebr_try_advance();
}

void ebr_leave(tls_ebr_t *tls) {
    tls->in_critical = false;
}

void ebr_retire(void *ptr) {
    uint64_t e = atomic_load_explicit(&global_epoch, memory_order_relaxed);
    limbo[e % 3].push(ptr);   /* 扔进当前时代的桶 */
}

/* 读侧：遍历 lock-free 链表 */
node_t *ebr_search(node_t *head, key_t key) {
    ebr_enter(&my_tls);
    node_t *cur = head;
    while (cur && cur->key < key)
        cur = atomic_load_explicit(&cur->next, memory_order_acquire);
    ebr_leave(&my_tls);
    return cur;
}

/* 写侧：逻辑删除后 retire */
bool ebr_delete(node_t **head, key_t key) {
    ebr_enter(&my_tls);
    /* ... CAS 从链表摘掉 node ... */
    if (removed)
        ebr_retire(node);
    ebr_leave(&my_tls);
    return removed;
}
```

读者路径只有 `enter/leave` 里对 epoch 的一次观察；**没有** Hazard Pointer 那种「每跳一步写一张卡片」的开销。

### 示例 2：Rust `crossbeam-epoch` 中的 Guard 模式

工业界最常被引用的 EBR 实现是 **crossbeam-epoch**（API 受 Fraser 方案启发）。`Guard` 表示「我处在某个 epoch 的保护下，别人不能 free 我正要访问的对象」：

```rust
use crossbeam_epoch::{self as epoch, Atomic, Owned, Shared};

struct Node {
    value: i32,
    next: Atomic<Node>,
}

fn push(stack: &Atomic<Node>, value: i32) {
    let mut guard = epoch::pin();           // 等价于 ebr_enter
    loop {
        let head = stack.load(Ordering::Acquire, guard);
        let mut node = Owned::new(Node { value, next: Atomic::null() });
        node.next.store(head, Ordering::Release);
        if stack
            .compare_exchange(head, node, Ordering::Release, Ordering::Relaxed, guard)
            .is_ok()
        {
            break;
        }
    }
}

fn pop(stack: &Atomic<Node>) -> Option<i32> {
    let guard = epoch::pin();
    loop {
        let head = stack.load(Ordering::Acquire, guard);
        if head.is_null() {
            return None;
        }
        let next = unsafe { head.deref() }.next.load(Ordering::Acquire, guard);
        if stack
            .compare_exchange(head, next, Ordering::Release, Ordering::Relaxed, guard)
            .is_ok()
        {
            unsafe { guard.defer_destroy(head) };  // 等价于 ebr_retire
            return Some(unsafe { head.deref() }.value);
        }
    }
}
```

`pin()` 可能触发全局 epoch 推进；`defer_destroy` 把节点排进当前 limbo，待 grace period 结束后由后台批量释放。

### 示例 3：`ebr_try_advance` 里「全员对齐」的简化逻辑

```c
void ebr_try_advance(void) {
    if (random() % ADVANCE_PERIOD != 0)
        return;

    uint64_t g = atomic_load_explicit(&global_epoch, memory_order_relaxed);
    for (each thread t where t.in_critical) {
        if (t.local_epoch != g)
            return;   /* 还有人滞留在旧时代，不能推进 */
    }
    /* 所有活跃读者都已看到 g → 回收 (g-2) mod 3 的 limbo */
    limbo[(g + 1) % 3].flush_to_allocator();
    atomic_store_explicit(&global_epoch, g + 1, memory_order_release);
}
```

真实实现要处理线程注册/注销、ABA、内存序；但**语义核心**就是这段：「**活跃临界区**里的线程 local epoch 全追上 global，才清空最老桶」。

## 与其它回收方案对比

| 维度 | EBR（Fraser） | Hazard Pointer（Michael 2004） | QSBR | Linux RCU |
|------|---------------|-------------------------------|------|-----------|
| 读者开销 | 极低（进/出临界区记 epoch） | 每指针一次 publish + 验证 | 需手写 quiescent 点 | 读侧常为零指令 |
| 写者/回收 | 分散扫描 + limbo | 扫全局 hazard 表 | 等所有线程静默 | `call_rcu` 等 grace period |
| 内存上界 | **无严格上界**（慢线程卡住） | 有界（retired 队列长度可控） | 无界 | 内核可踢线程 |
| 严格 lock-free | **否**（卡住可饿死回收） | 是 | 否 | N/A |
| 典型场景 | 用户态读多写少容器 | 内存敏感、要进度保证 | 手工标注的简单路径 | 内核子系统 |

Fraser 的权衡很明确：EBR 换掉了 SMR/HP 在**每条边上**的 `memory barrier`，换来**弱一些的进度保证**和**可能的内存滞留**。

## 踩过的坑

1. **临界区范围划错**：`ebr_enter/leave` 必须包住**所有**可能解引用共享指针的代码；少包一行就是 use-after-free。

2. **把 EBR 当成严格 lock-free**：论文坦诚——临界区内被抢占的线程会阻止 epoch 前进，limbo 涨满后**全员** eventually 停住。实时或硬进度需求应换 HP。

3. **只准备两个 limbo 桶**：会过早复用仍在读者私有引用里的对象；**三个**是数学上紧的常数，不是随便拍的。

4. **与引用计数混用节点**：EBR 管「已从共享结构摘掉」的节点；描述符等短命大块 Fraser 用引用计数——别对同一对象两套方案打架。

5. **忘记 memory order**：`global_epoch` 的 publish 与读 `next` 指针的 acquire 必须配对；x86 上「能跑」不代表 ARM 安全。

6. **线程爆炸时扫描成本**：`ebr_try_advance` 要扫活跃线程表；线程数上百时，推进 epoch 的摊销成本上升——JPDC 2007 横评里 EBR 在**高线程数**下不如 HP 的场景即源于此。

## 在 Fraser & Harris 2007 论文中的位置

该 PDF 的重点是证明：**用当今 CPU 都有的 CAS 等原语**，可以搭出实用的非阻塞 skip-list、红黑树，并与高性能锁实现同台竞技。EBR 是「让动态节点真正可分配/释放」的那块拼图：

- **§1.1** 提到 Michael SMR、Herlihy pass-the-buck 等「延迟释放直到确认无读者」的家族；
- 实现章说明对**应用数据**默认 EBR，对**操作描述符**用引用计数；
- 开源实现曾覆盖 Alpha、IA-32、IA-64、MIPS、PowerPC、SPARC（`http://www.cl.cam.ac.uk/netos/lock-free`）。

读 PDF 时可以把 **API 设计**（MCAS/WSTM/OSTM）与 **EBR** 分开学：前者教「怎么无锁改多字」；后者教「改完的烂摊子怎么安全 `free`」。

## 适用 vs 不适用

**适用**：

- 读多写少的 lock-free 哈希、跳表、队列（用户态）
- 愿用少量内存换读者极致轻量（相对 HP）
- 已有 `crossbeam`、`folly` 等成熟 EBR 库，不想自研 HP 槽位管理

**不适用**：

- 必须证明**严格 lock-free / wait-free** 进度
- 线程数极大且频繁推进 epoch，扫描成为热点
- 不能容忍「一个死循环线程拖住全部回收」——用 HP 或带超时的 QSBR
- 有 GC 的运行时——直接用 GC，不必 EBR

## 历史脉络（简表）

| 年份 | 里程碑 |
|------|--------|
| 1980 | Kung & Lehman — limbo list 思想 |
| 2002 | Michael — SMR / Hazard Pointer 雏形 |
| 2003 | Fraser 博士论文 — **EBR 系统化**，三桶 + epoch 扫描 |
| 2007 | Fraser & Harris TOCS — 非阻塞 API + EBR 工程验证 |
| 2007 | Hart JPDC — QSBR / EBR / HP **公平横评** |
| 2010s+ | crossbeam-epoch、各语言 lock-free 库广泛采用 |

## 学到什么

1. **延迟释放是 lock-free 的必修课**：无锁只解决「互斥」；**何时 `free`** 是第二战场。EBR 用「时间分片（epoch）」代替「空间登记（hazard slot）」。

2. **三个桶不是实现细节，是不变量的一部分**：理解「两桶不够」的并发窗口，才算真懂 EBR。

3. **进度保证与性能永远交易**：Fraser 宁可选「非严格 lock-free 的 EBR」也要砍掉 20% 的 SMR barrier 税——说明**读路径热点**往往比形式化进度更重要。

4. **和 RCU 同族不同命**：都是 grace period；RCU 绑内核调度，EBR 绑用户态线程表与 probabilistic advance。

## 延伸阅读

- 期刊论文（本文来源）：[Concurrent Programming Without Locks (PDF)](https://www.cl.cam.ac.uk/research/srg/netos/papers/2007-cpwl.pdf) — Fraser & Harris, TOCS 2007
- 博士论文全文：[Practical lock-freedom (UCAM-CL-TR-579)](https://www.cl.cam.ac.uk/techreports/UCAM-CL-TR-579.pdf) — EBR 细节在 §5.2.3
- 横评：[Performance of memory reclamation for lockless synchronization (JPDC 2007)](https://csng.cs.toronto.edu/publication_files/0000/0159/jpdc07.pdf)
- 实现参考：[crossbeam-epoch 文档](https://docs.rs/crossbeam-epoch/latest/crossbeam_epoch/)

## 关联

- [[hazard-pointers-2004]] — EBR 的主要替代方案；读者有界、严格 lock-free
- [[rcu-mckenney-2017]] — 内核侧 grace period；读侧更轻、与调度器耦合
- [[michael-scott-queue]] — 经典 lock-free 队列；回收方案常配 EBR 或 HP
- [[jemalloc-evans-2006]] — 另一篇「多线程下别抢同一把锁」的 Cam 系性能工程

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
