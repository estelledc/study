---
title: "ScyllaDB — C++ 高性能 NoSQL 数据库学习笔记"
来源: https://github.com/scylladb/scylladb
日期: 2026-06-13
分类: 数据库
子分类: databases-storage
provenance: pipeline-v3
---

# ScyllaDB — C++ 高性能 NoSQL 数据库学习笔记

## 一、ScyllaDB 是什么？（日常类比）

先忘掉数据库这些术语。想象你开了一家连锁外卖店：

- **传统数据库**就像每家店各自管账，客人多了每个厨师手忙脚乱，最后只能靠加钱雇更多人（买更贵的机器）来解决。
- **ScyllaDB** 的做法是：每家店只有一个厨师（CPU 核），但这个厨师极其高效，手不歇脚地干活。然后你开了 64 家店（64 核），每家的厨师互相不认识、互不干扰，各自管自己的一片区域。客人多的时候，直接开新店就好。

这就是 ScyllaDB 的核心设计思想：**共享 nothing（shared-nothing）** — 每个 CPU 核独立工作，不需要互相让位，也不需要复杂的锁机制来协调。

## 二、为什么用 C++ 重写？

ScyllaDB 的前身是 Apache Cassandra（用 Java 写的）。Java 有垃圾回收（GC）—— 想象厨师每隔一段时间就得停下来打扫卫生，扫干净了才能继续炒菜。这会导致请求响应出现"卡顿"。

ScyllaDB 用 C++ 从零重写，最大的好处就是**没有垃圾回收停顿**——厨师不用停工打扫，一直在炒菜。

| 特性 | Apache Cassandra (Java) | ScyllaDB (C++) |
|------|------------------------|-----------------|
| 语言 | Java | C++23 |
| 垃圾回收 | 有 GC 停顿 | 无 GC，手动内存管理 |
| 延迟 | 几十到几百毫秒 | 亚毫秒级（<1ms） |
| 吞吐量 | 万级 ops/s | 百万级 ops/s |
| 线程模型 | 多线程共享 | 单线程 per core（Seastar） |

## 三、核心概念

### 3.1 Seastar 框架

ScyllaDB 运行在 **Seastar** 这个 C++ 异步框架上。可以把 Seastar 想象成一个"超级调度员"：

- 它让每个 CPU 核上跑一个独立的"事件循环"
- 每个事件循环只处理分配给那个核的数据
- 核与核之间通过"发邮件"（消息传递）通信，而不是共享内存

这就像一家餐厅，每个厨师只管自己那几桌客人，不抢对方的锅铲，也不等对方。

### 3.2 Ring 架构（环架构）

ScyllaDB 的多个节点组成一个"环"（Ring），数据按照**分区键（Partition Key）**均匀分布到环上的不同节点。

想象一个圆形桌子，座位按颜色编号。客人来了，系统用一张"哈希表"算出客人应该坐哪个编号的座位，然后直接把数据存到对应编号的节点上。不需要问"谁有空间"。

### 3.3 Raft 一致性

ScyllaDB 用 **Raft 共识算法**管理集群元数据（比如新增节点、扩缩容）。Raft 保证即使某个节点挂了，数据也不会丢失，而且集群能自动选出新的"组长"继续工作。

### 3.4 数据分布：Token 与 Tablet

- **Token**：每个节点在 Ring 上都有一个"领地范围"，数据根据分区键的哈希值落入对应的领地
- **Tablet**（较新版本）：ScyllaDB 引入的概念，把每个节点的领地进一步拆分成更小的"分片"，让数据分布更均匀，扩容更灵活

## 四、数据模型与 CQL

ScyllaDB 兼容 **Apache Cassandra Query Language (CQL)**，和 Cassandra 的查询语法基本一样。

### 关键概念

- **Keyspace**：相当于关系型数据库中的"数据库（database）"
- **Table**：表，由列组成
- **Primary Key**：主键，分区键（Partition Key）+ 聚类列（Clustering Columns）
- **TTL（Time to Live）**：数据自动过期时间
- **一致性级别（Consistency Level）**：读/写操作的确认要求（QUORUM、ONE、ALL 等）

