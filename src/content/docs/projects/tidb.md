---
title: TiDB — HTAP 分布式数据库
来源: https://github.com/pingcap/tidb
日期: 2026-05-31
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

TiDB 是一个**开源的分布式 HTAP 数据库**——你写的是普通 MySQL，它在背后帮你把数据存到几十台机器上，**同一份数据**还能同时支持交易（OLTP）和分析（OLAP）。

日常类比：[[mysql]] 像一家**单店餐厅**——客人多了厨房就堵；TiDB 像**连锁中央厨房 + 数据看板**：每家分店都能下单（OLTP），总部还能实时看到全国销售趋势（OLAP），不需要半夜跑批把数据搬到另一个仓库。

它由 PingCAP 在 2015 年开源，受 Google [[spanner]] / F1 论文启发。和 [[cockroachdb]] / YugabyteDB 并称分布式 SQL 三家。区别是 TiDB 走 MySQL 协议、有列存副本（TiFlash）、用 PD 中心化时间戳。

## 为什么重要

不理解 TiDB，下面这些事难解释：

- 为什么近几年很多公司把 MySQL 分库分表方案换成"分布式 SQL"——一边业务无感、一边底层弹性扩
- "HTAP" 这个词为什么会火——传统架构是 OLTP 库 + 数仓 + 半夜 ETL，链路长、数据滞后
- TiKV 为什么会从 TiDB 里独立出来、成为 CNCF 毕业项目——它本身就是一个通用分布式 KV
- 中国开源数据库做到全球影响力，TiDB 是少数几个范本

## 核心要点

TiDB 的架构可以拆成 **四个角色**：

1. **TiDB Server**——前台门面。无状态 SQL 层，兼容 **MySQL 5.7 协议**，所以 MySQL 的驱动、ORM、客户端工具直接能用。这层把 SQL 翻译成更底层的 KV 操作。

2. **PD（Placement Driver）**——大脑。管元数据 + 全局时间戳（**TSO**）+ 调度 Region。任何事务开始要找 PD 领一个时间戳。

3. **TiKV**——行存底盘。基于 [[rocksdb]] + [[raft]]，把整库看成有序 KV，按 key 范围切成 **Region**（默认 96MB）。每个 Region 有 3 副本放在不同机器。

4. **TiFlash**——列存副本。通过 Raft **Learner** 角色异步从 TiKV 拉数据，但落盘成列式。同一行数据存两份格式：行存给 OLTP、列存给 OLAP。

时钟方案：[[spanner]] 用 GPS + 原子钟硬件（TrueTime）；[[cockroachdb]] 用 HLC 软件混合时钟；TiDB 选择 **PD 中心化 TSO**——所有事务向 PD leader 领号。代价是 PD leader 是关键路径，好处是实现简单。

## 实践案例

### 案例 1：本地用 TiUP 起一个集群

```bash
# 安装 TiUP（PingCAP 的集群管理工具）
curl --proto '=https' --tlsv1.2 -sSf https://tiup-mirrors.pingcap.com/install.sh | sh

# 起一个本地 playground（TiDB + PD + TiKV + TiFlash 都在本机）
tiup playground

# 用 MySQL 客户端直接连
mysql -h 127.0.0.1 -P 4000 -u root
```

进去之后写得就是 MySQL：

```sql
CREATE TABLE orders (
  id BIGINT PRIMARY KEY AUTO_RANDOM,
  user_id BIGINT NOT NULL,
  amount DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id)
);
INSERT INTO orders (user_id, amount) VALUES (1, 99.50);
```

注意 `AUTO_RANDOM`——TiDB 的特色主键，避免自增带来的尾部 Region 热点。

### 案例 2：让一张表多一个列存副本

HTAP 的核心操作只有一行：

```sql
ALTER TABLE orders SET TIFLASH REPLICA 1;
```

执行后 TiFlash 会通过 Raft Learner 异步从 TiKV 同步数据，落盘成列式。之后查询：

```sql
-- 优化器自动判断：点查走 TiKV，聚合走 TiFlash
SELECT user_id, SUM(amount) FROM orders GROUP BY user_id;
```

不需要改应用、不需要 ETL、不需要数仓——这就是 HTAP 卖点。

### 案例 3：写延迟从哪来

跨机房的写要走 [[raft]] 多数派 + 找 PD 领时间戳：

1. 客户端发写到某个 TiDB Server
2. TiDB 向 PD 申请 TSO（全局时间戳）
3. 路由到对应 Region 的 leader（假设在 IDC-A）
4. leader 把日志发给 follower（IDC-B、IDC-C），等多数派确认
5. 提交，回客户端

如果客户端在 IDC-A、最近的 follower 在 IDC-B（往返 5ms），整体延迟 = TSO 一次 RTT + Raft 一次 RTT，物理下限就在那。

## 踩过的坑

1. **自增主键 = 尾部 Region 热点**：MySQL 习惯 `AUTO_INCREMENT`，照搬到 TiDB 后所有写都打到同一个 Region 的 leader 上，单点瓶颈。**解法**：用 `AUTO_RANDOM` 或用 `SHARD_ROW_ID_BITS` 打散。

