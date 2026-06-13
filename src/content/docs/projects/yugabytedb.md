---
title: YugabyteDB — 零基础入门分布式 SQL
来源: https://github.com/yugabyte/yugabyte-db
日期: 2026-06-13
分类: 数据库
子分类: databases-storage
provenance: pipeline-v3
---

## 从一家连锁超市说起

假设你开了一家超市，只有一本总账本记录所有顾客的购物和余额。这本账本放在收银台旁边。

现在生意火了，你开了 100 家店，问题来了：

- 100 个收银员同时改一本账本，会不会写乱？
- 账本丢了怎么办？
- 客人从北京结账，上海的分店怎么知道他卡里还剩多少钱？

分布式数据库就是干这个的：把一本账本拆成多份，放在很多台机器上，每台机器上的数据永远是同步一致的，哪怕坏了几台机器也不会丢数据。

YugabyteDB 就是这样一个开源工具。

## 一句话介绍

YugabyteDB 是一个开源的分布式 SQL 数据库，长得特别像 PostgreSQL——因为它就是把 PostgreSQL 的源代码拿过来改了改。你用 PostgreSQL 会写的 SQL，在 YugabyteDB 里几乎不用改就能跑。

## 它是怎么做到"分布式"的

想象一本大书，被切成好多页（每页大约 1GB），每一页都复印 3 份，放在 3 台不同的电脑里。

这三份之间有一个"班长"，叫 Raft 共识协议——每当有人要改某一页的内容，三份复印件都得商量好，多数派同意才算改成功。这样哪怕坏掉一台电脑，另外两台还有完整数据。

这些"页"在 YugabyteDB 里叫 **tablet**。当某个 tablet 越来越大或越来越忙时，YugabyteDB 会自动把它一劈为二，变成两个小 tablet，再各自找三台电脑放。这个过程对用户透明——**边跑边分，不停机**。

两个关键角色：

| 角色 | 作用 |
|---|---|
| **YB-TServer** | 干活的人。接收 SQL 请求，读写数据 |
| **YB-Master** | 管事的。管元数据、平衡负载、决定 tablet 什么时候分裂 |

## 核心概念

### 概念 1：YSQL —— 你熟悉的 PostgreSQL 方言

YugabyteDB 提供两种 SQL 接口，最常用的是 **YSQL**（Yugabyte SQL），它直接用了 PostgreSQL 的代码。这意味着：

- 所有的数据类型（INTEGER、TEXT、UUID、JSONB……）
- 所有的 SQL 语法（JOIN、子查询、窗口函数……）
- 大部分 PostgreSQL 扩展（pgcrypto、pg_stat_statements……）

都能直接用。对熟悉 PG 的人来说，几乎零门槛。

### 概念 2：YCQL —— 类 Cassandra 的接口

除了 YSQL，YugabyteDB 还提供一个叫 **YCQL** 的接口，兼容 Apache Cassandra 的 CQL 协议。适合同时需要关系型查询和文档存储的场景。

### 概念 3：分布式事务与 HLC

传统数据库用一个时钟给事件排序。YugabyteDB 用 **HLC（Hybrid Logical Clocks）** 给跨机器的事务排序，不用依赖全局时钟。这让事务在分布式环境下也能保持"串行化隔离"——就是看起来像只有一个人在操作。

### 概念 4：容错

YugabyteDB 设计目标是：节点坏了、机架倒了、机房断电了，数据库照样能跑。典型配置下（一个 Region 多个可用区），RPO = 0（不丢数据），RTO ≈ 3 秒（3 秒内自动恢复）。

## 动手写两条 SQL

YugabyteDB 的 SQL 写法跟 PostgreSQL 一模一样。先连进去：

```bash
# 启动一个本地 YugabyteDB 集群（三节点）
yugabyted start --base_dir=~/yb-tserver-node1

# 用 ysqlsh 连接（就是改名的 psql）
ysqlsh -h 127.0.0.1 -p 5433
```

连进去后，写表、查数据——跟 PG 没区别：

```sql
-- 建一张用户表
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    balance     DECIMAL(12, 2) DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- 插几条数据
INSERT INTO users (name, email, balance) VALUES
    ('张三', 'zhang@example.com', 1000.00),
    ('李四', 'li@example.com', 250.00),
    ('王五', 'wang@example.com', 750.50);

-- 查：所有人的余额
SELECT name, balance FROM users ORDER BY balance DESC;

-- 查：余额超过 500 的用户
SELECT name, email FROM users WHERE balance > 500;
```

输出：

```
 name | balance 
------+---------
 张三 | 1000.00
 王五 |  750.50
(2 rows)
```

### 事务：转账的例子

```sql
-- 开启一个事务
BEGIN;

-- 张三转 200 给李四
UPDATE users SET balance = balance - 200 WHERE name = '张三';
UPDATE users SET balance = balance + 200 WHERE name = '李四';

-- 检查一下
SELECT name, balance FROM users;

-- 没问题就提交
COMMIT;
-- 有问题就回滚
-- ROLLBACK;
```

