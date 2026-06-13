---
title: "Apache Cassandra — 分布式宽列数据库"
来源: https://github.com/apache/cassandra
日期: 2026-06-13
子分类: databases-storage
分类: 数据库
难度: 初级
provenance: pipeline-v3
---

## 是什么

Cassandra 是一个**开源的 NoSQL 分布式宽列数据库**，2008 年由 Facebook 开发用于收件箱搜索，2010 年开源给 Apache 基金会。被 Netflix、Bloomberg、Backblaze、GitHub 等数千家公司用于支撑海量数据的读写。

日常类比：**就像一个超级巨大的共享记事本**——想象一个班级有 1000 张桌子（节点），每张桌子上放着一本笔记本。全班同学（客户端）都可以同时往笔记本里写字（写入）或翻到某一页看内容（读取）。如果某张桌子坏了，其他桌子上的副本还能继续提供内容。而且你要加桌子随时加，不用停工——这就是 Cassandra 的核心卖点：**写多、读多、永远在线、随时扩容**。

## 为什么重要

不理解 Cassandra 的设计哲学，下面这些事都没法解释：

- 为什么 Netflix 每天数十亿次的数据读写、Bloomberg 每天 200 亿次请求、Backblaze 的备份数据都压在 Cassandra 上
- 为什么 Cassandra 被称为"宽列"（wide-column）而不是"键值"或"文档"——因为它在一个 row 里可以有几十万列，适合存稀疏的大表
- 为什么 Cassandra 没有主节点（masterless），任何节点都能处理请求
- 为什么 Cassandra 在 2020 年后随着云原生和多数据中心需求爆发，成为 NoSQL 的事实标准之一

简单说：**如果你要存 TB 甚至 PB 级别的数据，还要保证高可用和高吞吐，Cassandra 是少数几个能扛住的选择之一**。

## 核心概念

Cassandra 的核心模型可以拆成 **六个关键概念**：

1. **Keyspace（键空间）**：最顶层的容器，类似传统数据库里的 database。每个 keyspace 定义数据复制策略（复制因子 RF）。

2. **Table（表）**：类似关系数据库的表，但更灵活——每行可以有完全不同的列，不需要预定义 schema。

3. **Partition Key（分区键）**：表的某个列（或多个列组合），用来决定数据存在哪个节点上。插入数据时，Cassandra 对分区键做 hash 运算，算出归属哪个节点。

4. **Node + Ring（节点 + 环形拓扑）**：每个 Cassandra 实例叫一个 node。所有节点在逻辑上排成一个环（ring），每个节点负责环上的一段 token 范围。没有主从之分，每个节点能力相同。

5. **Replication Factor（复制因子，RF）**：数据复制几份。RF=3 表示同一份数据存 3 个不同节点上。节点挂了，其他副本顶上——这就是高可用的来源。

6. **Consistency Level（一致性级别，CL）**：每次读写操作前，需要多少个节点确认才算成功。比如 RF=3 时，CL=QUORUM 表示需要多数（2 个）确认。你可以在每条查询里独立调整——这是 Cassandra 最灵活的特性之一。

简单说：**keyspace 是文件夹，table 是表格，partition key 是把数据分派到节点的地址标签，replication factor 是抄写几份，consistency level 是抄够几份才算完成**。

## 实践案例

### 案例 1：用 Docker 快速启动 Cassandra

```bash
# 创建网络
docker network create cassandra

# 启动 Cassandra 容器
docker run --rm -d \
  --name cassandra \
  --hostname cassandra \
  --network cassandra \
  cassandra:latest
```

等几秒钟让 Cassandra 初始化完成后，通过 cqlsh（Cassandra 的交互式命令行）连接：

```bash
docker run --rm -it \
  --network cassandra \
  nuvo/docker-cqlsh \
  cqlsh cassandra 9042
```

成功后你会看到提示符：

```
Connected to Test Cluster at cassandra:9042.
[cqlsh 5.0.1 | Cassandra 5.0.6 | CQL spec 3.4.7 | Native protocol v5]
Use HELP for help.
cqlsh>
```

### 案例 2：建库、建表、插入和查询数据

Cassandra 使用 CQL（Cassandra Query Language），语法非常像 SQL，但有重要区别——**不支持 JOIN**。

```cql
-- 创建 keyspace（相当于 database），复制因子为 1（单机演示用）
CREATE KEYSPACE IF NOT EXISTS store
WITH REPLICATION = { 'class' : 'SimpleStrategy', 'replication_factor' : '1' };

-- 切换到这个 keyspace
USE store;

-- 创建表：userid 是分区键（PRIMARY KEY）
CREATE TABLE IF NOT EXISTS shopping_cart (
    userid text PRIMARY KEY,
    item_count int,
    last_update timestamp
);

-- 插入数据
INSERT INTO shopping_cart (userid, item_count, last_update)
VALUES ('9876', 2, toTimestamp(now()));

INSERT INTO shopping_cart (userid, item_count, last_update)
VALUES ('1234', 5, toTimestamp(now()));

-- 查询数据
SELECT * FROM shopping_cart;
```

输出：

```
 userid | item_count | last_update
--------+------------+---------------------
   9876 |          2 | 2026-06-13 10:00:00
   1234 |          5 | 2026-06-13 10:00:01

(2 rows)
```

### 案例 3：复合分区键 + 聚类列（宽列的核心）

Cassandra 真正的威力在于**复合分区键 + 聚类列**——这让你能在一个 partition 内按特定顺序高效排序和查询。

