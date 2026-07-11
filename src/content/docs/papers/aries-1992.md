---
title: ARIES 1992 — 数据库崩溃后怎么把账目对回来
来源: 'C. Mohan et al., "ARIES: A Transaction Recovery Method Supporting Fine-Granularity Locking and Partial Rollbacks Using Write-Ahead Logging", ACM TODS 1992'
日期: 2026-05-30
分类: databases
难度: 高级
---

## 是什么

ARIES 是一套**数据库崩溃恢复算法**，核心问题是：机器突然断电的瞬间，磁盘里同时存在已 commit 的修改、没 commit 的脏数据、还有半截的日志，重启后怎么把数据库对回到一个一致状态？日常类比：像银行夜里出纳记账记到一半突然停电，第二天上班要根据流水账本（log）一条条复盘，把"已经盖章的"补上、"没盖章的"撤销，且不能多撤一笔。

ARIES 的中文意思是 "**A**lgorithms for **R**ecovery and **I**solation **E**xploiting **S**emantics"。它给数据库引擎规定了三件事：(1) 任何修改先写日志再改数据页（**WAL**，Write-Ahead Logging）；(2) 崩溃后**先把历史完整重放一遍**（包括那些没 commit 的事务也重放），再反向回滚没 commit 的；(3) 反向回滚的每一步**也要记日志**（叫 CLR），这样恢复中再崩溃也不会重复回滚。

这三条加起来，成为 DB2、SQL Server、InnoDB 等数据库恢复设计的事实底座；PostgreSQL 也借鉴 WAL、LSN、checkpoint 这些思想，只是在 MVCC 下不做完整的 ARIES Undo 阶段。

## 为什么重要

不理解 ARIES，下面这些事都没法解释：

- 为什么 PostgreSQL 配置文件里有 `wal_level` / `checkpoint_timeout` / `max_wal_size`——这些参数都是 ARIES 三阶段算法的旋钮
- 为什么 MySQL 的 redo log 和 undo log 是两份不同文件，而不是合并成一份
- 为什么数据库重启不是把整个磁盘扫一遍，而是几秒就 ready —— 因为只重放上次 checkpoint 之后的 log
- 为什么 fine-granularity locking（行级锁）需要 ARIES 才能稳——粗粒度（页级）锁的旧算法在恢复时会把不该回滚的别人改动也回滚了

## 核心要点

ARIES 的恢复逻辑可以拆成 **三阶段**：

1. **Analysis（分析）**：从最近一次 checkpoint 向前扫日志，重建两张内存表 —— 活跃事务表（哪些事务崩溃时还没 commit）和脏页表（哪些数据页崩溃时还没刷到磁盘）。类比：先把昨晚的流水账本翻一遍，搞清楚哪些客户的交易没结清、哪些账页还没誊抄到总账。

2. **Redo（重做）**：从脏页表里最早可能未刷盘的位置（RecLSN）开始，**把所有日志重放一遍**——包括最终被 abort 的事务的修改也重放。这一步叫 **Repeating History**。重放完后，数据库状态等同于崩溃瞬间。

3. **Undo（撤销）**：从活跃事务表里所有 loser 事务的最后一条日志反向追，每撤销一步就写一条 **CLR**（Compensation Log Record，补偿日志）。CLR 的指针指向"下一个还要 undo 的位置"，所以恢复中再崩溃，重启后能接着上次断点继续 undo，不会重复。

每条日志都有一个单调递增的 **LSN**（Log Sequence Number），数据页头也存"最后改我的那条日志的 LSN"，这样 Redo 时能判断"这条日志的修改我已经在磁盘上了吗"，避免重复 redo。

## 实践案例

### 案例 1：用 Python 模拟 WAL 的最小约束

```python
import os
log = open("wal.log", "a")
data = {}  # 模拟数据页

def update(key, value):
    log.write(f"SET {key} {value}\n")
    log.flush(); os.fsync(log.fileno())   # 关键：log 必须先落盘
    data[key] = value                      # 然后才能改数据
```

**逐部分解释**：

