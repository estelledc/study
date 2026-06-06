---
title: Pebble — CockroachDB 自研 LSM
来源: https://github.com/cockroachdb/pebble
日期: 2026-06-01
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

Pebble 是一个**用 Go 重写的嵌入式 LSM 键值引擎**，由 CockroachDB（CRDB）团队在 2018 年起步，2020 年 v20.1 上线、v20.2 成为 CRDB 的默认存储引擎。它和 [[rocksdb]] / [[leveldb]] 同源——LSM 架构、SST 文件格式、Bloom Filter——但**整个引擎是 Go 原生的**，不再走 cgo。

日常类比：之前 CRDB 像一家中国餐馆，主厨却是个只说英语的（C++ 写的 RocksDB），点菜每次都得翻译（cgo 调用），菜上得慢、菜单还经常对不上。Pebble 等于**重新培训了一位说中文的主厨**——同一套菜（LSM 算法），但厨房和前台终于讲同一种语言。

仓库 BSD-3 协议，约 5.9k stars，99.4% Go。当前最新 v2.x。

## 为什么重要

不理解 Pebble 这件事，下面几件事讲不清：

- 为什么一个能跑生产的成熟 C++ 项目（RocksDB），还会被人用 Go 重写一遍——**cgo 跨语言边界**的代价比想象大
- 为什么 CRDB 不像 [[tikv]] 那样继续用 RocksDB——**部门工程权衡**比技术理由更重
- 为什么 LSM 引擎写一遍要花两年才敢上默认——**存储层兜底数据**，bug 等于丢数据
- 为什么 Go 在系统软件领域开始啃 C++ 的传统地盘——[[etcd]]、[[badger]]、Pebble 一条线

## 核心要点

Pebble 的工作流程和 RocksDB 大同小异，但有几处**专门为 Go 和 CRDB 优化**的差异：

1. **MemTable 加反向链表**——SkipList 节点同时存正向和反向指针。CRDB 的事务回滚常做反向扫描，这一改让反向迭代和正向同速。

2. **WAL 复用**——日志文件刷完不删，改名重用，避开了 Linux 文件系统频繁创建删除的开销。

3. **L0 sublevel**——L0 层多个 SST 之间允许 key 范围重叠时再细分子层，让多个 flush 可以**同时 compaction** 而不冲突。RocksDB 的 L0 是串行队列。

4. **Delete-only compaction**——发现某个 SST 完全落在某个 range tombstone（范围删除标记）覆盖范围内，**直接物理删除整个 SST**，不读不写、不重写数据。

5. **Copy-on-write B-tree 管理元数据**——LSM 的"哪些 SST 在哪一层"这张元数据表，Pebble 用 COW B-tree，让快照和迭代器近乎零开销。

整套设计的核心权衡：**在 RocksDB 已验证的算法上，砍掉 CRDB 用不上的 90% 功能，换 Go 工具链一致性和针对性优化**。

## 相比 RocksDB 砍掉了什么

Pebble 主创 Peter Mattis 在博客里反复强调"intentionally does not aspire to include every feature in RocksDB"。砍掉的清单：

- **Column Family**——CRDB 只有一个 keyspace，不需要
- **Universal Compaction / FIFO Compaction**——CRDB 只用 leveled
- **事务层**——CRDB 自己有分布式事务，存储层不再叠
- **MemTable Bloom Filter**——实测帮助有限
- **备份 API**——CRDB 上层做物理快照

砍剩的就是**为 LSM 在 CRDB 上跑得快、不丢数据**这一目标服务。

## 实践案例

### 案例 1：cgo 的真实代价

CRDB 早期版本（< 19.x）每次读一个 key 都要：Go → cgo → C++ RocksDB → 系统调用 → 返回。**cgo 边界本身就有约 200 ns/次开销**，外加内存不能跨边界共用，每次还得 copy。

Pebble 之后这条路径变成纯 Go 函数调用，profile 显示热路径**整体提速约 25%**，pprof / runtime/trace 都能看到完整调用栈——之前在 cgo 边界就断了。

### 案例 2：用 Pebble 写一个 KV

```go
import "github.com/cockroachdb/pebble"

db, _ := pebble.Open("demo", &pebble.Options{})
defer db.Close()

db.Set([]byte("key1"), []byte("value1"), pebble.Sync)
val, closer, _ := db.Get([]byte("key1"))
defer closer.Close()
fmt.Println(string(val))

iter, _ := db.NewIter(nil)
for iter.First(); iter.Valid(); iter.Next() {
    fmt.Printf("%s = %s\n", iter.Key(), iter.Value())
}
iter.Close()
```

API 比 RocksDB 直观得多——没有 ColumnFamilyHandle、没有 ReadOptions 一堆字段，**只暴露 CRDB 真用到的旋钮**。

### 案例 3：format major version 渐进迁移

Pebble 用一个整数（当前 1 到 19）标识"磁盘上 SST 与元数据格式版本"。新版本进二进制不会自动启用——必须显式调 `db.RatchetFormatMajorVersion(N)`。

