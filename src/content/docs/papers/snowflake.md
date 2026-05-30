---
title: Snowflake — 把数仓的存储和计算撕成两半
来源: 'Dageville et al., "The Snowflake Elastic Data Warehouse", SIGMOD 2016'
日期: 2026-05-30
分类: 数据库
难度: 中级
---

## 是什么

Snowflake 是一种**让数据库的"硬盘"和"CPU"完全分家**的云数仓架构。日常类比：以前 KTV 的话筒、点歌机、音箱是绑死的一整套，搬走就得整套搬；Snowflake 把这套拆成"歌库放云端 + 自己带话筒进包间 + 用完话筒就退还"。

你写：

```sql
CREATE WAREHOUSE my_wh WITH WAREHOUSE_SIZE = 'LARGE';
SELECT * FROM orders WHERE day = '2026-01-01';
```

执行时，**数据**在 S3（云存储），**算力**临时启动 8 台 EC2 来跑这个查询，跑完算力释放，数据原地不动。下次别人查同一份 orders 表，可以用完全不同尺寸的算力。

这就是 2016 年之后所有云数仓（Databricks SQL / Redshift Serverless / BigQuery）都在抄的范式。

## 为什么重要

不理解 Snowflake，下面这些事都没法解释：

- 为什么 Databricks 估值能跟 Snowflake 掰手腕——它们俩架构思路高度同源
- 为什么 AWS 2022 年才推出 Redshift Serverless——这等于承认自家 shared-nothing Redshift 已过时
- 为什么数仓圈 2016 之后突然开始流行"按秒计费"——存算分离是定价模式革新的前提
- 为什么[[aurora]] 把 redo log 推到存储层、Snowflake 把整张表推到 S3——同一种"状态下沉"思路的两个产物

## 核心要点

Snowflake 三层架构可以拆成 **三件事**：

1. **Storage 层就是 S3**：每张表切成几百到几千个 50-500 MB 的 immutable 列存文件（叫 micro-partition），扔进 S3。类比：图书馆把书拆成不可改的小册子，要改就出新册子，老册子永远不动。

2. **Virtual Warehouse 是临时雇的工人**：用户选 T-shirt 尺寸（XS/S/M/L/XL/...每升一档节点数翻倍），系统启动对应数量的 EC2 跑查询。类比：搬家时按要搬几件家具叫几个工人，搬完就解散，按工时付钱。

3. **Cloud Services 是中央调度室**：管表 schema、micro-partition 列表、事务版本号、用户权限。类比：图书馆的总台和借阅卡系统——书在仓库，工人在临时雇，但谁能借哪本书、改了哪本书，全在总台记一笔。

三层独立扩缩容，**Virtual Warehouse 完全无状态**——挂了重启一个就行，不丢数据不丢事务。这是 Snowflake 弹性的根源。

为什么三层都能独立扩？因为状态都集中到 Cloud Services 一层，VW 是纯算力，Storage 是纯字节，没有"哪台机器拥有哪段数据"的物理绑定。

## 实践案例

### 案例 1：同一份数据三个 VW 同时跑

```sql
-- 夜间 ETL，吃重负载
CREATE WAREHOUSE etl_wh WITH WAREHOUSE_SIZE = 'XLARGE';
INSERT INTO fact_orders SELECT ... FROM staging.orders;

-- 白天 BI 报表，中等负载
CREATE WAREHOUSE bi_wh WITH WAREHOUSE_SIZE = 'SMALL';
SELECT region, SUM(amount) FROM fact_orders GROUP BY region;

-- 数据科学家 ad-hoc，最小负载
CREATE WAREHOUSE ds_wh WITH WAREHOUSE_SIZE = 'XSMALL';
SELECT * FROM fact_orders WHERE user_id = 12345;
```

三个 VW 跑在不同 EC2 集群上，**互不抢资源**，但读的是同一份 S3 数据。这在传统 shared-nothing 数仓里要么塞死、要么得复制三份数据。

### 案例 2：Zero-Copy Clone 一秒克隆 1 TB 表

```sql
CREATE TABLE orders_test CLONE orders;
```

直觉以为要 1 小时复制 1 TB——实际几秒完成。原因：micro-partition 是 immutable 的，clone 只复制 metadata（指针），不动 S3 上的字节。

测试环境改 `orders_test` 时才会写新 micro-partition，原 `orders` 的文件原地不动。这就是 immutable + COW（copy-on-write）的复合招式。

### 案例 3：Time Travel 回溯到一小时前

```sql
SELECT * FROM orders AT(OFFSET => -3600);  -- 一小时前的快照
UNDROP TABLE orders_2026;                  -- 误删后救回来
```

实现方式：每次写入产生新 micro-partition + 新 metadata version，老的不删。读查询固定一个 version，看到的就是一致快照。代价是**老 micro-partition 一直占 S3 空间**，默认保留 1 天，长留要付钱。

## 踩过的坑

1. **短查询付费比扭曲**：VW idle 60s 才 suspend，1000 个 5 秒查询实际计费按 ~16 分钟算，付费比可达 200×。短查询场景必须自己做 query batching 才省钱。

2. **高并发 update/delete 性能差**：Snapshot Isolation + immutable 让每次改动都重写整个 micro-partition，实测比 PostgreSQL 慢 10-100×。Snowflake 不适合 OLTP，只适合"读多写少"。

