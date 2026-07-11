---
title: jemalloc — 多 arena 让多线程 malloc 不再互相等
来源: Jason Evans, "A Scalable Concurrent malloc(3) Implementation for FreeBSD", BSDCan 2006
日期: 2026-06-01
分类: 操作系统
难度: 中级
---

## 是什么

jemalloc 是一个**给 C/C++ 程序用的内存分配器**，2006 年 Jason Evans 写来替换 FreeBSD 的 libc malloc。它的核心招数是**多 arena 加 size class**：把堆切成多块（arena），让线程分散去拿；每块里面再按"固定档位"切槽（size class），避免碎片。

日常类比：原来全公司只有一个打印机，所有人排一队（这是 glibc ptmalloc 的样子）。jemalloc 干的事是——**摆 8 台打印机，按工号分流**（arena），并且给每种纸（A4/A3/小票）各准备一个抽屉（size class），不再到现场临时切纸。

你写：

```c
char *p = malloc(100);
```

jemalloc 看到 100 byte，去最近的 size class 档（128 byte），从你这个线程的本地缓存（tcache）里直接弹出一个槽，**不抢锁、不进系统调用**。

## 为什么重要

不理解 jemalloc，下面这些事都没法解释：

- 为什么 Firefox 3 (2008) 切到 jemalloc 之后**内存用量直接降 22%**
- 为什么 Redis 一直把 jemalloc 列为"推荐分配器"，连发行包都默认带
- 为什么 Rust 1.0 到 1.31 默认链 jemalloc，后来改成 system 还专门发了 RFC 解释
- 为什么今天写多线程 C++ 服务，第一件事就是 `LD_PRELOAD=libjemalloc.so`

它是 2006 年到现在**多核时代 malloc 的工业标准答案**，也是 tcmalloc / mimalloc 这些后辈的共同祖先。

## 核心要点

jemalloc 的设计可以拆成 **三层结构**（2006 论文核心），现代版本再加本地缓存：

1. **arena（堆分片）**：默认开约 `4 * CPU 数` 个 arena，每个 arena 自己持锁。线程第一次 malloc 时 round-robin 绑定到一个 arena，之后大部分 malloc/free 只跟自己那个 arena 打交道。**多核竞争锁的问题在这一层化解**。

2. **run（连续页段）**：arena 内部按页 chunk 管理，每段 chunk 切成若干个 **run**（一段连续页）。每个 run 只装一个 size class。

3. **region（固定大小槽）**：run 内部按 size class 切成等大的 region。malloc(100) 落到 128 byte 这一档，从对应 run 弹一个 region 出来。

4. **tcache（线程本地缓存，后期演进）**：现代 jemalloc 给每个线程缓存最近 free 的小块；命中后**不进 arena 锁**。2006 论文尚未强调这一层，但它是今天"几十纳秒 malloc"的关键。

按尺寸三档分流：
- **small** (< 4 KB)：走 region/run，size class 表查档
- **large** (4 KB - 1 MB)：走整个 run
- **huge** (> 1 MB)：绕过 arena，直接 mmap

## 实践案例

### 案例 1：Firefox 为什么换 jemalloc

2008 年前 Firefox 在 Windows 上跑久了内存涨得离谱。根因是 **Windows 自带 HeapAlloc 碎片严重**——每次切一块 100 byte，free 之后那个洞填不上更大请求。

Firefox 团队做的事：把 jemalloc 整个移植进来（mozjemalloc）。结果：

- 长时间运行的 Firefox 内存占用**降 22%**
- 同样的网页打开速度提升（malloc 快 → JS 引擎少卡）
- 这一招后来 Mozilla 写成博客《Improving Memory Usage》传遍工程界

### 案例 2：Redis 为什么默认 jemalloc

Redis 6 之后官方编译脚本直接默认 jemalloc。**为什么不用 glibc malloc**？

- Redis 的工作负载是"很多小字符串 + 偶尔大块"——典型多 size class 命中
- glibc malloc 在长跑的 Redis 进程里**碎片率经常涨到 30% 以上**（Redis 自己的 INFO 命令能看 `mem_fragmentation_ratio`）
- jemalloc 同样负载下碎片率稳定在 1.1-1.3 之间

Redis 内置 `MEMORY PURGE` 命令调的就是 jemalloc 的 `mallctl("arena.<i>.purge")`。

### 案例 3：自己看 size class 表

```bash
# Linux 上装好 libjemalloc 后
MALLOC_CONF=stats_print:true ./your_program
```

输出里会有：

```
Size |   nrequests  |  curslabs |  curregs
   8 |       1234   |       2   |     512
  16 |        567   |       1   |     256
 ...
4096 |         12   |       0   |       0
```

每行就是一个 size class。**malloc(9) 不会拿到 9 byte，会拿 16**——这是固定档位的代价。要省内存，结构体设计就要踩着 size class 边界（比如对齐到 16 / 32 / 64）。

## 踩过的坑