这种**显式 ratchet**让大集群可以"先全量升级二进制再滚动启用新格式"，避免新二进制写出旧二进制读不懂的文件。代价：版本号一旦升高**不可回退**。

## 踩过的坑

1. **别拿 Pebble 直接打开 RocksDB 库**——README 警告："如果用了 Pebble 不支持的 RocksDB 特性，可能静默损坏数据"。column family / 哈希表索引等都属于雷区。Pebble v2 干脆不再向后兼容 RocksDB 库。

2. **format major version 不可降级**——升错版本只能从备份恢复。生产滚动时 ratchet 一定**最后一步**。先升二进制、跑一两天、再 ratchet。

3. **没有事务层别想着上面套 sql**——Pebble 是 KV 引擎，事务隔离要么自己实现要么借 CRDB 那一套。直接拿来当通用 OLTP 后端会发现少了一大块。

4. **调优旋钮比 RocksDB 少很多**——好处是默认值接近最优，坏处是非 CRDB 场景（写少读多 / 超大单 value）调起来不如 RocksDB 灵活。

5. **iterator 不释放会卡住 compaction**——LSM 引擎的迭代器会**钉住**它打开时刻的 SST 集合，让那些 SST 不被 compaction 清理。Pebble 也一样。`defer iter.Close()` 是必须，长事务里 iterator 忘关，磁盘空间能涨到下不来。

6. **WAL fsync 模式选错差很多**——`pebble.Sync` 每次写都 fsync，安全但慢；`pebble.NoSync` 极快但崩溃丢数据。CRDB 自己在上层做 raft 日志，所以引擎层走 NoSync——别人照搬要先想清楚。

## 适用 vs 不适用场景

**适用**：

- Go 项目需要嵌入式 LSM KV，且**确定不需要事务和 column family**
- 接受跟随 CRDB 的迭代节奏（feature 改动以 CRDB 为准）
- 关心 cgo 一致性、profile 完整性

**不适用**：

- 已有 RocksDB 数据库的迁移目标——**不兼容**
- 需要事务、备份 API、TTL、universal compaction 的场景——直接用 RocksDB
- 对单机极限吞吐有苛刻要求——RocksDB C++ 版本调优天花板更高

## 历史小故事（可跳过）

- **2017**：CRDB 团队（Peter Mattis、Spencer Kimball）开始评估"是不是要自研存储引擎"
- **2018**：Pebble 仓库公开，定位明确"a RocksDB inspired key-value store written in Go"
- **2020-05**：CRDB v20.1 ship，Pebble 作为可选引擎
- **2020-11**：CRDB v20.2 默认 Pebble，老 RocksDB 引擎进入维护期
- **2021 起**：CRDB 大版本陆续移除 RocksDB 路径，Pebble 成唯一引擎

## 学到什么

1. **重写不是技术决定，是工程边界决定**——RocksDB 算法没问题，但跨语言、跨团队、跨需求三重摩擦让重写更便宜
2. **砍功能比加功能勇敢**——"我们不要 column family"是非常明确的产品决策
3. **Go 写系统软件是真在发生**——Pebble、[[etcd]]、[[badger]]、[[dgraph]] 一起把 Go 推进了存储和分布式系统底层
4. **format version 显式管理**让大集群升级安全——值得任何"磁盘格式可能演进"的项目借鉴

## 延伸阅读

- 博客：[Why we built CockroachDB on top of Pebble](https://www.cockroachlabs.com/blog/pebble-rocksdb-kv-store/)
- 博客：[Introducing Pebble: A RocksDB Inspired Key-Value Store Written in Go](https://www.cockroachlabs.com/blog/pebble-rocksdb-kv-store/)（Peter Mattis）
- 源码导读：仓库 `docs/` 目录里 `range_deletions.md` / `format_major_version.md` 两份必读
- [[rocksdb]] —— Pebble 的算法蓝本
- [[leveldb]] —— RocksDB 和 Pebble 共同的祖先

## 关联

- [[rocksdb]] —— Pebble 的算法蓝本，但 cgo 性能和迭代节奏让 CRDB 决定重写
- [[leveldb]] —— LSM 的最早工业实现，Pebble 间接继承其 SST 格式
- [[cockroachdb]] —— Pebble 的唯一一等公民用户
- [[badger]] —— 同期 Go 写的 LSM KV，Dgraph 团队，设计选择不同（value log 分离）
- [[tikv]] —— 选择继续用 RocksDB 的对照组（Rust 走 FFI 包了一层）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[badger]] —— Badger — Go 写的键值分离 LSM
- [[cockroachdb]] —— CockroachDB — 分布式 SQL 数据库
- [[dgraph]] —— Dgraph — 分布式图数据库
- [[etcd]] —— etcd — 分布式键值数据库
- [[rocksdb]] —— RocksDB — 嵌入式 LSM 引擎
- [[tikv]] —— TiKV — 分布式事务 KV

