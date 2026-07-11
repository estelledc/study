---
title: RocksDB — 嵌入式 LSM 引擎
来源: https://github.com/facebook/rocksdb
日期: 2026-05-31
分类: 数据库 / 存储引擎
难度: 中级
---

## 是什么

RocksDB 是一个**嵌入到你进程里的键值存储引擎**——不是独立服务、不监听端口，而是一个 C++ 库，你 link 进来，调 API 就能存、取、删。背后用 **LSM 树**（Log-Structured Merge）组织数据，专门为 SSD 上的高写吞吐设计。

日常类比：传统数据库像**图书馆**——书放好就不动，查的时候翻索引。LSM 像**快递分拣中心**：包裹来了先丢传送带（内存），凑够一车再送仓库（磁盘），仓库满了再合并到大仓库。**写入永远是追加，从不原地改**——这正是 SSD 喜欢的方式。

它由 Facebook 在 2012 年从 Google 的 [[leveldb]] fork 出来，主创 Dhruba Borthakur 之前是 HDFS 的作者。开源协议 GPLv2 / Apache 2.0 双授权，C++17，约 28k stars。

## 为什么重要

不理解 RocksDB，下面这些事都解释不通：

- 为什么 [[tidb]] 的 [[tikv]]、[[cockroachdb]] 早期版本、Kafka Streams、[[flink]] 状态后端都不约而同选了它——存储引擎这一层很难重新写一遍
- 为什么 Facebook 把 MySQL 的 InnoDB 换成 RocksDB（叫 MyRocks），据称服务器规模省了一半——LSM 在 SSD 上比 B+ 树更省空间和写次数
- 为什么 LSM 树这个 1996 年 O’Neil 论文里的数据结构，要等到 SSD 普及（2010 后）才真正爆发
- 为什么"调 RocksDB"成了一门手艺活——它有几百个调优旋钮

## 核心要点

RocksDB 的工作流程可以拆成 **五步**：

1. **WAL（写前日志）**——任何写入先 append 到磁盘日志文件，崩溃了能重放。这是兜底。

2. **MemTable**——同一份写入也进内存里的有序结构（默认 skip list）。读优先查这里。

3. **Flush**——MemTable 满了（默认 64MB）就冻结、刷成磁盘上的 **SST 文件**（Sorted String Table），WAL 可以丢。SST 是不可变的——一旦写下就不改。

4. **Compaction（合并压缩）**——后台线程把多个 SST 合并成更大的、分层组织（L0、L1、…、L6）。删除和覆盖在合并时才真正生效。

5. **读路径**——按"MemTable → L0 → L1 → ... → L6"顺序找，每层用 **Bloom Filter** 快速跳过不存在的 key，用 **Block Cache** 缓存解压后的数据块。

整套设计的核心权衡：**牺牲读路径变长，换写入永远顺序追加**。

## 相比 LevelDB 加了什么

LevelDB 是 RocksDB 的祖先，但它是 Google 工程师 Sanjay Ghemawat 周末项目级的实现，单线程 compaction、一个 keyspace、调优旋钮少。RocksDB 把它工程化：

- **多线程 compaction**——单线程跑不满 SSD 顺序写吞吐
- **Column Family**——一个 DB 实例多个独立 keyspace，共享 WAL 但分开 MemTable / SST。[[tikv]] 用它分 raft 日志和数据
- **Universal Compaction**——另一种合并策略，写放大低、空间放大高，适合写多读少
- **Merge Operator**——原子读-改-写。计数器场景比"读出来加一再写回去"快得多
- **事务、备份、持久化缓存、TTL**——一堆生产级特性
- **工具齐**：`db_bench` 跑基准、`ldb` 翻 DB、`sst_dump` 看单个 SST

## 实践案例

### 案例 1：迷你 PUT / GET（跟做骨架）

```cpp
rocksdb::DB* db;
rocksdb::Options options;
options.create_if_missing = true;
rocksdb::DB::Open(options, "/tmp/demo", &db);   // 1. 打开（嵌入进程，无端口）
db->Put(rocksdb::WriteOptions(), "k", "v");     // 2. 写入：先 WAL，再 MemTable
std::string v;
db->Get(rocksdb::ReadOptions(), "k", &v);       // 3. 读取：MemTable → L0 → … → L6
delete db;                                      // 4. 关闭；后台 compaction 可能仍在跑
```

