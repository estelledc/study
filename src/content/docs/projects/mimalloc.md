---
title: mimalloc — Microsoft 的小对象分配器
来源: https://github.com/microsoft/mimalloc
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

# mimalloc — Microsoft 的小对象分配器

## 什么是内存分配器？

写 C/C++ 程序时，你一定用过 `malloc` 和 `free`。它们的作用很简单：向操作系统"借"一块内存来用，用完还回去。

但操作系统并不擅长频繁地借还小内存——就像你去银行每次只取 10 块钱，柜员会觉得你很麻烦。所以操作系统会把一大笔钱（比如几 MB）一次性给你，然后你在内部自己分给每个人。

**内存分配器**就是做这件"内部分钱"的事。Linux 默认的叫 glibc malloc，macOS 叫 libmalloc。而 mimalloc 是微软研究院做的一个"分得更聪明"的版本。

## mimalloc 是什么？

mimalloc（读作 "me-malloc"）是微软开源的一个通用内存分配器。它的特点是：

- **快**：在大量基准测试中，性能超过 jemalloc、tcmalloc 等知名分配器
- **省内存**：元数据开销约 0.2%，内部碎片率低
- **安全**：可选安全模式，带防护页、加密自由列表
- **即插即用**：可以完全替代系统默认的 malloc，不需要改代码

它最初是为 Koka 和 Lean 两种编程语言的运行时系统开发的，后来发现性能太好，就开源了。

## 核心概念

### 1. 自由列表分片（Free List Sharding）

传统分配器通常维护一个"大自由列表"——所有空闲内存放在一条链表里。想象一个图书馆只有一张借书记录表，找书就得从头翻到尾。

mimalloc 的做法是：把一张大表拆成很多张小表。每个 64KiB 的"页面"都有自己的自由列表。这样：

- 找空闲块更快（不用遍历整条链表）
- 时间上接近的分配，地址上也更接近（对 CPU 缓存友好）

### 2. 自由列表多重分片（Free List Multi-Sharding）

这是 mimalloc 最大的创新。每个页面不只有一条自由列表，而是有两条：

- **线程本地列表**：当前线程释放的内存放这里
- **并发列表**：其他线程释放的内存放这里

这解决了多线程下的竞争问题。想象一个餐厅有 1000 张桌子，每张桌子有自己的收银台。顾客从任何收银台付款都不会排队——因为分散到了上千个收银台，几乎不会碰到竞争。

技术上，这靠的是原子操作（CAS），不需要复杂的锁机制。

### 3. 积极页面清除（Eager Page Purging）

当一个页面变得空闲后，mimalloc 会告诉操作系统："这块物理内存我不用了，你可以给别人。" 这叫 purging。好处是：

- 降低真实内存压力
- 减少长程序运行时的碎片

### 4. 第一类堆（First-Class Heaps）

mimalloc 允许你创建多个"堆"（heap），每个堆是独立的内存区域。你可以：

- 在不同堆中分配，互不干扰
- 一次性销毁整个堆，而不是逐个释放对象
- v3 版本支持从任何线程向同一个堆分配

## 代码示例

### 示例 1：基本使用

最简单的方式是直接调用 `mi_malloc` / `mi_free`，替换原来的 `malloc` / `free`：

```c
#include <stdio.h>
#include <mimalloc.h>

int main(void)
{
    // 分配 100 个整数
    int *arr = (int *)mi_malloc(sizeof(int) * 100);
    if (arr == NULL) {
        printf("allocation failed\n");
        return 1;
    }

    // 正常用
    for (int i = 0; i < 100; i++) {
        arr[i] = i * i;
    }

    printf("arr[10] = %d\n", arr[10]);  // 输出 100

    // 释放
    mi_free(arr);
    return 0;
}
```

编译方式：

```bash
gcc -o example example.c -lmimalloc
```

### 示例 2：零初始化分配 + 环境变量统计

`mi_zalloc` 分配的同时把内存清零（等价于 `malloc` + `memset(0)`，但更快）：

```c
#include <stdio.h>
#include <mimalloc.h>

int main(void)
{
    // 分配并清零 1000 个 double
    double *matrix = (double *)mi_zalloc(sizeof(double) * 1000);

    // 所有值都是 0.0，可以直接用
    printf("matrix[0] = %f\n", matrix[0]);  // 输出 0.000000

    mi_free(matrix);
    return 0;
}
```

运行前设置环境变量，可以看到 mimalloc 的详细统计信息：

```bash
MIMALLOC_SHOW_STATS=1 ./example
```

输出类似：

```
subproc 0
 blocks          peak       total     current       block      total#
  bin S    4:    75.3 KiB    55.2 MiB     0          32   B       1.8 M    ok

  binned    :    84.2 KiB    41.5 MiB     0                                ok
  total     :    84.2 KiB    41.5 MiB     0
```

这告诉你：峰值用了 84.2 KiB，总共分配过 41.5 MiB，当前剩余 0（都释放了）。

### 示例 3：第一类堆（First-Class Heap）

创建独立的堆，可以在特定场景下批量管理内存：

```c
#include <stdio.h>
#include <mimalloc.h>

int main(void)
{
    // 创建一个新堆
    mi_heap_t *heap = mi_heap_new();

    // 在这个堆中分配
    int *a = (int *)mi_heap_malloc(heap, sizeof(int) * 10);
    char *b = (char *)mi_heap_malloc(heap, 256);

    mi_heap_insert_at(heap, a, 42);
    mi_heap_insert_at(heap, b, 99);

    // 一次性销毁整个堆，所有内存一起释放
    // 比逐个 free 高效得多
    mi_heap_destroy(heap);

    return 0;
}
```

### 示例 4：动态替换系统 malloc

最方便的使用方式——不改一行代码，直接替换整个程序的内存分配器。

在 Linux 上：

```bash
LD_PRELOAD=/usr/lib/libmimalloc.so myprogram
```

在 macOS 上：

```bash
DYLD_INSERT_LIBRARIES=/usr/lib/libmimalloc.dylib myprogram
```

这样 `myprogram` 里所有的 `malloc` / `free` / `new` / `delete` 都会自动走 mimalloc，不需要重新编译。

## 三种构建模式

| 模式 | 用途 | 性能影响 |
|------|------|----------|
| Release（默认） | 生产环境 | 基准 |
| Debug | 开发调试，带越界检测、统计 | 较慢 |
| Secure | 安全敏感场景，防护页 + 加密 | ~10% |

## 为什么值得关注？

mimalloc 的设计哲学很朴素：不用复杂的算法，而是用简单一致的数据结构，加上几个巧妙的想法（尤其是自由列表多重分片），就能在所有常见场景下做到又快又省。

它对游戏引擎（Unreal Engine）、数据库（Cosmos DB）、搜索引擎（Bing）等低延迟场景都有很好的效果。如果你在做 C/C++ 项目，或者只是好奇"内存分配器还能这么玩"，mimalloc 值得了解。

## 延伸阅读

- 官方文档：https://microsoft.github.io/mimalloc
- 设计论文：[mimalloc: Free List Sharding in Action](https://www.microsoft.com/en-us/research/publication/mimalloc-free-list-sharding-in-action)
- 源码仓库：https://github.com/microsoft/mimalloc
