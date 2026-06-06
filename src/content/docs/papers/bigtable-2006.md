---
title: Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统
来源: 'Chang et al., "Bigtable: A Distributed Storage System for Structured Data", OSDI 2006'
日期: 2026-05-30
子分类: 存储与查询
分类: 数据库
难度: 中级
schema_version: legacy-long
provenance: legacy-migrated
---

## 是什么

Bigtable 是一个**让你按"行—列—时间"三个坐标存数据，能扩到 PB、上千台机器**的存储系统。日常类比：像一个**超大的电子表格**——每一格不止一个值，而是一叠按时间堆起来的小纸条；这个表格大到一台电脑装不下，被切成无数小段分散到上千台机器上。

你写：

```
Put("com.cnn.www", "contents:html", t=20060815, "<html>...</html>")
```

就在 row=`com.cnn.www`、column=`contents:html`、time=`20060815` 这一格，插入了一张小纸条。下次再写同一格，老纸条不删——叠在新纸条下面。这就是 Bigtable 的"三维稀疏 sorted map"。

它**不是 SQL**（没 join、没二级索引），也**不是纯 KV**（key 是三维的）。是第三种东西。OSDI 2006 最佳论文奖。

## 为什么重要

不理解 Bigtable，下面这些事都没法解释：

- 为什么 NoSQL 在 2008 年突然爆发——HBase、Cassandra 都是照着这篇论文做的
- 为什么"列族"（column family）这个怪词在 HBase / Cassandra 里到处都是
- 为什么 LSM-tree（写到内存 + 后台合并）成了今天 OLTP 内核的默认选择
- 为什么"计算和存储分离"不是云时代的新发明，2006 年 Bigtable + GFS 就在干
- 为什么 [[spanner-2012]] 被官方描述为"Bigtable 局限的回应"——单行原子和缺二级索引把开发者逼疯了

## 核心要点

Bigtable 的设计可以拆成 **三块**：

1. **数据模型**：(row, column-family:qualifier, timestamp) → value。row 按字典序排，相邻 row 在物理上也相邻，所以 scan 一段范围只扫几个文件。日常类比：电话簿按姓氏排序——找"王"开头的全在一起，不用翻全本。

2. **三件套底层**：GFS 存数据和日志（可靠 + 顺序读快）、Chubby 选 master 和管 schema 锁（强一致小数据）、SSTable 是不可变文件格式（读时只追加，永不就地改）。日常类比：账本（GFS）+ 公证人（Chubby）+ 一摞按日期归档的卷宗（SSTable）。

3. **写路径**：写先进内存表（memtable）+ 写 commit log，定期 flush 成 SSTable（minor compaction），后台再把多个 SSTable 合并成大的（major compaction）。这个组合叫 **LSM-tree**。读时要查 memtable + 多个 SSTable，靠 Bloom filter 跳过没该 row 的文件。

合起来：写极快（内存 + 顺序日志）、读靠合并和过滤、分片用 row key 区间切。

**寻址三层**：client 第一次访问表时，先去 Chubby 拿到 root tablet 位置；读 root tablet 拿到 METADATA tablet 位置；读 METADATA 拿到目标 user tablet 位置。三跳后 cache 住，下次直达。这套 "三层 + 客户端缓存" 是 Bigtable 不需要中央元数据服务也能扩到上千 tablet 的关键。

## 实践案例

### 案例 1：Web crawler 存 URL → 页面历史

设计 row key = **反转域名 + 路径**：`com.cnn.www/index.html`。这样同一站点的所有页面在 scan 时连续。

```
Put("com.cnn.www", "contents:html", t=20060815, "<html>v1</html>")
Put("com.cnn.www", "contents:html", t=20060816, "<html>v2</html>")
Put("com.cnn.www", "anchor:cnnsi.com", "CNN")
```

