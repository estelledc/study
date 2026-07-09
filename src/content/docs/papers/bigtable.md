---
title: Bigtable — 把巨大表格切到上千台机器上
来源: 'Chang et al., "Bigtable: A Distributed Storage System for Structured Data", OSDI 2006'
日期: 2026-07-09
分类: 数据库系统
难度: 中级
---

## 是什么

Bigtable 是 Google 设计的分布式结构化存储系统。日常类比：它像一张超大的电子表格，只是这张表大到一台机器放不下，只能切成很多小片分散在上千台机器上。

它的每个格子不是一个值，而是一串按时间排序的版本。你可以把它想成“行、列、时间”三个坐标定位到一摞小纸条。

最小写入长这样：

```text
Put("com.example.www", "contents:html", 20060815, "<html>...</html>")
```

这表示：在 `com.example.www` 这一行、`contents:html` 这一列、`20060815` 这个时间版本里写入页面内容。

## 为什么重要

- 不理解 Bigtable，就很难解释 HBase、Cassandra、Cloud Bigtable 这些系统为什么长成宽列表。
- 不理解 Bigtable，就会误把 NoSQL 理解成“不要 SQL”，而看不到它真正牺牲了 join、二级索引和跨行事务。
- 不理解 Bigtable，就看不懂 LSM-tree、SSTable、compaction 为什么成了后续存储引擎的常用套路。
- 不理解 Bigtable，就无法判断 row key 设计为什么比“加几列字段”更影响性能。

## 核心要点

1. **三维稀疏有序表**。Bigtable 的 key 是 `(row, column, timestamp)`，value 是任意字节。类比图书馆：row 是书架，column 是书格，timestamp 是同一本书的不同版本。

2. **tablet 是扩展单位**。一张表会按 row range 切成 tablet，不同 tablet 放到不同 tablet server。类比把一本电话簿按姓氏范围撕成很多册，分给不同柜台查。

3. **写入走 LSM 思路**。写先进入内存表和日志，再刷成不可变 SSTable，后台合并。类比先把新账记在便签本，晚上再整理进正式账册。

## 实践案例

### 案例 1：网页爬虫存页面历史

爬虫可以把 URL 反转后当 row key。

```text
row = "com.cnn.www/index.html"
column = "contents:html"
timestamp = 20060815
value = "<html>v1</html>"
```

逐部分解释：

- 反转域名让同一个站点的页面在字典序里靠近，范围扫描更顺。
- `contents:html` 是列族加列名，适合把页面内容放在一起。
- timestamp 让系统能保留多个历史版本，而不是每次覆盖旧页面。

### 案例 2：时序指标不要直接用时间做 row key

直觉上你可能想这样写：

```text
row = "2026-07-09T12:00:00"
column = "cpu:machine-42"
value = "0.87"
```

问题是所有新写入都会集中到最新时间附近，容易把同一个 tablet server 打热。

更稳的方式是：

```text
row = "machine-42#cpu"
column = "value:"
timestamp = 1783579200
value = "0.87"
```

逐部分解释：

- row 用机器和指标分散写入位置。
- timestamp 放进版本维度，用来保留历史值。
- 过期数据可以靠版本保留策略和 compaction 清掉。

### 案例 3：用户画像宽表

```text
row = "user-12345"
profile:name = "Alice"
behavior:click_news = "17"
computed:churn_score = "0.12"
```

逐部分解释：

- `profile`、`behavior`、`computed` 是 column family，通常建表时确定。
- `click_news` 这种 qualifier 可以动态增加，不需要传统 SQL schema migration。
- 稀疏列不占空间，适合“每个用户拥有不同属性”的数据。

## 踩过的坑

1. **把 Bigtable 当关系数据库**：它没有 join、外键、复杂 SQL 和跨行事务，强行套 SQL 思维会让应用层补很多逻辑。

2. **row key 单调递增**：timestamp 或自增 ID 当前缀时，新写入集中到一个 tablet，系统会出现热点。

3. **column family 随便建**：family 会影响存储布局和 compaction，按访问局部性分组比按业务名词分组更重要。

4. **忽略 compaction 成本**：后台合并能提升读性能和回收旧版本，但会吃 IO，线上需要限速和错峰。

## 适用 vs 不适用

适用：

- PB 级数据，需要按行随机读写，也需要范围扫描。
- 爬虫页面、日志、时序、用户画像这类宽而稀疏的数据。
- 写入很多、查询模式相对固定的系统。
- 能接受应用自己设计 row key 和访问路径的团队。

不适用：

- 需要复杂 join、临时分析 SQL、二级索引组合查询的业务。
- 需要跨很多行做强一致事务的 OLTP。
- 数据量很小、单机 Postgres 或 SQLite 已经够用的场景。
- row key 访问模式不清楚、查询需求经常变的早期产品。

## 历史小故事（可跳过）

- **2003 年**：Google 发表 GFS，先解决“很多机器一起存大文件”的问题。
- **2004 年**：MapReduce 发表，批处理计算和大规模存储开始配套。
- **2006 年**：Bigtable 和 Chubby 同年出现在 OSDI，Google 的存储栈拼图基本成形。
- **2008 年后**：HBase、Cassandra 等系统吸收 Bigtable 的列族、SSTable、LSM 思路，NoSQL 浪潮扩散。
- **2012 年**：Spanner 在 Bigtable 思路上补全球事务，回应了 Bigtable 不擅长跨行强一致的问题。

## 学到什么

- Bigtable 的取舍很清楚：放弃通用查询，换来巨大规模下的简单读写。
- row key 是 Bigtable schema 设计的核心，它决定数据会不会聚在一台机器上。
- 不可变文件加后台合并，是很多现代存储引擎提升写入吞吐的共同套路。
- 一个好系统常常不是全都自己做，Bigtable 依赖 GFS 存字节、Chubby 做协调。

## 延伸阅读

- 论文 PDF：[Bigtable: A Distributed Storage System for Structured Data](https://research.google.com/archive/bigtable-osdi06.pdf)
- [[gfs]] —— Bigtable 的底层文件存储基础。
- [[chubby]] —— Bigtable 用来做 master 选举和元数据协调。
- [[spanner-2012]] —— 给 Bigtable 路线补上全球事务。
- [[cassandra-2010]] —— 把 Bigtable 数据模型和 Dynamo 拓扑拼到一起。
- [[rocksdb-lsm]] —— 单机 LSM 存储引擎的现代代表。

## 关联

- [[gfs]] —— Bigtable 的 SSTable 和 commit log 都放在分布式文件系统上。
- [[chubby]] —— 用于协调 master、schema 和 tablet 元数据。
- [[mapreduce]] —— Bigtable 常作为 MapReduce 的输入和输出。
- [[spanner-2012]] —— 在 Bigtable 式存储上补强事务和 SQL。
- [[cassandra-2010]] —— 继承宽列模型，但改成无中心化架构。
- [[rocksdb-lsm]] —— 展示 LSM/SSTable 思想在单机 KV 里的延续。
- [[snowflake-2016]] —— 同样强调存储与计算拆分，但面向分析数仓。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
