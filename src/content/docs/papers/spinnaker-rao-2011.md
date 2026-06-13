---
title: Spinnaker - 用 Paxos 构建可扩展、一致、高可用的分布式 KV 存储
来源: https://www.vldb.org/pvldb/vol4/p243-rao.pdf
日期: 2026-06-13
分类: 分布式系统
子分类: 共识与复制
provenance: pipeline-v3
---

# Spinnaker：用 Paxos 构建可扩展、一致、高可用的分布式 KV 存储

## 一句话总结

Spinnaker 是 LinkedIn 开源的一个分布式 KV 存储系统，核心贡献是证明：在数据中心内部用 Paxos 做数据复制，既不强求完美、也不退而求其次用"最终一致性"骗自己，而是真正做到了**强一致性 + 高可用 + 可扩展**三者兼顾。

---

## 日常类比：三个仓库的"账本"问题

想象你经营一个连锁超市，有三个仓库分别放同一批货物（比如 100 箱可乐）。

**传统做法（主从复制）：**

只有一个"主仓库"负责记账。主仓库记账后，异步地把账本副本传给另外两个"从仓库"。

问题来了：如果主仓库突然断电，从仓库的账本还没更新到最新一条。这时候你想查"还有多少可乐"，从仓库说的数字可能是错的。更糟的是，如果从仓库又坏了，**整个系统就没法写入了**。一个节点挂了，系统就瘫痪。

**Paxos 的做法：**

三个仓库的账本是**同步**的。每次记账（写入），必须至少有 2 个仓库同时确认收到，这账才算写成功。

- 如果 1 个仓库挂了，剩下 2 个还能继续读写
- 如果 2 个仓库同时挂了，剩下 1 个虽然不能写（达不到半数），但至少不会写错数据
- 关键是：**永远不会出现一个仓库说"我写成功了"，另一个仓库却找不到这条记录的情况**

这就是 Paxos 说的"共识"：只要多数派活着，大家就永远对"数据是什么"保持一致。

---

## 核心概念

### 1. 范围分区（Range Partitioning）

Spinnaker 不是用哈希把数据打散，而是用**范围的键值**来分区。

比如 key 是 0~999 的数字：

```
[0, 199]    → 由节点 A, B, C 共同复制
[200, 399]  → 由节点 B, C, D 共同复制
[400, 599]  → 由节点 C, D, E 共同复制
[600, 799]  → 由节点 D, E, A 共同复制
[800, 899]  → 由节点 E, A, B 共同复制
```

每个范围对应 3 个节点，这 3 个节点叫一个 **cohort（小队）**。关键好处是：**相邻的范围共享节点**，范围迁移时开销很小。

### 2. 三副本 + Paxos 复制

每个 cohort 用 3 个节点做复制，Paxos 保证只要 2 个节点还活着，整个分区就仍然可用。

```
客户端写 W → 发给 leader → leader 强制写入 WAL → 
leader 向 follower 发送 propose → 
follower 强制写入 WAL → 发送 ack → 
leader 收到 1 个 ack 后，将 W 加入 commit queue →
leader 告诉客户端"写成功"
```

整个流程需要 **3 次 WAL 强制写入 + 4 条消息**。但大部分操作是重叠的，关键路径延迟只有 **1 次 WAL + 2 次消息延迟**。

### 3. 两种一致性级别

Spinnaker 提供两种读模式，像开关一样切换：

- **强一致性读（Strong Reads）**：必须从 leader 读，保证读到的是最新值
- **时间线一致性读（Timeline Reads）**：可以从 follower 读，但保证读到的是"在某个时间点之前已提交"的值，不会出现"先看到后来的值、又看到更早的值"这种违反时间线的情况

### 4. Zookeeper 做协调（不出现在关键路径）

Zookeeper 负责：

- 节点故障检测
- leader 选举
- 元数据管理

**关键设计决策**：Zookeeper 不出现在读写关键路径上。正常读写时，Spinnaker 节点和 Zookeeper 之间只有心跳消息。这意味着单个 Zookeeper 集群就能支撑数千个 Spinnaker 节点。

### 5. 条件写入（Conditional Put）

类似 `compare-and-swap`：

```python
# 只有当 key "user:1001:name" 的当前版本等于 5 时，才写入新版本 6
conditional_put(key="user:1001:name", value="Alice", version=5, new_version=6)
```

cohort 的 leader 在执行前先检查当前版本是否匹配。匹配则写入，不匹配则返回错误。因为 cohort 内所有节点按 LSN 顺序执行写入，所以**条件判断在三个节点上结果一定一致**。

### 6. Memtable + SSTable（借鉴 Bigtable）

写完 WAL 后，数据放入内存中的 **memtable**，定期排序后刷到磁盘上的 **SSTable**（有序字符串表）。小 SSTable 会合并成大 SSTable，同时清理已删除的数据。

---

## 为什么 Paxos 以前没人用在数据库复制上？

两个原因：

1. **被认为太复杂**——手写 Paxos 很容易出错（Chubby、Zookeeper 内部都是 Paxos，但都是 Google 内部团队写的）
2. **被认为太慢**——Paxos 需要多轮消息交互，延迟高于异步主从复制

Spinnaker 用两个技巧化解了这两点：

- 用 **Zookeeper 处理 leader 选举和群组管理**，Replication Protocol 本身简化了很多
- 在**数据中心内部**（网络分区几乎不存在），Paxos 的延迟完全可以接受

实验结果也证明了这一点：Spinnaker 的读延迟比 Cassandra（最终一致性系统）快，写延迟只慢 5%~10%。

---

## 代码示例

### 示例 1：Spinnaker 的读写 API

