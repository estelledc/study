---
title: jemalloc（Evans 2006）— 多 arena 让多线程 malloc 不再抢同一把锁
来源: https://people.freebsd.org/~jasone/jemalloc/bsdcan2006/jemalloc.pdf
日期: 2026-06-13
子分类: 内核与虚拟化
分类: 操作系统
provenance: pipeline-v3
---

## 是什么

jemalloc 是 Jason Evans 在 2006 年 BSDCan 上发表的 **FreeBSD libc `malloc(3)` 实现**，用来替换当时单线程时代设计、在多核 SMP 上已成瓶颈的 phkmalloc（Poul-Henning Kamp, 1998）。

日常类比：公司前台只有一个「杂物抽屉」，所有人领订书钉、便签、文件夹都挤在同一格子里翻找——**抽屉把手就是锁**。phkmalloc 就是这样：算法本身优秀，但多线程同时 `malloc`/`free` 时，大家抢同一把锁，CPU 核越多越堵。

jemalloc 的做法是：

- **摆很多个抽屉柜**（arena），新人入职按顺序分到不同柜子（round-robin），减少撞车；
- **每种规格单独一格**（size class），要 100 字节就发 128 字节的槽，不再现场锯木头；
- **每个线程手边再放一个小收纳盒**（后来的 tcache，论文原版主要靠 arena 分片），常用尺寸随手拿，不必每次都开柜门。

你写的 `malloc(48)` 在内部会被**向上取整**到最近的 size class（默认 48 B 正好一档），从当前 arena 里对应 run 的 region 位图里找第一个空槽——多数路径只碰本线程绑定的 arena，锁竞争大幅下降。

## 为什么重要

不理解这篇论文，下面这些事很难讲清楚：

- 为什么 FreeBSD 7 之后默认 malloc 能扛多线程，而 2005 年社区邮件里 jemalloc 在 5 线程 micro-benchmark 上比 phkmalloc 快 **15×（sparc64）到 80×（amd64）**
- 为什么 Firefox、Redis、Rust（早期）纷纷把 jemalloc 链进进程——**不是玄学调优，是 arena + size class 这套结构**
- 为什么今天谈 tcmalloc、mimalloc 时总说「jemalloc 系」——**多 arena、固定档位、run/region 分层**是工业界共识起点
- 为什么 `malloc` 慢时 profiler 里经常是锁等待，而不是你的业务逻辑

论文摘要里的结论很直白：**多线程分配随 CPU 数扩展良好，单线程性能与 phkmalloc 相当**。它把「分配器」从 bookkeeping 问题升级成「多核缓存一致性 + 锁竞争」问题。

## 核心概念

### 1. 碎片：内部 vs 外部

- **内部碎片**：你要 100 B，分配器给你 128 B 档，多出的 28 B 浪费在对象两侧——size class 的代价。
- **外部碎片**：堆上明明有空洞，但凑不出连续大块——buddy 合并规则、run 生命周期管理要对付这个。

phkmalloc 极度压缩工作集页；jemalloc 时代 RAM 便宜，**CPU cache 行争用**更致命。论文明确：先尽量省总内存，再在不妨碍的前提下让**时间上相邻的分配在地址上相邻**，改善 cache locality。

### 2. False sharing（伪共享）

两个线程各改自己的对象，若两个对象落在**同一 cache line**（通常 64 B），硬件会让两颗 CPU 反复抢夺该行所有权——比锁还隐蔽。

jemalloc **不靠给每个对象 padding**（那会炸内部碎片），而是靠 **多 arena 把不同线程的元数据/对象分散**；性能关键路径上若「一线程分配、多线程写」，仍建议应用层自己按 cache line 对齐。

### 3. Arena：分片降低锁竞争

Larson & Krishnan (1998) 试过「每个 free list 一把锁」——锁争用低了，但 **cache sloshing**（分配器元数据在核间来回弹跳）仍让扩展性崩掉。他们的解法是 **多 arena + 按线程 hash 绑定**。

jemalloc 的改进：

