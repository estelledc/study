---
title: Bigtable 二十年回顾 — 从三维表到云数据库
来源: 'Baltieri et al., "Twenty Years of Bigtable", SIGMOD Companion 2026; Google Cloud Bigtable 2024 announcements'
日期: 2026-07-08
分类: databases
难度: 中级
---

## 是什么

Bigtable 是 Google 做的一种分布式宽列表数据库：它不像 Excel 那样把表格限制成固定列，而是把数据放进“行键、列族、时间版本”组成的三维柜子里。

日常类比：想象图书馆有很多抽屉。抽屉编号就是行键，抽屉里的隔板是列族，每张纸还贴着时间戳。你要找某个用户最近一次点击，不必翻完整个馆，只要找到对应抽屉和隔板。

2006 年的 Bigtable 论文讲的是这套柜子怎么在成千上万台机器上可靠运行；后来的二十年回顾和 2024 年云服务更新，则说明同一套思想如何从 Google 内部系统长成面向外部客户的 Cloud Bigtable。

一句话结论：Bigtable 的核心不是“没有 SQL 的数据库”，而是把超大规模、低延迟、按键访问的数据，拆成可分片、可复制、可恢复的 tablet 来管理。

## 为什么重要

不理解 Bigtable，会很难解释这些事：

- 为什么搜索索引、监控指标、广告特征和物联网事件常常不用传统关系表来存。
- 为什么一个看似简单的 row key 设计，会决定整个系统是平稳扩展还是被单点热区拖垮。
- 为什么 HBase、Cassandra 这类系统都能看到 Bigtable 的影子，但又不等于 Bigtable 本身。
- 为什么 2024 年 Bigtable 加 SQL、Data Boost 和更高点查吞吐，不代表它变成了通用关系数据库。

## 核心要点

1. **三维数据模型**（“带时间的抽屉柜”）：每个值由行键、列、时间戳定位。类比家庭档案柜：一个人一个抽屉，医疗记录和账单放不同隔板，每次更新都保留日期。

2. **tablet 分片**（“把书架切成连续区间”）：Bigtable 按行键范围切 tablet，tablet server 负责服务这些区间。类比图书馆把 A-F、G-M、N-Z 分给不同管理员，某段书太多就再切小。

3. **读写路径围绕局部性设计**（“先找抽屉，再找隔板”）：如果相关数据的行键靠得近，扫描就快；如果写入都挤到同一前缀，热区就会出现。类比快递分拣：地址写得好，包裹自然分散到不同传送带。

Bigtable 多年来的演进，大多是在这三件事上继续加固：更稳的分片、更强的复制、更方便的查询入口，以及把分析负载和在线负载隔离开。

## 实践案例

### 案例 1：给用户事件设计行键

假设要存用户点击事件，最容易想到这样写：

```text
row key: user#123#2026-07-08T10:00:00Z
column family: event
columns: event:type, event:url, event:device
```

逐部分解释：

- `user#123` 把同一个用户的数据放在相邻位置，适合查“这个用户最近做了什么”。
- 时间放在后面，方便按时间范围扫描。
- `event` 是列族，表示这些列通常一起读取和压缩。
- 如果主要查询是“全站最近 1 分钟点击”，这个行键就不合适，因为它会被用户维度打散。

这说明 Bigtable 设计的第一步不是建表，而是先问：最常见的读取路径是什么？

### 案例 2：避免单调递增行键造成热区

如果行键直接用时间开头：

```text
2026-07-08T10:00:00Z#event-001
2026-07-08T10:00:01Z#event-002
2026-07-08T10:00:02Z#event-003
```

新写入会一直落在最后一个 tablet，像所有人都挤进同一个窗口排队。常见修法是在前面加稳定分桶：

```python
def row_key(user_id, ts, event_id):
    bucket = hash(user_id) % 16
    return f"{bucket:02d}#{ts}#{user_id}#{event_id}"
```

逐部分解释：

- `hash(user_id) % 16` 把用户稳定分到 16 个桶。
- 时间仍然保留，桶内还能按时间扫描。
- 查询某个时间段的全量事件时，要并发扫 16 个桶再合并。
- 桶数不是越多越好，太多会让查询扇出和运维成本上升。

### 案例 3：把在线查询和分析查询分开

一个在线服务可能每次只查一行：

```sql
SELECT event_url
FROM events
WHERE row_key = '07#2026-07-08T10:00:00Z#user123#e9';
```

分析同学却想扫一天数据做统计。2024 年 Bigtable 推 Data Boost 和 SQL 支持的意义就在这里：前者让大扫描尽量不抢在线节点资源，后者让更多人用熟悉的查询语法进入系统。

