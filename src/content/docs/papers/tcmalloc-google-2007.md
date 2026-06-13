---
title: TCMalloc — Thread-Caching Malloc 让多线程 malloc 走「线程私有小抽屉」
来源: https://google.github.io/tcmalloc/design.html
日期: 2026-06-13
分类: 操作系统
子分类: 内核与虚拟化
provenance: pipeline-v3
---

## 是什么

**TCMalloc**（Thread-Caching Malloc）是 Google 为 C/C++ 服务写的一套 `malloc` / `operator new` 实现，目标是替代 glibc 默认分配器，在**高并发**场景下把分配延迟压到极低。名字里的 **TC** 来自最早的 **per-thread cache**（每线程缓存）；现代 Linux 上默认已演进为 **per-CPU cache**（每逻辑核缓存），但品牌名保留了下来。

日常类比：公司前台有一个**中央杂物柜**（central free list），所有人领订书钉都要排队开锁。TCMalloc 给每个员工（线程）或每个工位（CPU）发一个**手边小抽屉**（front-end cache）：常用规格的订书钉、回形针直接从抽屉拿，**不用排队**；抽屉空了才去中央柜批量补货（middle-end）；中央柜也没货了，才向物业申请新柜子（back-end / PageHeap）。

你写的：

```c
void *p = malloc(48);
```

在 TCMalloc 内部大致是：把 48 字节**向上取整**到某个 **size class**（例如 48 B 档或 64 B 档，取决于编译选项）→ 从当前线程/CPU 的 cache 对应链表**弹出一个空闲对象** → 若链表空，从 transfer cache / central free list **批量 refill** → 仍不够则向 PageHeap 要新 **Span**（连续若干 TCMalloc page）。

## 为什么重要

不理解 TCMalloc，下面这些事很难讲清楚：

- 为什么 Chrome、gRPC、Abseil 生态默认链 TCMalloc，而 profiler 里 `malloc` 锁等待常常消失
- 为什么「多线程疯狂 `new`/`delete` 小对象」时，glibc ptmalloc 会卡在 arena 锁上，而 TCMalloc 仍能线性扩展
- 为什么 jemalloc、tcmalloc、mimalloc 都谈 **size class + 线程本地缓存**——这是 2000 年代工业界 malloc 的共识架构
- 为什么换分配器后 **RSS 与 VSS 差距**会变大（TCMalloc 向 OS 一次 `mmap` 很大区间，先占虚拟地址）