## 五、代码示例

### 示例 1：创建 Keyspace 和表，插入数据

```cql
-- 1. 创建键空间（相当于数据库），复制因子为 3
CREATE KEYSPACE IF NOT EXISTS food_delivery
WITH REPLICATION = {
  'class' : 'SimpleStrategy',
  'replication_factor' : 3
};

-- 2. 切换到这个键空间
USE food_delivery;

-- 3. 创建订单表
-- 分区键：city（城市），聚类列：order_time（下单时间）
CREATE TABLE IF NOT EXISTS orders (
  order_id UUID PRIMARY KEY,
  city text,
  customer_name text,
  order_time timestamp,
  total_amount decimal,
  status text
);

-- 4. 插入一条订单数据
INSERT INTO orders
  (order_id, city, customer_name, order_time, total_amount, status)
VALUES
  (uuid(), '上海', '张三', toTimestamp(now()), 88.50, '已完成');

-- 5. 再插入几条
INSERT INTO orders
  (order_id, city, customer_name, order_time, total_amount, status)
VALUES
  (uuid(), '上海', '李四', toTimestamp(now()), 126.00, '配送中');

INSERT INTO orders
  (order_id, city, customer_name, order_time, total_amount, status)
VALUES
  (uuid(), '北京', '王五', toTimestamp(now()), 52.00, '已完成');
```

**类比理解**：`CREATE KEYSPACE` 就像开了一家连锁品牌；`CREATE TABLE` 就像设计了一张订单录入单；`INSERT` 就是往单子上填写信息。

### 示例 2：查询、过滤、带 TTL 的数据写入

```cql
-- 6. 查询上海的所有订单（按 order_time 排序）
SELECT order_id, customer_name, order_time, total_amount, status
FROM orders
WHERE city = '上海'
ORDER BY order_time DESC;

-- 7. 按一致性级别查询（QUORUM = 多数节点确认）
-- 读取时确保至少有 (3/2)+1 = 2 个节点返回数据
SELECT * FROM orders
WHERE city = '北京'
  AND customer_name = '王五'
CONSISTENCY QUORUM;

-- 8. 插入带 TTL（过期时间）的数据
-- 3600 秒（1 小时）后这条记录自动删除
INSERT INTO orders
  (order_id, city, customer_name, order_time, total_amount, status)
VALUES
  (uuid(), '上海', '赵六', toTimestamp(now()), 68.00, '待处理')
USING TTL 3600;

-- 9. 更新已有记录
UPDATE orders
SET status = '已完成'
WHERE city = '上海'
  AND customer_name = '李四'
  AND order_time = '2026-06-13 15:30:00';

-- 10. 删除记录
DELETE FROM orders
WHERE city = '上海'
  AND customer_name = '赵六'
  AND order_time = '2026-06-13 15:35:00';

-- 11. 批量删除过期数据（使用 TTL 配合）
-- ScyllaDB 的 compaction 机制会自动清理过期的 SSTable 文件
```

**类比理解**：`WHERE city = '上海'` 就像在订单堆里抽出来"所有上海的"；`USING TTL` 就像给外卖小票写了个"1小时后自动销毁"；`UPDATE` 就是给小票上画个叉改个状态。

### 示例 3：二级索引与高性能查询优化

```cql
-- 12. 在 customer_name 列上建二级索引
CREATE INDEX ON orders (customer_name);

-- 13. 利用索引查询
SELECT * FROM orders WHERE customer_name = '张三';

-- 14. 注意：在分布式数据库中，WHERE 条件里的列如果不是
--    分区键或聚类列，查询效率会很差。
--    所以最好的做法是：建一张新表，按查询方式重新设计。

-- 15. 为"按顾客查订单"建一张专门的表（查询模式驱动设计）
CREATE TABLE orders_by_customer (
  customer_name text,
  order_id UUID,
  city text,
  order_time timestamp,
  total_amount decimal,
  status text,
  PRIMARY KEY (customer_name, order_time)
);

-- 16. 现在查询非常快，因为 customer_name 就是分区键
INSERT INTO orders_by_customer
  (customer_name, order_id, city, order_time, total_amount, status)
VALUES
  ('张三', uuid(), '上海', toTimestamp(now()), 88.50, '已完成');

SELECT * FROM orders_by_customer
WHERE customer_name = '张三'
ORDER BY order_time DESC;
```