逐部分解释：

- 点查追求毫秒级稳定延迟，怕被大扫描挤占。
- 扫描追求吞吐，愿意等待更多数据返回。
- SQL 是入口，不是魔法；行键和列族设计仍然决定性能边界。
- Data Boost 适合把临时分析负载从在线服务旁边挪开。

## 踩过的坑

1. **把行键当自增 ID**：单调递增会让最新 tablet 变成热区，写入越多越慢。

2. **列族随手建很多**：列族通常是压缩、存储和读取的边界；把冷热数据混在一起，会让小查询带出不需要的大块数据。

3. **误以为 SQL 支持等于关系数据库**：Bigtable 可以提供 SQL 入口，但不适合随意 JOIN 多张表，也不适合复杂事务建模。

4. **只测平均延迟**：大规模服务怕的是尾延迟。一次 tablet 迁移、热点或压缩抖动，都可能让 p99 比平均值难看得多。

## 适用 vs 不适用场景

**适用**：

- 单表规模很大，按 key 或 key range 读写，数据量可能到 TB/PB 级。
- 需要低延迟点查，例如画像特征、时间序列指标、反欺诈特征或推荐候选集。
- 写入量高但事务关系简单，主要依赖幂等写、批量导入和按范围扫描。
- 团队愿意为 row key、热点监控和容量规划投入设计时间。

**不适用**：

- 业务核心是多表 JOIN、复杂外键和强事务报表，传统关系数据库更合适。
- 数据量很小，单机 PostgreSQL 或 SQLite 已经足够，没必要引入分布式复杂度。
- 查询模式经常变化且无法提前设计主键，宽列表模型会让后期改造很痛。
- 需要跨多行严格事务语义的账务系统，Bigtable 的强项不在这里。

## 历史小故事（可跳过）

- **2004 年左右**：Google 内部需要一个能承载搜索、地图、广告等多种负载的结构化存储系统。
- **2006 年**：OSDI 论文正式介绍 Bigtable，强调 petabyte 级数据、tablet 分片、SSTable、Chubby 协调和 GFS 存储。
- **2008 年后**：HBase、Cassandra 等开源系统吸收了宽列、LSM、按键分布式存储等思想。
- **2015 年**：Cloud Bigtable 作为托管服务面向外部用户，内部经验开始产品化。
- **2024 年**：Bigtable 围绕 SQL、Data Boost、授权视图、聚合类型和点查吞吐继续降低使用门槛。
- **2026 年**：二十年回顾论文总结它如何在 Google 内部持续扩展，并分享长期运维教训。

## 学到什么

1. 数据库的“表”不一定是关系表；也可以是一张按 key 排序、列可稀疏、版本可保留的巨大映射。

2. 分布式存储最怕隐藏热点；row key 不是格式细节，而是负载均衡策略的一部分。

3. 系统能活二十年，靠的不是单个技巧，而是数据模型、分片、复制、监控和运维流程一起演进。

4. 新功能会降低门槛，但不会取消基本约束：访问模式清楚、数据局部性好，Bigtable 才真正好用。

## 延伸阅读

- 原始论文 PDF：[Bigtable: A Distributed Storage System for Structured Data](https://research.google.com/archive/bigtable-osdi06.pdf)
- 二十年回顾：[Twenty years of Bigtable](https://research.google/pubs/twenty-years-of-bigtable/)
- Google Cloud 博客：[Celebrating 20 years of Bigtable with exciting announcements at Next](https://cloud.google.com/blog/products/databases/bigtable-enhancements-at-next24)
- Google Cloud 博客：[Bigtable now supports SQL](https://cloud.google.com/blog/products/databases/announcing-sql-support-for-bigtable)
- [[lsm-tree]] —— 理解 Bigtable 这类系统常用的写优化存储结构。
- [[spanner]] —— 对比“宽列表低延迟存储”和“全球分布式关系数据库”。

## 关联

- [[lsm-tree]] —— Bigtable 的 SSTable / memtable 思路和 LSM 家族关系很近。
- [[mapreduce]] —— 早期 Google 数据处理栈里，Bigtable 常和批处理系统一起使用。
- [[gfs]] —— 原始 Bigtable 依赖底层分布式文件系统保存 SSTable。
- [[spanner]] —— 同样来自 Google，但更强调 SQL、事务和全球一致性。
- [[cassandra]] —— 开源宽列数据库，常被拿来和 Bigtable 比较数据模型与运维取舍。
- [[hbase]] —— Hadoop 生态里的 Bigtable 风格开源实现。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