| 配置 | arena 数量 |
|------|-----------|
| 单核 | 1（抢占才可能争用） |
| 多核 | **4 × CPU 数**（默认） |

线程**第一次** `malloc`/`free` 时 **round-robin** 绑定 arena（存在 TLS），比 hash 线程 ID 更均匀。论文在 4 核 Opteron 上默认 **16 个 arena**——`malloc-test` 在 ≤16 线程时几乎线性扩展，第 17 个线程才开始撞 arena。

### 4. Chunk：与内核打交道的基本单位

从 `sbrk`/`mmap` 拿来的内存按 **chunk** 对齐切块，默认 **2 MB**。chunk 起始地址永远是 chunk 大小的整数倍，于是给定任意指针，**O(1)** 算它属于哪个 chunk。

chunk 内部再交给某个 arena 切成 page run；**huge** 分配（> 半 chunk）直接独占连续 chunk，元数据放在全局红黑树（数量少，不是扩展瓶颈）。

### 5. Size class 三档 + 小对象三子档

请求先**向上取整**到最近档位：

| 类别 | 范围（默认 4 KB 页） | 说明 |
|------|----------------------|------|
| Small / Tiny | 2–8 B | 2 的幂对齐即可 |
| Small / Quantum-spaced | 16–512 B | 按 **quantum**（通常 16 B）递增：16, 32, 48… |
| Small / Sub-page | 1–2 KB | 整页内切 region |
| Large | 4 KB–1 MB | 整 run 服务单次大块 |
| Huge | ≥ 2 MB | 直接 chunk 映射 |

**Quantum-spaced** 是论文里的关键取舍：若只用 2 的幂档位，`malloc(48)` 会落到 64 B，内部碎片大；48 B 单独一档，**小对象平均内部碎片显著下降**，代价是档位变多、外部碎片可能略升——实测通常净赚。

### 6. Run + Region bitmap

Small 对象在一个 **run**（连续若干页）里只服务**一个** size class。run 头部有 **region bitmap**：

- 快速扫描第一个空闲 region（紧凑填充）；
- **元数据与对象数据分离**——应用踩坏对象不易腐蚀分配器链表；
- tiny 档位也能支持（若在 free object 里嵌 free list 会更难做 2 B 档）。

每个 size class 同时有多个 run，但任一时刻只有一个 **current run**。run 按使用率分桶（QINIT → Q0 → Q25 → Q50 → Q75 → Q100），**QINIT 的 run 不会被销毁**——避免一次 `malloc`/`free` 就创建/拆掉 run 的抖动；只有空到 Q0 才删除。

选新 current run 的优先级：**Q50 > Q25 > Q0 > Q75**（Q75 几乎满了，当 current 会导致频繁换 run）。

### 7. 运行时配置（继承 phkmalloc）

通过 `/etc/malloc.conf` 符号链接、`MALLOC_OPTIONS` 环境变量或 `malloc_options` 全局变量调参——**低开销、非侵入**。调试选项与性能参数都走这条路；统计默认编译关闭（论文坦承：连 per-arena 分配计数都会 measurable 变慢）。

## 代码示例

### 示例 1：最普通的 C 程序里发生了什么

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>

#define N_THREADS 8
#define ITERS     100000

static void *worker(void *arg) {
    (void)arg;
    for (int i = 0; i < ITERS; i++) {
        /* 请求 100 字节 → jemalloc 向上取整到 128 B (quantum-spaced 档) */
        char *buf = malloc(100);
        if (!buf) return NULL;
        memset(buf, i & 0xff, 100);  /* 触摸数据页，模拟真实使用 */
        free(buf);
    }
    return NULL;
}

