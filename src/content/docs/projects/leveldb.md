---
title: LevelDB — Google LSM 库
来源: https://github.com/google/leveldb
日期: 2026-05-31
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

LevelDB 是一个**嵌入式键值存储库**——你把它当成 C++ 库 link 到自己进程里，而不是连接一个数据库服务。它由 Google 的 Sanjay Ghemawat 和 Jeff Dean 在 2011 年开源，把 Bigtable 论文里的 SSTable 设计抽出来做成独立库。

日常类比：传统数据库像一个**有索引卡的资料柜**——你每改一条都要找到原位置覆盖。LevelDB 像**快递分拣站**：包裹来了先扔传送带（内存），凑够一车再压成一个**封口的盒子**送进仓库（磁盘 SST 文件）。盒子从不撕开，只有当仓库太乱时后台工人把几个旧盒子拆开重打成一个新盒子——这一步叫 **compaction**。

代码规模约 20k 行 C++，BSD 3-Clause 协议，约 36k stars。后续 Facebook 在 2012 年从它 fork 出 [[rocksdb]]——所以读 LevelDB 等于读所有 LSM 引擎的祖父。

## 为什么重要

不理解 LevelDB，下面这些事都讲不清：

- 为什么 Chrome 浏览器的 IndexedDB、比特币核心钱包、go-ethereum 区块链节点都不约而同选了它——嵌入式 + 无服务化运维 + 顺序写
- 为什么 LSM 树这个 1996 年 [[lsm-tree-1996]] 论文里的结构要等到 SSD 普及（2010 后）才真正爆发——SSD 喜欢顺序写，怕原地改写
- 为什么"读 LevelDB 源码"成了存储工程师的入门修行——它把整个 LSM 流程压在 20k 行内，没有 RocksDB 那几百个调优旋钮
- 为什么[[rocksdb]] 文档常说"我们解决了 LevelDB 的 X 问题"——单线程 compaction、单 keyspace 等限制都是它

## 核心要点

LevelDB 的写入路径分 **五步**：

1. **WAL（写前日志）**——任何 `Put` 先 append 到磁盘上的日志文件，崩溃了能重放。这是兜底。

2. **MemTable**——同一份写入也进内存里的有序结构（**skip list**，跳表）。读优先查这里。

3. **Flush**——MemTable 满了（默认 4MB）就冻结，刷成磁盘上的 **SST 文件**（Sorted String Table），WAL 可以丢。SST 文件不可变——一旦写下就不改。

4. **Compaction（合并压缩）**——后台线程按 **leveled** 策略合并：L0 文件之间允许 key 范围重叠（因为是直接从 MemTable 落下），L1~L6 内部不重叠，每层比上层大 10 倍。删除和覆盖在这一步才真正生效。

5. **读路径**——按"MemTable → L0 全部文件 → L1~L6 各一个 SST"顺序找，每层用 **bloom filter** 快速跳过不存在的 key，**block cache** 缓存解压后的数据块。

整套设计的核心权衡：**牺牲读路径变长，换写入永远顺序追加**。

## 三种放大（LSM 必须理解的概念）

LSM 派系绕不开这三个词，LevelDB 是体会它们最干净的样本：

- **写放大（write amplification）**——你写 1 字节，磁盘实际写了 10 字节。一个 key 从 MemTable 到 L6 可能被 compaction 写 10 次。
- **读放大（read amplification）**——你读 1 个 key，磁盘实际可能查 10 个文件。最坏情况是 MemTable + L0 多文件 + L1~L6 每层一个。
- **空间放大（space amplification）**——你逻辑上有 1GB 数据，磁盘可能占 1.5GB。原因：删除是写一个**墓碑（tombstone）标记**，compaction 才真删；旧版本同样要等合并。

LevelDB 的 leveled compaction 在三者之间偏向**空间放大小、读放大可控、写放大略大**。具体的数学：每层比上层大 10 倍的设计意味着一个 key 平均经历 `log10(总大小/MemTable大小)` 次 compaction，对 10GB 库约 4 次，对 1TB 库约 6 次。

## SSTable 文件长什么样

SST 文件是 LevelDB 的磁盘原子单位，结构非常清晰：

```
[ Data Block 1 ] [ Data Block 2 ] ... [ Data Block N ]
[ Filter Block (bloom) ]
[ Meta Index Block ]
[ Index Block ] (每个 Data Block 的最大 key + offset)
[ Footer ] (固定 48 字节，指向 Meta Index 和 Index)
```

读一个 key 的流程：先读 Footer（固定位置）→ 读 Index Block → 二分找到对应 Data Block 的 offset → 读 Data Block 找 key。bloom filter 用来在读 Data Block 之前快速判断"这个 key 一定不在" → 直接跳过。这套设计也被 [[rocksdb]] 几乎原封继承。

## 实践案例

### 案例 1：Chrome IndexedDB 用它存什么

打开 Chrome 任意网页，按 F12 → Application → IndexedDB，背后存储引擎就是 LevelDB。一份单机库，一个数据库一个目录，崩溃恢复靠 WAL。Chrome 不需要"分布式"，只需要"嵌入式 + 崩溃安全 + 顺序写省 SSD 寿命"——LevelDB 完美命中。

