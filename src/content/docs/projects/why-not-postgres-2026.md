---
title: "Why Not Just Use Postgres? (2026) — 零基础学习笔记"
来源: https://www.amazingcto.com/postgres-for-everything-2026/
日期: 2026-06-13
分类: 数据库
子分类: 存储与查询
provenance: pipeline-v3
---

# Why Not Just Use Postgres? (2026) — 零基础学习笔记

## 一、核心思想：用"工具箱"来理解

想象你有一个巨大的瑞士军刀——它集成了螺丝刀、剪刀、开瓶器、指甲锉等等所有功能。

你还需要单独买一把螺丝刀、一把剪刀、一个开瓶器吗？

这篇文章的核心观点就是：**PostgreSQL 就像那把瑞士军刀**。它能同时扮演数据库、缓存、消息队列、搜索引擎等角色，让开发者不需要维护一堆不同的工具。

## 二、现实问题：我们的工具箱太乱了

很多公司在发展过程中，会慢慢引入越来越多专门化的工具：

- **Redis** → 用来做缓存
- **MongoDB** → 用来存文档数据
- **Kafka** → 用来处理消息队列
- **Elasticsearch** → 用来做全文搜索

每个工具都需要：安装、配置、监控、备份、维护、排查故障……

**开发者要学习的技术越多，犯错的可能性就越大。**

文章用了一个数学例子：如果你有 5 个系统，每个的可用性都是 99.9%，那么全部加在一起的总可用性会掉到 99.7%。换句话说，**工具越多，出问题的概率越大**。

## 三、PostgreSQL 能替代什么？（核心概念 + 代码示例）

以下是文章中提到的主要替代方案：

### 3.1 替代 Redis 缓存：UNLOGGED 表 + JSONB

PostgreSQL 可以用 JSONB 类型存储数据，配合不记录日志的表（UNLOGGED TABLE），性能接近缓存。

```sql
-- 创建一个不记录日志的表（速度更快）
CREATE UNLOGGED TABLE cache (
    key TEXT PRIMARY KEY,
    value JSONB,
    expires_at TIMESTAMP
);

-- 插入一条带过期时间的缓存数据
INSERT INTO cache (key, value, expires_at)
VALUES ('user:1001', '{"name": "Jason", "age": 25}', NOW() + INTERVAL '1 hour');

-- 查询并自动过滤过期的数据
SELECT value FROM cache WHERE key = 'user:1001' AND expires_at > NOW();

-- 清理已过期数据
DELETE FROM cache WHERE expires_at < NOW();
```

**类比：** 这就像一个带标签的储物柜，标签上写着"这个柜子 1 小时后清空"。到了时间，自动清空，跟 Redis 的过期机制一样。

### 3.2 替代消息队列（Kafka）：SKIP LOCKED

PostgreSQL 9.5 引入了 `SELECT ... FOR SKIP LOCKED`，可以直接用它做消息队列。

```sql
-- 创建一个消息表
CREATE TABLE message_queue (
    id SERIAL PRIMARY KEY,
    payload JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 插入消息
INSERT INTO message_queue (payload) VALUES
    ('{"type": "email", "to": "user@example.com"}'),
    ('{"type": "sms", "to": "+123456789"}');

-- 取出并"锁定"一条消息（其他进程不会重复取到同一条）
SELECT id, payload FROM message_queue
ORDER BY created_at ASC
LIMIT 1
FOR SKIP LOCKED;

-- 处理完后删除
DELETE FROM message_queue WHERE id = 1;
```

**类比：** 想象一个排队取号窗口。`SKIP LOCKED` 的意思是：如果有几个人同时在取号，A 取到 1 号并正在处理，B 来取号时就自动跳过 1 号，取到 2 号。不会两个人取到同一号。

### 3.3 替代 MongoDB：JSONB + 索引

PostgreSQL 的 JSONB 类型可以直接存储和查询 JSON 文档，还能创建索引。

```sql
-- 存储 JSON 文档
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    data JSONB
);

-- 创建 GIN 索引（让 JSON 查询变快）
CREATE INDEX idx_documents ON documents USING GIN (data);

-- 插入文档
INSERT INTO documents (data) VALUES
    ('{"title": "Hello Postgres", "tags": ["tutorial", "beginner"], "views": 100}');

-- 按标签查询
SELECT * FROM documents WHERE data @> '{"tags": ["beginner"]}';
```

### 3.4 其他替代方案速览

| 原来用的工具 | PostgreSQL 方案 | 关键组件 |
|---|---|---|
| Elasticsearch | 全文搜索 | `tsvector` + 索引 |
| 向量数据库 | 向量相似度搜索 | `pgvector` 扩展 |
| 定时任务（Cron） | 内置定时 | `pg_cron` 扩展 |
| 地理空间查询 | 位置搜索 | `PostGIS` 扩展 |
| API 限流 | 计数器限流 | 原子更新 + 时间窗口 |
| 分布式锁 | 进程间协调 |  advisory locks |
| 审计日志 | 操作记录 | `pgaudit` 扩展 |
| 测试用数据库 | 临时数据库 | 事务回滚 + 模板库 |

## 四、类比理解：PostgreSQL = Linux 操作系统

文章把 PostgreSQL 比作 **Linux 操作系统**：

- Linux 并没有消灭所有 Unix 变体，但通过"模块机制"吸收了各个系统的优点
- PostgreSQL 也在做同样的事：它吸收其他数据库的优秀功能，以统一的方式实现
- 你不需要"消灭" MySQL 或 MongoDB，而是**先在一个数据库里试试能不能用**

## 五、关键问题：FAQ 解读

### Q1: 单点故障怎么办？

A: 你有 5 个系统，每个都可能在某一刻坏掉。用 1 个系统代替 5 个，反而**减少了故障点**。

### Q2: 性能不够怎么办？

A: 文章提到 **Instagram 就是用 PostgreSQL 的**。他们的用户量远超你。等真的碰到性能瓶颈时再引入专用工具，而不是"觉得以后会用到"。

### Q3: 这算不算技术债？

A: 文章说这其实是**技术信用（technical credit）**——你现在投入的简单性，未来会回报你更多。真正的技术债是：6 种查询语言、4 套监控工具、3 种备份策略。

## 六、总结：什么时候该用，什么时候不该用

**适合用"只用 PostgreSQL"的场景：**

- 创业公司 / 早期项目（用户量 < 100 万）
- 团队小，维护不了多个数据库
- 追求快速开发、快速迭代
- 开发者希望专注业务逻辑而不是运维

**可能不适合的场景：**

- 已经确定要处理海量数据（数十亿条记录）
- 需要流式处理（streaming）
- 对读写延迟要求极低（微秒级别）

**一句话总结：** 先让事情跑起来，等真的跑不动了再换工具，比一开始就造一辆赛车更聪明。

## 七、思考题（请回答后再继续）

1. 你现在的公司或项目里，用了几个数据库或缓存系统？
2. 如果其中一个要换，你最担心什么？
