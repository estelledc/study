---
title: YugabyteDB — 复用 Postgres 源码的分布式 SQL
来源: https://github.com/yugabyte/yugabyte-db
日期: 2026-05-31
分类: 数据库 / 分布式
难度: 中级
---

## 是什么

YugabyteDB 是一个开源的分布式 SQL 数据库。日常类比：把一家连锁超市的总账本拆成很多块，每块在三家分店各放一份；任何一家分店烧了账本仍在；客人在哪结账，余额跨店都对得上。

技术上看两层：

- **对外**：直接 fork 了 PostgreSQL 真实源码（11.2 起步）当查询层（叫 YSQL），SQL 解析、优化器、执行器都是 PG 自己的代码——而不是像 CockroachDB 那样从零重写 Postgres 协议。
- **对内**：自研存储层叫 DocDB，每节点底层用 RocksDB 做单机 KV，跨节点把数据切成 tablet（约 1GB 一段），每 tablet 独立跑一份 Raft 共识。

一句话：**外壳是真 Postgres，骨架是分布式 KV**。

## 为什么重要

不理解 Yugabyte，下面这些事都没法解释：

- 为什么不少 Postgres 扩展在 Yugabyte 比在 CockroachDB 更容易试装——因为 Yugabyte fork 真代码，CRDB 多半只兼容协议。
- 为什么 2024 年 CockroachDB 闭源核心后，需要"真开源分布式 SQL"的厂商纷纷转投 Yugabyte——它仍然是 Apache 2.0。
- 为什么"分布式 SQL"这个新品类在 2014 年后冒出三条路线：MySQL 路线（TiDB）/ PG 重写路线（CRDB）/ PG fork 路线（Yugabyte）。
- 为什么跨大洋三副本写入会多出约 100ms 延迟——强一致要等多数派点头，不是单机 PG 那种本地落盘。

## 核心要点

Yugabyte 的核心架构可以拆成 **三层 + 两个进程**：

1. **YQL 层**：YSQL（Postgres 兼容，fork 真源码） + YCQL（Cassandra CQL 兼容）。SQL 进来走 PG 解析器、优化器、执行器——但执行器底下不读本地堆表，改调 DocDB API。类比：前台收银系统还是原来的，仓库换成了连锁仓。
2. **DocDB 存储层**：分布式文档存储。key 编码 `DocKey = hash(主键) + range 列`，按哈希路由到 tablet（约 1GB 一段的数据分片）。默认哈希分片，避开自增主键热点。
3. **Raft 复制层**：Raft 像三人表决——多数派同意才算写入成功。每个 tablet 独立跑一份 Raft；事务用 HLC（混合逻辑时钟，给跨节点事件排先后）排序。

两个守护进程：

- **YB-TServer**：每节点一个，承载若干 tablet，并内嵌一个魔改 PG 进程处理 SQL。
- **YB-Master**：集群元数据 + 负载均衡 + tablet 分裂调度，自身也是 Raft 多副本。

## 实践案例

### 案例 1：连一个 Yugabyte 集群（连法和 PG 一字不差）

```bash
yugabyted start --base_dir=/tmp/ybd1
ysqlsh -h 127.0.0.1
```

`ysqlsh` 就是改名的 `psql`。进去写 SQL：

```sql
CREATE TABLE accounts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), balance DECIMAL);
INSERT INTO accounts (balance) VALUES (1000.00), (250.00);
```

PG 的 `gen_random_uuid()`、`DECIMAL`、各种类型直接能用——因为底下就是真 PG 代码。

### 案例 2：tablet 怎么自动分裂

每张表创建时按主键哈希默认切若干 tablet。当某 tablet 数据量超阈值或 QPS 太高，YB-Master 触发分裂：

```
原 tablet：hash 范围 [0x0000, 0xFFFF)  3GB
分裂为：
  tablet A：[0x0000, 0x8000)
  tablet B：[0x8000, 0xFFFF)
```

每半各跑独立 Raft，重新分散到不同节点。**不停机、不停写**。

### 案例 3：为什么部分 PG 扩展能装

```sql
CREATE EXTENSION pgcrypto;
CREATE EXTENSION pg_stat_statements;
```

YSQL 保留了 PG 的扩展加载机制，所以不少扩展（如 `pgcrypto`）能装；但依赖本地堆表/特定索引实现的扩展（部分 GIS / 向量场景）仍可能半残或缺功能。CRDB 里同类命令常直接 `unsupported`——它多半只兼容到协议层。

### 案例 4：写入路径走一遍

客户端 `INSERT INTO accounts (balance) VALUES (500)` 发到任一 YB-TServer：

1. 节点上的 PG 进程解析、规划这条 SQL（这一段是真 PG 代码）。
2. 执行器调 DocDB API 而不是写本地堆表，按 `DocKey = hash(uuid)` 算出归属 tablet。
3. 路由到该 tablet 的 Raft leader（可能在另一节点）。
4. Leader 提议日志条目、复制到 follower、等多数派确认。
5. 提交后回客户端：HLC 时间戳落到 MVCC 版本上（MVCC = 同一行保留多个时间版本，读旧快照不挡写）。

