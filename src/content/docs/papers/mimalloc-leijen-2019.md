---
title: Mimalloc（Leijen 2019）— 用「分片空闲链表」让 malloc 又快又稳
来源: https://www.microsoft.com/en-us/research/uploads/prod/2019/06/mimalloc-tr-v1.pdf
日期: 2026-06-13
子分类: 内核与虚拟化
分类: 操作系统
provenance: pipeline-v3
---

## 是什么

**mimalloc**（读作 *me-malloc*）是微软研究院 Daan Leijen、Ben Zorn、Leonardo de Moura 在 2019 年 APLAS 上发表的通用内存分配器（技术报告 MSR-TR-2019-18）。它最初为 **Lean** 与 **Koka** 两个引用计数函数式语言的运行时设计，后来成为 Windows、Firefox、CPython（可选）、Rust 生态里常见的 `malloc` 替代品。

日常类比：传统分配器像一家大超市的**中央退货台**——所有尺码的衣服（空闲块）混在一个大筐里，谁退货、谁拿货都要挤同一柜台。多线程时柜台前排长队，而且你刚买的衬衫和三个月前退的袜子可能被塞在一起，**cache  locality** 很差。

mimalloc 的做法是：

- 把退货筐按**货架区域**拆开（**free list sharding**：每个 *mimalloc page* 一条链，通常 64 KiB、只放同一 size class）；
- 每个货架再摆**三个小筐**（**multi-sharding**：本线程释放、跨线程释放、已分配追踪各一条链）；
- 店员按固定节奏偶尔离开「秒结账通道」做盘点（**temporal cadence**：延迟释放、跨线程回收、向 OS 还页）。

你写的 `malloc(32)` 多数时候只是：在当前线程的 mimalloc page 上从**本线程空闲链**弹出一个块——**无锁、无全局 size class 大链、争用天然分散**。

## 为什么重要

不理解这篇论文，下面几件事很难讲清楚：

- 为什么 mimalloc 在 Redis 上比 tcmalloc 快约 **7%**、比 jemalloc 快约 **14%**（论文 benchmark），且在一组顺序/并发测试里曲线更「平」
- 为什么 **Swift / Python / Lean** 这类大量小对象 + 引用计数的运行时，会专门和分配器「谈合作」（延迟减引用、内存压力时唤醒）
- 为什么现代分配器都在谈 **sharding**——jemalloc 的 arena、tcmalloc 的 per-CPU cache、mimalloc 的 page-local 三链表，是同一问题的不同答案
- 为什么换 `LD_PRELOAD=libmimalloc.so` 有时比改业务代码还管用——热路径在分配器里

论文动机很具体：Lean/Koka 运行时**海量短命小分配** + **引用计数**，现有 jemalloc 仍不够快；还需要在分配器里挂钩 **deferred free**（大结构析构时把减引用推迟到「有内存压力」的时刻），避免长时间 STW。

## 核心概念

### 1. mimalloc page：比 OS 页更小的「货架」

在 64 位系统上，一个 **mimalloc page** 通常 **64 KiB**，内部只服务**一个 size class** 的块。这与 OS 的 4 KiB 页不同——它是分配器自己的管理粒度。

好处：

| 维度 | 全局 per-size-class 一条链 | mimalloc page 局部链 |
|------|---------------------------|-------------------|
| 局部性 | 释放分散，下次分配可能很远 | 在同 page 内填满再换页，**时间上相邻的分配地址也相邻** |
| 碎片 | 大链混着各种生命周期的块 | page 空了就整块还给 OS（**eager purging**） |
| 争用 | 所有线程抢同一条链头 | 数千条小链，碰撞概率像「随机散列」 |

### 2. Free list sharding（空闲链表分片）

经典 jemalloc/tcmalloc：每个 size class 维护**一条**（或一组 central）空闲链表。

mimalloc：**每个 mimalloc page 各自一条空闲链**。`malloc` 优先在当前 page 分配，直到 page 满再向 segment 要新 page。`free` 把块还回**它所属 page** 的链——不会把远处 page 的空块和本地混在一起。

直觉：你在 A 区货架拿东西，退回来的也挂回 A 区挂钩，而不是扔到商场总服务台。

### 3. Free list multi-sharding（一页三条链）

论文的核心创新：每个 page 不只有一条空闲链，而是 **三条**：

| 链表 | 谁写入 | 典型操作 | 设计目的 |
|------|--------|----------|----------|
| **Local free** | 本线程 `free` | 链表头 push/pop | **热路径无锁** |
| **Thread free** | 其他线程 `free` | 单次 **CAS** 挂到该链 | 跨线程释放不抢本线程链 |
| **Used / allocated** | 分配器元数据 | 追踪已发出块 | 与空闲分离，便于维护 |

跨线程 `free` 只需一次原子操作把块挂到目标 page 的 **thread free** 链，**不需要**和分配线程协调锁。全堆有成千上万条链，争用自然**打散**——论文把它类比成 skip list 里加「随机 oracle」降低结构化热点。