- `log.flush() + fsync` 强制日志写到磁盘 —— 这就是 "Write-Ahead"
- `data[key] = value` 是改"数据页"，必须在 log 落盘之后
- 如果调换顺序：数据先改、log 后写，崩溃时数据页可能落盘了但 log 没写，重启就不知道这条修改是已 commit 还是脏数据
- 真实数据库里 data 也会异步刷盘，但 WAL 的顺序约束**永远不能违反**

### 案例 2：CLR 防止重复 undo

事务 T1 做了 3 步：插入 A、插入 B、插入 C。然后被 abort，恢复算法开始 undo。

```
日志:  100 INSERT A | 110 INSERT B | 120 INSERT C | 130 ABORT T1
       140 CLR(undo C, 下一个=110)   <-- undo 到一半崩溃 ---
       (重启) Analysis 看到 CLR 140，知道 C 已经 undone，下次从 110 接着 undo
```

**逐部分解释**：

- 没 CLR 的旧算法：重启后看到 T1 没 commit，把 100/110/120 全 undo 一遍 —— 但 C 已经 undone 一次了，重复
- ARIES：写 CLR 时记录 "我撤销的是 120，下一个要撤销的是 110"。重启后 Analysis 顺着 CLR 链就能找到正确续点
- CLR 本身只能 redo，不能 undo —— 所以崩溃多少次都不会乱

### 案例 3：PostgreSQL 里的 ARIES 影子

```bash
$ ls $PGDATA/pg_wal/
000000010000000000000001  000000010000000000000002  ...
$ pg_waldump 000000010000000000000001 | head -3
rmgr: Heap   len: 89, tx: 743, lsn: 0/01510020, prev 0/01510000
       desc: INSERT off 1 flags 0x00, blkref #0: rel 1663/13412/16384 blk 0
```

**逐部分解释**：

- `pg_wal/` 目录里的段文件承载 WAL 记录，能看到 ARIES 论文里 LSN / prevLSN 这类影子
- 每条日志的 `lsn` / `prev` 字段对应论文里的 LSN 和 prevLSN —— 同一事务的日志靠这条链串起来
- `checkpoint_timeout` = ARIES 的 fuzzy checkpoint 间隔；`max_wal_size` 触发提前 checkpoint
- 崩溃恢复时 PostgreSQL 更接近 "分析起点 + redo" 的工程化变体；未提交事务的可见性由 MVCC / clog 信息处理，不是论文原版的显式 Undo

## 踩过的坑

1. **把 WAL 理解成"日志比数据写得快所以先写"**：错。WAL 的本质是顺序约束，log 必须先 fsync 完成，才允许对应数据页落盘。两者哪个更快无关，关键是顺序不能反。
2. **以为 Redo 只重做 commit 事务、Undo 才处理 loser**：实际相反。ARIES Redo 阶段把所有日志（含 loser）重放一遍，恢复到崩溃瞬间，然后 Undo 才反向回滚 loser。这样行级锁记录才能正确对应。
3. **实现 Undo 不写 CLR**：恢复中如果再崩溃，下次 Redo 不知道哪些 undo 已做，会把已经 undone 的修改再 undo 一次，数据被多撤一笔。CLR 是 redo-only 且带 UndoNxtLSN 指针，让 undo 可断点续传。
4. **检查点设计成停业务**：旧算法的 quiesce checkpoint 要等所有事务结束才能写 checkpoint，吞吐暴跌。ARIES 用 fuzzy checkpoint，只快照活跃事务表 + 脏页表，业务不停，代价是 Analysis 起点要从 checkpoint begin 而不是 end。

## 适用 vs 不适用场景

**适用**：

- 关系型数据库的崩溃恢复（DB2 / SQL Server / PostgreSQL / MySQL InnoDB 都用 ARIES 思想）
- 需要细粒度（行级）锁 + 部分回滚（savepoint）的事务系统
- 需要在 TB 级数据上做"重启秒级 ready"的工业级 OLTP
- 有稳定存储（如 SSD + fsync）保证 log 一旦写入就不丢的环境

**不适用**：

