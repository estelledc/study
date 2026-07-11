---
title: Snowflake — 云数仓把存储和计算拆开
来源: 'Dageville et al., "The Snowflake Elastic Data Warehouse", SIGMOD 2016'
日期: 2026-07-09
分类: 数据库系统
难度: 中级
---

## 是什么

Snowflake 是一套**专门为云设计的数据仓库**。日常类比：传统数仓像一家仓库和工人绑在一起的超市，货架在哪，工人就必须在哪；Snowflake 像把货物放进公共大仓库，哪个团队要干活，就临时叫一队工人来同一个仓库取货。

这篇 2016 年 SIGMOD 论文公开了 Snowflake 的核心架构：**multi-cluster shared-data**。意思是数据只有一份，存在云对象存储里；计算集群可以有很多份，按需启动、关闭、变大、变小，而且彼此不抢机器。

一句话定位：**Snowflake 把数据仓库从“买一台大机器”改成“数据放云仓库，计算按需租工人”**。

## 为什么重要

不理解 Snowflake，下面这些事都没法解释：

- 为什么云数仓可以“暂停计算但数据还在”，本地机房数仓通常做不到
- 为什么同一份表能同时给 BI、ETL、数据科学团队跑，互相干扰少很多
- 为什么 Snowflake / Databend / BigQuery / Redshift Serverless 都在讲“存算分离”
- 为什么对象存储虽然慢，却成了现代数据仓库的默认底座

## 核心要点

Snowflake 的设计可以拆成 **三层**：

1. **Data Storage：公共仓库**。表被切成很多不可变的列式文件，放在 S3 这类对象存储里。类比：所有货物贴好标签放到中央仓库，工人不拥有货，只按订单来取。

2. **Virtual Warehouse：临时工队**。一个虚拟仓库就是一组只负责跑 SQL 的计算节点，可以随时启动、停止、扩容。类比：早高峰多叫几队工人，夜里没人下单就让工人下班。

3. **Cloud Services：调度大脑**。它负责权限、元数据、优化器、事务、查询状态和计费。类比：仓库办公室负责登记货物、安排工队、检查谁能看什么货。

三层分开后，Snowflake 得到的不是一个小优化，而是新的产品形态：计算可以按秒付费，工作负载可以隔离，升级和故障恢复也更像云服务。

这里最反直觉的一点是：Snowflake 没有要求对象存储像本地磁盘一样快。它接受 S3 延迟高这个现实，然后用大文件、列式读取、本地缓存、文件级统计来绕开问题。

所以这篇论文真正教的是边界设计：慢的东西放在共享层，快的东西放在临时计算层，中间用元数据把两边接起来。

## 实践案例

### 案例 1：给两个团队各开一个虚拟仓库

```sql
CREATE WAREHOUSE bi_wh WITH WAREHOUSE_SIZE = 'SMALL';
CREATE WAREHOUSE etl_wh WITH WAREHOUSE_SIZE = 'LARGE';
```

**逐部分解释**：

- `bi_wh` 给报表团队跑 dashboard，体量小但希望稳定
- `etl_wh` 给夜间导入跑大批量任务，体量大但只用几个小时
- 两个 warehouse 读的是同一份表文件，不需要复制数据

这就是论文说的隔离：一个团队的重查询不会占走另一个团队的 worker node。

### 案例 2：查询只读需要的列和文件

```sql
SELECT sum(amount)
FROM orders
WHERE order_date >= '2026-01-01';
```

**逐部分解释**：

- 表文件是列式布局，扫描时只读 `amount` 和 `order_date`
- 每个文件有 min/max 统计，日期范围不可能命中的文件会被 prune 掉
- 这不是用户手动建索引，而是系统自动维护的文件级元数据

类比：不是把整本账本搬出来翻，而是先看目录页，只拿“今年订单金额”那几页。

### 案例 3：用不可变文件做 time travel 和 clone

```sql
SELECT * FROM orders AT(OFFSET => -60 * 5);
CREATE TABLE orders_test CLONE orders;
```

**逐部分解释**：

- `AT` 表示查询 5 分钟前的表版本
- `CLONE` 只复制元数据，不立刻复制底层文件
- 因为旧文件不会原地改写，多个表版本可以共享同一批文件

这像拍文件夹快照：不是把所有照片重新拷贝一遍，而是先记住“这一刻有哪些照片”。

## 踩过的坑

1. **把存算分离理解成免费性能**：对象存储延迟高，Snowflake 仍要靠本地缓存、列裁剪和 pruning 才能跑快。
2. **以为 virtual warehouse 会自动共享空闲机器**：论文里的 worker node 不跨 warehouse 共享，所以隔离强，但利用率也可能降低。
3. **把 clone 当成物理复制**：clone 初始只复制元数据，省空间；但后续两边各自修改，会逐渐产生新文件。
4. **忽略 Cloud Services 的复杂度**：用户只看见“无 DBA”，但权限、事务、元数据和升级都被集中到服务层，工程难度没有消失。