分配时：先吃 local free；不够则合并 thread free 到 local（按 **temporal cadence** 节奏做，不是每次分配都合并）。

### 4. Temporal cadence（时间节拍）

若永远走「弹块 → 返回」的 fast path，**延迟维护**永远排不上队：thread free 堆着不合并、deferred RC 不跑、空 page 不还 OS。

mimalloc 在 fast path 里埋**可预测的节拍**（例如用计数器低位）：每隔固定次数分配/释放，**故意**离开 fast path 做：

- 把 thread free 合并进 local free；
- 处理 **deferred free** 队列（引用计数运行时）；
- 回收空 page、 `madvise`/`decommit` 给 OS。

这样 worst-case 有界，又不会让维护逻辑「偶尔卡死一次」——对 Lean/Koka 的 **bounded wcat**（最坏情况分配时间）很重要。

### 5. Segment 与线程本地堆

多个 mimalloc page 组成 **segment**（通常 4 MiB 量级）。每个线程有 **thread-local heap**，分配默认只碰本线程的 page，减少跨线程元数据。

v2/v3 演进还引入 **abandoned segment** 回收、**first-class heap**（多堆区域、整堆销毁）等，但 2019 论文的主线仍是 **page-local sharding + 三链表**。

### 6. 面向引用计数运行时的钩子

论文花篇幅讨论：当 RC 减到 0 要释放大树时，可在分配器里 **defer**——把「递归减子节点引用」放进延迟队列，在 **malloc 压力**或 cadence 节拍时批量处理。这样：

- 避免在业务线程上深度递归 free；
- 与 mimalloc 的「定期离开 fast path」自然对齐。

这也是 mimalloc 进入 **Swift、Python nogil 分支** 等讨论的原因：语言运行时不再把分配器当黑盒 `malloc`，而是**协作者**。

### 7. 与 jemalloc / tcmalloc 对照

| 维度 | jemalloc | tcmalloc | mimalloc |
|------|----------|----------|----------|
| 分片单位 | arena（MB 级） | per-CPU / per-thread cache + central | **mimalloc page（64 KiB）** |
| 空闲链粒度 | per arena × size class | per size class central + cache 链 | **per page × 三条链** |
| 跨线程 free | 进 arena 锁或 tcache 流转 | transfer cache / central | **目标 page 上单 CAS** |
| 空内存归还 | 可配置 | PageHeap 回收 | **page 空则 eager purge** |
| 代码规模 | 大 | 中 | **~10k LOC，易嵌入运行时** |

## 代码示例

### 示例 1：零改代码替换系统 malloc

mimalloc 可作为 `malloc`/`free` 的 drop-in 替换。Linux 上动态链接程序常用 `LD_PRELOAD`：

```bash
# 构建你的程序（照常链接 libc）
cc -O2 -pthread -o bench bench.c

# 对比：系统 malloc vs mimalloc
/usr/bin/time -f '%e sec  maxrss=%MKB' ./bench
/usr/bin/time -f '%e sec  maxrss=%MKB' \
  LD_PRELOAD=/usr/lib/libmimalloc.so ./bench

# 打开 mimalloc 统计（版本不同选项名略有差异）
MIMALLOC_SHOW_STATS=1 LD_PRELOAD=libmimalloc.so ./bench
```

下面是一个多线程小对象风暴，能放大 **sharding** 与 **跨线程 free** 差异：

```c
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define N_THREADS 16
#define ITERS     200000

static void *worker(void *arg) {
    long id = (long)arg;
    for (int i = 0; i < ITERS; i++) {
        /* 48 B 很常见：落在独立 size class，内部碎片可控 */
        void *p = malloc(48);
        if (!p) return NULL;
        memset(p, (int)(id + i), 48);

        /* 故意让部分内存在别的线程 free：打 thread-free 链 + CAS 路径 */
        if ((i & 7) == 0) {
            static void *stash[N_THREADS];
            if (stash[id]) free(stash[id]);
            stash[id] = p;
        } else {
            free(p);
        }
    }
    return NULL;
}

int main(void) {
    pthread_t tid[N_THREADS];
    for (long i = 0; i < N_THREADS; i++)
        pthread_create(&tid[i], NULL, worker, (void *)i);
    for (int i = 0; i < N_THREADS; i++)
        pthread_join(tid[i], NULL);
    puts("done");
    return 0;
}
```

**读这段代码时在发生什么**：

1. 每线程第一次 `malloc` 绑定 thread-local heap，从当前 mimalloc page 的 **local free** 弹块。
2. 同线程 `free` → 压回该 page 的 local free，**无锁**。
3. `(i & 7) == 0` 时把块缓存在 `stash`，下一轮在同线程 `free` 上一块——仍 mostly local；若改成把指针交给**另一线程** `free`，则走 **thread free + CAS**，这正是 multi-sharding 要优化的路径。
4. page 填满后换同 segment 新 page；segment 内无可用 page 时再向 OS 要内存。
5. 用 mimalloc 跑通常比 glibc ptmalloc 锁争用少；论文在类似并发 micro-benchmark 上相对 jemalloc/tcmalloc 更稳。

