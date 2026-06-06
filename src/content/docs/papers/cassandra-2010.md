---
title: Cassandra 2010 — 把 Dynamo 的 P2P 骨架和 Bigtable 的列族数据模型拼成一个东西
来源: 'Lakshman & Malik, "Cassandra: A Decentralized Structured Storage System", ACM SIGOPS OSR 44(2), 2010'
日期: 2026-05-30
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

Cassandra 是一个**没有中心节点、所有机器平等、按 row+column 取数据**的分布式存储系统。日常类比：像一个**圆形跑道上的环形传话**——每台机器站在跑道某一段，谁负责哪段数据按 hash 算出来；机器之间靠"互相八卦"知道谁活着；新机器加进来只要找个空段插进去。

你写：

```
put("user:42", "messages:inbox:t1700000000", "hello")
```

请求随便发到环上任一台机器。这台机器算 hash 算出"user:42"该归哪 N 台负责，把写转发过去；这 N 台先 append commit log、再写内存 memtable，定期 flush 成不可变 SSTable。

它**不是 Bigtable**（没有 master、不依赖 GFS+Chubby），也**不是纯 KV**（key 是 row+column 二维的）。是 **Dynamo 骨架 + Bigtable 数据模型**的拼装。

## 为什么重要

不理解 Cassandra，下面这些事都没法解释：

- 为什么 NoSQL 在 2009-2012 年分裂成两派——HBase 走 Bigtable master 路线，Cassandra 走 Dynamo P2P 路线
- 为什么"最终一致性"和"可调一致性"成了分布式存储的常用词
- 为什么"一致性哈希环 + gossip + bloom filter + LSM-tree"这套组合在后来的 Riak / ScyllaDB 里反复出现
- 为什么 phi-accrual failure detector（输出连续怀疑值而不是布尔）成了分布式系统标配

## 核心要点

Cassandra 的设计可以拆成 **三块**：

1. **数据模型来自 Bigtable**：(row_key, column_family:column, timestamp) → value。row 在节点间分片、column 在 row 内排序。但比 Bigtable 多了 super column（一层嵌套，后来弃用）和"客户端选一致性档位"。

2. **分布式骨架来自 Dynamo**：一致性哈希环把 key space 切给所有节点；写到 N 个副本（rack-aware / DC-aware）；客户端选 ONE / QUORUM / ALL 决定成功阈值；gossip 每秒一轮交换状态版本号；phi-accrual 算每个节点的"怀疑值"，超阈值就视为 down。

3. **存储引擎是 LSM-tree**：写先 append commit log（持久），再进内存 memtable，定期 flush 成不可变 SSTable，后台 compact 多个 SSTable 成大的。读时扫 memtable + 多个 SSTable，靠 bloom filter 跳过没该 row 的文件。

合起来：写极快（顺序日志 + 内存）、读靠合并和过滤、分片用 hash 环切、成员管理靠八卦、容错靠副本和怀疑值。**全程没有 master**——这是和 Bigtable 最大的差别。

## 实践案例

### 案例 1：Facebook Inbox Search 上线规模

论文报告的真实部署：

- 集群约 **150 节点**，覆盖 **>50 TB** 数据，**1 亿用户**
- 两类查询：term search（按词搜消息）、interactions search（按发件人搜）
- 实测延迟：term search 中位 **18.27 ms**（min 7.78 / max 44.41），interactions search 中位 **15.69 ms**（min 7.69 / max 26.13）
- 写比 MySQL 快约 2.5 倍

这是 2009 年的数字。当时业内还没几个能在 50 TB+ 跑出双位数毫秒延迟的开源系统。

### 案例 2：写一条数据到底走哪几台

环上 8 个节点 N1..N8，replication factor=3，rack-aware 策略。

```
put("user:42", ...)
  → 客户端把请求发到任一节点（比如 N3）
  → N3 算 hash("user:42") 落在 N5 这一段
  → N3 转给 coordinator N5
  → N5 选自己 + 顺时针下两个跨 rack 的副本（比如 N6、N1）
  → 同时发给 N5/N6/N1
  → 等够 W 个 ack（W 由客户端选：ONE=1, QUORUM=2, ALL=3）就返回成功
```

