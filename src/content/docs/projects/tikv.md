---
title: TiKV — 分布式事务 KV
来源: https://github.com/tikv/tikv
日期: 2026-05-31
分类: 数据库
难度: 中级
---

## 是什么

TiKV 是一个**分布式的、支持事务的 key-value 存储**。日常类比：把一本超大的电话簿撕成几百段，每段交给三家"分馆"一起抄一份；任何一家分馆失火，另外两家还能继续查；要修改条目时，三家先举手投票确认，再一起改。

更准确点：

- 用 **Rust** 写，由 PingCAP 2016 年开源
- 每个节点本地存储用 **RocksDB**（一个文件型 LSM-Tree 引擎，下层"硬盘"）
- 数据按 key 顺序切成一段段叫 **Region**，每段默认 **96MB**
- 每个 Region 自己有一个 **Raft 组**（一般 3 副本），独立选 leader、独立复制
- 集群顶上还有一个调度大脑叫 **Placement Driver（PD）**，管元数据 + 发全局时间戳

它是 TiDB 的存储层（TiDB 是 SQL 层），但 TiKV 自己就能单独当 KV 用，**2020 年 9 月从 CNCF 毕业**。

## 为什么重要

不理解 TiKV，下面这些事都没法解释：

- 为什么 TiDB 敢说"MySQL 兼容 + 水平扩展 + 强一致事务"——它把 KV 这一层独立做完整了
- 为什么 Rust 在分布式基础设施圈这么受关注——TiKV 是少数几个工业级、跑生产、还活跃维护的 Rust 大型项目
- Google 2010 年的 **Percolator 论文**到底怎么落地的——TiKV 是开源世界最完整的实现
- "**Multi-Raft**"（不是单一 Raft）这个工程模式怎么运转——TiKV 把它跑到了极致：单节点同时跑上百个 Raft 组

## 核心要点

TiKV 的整体架构可以拆成 **四层**：

1. **本地引擎**：每节点跑两个 RocksDB 实例。一个存真正的数据，另一个专门存 Raft 日志（写入路径上 Raft log 必须先落盘，分开能减少互相干扰）。

2. **Region + Multi-Raft**：所有 key 按字典序排成一条长线，每 96MB 切一刀，叫一个 Region。每个 Region 是一个独立的 Raft 组，3 副本分散在 3 个节点。一个节点同时是上百个 Region 的成员——这就是 Multi-Raft，区别于"整集群一个 Raft"的简化模型。

3. **PD（Placement Driver）**：另一个独立进程（通常 3 副本，用 etcd 做一致性）。它干两件事：(a) **元数据**——告诉客户端某个 key 在哪个 Region、leader 是谁；(b) **TSO**——全局递增时间戳服务，给事务用。PD 自己不存数据。

4. **事务层（Percolator）**：模仿 Google Percolator 论文的 2PC——先在所有 key 上写"锁列"占位，再用 PD 给的 commit 时间戳一次性提交。读的时候按时间戳看见对应版本（**MVCC**）。

## 实践案例

### 案例 1：写一条数据，幕后发生了什么

客户端调用 `put("k1", "v1")`，调用顺序可以想成：

```text
loc = PD.GetRegion("k1")          # 问：谁管 k1？
raft.Propose(loc.leader, Put...)  # leader 提案并复制
raft.WaitCommit()                 # 多数派落盘
ApplyToRocksDB(Put...)            # 写入数据引擎后返回
```

**逐部分解释**：

1. 客户端先问 PD："k1 归哪个 Region？leader 在哪个节点？"（结果会本地缓存）
2. 请求发到该 Region 的 leader；leader 把写打包成 Raft log，复制到 2 个 follower
3. 多数派（leader + 1 个 follower）落盘后 log committed，再 Apply 到数据 RocksDB

整个过程**只有这一个 Region 的 3 个节点参与**——这就是 Multi-Raft 能水平扩展的原因。

### 案例 2：跨 Region 事务（Percolator）