**逐部分解释**：

- Open 把引擎嵌进你的进程——没有独立服务
- Put 走「WAL + MemTable」；MemTable 满（默认约 64MB）才 Flush 成 SST
- Get 按层查找；Bloom Filter 帮你跳过「肯定没有」的 SST
- 生产还会调 `write_buffer_size`、`block_cache`、compaction 策略——见踩坑

### 案例 2：[[tikv]] 怎么用 RocksDB

[[tikv]] 是 [[tidb]] 的分布式 KV 底座。每个 TiKV 节点通常跑独立的 RocksDB（或同类引擎）实例存 KV；raft 日志另有引擎/实例。数据侧用**少数固定 Column Family**（如 default / write / lock），**不是**每个 region 一个 CF——region 是同一 CF 内的 key range 分片。Raft apply 时 batch 写入 RocksDB。

### 案例 3：流处理本地状态（Kafka Streams / [[flink]]）

Kafka Streams 的窗口聚合、KTable 默认落本地 RocksDB；重启从 changelog 重建。Flink `RocksDBStateBackend` 把几十 GB keyed state 放到 TaskManager 本地，Checkpoint 时增量上传已不可变的 SST。共同点：嵌入式、无额外 Redis。
## 踩过的坑

1. **写放大**：默认 level compaction 一条数据被搬 10–30 次。SSD 寿命要算账。Universal Compaction 写放大低但空间放大可达 2 倍

2. **Write Stall（写入暂停）**：写得太快、L0 文件堆积超过阈值，RocksDB 主动减速甚至阻塞客户端写入。监控 `level0_slowdown_writes_trigger` 是必修课

3. **三块内存预算**：block cache（读热点）+ memtable（写缓冲）+ index/filter cache（每个 SST 的元数据）。新手只调 block cache，结果 OOM 是 index 爆的

4. **fsync 取舍**：`sync_writes=true` 每次写都 fsync，安全但慢一个数量级；`false` 快，但宕机丢最近写。WAL 和 SST flush 各有自己的开关

5. **Snapshot 阻塞 compaction**：长时间持有 snapshot，被它"看见"过的旧版本数据不能删，磁盘占用会涨

6. **多 column family 共享 WAL**：一个 CF 写得慢、刷不下去，整个 DB 的 WAL 都释放不了。生产里 CF 数量上限要算账

7. **Bloom Filter 假阳性**：Bloom 只保证「肯定没有」或「可能有」——误报是假阳性（多查一次磁盘），不会漏掉真有的 key。Filter 随 SST 重建；配置不当会让假阳性率升高、读放大变差

## 适用 vs 不适用场景

**适用**：

- 嵌入式持久化 KV，**单机**，对写吞吐敏感（流处理状态、本地缓存、消息队列偏移）
- 作为分布式数据库的存储层（[[tidb]] / [[cockroachdb]] / YugabyteDB / Ceph BlueStore）
- SSD 为主存储介质，机械盘也能跑但优势减半
- 工作负载偏写多读少，或读热点能进 block cache

**不适用**：

- 跨机器分布——RocksDB 不管，你得在它上面写 raft / paxos
- 频繁随机点查，且数据冷（读放大会暴露 LSM 的弱点）
- 调优意愿低、想"装上就跑"——默认值在很多负载下不优
- 需要 SQL、事务隔离级别复杂、二级索引——这些是上层的事

## 历史小故事（可跳过）

- **1996 年**：Patrick O’Neil 等人发表 *The Log-Structured Merge-Tree* 论文，但当时没人在意——B+ 树时代还没结束
- **2006 年**：Google [[bigtable]] 论文用了 SSTable + Compaction，工业首例
- **2011 年**：Google 开源 [[leveldb]]，Sanjay Ghemawat 和 Jeff Dean 抽出 BigTable 的本地存储部分
- **2012 年**：Facebook fork 出 RocksDB，目标是"在 Facebook 的 SSD 服务器上压榨硬件"
- **2015–2017 年**：[[tikv]]、CockroachDB、MyRocks 相继生产化
- **2020 年后**：CockroachDB 用 Go 重写了一份叫 Pebble，理由是"GC 友好、跨平台编译简单"，但接口仍向 RocksDB 看齐

