---
title: Greenplum — Postgres 改的 MPP 数仓
来源: https://github.com/greenplum-db/gpdb
日期: 2026-05-31
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

Greenplum 是一个**把 PostgreSQL 横向切成几十台机器一起跑**的 MPP 数据仓库。日常类比：原本一家小餐馆只有一个厨师（单机 PG），下单多了就排队；Greenplum 等于把同一个厨师克隆 30 份，每个分店专做一部分订单，门口加一个迎宾员（coordinator）做拆单和合单。每个分店仍是完整的"那个厨师"，菜单、做法都一样——这就是它能直接吃 PG 生态的根本原因。

技术上：

- **底层 fork 自 PostgreSQL 8.2**（2005 年），后续一边追 PG 主线一边自己改，形成长期分叉
- **shared-nothing 架构**：1 个 coordinator（旧称 master）+ N 个 segment 节点，每个 segment 是独立的 PG 实例，磁盘各自管各自
- **用 SQL（PG 方言）查 TB-PB 级数据**，复杂 JOIN、窗口函数、CTE 全套都有
- 经典商业数仓（Teradata、Vertica、Redshift）的开源对标，国内早期金融、电信、运营商分析仓主力之一

## 为什么重要

不理解 Greenplum，下面这些事都解释不清：

- 为什么"把单机数据库改成 MPP"听起来简单，但 20 年里只有少数几家做成
- 为什么国内大行、运营商的传统分析仓很多年都跑在 Greenplum 上
- 为什么 Snowflake / BigQuery 出现后，Greenplum 这种 shared-nothing 老路开始式微
- 为什么 2024 年 Broadcom 把 gpdb 仓库改私有时，社区会立刻分出 Cloudberry 等 fork——它的代码库是 PG 派 MPP 的样板

## 核心要点

Greenplum 架构可以拆成 **两类节点 + 三个关键设计**。

**两类节点**：

- **Coordinator（master）**：迎宾员。接 SQL、解析、生成分布式执行计划、把任务切片下发给 segment、汇总结果。本身**不存业务数据**，只存元数据（catalog）。生产配 standby master 做高可用。
- **Segment**：分店厨师。每个 segment 是一个**完整的 PostgreSQL 实例**，存自己那份数据切片，独立执行计划片段。一台物理机上通常起多个 primary segment + 对应 mirror（副本）。

**三个关键设计**：

1. **数据分布（distribution）**：建表时选 `DISTRIBUTED BY (col)`（hash）/ `DISTRIBUTED RANDOMLY`（轮询）/ `DISTRIBUTED REPLICATED`（每段都存一份）。分布键选得好不好，直接决定查询要不要做 redistribute。
2. **Motion 算子**：执行计划里专属的 `Redistribute Motion` / `Broadcast Motion` / `Gather Motion`，明确表示"这一步数据要在节点之间搬"。看 EXPLAIN 看 Motion 就能判断 SQL 写得是否贴合分布。
3. **Polymorphic storage**：同一库里可以混用堆表（行存，能改）/ append-optimized 行存（批量追加压缩）/ append-optimized 列存（分析友好）。一张表选哪种由你决定。

节点间用 **interconnect**（UDP-based 的自研协议）做 shuffle，不走 TCP，是为了避开内核 TCP 栈在大规模并行下的尾延迟问题。

## 实践案例

### 案例 1：分布键选对 vs 选错

```sql
CREATE TABLE orders (
  order_id BIGINT,
  user_id BIGINT,
  amount NUMERIC,
  created_at TIMESTAMP
) DISTRIBUTED BY (user_id);

CREATE TABLE users (
  user_id BIGINT,
  city TEXT
) DISTRIBUTED BY (user_id);
```

两张表都按 `user_id` 分布，`JOIN ON o.user_id = u.user_id` 时**同 segment 本地完成**，不用网络 shuffle——这是 Greenplum 性能的甜点。

### 案例 2：维度表用复制表

```sql
CREATE TABLE dim_city (
  city_id INT,
  city_name TEXT
) DISTRIBUTED REPLICATED;
```

只有几千行的维度表，每个 segment 各存一份。事实表 JOIN 维度表时**不需要 broadcast**，省一次全量分发。

### 案例 3：并行装载 gpfdist

```bash
gpfdist -d /data/load -p 8081 -l /tmp/gpfdist.log &
```

```sql
CREATE EXTERNAL TABLE ext_orders (...)
LOCATION ('gpfdist://etl-1:8081/orders_*.csv')
FORMAT 'CSV';

INSERT INTO orders SELECT * FROM ext_orders;
```

`gpfdist` 是一个轻量 HTTP 服务，segment 们**并发去拉自己那份**，TB 级 CSV 几十分钟入库；走 coordinator 单点 INSERT 要跑一天。

## 踩过的坑

