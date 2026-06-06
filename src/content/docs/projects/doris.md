---
title: Apache Doris — MySQL 协议 MPP OLAP 数据库
来源: https://github.com/apache/doris
日期: 2026-05-31
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

Apache Doris 是一个**开源的 MPP 列存 OLAP 数据库**，目标是让你在亿级到百亿级数据上做亚秒级的多维分析。日常类比：你在一家连锁超市做数据分析师，老板随口问"过去 30 天华东地区水果品类哪个 SKU 卖得最好、客单价是多少、复购率怎样"——这种**横跨大量历史数据、多维度交叉**的查询，MySQL 跑半天，Doris 几秒能出。

它最大的特点是**说 MySQL 协议**：你不用学新客户端、新驱动，DBeaver / Navicat / MySQL CLI / JDBC 直接连，SQL 也是 MySQL 方言。这是它在国内能快速铺开的关键原因之一。

技术上的三个核心卖点：

1. **MPP 架构**：把一个查询切成几十份，几十台 BE 节点并行算
2. **全面向量化执行**：按列批处理 + SIMD 指令，单机 CPU 也吃满
3. **Nereids 优化器（CBO）**：基于成本自动选 JOIN 顺序，不靠人写 hint

## 为什么重要

不理解 Doris 这类项目，下面这些事都解释不清：

- 为什么"实时数仓"这两年突然普及——以前 T+1 报表，现在 T+1 分钟
- 为什么国产数据库讲 OLAP 一定绕不开 Doris 和 StarRocks 这对兄弟
- 为什么 ClickHouse 单表跑得飞快，多表 JOIN 一上量就崩——它没真正的 CBO
- 为什么"百度起家、CNCF 毕业"是国产开源数据库罕见的标杆路径

## 核心要点

Doris 架构可以拆成 **两个角色 + 三件武器**。

**两个角色**：

- **FE（Frontend，Java 写的）**：接待员。负责接 SQL、解析、生成执行计划、管元数据、调度任务。FE 之间用类 Raft 协议同步元数据，3 节点起步保证高可用。
- **BE（Backend，C++ 写的）**：厨房。负责存数据（列式 segment 文件）和执行计算。Tablet 默认 3 副本分散在不同 BE 上。

**三件武器**：

1. **向量化 + Pipeline 执行**：2.0 起全面向量化（取代旧火山模型），2.1 引入 Pipeline X 重写并发调度——按列批量算、按 pipeline 自动并行，CPU 利用率拉满。
2. **Nereids 优化器**：基于表统计信息估算每种 JOIN 顺序的代价，挑最便宜的执行路径。这是它打 ClickHouse 的关键。
3. **多种数据模型**：Aggregate（预聚合）/ Unique（按主键去重）/ Duplicate（保留明细）/ Primary Key（高频 update/delete）四种，按场景选不同表类型。

## 实践案例

### 案例 1：用户行为多维分析

```sql
SELECT sku_id, SUM(gmv) AS total
FROM orders o JOIN users u ON o.user_id = u.id
WHERE o.dt >= CURDATE() - 7
  AND u.city_tier = 1 AND u.age BETWEEN 25 AND 35
GROUP BY sku_id ORDER BY total DESC LIMIT 10;
```

Doris 上 1-3 秒返回；MySQL 跑同样 SQL 大表 JOIN 容易超时。

### 案例 2：直接订阅 Kafka 写入

```sql
CREATE ROUTINE LOAD db.events_load ON events
COLUMNS(user_id, event_type, ts, props)
PROPERTIES("desired_concurrent_number"="3", "max_batch_interval"="10")
FROM KAFKA("kafka_broker_list"="kafka:9092", "kafka_topic"="events");
```

Routine Load 按"微批"持续把 Kafka 的数据吸进 Doris，秒级延迟，不需要单独的 Flink 链路。

### 案例 3：直查数据湖（External Catalog）

```sql
CREATE CATALOG iceberg_catalog PROPERTIES (
  "type" = "iceberg",
  "iceberg.catalog.type" = "hive",
  "hive.metastore.uris" = "thrift://hms:9083"
);

SELECT * FROM iceberg_catalog.db.events
WHERE dt = '2026-05-30' LIMIT 100;
```

不导入数据，直接查 Iceberg / Hudi / Hive / Paimon。配合本地缓存，热数据接近原生表速度。

## 踩过的坑

1. **Tablet 数量爆炸**：分区键 + 分桶键设计不当（比如分桶数设成 100、再按天分区一年），单表能产生几十万 tablet，FE 元数据管理直接被拖垮。建表前先估算总 tablet 数，控制在合理范围。