## 三种放大：LSM 永远绕不开的话题

LSM 树有三个"放大"指标，理解它们就能看懂大部分调优文章：

- **写放大**（Write Amplification）：用户写 1 字节，磁盘实际写多少字节。compaction 反复搬，level 策略默认 10–30 倍
- **读放大**（Read Amplification）：一次读要查多少层 SST。Bloom Filter 帮你跳过大多数，但热数据落到 L6 时仍要走多层
- **空间放大**（Space Amplification）：磁盘上数据 / 用户实际数据。LSM 因为版本和墓碑（tombstone）会有 1.1–2 倍冗余

调优本质上就是在这三者之间找你负载能接受的点。Universal Compaction 牺牲空间放大换写放大；level 反过来。

## 学到什么

1. **写永远追加** 是 LSM 的灵魂——这一条让它在 SSD 时代赢过 B+ 树
2. **嵌入式 vs 服务化** 是不同的产品形态——RocksDB 选嵌入式，把网络、复制、事务这些上层操心的事剥离干净
3. **存储引擎这层难重写**——`PUT/GET/DELETE/Iterator` 接口看起来简单，正确高效实现需要十年级工程
4. **调优旋钮多 ≠ 易用**——RocksDB 把权衡都暴露给你，结果是新手用得糟、老手用得神
5. **三种放大永远在权衡**——这是 LSM 的本质约束，不是 bug

## 延伸阅读

- 官方 wiki：[RocksDB Tuning Guide](https://github.com/facebook/rocksdb/wiki/RocksDB-Tuning-Guide)
- O’Neil 等 1996 LSM 原始论文：*The Log-Structured Merge-Tree*
- 论文：*Optimizing Space Amplification in RocksDB*（CIDR 2017，Facebook 自家做的写/读/空间三角权衡分析）
- [[leveldb]] —— 直接祖先，看完它再看 RocksDB 加了哪些料
- [[tikv]] —— 在 RocksDB 上加 raft 做的分布式 KV
- [[bigtable]] —— LSM 思想的工业起点

## 关联

- [[leveldb]] —— RocksDB 直接 fork 的来源
- [[tikv]] —— 把 RocksDB 包成分布式 KV
- [[tidb]] —— TiKV 的上层 SQL 入口
- [[cockroachdb]] —— 早期用 RocksDB，后改用 Go 写的 Pebble
- [[bigtable]] —— LSM 工业化的起点
- [[flink]] —— 状态后端跑在 RocksDB 上

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[flat-datacenter-storage]] —— Flat Datacenter Storage — 把整机房磁盘当成一块大盘
- [[nvme-protocol-2017]] —— NVMe — 为 SSD 重写的存储协议
- [[projects/badger]] —— Badger — Go 写的键值分离 LSM
- [[bbolt]] —— bbolt — Go 嵌入式 B+ 树 KV
- [[doris]] —— Apache Doris — MySQL 协议 MPP OLAP 数据库
- [[leveldb]] —— LevelDB — Google LSM 库
- [[littlefs]] —— littlefs — MCU 友好的掉电安全文件系统
- [[lmdb]] —— LMDB — 内存映射 KV 库
- [[nebula]] —— NebulaGraph — 国产分布式图数据库
- [[pebble]] —— Pebble — CockroachDB 自研 LSM
- [[sled]] —— sled — Rust 现代 BTree + LSM 混合嵌入式 KV
- [[projects/starrocks]] —— StarRocks — MPP 列存数据库
- [[surrealdb]] —— SurrealDB — 一种语法吃下 SQL 图 文档 向量
- [[tidb]] —— TiDB — HTAP 分布式数据库
- [[tikv]] —— TiKV — 分布式事务 KV
- [[unqlite]] —— UnQLite — C 写的嵌入式 NoSQL 双模数据库
- [[yugabyte-db]] —— YugabyteDB — 复用 Postgres 源码的分布式 SQL
