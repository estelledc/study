---
title: Cassandra: Eventually Consistent Tradeoffs
来源: https://www.cs.cornell.edu/projects/ladis2009/papers/lakshman-ladis2009.pdf
日期: 2026-06-13
分类: 分布式系统
子分类: 共识与复制
provenance: pipeline-v3
---

# Cassandra: Eventually Consistent Tradeoffs

## 一个日常类比：三家连锁书店的库存系统

想象你住了一个城市，有三家连锁店卖同一本书。

**强一致性模型**（像传统关系数据库）：
你打电话给书店A问"有货吗"。书店A必须先确认书店B和C的库存都一致了，才告诉你答案。如果B店的电话线断了，A就说不清楚，你的电话就白打了。

**Cassandra的模型**：
你打电话给A，A说"有"（哪怕它自己还没来得及从B同步最新的库存信息）。电话立刻挂断，你很满意。后来B的库存变了，慢慢同步到A。你偶尔会看到一个"过期"的答案，但电话几乎从不打不通。

这个取舍的核心问题是：**你要的是"每次都准确"，还是"几乎随时能打通电话"？**

---

## 背景：为什么需要 Cassandra

Facebook 在 2007 年左右遇到了一个经典的大规模存储问题：

- 他们有一个 Inbox Search 功能，需要搜数十亿条邮件
- 每天写入量达到**数百亿次**
- 用户分布在全球多个数据中心
- 服务器随时在坏，几百个组件同时故障是常态

传统的关系数据库（MySQL 等）在这种情况下要么扛不住写入量，要么需要复杂的分库分表。Cassandra 的目标很明确：**用廉价机器，扛住海量写入，同时不牺牲可用性。**

它的设计深受 Amazon Dynamo 论文的启发，但做了重要改进。

---

## 核心概念一：CAP 定理下的选择

在分布式系统中，有三个你不能同时得到的东西：

- **C (Consistency)**：所有客户端看到的数据永远一致
- **A (Availability)**：每个请求都能得到响应
- **P (Partition tolerance)**：网络分区时系统继续工作

CAP 定理说：三选一，不可能兼得。但更准确的理解是——网络分区在分布式系统中**必然会发生**，所以 P 你必须选。你真正需要决定的是：当分区发生时，选 C 还是选 A。

**Cassandra 选择 A**：在网络分区时，它保证所有节点都能响应读和写，即使这些数据可能不一致。

---

## 核心概念二：一致性级别（Consistency Levels）

Cassandra 最精妙的设计在于：**它允许你在每次请求中自己决定要多少一致性**。这比"要么全部强一致，要么全部最终一致"要灵活得多。

关键参数是 **N（副本数）** 和 **R（读取/写入需要的应答数）**：

- `ONE`：只从一个节点应答就算完成
- `QUORUM`：超过一半的节点应答才算完成
- `ALL`：所有节点都应答

**为什么 QUORUM 很重要？**

如果 N=3，R=QUORUM（即2）：

```
写入流程（W=QUORUM, R=QUORUM）：

  Client
    │
    ▼
  Node A（协调者）
    ├── 写入副本1 ──→ Node B  （等待确认）
    ├── 写入副本2 ──→ Node C  （等待确认）
    └── 写入副本3 ──→ Node D  （不等待）

  B 和 C 应答 → A 告诉 Client "写完了"
  即使 D 还没收到！
```

当 R + W > N 时，你就保证了**至少有一个副本是最新的**。这就是用数学方法保证"大多数情况下读到一致数据"，而不需要全局强一致。

---

## 核心概念三：Gossip 协议 + Vector Clocks

Cassandra 节点之间如何知道"谁还活着"？

**Gossip 协议**：每个节点定期随机选几个其他节点，互相交换"我还活着"的消息。如果某个节点连续几次没被选到也没响应，其他节点就知道它可能挂了。

这比"所有人定期检查所有人"（ping 所有节点）效率高得多——在 1000 个节点的集群里，每个节点只需要跟几个邻居聊天。

**Vector Clocks** 用来追踪数据的版本：

```python
# 伪代码：每个数据项带着版本向量
version = {
    "node_A": 5,   # node_A 最后写入时版本号是 5
    "node_B": 3,   # node_B 最后写入时版本号是 3
    "node_C": 7    # node_C 最后写入时版本号是 7
}

# 当 Node B 收到 Node A 的版本为 5 的更新时：
# 它比较自己本地的 node_A 版本（3）和新来的（5）
# 发现 5 > 3，说明有新数据需要同步
# 它更新为 {"node_A": 5, "node_B": 3, "node_C": 7}

# 如果两个节点各自独立写入了同一个 key：
# 版本A = {"node_A": 6, "node_B": 3, "node_C": 7}
# 版本B = {"node_A": 5, "node_B": 4, "node_C": 7}
# 这两个版本无法比较"谁更大"——这就是冲突
```

Cassandra 对冲突的处理方式很简单：**保留最新的写入（last-write-wins）**，通过客户端设置的 timestamp 来决定。你也可以配置自定义的冲突解决策略。

---

## 核心概念四：分区（Partitioning）与复制（Replication）

Cassandra 用**一致性哈希环（Consistent Hashing Ring）**来管理数据分布：

```
      ┌─────────────────────────────┐
     /                               \
   B                                   A
  /                                       \
 |           数据分片区域                     |
 |   Node B负责这段环 → Node A负责这段环       |
 |           Node C负责这段环                 |
  \                                       /
   C                                   D
    \                                 /
      └─────────────────────────────┘

当 Node C 加入时：它接管 C 和 D 之间的区域
当 Node C 离开时：它的区域自动分配给 D
只有相邻节点受影响 → 数据迁移量最小
```

