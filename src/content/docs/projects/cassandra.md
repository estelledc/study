---
title: Apache Cassandra — 分布式宽列数据库
来源: https://github.com/apache/cassandra
日期: 2026-05-29
分类: 数据库 / 分布式
难度: 中级
---

## 是什么

Apache Cassandra 是 **Facebook 2008 年开源的分布式 NoSQL 数据库**，借鉴了 Amazon Dynamo（[[paxos]] 同学，讲分布式一致性）和 Google BigTable（讲宽列存储）两条路线，把它们拼成一个能扛海量写入的系统。

日常类比：

- [[postgresql]] 像**单店收银台**——只有一个，强一致，但也只能扛一台机器的负载。
- Cassandra 像**连锁便利店**——每家店都能独立收银（本地写），晚上各店把账本通过 gossip 互相同步。代价是：客户刚买的东西，隔壁店可能要几秒后才看见。

它擅长的不是"复杂查询"，而是"**疯狂写入 + 跨机房 + 永不停机**"。

## 为什么重要

不了解 Cassandra，下面这些事就解释不了：

- 为什么 Discord 每天能写入数十亿条聊天消息——他们核心存储是 Cassandra（后来迁到 ScyllaDB，但模型没变）
- 为什么 Apple、Netflix、Uber 都在用 Cassandra 做核心系统——它写吞吐第一，可达每秒百万级
- 为什么 ScyllaDB（C++ 重写版）和 AWS Keyspaces（兼容协议）都基于 Cassandra 模型——这套设计已成事实标准
- 为什么 NoSQL 阵营里 Cassandra 能存活 16 年——Apache 2.0 协议 + 大型用户长期投入

## 核心要点

Cassandra 三个核心概念，逐个拆开：

1. **Ring + Gossip（环 + 流言）**
   所有节点排成一个环，每条数据按主键哈希落到某个区间，由该区间的节点负责。节点之间不通过中心协调器交流，而是用 gossip 协议——每秒互相说"我看到的状态是什么"，几轮之后所有节点对集群拓扑达成一致。
   类比：连锁便利店没有总部，但每家店每天和邻居店打电话同步。

2. **Tunable Consistency（可调一致性）**
   不像传统数据库要么强一致要么弱一致，Cassandra 允许**每条 query 单独选**：
   - `ONE`：写入或读取只要 1 个副本确认 → 最快，最弱
   - `QUORUM`：要 N/2+1 个副本确认 → 平衡
   - `ALL`：所有副本都确认 → 最强，最慢
   按业务需求来选——日志可以 ONE，账户余额必须 QUORUM。

3. **CQL（Cassandra Query Language）**
   语法长得像 SQL，但**只允许按主键查**。这是它最反直觉也最关键的设计——查询模式必须先想好，再设计表。
   不能 `WHERE name = 'Alice'`（除非 name 是主键的一部分），但能 `WHERE id = ?` 极快。

## 实践案例

### 案例 1：本地起一个 Cassandra（Docker）

```bash
docker run -d --name cass -p 9042:9042 cassandra:4
docker exec -it cass cqlsh
```

5 秒后你就有一个能跑的 Cassandra 节点。生产环境通常 3 节点起步。

### 案例 2：建表 + 写入 + 读取

```sql
CREATE KEYSPACE app
WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 3};

USE app;

CREATE TABLE users (
  id UUID PRIMARY KEY,
  name TEXT,
  email TEXT
);

INSERT INTO users (id, name, email)
VALUES (uuid(), 'Alice', 'alice@example.com');

SELECT * FROM users WHERE id = 8c1f...;
```

注意：

- `replication_factor: 3` 意思是每条数据存 3 份，分布在不同节点
- `SELECT * FROM users WHERE name = 'Alice'` 会**直接报错**——name 不是主键，Cassandra 拒绝全表扫描

### 案例 3：按访问模式建表（反范式）

如果业务既要按 `id` 查也要按 `email` 查，传统 SQL 一张表 + 一个索引解决。Cassandra 里的常见做法是**建两张表**：

```sql
CREATE TABLE users_by_id (id UUID PRIMARY KEY, name TEXT, email TEXT);
CREATE TABLE users_by_email (email TEXT PRIMARY KEY, id UUID, name TEXT);
```