R+W>N（比如 R=2, W=2, N=3）→ 强一致；R+W≤N → 牺牲一致换延迟。这套 **tunable consistency** 是 Dynamo 来的。

### 案例 3：phi-accrual 怎么"算 90% 把握他死了"

普通 failure detector 输出 boolean（活/死），阈值 hard-coded。phi-accrual 不一样：

- 每收到一个心跳，记录到达时间
- 算到达间隔的滑动窗口分布（均值、方差）
- 当前距上次心跳已过 t 秒 → 算 P(下一心跳还没到) → 取 -log10 得到 phi 值
- phi=1 表示 10% 把握、phi=2 表示 1% 概率还活着、phi=8 通常视为已死

上层应用自己挑阈值：要快下线挑 phi=5、要稳挑 phi=10。这套数学化检测后来被 Akka、Riak 等抄走了。

### 案例 4：gossip 一秒一轮怎么传遍全集群

每秒每个节点做三件事：

1. 随机挑一个**活着**的节点交换状态（push-pull）
2. 一定概率挑一个**疑似 down** 的节点试探（避免误判常驻）
3. 一定概率挑一个**seed**（启动种子节点，保证不会脑裂）

每次交换只发"我知道的版本号摘要"，对方比对后回传缺的部分。理论上 100 节点集群里一条新消息约 7 秒传遍（O(log N)）。这套 anti-entropy 来自论文 Scuttlebutt（2007）。

## 踩过的坑

1. **eventual consistency 默认会咬人**：客户端没显式选 QUORUM 时是 ONE，写完读不到自己刚写的（不同副本 lag）。新人常以为"数据库丢数据"，其实是一致性档位选错。

2. **super column 是设计失误**：原本想做"列族里再嵌一层"，结果整个 super column 必须一次性反序列化，性能差又僵硬。后来 Cassandra 自己弃用，改成 composite key + CQL（类 SQL 语法）。

3. **轻节点搬位置的均衡策略不够好**：论文里说"轻负载节点会沿环移动来均衡"，实际运维很折磨——加节点要手动算 token、数据迁移慢。后来引入 **vnode**（每物理节点持 256 个小 token 范围）才真正解决，但这是论文之后的工程演进。

4. **Facebook 自己 2010 后切回了 HBase**：Inbox Search 后来改用 HBase。原因是 Inbox 场景需要强一致（消息不能乱序丢失），运维上 master-based 更直观。讽刺的是 Cassandra 的发明地最早抛弃了它。

5. **compaction 是隐形杀手**：写多了之后后台 compact 会抢磁盘 IO 和 CPU，导致读延迟尖刺。这块论文几乎没讲，是后来工程实战才暴露的。后来分化出 size-tiered / leveled / time-window 三种策略，按工作负载选。

6. **repair 不是免费的**：副本之间最终一致需要靠 anti-entropy 跑 Merkle tree 比对差异，跨 DC 跑一次几小时常见。运维不跑 repair → 副本永久分歧 → 读到旧值。论文一句带过，工程上是大坑。

## 适用 vs 不适用场景

**适用**：

- 写多读多、可接受最终一致——时序数据、消息流、事件日志
- 跨数据中心、高可用第一——多 DC 副本 + 本地 quorum
- 表结构稳定但 schema 不强（列稀疏）——监控指标、用户画像

**不适用**：

- 需要事务（多 row ACID）—— Cassandra 没有，要 Spanner / CockroachDB
- 需要 join / 二级索引重——CQL 有限支持但生产慎用
- 强一致要求 + 写少读多——HBase 或 RDBMS 更顺
- 数据量小（<1 TB）—— 运维成本不划算，单机 PostgreSQL 即可

## 历史小故事（可跳过）