- 日志型存储（[[lsm-tree-1996]] / [[kafka]]）—— 它们追加为主，几乎不需要 undo
- 只读分析型仓库 —— 没事务就不需要 ARIES，直接 snapshot 即可
- 分布式数据库的跨节点提交 —— ARIES 解的是单节点恢复，跨节点要叠 [[lamport-1978]] 的 logical clock + 2PC，再升级到 [[spanner]] / [[calvin]]
- 内存数据库（Redis 单机）—— 用 RDB snapshot + AOF 已够，不必上完整 ARIES

## 历史小故事（可跳过）

- **1976**：[[eswaran-1976]] 在 IBM System R 提出 predicate locks 和事务一致性概念，但恢复算法还是 page-level shadow paging。
- **1981**：Jim Gray 在 [[gray-1981-transaction]] 把 redo / undo / checkpoint 概念体系化，但还没法同时支持细粒度锁和部分回滚。
- **1983-1989**：C. Mohan 在 IBM Almaden 主导 R* / Starburst / DB2 的恢复模块，踩遍各种坑。
- **1992**：Mohan、Haderle、Lindsay、Pirahesh、Schwarz 把工程经验沉淀成 ARIES 论文，发表于 ACM TODS。
- **1995-2000**：DB2 / SQL Server / Sybase / Informix 全部转向 ARIES 风格；后来 PostgreSQL 8.0 / MySQL InnoDB 也走同一路线。

ARIES 后来获 SIGMOD Test-of-Time 奖，被誉为"数据库恢复算法的事实标准"。

## 学到什么

1. **WAL 不是性能优化，是顺序约束**——它定义"什么先于什么落盘"，性能是副产物
2. **Repeating History 反直觉但正确**——先把崩溃瞬间状态完整复原，再回滚，是为了让细粒度锁和部分回滚正确
3. **Compensation Log Record 是恢复算法里"防止重做撤销"的通用模式**——这个思想后来被借到分布式事务、saga 模式
4. **二十年的工程教训才能浓缩出 30 页论文**——ARIES 不是从理论推出来的，是从 IBM 数据库踩坑里攒出来的

## 延伸阅读

