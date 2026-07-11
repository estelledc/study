---
title: Apache Doris — MySQL 协议 MPP OLAP 数据库
来源: https://github.com/apache/doris
日期: 2026-05-31
分类: 基础设施
难度: 中级
---

## 是什么

Apache Doris 是一个**开源的 MPP 列存 OLAP 数据库**，目标是让你在亿级到百亿级数据上做亚秒级的多维分析。日常类比：你在一家连锁超市做数据分析师，老板随口问"过去 30 天华东地区水果品类哪个 SKU 卖得最好、客单价是多少、复购率怎样"——这种**横跨大量历史数据、多维度交叉**的查询，MySQL 跑半天，Doris 几秒能出。

它最大的特点是**说 MySQL 协议**：你不用学新客户端、新驱动，DBeaver / Navicat / MySQL CLI / JDBC 直接连，SQL 也是 MySQL 方言。这是它在国内能快速铺开的关键原因之一。

列存的意思是：同一列的值挨着放，扫"只要 gmv、不要地址"时少读很多无关字节——分析查询吃这一套。

技术上的三个核心卖点（先把缩写说成人话）：

1. **MPP 架构**（Massively Parallel Processing，多机一起算）：把一个查询切成几十份，几十台 BE 节点并行算
2. **全面向量化执行**：按列一批批算 + CPU 的 SIMD 指令，单机也吃满
3. **Nereids 优化器（CBO，Cost-Based Optimizer，按代价选计划）**：自动选 JOIN 顺序，不靠人写 hint

## 为什么重要

不理解 Doris 这类项目，下面这些事都解释不清：

- 为什么"实时数仓"这两年突然普及——以前 T+1 报表，现在常能压到分钟级
- 为什么国产数据库讲 OLAP 一定绕不开 Doris 和 StarRocks 这对兄弟
- 为什么 ClickHouse 单表往往极快，多表 JOIN 一上量就容易吃亏——传统上代价优化偏弱（近年有改进，但仍是常见对比点）
- 为什么"百度起家、进入 Apache 顶级项目"是国产开源数据库罕见的标杆路径

## 核心要点

Doris 架构可以拆成 **两个角色 + 三件武器**。

**两个角色**：

- **FE（Frontend，Java 写的）**：接待员。负责接 SQL、解析、生成执行计划、管元数据、调度任务。FE 之间用类 Raft 协议同步元数据，3 节点起步保证高可用。
- **BE（Backend，C++ 写的）**：厨房。负责存数据（列式 segment 文件）和执行计算。Tablet（数据分片）默认 3 副本分散在不同 BE 上。

查询进门找 FE，干活下厨找 BE——角色拆开后，元数据与计算可以各自扩容。

**三件武器**：

1. **向量化 + Pipeline 执行**：2.0 起全面向量化（取代旧火山模型），2.1 引入 Pipeline X 重写并发调度——按列批量算、按 pipeline 自动并行，CPU 利用率拉满。
2. **Nereids 优化器**：基于表统计信息估算每种 JOIN 顺序的代价，挑最便宜的执行路径。这是它打多表分析场景的关键。
3. **多种数据模型**：Aggregate（预聚合）/ Unique（按主键去重）/ Duplicate（保留明细）/ Primary Key（高频 update/delete）四种，按场景选不同表类型。选错模型比选错索引更伤：明细要下钻用 Duplicate，看板只要汇总用 Aggregate。

## 实践案例

### 案例 1：用户行为多维分析

假设已有 Duplicate 模型的 `orders`、`users` 表（明细保留，适合任意维度下钻）：

```sql
SELECT sku_id, SUM(gmv) AS total
FROM orders o JOIN users u ON o.user_id = u.id
WHERE o.dt >= CURDATE() - 7
  AND u.city_tier = 1 AND u.age BETWEEN 25 AND 35
GROUP BY sku_id ORDER BY total DESC LIMIT 10;
```

逐部分：`JOIN` 把订单和用户拼上 → `WHERE` 滤近 7 天与人群 → `GROUP BY` 按 SKU 汇总 → `LIMIT 10` 取 Top。Doris 上常见 1–3 秒；同 SQL 在大表 MySQL 上容易超时。

### 案例 2：直接订阅 Kafka 写入

```sql
CREATE ROUTINE LOAD db.events_load ON events
COLUMNS(user_id, event_type, ts, props)
PROPERTIES("desired_concurrent_number"="3", "max_batch_interval"="10")
FROM KAFKA("kafka_broker_list"="kafka:9092", "kafka_topic"="events");
```