int main(void) {
    pthread_t tid[N_THREADS];
    for (int i = 0; i < N_THREADS; i++)
        pthread_create(&tid[i], NULL, worker, NULL);
    for (int i = 0; i < N_THREADS; i++)
        pthread_join(tid[i], NULL);
    printf("done\n");
    return 0;
}
```

**逐行读懂路径**：

1. 每个线程第一次 `malloc` 时绑定一个 arena（round-robin）。
2. `100` 不是任意大小，查表得到 **128 B** size class。
3. 在该 arena 的 128 B run 里扫 bitmap，弹出 region；若 current run 满了，按 Q50→Q25→Q0 顺序换 run。
4. 多线程各用各 arena 时，**锁只在同一 arena 内争用**；8 线程、16 arena 时碰撞概率低。
5. 用 phkmalloc 跑同样代码，多线程会挤**全局锁**——这正是 `malloc-test` micro-benchmark 里 phkmalloc/dlmalloc 曲线断崖的原因。

FreeBSD/Linux 上对比分配器：

```bash
# 强制使用 jemalloc（需已安装 libjemalloc）
LD_PRELOAD=/usr/lib/libjemalloc.so.2 ./a.out

# 打印退出时统计（需 jemalloc 编译时开启 stats）
MALLOC_CONF=stats_print:true LD_PRELOAD=libjemalloc.so.2 ./a.out
```

### 示例 2：用 `mallctl` 观察 size class 与 arena（现代 jemalloc API）

论文里的统计输出（Figure 10 风格）在现代 jemalloc 里仍可通过 `mallctl` 读取。下面片段展示**如何查询当前线程 arena** 并**打印 bin 统计**——对应论文「bins: bin size nregs … nrequests」表头：

```c
#define JEMALLOC_NO_DEMANGLE
#include <jemalloc/jemalloc.h>
#include <stdio.h>

