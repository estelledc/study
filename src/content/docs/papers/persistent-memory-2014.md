---
title: PMFS — 第一个为字节寻址持久内存设计的文件系统
来源: Dulloor 等, "System Software for Persistent Memory", EuroSys 2014
日期: 2026-05-31
分类: 系统
难度: 中级
---

## 是什么

PMFS（**Persistent Memory File System**）是 Intel Labs 2014 年发表的文件系统原型。它假设硬盘已经被一种"**速度接近内存、断电不丢、按字节读写**"的新存储取代，然后从零设计了一套与之配套的内核机制。

日常类比：传统文件系统像图书馆——书放仓库（磁盘），要看时管理员先搬到借阅台（page cache）；PMFS 像直接把整个书架接到你桌上，伸手就能翻，不需要搬来搬去。

这篇论文当年偏前瞻——商用字节寻址 PMEM（如后来的 Optane DC）尚未出货。**5 年后**（2019）Intel 发布 Optane DC 持久内存，PMFS 的设计直接成了 Linux 内核 `ext4-DAX` / `xfs-DAX` 的蓝本。

## 为什么重要

不理解 PMFS，下面这些事都没法解释：

- 为什么 Linux 有 `ext4-DAX` / `xfs-DAX` 这种"绕过 page cache"的挂载选项
- 为什么 Optane（2019）发布后 Intel 直接说"软件栈早就准备好了"
- 为什么现代 CXL Type-3（带持久化的内存扩展卡）继续走"**字节寻址 + DAX**"路线
- 为什么 NOVA / Strata / SplitFS 这些持久内存文件系统的论文都引 PMFS

一句话：PMFS 是"**存储慢→存储快**"硬件革命前夜，软件侧的奠基论文。

## 核心要点

PMFS 解决的是一个根本问题：**当存储和内存速度接近时，传统文件系统的所有假设都失效**。

三大核心机制：

1. **DAX（Direct Access）—— 绕过 page cache**：应用 `mmap` 文件后，CPU 的 load/store 指令**直接打到持久内存**。传统路径要先把磁盘数据复制到 page cache，再从 page cache 复制给应用——两次拷贝在内存级存储上是纯浪费。

2. **CLFLUSH + 内存屏障保证持久化顺序**：CPU cache 写到持久内存才算"真持久"。PMFS 用 `CLFLUSH`（强制 cache 行刷出）+ `SFENCE`（内存屏障）控制写入顺序，不依赖 `fsync` 这种"全量同步"的重锤。

3. **原子 8 字节写 + 日志保证元数据一致性**：硬件保证 8 字节对齐写要么全成功要么全失败。元数据更新塞进 8 字节，跨边界的更新走小日志（undo log）。

## 实践案例

### 案例 1：传统文件系统 vs PMFS 写一个字节

传统 ext4 写 1 字节流程：

```
应用 write() → 内核 → page cache（DRAM 中暂存）
              → 应用返回
              → 后台 flush → 块设备驱动 → 磁盘
```

PMFS DAX 写 1 字节流程：

```
应用 mmap() 拿到指针 p
*p = 'a'              ← CPU store 直接打到持久内存
CLFLUSH(p); SFENCE   ← 强制 cache 刷出 + 等完成
```

**第二条路径少了 2 次拷贝、1 次系统调用、1 次后台 flush**。延迟从微秒级降到几十纳秒。

### 案例 2：为什么需要 CLFLUSH

CPU 写内存其实是写到 cache，cache 什么时候刷到内存由 CPU 自己决定。对 DRAM 这无所谓——反正断电都丢。对持久内存就是大问题：

```c
log_entry->valid = 1;     // ← 这条可能还在 cache
data[0] = 0x42;           // ← 这条已经刷到持久内存
// 突然断电
```

重启后 `data[0] = 0x42` 还在，但 `log_entry->valid = 1` 丢了——日志说"没写"，数据却已经写了，灾难。

PMFS 的纪律：**每次需要持久化的写后面都跟一对 `CLFLUSH + SFENCE`**，强制顺序。后来硬件/编译器更常用 `CLWB` / `CLFLUSHOPT`（少伤性能），语义仍是「把 cache 行推到持久域」。

### 案例 3：DAX 在 Linux 内核里的样子

PMFS 的设计后来直接进了主线内核。今天 Linux 上你可以：

```bash
# 把一块持久内存格式化为 ext4，开 DAX
mkfs.ext4 /dev/pmem0
mount -o dax /dev/pmem0 /mnt/pmem
```

应用 `mmap("/mnt/pmem/foo")` 拿到的指针就是真实持久内存地址。这套接口的祖宗就是 PMFS。

## 踩过的坑

1. **DAX 让应用承担一致性责任**：绕过 page cache 后，应用必须自己管 `CLFLUSH` 顺序。错一个就在断电时丢数据。这把"一致性"从内核推给了用户态——很多老应用根本写不对。

2. **原子性只保证 8 字节对齐写**：写一个 16 字节的结构体不是原子的。跨边界更新必须走日志或 copy-on-write，不能直接 store。新人很容易忽略。

3. **硬件迟到 5 年**：PMFS 2014 发表，Intel Optane 2019 才出货。论文用模拟器评测，真硬件出来后部分性能假设要修正（比如 Optane 的写延迟其实是 DRAM 的 3-5x，不是接近）。