**类比理解**：二级索引就像给订单加了个"姓名目录"，但每次都翻目录很慢。更好的做法是准备一摞按姓名分好的文件夹（新表），直接抽出来看。这就是 NoSQL 的核心思维——**先想好你要怎么查，再决定怎么存**。

## 六、ScyllaDB 的独特优势

### 6.1 Alternator（DynamoDB 兼容）

ScyllaDB 除了兼容 Cassandra（CQL），还内置了对标 Amazon DynamoDB 的 API（叫 **Alternator**）。这意味着同一个 ScyllaDB 集群，既可以给用 CQL 的应用用，也可以给用 DynamoDB SDK 的应用用，两者互不冲突。

### 6.2 CDC（变更数据捕获）

ScyllaDB 支持 CDC 功能，记录每张表的数据变更。就像给订单系统装了一个"监控摄像头"，每次下单、修改、删除都会被记录下来。下游系统可以实时消费这些变更记录，做数据分析或消息推送。

### 6.3 向量搜索

从 2024.x 版本开始，ScyllaDB 内置了向量搜索能力。可以在数据库里直接存储和搜索向量（vector），用于 AI/ML 场景。不需要再额外部署一个专门的向量数据库。

## 七、架构总结图

```
                    应用层（CQL / Alternator API）
                          |
    ┌─────────────────────┼─────────────────────┐
    │         一致性层（Quorum / Raft）          │
    └─────────────────────┼─────────────────────┘
                          |
    ┌─────────────────────┼─────────────────────┐
    │     节点 1 (CPU 0)     │     节点 2 (CPU 0)    │     节点 3 (CPU 0)
    │   ┌───────────────┐   │   ┌───────────────┐   │
    │   │  Shard 0      │   │   │  Shard 0      │   │   │
    │   │  Shard 1      │   │   │  Shard 0      │   │   │  Ring 环上
    │   │  Shard 2      │   │   │  Shard 1      │   │   │  数据分片
    │   │  ...          │   │   │  ...          │   │   │
    │   │  Shard N      │   │   │  Shard N      │   │   │
    │   └───────────────┘   │   └───────────────┘   │   │
    └─────────────────────┬─┼─────────────────────┬─┼─────────────────────┘
                          │                         │
                    持久化层（SSTable + Commit Log + WBL）
```

每个节点上有多个 **Shard（分片）**，每个分片跑在独立 CPU 核上。数据按分区键分布在 Ring 的不同节点和不同 Shard 之间。

## 八、小结

| 维度 | ScyllaDB |
|------|----------|
| 定位 | 高性能分布式 NoSQL 数据库 |
| 语言 | C++23 + Seastar 异步框架 |
| API 兼容 | Cassandra (CQL) + DynamoDB (Alternator) |
| 性能特点 | 亚毫秒延迟、百万级吞吐、无 GC 停顿 |
| 数据分布 | Ring 架构 + Token / Tablet |
| 一致性 | Raft 元数据管理 + CQL 一致性级别 |
| 适用场景 | 海量写入 + 低延迟读、物联网、交易记录、实时分析 |

学 ScyllaDB 最大的思维转变是从"关系型数据库怎么设计表"切换到"我的查询模式是什么，数据应该怎么存来最快查出来"。NoSQL 的设计哲学是：**查询驱动存储（Query-Driven Storage）**——先想清楚怎么查，再决定怎么存。

## 参考资料

- GitHub: https://github.com/scylladb/scylladb
- 官方文档: https://docs.scylladb.com/
- ScyllaDB University: https://university.scylladb.com/
- Seastar 框架: http://docs.seastar.io/
