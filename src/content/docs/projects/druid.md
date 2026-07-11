---
title: Apache Druid — 流批一体的实时分析数据库
来源: https://github.com/apache/druid
日期: 2026-05-31
分类: 实时分析数据库
难度: 中级
---

## 是什么

Apache Druid 是一个**专门做"实时聚合查询"的数据库**。日常类比：像一家 24 小时营业的快餐店——前台（实时通道）一直在收新订单，后厨（批量通道）也在按计划备菜，顾客（查询）问"今天卖了多少汉堡"，系统能一秒内把刚下单的 + 早上备好的合并起来回答。

它最擅长这种场景：

- 数据**带时间戳**（点击日志、监控指标、广告曝光）
- 数据**一直流进来**（每秒上万条）
- 用户想**秒级看聚合**（"过去 1 小时按地区分组的点击量"）

不是给你查"用户 ID=123 的详细资料"用的——那是 OLTP 数据库的活。Druid 是 OLAP 这边的，按列扫一大片做加和、计数。

## 为什么重要

Druid 是 **Lambda 架构**（Nathan Marz 2011 提出）的工业级落地代表。Lambda 架构的核心想法：

- **批层**：用 Hadoop 这种慢但准的系统处理历史数据
- **速度层**：用流处理系统处理刚来的几分钟数据
- **服务层**：把两者合并对外提供查询

Druid 把批层 + 速度层揉进一个库，**对外一个查询接口**（现代部署也常纯 Kafka 流式摄取，不必再挂 Hadoop 批层）。广告、APM、行为分析、IoT 的实时 dashboard 大量靠它。

## 核心要点

理解 Druid 抓住三个关键词：**段、列存、节点角色**。

**段（Segment）**：数据按时间切成不可变文件，比如"2026-05-31 上午 10 点"是一段，"上午 11 点"是另一段。每个段几百万行。**段是查询单元也是分发单元**——查询 9-11 点就调度对应几个段并行扫。

**列存**：同一列的值挨着存。查"某地区点击总数"只读"地区"列和"点击数"列，跳过其他几十列。配合：

- **字典编码**：字符串列把"北京"映射成整数 0，"上海"映射成 1，扫起来快
- **位图索引**：每个字符串值建一个 bitmap，过滤"地区=北京"几乎瞬时
- **类型压缩**：数字列用 LZ4 / Roaring 这类压

**节点角色拆分**（运维复杂的根源）：

- **Broker**：接查询，拆成子查询发出去，合并结果
- **Historical**：存老数据段，提供查询
- **MiddleManager**：摄取新数据，先在内存里建段
- **Coordinator / Overlord**：调度、负载均衡
- **深度存储**（S3/HDFS）：所有段的永久备份，节点挂了从这恢复

每种角色独立扩缩容——查询压力大就加 Broker，存储压力大就加 Historical。

## 实践案例

### 案例 1：一条点击日志的命运

广告平台每秒收到 5 万次点击。一条日志进 Druid 的旅程：

1. Kafka 主题里来了 `{ts: "10:23:45", region: "北京", ad_id: 99, clicks: 1}`
2. MiddleManager 拉到内存，几分钟内攒成一个**实时段**，已可被查询
3. 段写满（比如 1 小时）后，**封存推到 S3 深度存储**
4. Coordinator 通知 Historical 节点从 S3 拉这个段到本地 SSD
5. MiddleManager 转去做新段后，Historical 本地 SSD 扫老段通常更快——**刚到的走内存段，沉淀后走磁盘段**，对外仍是同一张表

这个流程 = Lambda「速度层 → 批层」的自动迁移，用户不用自己粘两套管线。

### 案例 2：一次查询走的路

```sql
SELECT region, SUM(clicks)
FROM ad_events
WHERE __time BETWEEN '2026-05-31 09:00' AND '2026-05-31 11:00'
GROUP BY region
```

Druid 内部：

1. Broker 收到 SQL，看时间过滤定位涉及的 8 个段（2 小时 × 4 段/小时）
2. 这 8 个段分布在 5 个 Historical 节点 + 1 个 MiddleManager（最近一段还没封存）
3. Broker 并行发送子查询，每个节点本地按列扫 + 位图过滤"region 列"
4. 各节点返回各自部分聚合结果（"北京: 1200, 上海: 800"）
5. Broker 合并 → 返回客户端

整个过程在数百毫秒内完成。**关键**：多节点真正并行扫段，不是单节点扛大头。