逐部分：`ON events` 指定目标表 → `COLUMNS` 映射字段 → `PROPERTIES` 控制并发与微批间隔 → `FROM KAFKA` 指明源。秒级延迟吸入，简单场景可省掉单独 Flink 链路。

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

先注册外部目录，再像查本地表一样读 Iceberg / Hudi / Hive。不导入；热数据有本地缓存时接近原生表速度。

## 踩过的坑

1. **Tablet 数量爆炸**：分桶数 × 分区数过大（如分桶 100 再按天分区一年），单表几十万 tablet，FE 元数据被拖垮——建表前先估算总 tablet 数
2. **BE 内存早期严苛**：2.x 早期超出 `mem_limit` 直接 OOM；新版部分算子可 spill，仍要盯内存水位
3. **Compaction 卡 BE**：每秒几十次小批量 Stream Load 触发频繁合并，前台查询延迟飙升——攒批写或用事务模式
4. **Routine Load 是微批不是真流**：默认几秒一批；复杂多流 JOIN / 窗口仍要 Flink 前置。Master FE 切换时元数据短暂不可写，写入侧要做重试

## 适用 vs 不适用场景

**适用**：

- 实时数仓（订单、用户行为、监控指标），延迟目标常在秒到分钟
- 多维 OLAP 报表（运营看板、BI、临时探查）
- 用户画像和人群圈选；日志分析（2.x 倒排索引，部分场景替代 ES）
- 数据湖加速（External Catalog 直查 Iceberg / Hudi）

**不适用**：

- 事务型业务（OLTP）→ MySQL / PostgreSQL / TiDB
- 单表很小（<1GB）→ DuckDB / SQLite 更轻
- 强一致性金融账务；纯 KV → Redis / RocksDB
- 复杂流式窗口 / CEP → Flink；与 StarRocks 互迁勿假设 SQL 完全互通

## 历史小故事（可跳过）

- **2017–2018**：百度内部 Palo 项目开源，定位 MySQL 协议的 MPP OLAP
- **2020**：一支商业化团队独立为 StarRocks，此后两边功能与 SQL 逐渐分化
- **2022-06**：进入 Apache 顶级项目（TLP），改名 Apache Doris
- **2.0 起**：全面向量化 + Nereids CBO 成为默认路径，倒排索引进入日志场景
- **2.4+**：推进存算分离，BE 数据可放对象存储、计算节点弹性扩缩

## 学到什么

1. **MPP + 向量化是现代 OLAP 标配**：机器之间并行 × 单机 CPU 并行，才有几十倍提速
2. **协议兼容是普及的捷径**：选 MySQL 协议让开发者零成本接入
3. **CBO 是 OLAP 的护城河**：写 SQL 的人不会手动调 JOIN 顺序，能自动选对就赢一半
4. **同源分叉的两条路**：Doris 走 ASF TLP，StarRocks 走商业公司路线，是开源治理两种样本

## 延伸阅读

- 官方文档：[Apache Doris Docs](https://doris.apache.org/docs/)
- 架构介绍：社区博客 *Apache Doris: A Real-Time Analytical Database* 简化版
- GitHub：[apache/doris](https://github.com/apache/doris)
- [[starrocks]] —— 同源分叉的兄弟项目，2020 年从 Doris 独立出去
- [[clickhouse]] —— 单机 OLAP 之王，Doris 的另一个对手
- [[apache-iceberg]] —— External Catalog 常对接的湖仓表格式

## 关联

- [[starrocks]] —— 2020 年从 Doris 分叉出去的商业版本，现已独立
- [[clickhouse]] —— 单表强、JOIN 弱；Doris 反过来更吃多表分析
- [[rocksdb]] —— LSM KV 引擎；Doris 不依赖它，但列存排序键上有相似取舍
- [[apache-iceberg]] —— Doris External Catalog 直查的湖仓表格式之一
- [[greenplum-db]] —— 另一条 MPP 数仓路线，对照看架构差异
- [[databend]] —— Rust 写的存算分离云数仓，和 Doris 2.4+ 存算分离对照看

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[databend]] —— Databend — Rust 写的存算分离云数仓
- [[greenplum-db]] —— Greenplum — Postgres 改的 MPP 数仓
- [[manticoresearch]] —— Manticore Search — 用 MySQL 协议连的搜索 + OLAP 引擎
- [[questdb]] —— QuestDB — 高性能时序库
- [[redash]] —— Redash — 浏览器里写 SQL、出图、做仪表板的开源 BI
- [[projects/starrocks]] —— StarRocks — MPP 列存数据库
- [[tdengine]] —— TDengine — 一个设备一张表的国产 IoT 时序库