- **2007 年**：Amazon 发表 Dynamo 论文（SOSP）
- **2006 年**：Google 发表 Bigtable 论文（OSDI）
- **2008 年**：Facebook 工程师 Avinash Lakshman（曾在 Amazon 参与 Dynamo 项目工作）和 Prashant Malik 为 Inbox Search 造 Cassandra，**2008-07 开源**
- **2009-03**：进 Apache 孵化器；**2009 年 LADIS workshop** 发了短文
- **2010-02**：成为 Apache 顶级项目；**2010-04** 在 SIGOPS OSR 出正式论文（就是这一篇）
- 之后 15 年：Netflix、Apple、Discord、Instagram 都重度用过；衍生出 **ScyllaDB**（C++ 重写，性能高 10 倍）

## 学到什么

1. **拼装也是创新**——Cassandra 没发明任何单一组件，是把已有 idea（一致性哈希、gossip、LSM-tree、列族）拼出新组合。系统研究里的"原创"很多时候就是这种拼装。
2. **去中心化的代价是强一致难做**——没 master 就没单一仲裁者，要么靠 quorum（贵）、要么接受最终一致（便宜但烧脑）
3. **failure detection 可以是连续值**——phi-accrual 把布尔决策推迟到上层，让不同应用挑不同阈值
4. **论文是起点不是终点**——vnode、CQL、materialized view、轻量级事务都是论文之后的演进，今天的 Cassandra 和 2010 年的差距比想象大
5. **写优先 vs 读优先是底层选择**——LSM-tree 选了写极快、读靠合并；B-tree 反过来。Cassandra 的所有性能特征都来自这一选择，理解它就理解一半 Cassandra
6. **运维复杂度藏在论文之外**——一致性档位、replication 策略、compaction 策略、repair 调度——论文都用一两句带过，生产环境每一项都能让你掉头发

## 延伸阅读

- 论文 PDF：[Lakshman-Malik 2010](https://www.cs.cornell.edu/projects/ladis2009/papers/lakshman-ladis2009.pdf)（6 页，密度高）
- 入门书：《Cassandra: The Definitive Guide》Jeff Carpenter（O'Reilly，第 3 版覆盖到 4.x）
- 视频：[ScyllaDB Summit — Cassandra Internals](https://www.youtube.com/results?search_query=cassandra+internals+scylla)（C++ 重写者讲底层）
- [[bigtable-2006]] —— Cassandra 数据模型来源
- [[dynamo-2007]] —— Cassandra 分布式骨架来源（同作者）

## 关联

- [[bigtable-2006]] —— 列族 + memtable + SSTable 全是从这继承
- [[dynamo-2007]] —— 一致性哈希、quorum、gossip 全是从这继承
- [[chord-2001]] —— 一致性哈希环最早系统化的论文
- [[paxos-1998]] —— 强一致的另一条路；Cassandra 后来加了 lightweight transaction（基于 Paxos）补这一块

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bigtable-2006]] —— Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统
- [[brewer-cap-2000]] —— Brewer CAP — 网络一断电，一致性和可用性只能留一个
- [[chord-2001]] —— Chord — 让上万台机器排成圈，查任何 key 都只走 log N 步
- [[cockroachdb-2020]] —— CockroachDB 2020 — 没原子钟也能做全球强一致 SQL 数据库
- [[cops-2011]] —— COPS — 大规模跨地域存储如何用得起的代价拿到因果一致
- [[dewitt-gray-1992]] —— DeWitt-Gray 1992 — 并行数据库取代专用机的宣言
- [[gilbert-lynch-2002]] —— Gilbert-Lynch 2002 — 把 CAP 从口号写成数学定理
- [[karger-1997-consistent-hashing]] —— Karger 1997 一致性哈希 — 加机器不用全员搬家
- [[mapreduce]] —— MapReduce — 用户只写两个函数，框架替你扛千节点
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[pnuts-2008]] —— PNUTS — 介于强一致与最终一致之间的实用一致性
- [[rocksdb-2017]] —— RocksDB 2017 — 把 LSM-Tree 的"空间放大"压到极低的工业经验
- [[rocksdb-lsm]] —— LSM-tree 与 RocksDB — 把所有写都变成顺序写
- [[silt-2011]] —— SILT — 0.7 字节内存索引一条记录的 flash 键值存储
- [[stonebraker-2010-sqlnosql]] —— Stonebraker 2010 SQL vs NoSQL — 慢的是老实现，不是 SQL

