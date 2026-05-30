---
title: Bigtable — Google 把行级随机读写做到 PB 级的存储
来源: 'Chang et al., "Bigtable: A Distributed Storage System for Structured Data", OSDI 2006'
日期: 2026-05-29
分类: 分布式系统
难度: 中级
---

## 是什么

Bigtable 是一个**让你按"行—列—时间"三个坐标存数据，能扩到 PB、上千台机器**的存储系统。日常类比：像一个**超大的电子表格**——但每一格不止一个值，而是一叠按时间堆起来的小纸条；这个表格大到一台电脑装不下，被切成无数小段分散到上千台机器上。

你写：

```
Put("com.cnn.www", "contents:html", t=20060815, "<html>...</html>")
```

就在 row=`com.cnn.www`、column=`contents:html`、time=`20060815` 这一格，插入了一张小纸条。下次再写同一格，老纸条不删——叠在新纸条下面。这就是 Bigtable 的"三维稀疏 sorted map"。

它不是 SQL（没有 join、没有二级索引），也不是 KV（key 是三维的）。是**第三种东西**。Google 内部的 Crawl、Analytics、Earth、AdSense、GMail 都是用它存的。开源界的 HBase / Cassandra / LevelDB / RocksDB 都是它的徒孙。论文 OSDI 2006 拿了最佳论文奖。

## 为什么重要

不理解 Bigtable，下面这些事都没法解释：

- 为什么 NoSQL 在 2008 年突然爆发——HBase、Cassandra 都是照着这篇论文做的
- 为什么"列族"（column family）这个怪词在 HBase / Cassandra 里到处都是
- 为什么 LSM-tree（写到内存 + 后台合并）成了今天 OLTP 内核的默认选择
- 为什么"计算和存储分离"不是云时代的新发明，2006 年 Bigtable + GFS 就在这么干了
- 为什么 [[spanner]] 的诞生被官方描述为"Bigtable 局限的回应"——单行原子和缺二级索引把开发者逼疯了

## 核心要点

Bigtable 的设计可以拆成 **三件事**：

1. **数据模型 = 三维稀疏 sorted map**：`(row, column, time) → string`。row 按字典序物理相邻，scan 一段范围 = 顺序读磁盘。类比：电话簿按姓氏排好，找一段连续姓氏只翻一次书。value 一律是 bytes，结构化数据自己 serialize 进去。

2. **存储 = LSM-tree（写不改，只追加）**：写先进内存（memtable），满了 flush 成不可变文件（SSTable），后台周期性合并旧文件。类比：写日记不改，攒满一本就装订归档，旧日记和新日记定期合并成一本"精华版"。LSM 的好处是把"随机写"变成"顺序写 + 周期 merge"，磁盘吞吐能拉满。

3. **元数据 = 三层定位 + Chubby**：找一行 row 在哪台机器，先问 Chubby 拿到 root tablet 位置，再走两次 metadata 表查找。类比：找人先问总台→分区索引→楼层索引，最后到具体房间。客户端缓存所有结果，稳态下 cache miss 才走完整路径。

## 实践案例

### 案例 1：网页快照表（论文招牌例子）

```
row = "com.cnn.www"          # 反转域名,让同站点物理相邻
column "contents:html"       # 列族 contents 下的 html 列
column "anchor:cnnsi.com"    # 列族 anchor 下,谁链了这个页面
time = t1, t2, t3            # 同一格保存 3 个抓取版本
```

**逐部分解释**：

- **反转域名**：`www.cnn.com` 和 `news.cnn.com` 反转后前缀都是 `com.cnn.`，scan 一次拿一整个站点
- **列族**：`contents:` 和 `anchor:` 是两个列族，可以分开压缩、分开放不同硬盘
- **多 timestamp**：同一格三个版本 = 网页历史快照，免费实现 MVCC
- **稀疏**：一个网页可能被几千个网站链接，每个链接一个 `anchor:<domain>` qualifier；只填实际存在的，空的不占空间

### 案例 2：写入路径

客户端调 `Put`，背后两件事并发发生：

```
client.Put(row, col, val)
   ├──> 追加到 commit log（写到 GFS,持久）   ← 写完这一步才 ack
   └──> 插入到 memtable（内存里的 sorted skiplist）
```

memtable 满 64MB，冻结 + flush 成 SSTable 文件到 GFS。这叫 **minor compaction**。SSTable 多了，再后台合并成一个大的，丢掉过期版本，叫 **major compaction**。