复制因子（Replication Factor）决定每条数据存几份。Facebook 的 Cassandra 集群复制因子通常是 3，数据存在三个数据中心。

---

## 代码示例：Cassandra 的使用

### 示例一：基本的写入与读取

```python
# 使用 Python 的 cassandra-driver
from cassandra.cluster import Cluster

# 连接集群
cluster = Cluster(['node1.example.com', 'node2.example.com'])
session = cluster.connect('mykeyspace')

# 创建表（Cassandra 的数据模型是"行键 + 列族"）
session.execute("""
    CREATE TABLE IF NOT EXISTS user_messages (
        user_id TEXT,
        message_id TIMEUUID,
        content TEXT,
        PRIMARY KEY (user_id, message_id)
    ) WITH CLUSTERING ORDER BY (message_id DESC);
""")

# 写入消息 — 一致性级别设为 ONE
session.execute(
    "INSERT INTO user_messages (user_id, message_id, content) "
    "VALUES (?, ?, ?)",
    ['user_123', 'now', 'Hello, world!'],
    consistency_level='ONE'
)

# 读取消息 — 一致性级别设为 QUORUM
session.execute(
    "SELECT * FROM user_messages WHERE user_id = ?",
    ['user_123'],
    consistency_level='QUORUM'
)
```

### 示例二：超列族（Super Column Family）用于 Inbox Search

这是论文中 Facebook 实际使用的模式。超列族就像"列中的列"：

```python
# Schema: 每个用户一个 key，关键词作为超列，消息 ID 作为子列
session.execute("""
    CREATE TABLE IF NOT EXISTS user_word_index (
        user_id TEXT,
        word TEXT,       -- 超列名（如 "hello"）
        message_id UUID, -- 子列
        PRIMARY KEY (user_id, word, message_id)
    ) WITH CLUSTERING ORDER BY (message_id DESC);
""")

# 用户搜索 "hello"
# 只需查 user_id = 'user_123' AND word = 'hello'
# 就能拿到所有包含 "hello" 的消息 ID
results = session.execute("""
    SELECT message_id FROM user_word_index
    WHERE user_id = ? AND word = ?
    ORDER BY message_id DESC
    LIMIT 20;
""", ['user_123', 'hello'])

# 另一个索引：按联系人搜索
session.execute("""
    CREATE TABLE IF NOT EXISTS user_contact_index (
        user_id TEXT,
        contact_id TEXT,
        message_id UUID,
        PRIMARY KEY (user_id, contact_id, message_id)
    ) WITH CLUSTERING ORDER BY (message_id DESC);
""")
```

### 示例三：处理冲突的读取

```python
# 读取时指定一致性级别
# 如果 R=ONE，读最快的节点（可能不是最新的）
# 如果 R=ALL，等所有节点（保证最新，但慢）

# 写入时也可以设置不同的策略
session.execute(
    "INSERT INTO user_messages (user_id, message_id, content) "
    "VALUES (?, ?, ?)",
    ['user_456', 'now', 'Conflicting write!'],
    consistency_level='QUORUM'  # 需要多数节点确认
)

# 读-改-写模式：先读，再改，再写回
# 注意：这在 Cassandra 中不是原子的！
# 如果需要原子性，必须用同一个 key
existing = session.execute(
    "SELECT content FROM user_messages "
    "WHERE user_id = ? AND message_id = ?",
    ['user_456', 'msg_1'],
    consistency_level='QUORUM'
)[0]

new_content = existing.content + " [updated]"

session.execute(
    "UPDATE user_messages SET content = ? "
    "WHERE user_id = ? AND message_id = ?",
    [new_content, 'user_456', 'msg_1'],
    consistency_level='QUORUM'
)
```

---

## Cassandra 的关键权衡总结

| 权衡 | 选择 | 代价 |
|------|------|------|
| 一致性 vs 可用性 | 偏向可用性（AP） | 可能读到旧数据 |
| 强一致 vs 最终一致 | 最终一致 + 可调级别 | 应用需要理解"过期数据" |
| 简单 vs 功能丰富 | 简单 API | 没有 JOIN、没有跨行事务 |
| 写入性能 vs 读取性能 | 写入极快（写 WAL） | 读可能需要合并多个文件（compaction） |

---

## 论文的实际成果

Facebook 的 Inbox Search 在 Cassandra 上运行的数据：

- 数据量：**50+ TB**
- 集群规模：**150 节点**
- 跨两个数据中心（东岸和西岸）
- 读取延迟中位数：**15.69ms**（搜索）/ **18.27ms**（按联系人搜索）
- 支持 **2.5 亿用户**的搜索需求

这些数字说明：**最终一致不是"差的一致性"，而是一种工程上极其高效的一致性。**

---

## 延伸阅读

- **Dynamo**（Amazon, 2007）：Cassandra 的设计先驱，论文中多次引用
- **CAP 定理**（Brewer, 2000）：Eric Brewer 在 PODC 2000 年提出的猜想
- **PACELC 定理**（Abadi, 2010）：CAP 的扩展——即使没有分区，也要在延迟和一致性之间做权衡
- **Spanner**（Google, 2012）：选择 C 而非 A 的反面典型案例

---

## 一句话总结

> Cassandra 的设计哲学是：**用最终一致性换取无限可扩展性，用可调的一致性级别换取灵活性。** 它不追求"永远正确"，但保证"几乎永远可用"——而在线上服务中，"几乎永远可用"往往比"永远正确但偶尔不可用"更有价值。