事务要改 100 个 key，分布在 10 个 Region 上：

1. 客户端从 PD 拿一个 **start_ts**（开始时间戳）
2. 选一个 key 当"主锁"（primary lock），其它 99 个是"从锁"
3. **Prewrite 阶段**：把所有 100 个 key 的"锁记录"写下去（每个 key 在它自己的 Region 走一遍 Raft）
4. 全部成功后，从 PD 拿一个 **commit_ts**
5. **Commit 阶段**：先提交 primary 那一个，从锁可以异步清理
6. 读的时候，按 commit_ts 选 MVCC 版本

如果 prewrite 中途崩了，下一次有事务读到挂着的锁，会去查 primary 的状态——primary 还没 commit，从锁就回滚；commit 了，从锁就跟着 commit。**这就是 Percolator 用一个 primary 串起整个事务的核心**。

### 案例 3：Multi-Region 跨 DC 部署

某团队在北京、上海各有一个机房：

- 用 **Placement Rules** 强制要求每个 Region 在两地都有副本（比如 5 副本：北京 3 + 上海 2）
- 上海的应用读数据，开 **Follower Read**——不必跨地域去问 leader，本地副本读就行（牺牲一点延迟换数据时效）
- 部分极远的副本可以设成 **Learner**——接 Raft log 但不投票，不影响多数派延迟

这套组合让 TiKV 能在跨大洲部署里同时拿到"强一致事务 + 就近读"。

### 案例 4：TiFlash 接 Raft log 做 OLAP

同一份订单数据，既要支持"按订单号查一条"（OLTP，TiKV 强项），又要支持"按时间维度做销售统计"（OLAP，列存才合适）：

- TiFlash 作为 Raft **learner** 加入每个 Region——类比"只抄作业、不举手投票"：接 log 但不参与多数派
- 收到 log 后转成列式格式存到本地（ClickHouse 风格引擎）
- TiDB 优化器自动选：点查走 TiKV 行存，分析走 TiFlash 列存
- 一份数据两种形态，**不需要 ETL**——HTAP 就这么落地

## 踩过的坑

1. **不是单 Raft**：很多人以为整集群一个 Raft，因此推不动。TiKV 是 **每个 Region 一个 Raft 组**，节点同时跑上百组。
2. **事务不是 Spanner**：没用 TrueTime，用的是 PD 的 TSO（单点全局时间戳服务）——所以 PD 的可用性极其关键，但 PD 本身用 etcd Raft 做了高可用。
3. **Region 大小是 96MB 不是 64MB**：这是文档里反复见到的常见错记。也可调，但默认 96。
4. **TiKV 不是 SQL**：纯 KV。SQL 在 TiDB 这一层；列存 OLAP 在 TiFlash 那个独立进程（接 Raft log 当 learner 拿数据）。
5. **写放大**：本地 RocksDB 是 LSM-Tree，加上 Raft log 又一份，再加 MVCC 多版本——磁盘空间和 IO 比单机数据库都更高，做容量规划时要算清楚。
6. **PD 是单点服务但不是单点故障**：PD 看起来"全局唯一"，容易让人担心瓶颈。其实 PD 自身是 3 副本 etcd，TSO 也能做到几十万 QPS；真正瓶颈往往是网络 RTT 而非 PD 处理力。
7. **Region 太多会拖慢心跳**：节点上 Region 数量过万会让 Raft 心跳和元数据上报压力暴增——所以默认要把空闲 Region 合并（merge），新数据时再分裂（split）。

## 适用 vs 不适用场景

**适用**：

- 想要"水平扩展 + 强一致事务"的 KV 场景（金融账单、库存、订单）
- 作为 TiDB 的底层，跑 NewSQL（兼容 MySQL 协议 + 分布式）
- HTAP：TiKV 跑 OLTP，TiFlash 跑 OLAP，同一份数据两个引擎
- 跨 DC 多活/灾备，需要 placement rule 灵活安排副本