写入时同时写两张。读取时按需选。这种"为每种查询模式建一张表"的思路叫**查询驱动建模**，是 Cassandra 的灵魂，也是和 SQL 思维差最远的地方。

## 踩过的坑

1. **不能 ad-hoc 查询**
   传统 SQL 思维：先建表，再想怎么查。Cassandra 反过来：**先想清楚怎么查，再建表**。临时换查询模式 = 重建一张表。新人最大的认知断层。

2. **Tombstone（墓碑）累积**
   Cassandra 删除不是真删，而是写一条"墓碑"标记。删多了，读取时要扫一堆墓碑，速度暴跌。需要定期 compaction（合并 + 清理）。
   实战提醒：不要把 Cassandra 当队列用（频繁删消息），会被墓碑拖垮。

3. **Compaction 策略选错**
   Cassandra 后台不停合并 SSTable（数据文件）。三种主流策略：
   - **STCS**（Size-Tiered）：写多读少
   - **LCS**（Leveled）：读多写少
   - **TWCS**（Time-Window）：时序数据（日志、IoT）
   选错策略，磁盘 IO 立刻翻倍。

4. **Repair 必须定期跑**
   各副本在 gossip 时可能出现细微不一致（节点宕机、网络抖动）。必须定期跑 `nodetool repair`，否则副本会永远偏离。生产环境通常每周跑一次。

## 适用 vs 不适用场景

**适用**：

- 海量写入（日志、IoT、消息流、点击流）
- 跨机房 / 多区域部署，要求每个区域低延迟读写
- 时序数据（用 TWCS compaction + 时间分区）
- 写远多于读、读模式固定

**不适用**：

- 复杂关联查询（JOIN、子查询）→ 用 PostgreSQL
- 强事务要求（转账、库存）→ 用关系数据库或 NewSQL（CockroachDB / TiDB）
- 数据量小（< 100GB）→ 单机 PostgreSQL 性能更好、运维更简单
- 查询模式经常变 → CQL 限制会变成噩梦

## 历史小故事（可跳过）

- **2008 年**：Facebook 工程师 Avinash Lakshman（Dynamo 论文作者之一）和 Prashant Malik 为收件箱搜索造了 Cassandra。希腊神话里 Cassandra 是个能预言但没人信的预言家——选这名字有点黑色幽默。
- **2009 年**：Facebook 把代码捐给 Apache。
- **2010 年**：Apache 顶级项目。同年 Twitter 宣布要用，引发关注。
- **2013 年**：DataStax 公司成立，做 Cassandra 商业版。
- **2017 年**：v3.11 LTS 长期支持版发布。
- **2024 年**：v5.0 加入 storage-attached indexes（SAI），第一次允许真正的二级索引——往"放宽查询限制"方向松动了一点。

## 学到什么

1. **CAP 取舍要明示**——Cassandra 选 AP（可用 + 分区容错），用 tunable consistency 把 C 的强度交给应用层选。这是分布式系统设计的经典样本。
2. **数据模型跟着查询走**——传统 SQL 是"先建表，查询自由"，Cassandra 是"先定查询，建表为查询服务"。两种思维各有适用场景。
3. **去中心化的代价是运维复杂**——没有主节点听起来美好，但 repair / compaction / 监控都得自己上心。
4. **理论 → 工程 → 商业化 → 衍生**——Dynamo 论文（2007） → Cassandra（2008） → DataStax（2013） → ScyllaDB（2015 重写） → AWS Keyspaces（2020 兼容协议）。每一步隔几年。

## 延伸阅读

- 官方文档：[Cassandra Documentation](https://cassandra.apache.org/doc/latest/)
- 论文：[Dynamo: Amazon's Highly Available Key-value Store (2007)](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf)（Cassandra 思想源头之一）
- 论文：[Bigtable: A Distributed Storage System (2006)](https://research.google/pubs/pub27898/)（宽列存储思想源头）
- 工具：DataStax DevCenter / cqlsh / nodetool
- [[paxos]] —— 分布式一致性的另一条路（Cassandra 选了 gossip + 最终一致，没用 Paxos）
- [[postgresql]] —— 强一致单机 SQL 的代表，对照学习

## 关联

- [[paxos]] —— 同样讲分布式协调，但 Paxos 走强一致，Cassandra 走最终一致
- [[postgresql]] —— 单店强一致 vs 连锁最终一致的鲜明对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