2. **MySQL 兼容性 95% 但不是 100%**：早期版本不支持外键约束（6.6 才补上）、触发器/存储过程不完整、`SELECT ... FOR UPDATE` 语义有差异。迁移前必须跑兼容性测试。

3. **TiFlash 不是免费的**：每张开 TiFlash 副本的表都要多存一份列式数据，磁盘成本翻倍 + 同步带 IO。不能盲目"全开"，要按查询模式挑表。

4. **执行计划不稳定**：CBO（cost-based optimizer）依赖统计信息，统计过期会选错索引，复杂 JOIN 抖动比成熟商业数据库明显。生产环境要打 SQL Binding 锁住关键查询的执行计划。

5. **PD 是关键路径**：TSO 走 PD leader，PD 跨机房部署时延迟会传染到所有事务。一般 PD 三副本放同城三机房，跨城靠 TiKV 的 Raft 副本扛容灾。

6. **小集群不划算**：3 PD + 3 TiKV + 2 TiDB 起步，最少 8 台机器才稳。流量小、单库 MySQL 够用时强上 TiDB 是过度工程。

## 适用 vs 不适用场景

**适用**：

- MySQL 单库容量见顶（> 几 TB）想横向扩展，又不想改业务代码
- HTAP——交易和分析在同一份数据上跑，不再 ETL 到独立数仓
- 高可用核心系统（金融、电商订单），需要"挂一台机器/一个机房继续转"
- 多业务线共享一份数据，分析查询不能影响交易延迟

**不适用**：

- 超低延迟（< 5ms 写）→ 用单机 [[mysql]] / Redis
- 纯 OLAP / 数据仓库重计算 → 用 [[clickhouse]] / Snowflake / Doris
- 流量小、单机 MySQL 够 → 别上分布式，运维成本不划算
- 强依赖 MySQL 高级特性（某些函数、用户变量行为） → 兼容性不是 100%，要测

## 历史小故事（可跳过）

- **2015 年**：刘奇、黄东旭、崔秋（前豌豆荚工程师）在北京创办 PingCAP，第一天就开源 TiDB——目标"做一个开源版的 [[spanner]]"。
- **2017 年**：TiDB 1.0 GA，TiKV 子项目独立开源。
- **2019 年**：TiKV 加入 [[cncf]] 沙箱（不是 TiDB——TiKV 作为通用 KV 单独走 CNCF）。
- **2020 年**：TiKV 从 CNCF 毕业，成为继 etcd 之后第二个毕业的存储项目。
- **2021 年**：5.0 引入 TiFlash MPP（大规模并行处理），HTAP 第一次真正可用。
- **2022 年**：TiDB Cloud Serverless 公测，按用量计费。
- **2024 年**：7.5 LTS 发布，外键约束、资源管控等"补齐 MySQL 该有的"陆续到位。

## 学到什么

1. **HTAP = 同一份数据 + 两种存储格式**：用 Raft Learner 把列存当成"只读副本"，避免双写一致性问题，工程上很巧
2. **MySQL 协议兼容是产品最大杠杆**：开发者一行代码不用改就能迁过来，几乎是数据库领域的"杀手级"切入点
3. **存储和计算分层独立演进**：TiKV 能脱离 TiDB 单独用（比如喂给其他 SQL 层），CNCF 毕业反过来给 TiDB 加可信度
4. **中心化 TSO vs HLC**：两条路都通——TiDB 选简单（中心化）、CockroachDB 选无单点（HLC），各自有适配的场景

## 延伸阅读

- 官方文档：[TiDB Architecture](https://docs.pingcap.com/tidb/stable/tidb-architecture)（四个角色每一层都有图）
- 论文：[TiDB: A Raft-based HTAP Database](https://www.vldb.org/pvldb/vol13/p3072-huang.pdf)（VLDB 2020，HTAP 设计的权威说明）
- [[spanner]] —— 精神原型
- [[cockroachdb]] —— 同代竞品，比对学习最有效
- [[raft]] —— TiKV 副本同步算法
- [[rocksdb]] —— TiKV 单机存储引擎

## 关联

- [[spanner]] —— 论文级原型；TiDB 是受其启发的开源实现之一
- [[cockroachdb]] —— 同为分布式 SQL，协议（MySQL vs PG）/ 时钟（TSO vs HLC）/ HTAP 取舍不同
- [[raft]] —— TiKV Region 副本同步的共识算法
- [[rocksdb]] —— TiKV 单机存储引擎
- [[clickhouse]] —— 互补关系：交易用 TiDB / 重 OLAP 用 ClickHouse
- [[mysql]] —— 协议兼容目标，业务迁移路径

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[cockroachdb]] —— CockroachDB — 分布式 SQL 数据库
- [[leveldb]] —— LevelDB — Google LSM 库
- [[lsm-tree-1996]] —— LSM-Tree 1996 — 写优化存储引擎
- [[mysql]] —— MySQL — 全球最流行关系数据库
- [[raft]] —— Raft — 易理解的共识算法
- [[rocksdb]] —— RocksDB — 嵌入式 LSM 引擎
- [[spanner]] —— Spanner — 全球分布式 SQL 数据库