**不适用**：

- 单机几 GB 数据量——上 TiKV 是用大炮打蚊子，直接 RocksDB / SQLite 就够
- 极低延迟（亚毫秒）KV——Raft + Percolator 多一轮 RTT，单机内存 KV 才能做到
- 海量小 key 高频写（计数器场景）——Region 元数据和 Raft 状态都是开销
- 没有专职 SRE 的小团队——PD / TiKV / TiDB / TiFlash 四层运维不轻松

## 历史小故事（可跳过）

- **2015 年**：PingCAP 三位创始人刘奇 / 黄东旭 / 崔秋离开豌豆荚，受 Google Spanner / F1 论文启发，开始做"开源版 Spanner"。最早叫 TiDB（Ti = titanium，钛）
- **2016 年**：TiKV 作为存储层开源（约 1 月开工、4 月开源）。团队**考虑过用 Go**，但因 GC 停顿与调用 RocksDB 时的 CGO 开销，**从一开始选 Rust 从零写**（不是整仓重写）
- **2018 年**：捐给 CNCF，进入 sandbox
- **2019 年**：升级到 incubating
- **2020 年 9 月**：CNCF 毕业，成为继 etcd 之后第二个 Raft 系毕业存储项目

## 学到什么

1. **"分片 + 共识"是分布式存储的标准做法**：TiKV 的 Region + Multi-Raft 是这套组合的工业级范本，几乎所有现代 NewSQL（CockroachDB / YugabyteDB / OceanBase）都走类似套路
2. **存储和计算分层是大势**：TiKV 只做 KV，SQL 给 TiDB，列存给 TiFlash——每层自己演化、自己迭代版本，不互相绑死
3. **2PC 不一定要 Spanner 那么贵**：Percolator 用一个全局 TSO + primary lock 也能撑起百节点级强一致事务，代价是 PD 不能太远（跨大洲会拖慢提交）
4. **CNCF 毕业项目里 Rust 占比正在上升**：TiKV 是开路先锋之一，证明 Rust 不仅能写浏览器引擎，也能写工业级分布式存储

## 延伸阅读

- 官方架构文档：[TiKV docs](https://tikv.org/docs/)
- 论文：[Google Percolator 2010](https://research.google/pubs/large-scale-incremental-processing-using-distributed-transactions-and-notifications/)（TiKV 事务的祖宗）
- TiKV 源码导读：[tikv/tikv on GitHub](https://github.com/tikv/tikv)
- [[etcd]] —— 同样基于 Raft，但只做元数据级小数据，对照看
- [[raft-consensus]] —— TiKV Multi-Raft 的理论基础（如已收录）

## 关联

- [[etcd]] —— 都用 Raft，etcd 是单 Raft 元数据存储，TiKV 是 Multi-Raft 大数据存储
- [[rocksdb]] —— TiKV 节点本地引擎（如已收录）
- [[spanner-2012]] —— 另一条路线：TrueTime 而非全局 TSO（如已收录）
- [[cncf-graduated]] —— TiKV 2020 毕业项目之一（如已收录）

## 一句话总结

TiKV = Rust 写的"分片 + Multi-Raft + Percolator 事务"分布式 KV，靠一个独立的 PD 大脑发全局时间戳和管 Region 调度，**TiDB 的存储底座**。理解它，就理解了 NewSQL 时代 OLTP 存储层的工业级范式。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[raft-2014]] —— Raft 2014 — 把共识拆成能实现的三件事
- [[etcd]] —— etcd — 分布式键值数据库
- [[leveldb]] —— LevelDB — Google LSM 库
- [[pebble]] —— Pebble — CockroachDB 自研 LSM
- [[rocksdb]] —— RocksDB — 嵌入式 LSM 引擎
- [[surrealdb]] —— SurrealDB — 一种语法吃下 SQL 图 文档 向量
- [[unqlite]] —— UnQLite — C 写的嵌入式 NoSQL 双模数据库
