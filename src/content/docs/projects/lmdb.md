---
title: LMDB — 内存映射 KV 库
来源: https://github.com/LMDB/lmdb
日期: 2026-05-31
分类: 数据库 / 存储引擎
难度: 中级
---

## 是什么

LMDB（Lightning Memory-Mapped Database）是一个**嵌入式键值库**——和 [[leveldb]] / [[sqlite]] 一样，它是一个 link 进你进程的 C 库，不是一个要起服务的数据库。它由 Howard Chu 在 2011 年为 **OpenLDAP** 项目重写存储后端时发明，原本是替掉 Berkeley DB（BDB），后来反向输出成独立项目。

日常类比：把整本书直接平摊在桌面上——每一页都摊开你随手就能读，不需要"借出归还"流程。LMDB 就是把整个数据库文件 **mmap** 进进程地址空间，让操作系统的页缓存接管所有 I/O。读 value 时返回的是 mmap 区域里的指针，**零拷贝、零系统调用**。

代码规模约 10k 行 C，OpenLDAP Public License（BSD-style），约 3k stars。它**没有 WAL、没有后台线程、没有 compaction**——把数据库写到只剩"必要的那部分"就是它的全部美学。

## 为什么重要

不理解 LMDB，下面这些事都讲不清：

- 为什么 OpenLDAP / Monero / Caddy / Cilium / Postfix 都选了它——读极快、嵌入式、运维零负担
- 为什么 Go 生态的 BoltDB / bbolt 几乎照抄 LMDB 设计——单写多读 + B+ 树 + mmap 是个被验证过的组合
- 为什么读 LMDB 源码常被推荐——10k 行 C 把 ACID + MVCC + 崩溃安全做完，密度极高
- 为什么 LSM 派（[[leveldb]] / [[rocksdb]]）和 B+ 树派（LMDB / SQLite）会长期共存——它们解决的是**不同侧重的工作负载**

## 核心要点

LMDB 的设计可以拆成 **四个支柱**：

1. **B+ 树原地存储**——所有 key/value 都存在 B+ 树节点里。读路径就是一次 B+ 树查找，最多几次内存访问。

2. **整库 mmap**——`mdb_env_open` 时把整个 data.mdb 文件 mmap 进进程地址空间。读 value 不复制，OS 页缓存自动管冷热。

3. **Copy-on-Write 实现 MVCC**——写事务要改某一页时，**复制**那页（以及它在 B+ 树路径上的所有父节点），改完最后**原子地换 root 指针**。读者拿着旧 root 继续读旧版本，互不打扰。

4. **单写多读**——写事务全局串行，一次只能有一个；读事务任意并发，**完全不阻塞写**。这是它能不要 WAL 的关键。

整套设计的核心权衡：**牺牲写并发，换读路径极短 + 实现极简 + 崩溃零恢复**。

## 没有 WAL 怎么做到崩溃安全

传统数据库（PostgreSQL / SQLite WAL 模式 / [[leveldb]]）都有写前日志：先写日志再改数据，崩溃后重放日志。LMDB 完全跳过了这一步，秘诀在于 **double meta page**：

- 数据库文件最前面有**两个 meta 页**，各自记录一个 root 指针 + 事务 id（txnid）
- 写事务结束时，先把所有 COW 出来的新页 fsync 到磁盘，**然后**才更新 meta 页之一（txnid 加 1）
- 启动时挑两个 meta 页里 **txnid 较大且校验通过**的那个作为当前根
- 如果崩溃发生在 meta 页更新前——新页没人引用，自动作废
- 如果崩溃发生在 meta 页更新后——新版本完整可用

这套机制叫 **shadow paging**，思想来自 1980 年代但在 LMDB 上做到了产品级。代价：写事务必须 fsync 两次（一次数据页、一次 meta 页）。

## 单写多读为什么不需要锁

LMDB 的并发模型干净得反直觉：

- **写者只有一个**——靠文件锁（flock / fcntl）串行化，根本没有写写冲突
- **读者拿着旧快照**——读事务开始时记下当前 txnid，整个事务期间只看这个版本的页；新写者 COW 出的新页对它不可见
- **读者怎么告诉写者"我还在用旧页"**——lock.mdb 里有一张**读者表**，每个读事务进来登记自己的 txnid，离开时清掉
- **写者什么时候能回收旧页**——写事务结束时扫读者表，找出**最老活读者的 txnid**，比这更老的旧页就能回收进 free list

整套机制叫 **MVCC（多版本并发控制）**，但 LMDB 用 COW + 读者表实现，不需要传统 MVCC 的版本链。读者**没有任何锁、没有任何原子操作**，性能极高。

## 实践案例

### 案例 1：OpenLDAP 的性能跃迁

LMDB 诞生的直接动机是 OpenLDAP 主存储引擎太慢。2012 年切换到 LMDB 后：

- 读吞吐 **5~20 倍**提升（mmap + 零拷贝直击 BDB 痛点）
- 代码量从 BDB 的 ~100k 行降到 LMDB 的 ~10k 行
- 配置项从几十个降到三五个（mapsize、maxreaders、maxdbs）

这件事直接证明了"**砍掉缓存层 + 砍掉 WAL**"在读多场景下的巨大胜利。

### 案例 2：Caddy 的证书库

Caddy 是流行的 HTTPS 反向代理，自动管理 Let’s Encrypt 证书。它把证书、challenge、账户信息全存在 LMDB 里：

