---
title: RocksDB 2017 — 把 LSM-Tree 的"空间放大"压到极低的工业经验
来源: 'Dong et al., "Optimizing Space Amplification in RocksDB", CIDR 2017'
日期: 2026-05-30
分类: 数据库
难度: 中级
---

## 是什么

这是 Facebook 工程师在 CIDR 2017 写的一篇**工程经验**论文，回答一个具体问题：**怎么让 RocksDB 占用的磁盘尽可能接近真实数据量？**

日常类比：你家衣柜按"上层小、下层大、每层比上一层大 10 倍"叠放衣服。如果衣服总量刚好填满最底层，每层都能装满，浪费很少。但如果衣服只有最底层容量的 60%——这一层装不满，其他每层却仍按"小 10 倍"的固定大小占着空间。本来 100 件衣服需要 110 件的柜子（10% 浪费），结果占了 130 件柜子（30% 浪费）。

论文核心招：**反向锚定最后一层的实际大小**——衣服多少决定底层多大，再向上反推每层目标大小，让每层都正好按 1:10 比例装满。

```
传统 leveled        Dynamic leveled
L1: 1 GB（满）      L1: 10 MB（按 L4 反推）
L2: 10 GB（满）     L2: 100 MB（满）
L3: 100 GB（满）    L3: 1 GB（满）
L4: 1000 GB ← 只装 100 GB（10%）   L4: 10 GB ← 按实际数据撑起来
```

## 为什么重要

不理解这篇论文，下面这些事都解释不了：

- 为什么 Facebook 把 MySQL 的存储引擎从 InnoDB 换成 RocksDB（MyRocks）能省一半磁盘
- 为什么 LSM-Tree 不是天生就比 B-Tree 省空间，需要**调度策略**配合
- 为什么 RocksDB 默认 leveled 之外还有个 `level_compaction_dynamic_level_bytes` 选项
- 为什么"空间放大"和"写放大"虽然都叫"放大"，但优化方向**互相打架**

## 核心要点

LSM-Tree 有三种放大，记住名字就够：

1. **写放大（Write Amp）**：写 1 GB 数据，磁盘真正写了多少 GB（compaction 反复重写老数据）。
2. **读放大（Read Amp）**：读 1 个 key，磁盘扫了多少个 SSTable。
3. **空间放大（Space Amp）**：磁盘占多少 GB / 真实有效数据 GB。本文只关心这一个。

**Dynamic Leveled Compaction** 解空间放大的原理：

1. **观察**：传统 leveled 把每层固定为上一层 10 倍。但只有"最后一层装满"时空间放大才能压到 1.11×（≈1/(T-1)+1，T=10）。
2. **症状**：现实数据量很少刚好等于"满层"的指数倍，最后一层只装 30%，其他层照样占满，整体放大变 1.5× 甚至 2×。
3. **解法**：固定最后一层 = 实际数据量，向上每层除以 10。每层都 100% 满，放大重新逼近 1.11×。

附加招：**字典压缩**（多个 SSTable 共享一份压缩字典）+ **prefix bloom filter**（针对前缀查询不浪费 bloom 位）。

## 实践案例

### 案例 1：传统 leveled 为什么浪费

假设你有 300 GB 数据，RocksDB 配 4 层，倍数 10：

```
L1 max = 1 GB
L2 max = 10 GB
L3 max = 100 GB
L4 max = 1000 GB
```

数据 300 GB 全压到 L4 后只占 30%。但 L1+L2+L3 仍持续被 compaction 写满（111 GB）。**总占用 ≈ 411 GB，空间放大 ≈ 1.37×**。

### 案例 2：Dynamic Leveled 反向锚定

数据还是 300 GB，但 RocksDB 现在反过来设：

```
L4 = 300 GB（实际值）
L3 = 30 GB
L2 = 3 GB
L1 = 0.3 GB
```

每层都按 1:10 撑满。**总占用 ≈ 333 GB，放大 ≈ 1.11×**。Facebook 实测在 UDB 生产负载里这一招把空间放大从 25% 降到 10%。

### 案例 3：MyRocks 替换 InnoDB

Facebook UDB（社交图谱的 MySQL 集群）原用 InnoDB B-Tree。B-Tree 有 **页面级碎片**——每个 16KB 页只装 60-70%（页分裂留出空位、删除留下墓碑）。

换 RocksDB + dynamic leveled 之后，相同业务数据占用降到原来一半，磁盘成本直接砍半。这是这篇论文最被记住的"商业故事"——不是因为算法新，而是因为它真的让一家公司省下数百 PB 存储的钱。

附加技巧：**字典压缩**。RocksDB 给同一层多个 SSTable 共享一份压缩字典（zstd），比每个文件独立压缩节省 5-15%。Prefix bloom filter 让 `prefix scan` 查询不浪费 bloom 位，减少误中。这两个小招在论文里只占一节，但生产里都开了。

## 踩过的坑

1. **把空间放大和写放大混为一谈**：leveled 写放大其实**比 tiered 高**（每层 compaction 多写几次），dynamic leveled **不解决**写放大，反而稍微更高一点。Facebook 选择"用写放大换空间放大"是因为他们的瓶颈是磁盘容量。

2. **以为 dynamic 能自动调 level 数量**：其实它只动态调"每层目标大小"，level 数量仍由数据量自然决定。配置时仍需估算合适的 level 数。