int main(void) {
    unsigned arena;
    size_t sz = sizeof(arena);

    /* 把本线程固定到 arena 3（调优热点线程时用） */
    arena = 3;
    mallctl("thread.arena", NULL, NULL, &arena, sizeof(arena));

    mallctl("thread.arena", &arena, &sz, NULL, 0);
    printf("this thread uses arena %u\n", arena);

    /* 分配几种典型尺寸，制造 bin 流量 */
    void *a = malloc(16);   /* tiny/quantum 边界 */
    void *b = malloc(48);   /* 论文强调的非 2 幂档位 */
    void *c = malloc(512);  /* small 上限附近 */
    free(a);
    free(b);
    free(c);

    /* 进程退出前打印统计（等价于 MALLOC_CONF=stats_print:true） */
    malloc_stats_print(NULL, NULL, NULL);
    return 0;
}
```

编译：`cc -o probe probe.c -ljemalloc`。输出里每个 **bin** 一行：size、run 大小、请求次数——直接对应论文 cca benchmark 统计里「bin 2 T 8 … nrequests 64656199」那种表格。读表时记住：**nrequests 涨而 curruns 不涨**，说明该档位缓存命中好；**curruns 狂增**，可能有外部碎片或线程全挤同一 arena。

## 论文实验在说什么

### 多线程

1. **malloc-test**（Lever & Boreham, 2000）：每线程循环 `malloc(512)`/`free`，共 4000 万次。jemalloc 在 ≤4 线程近线性扩展；phkmalloc/dlmalloc 第二线程起就塌，>10 线程慢到没法测。
2. **super-smack + MySQL**：真实 DB 客户端负载。jemalloc **中位数与 phkmalloc 接近，但最坏情况稳定**；phkmalloc 在 75→80 客户端时性能断崖，尾部延迟极差。

### 单线程

五个程序（cca、cfrac、Ghostscript、sh6bench、smlng）——作者承认有**选择偏差**（专门挑 malloc 敏感的）。结论：**时间与峰值内存与 phkmalloc/dlmalloc 同级**。sh6bench 上 jemalloc 更慢是因为 benchmark **分配后不用内存**，jemalloc 每次仍要摸 bitmap，而 dlmalloc 几乎不碰元数据——**合成测试不能代表真实应用**。

### 碎片观测

作者用 `ktrace` + malloc `U` 选项 + 自写 kdump 绘图工具（Figure 9）看**时间轴上内存占用形状**，而非只看 `max RSS`。这是论文里很「工程师」的一面：标准工具只给定量峰值，布局策略要靠可视化迭代。

## 设计取舍（Discussion 精华）

开发中砍掉的功能说明 **分配器性能对「多出来的计数器、除法、检查」极度敏感**：

- per-arena 总分配字节计数 → 默认关闭统计；
- 各种 sanity check → 只留 API 必需的最小检查；
- 保留 phkmalloc 式 **运行时配置**，几乎不影响快路径。

论文结尾很谦虚：**没有对所有分配模式都最优的分配器**；jemalloc 的目标是 FreeBSD 多核时代够用十年——事实上它服务了 FreeBSD、Firefox、Facebook 基础设施、Redis 等远超十年的生态。

## 踩坑清单

1. **arena 数 ≠ 越多越好**：默认 `4×CPU` 是为碰撞概率设计的；嵌入式单线程应减 `narenas`。
2. **size class 边界设计结构体**：`malloc(sizeof(T))` 若从 512 变 520，可能从 512 B 档跳到 544 B 档——**结构体 padding 要对着档位表设计**。
3. **跨线程传递对象**：在 arena A 分配、在线程 B 频繁 `free`，B 的 arena 与对象所属 run 不一致，锁路径变长；高频 handoff 考虑内存池或 per-thread free list。
4. **huge 分配**：大于半 chunk 走单独路径，频繁 `malloc(3MB)`/`free` 会 mmap/munmap 抖动——应自己池化或使用 `posix_memalign` + 复用。
5. **别用 sh6bench 判生死**：论文自己说合成 trace 对碎片和性能的结论都不可靠。

## 与后辈分配器的关系

| 分配器 | 与 jemalloc 2006 的关系 |
|--------|------------------------|
| tcmalloc (Google) | 同样多 arena + size class + 线程缓存，中央 freelist 思路不同 |
| Hoard | 更早证明 per-processor heap 扩展性；jemalloc 更贴近 libc 集成 |
| mimalloc (Microsoft) | free list sharding，可视为 tcache + arena 的进一步细化 |

## 学到什么

1. **多核 malloc 的第一性原理是分片**——先减少共享写 cache line，再谈 free list 技巧。
2. **固定 size class 是用少量内部碎片换 O(1) 分配与更低元数据争用**；quantum-spaced 档位是为真实小对象分布量身定做。
3. **run  fullness 滞后（hysteresis）** 是系统设计中「避免抖动」的样板——别在边界条件上创建/销毁昂贵资源。
4. **测量分配器必须测真实程序**——论文反复强调 Wilson et al. 1995 综述里的教训；微基准只说明上界或病理 case。
5. **好 libc 组件能穿越二十年**——理解 2006 这篇，等于理解今天服务器进程里仍在跑的 malloc 行为。

## 延伸阅读

- 论文 PDF：[A Scalable Concurrent malloc(3) Implementation for FreeBSD](https://people.freebsd.org/~jasone/jemalloc/bsdcan2006/jemalloc.pdf)
- FreeBSD 邮件列表：[New malloc ready, take 42](https://lists.freebsd.org/pipermail/freebsd-current/2005-December/059216.html)（2005 年引入前的性能数据）
- Facebook：[Scalable memory allocation using jemalloc](https://engineering.fb.com/2011/01/03/core-infra/scalable-memory-allocation-using-jemalloc/)
- 现代手册：[jemalloc.net](http://jemalloc.net/)
- 对照阅读：[[jemalloc-2006]]（本库另一篇偏工程应用的笔记）、[[slab-1994]]、[[immix-mark-region]]

## 关联

- [[jemalloc-2006]] —— 同一主题，侧重 Firefox/Redis 实践与 MALLOC_CONF
- [[slab-1994]] —— 内核里「固定大小对象缓存」的鼻祖，思想与 run/region 同源
- [[rcu-mckenney-2017]] —— 另一类多核读多写少问题的解法，可与 arena 分片对照
- [[moesi-cache-coherence-1986]] —— false sharing 的硬件根因