```cql
-- 电商订单场景：按用户分区，按订单时间聚类
CREATE TABLE orders (
    userid text,
    order_id uuid,
    order_time timestamp,
    total_amount decimal,
    items list<text>,
    PRIMARY KEY (userid, order_time, order_id)
);
-- 说明：
--   userid 是分区键（决定数据在哪个节点）
--   order_time + order_id 是聚类列（决定同一个分区内数据的排序）

-- 插入数据
INSERT INTO orders (userid, order_id, order_time, total_amount, items)
VALUES ('alice', uuid(), toTimestamp(now()), 99.99, ['book', 'pen']);

INSERT INTO orders (userid, order_time, total_amount, items)
VALUES ('alice', toTimestamp(now() - duration '1 day'), 45.00, ['notebook']);

-- 查询 alice 的所有订单（按时间倒序）
SELECT * FROM orders
WHERE userid = 'alice'
ORDER BY order_time DESC;
```

这里的关键是：**分区键决定了数据在哪台机器上，聚类列决定了这台机器上数据怎么排序**。你可以按 `userid` 查到这个人所有订单，也可以只查某个时间段的订单——因为数据已经排好序了。

## 踩过的坑

1. **WHERE 子句限制**：Cassandra 的查询必须符合表定义的结构。分区键必须出现在 WHERE 中（等值匹配），聚类列可以范围查询但不能反向（先定义了 `order_time` 再定义 `order_id`，你就不能只按 `order_id` 查）。**设计表的时候就要想好怎么查**——这和 SQL 的"先存后查"思路完全不同。

2. **没有 JOIN**：Cassandra 不支持 JOIN，也不支持子查询。如果需要关联数据，要么在写入时就冗余合并（反范式），要么在应用层多次查询后拼接。这是 NoSQL 的通用代价。

3. **CONSISTENCY_LEVEL 选错导致超时**：CL 越高越安全但也越慢。如果 RF=3 但你设 CL=EACH_QUORUM（每个 datacenter 都要多数确认），在网络抖动时很容易超时。生产环境建议先用 CL=ONE 或 CL=LOCAL_QUORUM 调通，再逐步提高。

4. **TTL 不是定时删除**：Cassandra 的 TTL 标记过期数据，但实际清理是异步的（compaction 时）。数据"过期"后可能还能读到，不能依赖 TTL 做精确的定时删除。

## 适用 vs 不适用场景

**适用**：
- 写密集型场景（IoT 传感器数据、日志、时序数据）
- 需要跨多数据中心部署（金融、全球化应用）
- 数据量极大（TB 到 PB 级），线性扩展需求
- 容忍最终一致性的场景（聊天消息、排行榜、购物车）

**不适用**：
- 复杂查询 / 多表关联（用 PostgreSQL 更合适）
- 需要强一致性的金融交易（考虑 CockroachDB / Spanner）
- 小规模数据（几百 GB 以内，Cassandra 太重了）
- 需要全文搜索（用 Elasticsearch 更合适）

## 历史小故事（可跳过）

- **2008 年**：Facebook 工程师 Avinash Lakshman 和 Prashant Malik 开发，用于支撑 Inbox Search（类似 Gmail 的搜索）。名字"Cassandra"来自希腊神话中的女先知——"预言总是对的，但没人相信"。
- **2010 年**：开源给 Apache 基金会，进入孵化器。
- **2013 年**：成为 Apache 顶级项目（TLP），1..0 正式版发布。
- **2015 年**：DataStax（Facebook  spun-off 的商业公司）成立，提供企业级支持。
- **2022 年**：Cassandra 4.0 发布，引入审计日志、加密传输、Materialized Views 改进。
- **2024 年**：Cassandra 5.0 发布，主打 AI 驱动运维（AI-driven operations）、Zero Copy Streaming 加速节点扩容。
- **2026 年**：社区活跃，Netflix、Bloomberg、GitHub、Spotify 等持续大规模使用。

18 年从 Facebook 内部工具到全球 NoSQL 基础设施标配。

## 学到什么

1. **写优化优于读优化**——Cassandra 的 LSM Tree（Log-Structured Merge Tree）存储引擎让写入极快，读稍慢但可通过二级索引缓解
2. **表结构要跟着查询走**——"查询驱动设计"（query-driven schema design）是 Cassandra 的第一原则，先想清楚怎么查，再建表
3. **没有主节点 = 没有单点故障**——每个节点对等，任何节点都能协调请求，这是高可用的根本
4. **一致性是可配置的**——不像 SQL 数据库默认强一致，Cassandra 让你在速度和一致性之间做权衡，每条查询都能调

## 延伸阅读

- 官方入门：[Cassandra Basics](https://cassandra.apache.org/_/cassandra-basics.html)（概念全览）
- 快速上手：[Quickstart Guide](https://cassandra.apache.org/_/quickstart.html)（Docker 5 分钟跑起来）
- 官方文档：[Apache Cassandra Documentation](https://cassandra.apache.org/doc/latest/)（完整参考）
- Planet Cassandra：[planetcassandra.org](https://planetcassandra.org)（社区博客、教程、案例研究）
- 经典论文：[Bigtable](https://research.google/pubs/bigtable-a-distributed-storage-system-for-structured-data/)（Cassandra 的设计灵感来源之一）
- [[tikv]] —— TiKV 也是分布式 NoSQL，但走的是强一致的 HTCC 路线，和 Cassandra 的 AP 路线形成对比

## 关联

- [[tikv]] —— 同样是分布式 NoSQL，但追求强一致（CP），适合对一致性要求更高的场景
- [[lancedb]] —— LanceDB 面向 AI/向量检索，Cassandra 面向通用大规模结构化数据存储