读最新页：`Get(row="com.cnn.www", column="contents:html")` 拿 t 最大的那张纸条。看历史：开 timestamp range，所有版本按时间倒序出来。按域名 scan：`Scan(start="com.cnn", end="com.cnn~")` 一次扫光。

为什么反转域名？因为 row 按字典序排，同一公司不同子域（`mail.cnn.www`、`news.cnn.www`）这样才会在物理上挨着。

### 案例 2：时序监控指标

```
row=cpu_usage#machine-42, column=value:, timestamp=采集时间, value=87.3
```

设 GC 策略：**只保留最近 100 个版本** 或 **保留最近 7 天**。老数据 major compaction 时自动丢弃，不需要你写脚本删。

为什么不直接用 timestamp 当 row？**热点**——所有写都打到时间最大的那个 tablet server，单机被打挂。把 metric+machine 当前缀，写自然分散到多台。

### 案例 3：用户画像宽表

```
row=user-12345
column families:
  profile: name, age, city, ...
  behavior: click_news, click_sports, click_food, ...
  computed: ltv, churn_score, ...
```

新加一列（比如 `behavior:click_pet`）**不用 schema migration**，直接 Put 就有了。缺失的列**不占空间**——稀疏存储是 Bigtable 的天性。column family 在建表时定，列 qualifier 在写入时随便加。

## 踩过的坑

1. **把 Bigtable 当 SQL 用**：没 join、没二级索引、跨行不原子。需要 join 就回到 client 侧多次 Get 拼。想当 OLTP 用先看 Spanner（2012）。

2. **row key 单调递增**：用 timestamp / 自增 ID 当 row 前缀，所有写打到同一 tablet server，热点把单机打挂。**正确做法**：加 hash 前缀（`hash(uid)%256-uid`）或反转 timestamp。

3. **column family 太多**：每个 family 独立 SSTable + 元数据开销。建议 **< 100 个**，且按**访问局部性**而非语义分组——同时读的列放一组，分开读的拆开。

4. **忽视 compaction 成本**：major compaction 把整个 tablet 的 SSTable 合并重写，IO 放大严重。生产环境要错峰、限速，否则磁盘和延迟双双被它吃掉。

5. **不区分写一次 / 写很多次的列**：把"几乎不变的属性"（profile:name）和"每秒都更新的"（counter）放同一 column family，老数据 compaction 时被反复读写。建议按更新频率拆 family。

## 适用 vs 不适用场景

**适用**：
- PB 级 + 行级随机读写 + 简单 schema（爬虫、日志、时序、画像）
- 写多读少 + 顺序 scan 重要（LSM 写吞吐天生强）
- column 数量动态变化、稀疏（80% 列大部分行没值）

**不适用**：
- 跨行事务 / join（用 Spanner / Aurora / Postgres）
- 强一致 OLTP 短事务（Spanner / TiDB）
- 数据量 < TB（杀鸡用牛刀，单机 Postgres 就够）
- 复杂二级索引、范围条件灵活查（用搜索引擎或列存 OLAP）
- 强 schema 约束、外键、check 约束等关系型语义

## 历史小故事（可跳过）

- **2003 年**：GFS 论文（SOSP）出，Google 解决了 PB 级文件存储。
- **2004 年**：MapReduce 论文（OSDI），把"批量算"标准化。
- **2005 年**：Bigtable 项目内部已支撑 Crawl + Analytics + Earth 多个生产业务。
- **2006 年**：Bigtable 论文（OSDI）+ Chubby 论文（OSDI）同年发，Google 完整存储栈成型——GFS 存字节、Bigtable 存结构化、Chubby 协调、MapReduce 算。
- **2007 年**：Amazon Dynamo 论文走另一条路（无 master、最终一致），和 Bigtable 形成 NoSQL 两大流派。
- **2008 年**：HBase 0.1 发布，几乎是 Bigtable 论文的开源克隆。Cassandra 同期借走 SSTable + LSM，但用 Dynamo 的 gossip 拓扑。
- **2012 年**：Spanner 论文出，给 Bigtable 加了全球同步事务（TrueTime + Paxos），闭环完成。
- **2015 年起**：Bigtable 以 Cloud Bigtable 形式对外开放，至今仍是 Google 内部最大的存储引擎之一。

