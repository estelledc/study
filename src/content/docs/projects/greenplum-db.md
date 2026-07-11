---
title: Greenplum — Postgres 改的 MPP 数仓
来源: https://github.com/greenplum-db/gpdb
日期: 2026-05-31
分类: 基础设施
难度: 中级
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
- 为什么 2024 年 Broadcom 把 gpdb 仓库归档只读后，社区会转向 Cloudberry 等 fork——它的代码库是 PG 派 MPP 的样板

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

逐部分解释：

- `DISTRIBUTED BY (user_id)`：按用户哈希切片，同一用户的订单和资料落在同一 segment。
- 同键 JOIN：执行计划里看不到 `Redistribute Motion`，网络几乎不搬行。
- 若改成一边按 `order_id`、一边按 `user_id`：JOIN 前必须 redistribute，延迟会明显上去。

### 案例 2：维度表用复制表

```sql
CREATE TABLE dim_city (
  city_id INT,
  city_name TEXT
) DISTRIBUTED REPLICATED;
```

只有几千行的维度表，每个 segment 各存一份。事实表 JOIN 维度表时**不需要 broadcast**，省一次全量分发。

逐部分解释：

- `DISTRIBUTED REPLICATED`：小表在每个 segment 留完整副本，换空间省网络。
- 适合城市、币种这类很少变的维度；大事实表仍用 hash 分布。
- 维度一更新要写遍所有 segment，所以只拿来放真正的小表。

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

逐部分解释：

- `gpfdist`：轻量 HTTP 文件服务，把 CSV 目录暴露给集群。
- `LOCATION ('gpfdist://...')`：外部表只描述"去哪拉"，不先塞进 coordinator。
- `INSERT ... SELECT`：各 segment **并发拉自己那份**；TB 级常几十分钟，单点 INSERT 可能要一天。

## 踩过的坑

1. **分布键选错 = 数据倾斜**：选了集中度高的列（比如 `status` 只有几个枚举），少数 segment 装了绝大多数行，查询变成"等最慢那台"。诊断看 `gp_segment_id` 的行数分布。

2. **小表也被 hash 分布**：忘了用 `DISTRIBUTED REPLICATED`，每次 JOIN 都触发 broadcast，网络吃紧。建表前先想清楚是事实表还是维度表。

3. **Coordinator 是单点**：master 挂了整库不可写，必须提前配 standby master + `gpactivatestandby` 切换流程演练过。

4. **VACUUM 仍要做**：底层是 PG，事务 ID 会绕回；append-optimized 表也要定期 `VACUUM` 回收。生产忘了配 autovacuum 等价机制，几个月后 XID 耗尽全库只读。

5. **升级痛苦**：跨大版本（5 → 6 → 7）官方推荐 `gpbackup` + `gprestore`，TB 级数据停机几小时到一天。in-place 升级工具长期不稳。

6. **Broadcom 2024 归档上游**：`greenplum-db/gpdb` 等仓库被归档为只读，社区更新停摆。继续投入要看 Cloudberry 等 fork 能否跟上 PG 主线与安全补丁。

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

## 历史小故事（可跳过）

- **2005 前后**：Greenplum 在 PostgreSQL 8.2 上做 shared-nothing 改造，瞄准分析型 SQL。
- **2010 年**：EMC 收购；随后进入 Pivotal，ORCA 优化器、列存与资源组逐渐补齐。
- **2015–2019**：开源 gpdb 进入更多国内金融/运营商数仓；VMware 接手后继续发大版本。
- **2024 年**：Broadcom 收购 VMware 后，上游 GitHub 仓库归档只读；社区转向 Apache Cloudberry 等延续。

## 学到什么

1. **Shared-nothing 是上一代 MPP 数仓的主流路径**：Teradata / Vertica / Redshift / Greenplum 都是这条路；存算绑在一起，扩容要同时加机器和磁盘
2. **在成熟单机库上做 MPP 改造代价巨大**：事务、catalog、备份、升级几乎处处要重写；Motion 可见、gpfdist、ORCA 都是长出来的补丁式能力
3. **数据分布是 MPP 的灵魂**：分布键选对，JOIN 几乎免费；选错，再多机器也是看一台慢
4. **开源治理影响选型**：母公司易主可让上游停更，2024 归档事件是教科书案例

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

- [[lakehouse-2021]] —— Lakehouse 2021 — 把数据湖和数仓合成一套开放平台
- [[snowflake]] —— Snowflake — 云数仓把存储和计算拆开
- [[databend]] —— Databend — Rust 写的存算分离云数仓
- [[doris]] —— Apache Doris — MySQL 协议 MPP OLAP 数据库
- [[projects/starrocks]] —— StarRocks — MPP 列存数据库