## 适用 vs 不适用场景

**适用**：

- 企业数据仓库、BI 报表、批量 ETL、日志分析等 OLAP 场景
- 多团队共享同一份数据，但希望查询互不拖累
- 负载有波峰波谷，希望按需启动计算而不是长期养机器
- 半结构化数据较多，需要先装进去再慢慢整理字段

**不适用**：

- 高频单行事务写入，例如支付扣款、库存扣减
- 极低延迟点查，例如每次请求都要毫秒级查一行
- 必须完全掌控底层文件格式和调度策略的自建平台
- 数据量很小、并发很低的场景，用 Postgres / DuckDB 可能更简单

## 历史小故事（可跳过）

- **2012 年**：Benoit Dageville、Thierry Cruanes、Marcin Zukowski 等数据库工程师开始从零做云数仓。
- **2014 年**：Snowflake 走出 stealth，主打“真正为云重写，而不是把老数据库搬上云”。
- **2015 年**：Snowflake 一般可用，论文说当时已经每天跑数百万查询、管理多 PB 数据。
- **2016 年**：SIGMOD 论文发表，正式把 multi-cluster shared-data 这个架构讲清楚。
- **2020 年后**：存算分离变成云数仓默认答案，很多新系统都绕不开这篇论文。

## 学到什么

1. **云不是部署地点，而是设计约束**：对象存储、弹性机器、按量计费会反过来改变数据库结构。
2. **隔离和共享可以同时存在**：数据共享在存储层，计算隔离在 warehouse 层，两者不矛盾。
3. **不可变文件让很多功能变简单**：事务版本、time travel、clone、失败重试都能围绕“新增文件 + 元数据切换”来做。
4. **少调参是一种架构目标**：Snowflake 不让用户建索引、管 vacuum、挑分布键，是把复杂度收进服务层。
5. **产品体验会倒逼系统结构**：为了让用户只选择 warehouse 大小，底层必须自动做统计、缓存、重试、升级和安全。

## 延伸阅读

- 论文 PDF：[The Snowflake Elastic Data Warehouse](https://info.snowflake.net/rs/252-RFO-227/images/Snowflake_SIGMOD.pdf)（12 页，工业论文，适合配合本笔记读）
- ACM 页面：[The Snowflake Elastic Data Warehouse](https://dl.acm.org/doi/10.1145/2882903.2903741)（包含作者、会议和 DOI）
- 背景论文：[[dewitt-gray-1992]] —— 先理解 shared-nothing 并行数据库为什么曾经是主流
- 列存源头：[[cstore-2005]] —— Snowflake 的列式文件、压缩和 OLAP 执行都继承这条路线
- 对照系统：[[aurora]] —— 同样云原生，但 Aurora 面向 OLTP，Snowflake 面向 OLAP
- 工程对照：[[clickhouse]] —— 同是列存分析库，但更偏本地盘和单集群极致性能

## 关联

- [[aurora]] —— 云原生 OLTP 的代表，用来对照 Snowflake 为什么服务 OLAP。
- [[cstore-2005]] —— 列存思想源头，解释 Snowflake 为什么按列读、按列压缩。
- [[dewitt-gray-1992]] —— 并行数据库路线宣言，Snowflake 是云时代的续写和反转。
- [[clickhouse]] —— 同为列式 OLAP，区别是 ClickHouse 更贴近本地集群，Snowflake 更贴近云服务。
- [[greenplum-db]] —— 传统 MPP 数仓代表，对比能看清“节点拥有数据”的代价。
- [[dremel-2010]] —— BigQuery 背后的交互式分析论文，和 Snowflake 共同定义云上 OLAP。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aurora]] —— Aurora — 把数据库的下半身换成日志机
- [[papers/clickhouse]] —— ClickHouse — 把列存 OLAP 推到硬件极限
- [[cstore-2005]] —— C-Store — 把数据按列存，分析查询直接快十倍
- [[dewitt-gray-1992]] —— DeWitt-Gray 1992 — 并行数据库取代专用机的宣言
- [[monetdb-x100-2005]] —— MonetDB/X100 — 让数据库一次处理一向量行而不是一行
- [[spanner]] —— Spanner — 全球分布式 SQL 数据库
- [[papers/starrocks]] —— StarRocks — Doris 分叉出来的向量化 CBO 国产 OLAP
- [[system-r-1976]] —— System R 1976 — 第一个跑起来的关系数据库
- [[vertica-2012]] —— Vertica 2012 — C-Store 论文走向产品的七年改造账
- [[dbt-core]] —— dbt-core — 把 SQL 当工程代码写，让数据仓库里的转换跑起来
- [[lightdash]] —— Lightdash — 寄生在 dbt 项目里的开源 BI