1. **arena 数太多 → 内存放大**：默认 `4 * CPU 数`。32 核机器上 = 128 个 arena，每个 arena 至少占一个 chunk（4 MB），光空 arena 就 512 MB。小程序应该 `MALLOC_CONF=narenas:4`。

2. **线程撞 arena**：round-robin 是线程**首次 malloc** 时绑定的，热点线程可能正好分到同一个 arena。可以用 `mallctl` 强制 `thread.arena` 重新分配。

3. **size class 边界**：malloc(4097) 不是 4097，是 8 KB。业务数据结构卡在 4096+8（多了一个指针）就会占两倍空间。**写 struct 之前先看 size class 表**。

4. **MALLOC_CONF=prof:true 性能掉**：开内存 profile 之后每次 malloc 都打 backtrace，慢 5-10 倍。**只在排查内存泄漏时短暂开**，别留生产。

5. **和 glibc 共存**：动态链接时 `LD_PRELOAD=libjemalloc.so` 替换全局 malloc，但**已经被其他库静态链接的 malloc 不会换**。某些 OpenSSL 版本就有这个坑。

## 适用 vs 不适用场景

**适用**：
- 多线程 C/C++ 服务（数据库 / 游戏服 / 浏览器内核）
- 长跑进程（碎片是慢性病，jemalloc 抗碎片好）
- 内存敏感场景需要看 stats（mallctl 接口很全）

**不适用**：
- 极小程序（几百 KB）→ jemalloc 元数据开销不划算，用系统 malloc
- 实时系统硬延迟保证 → jemalloc 仍可能触发 mmap / madvise，延迟尾部不可控
- GC 语言（Java / Go） → 它们有自己的分配器，jemalloc 不在路径上
- 共享内存 IPC → jemalloc 的元数据挂在进程私有空间

## 历史小故事（可跳过）

- **2005 年**：Jason Evans 给 FreeBSD 写新 malloc，原来的 phkmalloc（Poul-Henning Kamp 1990s 写的）单线程没问题，多核 SMP 性能塌方。
- **2006 年 BSDCan**：Evans 发表本论文，FreeBSD 7.0 默认带上 jemalloc。
- **2008 年**：Mozilla 移植成 mozjemalloc，Firefox 3 内存暴降 22%。
- **2010-2014 年**：Facebook 雇了 Evans 全职维护 jemalloc，加了 prof / stats / huge page 支持。
- **2015 年**：Rust 1.0 发布，默认链 jemalloc。
- **2018 年**：Rust 1.32 改回 system malloc（理由：有些平台 jemalloc 装不上 / 二进制大）。
- **2018 年至今**：mimalloc (Microsoft) / tcmalloc (Google) 是 jemalloc 的工业级竞品，思路同源。

## 学到什么

1. **多核分配器的核心是分片**——一个全局锁挡住所有线程，再快的算法也救不回来。arena 是降锁竞争的标准答案。
2. **固定档位 vs 任意尺寸是空间换时间**——size class 浪费几个 byte，但 free 再 malloc 同尺寸 O(1) 命中。
3. **本地缓存（tcache）解决最后一公里**——arena 锁已经够稀疏了，但一个线程反复 malloc/free 同尺寸还是值得本地缓存。
4. **2006 年的论文今天还在跑**——好分配器写一次，浏览器/数据库/语言运行时一起受益 20 年。

## 延伸阅读

- 论文 PDF：[Evans 2006 BSDCan](https://people.freebsd.org/~jasone/jemalloc/bsdcan2006/jemalloc.pdf)（28 页，工程论文，可读性高）
- 官方文档：[jemalloc.net](http://jemalloc.net/)（mallctl 接口和 MALLOC_CONF 全表）
- Mozilla 记录：[Firefox 3 Memory Usage](https://blog.pavlov.net/2008/03/11/firefox-3-memory-usage/)（Stuart Parmenter：Vista 上 jemalloc 降约 22%）
- Facebook 工程博客：[Scalable memory allocation using jemalloc](https://engineering.fb.com/2011/01/03/core-infra/scalable-memory-allocation-using-jemalloc/)（生产经验）
- [[tcmalloc]] —— Google 的同代竞品，思路同源
- [[mimalloc]] —— Microsoft 2019，jemalloc 的精神后辈

## 关联

- [[tcmalloc]] —— Google 2007 同代分配器，size class + 本地缓存设计高度相似
- [[mimalloc]] —— Microsoft 2019，"free list sharding" 是 jemalloc tcache 的精化版
- [[glibc-ptmalloc]] —— 对照组，glibc 默认分配器，多 arena 但锁粒度比 jemalloc 粗
- [[buddy-system]] —— Linux 内核物理页分配器，"伙伴系统"思想是 jemalloc size class 的远祖
- [[immix-mark-region]] —— GC 世界的对应物，分区域 + 固定大小是共同思路
- [[linux-slab-allocator]] —— 内核里给小对象设计的同尺寸缓存池，思路与 jemalloc size class 同源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