原始 gperftools 版 TCMalloc 由 Sanjay Ghemawat 等在 Google 内部演化；现行设计文档见 [google/tcmalloc](https://github.com/google/tcmalloc)。本文以官方 [Design doc](https://google.github.io/tcmalloc/design.html) 为准，兼顾 legacy per-thread 与现代 per-CPU 两种前端模式。

## 三层架构（Front / Middle / Back）

TCMalloc 可按职责切成三块：

| 层级 | 职责 | 是否常需要锁 |
|------|------|--------------|
| **Front-end** | 对应用提供 `malloc`/`free`；维护 per-thread 或 per-CPU 缓存 | 热路径**无锁**（单线程/单 CPU 独占 cache） |
| **Middle-end** | 为 front-end 补货、回收；含 **Transfer Cache** 与 **Central Free List**（每个 size class 各一份） | **有 mutex** |
| **Back-end** | 向 OS 要/还内存；**PageHeap**（legacy 或 hugepage-aware） | 有锁，但调用频率低 |

分配路径（小对象）：

```
malloc(n) → SizeMap::GetSizeClass(n) → front-end 链表弹出
         → 空则 middle-end 批量取 → 仍空则 back-end 新 Span
free(p)   → pagemap 查 Span/size class → 压回 front-end 链表
         → 满则批量还 middle-end → Span 全空则还 PageHeap
```

## 核心概念

### 1. Size class（规格档）

「小对象」映射到约 **60–80 个**可分配档位。例如请求 12 B 可能落到 **16 B** class。档位间距经过优化，在**内部碎片**与**档位数**之间折中：小尺寸常按 8 B 递增，更大按 16/32 B 递增。

`::operator new` 的对齐还受 `__STDCPP_DEFAULT_NEW_ALIGNMENT__` 影响：若 ≤8，许多常见尺寸（24、40 B 等）用 8 B 对齐档，减少浪费。

### 2. Span 与 Page

- **TCMalloc page**：分配器自己的页单位（4/8/32/256 KiB 可编译选择），**不等于** CPU TLB 的 4 KiB。
- **Span**：连续若干 TCMalloc page 的管理单元；可专供某一 size class 的小对象，或承载单个大对象。
- **Pagemap**：radix tree，把任意指针映射到所属 Span（`free` 时不知大小时靠它查档）。

小对象在 Span 内用 **16 位索引** 的紧凑链表（unrolled linked list），减少指针追逐的 cache miss。

### 3. Front-end：Per-thread vs Per-CPU

**Legacy per-thread（名字由来）**

- 每个线程一个 `ThreadCache`，每个 size class 一条**单向空闲链表**。
- 分配 = 链表头弹出；释放 = 头插。
- 总缓存上限由 `MallocExtension::SetMaxTotalThreadCacheBytes` 控制（默认约 32 MiB 量级）；单线程还有 `KMinThreadCacheSize`（约 512 KiB）下限。
- 线程多时总 footprint 随线程数涨——高线程数服务上的痛点。

**现代 per-CPU（Linux ≥4.18 + RSEQ 时默认）**

- 每个逻辑 CPU 一块 slab，存各 size class 的指针数组。
- 用 **restartable sequences (rseq)** 更新数组，**无锁**且不怕被抢占写到一半。
- 上限 `SetMaxPerCpuCacheSize`；CPU 数越多，可缓存总量越大。
- 线程迁走后可 `ReleaseCpuMemory` 释放该核缓存。

动态调参：链表太短会频繁打 middle-end；太长则浪费内存。per-thread 模式还会在活跃线程间 **steal** 缓存额度（round-robin 减别人的 `max_size` 给自己）。

### 4. Middle-end：Transfer Cache 的意义

典型模式：**线程 A 分配、线程 B 释放**同一 size class。若 B 的 cache 满、A 的 cache 空，对象经 **transfer cache**（指针数组）快速流转，而不必先沉到 central free list。Central free list 按 **Span** 管理：从 Span 抠对象满足请求；Span 内对象全空闲则整块还 back-end。

### 5. Back-end：PageHeap 与 Hugepage

- **Legacy PageHeap**：按「连续 k 个 page」长度的空闲链表管理；不够则 `mmap`。
- **Hugepage Aware Allocator (HPAA)**：在 x86 上以 **2 MiB hugepage** 为单位，减 TLB miss；含 filler / region / hugepage 几级缓存。

### 6. 与 glibc malloc 的对比（直觉）

| 维度 | glibc ptmalloc（典型） | TCMalloc |
|------|------------------------|----------|
| 小对象热路径 | 可能碰 arena 锁 | 多数无锁（TLS / per-CPU） |
| 规格化 | 有 bin，实现不同 | 显式 size class + Span |
| 内存归还 OS | 较积极（视版本） | 大块预留，RSS 可能偏高 |
| 适用 | 通用 libc | 自建二进制、Bazel 链入 |

## 代码示例

### 示例 1：普通 C 程序 — 小对象热路径

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>

#define N_THREADS 16
#define ITERS     200000

static void *worker(void *arg) {
    (void)arg;
    for (int i = 0; i < ITERS; i++) {
        /* 48 B → 某 size class；多数迭代从本线程 ThreadCache 链表 O(1) 取出 */
        char *buf = malloc(48);
        if (!buf) return NULL;
        buf[0] = (char)i;
        free(buf);  /* 头插回同 size class 链表，仍可不碰 central lock */
    }
    return NULL;
}

int main(void) {
    pthread_t tid[N_THREADS];
    for (int i = 0; i < N_THREADS; i++)
        pthread_create(&tid[i], NULL, worker, NULL);
    for (int i = 0; i < N_THREADS; i++)
        pthread_join(tid[i], NULL);
    puts("done");
    return 0;
}
```

用 `LD_PRELOAD` 或链接 `-ltcmalloc` 跑同样代码，在 8+ 核机器上常比默认 libc **吞吐更高**——瓶颈从 arena 锁变成内存带宽与 cache。

### 示例 2：C++ 中观察 size class 取整与对齐

```cpp
#include <cstdio>
#include <cstdlib>
#include <new>

struct alignas(16) Blob16 {
    char data[16];
};

int main() {
    /* 编译器常知道 sizeof，delete 时可把 size 直接传给 TCMalloc */
    int *p = new int(42);
    delete p;

    /* malloc(12) 实际从 ≥12 的 size class 拿，可能是 16 B */
    void *raw = std::malloc(12);
    std::printf("malloc(12) -> %p\n", raw);
    std::free(raw);

    /* 大于 kMaxSize 的对象绕过 front/middle，直接向 PageHeap 要 Span */
    const size_t huge = 8 * 1024 * 1024;
    void *big = std::malloc(huge);
    if (big) std::free(big);

    Blob16 *b = new Blob16{};
    delete b;
    return 0;
}
```

TCMalloc 对 `operator new` 失败**不抛异常**（Abseil 可用 `ABSL_ALLOCATOR_NOTHROW`），而是直接 crash——换分配器时要留意异常安全假设。

### 示例 3：调 thread cache 总上限（gperftools / 扩展 API）

```cpp
#include <gperftools/malloc_extension.h>
#include <cstdio>

int main() {
    /* 所有线程 cache 合计软上限（字节）；活跃线程多时可适当调大 */
    MallocExtension::instance()->SetNumericProperty(
        "tcmalloc.max_total_thread_cache_bytes", 64 * 1024 * 1024);
    size_t val = 0;
    MallocExtension::instance()->GetNumericProperty(
        "tcmalloc.max_total_thread_cache_bytes", &val);
    std::printf("thread cache budget: %zu\n", val);
    return 0;
}
```

per-CPU 模式下对应 API 为 `MallocExtension::SetMaxPerCpuCacheSize` 等，详见 [Tuning Guide](https://github.com/google/tcmalloc/blob/master/docs/tuning.md)。

## 调优与陷阱

**可调旋钮（摘要）**

- TCMalloc **逻辑 page size**（4/8/32/256 KiB）：小 footprint 用小页；大 heap 用大页减元数据。
- per-CPU / per-thread cache 上限。
- 向 OS **归还内存**的速率（background release）。

**常见坑**

1. **VSS ≫ RSS**：向 OS 预留 GiB 级虚拟区，限制 `ulimit -v` 会过早杀进程。
2. **混用分配器**：`dlopen` 把 TCMalloc 打进已用 libc `malloc` 的进程（如部分 JNI 场景），跨分配器 `free` 会崩。
3. **高线程 + legacy per-thread**：每线程最小 cache 叠加，内存占用可观；优先让内核走 RSEQ 用 per-CPU。
4. **采样分析**：TCMalloc 提供 heap profiling / `MallocExtension` 遥测，比盲猜碎片有用。

## 与相关工作的关系

- **jemalloc**（Evans 2006）：多 **arena** + size class；TCMalloc 强调 **线程/CPU 本地链表**，哲学相近、前端结构不同。
- **gperftools tcmalloc**：老仓库里的实现；新功能在 [google/tcmalloc](https://github.com/google/tcmalloc)（依赖 Abseil）。
- **mimalloc**：微软开源，同样 per-thread heap + size class，竞争同一类工作负载。

## 小结

TCMalloc 的核心思想可以记成一句话：**把小对象分配变成「无锁链表弹压 + 批量中转」**，只有 cache 失衡时才下沉到带锁的 central 层和 OS 层。理解 front / middle / back 三层、size class、Span、pagemap，以及 per-thread 与 per-CPU 两种前端，就抓住了它为何能成为 Google 基础设施默认 malloc 的主干。

## 延伸阅读

- [TCMalloc Design](https://google.github.io/tcmalloc/design.html) — 官方设计文档（本文主来源）
- [TCMalloc Overview](https://google.github.io/tcmalloc/overview.html) — API 与 RSEQ 模式说明
- [gperftools TCMalloc 说明](https://gperftools.github.io/gperftools/tcmalloc.html) — 经典 per-thread 行为与 `TCMALLOC_MAX_TOTAL_THREAD_CACHE_BYTES`
- [google/tcmalloc tuning.md](https://github.com/google/tcmalloc/blob/master/docs/tuning.md) — 生产调参