4. **Optane 已被砍**：2022 年 Intel 宣布停产 Optane DC PMM。但"字节寻址持久存储"这个范式被 **CXL.mem + 持久化**接力走下去——PMFS 的思想没死，硬件载体换了。

## 适用 vs 不适用场景

**适用**：

- 持久内存（PMEM）/ CXL Type-3 持久化设备的文件系统设计
- 需要极低写延迟（< 1 微秒）的场景：金融日志、内存数据库 WAL
- 想理解 ext4-DAX / xfs-DAX 内部为什么这么设计
- 学习"硬件抽象重新设计"——什么时候该绕开旧抽象，什么时候该兼容

**不适用**：

- 传统块存储（NVMe SSD / SATA）—— page cache 还是必要的
- 大文件顺序写场景（视频、备份）—— DAX 没有优势，page cache 反而能预读
- 应用不愿改动一致性逻辑 —— DAX 的代价是把责任推给应用
- 需要跨机一致性（分布式存储）—— PMFS 只解决单机持久化

## 历史小故事（可跳过）

- **2009 年前后**：Intel 内部开始研究 PCM（相变存储器）/ STT-RAM。硬件团队预判"未来 5-10 年存储和内存的边界会模糊"
- **2014 年**：Dulloor 团队在 EuroSys 发表 PMFS。当时全场最大的争议是"硬件还没出，谈软件早不早"
- **2015-2018 年**：Linux 内核合并 DAX 支持；ext4、xfs 都加了 DAX 选项；NOVA、Strata 等论文继续推进
- **2019 年**：Intel Optane DC PMM 出货，PMFS 设计变成生产代码；Intel PMDK 库面向应用开发者发布
- **2022 年**：Intel 宣布逐步停产 Optane，社区把目光转向 CXL.mem 持久化变体
- **2024 年至今**：CXL Type-3 设备开始量产，PMFS 提出的"DAX + 字节寻址"再次成为主流路径

## 学到什么

1. **硬件革命前的软件设计**：好论文不一定要等硬件齐了才写——PMFS 提前 5 年布局，硬件一出就接住
2. **抽象代价的重新分配**：DAX 把一致性责任从内核推给应用，换来 10x 的延迟降低。**没有银弹，只有取舍**
3. **范式比载体更耐久**：Optane 死了，但"字节寻址持久存储 + DAX 文件系统"的思想跨硬件代际活下来
4. **CLFLUSH 是新的 fsync**：在持久内存时代，单条缓存行的 flush 才是持久化的真单位，不再是块或文件
5. **存储和内存的二分法正在消失**：DRAM / SSD / HDD 三层金字塔被持久内存压成两层；这反过来动摇了 LSM、page cache、WAL 这些为"慢存储"设计的经典数据结构

## 延伸阅读

- 论文 12 页 PDF：[Dulloor et al., EuroSys 2014](https://dl.acm.org/doi/10.1145/2592798.2592814)
- Linux 内核 DAX 文档：`Documentation/filesystems/dax.txt`（讲 ext4/xfs DAX 实现细节）
- 跟进论文：NOVA（FAST 2016）—— 在 PMFS 思路上加 per-CPU 日志，并发性更好
- 跟进论文：Strata（SOSP 2017）—— 把持久内存、SSD、HDD 做成多层混合，用户态文件系统
- CXL 持久化展望：CXL 3.0 spec 中 Type-3 设备的持久化语义
- 工程视角：[PMDK 项目主页](https://pmem.io/pmdk/) —— Intel 开源的持久内存编程库，封装 CLFLUSH/SFENCE 这些细节
- 反思视角：Optane 停产后 SNIA 社区关于"持久内存软件栈下一步"的讨论文档

## 关联

- [[cache-coherence-cxl3-2026]] —— CXL 内存一致性；PMFS 的「字节寻址 + DAX」思路在 Type-3 持久化设备上延续
- [[nvme-protocol-2017]] —— 块设备时代的协议优化；PMFS 走的是相反路径（绕过块层）
- [[aries-1992]] —— 数据库恢复算法的经典；PMFS 的元数据日志思想可以追溯到 ARIES
- [[rocksdb-lsm]] —— LSM 树为慢存储设计；持久内存让"内存层 + 磁盘层"分层假设松动
- [[memcached-fb-2013]] —— Facebook 大规模缓存实践；持久内存让缓存与存储边界变模糊
- [[esx-memory-2002]] —— 虚拟机内存超卖；同属「内存抽象被硬件能力改写」的系统故事

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aries-1992]] —— ARIES 1992 — 数据库崩溃后怎么把账目对回来
- [[esx-memory-2002]] —— ESX Memory 2002 — 让一台机器假装比自己更大的四个魔术
- [[memcached-fb-2013]] —— Scaling Memcache at Facebook — 万台缓存怎么不被踩塌
- [[nvm]] —— nvm — 在同一台机器上轻松切换 Node 版本
- [[nvme-protocol-2017]] —— NVMe — 为 SSD 重写的存储协议
- [[rocksdb-lsm]] —— LSM-tree 与 RocksDB — 把所有写都变成顺序写