- 单个 Caddy 进程嵌入读 → mmap 直读，零延迟
- 重启即用，没有 WAL replay
- 证书数据天然读多写少（签发是低频事件）

### 案例 3：用 mapsize 翻车

```c
mdb_env_set_mapsize(env, 10 * 1024 * 1024); /* 10MB */
```

LMDB 要求**预先指定**数据库最大体积，超过会返回 `MDB_MAP_FULL`。新人常踩：

- 设小了 → 数据塞满立刻挂
- 设大了（比如 1TB）→ 大多数 OS 没事（mmap 是惰性的），但 32 位系统直接虚拟地址用爆
- 改 mapsize 必须**所有进程都关掉**才能生效

经验值：业务上限的 2~5 倍。

## 对比 LSM 派（LevelDB / RocksDB）

| 维度 | LMDB（B+ 树 + COW） | [[leveldb]] / [[rocksdb]]（LSM） |
|---|---|---|
| 读路径 | 1 次 B+ 树查找，零拷贝 | 多层 SST 扫描 + bloom filter |
| 写并发 | 单写者串行 | 多 writer 可并行（RocksDB） |
| 写放大 | 1×（COW 同页改 1 次） | 10× 起（多层 compaction） |
| 空间放大 | 1×~1.5× | 1.1×~2× |
| 崩溃恢复 | 0 秒，无 replay | 需要 replay WAL |
| 后台线程 | 无 | compaction 线程 |
| 代码量 | ~10k 行 C | ~20k 行 C++（LevelDB） |
| 适合 | 读多写少 / 嵌入式 | 写密集 / 大数据量 |

口诀：**LMDB 偏读、LSM 偏写**。如果你的负载读写比 > 10:1，LMDB 几乎一定赢；反过来 LSM 赢。

## 踩过的坑

1. **mapsize 一旦设小就升级痛苦**——所有持有该 env 的进程必须全部关闭才能 `mdb_env_set_mapsize` 重设。生产环境很难做到。

2. **长事务 = 空间不回收**——一个开了几小时的读事务会让写者**所有这段时间内的旧页都回收不掉**，磁盘膨胀。监控读者表里最老 txnid 是必须的。

3. **写并发是硬上限**——单写者意味着写吞吐就是单核 fsync 的速度，几千 ops/s 量级。要写并发请用 [[rocksdb]] 或 SQLite WAL 模式。

4. **value 指针生命周期**——读返回的 value 指向 mmap 区域，**事务一结束指针就失效**。复制出去用，否则 use-after-free。

5. **不能用在网络文件系统**——mmap + flock 在 NFS 上行为未定义，必须本地磁盘。

## 适用 vs 不适用场景

**适用**：
- 读多写少的嵌入式场景（目录服务、证书库、配置仓）
- 需要极低延迟读、不能容忍 GC 抖动的场景
- 嵌入式系统、代码要小、不要后台线程
- 数据规模可预估、不会无限增长

**不适用**：
- 写并发高的工作负载（消息队列、事件流、写密集分析）
- 数据量上限不可知的场景（mapsize 难定）
- 需要分布式（LMDB 是单机嵌入库；要分布式看 [[rocksdb]] + 上层协议）
- 网络文件系统部署

## 历史小故事（可跳过）

- **2011 年**：Howard Chu 在 OpenLDAP 邮件列表里发起重写存储后端的提议——原因是 BDB 又一次崩溃。
- **2012 年**：LMDB 替换 OpenLDAP slapd 的 BDB 后端，性能跃迁，事件被 LWN.net 报道。
- **2013-2015 年**：Bitcoin Core 试用过 LMDB 替 [[leveldb]]，最终因生态原因（编译复杂度、跨平台问题）回退。
- **2014 年**：Ben Johnson 用 Go 重新实现 LMDB，发布 BoltDB；后来 etcd 团队 fork 成 bbolt，成为 etcd 的存储底座。
- **至今**：Symas Corporation（Howard Chu 的公司）仍在维护，提供商业支持。

## 学到什么

1. **mmap 是个被低估的武器**——把页缓存外包给 OS，少写 10k 行代码、少一份 dirty page 管理
2. **COW + double meta page = 不要 WAL**——崩溃恢复 0 秒，启动即用
3. **单写多读是个**好**的简化**——读多场景下并发没损失，代码量直接砍半
4. **B+ 树 + LSM 不是谁淘汰谁**——它们解决的是不同侧重的工作负载，会长期共存

## 延伸阅读

- 演讲：[Howard Chu — LMDB at OpenLDAP Conference 2011](https://www.openldap.org/doc/admin24/)（设计动机第一手）
- 博客：[Symas — LMDB Technical Description](http://www.lmdb.tech/doc/)（API + 内部数据结构）
- BoltDB README：[boltdb/bolt](https://github.com/boltdb/bolt)（Go 重写版，文档比 LMDB 友好）
- 论文：[MDB: A Memory-Mapped Database and Backend for OpenLDAP](https://www.openldap.org/pub/hyc/mdb-paper.pdf)
- [[leveldb]] —— 同年代的对照组，LSM 派的 B+ 树对面
- [[sqlite]] —— 同样嵌入式但用 B 树 + WAL 模式

## 关联

- [[leveldb]] —— LSM 阵营的代表，写并发好、读放大高
- [[rocksdb]] —— LevelDB 的 Facebook 加强版，企业级 LSM
- [[sqlite]] —— 同样嵌入式 B 树，但有 SQL 层 + WAL 模式
- [[redis]] —— 也是单线程主写者，但完全在内存，持久化靠 RDB/AOF
