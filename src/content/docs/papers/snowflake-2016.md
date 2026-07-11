---
title: Snowflake 2016 — 把数仓拆成 storage / compute / services 三层
来源: 'Dageville et al., "The Snowflake Elastic Data Warehouse", SIGMOD 2016'
日期: 2026-05-30
分类: 数据库
难度: 中级
---

## 是什么

Snowflake 2016 是一篇 **SIGMOD 工业 track 论文**，把一个 2015 年 GA 的云数仓产品的内部架构第一次完整公开。它的核心主张：**传统 shared-nothing 数仓在云上不够灵活，把"存储"和"计算"完全解耦才是云原生的形态**。

日常类比：以前 KTV 的话筒、点歌机、音箱是绑死的整套；这篇论文证明你可以把"歌库放云端 + 自己带话筒进包间 + 用完话筒就退还"——而且**已有真实付费客户在生产跑百万级查询/天**。

它给出的三层架构：

```
┌──────────────────────┐
│  Cloud Services      │  ← 元数据、事务、优化器、权限
├──────────────────────┤
│  Virtual Warehouses  │  ← 临时启动的 EC2 集群，无状态
├──────────────────────┤
│  Data Storage (S3)   │  ← 列存 micro-partition，immutable
└──────────────────────┘
```

之后所有云数仓（Databricks SQL / Redshift Serverless / BigQuery）的论文和文档都把这张图当作参考线。

## 为什么重要

不读这篇论文，下面这些事都没法解释：

- 为什么 2016 年之前 Vertica / Greenplum 等 shared-nothing 数仓那么火，2016 之后突然没人讲了
- 为什么 [[aurora]] 把 redo 推到存储层和这篇文章被并称为"云原生数据库的两大宣言"
- 为什么 "T-shirt sizing"（XS/S/M/L/XL）成了云数仓的标配定价模式
- 为什么这一篇 12 页论文的引用数远超许多顶会获奖文章——它定义了一整个工业范式

## 核心要点

论文 §3 把架构拆成 **三层**，每层独立扩缩容：

1. **Storage 层 = S3**：每张表切成几百到几千个 50–500 MB 的 immutable 列存文件（论文里叫 micro-partition）。修改只能通过"写新文件 + metadata 切版本"完成。类比：图书馆把书拆成不可改的小册子，要改就出新册子。

2. **Virtual Warehouse 层 = 临时 EC2 集群**：用户选 T-shirt 尺寸，每升一档节点数翻倍。VW **完全无状态**：本地只有缓存，挂了重启一个就行。类比：搬家时按家具量叫工人，搬完解散，按工时付钱。

3. **Cloud Services 层 = 中央调度室**：管表 schema、micro-partition 列表、事务版本号、查询优化、权限。论文写的是可扩展事务型 KV；产品侧后来公开用 FoundationDB 多副本。类比：图书馆总台和借阅卡系统——书在仓库、工人临时雇，但谁能借哪本书全在总台记一笔。

为什么三层都能独立扩？因为**所有可变状态都集中到 Cloud Services**，VW 是纯算力，Storage 是纯字节，没有"哪台机器拥有哪段数据"的物理绑定。这是 shared-nothing 数仓做不到的：那种架构里数据和节点绑死，加节点就要重新分片。

## 实践案例

### 案例 1：同一份数据，三个 VW 同时跑

```sql
-- 夜间 ETL
CREATE WAREHOUSE etl_wh WITH WAREHOUSE_SIZE = 'XLARGE';
INSERT INTO fact_orders SELECT ... FROM staging.orders;

-- 白天 BI
CREATE WAREHOUSE bi_wh WITH WAREHOUSE_SIZE = 'SMALL';
SELECT region, SUM(amount) FROM fact_orders GROUP BY region;

-- 数据科学家 ad-hoc
CREATE WAREHOUSE ds_wh WITH WAREHOUSE_SIZE = 'XSMALL';
SELECT * FROM fact_orders WHERE user_id = 12345;
```

逐步对照：三个 VW = 三套独立 EC2，**互不抢 CPU**；计费按各自尺寸与运行时长分开算；数据仍是同一份 S3。论文 §3 把整套架构叫 "multi-cluster, shared-data"——shared-nothing 数仓里要么塞死要么得复制三份。

### 案例 2：Zero-Copy Clone 一秒克隆 1 TB 表

```sql
CREATE TABLE orders_test CLONE orders;
```

直觉以为要 1 小时复制 1 TB——实际几秒完成。原因：micro-partition 是 immutable 的，clone 只复制 metadata（指针），不动 S3 字节。改 `orders_test` 时才写新 micro-partition。这是 immutable + COW 的复合招式，论文 §4.4 专门讲。

### 案例 3：Time Travel 回溯到一小时前

```sql
SELECT * FROM orders AT(OFFSET => -3600);  -- 一小时前快照
UNDROP TABLE orders_2026;                  -- 误删救回
```

实现：每次写入产生新 micro-partition + 新 metadata version，老版本不删。读查询固定一个 version，看到的是一致快照。代价：老 micro-partition 占 S3 空间（产品默认约 1 天，论文写可配置最长约 90 天）。论文 §4.4 把 Time Travel 与 Clone 放在同一组特性里讲。

## 踩过的坑

1. **短查询付费比扭曲**：VW idle 60s 才 suspend，1000 个 5 秒查询实际计费按 ~16 分钟算，付费比可达 200×。论文没明说，但 2018 年后社区反复抱怨。