### 示例 2：First-class heap 与按区域批量释放

mimalloc 提供 **heap 对象**（不是只认全局 `malloc`）。游戏引擎、JIT、区域分配器常需要「这一坨一起扔」：

```c
#include <mimalloc.h>
#include <stdio.h>
#include <string.h>

int main(void) {
    /* 独立堆：与默认堆隔离，可整堆销毁 */
    mi_heap_t *heap = mi_heap_new();

    char *a = mi_heap_malloc(heap, 128);
    char *b = mi_heap_malloc(heap, 256);
    strcpy(a, "shard-A");
    strcpy(b, "shard-B");

    /* 模拟：一个请求作用域结束，不必逐个 free */
    mi_heap_destroy(heap);  /* 一次释放 heap 内全部块 + 对应 page */

    /* 默认堆仍可用 */
    void *x = mi_malloc(64);
    mi_free(x);
    return 0;
}
```

编译链接（已安装 mimalloc 开发包时）：

```bash
cc -o heap_demo heap_demo.c -lmimalloc
./heap_demo
```

**设计要点**：

- `mi_heap_malloc` 仍走同一套 page sharding，只是 **page 归属不同 heap**；
- `mi_heap_destroy` 比 N 次 `free` 少碰全局结构，适合 **AST 遍历、编译 Pass 临时 arena**；
- v3 起堆可从**任意线程**分配（true first-class），便于线程池里按任务域划堆。

### 示例 3：观察 deferred / 安全模式（概念验证）

论文里的 **deferred free** 与 **secure mode** 在应用层 API 上体现为选项与心跳钩子。下面片段展示**如何打开安全构建**（生产环境慎用，约 10% 开销）及打印统计的思路——具体宏因版本而异，以[官方文档](https://microsoft.github.io/mimalloc)为准：

```c
#include <mimalloc.h>
#include <mimalloc-stats.h>

int main(void) {
    void *p = mi_malloc(1024);
    mi_free(p);

    /* 进程退出前查看分配器统计：page 数、峰值、桶分布 */
    mi_stats_print(NULL);
    return 0;
}
```

Secure 构建（`MI_SECURE`）会加密空闲链、加 guard page、缓解 double-free——对应论文对**分配器即安全边界**的讨论，与性能模式分开。

## 性能与工程结论（论文摘要）

论文在 Redis、larson（多线程分配测试）、alloc-test 等基准上报告：

- 相对 **tcmalloc** 约 **+7%**（Redis）
- 相对 **jemalloc** 约 **+14%**（Redis）
- 顺序与并发场景多数领先或持平，曲线**方差小**——「没有特别慢的 benchmark」对线上服务很重要

实现侧亮点：

- **~10k 行 C**，结构一致，适合嵌进语言运行时改钩子；
- **eager page purging**：空 page 尽快 `decommit`，长跑服务 RSS 更友好；
- 已被 **Lean 4、Koka、mi_malloc crate（Rust）** 等直接使用或可选链接。

## 常见误区

1. **「mimalloc page = 4 KiB OS 页」** — 错。64 KiB 是分配器逻辑页，和 TLB 页是两层概念。
2. **「分片一定更省内存」** — 不一定。局部性变好、purge 更积极常**降 RSS**，但元数据（每 page 三条链头）有少量开销；要以 workload 实测为准。
3. **「换 mimalloc 就不用管跨线程 free」** — multi-sharding 把 CAS 争用打散，**不是**消灭跨核流量；最佳仍是「谁分配谁释放」或 per-thread arena。
4. **「只适用于 RC 语言」** — 论文动机来自 Lean/Koka，但 C/C++ 通用程序同样受益；RC 钩子是可选项。

## 延伸阅读

- 技术报告 PDF：[mimalloc-tr-v1.pdf](https://www.microsoft.com/en-us/research/uploads/prod/2019/06/mimalloc-tr-v1.pdf)
- 开源实现与 README：[microsoft/mimalloc](https://github.com/microsoft/mimalloc)
- 同系列对比笔记：本库 [jemalloc（Evans 2006）](./jemalloc-evans-2006.md)、[TCMalloc](./tcmalloc-google-2007.md)
- APLAS 2019 会议版：Springer LNCS 11893

## 小结

mimalloc 把「空闲链表」从**全局 per-size-class** 拆成 **per-page**，再在每页上拆成 **local / thread / used** 三条链，用 **temporal cadence** 把维护任务嵌进可预测的节拍。对零基础读者，只需记住类比：**别用大超市总退货台，改成每货架三个小筐，店员按固定节奏盘点**——这就是 *Free List Sharding in Action* 的「Action」：设计直接落在热路径代码与论文 benchmark 数字上。