## 学到什么

1. **结构化 + scale 不必走 SQL**：放弃 join 和二级索引，换来线性扩展到上千机器。这是 NoSQL 整代产品的方法论。
2. **不可变 + 后台合并**（LSM）是写吞吐的核心：写永远只追加，"修改"靠新版本盖旧版本，"删除"靠 compaction 真正回收。
3. **schema 设计的核心是 row key**：row key 决定了热点、scan 局部性、tablet 切分——比 column 设计重要 10 倍。
4. **复用底层组件**：Bigtable 自己不做存储和锁，全靠 GFS + Chubby。这种"垂直分层 + 各层最强"的拆法，是 Google 系统设计的招牌。
5. **简单 API + 客户端聪明**：Bigtable 只暴露 Put / Get / Scan，没有事务管理器、没有查询优化器，把复杂度推给 client（locality group / Bloom filter / 缓存策略由 schema 配）。这种"server 极简 + client 拼装"的哲学贯穿 Google 早期系统。

## 延伸阅读

- 论文 14 页：[Bigtable OSDI 2006 PDF](https://research.google.com/archive/bigtable-osdi06.pdf)（写得很白话，比大多数 OSDI 论文好读）
- 视频讲解：[Tim Berglund — NoSQL Distilled](https://www.youtube.com/results?search_query=bigtable+paper+walkthrough)（搜 "Bigtable paper walkthrough"）
- 配套阅读：[[gfs]] 和 [[chubby]] —— Bigtable 站在它俩肩膀上
- 后续演化：[[spanner-2012]] —— Bigtable + 全球事务
- 开源克隆：HBase 官方文档（直接对照论文章节读）

## 关联

- [[gfs]] —— Bigtable 的字节存储底座，所有 SSTable 和 commit log 都落在 GFS 上
- [[chubby]] —— Bigtable 的协调服务，master 选举 + tablet 元数据锁
- [[mapreduce]] —— Bigtable 既是 MR 的输入也是输出，scan API 直接喂 mapper
- [[spanner-2012]] —— Bigtable 的"加事务"后继，把跨行/跨表也变强一致
- [[dynamo]] —— 同代 NoSQL 的另一条路（无 master + 最终一致），与 Bigtable 形成对照
- [[cassandra]] —— 借走 SSTable + LSM 但用 Dynamo 的 gossip 拓扑，兼具两家血脉
- [[rocksdb-lsm]] —— LSM-tree 的现代单机实现，思想直接继承自 Bigtable
- [[aurora]] —— 云原生关系数据库，存储层借鉴了"日志即数据"的思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[akamai-2002]] —— Akamai 2002 — 把网站搬到离用户 10 毫秒的地方
- [[akamai-2010]] —— Akamai 2010 — 从内容分发网络长成全球应用平台
- [[aurora]] —— Aurora — 把数据库的下半身换成日志机
- [[azure-storage-2011]] —— Windows Azure Storage 2011 — 云对象存储第一次在工业界做到强一致
- [[brewer-cap-2000]] —— Brewer CAP — 网络一断电，一致性和可用性只能留一个
- [[cassandra-2010]] —— Cassandra 2010 — 把 Dynamo 的 P2P 骨架和 Bigtable 的列族数据模型拼成一个东西
- [[ceph-2006]] —— Ceph — 让分布式文件系统不靠中心查表
- [[chubby]] —— Chubby — 给凡人用的分布式锁服务
- [[cockroachdb-2020]] —— CockroachDB 2020 — 没原子钟也能做全球强一致 SQL 数据库
- [[consistent-hashing-1997]] —— Consistent Hashing — 加机器只搬一小部分数据的哈希环
- [[craq-2009]] —— CRAQ — 让链复制每个节点都能读，吞吐线性扩展
- [[cstore-2005]] —— C-Store — 把数据按列存，分析查询直接快十倍
- [[dapper-2010]] —— Dapper — Google 大规模分布式系统链路追踪基础设施
- [[dataflow-model-2015]] —— Dataflow Model — 流处理的四问框架
- [[dewitt-gray-1992]] —— DeWitt-Gray 1992 — 并行数据库取代专用机的宣言
- [[diskann-2019]] —— DiskANN — 单机十亿向量近邻检索（图存 SSD）
- [[drizzle-2017]] —— Drizzle — 让 micro-batch 也能跑出 100ms 延迟
- [[dstreams-2013]] —— D-Streams — 把流处理伪装成一串很小的批
- [[dynamo]] —— Dynamo — 让购物车永远能写入的分布式存储
- [[faiss-2017]] —— FAISS 2017 — 用 GPU 在十亿向量里找最近邻
- [[foundationdb-2021]] —— FoundationDB 2021 — 把数据库拆成五个角色，再用一个 seed 烧十年 bug
- [[gfs]] —— GFS — 编译器决定不做哪些事
- [[gilbert-lynch-2002]] —— Gilbert-Lynch 2002 — 把 CAP 从口号写成数学定理
- [[google-1998]] —— Google 1998 — 把整个网络爬下来、压扁、再用一秒查到
- [[hdfs-2010]] —— HDFS — 把 GFS 用 Java 重写一遍并撑到 25 PB
- [[kafka-2011]] —— Kafka NetDB 2011 — 把消息中间件砍成"会写文件的水管"
- [[karger-1997-consistent-hashing]] —— Karger 1997 一致性哈希 — 加机器不用全员搬家
- [[leveldb]] —— LevelDB — Google LSM 库
- [[lmdb-2011]] —— LMDB 2011 — 把数据库直接 mmap 进内存的嵌入式 KV 存储
- [[mapreduce]] —— MapReduce — 用户只写两个函数，框架替你扛千节点
- [[megastore-2011]] —— Megastore — 把数据切成"小数据库"换跨地域同步复制
- [[millwheel-2013]] —— MillWheel 2013 — Google 给互联网级流处理装上不漏不重的发动机
- [[percolator-2010]] —— Percolator 2010 — 给 Bigtable 加分布式事务的客户端库
- [[pnuts-2008]] —— PNUTS — 介于强一致与最终一致之间的实用一致性
- [[product-quantization-2011]] —— Product Quantization — 把向量切碎再压成几个字节
- [[quic]] —— QUIC — 把可靠传输从内核搬到用户空间
- [[rocksdb-2017]] —— RocksDB 2017 — 把 LSM-Tree 的"空间放大"压到极低的工业经验
- [[rocksdb-lsm]] —— LSM-tree 与 RocksDB — 把所有写都变成顺序写
- [[silt-2011]] —— SILT — 0.7 字节内存索引一条记录的 flash 键值存储
- [[snowflake-2016]] —— Snowflake 2016 — 把数仓拆成 storage / compute / services 三层
- [[spanner-2012]] —— Spanner 2012 — 用原子钟和 GPS 给全球数据库发时间戳
- [[sqlite-2022]] —— SQLite — 嵌入式数据库 30 年怎么活下来的
- [[stonebraker-2010-sqlnosql]] —— Stonebraker 2010 SQL vs NoSQL — 慢的是老实现，不是 SQL
- [[tachyon-2014]] —— Tachyon — 把集群存储推到内存速度，丢了再算回来
- [[tidb-2020]] —— TiDB 2020 — 给 Raft 加一个"旁听生"，让一份数据同时跑事务和分析
- [[unix-1974]] —— UNIX 1974 — 用极小内核做出能用的分时系统

