---
title: CockroachDB — 全球分布式 SQL
来源: https://github.com/cockroachdb/cockroach
日期: 2026-05-31
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

CockroachDB（简称 CRDB）是一个**开源的分布式 SQL 数据库**。日常类比：把一家便利店的账本同时复制到全球 5 家分店，任何一家被偷被烧账本仍然完整一致；客人在哪家分店付钱，结算结果跨店都一样。

技术上拆开看两层：

- **对外**：说 PostgreSQL 线协议——你的 psql、pg ORM、JDBC 驱动不用改一行就能连
- **对内**：把数据切成连续 key 区间（叫 range，约 512MB 一段），分散到多台机器；每个 range 用 Raft 共识协议复制 3-5 份

一句话：**长得像 Postgres，骨架像 Spanner**。

## 为什么重要

不理解 CRDB，下面这些事都没法解释：

- 为什么 Postgres 单机性能强但跨地域复制只能"主从最终一致"，CRDB 却能跨地域强一致
- 为什么传统数据库主挂了要人工切主（5 分钟到几小时不可用），CRDB 能秒级自愈
- 为什么 DoorDash、Netflix、SpaceX 选它而不是分库分表的 MySQL/Postgres
- 为什么"分布式 SQL"这个新品类在 2014 年后突然冒出（Spanner 论文 2012 → 大家都想抄）

## 核心要点

CRDB 的核心架构可以拆成 **四层**，自下而上：

1. **存储层（Pebble）**：每个节点用一个本地 KV 存储（自研的 Pebble，类似 RocksDB）。
2. **复制层（Range + Raft）**：数据按 key 排序切成连续区间叫 range，每个 range 独立跑一份 Raft 共识，多数派写入即提交。
3. **事务层（MVCC + HLC）**：每次写入打一个时间戳产生新版本（MVCC），跨机器用混合逻辑时钟（HLC）排序事务，默认 Serializable 隔离。
4. **SQL 层**：解析 SQL → 查询计划 → 把算子下推到数据所在节点执行（distributed execution）。

四层叠起来：**SQL 进、KV 出、Raft 同步、HLC 排序**。

## 实践案例

### 案例 1：连一个 CRDB 集群（和 Postgres 几乎一样）

```bash
cockroach start-single-node --insecure --listen-addr=localhost:26257 &
cockroach sql --insecure --host=localhost:26257
```

进去后写 SQL：

```sql
CREATE TABLE accounts (id INT PRIMARY KEY, balance DECIMAL);
INSERT INTO accounts VALUES (1, 1000.00), (2, 250.00);
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
```

**和 Postgres 一字不差**——这就是 Postgres 协议兼容的威力。你的 ORM、迁移工具、监控工具全能继续用。

### 案例 2：range 怎么自动分裂

CRDB 监控每个 range 的大小和负载。当某个 range 超过 512MB 或 QPS 太高，**自动一刀切两半**：

```
原 range：[orders/0, orders/∞)   3GB，QPS 10k
自动分裂为：
  range A：[orders/0,  orders/5000)
  range B：[orders/5000, orders/∞)
```

每半各自跑独立的 Raft，分散到不同节点。**整个过程不停机、不停写**——这就是"无运维分库分表"。

### 案例 3：跨地域强一致是怎么做到的

假设 3 个数据中心：纽约、东京、伦敦，每个 range 在三地各放一份。

写入路径：

1. 客户端写到任一节点
2. 该节点把写入提议给 range 的 Raft leader
3. Leader 复制到其他两份，**等多数派（2/3）确认**
4. 提交成功，返回客户端

**强一致的代价**：跨地域 Raft round-trip ≈ 100-200ms。所以 CRDB 在"跨大洋强一致"和"延迟"之间，选了前者。要快就把所有副本放同一地域。

## 踩过的坑

1. **事务延迟比单机 PG 高**：多一次 Raft 共识，单机 1ms 的事务在 CRDB 可能 5-10ms。短事务密集的 OLTP 注意预算；高频 INSERT 场景尤其吃紧。

2. **热点 key 拖慢一个 range**：自增主键（如 `SERIAL`）会让所有写都打到同一 range。**官方推荐用 UUID 或 hash 主键**打散。CRDB 提供 `UUID DEFAULT gen_random_uuid()` 直接用。

3. **BSL 不是真开源**：2019 年起换 Business Source License，云厂商不能直接卖 CRDB-as-a-Service；自用没问题。理解清楚再选。2024 年进一步收紧到完全闭源核心。

