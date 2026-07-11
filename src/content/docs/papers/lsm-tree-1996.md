---
title: LSM-Tree 1996 — 写优化存储引擎
来源: 'O''Neil et al., "The Log-Structured Merge-Tree (LSM-Tree)", Acta Informatica 1996'
日期: 2026-05-29
分类: 数据库
难度: 中级
---

## 是什么

LSM-Tree（**Log-Structured Merge-Tree**，日志结构合并树）是 1996 年 O'Neil 等人提出的一种存储引擎设计——**写入永远只做追加，读出靠后台定期合并整理**。这套思路让数据库的写吞吐量比传统 B+树高出几个数量级。

日常类比：

- [[postgresql]] 用的 B+树像**每收到一封信就立刻去文件柜找对应位置插进去**——位置准，但每次插都要翻柜子，慢
- LSM-Tree 像**先把所有信件丢进桌上的收件箱，等满了再统一归档**——写的时候只管丢，归档是后台的事

写一条数据从"找位置 + 写入"两步变成"只追加"一步，这就是 LSM 写吞吐爆炸的根本原因。

## 为什么重要

不理解 LSM-Tree，下面这些事都没法解释：

- 为什么 Google BigTable / [[cassandra]] / RocksDB / [[clickhouse]] / [[tidb]] / [[cockroachdb]] 这些"高吞吐"系统几乎全部用 LSM 风格的存储引擎（Kafka 等则是近亲：顺序日志，未必是完整 LSM）
- 为什么 NoSQL 数据库敢承诺"每秒几十万次写入"——B+树做不到这个量级
- 为什么 LSM 在 SSD / NVMe 时代优势更明显——顺序写远快于随机写
- 为什么传统关系型数据库（PostgreSQL / MySQL InnoDB）和现代分布式数据库的存储引擎是"二选一"——B+树写慢读快，LSM 写快读慢

## 核心要点

LSM-Tree 由三块拼起来：

**MemTable（内存有序表）**

新写入先放在内存里的一个有序结构（一般是跳表或红黑树）。在内存里维护"有序"很便宜，因为内存随机访问快。类比：桌上的收件箱，按字母排好。

**SSTable（硬盘上的不可变段文件）**

MemTable 满了，就把它整体刷到硬盘，变成一个 **SSTable**（Sorted String Table，有序字符串表）。一旦写到硬盘就**再也不改**——这是 LSM 的灵魂。类比：把收件箱整理成档案盒，封好放进档案室，绝不再翻开改。

**Compaction（合并）+ Bloom Filter（工程上的点查加速）**

时间一长，硬盘上会堆很多 SSTable，读一个 key 就要翻很多档案盒。所以后台有个"管理员"定期把多个 SSTable 合并成更大的——这一步叫 **Compaction**（1996 原文的核心机制）。现代实现（BigTable / LevelDB 一脉）还会给每个 SSTable 配一张 **Bloom Filter**（概率性"在不在"查询表），读的时候先问它，能跳过绝大多数不含目标 key 的档案盒。

## 实践案例

### 案例 1：写一条数据走什么路径

```
client write
  ↓
WAL log（先追加到磁盘日志，崩溃可恢复）
  ↓
MemTable（写入内存有序表，立即返回成功）
  ↓ （MemTable 满）
flush 成 SSTable（顺序写硬盘，绝不修改）
```

注意：**两次磁盘写都是顺序写**——SSD/NVMe 上顺序写比随机写快 10-100 倍。这就是为什么 LSM 写吞吐能爆炸。

### 案例 2：读一条数据走什么路径

```
client read key="foo"
  ↓
查 MemTable（命中就返回）
  ↓
查 L0 的 SSTable（先问 Bloom Filter）
  ↓
查 L1, L2, ... 的 SSTable（同样先问 Bloom Filter）
  ↓
都没有 → 返回不存在
```

读要"从上到下"翻多层档案盒，所以 LSM **读比 B+树慢**。Bloom Filter 把"明显不在的盒子"跳过，把读放大压到可接受。

### 案例 3：Compaction 两种风格

后台合并有两个主流策略：

- **Leveled Compaction**（LevelDB / RocksDB）：分 L0, L1, L2, ... 多层，每层比上一层大 10 倍。读放大小，写放大大。适合**读多写少**。
- **Tiered Compaction**（Cassandra 默认）：同一层堆多个 SSTable，攒够数量一起合并到下一层。写放大小，读放大大，空间放大也大。适合**写多读少**。

选哪种本质是"你愿意付出哪种代价"。这种 trade-off 的可调性是 LSM 在工程上能横扫 NoSQL 的原因之一。

## 踩过的坑

- **写放大**：一条数据可能在 Compaction 中被反复重写。LevelDB 实测写放大 10-30 倍。SSD 寿命被这玩意吃掉。
- **空间放大**：旧版本的 key 在被 Compaction 清理前会占额外空间。Tiered 策略下 2 倍空间放大很常见。
- **读放大**：极端情况要查 MemTable + L0 + L1 + ... + L6 共 8 个层级——所以 Bloom Filter 不是优化，是必需。
- **Compaction 抖动**：合并是后台 IO 密集任务，会和前台读写抢带宽。线上系统 P99 延迟尖刺多半是 Compaction 引起。

## 适用 vs 不适用场景

**适用**：