2. **BE 内存模型早期严苛**：2.x 早期版本超出 `mem_limit` 直接 OOM，不会 spill 到磁盘。聚合大表时容易炸；新版加了部分算子的 spill，但仍要监控 BE 内存水位。

3. **Compaction 卡 BE**：每秒几十次小批量 Stream Load 触发频繁 compaction，BE 后台合并文件占 CPU，前台查询延迟飙升。要么攒批写、要么用事务模式。

4. **FE 主从切换有抖动**：Master FE 挂掉时元数据不可写，Follower 选举有秒级抖动。写入侧最好做客户端重试。

5. **Routine Load 不是真流处理**：从 Kafka 拉是"微批"（默认几秒一批），不是实时流。复杂的多流 JOIN / 窗口计算还得 Flink 在前面处理。

6. **Doris 与 StarRocks SQL 不再完全互通**：早期 90% 兼容，现在 UDF 和部分内置函数已分化，从 StarRocks 迁来或迁去都不能想着无缝切。

## 适用 vs 不适用场景

**适用**：

- 实时数仓（订单、用户行为、监控指标）
- 多维 OLAP 报表（运营看板、BI 分析、临时探查）
- 用户画像和人群圈选
- 日志分析（配合 2.x 倒排索引，部分场景替代 ES）
- 数据湖加速（External Catalog 直查 Iceberg / Hudi）

**不适用**：

- 事务型业务（OLTP）→ 用 MySQL / PostgreSQL / TiDB
- 单表数据量很小（<1GB）→ DuckDB / SQLite 更轻
- 强一致性金融账务 → 银行核心交易系统
- 纯 KV 查询场景 → Redis / RocksDB
- 需要复杂流式窗口 / CEP → Flink

## 技术亮点

- **MySQL 协议兼容**：开发者零学习成本接入
- **Nereids 优化器**：2.0 起默认开启的新一代 CBO，取代老 Apollo
- **倒排索引**：2.0 引入，部分日志分析场景可替代 ES
- **Variant 半结构化类型**：直接存 JSON，按路径建索引，省掉打平
- **存算分离**（2.4+）：BE 数据可放对象存储，计算节点弹性扩缩
- **CNCF 毕业项目**：2022 年 6 月成为 Apache 顶级项目，治理透明

## 学到什么

1. **MPP + 向量化是现代 OLAP 标配**：MPP 解决"机器之间并行"，向量化解决"单机 CPU 并行"，两者乘起来才有几十倍提速
2. **协议兼容是普及的捷径**：选 MySQL 协议让开发者零成本接入，是 Doris 在国内能快速铺开的关键
3. **CBO 是 OLAP 的护城河**：写 SQL 的人不会手动调 JOIN 顺序，能自动选对就赢一半
4. **同源分叉的两条路**：Doris 走社区基金会路线（ASF TLP），StarRocks 走商业公司路线，长期看是开源治理两种典型样本

## 延伸阅读

- 官方文档：[Apache Doris Docs](https://doris.apache.org/docs/)
- 架构论文：*Apache Doris: A Real-Time Analytical Database*（社区博客有简化版本）
- [[starrocks]] —— 同源分叉的兄弟项目，2020 年从 Doris 独立出去
- [[clickhouse]] —— 单机 OLAP 之王，Doris 的另一个对手

## 关联

- [[starrocks]] —— 2020 年从 Doris 分叉出去的商业版本，现已独立
- [[clickhouse]] —— 单表强、JOIN 弱；Doris 反过来
- [[hindley-milner]] —— 类型推导和 CBO 都是"基于已知信息推出最优方案"
- [[rocksdb]] —— LSM KV 引擎；Doris 不依赖它，但同样在"列式存储 + 排序键"上有相似工程取舍
- [[apache-iceberg]] —— Doris External Catalog 直查的湖仓表格式之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[databend]] —— Databend — Rust 写的存算分离云数仓
- [[greenplum-db]] —— Greenplum — Postgres 改的 MPP 数仓
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[manticoresearch]] —— Manticore Search — 用 MySQL 协议连的搜索 + OLAP 引擎
- [[questdb]] —— QuestDB — 高性能时序库
- [[redash]] —— Redash — 浏览器里写 SQL、出图、做仪表板的开源 BI
- [[rocksdb]] —— RocksDB — 嵌入式 LSM 引擎
- [[starrocks]] —— StarRocks — MPP 列存数据库
- [[tdengine]] —— TDengine — 一个设备一张表的国产 IoT 时序库

