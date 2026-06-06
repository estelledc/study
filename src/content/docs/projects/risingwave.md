---
title: RisingWave — Postgres 兼容的流式数据库，用物化视图替代 Flink + KV 组合
来源: RisingWave 官方文档, https://docs.risingwave.com/ ；项目主页 https://risingwave.com/
日期: 2026-05-31
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

RisingWave 是一套**说着 PostgreSQL 协议、内部跑流式增量计算、把"实时结果"长期保存在自己的物化视图里**的开源数据库。2021 年起步，2022 年开源，Apache 2.0，用 Rust 写，主仓库就叫 risingwavelabs/risingwave。

日常类比：像在便利店里装了一台**能边切水果边自动更新货架价签**的机器。客人（应用代码）走到货架前看到的"今日折扣"永远是最新的，因为机器一边接水果（kafka 流入）一边算（流式算子）一边把结果贴到货架（物化视图）；老收银机（你的 BI 工具、ORM）只要会读货架就行，不用换。

写起来是这样：

```sql
-- 接一个 kafka 源
CREATE SOURCE orders (
    user_id int, amount numeric, ts timestamp
) WITH (connector='kafka', topic='orders') FORMAT PLAIN ENCODE JSON;

-- 创建一个会自动维护的物化视图
CREATE MATERIALIZED VIEW user_total AS
SELECT user_id, SUM(amount) AS total
FROM orders GROUP BY user_id;

-- 任意时刻读它，结果都是最新累计
SELECT * FROM user_total WHERE user_id = 42;
```

这三段你用 psql 直接跑——RisingWave 在 wire 协议层就是 Postgres，client 不知道对面其实是个流引擎。

## 为什么重要

不理解 RisingWave，下面这些事就解释不通：

- 为什么 2022 年之后突然有一波"Streaming Database"的项目（RisingWave / Materialize / Arroyo）冒出来——大家在回答同一个问题：**Flink + Kafka + Redis 三件套写实时业务太累了，能不能合一**
- 为什么"用 SQL 写流处理"这个口号 ksqlDB 喊了多年没大成，到 RisingWave 这一代才被认真接受——前几代要么绑死 Kafka，要么状态存本地不能弹
- 为什么 Snowflake / Databricks 也在补"流式物化视图"这一课——批流分裂的 Lambda 架构在新一代实时业务里已经撑不住
- 为什么这个项目用 Rust 而不是 JVM——状态后端要直接管内存和 IO，JVM 的 GC 在大状态场景下很难调

## 核心要点

RisingWave 的世界由五个部件咬合：

1. **Frontend**：实现 Postgres wire 协议，做 SQL 解析、绑定、优化，把查询编译成**流执行计划**或**点查计划**。任何 PG 客户端连过来都被这一层接住。
2. **Meta node**：集群大脑。管 schema、catalog、调度 actor 到 compute node、协调 checkpoint。类似 K8s 的 control plane，但小得多。
3. **Compute node**：实际跑算子的工作进程。每个流算子是一个 actor（join / aggregate / filter / source / sink），actor 之间用 channel 串起来。算子是**有状态**的，状态不放本地。
4. **Hummock 存储**：共享状态后端。底层是 LSM-tree，专门为流处理改造（版本化、增量 checkpoint、跨 actor 共享键空间）。SST 文件最终落到对象存储（S3 / OSS / MinIO）。
5. **Compactor**：后台进程，合并 Hummock 的 SST 文件，跟 RocksDB 的 compaction 类似，但跑在独立进程里、可以单独扩缩。

**一句话总结**：把 Flink 的"流算子"和 Snowflake 的"存算分离"拼到一起，外面套一层 Postgres 协议——结果是**写 SQL 就能搞定实时计算，存储弹得动、计算弹得动、客户端不用换**。

## 实践案例

### 案例 1：替换 Flink + Kafka + Redis 三件套

传统实时大屏架构通常长这样：

- Kafka 收业务事件
- Flink 跑聚合写回 Kafka 或 Redis
- 应用从 Redis 查最新指标

迁到 RisingWave 后：

- Kafka 还是 Kafka（source 接进来）
- 一条 `CREATE MATERIALIZED VIEW` 替代整个 Flink job
- 应用直接用 PG 驱动 `SELECT` 物化视图

**省掉的不是代码量，是运维**：Flink 状态恢复要拉满 RocksDB checkpoint，扩容要重 rescale，作业依赖图要自己排；RisingWave 把这些都收进引擎。

### 案例 2：物化视图能链起来

```sql
CREATE MATERIALIZED VIEW user_total AS
  SELECT user_id, SUM(amount) AS total FROM orders GROUP BY user_id;

CREATE MATERIALIZED VIEW big_spenders AS
  SELECT user_id FROM user_total WHERE total > 10000;
```

第二个 MV 建在第一个 MV 上。数据流过来时，**两层 MV 都会增量更新**，不需要你手动调度。这种"MV 上叠 MV"的能力是流式数据库相对传统 KV 缓存的杀手锏。

### 案例 3：从 Postgres 拉 CDC 进来做实时分析

```sql
CREATE SOURCE pg_orders
  WITH (connector='postgres-cdc',
        hostname='...', port='5432',
        username='...', password='...',
        database.name='shop', table.name='public.orders',
        slot.name='rw_slot');

CREATE MATERIALIZED VIEW hourly_gmv AS
  SELECT date_trunc('hour', created_at) AS hr,
         SUM(amount) AS gmv
  FROM pg_orders GROUP BY 1;
```

