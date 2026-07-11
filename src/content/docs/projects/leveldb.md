---
title: LevelDB — Google LSM 库
来源: https://github.com/google/leveldb
日期: 2026-05-31
分类: 数据库 / 存储引擎
难度: 中级
---

## 是什么

LevelDB 是一个**嵌入式键值存储库**——你把它当成 C++ 库 link 进自己的进程，而不是连一台数据库服务。Google 的 Sanjay Ghemawat 与 Jeff Dean 在 2011 年开源，把 Bigtable 里的 SSTable 思路抽成独立库。

日常类比：传统库像**有索引卡的资料柜**，改一条要找到原位覆盖。LevelDB 像**快递分拣站**：包裹先上传送带（内存 MemTable），凑够一车封成**不可拆的盒子**进仓库（磁盘 SST）；仓库乱了再由工人把旧盒子拆开重打——这一步叫 **compaction（合并压缩）**。

约 20k 行 C++，BSD 3-Clause。2012 年 Facebook fork 出 [[rocksdb]]——读它等于读 LSM 引擎的祖父。整套设计的核心权衡是：**牺牲读路径变长，换写入永远顺序追加**。

## 为什么重要

不理解 LevelDB，下面这些事都讲不清：

- 为什么 Chrome IndexedDB、比特币核心、go-ethereum 都选它——嵌入式、无独立运维、顺序写
- 为什么 1996 年的 [[lsm-tree-1996]] 要等 SSD 普及后才爆发——SSD 爱顺序写、怕原地改
- 为什么「读 LevelDB 源码」成了存储入门课——整条 LSM 路径压在约 20k 行里
- 为什么 RocksDB 文档常说「我们修了 LevelDB 的 X」——单线程 compaction、单 keyspace 等

## 核心要点

写入路径可以记成 **五步**，并顺带理解三种「放大」：

1. **WAL（写前日志）**：`Put` 先 append 到磁盘日志，崩溃可重放。
2. **MemTable**：同一份写入进内存有序结构（**skip list / 跳表**）；读先查这里。
3. **Flush**：MemTable 满了（默认约 4MB）冻住，刷成不可变 **SST**（Sorted String Table）。
4. **Compaction**：后台按 **leveled** 合并——L0 可重叠，L1~L6 层内不重叠，每层约大 10 倍；删除/覆盖在这里才真正落地。
5. **读路径**：MemTable → L0 多文件 → 各层一个 SST；用 **bloom filter** 跳过不存在的 key，**block cache** 缓存解压块。

三种放大（调优三角）：

- **写放大**：你写 1 字节，磁盘可能因层层 compaction 写许多倍。
- **读放大**：一次 Get 可能查 MemTable + 多个 SST。
- **空间放大**：墓碑与旧版本占盘，合并前删不掉。

LevelDB 的 leveled 策略偏**空间与读更可控、写放大略大**。粗算：每层约 10×，一个 key 从 MemTable 沉到深层大约经历 `log10(总大小/MemTable)` 次合并。

SST 内部大致是 Data Block → Filter(bloom) → Index → Footer；先读 Footer 找 Index，再定位 Data Block——这套也被 RocksDB 继承。

## 实践案例

### 案例 1：在进程里打开一个库

```cpp
#include "leveldb/db.h"
leveldb::DB* db;
leveldb::Options options;
options.create_if_missing = true;
leveldb::Status s = leveldb::DB::Open(options, "/tmp/testdb", &db);
// s.ok() 后即可 Put/Get；目录里会出现 LOG、MANIFEST、*.ldb
```

**逐步解释**：

1. `create_if_missing`：目录不存在就建库。
2. `Open` 成功后，同一进程内 `Put` / `Get` / `Delete`。
3. 目录里会出现 `LOG`、`MANIFEST`、`*.ldb` 等文件——这就是「一个目录 = 一个 DB」。

Chrome IndexedDB、许多区块链节点都是这种嵌入式模型。

### 案例 2：一条 Put 在源码里怎么走

```cpp
DB::Put(key, value)
  → log_->AddRecord(...)     // 1. WAL
  → mem_->Add(...)           // 2. MemTable
// 后台：CompactMemTable → L0 SST；再 BackgroundCompaction 合并层级
```