整个链路上**前半截**像普通 PG，**后半截**像 etcd——这就是 Yugabyte 的"上下分层"。

## 踩过的坑

1. **fork PG 要盯版本线**：长期基于 PG 11.2；2025.1 / 2.25 起才 rebase 到 PG 15。选版本前先查 `version()`，别假设所有发行版都有 PG 15 语法。

2. **Master 是元数据瓶颈**：tablet 过多会让 Master 内存吃紧。官方建议每集群控制在约 5–10 万 tablet；超大表早期得手动预分片（pre-split）。

3. **默认不是 Serializable**：YSQL 有效默认是 Snapshot（≈ PG 的 Repeatable Read）；开 Serializable 或冲突多时更易撞 `40001`，业务层要加重试。别按"默认 Serializable"排错。

4. **JSONB / 扩展别当单机 PG 等价**：DocDB 的 JSONB 与 GIN 等能力未完全对齐；扩展兼容因版本与存储语义而异，复杂查询要先在目标版本实测。

5. **跨地域强一致要交延迟税**：跨大洋三副本写入常多约 100ms——选强一致就别期待单机延迟；文档也要分清开源版与 Yugabyte Cloud。

## 适用 vs 不适用场景

**适用**：
- 已有重度 PostgreSQL 应用要平滑扩到分布式（SQL / 扩展路径通常比 CRDB 更接近真 PG）。
- 需要 Apache 2.0 真开源协议、不接受 BSL 限制的厂商。
- 金融、零售跨地域强一致 OLTP（用户案例：Kroger、PayPal、Comcast、富国银行）。
- 同时要 SQL 和 Cassandra 风格 KV 接口的混合工作负载（YSQL + YCQL）。

**不适用**：
- 单机极致延迟 OLTP——多一次 Raft，单机 PG / MySQL 更快。
- 重 OLAP / 数据仓库——选 ClickHouse / Snowflake。
- 简单 KV 缓存——直接 Redis。
- 数据量小且永远不跨机房——运维复杂度不值。
- 绑死尚未进入你所选发行版的 PG 新语法——先确认该版本是 PG 11 线还是已 rebase 的 PG 15 线。

## 历史小故事（可跳过）

- **2013 年**：Karthik Ranganathan 等三人在 Facebook 消息基础设施重写 Apache HBase 母版，积累超大规模分布式存储经验。
- **2016 年**：三人创立 Yugabyte，目标"下一代分布式 SQL"。
- **2018 年**：2.0 发布，正式选择 fork PostgreSQL 源码当查询层——这是和 CRDB "重写" 路线的根本分叉。
- **2019 年**：从"源码可见但商用限制"改回 100% Apache 2.0，正好吃 CRDB 改 BSL 的红利。
- **2021 年**：D 轮 1.88 亿美元，估值 13 亿独角兽。
- **2024 年**：CRDB 完全闭源核心后，Yugabyte 成少数 Apache 2.0 分布式 SQL 旗手。

## 学到什么

1. **复用真代码 vs 重新实现是路线分叉**——Yugabyte 选 fork PG 源码省了重写协议的工程量，但欠下版本追主线的债；CRDB 选重写换来灵活但兼容性受限。
2. **开源协议本身就是产品差异化**——Apache 2.0 vs BSL 不只是法律选择，是 Yugabyte 与 CRDB 最显眼的卖点对比。
3. **分布式 SQL 三国鼎立**——MySQL 路线（TiDB）/ PG 重写路线（CRDB）/ PG fork 路线（Yugabyte）。
4. **存储和查询解耦的好处**——YQL 层是真 PG、DocDB 是干净 KV，分层让上层兼容性强、下层创新自由。

## 延伸阅读

- 官方架构文档：[YugabyteDB Architecture](https://docs.yugabyte.com/preview/architecture/)（YSQL / DocDB / Raft 分层图）
- 论文：[YugabyteDB — A Distributed SQL Database That Scales](https://www.yugabyte.com/blog/yugabytedb-paper/) VLDB 2024
- 路线对比：[YugabyteDB vs CockroachDB](https://www.yugabyte.com/yugabytedb-vs-cockroachdb/)（卖瓜文但技术对比清晰）
- [[postgresql]] —— Yugabyte 直接 fork 的源码母版
- [[etcd]] —— Raft 共识的工程参考
- 视频：[CMU Database Group — Distributed SQL Databases](https://www.youtube.com/watch?v=v_ce0tvUqx4)（CMU Andy Pavlo 讲分布式 SQL 全景）

## 关联

- [[postgresql]] —— Yugabyte 直接 fork 真源码当 YSQL 查询层
- [[etcd]] —— Raft 共识工程模式来源（每 tablet 独立 Raft 同 etcd）
- [[pgvector]] —— PG 扩展生态典型代表，在 Yugabyte 可试装但需按版本实测
- [[tidb]] —— MySQL 路线的分布式 SQL 对照
- [[rocksdb]] —— DocDB 单机 KV 底座
- 同代竞品：CockroachDB（PG 协议但重写）、Spanner（闭源云服务）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