3. **没意识到这是工程经验论文不是理论突破**：核心洞察就一句"反向锚定最后一层"。没新数据结构、没新算法。但工业意义巨大。

4. **和 LSM-Tree 1996 原始论文混淆**：1996 那篇是 LSM 数据结构原始定义，本文是 25 年后工业落地总结。一个讲"为什么"，一个讲"工程上怎么调到不亏钱"。

## 适用 vs 不适用场景

**适用**：

- LSM-Tree KV 引擎需要压低空间放大（盘比 CPU 贵）
- 写多读少，可以用一点写放大换空间放大
- 数据量稳定但不一定刚好等于"满层"指数倍——大多数现实场景

**不适用**：

- B-Tree 系（PostgreSQL / InnoDB / SQL Server）—— 没有 leveled compaction 这个概念
- 写延迟敏感（高频金融行情）—— 写放大上升导致 P99 抖动
- 数据量极小（< 1 GB）—— 几层都可以全装内存，调度策略不重要
- tiered compaction 派系（Cassandra 默认）—— 设计理念是"不 compact 老数据"，不打算压低空间放大

## 历史小故事（可跳过）

- **2011 年**：Google 开源 LevelDB（Sanjay Ghemawat & Jeff Dean），第一个广泛使用的 leveled LSM 实现。
- **2012 年**：Facebook fork LevelDB 改名 RocksDB，目标是嵌入到 MySQL / Hive / 流处理等多个产品里。
- **2015 年**：MyRocks（MySQL on RocksDB）项目启动，要把 Facebook UDB（社交图谱）从 InnoDB 迁出来。瓶颈是磁盘空间。
- **2016 年**：dynamic leveled compaction 上线，配合字典压缩、prefix bloom，把空间放大从 25% 压到 10%。
- **2017 年**：CIDR 论文发布，把这次迁移的工程经验公开总结。后来 dynamic leveled 成为 RocksDB 推荐默认设置。

## 学到什么

1. **"空间放大"是 LSM-Tree 的第三个放大维度**，和写放大经常打架——优化哪个看你的瓶颈在哪里
2. **反向锚定**是个朴素又强力的设计思路：与其按预设大小切层，不如按实际数据反推
3. **工业论文的价值不在新算法，在"知道把哪个旋钮调到哪一档"**——Facebook 一次调参省一半磁盘成本
4. **B-Tree 不是天然紧凑，LSM 不是天然臃肿**：调度策略决定一切
5. **"瓶颈识别"比"优化技术"更重要**：先确定盘 / CPU / 网络哪个先撞墙，再选放大维度

## 延伸阅读

- [RocksDB Wiki — Leveled Compaction](https://github.com/facebook/rocksdb/wiki/Leveled-Compaction)（含 dynamic level bytes 的官方解释）
- 论文 PDF：[Dong et al., CIDR 2017](http://cidrdb.org/cidr2017/papers/p82-dong-cidr17.pdf)（13 页，工程细节密度高）
- [Mark Callaghan 博客](https://smalldatum.blogspot.com/)（RocksDB / MyRocks 主作者，长期写 LSM 调参文章）
- [[lsm-tree-1996]] —— LSM-Tree 原始论文，先读它再读本文
- [[rocksdb-lsm]] —— RocksDB 整体架构介绍
- [[bigtable-2006]] —— Google 的 LSM 工业前辈

## 关联

提示：先读 lsm-tree-1996 理解"分层 + 后台合并"的基本结构，再看本文如何在工程层面把空间放大压低。

- [[lsm-tree-1996]] —— LSM-Tree 原始结构，本文是它 25 年后的工业调参经验
- [[rocksdb-lsm]] —— RocksDB 系统全貌，本文聚焦其中一个具体优化
- [[bigtable-2006]] —— Google 用 LSM 做工业 KV 的鼻祖
- [[cassandra-2010]] —— 同样基于 LSM 但走 tiered compaction 路线，对比鲜明
- [[b-tree-1972]] —— 本文反复对比的"老对手"，B-Tree 有页面碎片
- [[comer-1979-btree]] —— B-Tree 综述，理解为什么 B-Tree 空间不紧凑
- [[aurora]] —— 另一种数据库省空间策略：把存储下沉到日志层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aurora]] —— Aurora — 把数据库的下半身换成日志机
- [[b-tree-1972]] —— B-Tree 1972 — 磁盘友好的索引结构
- [[bigtable-2006]] —— Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统
- [[btrfs-2013]] —— Btrfs — Linux 上"写时复制 B-tree"的工业级文件系统
- [[cassandra-2010]] —— Cassandra 2010 — 把 Dynamo 的 P2P 骨架和 Bigtable 的列族数据模型拼成一个东西
- [[comer-1979-btree]] —— Comer 1979 — B-Tree 综述：为什么这棵树到处都有
- [[conduit]] —— Conduit — Rust 写的极简 Matrix homeserver，单二进制 + 嵌入式数据库
- [[lmdb-2011]] —— LMDB 2011 — 把数据库直接 mmap 进内存的嵌入式 KV 存储
- [[lsm-tree-1996]] —— LSM-Tree 1996 — 写优化存储引擎
- [[rocksdb-lsm]] —— LSM-tree 与 RocksDB — 把所有写都变成顺序写
- [[silt-2011]] —— SILT — 0.7 字节内存索引一条记录的 flash 键值存储