4. **Serializable 默认严格**：PG 默认 Read Committed，CRDB 默认 Serializable。**老的 SQL 直接迁过来可能频繁撞 retry error**——需要业务层加重试循环或主动改隔离级别。

5. **本地起单节点容易，分布式起来才出真问题**：3 节点跑通≠生产 ok。时钟漂移、网络分区、慢节点会让 HLC 出"不确定时间窗"，事务延迟尾巴变长。

6. **schema change 不是瞬时**：加索引、改列在 CRDB 是后台异步 backfill 的"在线 schema 变更"。好处是不锁表，坏处是大表上线慢，要监控 jobs 表。

## 适用 vs 不适用场景

**适用**：
- 全球用户的 SaaS / 金融 / 电商——需要跨地域强一致
- 数据量超出单机 Postgres（几 TB+）但又想留住 SQL 体验
- 7×24 高可用关键业务——节点挂了不能人工切主
- 多租户多地合规——数据按地域钉死（CRDB 支持 row-level locality）

**不适用**：
- 单机 OLTP 极致延迟场景——单机 Postgres / MySQL 更快更省
- 重 OLAP / 大数据分析——选 ClickHouse / Snowflake / Spark
- 简单 KV 缓存——直接 Redis，别上 SQL 数据库
- 嵌入式 / 小应用——SQLite 就够了
- 数据量小且永远不会跨机房——杀鸡用牛刀，运维复杂度不值
- 强依赖 Postgres 私有扩展（如 PostGIS 全功能）——CRDB 兼容到 protocol 层，扩展生态不全

## 历史小故事（可跳过）

- **2012 年**：Google 发表 Spanner 论文（OSDI 2012），展示如何用原子钟（TrueTime）实现"全球外部一致"。开源世界看了眼红。
- **2014 年**：三个前 Googler——Spencer Kimball、Peter Mattis、Ben Darnell——创立 Cockroach Labs，开干"开源版 Spanner"。名字典故：cockroach（蟑螂）打不死，对应"无单点"。
- **2017 年**：1.0 GA。当时还是 Apache 2.0 真开源。
- **2019 年**：改 BSL（Business Source License）——3 年后转 Apache 2.0。背景：AWS 卖 ElasticSearch / MongoDB 的 SaaS，原作者赚不到钱。
- **2024 年**：完全闭源核心（CRL Enterprise License），社区震荡。这是 SaaS 时代开源数据库共同困境。

## 学到什么

1. **分布式 SQL = 复用 SQL 接口 + 重写底层**——这是 2014 年后数据库新品类的核心套路（CRDB / TiDB / YugabyteDB）
2. **共识算法（Raft）是分布式数据库的地基**——每个 range 独立 Raft，是从 etcd 学来的工程模式：把"复制"和"调度"做成同一个单元
3. **强一致和延迟是相反的两端**——CRDB 选强一致，要延迟就别跨地域复制；CAP 三角永远要选两个
4. **开源协议是商业模式**——BSL 不是技术选择是生存选择，做开源数据库要先想清楚怎么不被云厂商吃掉
5. **接口兼容是最大杠杆**——CRDB 没造新协议，复用 Postgres 客户端生态省下了 10 年市场教育成本

## 延伸阅读

- 官方架构文档：[CRDB Architecture Overview](https://www.cockroachlabs.com/docs/stable/architecture/overview)（图文并茂，必读）
- 论文：[CockroachDB: The Resilient Geo-Distributed SQL Database](https://www.cockroachlabs.com/guides/the-architecture-of-a-distributed-sql-database/) SIGMOD 2020
- Spanner 原论文：[Spanner: Google s Globally-Distributed Database](https://research.google/pubs/pub39966/) OSDI 2012
- [[postgresql]] —— CRDB 的协议蓝本
- [[mariadb-server]] —— 单机 SQL 数据库的另一极
- 视频：[CMU Database Group — Distributed SQL Databases](https://www.youtube.com/watch?v=v_ce0tvUqx4)（CMU Andy Pavlo 讲分布式 SQL 全景）

## 关联

- [[postgresql]] —— 协议兼容的源头；CRDB 复用 Postgres 客户端生态
- [[mariadb-server]] —— 单机 SQL 数据库参照系；和 CRDB 走相反路线
- [[postgres-js]] —— Postgres 客户端，照样能连 CRDB
- 受 Spanner（OSDI 2012）启发，但用 HLC 替代了 TrueTime 的硬件依赖
- Raft 共识层是从 etcd 工程模式学的：把"复制 + 调度"做成同一个单元
- 同代竞品：TiDB（MySQL 协议路线）、YugabyteDB（PG 协议但计算存储分层）、Spanner（闭源云服务）