```python
# 写入 - 强一致性
# Spinnaker 提供的 API 非常简单：
# put(key, value, columns={...}) → 成功或异常
put(key="user:1001", columns={
    "name": "Alice",
    "age": 30,
    "email": "alice@example.com"
})
# 调用返回时，至少 2/3 的副本已持久化到磁盘

# 读取 - 可选择的两种模式
# 强一致性读（从 leader 读取，保证最新版本）
user = get(key="user:1001", consistency=STRONG)

# 时间线一致性读（从 follower 读取，性能更好，仍然保证不"穿越"）
user = get(key="user:1001", consistency=TIMELINE)

# 条件写入 - compare-and-swap
put_conditional(key="user:1001", columns={"age": 31},
                condition=ColumnVersion("age", expected_version=5))
# 返回 True 表示写入成功，False 表示版本不匹配
```

### 示例 2：Paxos 复制协议的伪代码

```python
class CohortLeader:
    """cohort 的 leader 节点，负责协调复制"""

    def handle_write(self, key, value):
        # 1. 分配 LSN（日志序列号）
        lsn = self.next_lsn
        self.next_lsn += 1

        # 2. 强制写入本地 WAL（Write-Ahead Log）
        self.write_awal_log(lsn, (key, value))
        self.force_log_to_disk()

        # 3. 将写操作加入 commit queue（等待 follower 确认）
        self.commit_queue.add(lsn, (key, value))

        # 4. 向所有 follower 发送 propose 消息
        for follower in self.followers:
            follower.send_propose(lsn, key, value)

    def on_follower_ack(self, lsn, follower_id):
        # 5. 收到至少 1 个 follower 的 ack
        if self.commit_queue.has_quorum(lsn):
            # 6. 提交：从 memtable 中可见
            self.commit_queue.commit(lsn)
            # 7. 通知客户端写入成功
            self.client_callback.success()

    def on_follower_propose(self, lsn, key, value):
        # follower 端：收到 leader 的 propose
        self.write_awal_log(lsn, (key, value))
        self.force_log_to_disk()
        self.send_ack_to_leader(lsn)


class CohortFollower:
    """cohort 的 follower 节点"""

    def send_ack_to_leader(self, lsn):
        self.leader.send_ack(lsn, self.node_id)

    def catch_up(self, leader, my_last_committed_lsn):
        """故障恢复后追赶 leader"""
        # 告诉 leader 自己最慢提交到哪条日志
        committed_writes = leader.send_after_lsn(my_last_committed_lsn)
        for lsn, key, value in committed_writes:
            self.write_awal_log(lsn, (key, value))
```

---

## 故障恢复

### Follower 恢复（两步走）

1. **本地恢复（Local Recovery）**：从最近的 checkpoint 重放 WAL 到 `f.cmt`（最后提交的 LSN），安全恢复 memtable
2. **追赶（Catch Up）**：告诉 leader 自己的 `f.cmt`，leader 把之后的已提交写操作全部发给 follower

如果 WAL 已经被 roll 掉了（写入 SSTable 后），leader 会从 SSTable 中查找对应 LSN 范围的数据发给 follower。

### Leader 故障转移

当 leader 挂掉时，通过 Zookeeper 的 ephemeral znode 机制触发 leader 选举：

1. 各节点在 Zookeeper 上创建带序号的 ephemeral znode，携带自己的 `last_lsn`
2. Zookeeper 通知所有节点 `/candidates` 变化
3. 当 2/3 节点出现在 candidates 下时，每个节点检查：
   - 自己的 `last_lsn` 是否是最大的
   - 如果是，自认为 leader，并等待确认
4. 新的 leader 检查是否有未提交的写操作，如果有则重新提议并复制，确保不丢失

---

## 性能对比（vs Cassandra）

| 操作 | Spinnaker | Cassandra (Quorum) | 差距 |
|------|-----------|-------------------|------|
| 强一致性读 | 快于 Cassandra | Quorum 读 | Spinnaker 更快 |
| 时间线读 | 接近 Cassandra Weak Read | Weak Read（只读 1 个副本） | 几乎相同 |
| 写 | 5%~10% 慢 | Quorum 写 | 仅 5%~10% 差距 |

**核心结论**：强一致性的额外开销很小，在数据中心内几乎可以忽略。

写延迟偏高的主要原因是 Spinnaker 复用了 Cassandra 的日志管理器（日志管理较原始，磁盘 seek 多）。如果日志放在 SSD 上，写入延迟可降到 6ms 以下。

---

## 局限性

1. **写入集中在 leader**：所有写操作必须路由到 cohort leader，可能成为热点
2. **多操作事务未实现**：当前每个 API 调用是单操作事务。多操作事务需要扩展复制协议
3. **跨数据中心不支持**：设计目标是单数据中心，跨数据中心延迟太高
4. **leader 宕机时的短暂不可用**：虽然 leader 选举很快，但在选举期间该分区不可写

---

## 学习收获

1. **Paxos 不是"理论玩具"**——Spinnaker 用实验数据证明，在数据中心内用 Paxos 做数据库复制，性能差距可以控制在 5%~10% 以内
2. **Zookeeper 是 Paxos 的"脚手架"**——手写 Paxos 容易出错，但用 Zookeeper 处理 leader 选举和群组管理后，Replication Protocol 本身大大简化
3. **一致性不是非黑即白**——Spinnaker 同时提供强一致性和时间线一致性，让应用按需选择，这是一个很实用的设计思路
4. **工程取舍的重要性**——Spinnaker 从 Cassandra 代码派生而来，共享数据模型和 3 副本机制，这让实验对比更公平

---

*本文是论文的零基础学习笔记，不是论文摘要。目标是让完全没有分布式系统基础的人也能理解 Spinnaker 的核心思想。*