2. **高并发 update/delete 性能差**：Snapshot Isolation + immutable 让每次改动都重写整个 micro-partition，比 PostgreSQL 慢 10–100×。Snowflake **不适合 OLTP**，论文 §6 也直接承认。

3. **Schema evolution 半免费**：加列免费（metadata-on-read 虚拟填充），但改类型 / 删列要重写所有 micro-partition，TB 级表改一次几小时。

4. **Cloud Services 是元数据单点**：事务型 KV 多副本仍挡不住跨 region 故障时所有 VW 一起瘫。2020 年 us-east-1 约 4 小时事故公开 RCA 把 metadata service 列为根因——这是论文里"集中状态"假设的实证代价。

## 适用 vs 不适用场景

**适用**：

- 读多写少 + 数据量 TB–PB 级的分析负载（BI 报表 / 数据科学 / 用户行为分析）
- 跨团队共享同一份数据（不同 VW 互不干扰）
- 突发负载 + 成本敏感（夜间 4XL，白天 S，周末 XS）
- 合规审计场景（Time Travel + Clone）

**不适用**：

- OLTP（高并发 update/delete 远低于 PostgreSQL）
- 实时流式写入（Snowpipe 也只能秒级，毫秒级要叠 [[kafka]] + Flink）
- 极致低延迟交互（VW 冷启 1–3 秒）
- 数据量 < 100 GB 的小场景（[[duckdb]] 单机更划算）

## 历史小故事（可跳过）

- **2012 年**：Oracle 三个老兵（Dageville / Cruanes / Zukowski，最后一位是 [[monetdb-x100-2005]] 作者）创立 Snowflake，决定用 AWS 重做云原生数仓。
- **2015 年 6 月**：产品 GA（论文原文）。早期客户多来自广告分析，最痛苦于"加节点要停机一周"。
- **2016 年**：本论文发在 SIGMOD 工业 track，12 页，公开三层架构。同年 Aurora 论文也发表，两篇并称为"云原生数据库奠基"。
- **2020 年**：Snowflake IPO，首日市值约 $700 亿，证明"存算分离 + 按秒计费"是可行的商业模式。

之后 5 年，Databricks SQL / Redshift Serverless / BigQuery 全部往这条路靠。

## 学到什么

1. **存算分离不是技术选型，是商业模式革新**——按秒付计算 + 按 GB-月付存储，让两类成本曲线分开
2. **Immutable 是云存储的天生朋友**——S3 PUT 是原子的，in-place update 是噩梦；选 immutable 顺便免费拿 Time Travel / Clone
3. **状态集中到一层让其他层无状态**——这是云原生数据库金科玉律，跟 [[aurora]] 把 redo 推到存储层是同一思路
4. **工业论文也能定义范式**——这篇 12 页文章引用量超过许多顶会奖项作品，靠的不是新理论，而是"先把它造出来跑给业界看"

## 延伸阅读

- 论文 PDF：[The Snowflake Elastic Data Warehouse, SIGMOD 2016](https://event.cwi.nl/lsde/papers/p215-dageville-snowflake.pdf)（12 页，骨架在 §2 + §3）
- 视频：[Andy Pavlo CMU 15-721 — Snowflake Architecture](https://www.youtube.com/watch?v=_q4mAGM9k50)（CMU 数据库课讲 Snowflake 一节）
- 续作：[Building An Elastic Query Engine on Disaggregated Storage, NSDI 2020](https://www.usenix.org/system/files/nsdi20-paper-vuppalapati.pdf)（同团队四年后回顾运行经验）
- [[aurora]] —— AWS 把 redo log 推到存储层的 OLTP 版"存算分离"
- [[bigtable-2006]] —— 列存 + immutable SSTable 的祖宗
- [[dewitt-gray-1992]] —— 并行数据库奠基，本论文的精神前辈

## 关联

- [[aurora]] —— OLTP 存算分离先驱，与本论文并列云原生数据库奠基双子
- [[spanner-2012]] —— 全球分布式数据库，影响 Snowflake 跨 region 一致性方案
- [[bigtable-2006]] —— immutable 列存的祖宗，micro-partition 是它在云时代的变种
- [[gfs]] —— 共享对象存储早期工业实现，启发 S3 / Snowflake 数据层
- [[mapreduce]] —— "廉价存储 + 弹性计算"思路引入数据领域的开山之作
- [[duckdb]] —— 单机版"反规模"派，与 Snowflake 是分布式 vs 嵌入式两个极端
- [[dewitt-gray-1992]] —— 并行数据库宣言，Snowflake 是其云时代应答
- [[cstore-2005]] —— 列存奠基，Snowflake micro-partition 是其云原生变体
- [[vertica-2012]] —— C-Store 走向商业产品；Snowflake 是它"再上云一次"
- [[monetdb-x100-2005]] —— 向量化执行祖宗，作者后加入 Snowflake 团队

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bigtable]] —— Bigtable — 把巨大表格切到上千台机器上
- [[data-lake-management-2019]] —— Data Lake Management 2019 — 数据湖从文件堆变成可治理资产
- [[delta-lake-2020]] —— Delta Lake 2020 — 给对象存储补上事务日志
- [[dremel-decade-2020]] —— Dremel 十年回顾 — BigQuery 背后的交互式云数仓路线
- [[duckdb-2019]] —— DuckDB — 把 OLAP 数据库塞进你的 Python 进程
- [[lakehouse-2021]] —— Lakehouse 2021 — 把数据湖和数仓合成一套开放平台
- [[databend]] —— Databend — Rust 写的存算分离云数仓