3. **Schema evolution 半免费**：加列免费（metadata-on-read 虚拟填充），但改类型 / 删列要重写所有 micro-partition，TB 级表改一次几小时。

4. **Cloud Services 是元数据单点**：FoundationDB 多副本但跨 region 故障时所有 VW 一起瘫。2020 年 us-east-1 4 小时故障公开 RCA 提到 metadata service 是瓶颈，这是单点假设的实证。

## 适用 vs 不适用场景

**适用**：

- 读多写少 + 数据量 TB-PB 级的分析负载（BI 报表、数据科学、用户行为分析）
- 跨团队/跨业务线共享同一份数据（不同 VW 互不干扰）
- 成本敏感的突发负载（夜间 ETL 跑 4XL，白天 BI 跑 S，周末降到 XS）
- 合规与审计（Time Travel 回溯任意时间点 + Cloning 低成本测试）

**不适用**：

- OLTP 场景（高并发 update/delete 性能远低于 PostgreSQL）
- 实时流式写入（Snowpipe 也只能做到秒级，毫秒级实时还得叠 [[kafka]] + Flink）
- 极致延迟敏感的交互式查询（VW 冷启动 1-3 秒）
- 数据量 < 100 GB 的小型场景（[[duckdb]] 单机更划算）

## 历史小故事（可跳过）

- **2012 年**：Oracle 三个老兵（Dageville / Cruanes / Zukowski）创立 Snowflake，看准 AWS 已经成熟，决定彻底重做云原生数仓。
- **2014 年**：Snowflake GA，第一个大客户来自广告分析行业，因为他们最痛苦于"加节点要停机一周"。
- **2016 年**：SIGMOD 发论文公开架构，工业界 track 12 页，几乎一夜之间成为云数仓教科书。
- **2020 年**：IPO，首日市值 $700 亿，创软件史最大规模上市纪录。证明"存算分离 + 按秒计费"是可行的商业模式。

之后 5 年，Databricks SQL / Redshift Serverless / BigQuery 全部往这条路靠。

## 学到什么

1. **存算分离不是技术选型，是商业模式革新**——按秒付计算 + 按 GB-月付存储，让两类成本曲线分开
2. **Immutable 是云存储的天生朋友**——S3 PUT 是原子的，in-place update 是噩梦；选 immutable 顺便免费拿到 Time Travel / Clone
3. **状态集中到一层（Cloud Services）让其他层无状态**——这是云原生数据库的金科玉律，跟 [[aurora]] 把 redo 推到存储层是同一思路
4. **T-shirt sizing 把运维伪装成产品决策**——DBA 工作量降到接近零，这是 SaaS 的精髓

## 延伸阅读

- 论文 PDF：[The Snowflake Elastic Data Warehouse, SIGMOD 2016](https://event.cwi.nl/lsde/papers/p215-dageville-snowflake.pdf)（12 页，骨架在 §2 + §3）
- 视频：[Andy Pavlo CMU 15-721 — Snowflake Architecture](https://www.youtube.com/watch?v=_q4mAGM9k50)（CMU 数据库课讲 Snowflake 一节，1 小时）
- [[aurora]] —— AWS 把 redo log 推到存储层的 OLTP 版"存算分离"
- [[spanner-2012]] —— Google 全球分布式数据库，影响了 Snowflake 事务设计
- [[stonebraker-2010-sqlnosql]] —— SQL/NoSQL 之争的背景，Snowflake 是"SQL 派"在云时代的回归

## 关联

- [[aurora]] —— 思路同源的 OLTP 存算分离先驱（Aurora 2014 上线，Snowflake 受其启发）
- [[spanner-2012]] —— 全球分布式数据库，Snowflake 跨 region 一致性方案的精神前辈
- [[bigtable-2006]] —— 列存 + immutable SSTable 的祖宗，Snowflake micro-partition 是它的云时代变种
- [[gfs]] —— 共享对象存储的早期工业实现，启发了 S3 / Snowflake 数据层
- [[mapreduce]] —— 把"廉价存储 + 弹性计算"思路引入数据领域的开山之作
- [[duckdb]] —— 单机版"反规模"派，跟 Snowflake 是分布式 vs 嵌入式两个极端
- [[dewitt-gray-1992]] —— 并行数据库奠基论文，Snowflake 是它在云时代的应答

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aurora]] —— Aurora — 把数据库的下半身换成日志机
- [[bigtable]] —— Bigtable — Google 把行级随机读写做到 PB 级的存储
- [[bigtable-2006]] —— Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统
- [[cstore-2005]] —— C-Store — 把数据按列存，分析查询直接快十倍
- [[dewitt-gray-1992]] —— DeWitt-Gray 1992 — 并行数据库取代专用机的宣言
- [[duckdb]] —— DuckDB — 嵌入式列存 OLAP
- [[gfs]] —— GFS — 编译器决定不做哪些事
- [[mapreduce]] —— MapReduce — 用户只写两个函数，框架替你扛千节点
- [[monetdb-x100-2005]] —— MonetDB/X100 — 让数据库一次处理一向量行而不是一行
- [[spanner]] —— Spanner — 全球分布式 SQL 数据库
- [[spanner-2012]] —— Spanner 2012 — 用原子钟和 GPS 给全球数据库发时间戳
- [[stonebraker-2010-sqlnosql]] —— Stonebraker 2010 SQL vs NoSQL — 慢的是老实现，不是 SQL
- [[system-r-1976]] —— System R 1976 — 第一个跑起来的关系数据库