**逐步解释**：前台只保证「日志 + 内存」成功就返回；刷盘与合并在后台。想跟源码：先 `db/memtable`，再 `db/log_writer`，然后 `table/block_builder`，最后 `db/version_set`。

### 案例 3：删除是「写墓碑」

```
Put("k1","A")   → 留下 (k1,A)
Delete("k1")    → 再写 (k1,TOMBSTONE)
Get("k1")       → 见墓碑 → NotFound；旧值仍可能占盘
// 直到 compaction 同时看到二者，才物理删掉
```

**逐步解释**：所以删一大批数据后磁盘往往不立刻变小——要等 compaction 追上。

## 踩过的坑

1. **写 stall**：L0 堆到阈值（默认约 12）减速，到约 24 直接停写等 compaction——生产经典事故。
2. **单线程 compaction**：SSD 带宽吃不满；RocksDB 第一刀就是并行合并。
3. **没有 column family**：一个实例一个 keyspace；多分隔就要多实例或手动 key 前缀。
4. **大 value**：compaction 反复重写整块，写放大与空间都难看。

## 适用 vs 不适用场景

**适用**：

- 浏览器、钱包、桌面应用等嵌入式场景，要崩溃安全 + 顺序写
- 写多读少、key 为字符串、value 通常小于 1MB
- 不需要 SQL / 二级索引 / 跨多 key 事务；或想读源码学 LSM
- 单机、单进程就能扛住的工作集，不想运维独立数据库服务

**不适用**：

- 多线程写满 SSD → [[rocksdb]]
- 要 SQL / 事务 / 二级索引 → [[sqlite]] 等
- value 极大（视频块）或要分布式 → 上层系统（如 [[tikv]]）
- 需要多 column family / 复杂 merge operator → 直接上 RocksDB

## 历史小故事（可跳过）

- **2006**：[[bigtable-2006]] 提出 SSTable，未开源独立库
- **2011**：Ghemawat 抽出 LevelDB 开源（levels of compaction）
- **2012**：Facebook fork [[rocksdb]]
- **2014**：Bitcoin Core 0.8 换用 LevelDB
- **之后**：主线提交变少，但嵌入式 KV 与教学价值仍在

名字里的 Level，指的就是 compaction 那一层层的 leveled 结构。今天读它，多半是为了把 LSM 主路径一次看完。

## 学到什么

1. **不可变 + 追加** 是面向 SSD 的第一原则；改写集中到 compaction
2. **三种放大** 是 LSM 调优三角——写 / 读 / 空间很难全赢
3. **小代码可以教一代人**——20k 行把整条链路讲完
4. **fork 树**：Bigtable SSTable → LevelDB → RocksDB，层层工程化

## 延伸阅读

- [[lsm-tree-1996]] —— LSM 思想原点
- [[rocksdb]] —— 多线程 compaction 等工程增强
- [[bigtable-2006]] —— SSTable 源头
- 源码入口：`db/memtable.h` → `db/log_writer.cc` → `table/block_builder.cc` → `db/version_set.cc`
- [[comer-1979-btree]] —— B 树对照面
- 官方仓库：[github.com/google/leveldb](https://github.com/google/leveldb)

## 关联

- [[rocksdb]] —— 从它 fork，补并行与 column family
- [[lsm-tree-1996]] —— 理论基础
- [[bigtable]] —— SSTable 概念源头
- [[sqlite]] —— 嵌入式 B 树派对照
- [[tikv]] —— 用 RocksDB 做分布式 KV 底座
- [[cassandra]] —— 分布式 LSM，思想同源
- [[bloom-filter]] —— 读路径跳过不存在 key 的过滤器

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ffs-1984]] —— FFS — 把磁盘几何写进文件系统
- [[lfs-1991]] —— LFS 1991 — 把整个磁盘当日志写
- [[projects/badger]] —— Badger — Go 写的键值分离 LSM
- [[bbolt]] —— bbolt — Go 嵌入式 B+ 树 KV
- [[pebble]] —— Pebble — CockroachDB 自研 LSM
- [[rocksdb]] —— RocksDB — 嵌入式 LSM 引擎
- [[sled]] —— sled — Rust 现代 BTree + LSM 混合嵌入式 KV
- [[sqlite]] —— SQLite — 嵌入式 SQL 数据库
- [[unqlite]] —— UnQLite — C 写的嵌入式 NoSQL 双模数据库