业务库改一行，几百毫秒后 `hourly_gmv` 就更新了——**没有 ETL，没有定时调度**。这是 RisingWave 最常被采用的场景：业务库不动，旁路接出实时分析视图。

### 案例 4：什么时候 RisingWave 不合适

如果你要做的是"频繁 UPDATE 单行"——比如订单状态从 `pending` 改 `paid`——这是 OLTP 工作负载，RisingWave 不接。它的写入路径是 `INSERT` 或 `source 接入`，更新通过 source 的 CDC（Debezium 输出）流进来。把它当 MySQL 用会撞墙。

## 踩过的坑

1. **Postgres 兼容是 wire 层，不是函数完全集**：能连 psql 不代表所有 PG 内置函数都有。复杂 JSON 函数、某些 array 操作、特定 procedural 扩展可能缺。先翻官方"compatibility"页再迁。

2. **MV 不是免费的**：每个 MV 都是常驻算子链 + 持久状态。建几十个 MV 不出问题，建几百个会让 compute node 很吃力。把 MV 当索引随手加是反模式。

3. **状态在 S3 = 冷启动慢**：actor 重启时要从对象存储拉状态，第一次查询有 latency。生产环境要么常驻不停，要么接受冷启动几秒到几十秒的代价。

4. **CDC 接入有版本敏感性**：从 MySQL/Postgres 用 CDC 拉数据，对源端的 binlog/wal 配置、Debezium 版本、字段类型映射都很挑。第一次接 CDC 至少留半天 debug 时间。

## 适用 vs 不适用场景

**适用**：

- 实时大屏 / 实时风控 / 实时推荐特征——典型的"流入 + 增量聚合 + 低延迟查"
- 替换 Flink + Kafka + Redis/Cassandra 的三件套架构
- 想用 SQL 写流处理、不想写 Java DataStream
- 已有 Postgres 生态（BI / ORM / 工具），想加流式能力但不换协议

**不适用**：

- OLTP（高频单行 UPDATE / DELETE）——用 Postgres / MySQL
- OLAP 大批量扫描（TB 级即席查询）——用 ClickHouse / Snowflake / Doris
- 需要图查询 / 全文检索——用专门的图库 / 搜索引擎
- 状态极小、延迟极敏感（亚毫秒）——单机内存计算或 Materialize 单节点模式更合适

## 历史小故事（可跳过）

- **2018 ~ 2020**：Materialize（差分数据流方向）和 ksqlDB（Kafka 内置流引擎）是最早把"流式 SQL"做成产品的两家。前者偏研究、单节点；后者绑死 Kafka。
- **2021**：吴英骏（Yingjun Wu，前 AWS Redshift / IBM Almaden）创立 Singularity Data，目标是"云原生的 Materialize"。早期项目代号就是 RisingWave。
- **2022 年 2 月**：仓库公开，Apache 2.0。架构定调"存算分离 + 共享存储 + Rust 实现"，跟 Materialize 的差分数据流路线分道。
- **2023 ~ 2024**：1.0 正式版、Hummock 存储稳定、CDC connector 矩阵补全；公司改名 RisingWave Labs。
- **2025 起**：进入生产采用期，国内多家互联网公司用它替换实时数据栈的"Flink + KV"组合。

## 学到什么

1. **流处理的"难"大半在状态管理**——不是算子写不出来，是状态在哪儿存、怎么 checkpoint、怎么扩缩。RisingWave 的核心赌注是"把状态推到对象存储"
2. **Postgres wire 协议是基础设施级的护城河**——只要你说 PG 协议，整个 BI / ORM / 客户端生态白送，这是 ClickHouse / Snowflake / EdgeDB / RisingWave 都在用的策略
3. **Rust + 存算分离**正在成为新一代基础设施的默认选型——GC 不可控 + 状态弹性差是 JVM 系系统在云原生时代的两大软肋
4. **物化视图 vs 缓存**：MV 是"声明式 + 自动维护"，缓存是"命令式 + 手动失效"。流式数据库本质是把"缓存一致性"这件事从应用层下沉到数据库层

## 延伸阅读

- 官方架构文档：[RisingWave Architecture](https://docs.risingwave.com/docs/current/architecture/)（一张图看清五大组件）
- 创始人 Yingjun Wu 写的对比文：[Streaming Databases: A Comprehensive Guide](https://www.risingwave.com/blog/)（长文综述这个赛道）
- 主仓库：[risingwavelabs/risingwave on GitHub](https://github.com/risingwavelabs/risingwave)（Rust，30k+ star）
- [[kafka]] —— 最常用的上游 source；理解 Kafka 才能用好 RisingWave 的 source 接入
- [[flink-2015]] —— 流处理的上一代标准；对比着读才知道 RisingWave 解的痛在哪

## 关联

- [[kafka]] —— 最典型的 source 上游，"Kafka + RisingWave" 替代 "Kafka + Flink + Redis"
- [[flink-2015]] —— 流处理上一代，DataStream API + 本地状态 vs 流式 SQL + 共享状态
- [[clickhouse]] —— 同样兼容部分 PG 协议，但定位是 OLAP 大扫描；和 RisingWave 互补不冲突
- [[edgedb]] —— 同样"在 Postgres 之上做新查询层"，但目标是应用开发体验而非流计算