输出：

```
 name | balance 
------+---------
 张三 |   800.00
 李四 |   450.00
 王五 |   750.50
(3 rows)
```

两条 UPDATE 要么全成功、要么全失败——这就是分布式事务的保证。

## 写入数据的路径：一条 SQL 是怎么跑的

当你执行 `INSERT INTO users (name, email, balance) VALUES ('赵六', 'zhao@example.com', 500)` 时，内部经历了这些步骤：

1. **SQL 解析**：YB-TServer 里的 PostgreSQL 代码解析这条语句（和普通 PG 完全一样）。
2. **算归属**：按 `id`（UUID）的哈希值算出这条数据属于哪个 tablet。
3. **路由**：找到存这个 tablet 的 Raft leader 节点。
4. **Raft 共识**：leader 写日志，三份副本中至少两份确认。
5. **提交**：三票通过才算成功，返回结果给客户端。

整个链路可以概括为：**上半截像普通 PG，下半截像 etcd**。

## PostgreSQL 扩展：拿来就用

因为 YugabyteDB 直接 fork 了 PostgreSQL 源码，PG 的扩展生态几乎能用：

```sql
-- 加密扩展，直接装
CREATE EXTENSION pgcrypto;
SELECT encode(gen_random_bytes(16), 'hex');

-- 查询统计扩展，直接装
CREATE EXTENSION pg_stat_statements;

-- 向量扩展（AI 场景），直接装
CREATE EXTENSION pgvector;
```

这在 CockroachDB 里是做不到的——CRDB 只是"兼容 Postgres 协议"，没有 PG 的扩展加载机制。

## 什么时候该用，什么时候不该用

**适合用：**

- 原来用 PostgreSQL，数据量大了想水平扩展
- 需要多机房容灾、跨地域部署
- 必须 Apache 2.0 开源协议
- 金融、电商、支付等需要强一致性事务的场景

**不适合用：**

- 单机跑、数据量很小——直接用 PostgreSQL 就好
- 做数据分析、数据仓库——用 ClickHouse / Snowflake
- 做缓存——用 Redis
- 只需要简单的 KV 读写——用 Redis 或 DynamoDB

## 跟其他分布式数据库的关系

分布式 SQL 领域主要有三条路线：

```
                     分布式 SQL 数据库
                        |
          ┌─────────────┼─────────────┐
          |             |             |
     MySQL 路线      PG 重写路线    PG fork 路线
     TiDB          CockroachDB     YugabyteDB
  (Go 实现)       (Go 重写)        (C++ fork PG)
  存算分离        自研存储层        真 PG 源码
  PG 兼容有限     PG 兼容协议       真 PG 扩展能用
```

| | TiDB | CockroachDB | YugabyteDB |
|---|---|---|---|
| 协议 | MySQL | PostgreSQL | PostgreSQL |
| 写法 | 改 PG 源码 | 重写 PG 协议 | fork PG 源码 |
| 开源协议 | Apache 2.0 | BSL（2024 年后） | Apache 2.0 |
| PG 扩展 | 不能 | 大部分不能 | 大部分能 |

## 踩坑提醒

1. **默认隔离级别是 Serializable**，不是 PG 的 Read Committed。老应用直接迁过来，事务冲突会报 `40001` 错误，需要业务层加重试逻辑。
2. **自增主键会热点**：YugabyteDB 默认按哈希分片，用自增整数做主键会导致所有写入集中在一个 tablet。建议用 UUID 或加盐。
3. **Master 有上限**：一个集群的 tablet 数量建议控制在 5-10 万以内，超出需要手动预分片。
4. **跨地域写入有延迟**：三副本跨洲写入，数据得等多数派确认， latency 会受最远节点物理距离限制。

## 学到了什么

1. **分布式数据库 = 数据切分 + 共识复制**。YugabyteDB 用 tablet 切分、Raft 复制，原理和 etcd、Consul 一脉相承。
2. **fork 真代码 vs 重写协议是路线选择**。YugabyteDB 选了 fork PG 源码，换来几乎完全的兼容性，但也背上了追 PG 主线的维护债。
3. **开源协议影响技术选型**。CRDB 2024 年改为 BSL 后，不少厂商转向了 YugabyteDB。
4. **分布式不免费**。强一致性意味着写入要多等几次网络往返——这是 CAP 定理决定的，没法绕过。

## 延伸阅读

- 官方架构文档：[YugabyteDB Architecture](https://docs.yugabyte.com/stable/architecture/)
- 论文：[YugabyteDB — A Distributed SQL Database That Scales](https://www.yugabyte.com/blog/yugabytedb-paper/)（VLDB 2024）
- CMU 课程视频：[Distributed SQL Databases](https://www.youtube.com/watch?v=v_ce0tvUqx4)
- [[postgresql]] —— YugabyteDB 直接 fork 的源码母版
- [[etcd]] —— Raft 共识的工程参考
