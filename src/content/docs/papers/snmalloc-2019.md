---
title: snmalloc（ISMM 2019）— 用「消息传递」解决谁分配、谁释放不在同一线程
来源: https://github.com/microsoft/snmalloc/blob/main/snmalloc.pdf
日期: 2026-06-13
子分类: 内核与虚拟化
分类: 操作系统
provenance: pipeline-v3
---

## 是什么

**snmalloc**（Scalable Nearly lock-free malloc）是微软研究院与帝国理工合作、在 **ISMM 2019** 上发表的通用内存分配器（Liétar 等，DOI [10.1145/3315573.3329980](https://doi.org/10.1145/3315573.3329980)）。它针对一类极常见、却让传统分配器很难受的工作负载：**对象在 A 线程 `malloc`，却在 B 线程 `free`**——论文称之为 **producer/consumer（生产者/消费者）** 模式。

日常类比：快递站按**收件人小区**分仓。理想情况是「谁买的谁退」——你从自家门口下单，包裹也从同一栋楼退回，仓库账本只在你家抽屉里改一笔，**不用跟全小区抢一把锁**。

但现实里经常是：

- **流水线工人**（消费者线程）干完活就把包装箱扔掉，而箱子是**上游工人**（生产者线程）领的；
- **垃圾回收线程**集中 `free`，而**业务线程**集中 `malloc`（不少 GC 实现就是这样）。

传统 **thread cache** 分配器（jemalloc、tcmalloc 等）的做法是：每个线程手边攒一堆「刚退回来的空盒子」，下次同尺寸再发。若分配和释放**大致对称**，这招极快。可一旦某线程只扔不收、另一线程只收不扔，就会出现：

- 分配线程的本地 cache **永远见底**，不停向中央堆要货；
- 释放线程的 cache **越堆越满**，不得不把货送回中央堆——**同步、锁、原子 CAS 风暴**。

snmalloc 换了一条路：**别在线程之间搬空盒子，改成发「退件消息」**。消费者线程不试图自己消化这批空闲块，而是把待释放对象**打包成链表**，异步**投递回当初分配它的那个 allocator**；真正的回收、合并、再分配都在**原主线程**本地完成。跨线程路径**不加锁**，靠 **lock-free MPSC 队列 + 批量发送 + Temporal Radix Tree 路由** 把成千上万次远程 `free` 压成少量原子操作。

论文还提出 **bump pointer–free list** 混合结构：每个 **64 KiB slab** 只需 **64 bit** 元数据，就能同时支持 bump 分配和自由链表回收——元数据开销约为传统位图方案的 **1/8**。

开源实现：<https://github.com/microsoft/snmalloc>（C++ header-only，可 `LD_PRELOAD`，也有 Rust crate）。注意：**2019 论文之后的实现演进很大**（元数据布局、安全加固等），但「消息传递回收远程对象」这条主线保留至今。

## 为什么重要

不理解这篇论文，下面几件事很难讲清楚：

- 为什么 **消息队列、流水线、actor 模型** 里 `free` 性能突然崩掉——瓶颈往往在分配器，而不是你的业务逻辑
- 为什么 jemalloc / tcmalloc 的 **thread cache** 在「对称多线程 malloc/free」里无敌，却在 **producer/consumer** 里输给 snmalloc
- 为什么现代系统开始谈 **message passing allocator** 而不只是「再多几个 arena」——这是设计空间里的不同点
- 为什么 snmalloc 与 **Pony 语言运行时** 有血缘——远程释放队列直接改编自 Pony 的 MPSC 消息队列
- 为什么 **FaRM、SPEC 2017** 等真实负载里 snmalloc 能与工业界 allocators 同台竞技

论文摘要的结论很直白：在 producer/consumer benchmark 上，**吞吐优于当时主流分配器**（Hoard、jemalloc、tcmalloc、rpmalloc、SuperMalloc 等），且元数据极省。

## 核心概念

### 1. Producer / Consumer 工作负载

| 模式 | 谁分配 | 谁释放 | thread cache 表现 |
|------|--------|--------|-------------------|
| 对称 | 各线程自己 | 各线程自己 | 极好，几乎无跨线程同步 |
| **Producer/consumer** | 线程 A | 线程 B | 差：cache 错位，频繁 flush |
| GC 风格 | mutator | GC 线程 | 同上，且释放常成批爆发 |

典型场景：无锁队列消费者 `free` 节点、并行 pipeline 最后阶段销毁、跨线程传递的 `std::shared_ptr` 析构。

### 2. 每线程一个 Allocator

snmalloc 为**每个调度线程**绑定一个 **Allocator**（不是 OS 线程硬绑定，但设计上是一对一）。**小对象（< 64 KiB）和中对象（64 KiB–16 MiB）** 的「所有权」属于分配它的那个 allocator；**远程 `free`** 不直接改对方元数据，而是**发消息**。

**大对象（≥ 16 MiB）** 走全局 per-size 的 lock-free 栈，不参与消息传递——大块本来稀少，集中管理更简单。

### 3. 消息传递 vs Thread Caching

| 维度 | Thread caching | snmalloc 消息传递 |
|------|----------------|-------------------|
| 跨线程 free | 塞进本线程 cache，满了再同步送回中央 | 打包链表，**异步投递给原 allocator** |
| 同步点 | cache 满/空时与中央结构争用 | 入队：**一次 fence + 一次 atomic exchange**（批量） |
| 本地 free | 快 | 同样快：本线程拥有的对象**直接改 slab 元数据** |
| 适用 | 对称负载 | **不对称、流水线、GC** |

关键洞察：**通信只发生在 deallocation**，且是**异步**的——消费者不必等生产者处理完消息就能继续干活；生产者在自己下次 `malloc`/`free` 时顺带** drain 入站队列**。

### 4. 批量发送（Batching）

若每个远程对象单独入队，仍是「一次 free 一次原子操作」。snmalloc 在发送方线程内先把待释放对象按目标 allocator **串成链表**，当待发对象总大小达到阈值（论文默认 **1 MiB**）时，**每个目标一次** `enqueue_list`——无论链上有多少对象。

被释放对象体内存用来存 **next 指针 + 目标 allocator 标识**，最小对象 **16 B**（两个指针），**不为消息单独 malloc**。

### 5. Temporal Radix Tree（时间 radix 路由）

若每个目标 allocator 维护一条出站链表，要么**上限线程数**写死，要么**动态分配**出站表（又要同步）。

snmalloc 用固定 **2^k 个 bucket**（默认 **k = 6 → 64 个 bucket**），按**目标 allocator 地址的低 k 位**分桶——不是精确按目标分，而是**按地址前缀近似路由**。

flush 时：

1. 把每个 bucket 链表头指向的「代表 allocator」的**入站队列**里推一整条链（**home bucket** 除外）；
2. **home bucket**（地址低位与**自己**相同的桶）里的消息，用**下一段 k 位**重新分桶；
3. 交替执行，最多 **⌈N/k⌉** 轮（48 位地址空间、2 KiB 对齐的 allocator → **N = 37**，k = 6 → **最多 7 跳**）。

接收方处理入站消息时：目标是自己的就**当场 free**；否则**转发**到自己的出站 bucket——像网络里的**逐跳转发**。实践中线程数 < 64 时，**多数消息一跳直达**。

### 6. 远程释放队列（Pony MPSC）

每个 allocator 暴露一条 **multi-producer, single-consumer** 队列：

- **入队**（多线程）：`last.next = nullptr` → release fence → `prev = back.exchange(last)` → `prev.next = first`——**单次 atomic exchange**，无 CAS 循环；
- **出队**（仅 owner 线程）：读 `front.next`，非空则前移 `front`——**出队路径无原子操作**；
- **不保证线性化**（论文明确引用 Herlihy 的 linearizability）：并发入队时，先完成的入队可能后可见——对**延迟回收**可接受，换更高吞吐。

### 7. Bump pointer + free list（64 bit / 64 KiB slab）

传统位图：16 B 最小粒度 → 64 KiB 要 **512 B** 元数据。snmalloc 的 free list **不以 null 结尾**，而以该 slab 的 **bump 高水位指针** 结尾：

- 分配：沿 bump 向前（快）；
- 释放：挂回 free list（标准链表）；
- 空闲发现：沿 list 走，直到碰到 bump 边界。

每个 **64 KiB superslab** 仅 **64 bit** 元数据；free list 节点存在**对象自身的空闲内存**里（in-band），初始化只需把 head 设为 bump 起点。

### 8. 地址空间分层：Chunk → Superslab / Medium slab

| 层级 | 典型大小 | 用途 |
|------|----------|------|
| Chunk | 16 MiB（可配） | 与 OS 打交道的大块；large object 可占满 chunk |
| Superslab | 64 KiB | 小对象容器 |
| Medium slab | ≤ 16 MiB | 中对象 |
| Page map | 全局 | 任意内部指针 → 对象大小、owner allocator |

给定指针，**O(1)** 查 pagemap 决定走本地 free 还是远程消息。

### 9. 与 jemalloc / mimalloc 对照

| 维度 | jemalloc | mimalloc | snmalloc |
|------|----------|----------|----------|
| 跨线程 free | 还到 arena / tcache，可能同步 | page 的 thread-free 链 + CAS | **消息批送回 owner** |
| 核心隐喻 | 多抽屉柜（arena） | 每货架三条链（sharding） | **快递退件系统（message passing）** |
| 强项 | 对称多线程 | 小对象 + 引用计数协作 | **producer/consumer、批量远程释放** |
| 远程路径锁 | 有（central 结构） | 无锁 CAS 到目标 page | **无锁 MPSC + 批量** |

三篇笔记（jemalloc 2006、mimalloc 2019、snmalloc 2019）正好覆盖工业界 allocator 进化的三个支点：**分片降锁 → 页内分链 → 所有权消息传递**。

## 代码示例

### 示例 1：Producer/Consumer——为什么 thread cache 会痛

下面是最简化的 **单生产者、单消费者** 队列：主线程分配节点，工作线程处理完后释放。这正是 snmalloc 论文里的经典反例场景。

```c
/* build: cc -O2 -pthread prodcons.c -o prodcons */
#include <pthread.h>
#include <stdlib.h>
#include <stdio.h>

#define QUEUE_CAP 4096

typedef struct Node {
    int value;
    struct Node *next;
} Node;

static Node *queue[QUEUE_CAP];
static int head, tail;
static pthread_mutex_t q_mu = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t q_cv = PTHREAD_COND_INITIALIZER;

static void enqueue(Node *n) {
    pthread_mutex_lock(&q_mu);
    while ((tail + 1) % QUEUE_CAP == head)
        pthread_cond_wait(&q_cv, &q_mu);
    queue[tail] = n;
    tail = (tail + 1) % QUEUE_CAP;
    pthread_cond_signal(&q_cv);
    pthread_mutex_unlock(&q_mu);
}

static Node *dequeue(void) {
    pthread_mutex_lock(&q_mu);
    while (head == tail)
        pthread_cond_wait(&q_cv, &q_mu);
    Node *n = queue[head];
    head = (head + 1) % QUEUE_CAP;
    pthread_cond_signal(&q_cv);
    pthread_mutex_unlock(&q_mu);
    return n;
}

static void *consumer(void *arg) {
    (void)arg;
    for (;;) {
        Node *n = dequeue();
        if (!n) break;
        /* 消费者在 B 线程 free —— 对象却是 A 线程 malloc 的 */
        free(n);
    }
    return NULL;
}

int main(void) {
    pthread_t tid;
    pthread_create(&tid, NULL, consumer, NULL);

    for (int i = 0; i < 5_000_000; i++) {
        Node *n = malloc(sizeof(Node));  /* 主线程 = producer */
        n->value = i;
        enqueue(n);
    }
    enqueue(NULL);  /* poison pill */
    pthread_join(tid, NULL);
    puts("done");
    return 0;
}
```

**用分配器视角读这段代码**：

1. **主线程**：海量 `malloc(sizeof(Node))`——16 B 请求在 snmalloc 里正好是最小档（两个指针宽）；
2. **消费者线程**：等量 `free`——对象 **owner 是主线程的 allocator**；
3. jemalloc/tcmalloc：消费者 thread cache 塞满 16 B 空闲块，不得不 **flush 回 central/arena** → 锁与 cache line 乒乓；
4. snmalloc：消费者把节点链成 batch，**消息发回主线程 allocator**；主线程下次 `malloc` 时处理入站队列，**在本地 superslab 上回收**。消费者路径：**无锁 push**。

对比 benchmark（需自行安装各 allocator）：

```bash
# 基线
./prodcons

# snmalloc（Linux 示例路径因发行版而异）
LD_PRELOAD=/path/to/libsnmalloc.so ./prodcons

# 对比 jemalloc / mimalloc
LD_PRELOAD=/usr/lib/libjemalloc.so.2 ./prodcons
LD_PRELOAD=/path/to/libmimalloc.so ./prodcons
```

在 producer/consumer 微基准上，snmalloc 论文报告相对 jemalloc/tcmalloc 有**显著吞吐优势**；对称 `malloc`/`free` 同线程则差距缩小——**没有银弹，只有负载匹配**。

### 示例 2：理解「消息体藏在对象里」与批量链表

论文伪代码的核心：远程释放不分配额外消息节点，而是**覆写刚释放对象的内存**为链表节点，再 batch 挂到目标队列。下面用 C 结构体还原论文 §2.2 的数据布局（教学用，非 snmalloc 源码）。

```c
#include <stdint.h>
#include <stdatomic.h>
#include <stddef.h>

/* 最小可分配对象：next + 目标 allocator 标识 */
typedef struct RemoteObject {
    struct RemoteObject *next;
    void *target_allocator;  /* 实际实现里是编码后的 allocator id */
} RemoteObject;

typedef struct {
    RemoteObject  front;     /* 哨兵：front 本身不是有效消息 */
    _Atomic(RemoteObject *) back;
} RemoteQueue;

/* 单消费者出队：论文称无需原子操作（仅 owner 线程调用） */
RemoteObject *remote_dequeue(RemoteQueue *q) {
    if (q->front.next == NULL)
        return NULL;
    RemoteObject *first = q->front.next;
    q->front.next = first->next;
    return first;
}

/* 多生产者入队一整条 batch：一次 atomic exchange */
void remote_enqueue_list(RemoteQueue *q,
                         RemoteObject *first,
                         RemoteObject *last) {
    last->next = NULL;
    atomic_thread_fence(memory_order_release);
    RemoteObject *prev = atomic_exchange_explicit(
        &q->back, last, memory_order_relaxed);
    prev->next = first;
}

/* 消费者线程 free 非本线程拥有的对象时 */
void remote_free(void *my_allocator, void *obj, void *owner_allocator) {
    RemoteObject *ro = (RemoteObject *)obj;
    ro->target_allocator = owner_allocator;

    /* 先挂到本线程「出站 bucket」的链表；累计 ≥ 1MiB 再 flush */
    ro->next = /* outgoing_bucket[hash(owner)].head */;
    /* ... 达到阈值后 remote_enqueue_list(owner->incoming, chain_first, chain_last) */
    (void)my_allocator;
}
```

**读这段伪代码时记住**：

1. `RemoteObject` 就是用户刚 `free` 的那块 **16 B+** 内存——**零额外堆分配**；
2. `remote_enqueue_list` 用 `exchange` 而不是 CAS 循环，论文强调在 ARM 等弱内存序上配合 **release/acquire fence**；
3. 队列**故意放弃线性化**：图 3 里线程 B 先入队完成，却要等线程 A 链接 `prev.next` 后才对消费者可见——换的是**极高入队吞吐**；
4. 真实 snmalloc 还有 **Temporal Radix Tree** 选路由，不是直接把链推到 `owner->incoming`，但**批量 + MPSC** 思想一致。

现代仓库里更完整的叙述见官方文档 [`docs/AddressSpace.md`](https://github.com/microsoft/snmalloc/blob/main/docs/AddressSpace.md) 与 [`docs/security`](https://github.com/microsoft/snmalloc/blob/main/docs/security)（加固版：元数据隔离、guard page、编码防篡改）。

## 论文实验在说什么

### 微基准

论文使用 SuperMalloc 仓库的 producer/consumer 测试及自研基准，对比 **Hoard、jemalloc、tcmalloc、rpmalloc、scalloc、SuperMalloc、lockfree、lockless、ptmalloc2、TBB malloc** 等。结论要点：

- **Producer/consumer 不对称**时 snmalloc **吞吐领先**；
- 参数扫描（chunk 大小、bucket 数 k、batch 阈值等）显示设计空间宽广，默认配置已较稳；
- **元数据占用**因 64 bit/slab 显著低于位图方案，对 cache 友好。

### 真实程序

- **SPEC CPU 2017**：与一流分配器**同一量级**，无「只会微基准」的偏科；
- **FaRM**（分布式内存数据库风格负载）：体现**跨线程生命周期**的真实压力。

论文也诚实讨论局限：对称负载下 thread cache 方案已极强；snmalloc 的**多跳转发**在极端多线程数时理论上存在延迟上界（7 跳），尽管实践中很少触发。

## 实现演进（2019 → 现在）

读论文时建议同时记住：

| 主题 | 2019 论文 | 后续 main 分支 |
|------|-----------|----------------|
| 远程回收 | Temporal Radix + MPSC | **机制保留** |
| 元数据 / pagemap | 论文 §2.4–2.8 布局 | **大幅重构**（`MetaEntry`、CHERI 友好编码等） |
| 安全 | 基本未谈 | **snmalloc-safe**：随机化、guard page、边界检查 `memcpy` |
| 集成 | 研究原型 | header-only、`LD_PRELOAD`、Rust crate |

若目标是**读源码**，从 `Pagemap` + 分配/释放 fast path 入手，比逐行对照 2019 PDF 更高效。

## 小结

| 问题 | snmalloc 的回答 |
|------|-----------------|
| 谁分配谁释放不对称怎么办？ | **所有权回归**：远程 `free` = 发消息给 owner allocator |
| 如何避免远程路径加锁？ | Pony 式 **MPSC 队列** + **批量 exchange** |
| 目标线程很多，出站表太大？ | **Temporal Radix Tree**：固定 64 bucket，多跳转发 |
| 元数据太贵？ | **Bump + free list**，64 bit / 64 KiB slab |
| 适合谁？ | 流水线、消息传递运行时、GC、跨线程释放密集服务 |
| 不适合谁？ | 单线程或严格同线程 alloc/free——jemalloc/mimalloc 可能更简单 |

一句话：**snmalloc 把跨线程 `free` 从「抢中央锁还货」改成「异步退件给原主」**——在 producer/consumer 世界里，**消息传递比共享缓存更对症**。

## 延伸阅读

- 论文 PDF：<https://github.com/microsoft/snmalloc/blob/main/snmalloc.pdf>
- ISMM 2019 会议页：<https://conf.researchr.org/details/ismm-2019/ismm-2019-papers/3/snmalloc-A-Message-Passing-Allocator>
- 同仓库对比笔记：[jemalloc（Evans 2006）](./jemalloc-evans-2006.md)、[Mimalloc（Leijen 2019）](./mimalloc-leijen-2019.md)
- Pony MPSC 队列渊源：Pony runtime message queue（论文引用 [3,4]）
- Larson & Krishnan (1998) 多 arena 分配——thread cache 思路前身
- Herlihy & Wing (1990) linearizability——理解 snmalloc 队列**故意放弃**的性质