- 写入压倒性多于读取（日志 / 时序 / 监控数据）
- 大数据量、机械硬盘或 SSD（顺序写优势明显）
- 可以容忍读延迟稍高、能用 Bloom Filter 优化点查的场景

**不适用**：

- 读取压倒性多于写入（B+树更合适）
- 范围扫描占主导（B+树叶子节点天然有序更连贯）
- 需要严格事务语义且每个事务读写都要立刻可见——LSM 的 MVCC 实现比 B+树复杂

## 历史小故事（可跳过）

- **1996 年**：Patrick O'Neil 等四人在 Acta Informatica 发表 LSM-Tree 论文。当时几乎没人注意——磁盘还便宜，B+树够用。
- **2006 年**：Google 发表 [[bigtable]] 论文，第一次把 LSM 思路用在工业级超大规模系统上，处理 web 索引数据。LSM 一夜成名。Bloom Filter 等点查加速也是在这条工程线上标配起来的（1996 原文核心是多级滚动合并）。
- **2011 年**：Jeff Dean & Sanjay Ghemawat 开源 LevelDB——单机版 LSM 风格库，代码精简、至今是教学范本（不是 2007，也远不止「几百行」）。
- **2012 年**：Facebook 把 LevelDB fork 成 RocksDB，加多线程 Compaction、可调策略、写优先优化，成为最广泛使用的 LSM 引擎。
- **2010s 后**：[[cassandra]] / HBase / [[tidb]] / [[cockroachdb]] / [[clickhouse]] / InfluxDB 等大量现代分布式存储用 LSM 或变体；Kafka / Pulsar 等则更多是「顺序日志段」思路，和经典 MemTable→SSTable→Compaction 同族但不等同。
- **2024 年**：LSM 已是 NoSQL/NewSQL 的事实默认存储引擎之一。B+树仍统治传统 OLTP，二者长期共存。

## 学到什么

- **存储引擎是"读写权衡"的具象化**——B+树和 LSM 各占一极，没有银弹
- **顺序写 >> 随机写** 这一硬件特性塑造了整个数据库领域的演化方向
- **不可变性 + 后台合并** 是工程上常用的复杂度切割手法（不只数据库，编译器的代际 GC、Git 的对象模型也是这套）
- **理论 → 工业** 隔了 10 年（1996 论文 → 2006 BigTable），冷板凳论文不一定冷死

## 延伸阅读

- 论文 PDF：[O'Neil et al. 1996 LSM-Tree](https://www.cs.umb.edu/~poneil/lsmtree.pdf)（30 页，前 10 页讲 motivation 已够用）
- RocksDB Wiki：[Leveled Compaction](https://github.com/facebook/rocksdb/wiki/Leveled-Compaction)（工程视角的 Compaction 全解）
- 进阶综述：[Dostoevsky 论文 (SIGMOD 2018)](https://stratos.seas.harvard.edu/publications/dostoevsky-better-space-time-trade-offs-lsm-tree-based-key-value)（LSM 写/读/空间放大的统一分析框架）

## 关联

- [[bigtable]] —— 第一个工业级 LSM 系统，2006 年让 LSM 走出论文
- [[cassandra]] —— Tiered Compaction 的代表，写优化的极致
- [[clickhouse]] —— LSM 思路用于列存 OLAP，写吞吐与压缩比兼得
- [[tidb]] —— NewSQL 用 RocksDB（LSM）做单机存储 + Raft 做分布式
- [[cockroachdb]] —— 与 TiDB 类似的 NewSQL 路线，底层也是 LSM
- [[postgresql]] —— B+树阵营代表，与 LSM 形成存储引擎二选一
- [[dynamo]] —— Amazon 最终一致性 NoSQL 经典；论文存储层可插拔，后世部分实现才走 LSM
- [[chubby]] —— BigTable 的元数据依赖，间接见证 LSM 的工业化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aries-1992]] —— ARIES 1992 — 数据库崩溃后怎么把账目对回来
- [[art-2013]] —— ART 自适应基数树 — 内存数据库为主索引重新选材
- [[papers/badger]] —— BadgerDB — 把键和值分开存的 Go 原生 KV 库
- [[comer-1979-btree]] —— Comer 1979 — B-Tree 综述：为什么这棵树到处都有
- [[delta-lake-2020]] —— Delta Lake 2020 — 给对象存储补上事务日志
- [[hnsw-2018]] —— HNSW — 多层近邻图让向量检索从 O(N) 降到近似 O(log N)
- [[index-structures]] —— Learned Index Structures — 把数据库索引看成会预测位置的模型
- [[lfs-1991]] —— LFS 1991 — 把整个磁盘当日志写
- [[lmdb-2011]] —— LMDB 2011 — 把数据库直接 mmap 进内存的嵌入式 KV 存储
- [[rocksdb-2017]] —— RocksDB 2017 — 把 LSM-Tree 的"空间放大"压到极低的工业经验
- [[silt-2011]] —— SILT — 0.7 字节内存索引一条记录的 flash 键值存储
- [[skip-list-1990]] —— Skip List — 用抛硬币代替平衡树
- [[system-r-1976]] —— System R 1976 — 第一个跑起来的关系数据库
- [[tigerbeetle]] —— TigerBeetle — 只能记账但把记账做到极致的金融数据库
- [[projects/badger]] —— Badger — Go 写的键值分离 LSM
- [[leveldb]] —— LevelDB — Google LSM 库