- 论文 PDF：[ARIES 原文](https://www.csd.uoc.gr/~hy460/pdf/p94-mohan.pdf)（70 页，密度极高，重点读 Section 3 三阶段算法）
- 视频：[CMU 15-445 Lecture 21 — Database Recovery](https://www.youtube.com/watch?v=zHkOk7snAII)（Andy Pavlo 讲 ARIES，1 小时把核心讲清楚）
- 教材：Ramakrishnan & Gehrke《Database Management Systems》第 16 章（用例子拆 ARIES）
- 工具：`pg_waldump`（PostgreSQL）、`mysqlbinlog`（MySQL）—— 把日志 dump 出来读
- [[gray-1981-transaction]] —— ARIES 的概念前身
- [[system-r-1976]] —— ARIES 实现源头的 IBM 数据库

## 关联

- [[gray-1981-transaction]] —— 把 redo / undo / checkpoint 概念体系化，ARIES 在它之上实现
- [[eswaran-1976]] —— 提出 predicate locks 与事务一致性，ARIES 的并发控制基础
- [[bernstein-1981-cc]] —— 并发控制综述，ARIES 与 2PL 配合工作
- [[system-r-1976]] —— IBM System R 是 ARIES 的工程土壤
- [[b-tree-1972]] —— ARIES 在 B-Tree 索引上的细粒度恢复处理（论文 Section 8 专讲）
- [[lsm-tree-1996]] —— LSM 用 immutable + compaction 替代 ARIES 的 in-place update + log
- [[spanner]] —— 分布式 OLTP，单节点恢复仍走 ARIES，跨节点叠 Paxos
- [[foundationdb]] —— 用 ARIES 思路 + 分布式事务，但日志结构更接近 LSM

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[b-tree-1972]] —— B-Tree 1972 — 磁盘友好的索引结构
- [[bayou-1995]] —— Bayou — 离线先改本地，再回来和别人合并
- [[berenson-1995-isolation]] —— ANSI SQL 隔离级别批判 — 教科书的隔离定义其实有漏洞
- [[bernstein-1981-cc]] —— Bernstein 1981 并发控制综述 — 把分布式数据库的 20+ 算法整成两条主线
- [[btrfs-2013]] —— Btrfs — Linux 上"写时复制 B-tree"的工业级文件系统
- [[cascades-1995]] —— Cascades 1995 — 用规则 + Memo 拼装一个可扩展查询优化器
- [[cstore-2005]] —— C-Store — 把数据按列存，分析查询直接快十倍
- [[eros-1999]] —— EROS — 让 capability 内核跑得跟 Linux 一样快
- [[eswaran-1976]] —— Eswaran 1976 — 串行化与谓词锁的源头
- [[f1-2013]] —— F1 2013 — 把 Spanner 包成 SQL，扛起 AdWords 全部账单
- [[gray-1978-notes]] —— Gray 1978 — 数据库操作系统讲义，事务/2PL/2PC/恢复一次讲完
- [[gray-1981-transaction]] —— Gray 1981 — 把"事务"提升为通用抽象
- [[lamport-1978]] —— Lamport 1978 — 分布式系统里没有"绝对的同时"
- [[lmdb-2011]] —— LMDB 2011 — 把数据库直接 mmap 进内存的嵌入式 KV 存储
- [[lsm-tree-1996]] —— LSM-Tree 1996 — 写优化存储引擎
- [[mariadb-server]] —— mariadb-server — MySQL 原作者带走的那一支
- [[mcs-locks-1991]] —— MCS 锁 — 让每个线程自旋在自己的缓存行上
- [[megastore-2011]] —— Megastore — 把数据切成"小数据库"换跨地域同步复制
- [[moesi-cache-coherence-1986]] —— Sweazey-Smith MOESI 1986 — 给多核 CPU 一份"谁手里有这块内存"的统一规则
- [[mysql-server]] —— mysql-server — 一个仓库装下整套 OLTP 引擎
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[percolator-2010]] —— Percolator 2010 — 给 Bigtable 加分布式事务的客户端库
- [[persistent-memory-2014]] —— PMFS — 第一个为字节寻址持久内存设计的文件系统
- [[presumed-abort-1986]] —— Presumed Abort/Commit — 让 2PC 少写日志少发消息的两个默认共识
- [[rocksdb-lsm]] —— LSM-tree 与 RocksDB — 把所有写都变成顺序写
- [[saga-1987]] —— Sagas — 长事务拆成一串能"反向走回去"的小事务
- [[sinfonia-2007]] —— Sinfonia 2007 — 把分布式协议降级成数据结构操作
- [[skip-locked-postgres-9.5]] —— SKIP LOCKED — 让 Postgres 当任务队列用
- [[slab-1994]] —— Slab Allocator 1994 — 内核按对象类型开缓存，不是按字节切
- [[smr-1990]] —— SMR 1990 — 把"容错服务"还原成"多副本一起跑同一台状态机"
- [[soft-updates-1999]] —— Soft Updates — 不写 journal 也能保证文件系统元数据一致
- [[spanner]] —— Spanner — 全球分布式 SQL 数据库
- [[sqlite-2022]] —— SQLite — 嵌入式数据库 30 年怎么活下来的
- [[stm-shavit-touitou]] —— STM Shavit-Touitou — 把"加锁"改成"事务"的源头
- [[stonebraker-2010-sqlnosql]] —— Stonebraker 2010 SQL vs NoSQL — 慢的是老实现，不是 SQL
- [[system-r-1976]] —— System R 1976 — 第一个跑起来的关系数据库
- [[tachyon-2014]] —— Tachyon — 把集群存储推到内存速度，丢了再算回来
- [[tigerbeetle]] —— TigerBeetle — 只能记账但把记账做到极致的金融数据库
- [[volcano]] —— Volcano — 把'算子可组合'与'并行可分离'拼成执行器范式
- [[volcano-1994]] —— Volcano 1994 — 把 SQL 执行写成 next() 拉式数据流