1. **分布键选错 = 数据倾斜**：选了集中度高的列（比如 `status` 只有几个枚举），少数 segment 装了绝大多数行，查询变成"等最慢那台"。诊断看 `gp_segment_id` 的行数分布。

2. **小表也被 hash 分布**：忘了用 `DISTRIBUTED REPLICATED`，每次 JOIN 都触发 broadcast，网络吃紧。建表前先想清楚是事实表还是维度表。

3. **Coordinator 是单点**：master 挂了整库不可写，必须提前配 standby master + `gpactivatestandby` 切换流程演练过。

4. **VACUUM 仍要做**：底层是 PG，事务 ID 会绕回；append-optimized 表也要定期 `VACUUM` 回收。生产忘了配 autovacuum 等价机制，几个月后 XID 耗尽全库只读。

5. **升级痛苦**：跨大版本（5 → 6 → 7）官方推荐 `gpbackup` + `gprestore`，TB 级数据停机几小时到一天。in-place 升级工具长期不稳。

6. **Broadcom 2024 改私有**：上游开源更新事实上停了。继续投入要看社区 fork（Cloudberry 等）能不能跟上 PG 主线和安全补丁。

## 适用 vs 不适用场景

**适用**：

- TB-PB 级历史数据仓库、经营分析、监管报表
- 复杂 SQL（多表 JOIN、窗口函数、CTE、PL/pgSQL UDF）的批量分析
- 已有 PostgreSQL 团队，想把单机 PG 横向扩展而不换栈
- 数据相对稳定、批量入库为主的传统数仓场景

**不适用**：

- 亚秒级实时多维查询 → Doris / StarRocks / ClickHouse
- OLTP 高并发短事务 → 原生 PG / MySQL / TiDB
- 云原生弹性伸缩、按量付费 → Snowflake / BigQuery / Databricks
- 海量小查询、每 query 都希望毫秒级返回（每个 query 都要走 coordinator 拆计划，启动开销大）

## 技术亮点

- **PG 兼容**：psql / JDBC / ODBC / 各类 BI 工具直接连，SQL 是标准 PG 方言
- **Motion 算子可见**：执行计划清楚标出数据搬运，调优有抓手
- **Polymorphic storage**：行存与列存混用，按表选最优物理布局
- **gpfdist 并行装载**：避开 coordinator 瓶颈，走 segment 直连
- **Resource Group**（基于 Linux cgroup）：CPU / 内存按组配额，避免大查询拖死小查询
- **ORCA 优化器**（可选）：Pivotal 自研的代价优化器，针对分布式 JOIN 顺序做更深搜索

## 学到什么

1. **Shared-nothing 是上一代 MPP 数仓的主流路径**：Teradata / Vertica / Redshift / Greenplum 都是这条路；存储和计算绑在一起，扩容要同时加机器和加磁盘
2. **在成熟单机数据库上做 MPP 改造代价巨大**：Greenplum 用了 10 年才把 PG 改成稳定 MPP，事务、catalog、备份、升级每一处都要重写
3. **数据分布是 MPP 的灵魂**：分布键选对，JOIN 几乎免费；选错，再多机器也是看一台慢
4. **开源治理影响选型**：商业母公司易主直接决定项目命运，2024 年的 Broadcom 事件是教科书案例

## 延伸阅读

- 官方文档（旧）：[Greenplum Database Docs](https://docs.vmware.com/en/VMware-Greenplum/index.html)
- 经典论文：*Greenplum：A Hybrid Database for Transactional and Analytical Workloads*（VLDB 2021）
- 社区 fork：[Apache Cloudberry](https://cloudberry.apache.org/)（Greenplum 7 基础上的开源延续）
- [[doris]] —— 新一代 MPP，向量化 + CBO，对标 Greenplum 的实时场景
- [[starrocks]] —— Doris 分叉出来的商业版，对手定位类似
- [[postgresql]] —— Greenplum 的母体，理解 PG 是理解 GP 的前提

## 关联

- [[postgresql]] —— Greenplum 把 PG 8.2 fork 出来横向切片，至今 catalog / 优化器框架都看得见 PG 痕迹
- [[doris]] —— 同样是 MPP，但走向量化 + 实时，覆盖 Greenplum 不擅长的亚秒级查询
- [[starrocks]] —— 现代 MPP 的另一极，证明"重写比改造更划算"是这一代的趋势
- [[clickhouse]] —— 单机列存极致，与 Greenplum 形成"单机强 vs 多机强"的两端
- [[hindley-milner]] —— 类型推导和 CBO 都是从已知信息推出最优方案，Greenplum 的 ORCA 走的是同一思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[databend]] —— Databend — Rust 写的存算分离云数仓
- [[doris]] —— Apache Doris — MySQL 协议 MPP OLAP 数据库
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[starrocks]] —— StarRocks — MPP 列存数据库