读路径要查多个地方——当前 memtable、冻结但没 flush 的 memtable、N 个 SSTable，按时间倒序找最新版本。每个 SSTable 上挂 Bloom filter，先用内存查表跳过不含目标 key 的文件，避免无谓磁盘 IO。

### 案例 3：Tablet 迁移为什么是秒级

一个 tablet（行范围分片）由某台 tablet server 服务。这台机器挂了，master 把 tablet 重新分配给另一台。**关键：物理数据不动**——SSTable 都在 GFS 里，新机器直接读 GFS + 重放 commit log 里未持久化的写。计算和存储分离让"迁移"变成"改个指针"。

这也是为什么 tablet server 同时能服务上千个 tablet 而不卡：tablet 在内存里只占一份小元数据（memtable + SSTable 文件名列表 + Bloom filter），真正的数据全在 GFS 那头按需 fetch。负载不均时 master 自动把 tablet 从忙的 server 搬到闲的 server，整个集群水位会自然趋平。

## 踩过的坑

1. **row key 设计是用户责任**：选不好就出热点 tablet。论文不教你怎么选，HBase 工程师 10 年经验文章主要在讲这个。最常见的反例是用顺序时间戳当 row key——所有写都打到同一个 tablet。
2. **跨行不原子 + 没有二级索引**：单行内多列改是原子的，跨行就不是。要事务、要按非 row-key 列查询，都得自己应用层拼。Google 内部多个项目反复实现跨行事务，质量参差，最后被 [[spanner]] 统一收回去。
3. **major compaction 写放大**：PB 数据下后台 IO 占用极高，业务写入和合并 IO 抢带宽。RocksDB 后来引入 leveled compaction 调了一代人。
4. **Chubby 是单点依赖**：Chubby 不可用 = Bigtable 不可用。Chubby 自己是 5 节点 Paxos 容忍 2 故障，但跨地域容灾原始论文没讲。
5. **value 是 bytes，schema 全靠口头约定**：列族里塞什么类型 Bigtable 不管，业务靠 protobuf / Thrift 自律。换团队接手最容易踩这个坑。

## 适用 vs 不适用场景

**适用**：
- 海量结构化数据需要按 row key 范围扫描（网页快照、时序数据、用户档案）
- 读写都是按行的 OLTP-like 工作负载，PB 级
- 能接受单行原子、跨行靠应用层拼
- 写多读少的场景（LSM-tree 写顺序追加，比 B+tree 友好）

**不适用**：
- 复杂 SQL join / 二级索引 / 跨行事务 → 用 [[spanner]] 或传统 RDBMS
- OLAP 重分析（按列聚合大表）→ 用 [[clickhouse]] / [[snowflake]]
- 数据量 < TB → 单机 PostgreSQL / [[rocksdb-lsm]] 嵌入式更合适
- 极低延迟（亚毫秒）随机读 → LSM 多文件查找 + Bloom filter 仍有放大，纯内存 KV 更适合

## 历史小故事（可跳过）

- **2003**：[[gfs]] 论文（SOSP）—— 大文件、append-only、不能随机更新
- **2004**：[[mapreduce]] 论文（OSDI）—— 把 GFS 上 PB 数据变成可批处理
- **2006**：Bigtable 论文（OSDI）+ [[chubby]] 论文（同会议）—— 行级随机读写补齐
- **2008**：HBase 进 Apache 孵化器（Yahoo Powerset 团队主导）；同年 Cassandra 在 Facebook 上线，把 Bigtable 数据模型 + Dynamo 一致性哈希混合
- **2011**：Sanjay Ghemawat 和 Jeff Dean 把 Bigtable 单机部分开源成 LevelDB；Megastore 论文（CIDR 2011）在 Bigtable 上加跨行事务
- **2012**：[[spanner]] 论文承认 Bigtable 单行约束不够，全球强一致 OLTP 上位
- **2015**：Google Cloud Bigtable GA，论文成果商业化

GFS / MapReduce / Bigtable / Chubby 四件套，是 Google 把"互联网级数据"从研究问题变工程问题的最后一块拼图。论文里那句"By choosing their row keys carefully, clients can exploit locality of access"成了一代 NoSQL 工程师的紧箍咒——把索引设计责任彻底交还给用户。

## 学到什么

1. **数据模型可以是第三种**——SQL 和 KV 之外，还有 multi-dim sorted map，能跑 PB。新存储设计不必非套已有抽象。
2. **不可变是简化的源头**——SSTable 一旦写入永不改，让 lock / cache / 复制 / 恢复全部简化。任何并发难题都该先问"能不能不可变"。
3. **API 简洁性 = schema 设计复杂性外包**——Bigtable 没 SQL，但 row key 设计变成了核心难题。任何"我们 API 比 SQL 简单"的系统都要警惕这个守恒律。
4. **先把能用的做出来，再迭代**——Bigtable 明知跨行不原子、master 单点都是限制，没强行做完美。先跑 5 年再让继任者解决。这是 systems 工作和学术工作最大的区别。