### 案例 3：本地 quickstart 跑通一次

官方 Docker 镜像半小时能起：

```bash
# 拉镜像并起单机（Broker+Historical+MiddleManager 打成一套）
docker pull apache/druid:28.0.1
# 按官网 quickstart 起 compose 后：
curl -X POST 'http://localhost:8888/druid/indexer/v1/task' \
  -H 'Content-Type: application/json' \
  -d @quickstart/wikipedia-index.json
```

读：任务文件告诉 MiddleManager「从哪读样例、时间列是什么、哪些是维度/指标」。任务跑完后，在控制台对 `wikipedia` 数据源跑：

```sql
SELECT page, COUNT(*) AS edits
FROM wikipedia
WHERE __time >= CURRENT_TIMESTAMP - INTERVAL '1' HOUR
GROUP BY page
ORDER BY edits DESC
LIMIT 10
```

这就是「摄取 → 段可查 → SQL 聚合」最小闭环；生产再把样例文件换成 Kafka topic。

## 踩过的坑

1. **不是真正"实时"**：摄取到可查通常 1-10 秒延迟，因为段要在内存里攒一会儿才暴露给查询。需要毫秒级的场景用 Kafka Streams / Flink 直接聚合。

2. **Join 弱**：早期完全不支持 Join，现在支持但性能远不如 ClickHouse / Pinot。Druid 的世界观是"宽表 + 聚合"，不是关系建模。

3. **运维门槛高**：6 种节点 + ZooKeeper + 元数据库（MySQL/PostgreSQL）+ 深度存储。小规模反而比单机 ClickHouse 还贵。

4. **schema 半固定**：维度（dimensions）和指标（metrics）摄取时就要分开声明。改类型要重新摄取段，代价不小。

## 适用 vs 不适用场景

**适用**：

- 时间序列 + 高基数维度（点击流、监控、IoT）
- 需要"既看历史也看刚发生"
- 高并发的实时 dashboard（多用户同时查）
- 数据量到 TB-PB 级，但要秒级响应

**不适用**：

- 强事务（ACID）→ 用 PostgreSQL / TiDB
- 复杂 Join 多表关联 → 用 ClickHouse / Trino
- 全文搜索 → 用 Elasticsearch
- 小数据量（< 100GB）→ 单机 ClickHouse 足矣

## 历史小故事（可跳过）

- **2011**：Eric Tschetter / Fangjin Yang 等人在 Metamarkets 做广告分析，关系数据库慢、Hadoop 跑批又来不及，自己造了 Druid
- **2012 年 10 月**：开源（GPL）
- **2014**：SIGMOD 论文 *Druid: A Real-time Analytical Data Store* 把架构正式介绍给学界
- **2015**：换 Apache 2.0 协议
- **2018**：进 Apache 孵化器
- **2019**：毕业为顶级项目

创始团队后来成立 Imply，做 Druid 商业版。

## 学到什么

1. **节点角色专门化**比"一个节点干所有活"更好扩——查询/存储/摄取压力曲线不同
2. **不可变段 + 深度存储**让节点挂了不丢数据，加节点直接拉段
3. **列存 + 位图 + 字典编码**是聚合查询的现代标配
4. 「刚到的」和「很久前的」可走不同路径，对外仍像一张表——这是后续 OLAP 的常用模板

## 延伸阅读

- 论文：[Druid: A Real-time Analytical Data Store (SIGMOD 2014)](https://static.druid.apache.org/docs/druid.pdf)
- 官网：[druid.apache.org](https://druid.apache.org/)（quickstart）
- [[clickhouse]] —— 同类列存，单机更强、流批一体弱
- [[kafka]] —— 实时摄取的主要上游
- [[pinot]] —— LinkedIn 起家的实时 OLAP，常与 Druid 对比

## 关联

- [[clickhouse]] —— 同样列存 OLAP，流批一体弱于 Druid
- [[kafka]] —— Druid 速度层的事实标准上游
- [[hadoop]] —— 批层最早依赖，现常被 Spark 替代
- [[elasticsearch]] —— 同样按段存，定位是搜索不是聚合
- [[pinot]] —— 同赛道实时 OLAP，索引与运维模型不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[pinot]] —— Apache Pinot — LinkedIn 起家的实时 OLAP
- [[superset]] —— Apache Superset — 开源 BI 平台
- [[zeppelin]] —— Apache Zeppelin — JVM 多语言笔记本