### 案例 2：写一条记录在源码里走的路（简化）

```cpp
DB::Put(key, value)
  → WriteBatch::Put(key, value)
  → log_->AddRecord(...)        // 第 1 步：写 WAL
  → mem_->Add(seq, kTypeValue, key, value)  // 第 2 步：进 MemTable
  // 返回成功
// 后台线程：
DBImpl::CompactMemTable()
  → WriteLevel0Table(mem)       // 第 3 步：MemTable 刷盘成 L0 SST
DBImpl::BackgroundCompaction()
  → DoCompactionWork(...)       // 第 4 步：选两层文件合并
```

四步拆下来源码 4 个文件读完，整条链路就通了——这是它教科书价值的核心。

### 案例 3：删除如何在 LSM 里"伪删"

```
Put("k1", "A")    // L0 写入 (k1, A)
Delete("k1")      // L0 写入 (k1, TOMBSTONE)
Get("k1")         // 读到墓碑 → 返回 NotFound
                  // 但磁盘上 (k1, A) 还在
// compaction 跑到 (k1, A) 和 (k1, TOMBSTONE) 同时出现 → 才真删
```

理解这一点能解释为什么删大量数据后磁盘没立刻变小，必须等 compaction。

## 踩过的坑

1. **写 stall**——L0 文件堆积到阈值（默认 12 个）会触发"减速"，到 24 个直接**停写等 compaction**。生产事故经典原因。
2. **单线程 compaction**——一个 SSD 顺序写带宽 500MB/s，单线程合并跑不满。这是 [[rocksdb]] 改进的第一刀。
3. **没有 column family**——一个 LevelDB 实例只能一个 keyspace。想分多个用途要么开多个实例（多份 WAL），要么手动 prefix key。
4. **Snappy 解压在读路径**——block cache 里默认是解压后的数据，但跨进程共享会重复解压；调优要看 `Cache::Insert` 的 charge 计算。

## 适用 vs 不适用场景

**适用**：

- 嵌入式场景（浏览器、区块链节点、桌面应用）需要顺序写 + 崩溃安全
- 写多读少 + key 是字符串 + value 不大（< 1MB）
- 不需要 SQL、不需要二级索引、不需要事务跨多 key
- 想读源码学 LSM 实现——这是最薄的版本

**不适用**：

- 多线程高并发写满 SSD → 选 [[rocksdb]]
- 需要事务 / 二级索引 / SQL → 选 [[sqlite]] 或上层加 [[tidb]]
- value 极大（视频片段）→ LSM compaction 重写代价高
- 需要分布式 → 上层包一层 [[cockroachdb]] / [[tikv]]

## 历史小故事（可跳过）

- **2006**——Bigtable 论文（[[bigtable-2006]]）发表，里面提了 SSTable 概念但没开源代码
- **2011**——Sanjay Ghemawat 周末项目把 SSTable 提取出来开源，叫 LevelDB（"levels of compaction"）
- **2012**——Facebook fork 出 [[rocksdb]]，加多线程 compaction、column family、merge operator 等
- **2014**——Bitcoin Core 0.8 把存储引擎换成 LevelDB
- **2015**——Chrome IndexedDB 默认用它
- **至今**——主线代码近年提交频率降低，但生态仍活——每个区块链客户端、每个嵌入式 KV 场景都还在用

## 学到什么

1. **不可变 + 追加** 是面向 SSD 的存储设计第一原则——原地改写是 B+ 树的世界，LSM 把改写挪到 compaction 集中做
2. **三种放大** 是 LSM 调优的三角——你只能在写、读、空间里选两个偏向
3. **小代码 ≠ 不重要**——20k 行的 LevelDB 教会一代存储工程师 LSM，工程价值不在行数
4. **fork 树**——RocksDB → LevelDB → Bigtable SSTable，每一层在前一层基础上加工程化

## 延伸阅读

- 论文：[[lsm-tree-1996]] —— 1996 O Neil 论文，LSM 思想原点
- 项目：[[rocksdb]] —— Facebook fork，多线程 compaction
- 项目：[[bigtable]] / [[bigtable-2006]] —— SSTable 的源头
- 学习路径：先读 `db/memtable.h` → `db/log_writer.cc` → `table/block_builder.cc` → `db/version_set.cc`，4 个文件覆盖核心
- 论文：[[comer-1979-btree]] —— B 树（LSM 的对照面）

## 关联

- [[rocksdb]] —— Facebook 从它 fork，多线程 + column family
- [[lsm-tree-1996]] —— LevelDB 实现的理论基础
- [[bigtable]] —— SSTable 概念的源头（同一批 Google 作者）
- [[sqlite]] —— 嵌入式数据库的 B 树派代表，对照面
- [[cassandra]] —— 分布式 LSM 数据库，思想同源
- [[tikv]] —— 用 RocksDB（LevelDB 后裔）做底层的分布式 KV