## 延伸阅读

- 论文 PDF：[Bigtable OSDI 2006](https://static.googleusercontent.com/media/research.google.com/en//archive/bigtable-osdi06.pdf)（14 页，前 6 页就够理解模型）
- 视频教程：[MIT 6.824 — Bigtable lecture](https://www.youtube.com/watch?v=BS-Eb4Yf-3M)（一小时把数据模型 + tablet location + LSM 讲清）
- 单机版精读：LevelDB 源码（~30k LOC C++），是 Bigtable 思想最干净的实现
- 期刊扩展版：ACM TOCS 2008 期刊版 比 OSDI 版多 8 页 Google 内部 8 个真实工作负载的数据
- HBase 官方 reference guide 的 row key 设计章节，把"hot tablet 怎么避免"讲透
- [[lsm-tree-1996]] —— LSM-tree 理论论文，Bigtable 是它的第一次工业落地
- [[gfs]] —— Bigtable 的存储底座
- [[chubby]] —— Bigtable 的协调底座

## 关联

- [[gfs]] —— Bigtable 把 SSTable 和 commit log 都放在 GFS 上，靠它做持久化和复制
- [[chubby]] —— Bigtable 用 Chubby 做 master 选举、root tablet 定位、schema 元数据存储
- [[mapreduce]] —— 同期三件套之一，经常把 Bigtable 当输入输出
- [[paxos]] —— Chubby 内部就是 Paxos，Bigtable 间接依赖共识协议
- [[spanner]] —— Bigtable 的官方继任者，加上跨行事务和全球强一致
- [[rocksdb-lsm]] —— LevelDB / RocksDB 是 Bigtable 单机部分的开源版
- [[lsm-tree-1996]] —— Bigtable 的写路径是 LSM-tree 第一次工业实现
- [[dynamo]] —— 同年代的另一条 NoSQL 路线，Cassandra 把 Dynamo 一致性哈希和 Bigtable 数据模型混合
- [[b-tree-1972]] —— Bigtable 不用 B-tree 因为多路随机写不友好；这条对比理解 LSM-tree 的取舍最直接
- [[codd-1970]] —— 关系模型的祖宗，Bigtable 主动放弃 join / 二级索引 / SQL，是对 Codd 模型的反叛

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aurora]] —— Aurora — 把数据库的下半身换成日志机
- [[b-tree-1972]] —— B-Tree 1972 — 磁盘友好的索引结构
- [[borg]] —— Borg 大规模集群管理
- [[calvin]] —— Calvin — 不要每次都协商，先排好顺序大家照做
- [[chubby]] —— Chubby — 给凡人用的分布式锁服务
- [[clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[codd-1970]] —— Codd 1970 — 关系模型奠基
- [[dns]] —— DNS Domain Name System
- [[dynamo]] —— Dynamo — 让购物车永远能写入的分布式存储
- [[foundationdb]] —— FoundationDB — 把数据库拆成 5 个独立角色，再用确定性仿真烧 10 年 bug
- [[gfs]] —— GFS — workload reverse-defines the file system：single master + 64MB chunk + relaxed consistency 的工程胜利
- [[http-2]] —— HTTP/2 — Hypertext Transfer Protocol Version 2
- [[ingres-1976]] —— INGRES 1976 — Berkeley 平行实现的关系数据库
- [[lamport-1978]] —— Lamport 1978 — 分布式系统里没有"绝对的同时"
- [[lsm-tree-1996]] —— LSM-Tree 1996 — 写优化存储引擎
- [[mapreduce]] —— MapReduce (Dean & Ghemawat 2004) — 限制表达力换可扩展性
- [[paxos]] —— Paxos — 分布式共识算法
- [[quic]] —— QUIC UDP-Based Multiplexed Secure Transport
- [[skip-list-1990]] —— Skip List — 用抛硬币代替平衡树
- [[spanner]] —— Spanner — 全球分布式 SQL 数据库
- [[system-r-1976]] —— System R 1976 — 第一个跑起来的关系数据库
- [[tcp]] —— TCP — 在不可靠的 IP 上凿出一条 reliable 字节流
- [[volcano-1994]] —— Volcano 1994 — 把 SQL 执行写成 next() 拉式数据流

