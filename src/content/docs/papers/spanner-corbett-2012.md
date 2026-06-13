---
title: Spanner — Google 的全球分布式数据库
来源: https://research.google/pubs/pub39966/
日期: 2026-06-13
分类: 分布式系统
子分类: 共识与复制
provenance: pipeline-v3
---

## 是什么

Spanner 是 Google 在 2012 年公开的一个**全球范围分布的关系型数据库**。它的数据放在全世界几十个数据中心的几千台机器上，但对应用程序来说，它就像一台单机数据库——能跑标准 SQL、能跨多行跨多表做事务。

日常类比：想象你、朋友 A、朋友 B 分别在北京、纽约、伦敦三个人一起记账。三个人各自有一本账，每笔记录都要三人同时同意才算数。更难的是，三人的钟表对不准，北京说 10:00:00 的时候纽约可能还是 9:59:59。Spanner 解决的问题就是：**不管三台机器的钟差多少毫秒，它们写出的账本在全局来看总是有一个一致的先后顺序**。

## 核心概念

### 1. 架构层次：Universe → Zone → Tablet → Paxos Group

```
Universe（整个 Spanner 部署，全球只跑少数几个）
  └── Zone（一个数据中心或机房区域）
        └── ZoneMaster（分配数据到哪些 Spanner 服务器）
        └── SpannerServers（实际读写数据的机器）
              └── Tablet × N（每台 Spanner 跑 100-1000 个 tablet）
                    └── Paxos Group（一个 tablet 的副本集）
                          └── Leader + Follower 副本
```

- **Tablet** 是一个 key-value 映射：`(key: string, timestamp: int64) → string`，内部用 B-tree 存储。
- **Paxos Group** 是一组 tablet 副本，跨机房部署，用 Paxos 协议选出一个 leader 负责写。
- 一个 tablet 被划分到若干个 Paxos Group 的副本里，数据通过目录（Directory）管理迁移。

### 2. 复制与容错：Paxos 长任期 Leader

每个 Paxos Group 的 leader 通过"租约"（lease）持有 10 秒的写入权。租约到期前自动续期，只有租约完全过期后其他副本才能竞选新 leader。这避免了"两个 leader 同时写"的冲突，也减少了频繁的 leader 切换开销。

读操作可以在任何"足够更新"的副本上执行，不需要等 leader。写操作必须经过 Paxos leader 走日志复制。

### 3. 事务模型：三种操作

| 类型 | 说明 | 并发控制 |
|------|------|----------|
| **读写事务** | 先读后写，两阶段提交 | 悲观锁（wound-wait） |
| **只读快照事务** | 只读不写，不需要锁 | 无锁，在选定 timestamp 读 |
| **快照读** | 读过去某一时刻的数据 | 无锁 |

读写事务走**两阶段提交（2PC）**：客户端先把写操作缓存在本地，收集完所有数据后向 coordinator 提交，coordinator 再通知所有参与方提交。如果事务只涉及单个 Paxos Group，可以跳过 2PC 直接提交。

### 4. 核心创新：TrueTime

这是 Spanner 最核心的贡献。它没有让应用程序问"现在几点"，而是问"现在的时间一定落在哪个区间"：

```
TrueTime 返回一个区间：[earliest, latest]
- 宽度 2ε 就是时钟不确定性（epsilon）
- 生产环境中 ε 通常约 4ms（即区间宽度约 8ms）
- ε 由 GPS 接收器和原子钟保证
```

TrueTime 的 API 很简单：

```
TT.now()        → TTinterval { earliest, latest }  // 当前时间区间
TT.after(t)     → bool                               // 时间 t 是否肯定已过
TT.before(t)    → bool                               // 时间 t 是否肯定未到
```

### 5. 外部一致性（External Consistency / Linearizability）

Spanner 保证：如果事务 T1 在真实时间中**提交完毕之后**，事务 T2 **才开始**，那么 T1 的时间戳一定小于 T2 的时间戳。

这个保证靠两个规则实现：

- **Start 规则**：coordinator 给事务选时间戳 s = TT.now().latest（在收到提交请求之后计算）。
- **Commit Wait 规则**：coordinator 等 `TT.after(s)` 为真，才告诉客户端提交成功。

这意味着写事务的提交延迟至少要多花 ε 的时间来"等时钟"。

## 代码示例

### 示例 1：用 Spanner 的数据模型定义表

Spanner 的数据模型介于关系型和 KV 之间。每张表必须有主键，主键决定数据怎么分片：

```sql
-- 每行必须有一个全局唯一的用户 ID（主键前缀）
-- 这个前缀同时决定了数据放在哪个 Paxos Group 里
CREATE TABLE Users (
    uid       INT64 NOT NULL,
    email     STRING(256),
    name      STRING(256)
) PRIMARY KEY (uid), DIRECTORY;

-- Albums 是 Users 的子表（INTERLEAVE）
-- 同一个用户的 album 行在物理上靠近存储，减少跨 group 查询
CREATE TABLE Albums (
    uid       INT64 NOT NULL,
    aid       INT64 NOT NULL,
    name      STRING(256)
) PRIMARY KEY (uid, aid),
  INTERLEAVE IN PARENT Users ON DELETE CASCADE;
```

解释：

- `PRIMARY KEY` 定义了行的名称和排序。uid 是目录表的第一列，**每个 uid 对应一个目录**。
- `INTERLEAVE IN PARENT Users` 表示 Albums 是 Users 的子表。同一个 uid 的 albums 行在物理上放在一起，查询 `SELECT * FROM Albums WHERE uid = 42` 只需要访问一个 Paxos Group，**不需要跨 group 协调**。
- `DIRECTORY` 关键字声明 Users 表是目录表，每行 uid 对应一个目录。

### 示例 2：读写事务的时间戳分配

这是 Spanner 的核心协议，用伪代码展示时间戳怎么选、怎么保证全局顺序：

```python
# 写事务提交时，coordinator leader 做的事：

# Step 1: 向所有参与 Paxos Group 的请求写锁
locks = acquire_write_locks(all_key_ranges)

# Step 2: 每个参与 leader 选一个 prepare timestamp，保证单调递增
prepare_timestamps = []
for participant_group in participant_groups:
    prepare_ts = participant_group.next_monotonic_timestamp()
    # 把 prepare 记录写入 Paxos 日志
    participant_group.paxos_log(("PREPARE", txn_id, prepare_ts))
    prepare_timestamps.append(prepare_ts)

# Step 3: coordinator 选最终时间戳
# 必须 >= 所有 prepare timestamp
# 必须 > TT.now().latest（外部一致性要求）
# 必须 > 本 leader 之前分配的最大 timestamp（单调递增）
now_interval = TT.now()  # e.g. [100, 108]
commit_ts = max(
    max(prepare_timestamps),
    now_interval.latest,
    leader.last_commit_ts + 1
)

# Step 4: 写入 Paxos 提交日志
coordinator_group.paxos_log(("COMMIT", txn_id, commit_ts))

# Step 5: Commit Wait —— 等真实时间超过 commit_ts
# 这是外部一致性的关键：确保没人能在 commit_ts 之前"看到"这个提交
while not TT.after(commit_ts):
    pass  # 等待约 2*ε ≈ 8ms

# Step 6: 通知客户端和所有参与者提交成功
release_write_locks(locks)
notify_clients(txn_id, commit_ts)
```

逐行解释：

- `TT.now()` 返回 `[earliest, latest]`，比如 `[100, 108]`。`latest = 108` 表示"当前时间**至少**是 108"。
- `TT.after(commit_ts)` 返回 true 意味着"真实时间已经**肯定**过了 commit_ts"。
- Commit Wait 的等待时间约等于 `2 * ε`（约 8ms），这是因为 `latest` 可能比真实时间晚 ε，而 `after(t)` 要求 `earliest > t`。

### 示例 3：只读快照事务（无锁）

```python
# 读事务的第一步：选一个足够早的 timestamp
# 让所有参与 group 的 replica 都能"回退"到这个时间点读数据
if single_paxos_group:
    # 单 group 场景：挑最后一个已提交写的时间戳即可
    s_read = last_committed_write_timestamp()
else:
    # 多 group 场景：不能做协调，直接用 TT.now().latest
    s_read = TT.now().latest

# 第二步：在每个足够更新的副本上读数据
results = []
for group in involved_groups:
    # safe_time 是该副本已应用到多深的 timestamp
    if s_read <= group.safe_time:
        results.append(group.read_at(s_read))
    # 如果 safe_time 落后，需要等待或选更早的 timestamp

# 所有数据都在 s_read 这个全局一致的时间点上读到
# 整个过程完全不持有锁
```

关键设计：

- `safe_time` 是 Spanner 每个副本本地维护的：表示"这个副本已经应用到了 `safe_time` 之前的所有写操作"。
- 读请求只要选的时间戳 `s_read <= safe_time`，就能直接在本地读取，**不需要协调**。
- 多 group 的只读事务能拿到全局一致视图，因为每个 group 返回的都是同一个时间戳下的快照。

### 示例 4：原子 Schema 变更（利用未来时间戳）

```python
# 给一张新表加列，全库几百万个 Paxos Group 都要知道这个变更
# 如果用传统事务，需要锁住几百万个 group —— 不可能
# Spanner 的做法：把变更安排在未来的某个时间戳生效

# 步骤 1: 注册 schema 变更，定一个未来的生效时间戳 t_future
t_future = TT.now().latest + 60 * 1_000_000  # 60 秒后

# 步骤 2: 在 Paxos Group 的元数据中注册这个变更
register_schema_change(table, "ADD COLUMN phone STRING(20)", t_future)

# 步骤 3: 事务在 t_future 之前可以继续正常读写（用旧 schema）
# 事务在 t_future 之后自动用新 schema
# 不需要任何全局锁
```

解释：

- 传统数据库做 schema 变更通常需要锁表或阻塞读写。
- Spanner 利用 TrueTime 把变更"安排"在一个未来的时间戳生效。所有并发事务的时间戳要么在之前（继续用旧 schema），要么在之后（自动用新 schema）。
- 这种"无阻塞 schema 变更"只有在全局时间戳模型下才可行。

## 性能数据（来自论文原文）

| 副本数 | 写延迟 | 写吞吐 |
|--------|--------|--------|
| 1 | 10ms | 4.2K ops/s |
| 3 | 14ms | 1.8K ops/s |
| 5 | 15ms | 1.2K ops/s |

| 跨 group 参与方 | 2PC 延迟均值 | 99 分位延迟 |
|----------------|-------------|-------------|
| 1 | 14.6ms | 26.5ms |
| 10 | 22.8ms | 45.9ms |
| 50 | 33.8ms | 62.4ms |
| 200 | 122.5ms | 206ms |

## 总结

Spanner 的核心贡献可以用一句话概括：**用硬件级别的时钟同步（GPS + 原子钟）解决了分布式系统中"时间"这个最难的问题，从而让全球范围的强一致事务成为可能。**

三个关键设计决定：
1. **TrueTime 暴露时钟不确定性**，而不是假装时钟是精确的
2. **Commit Wait 机制**，用 ε 量级的延迟换全局时间戳的顺序保证
3. **MVCC + Paxos + 2PC** 的组合，让读不阻塞写、写有强一致性

## 延伸阅读

- 论文 PDF: [Spanner OSDI 2012](https://storage.googleapis.com/gweb-research2023-media/pubtools/1974.pdf)
- F1 论文: [F1 — The fault-tolerant distributed RDBMS supporting Google's ad business](https://research.google/pubs/pub40034/)（SIGMOD 2013）
- [[bigtable]] —— Spanner 的前身，KV 存储，无事务
- [[percolator-2010]] —— Bigtable 上的分布式事务框架，Spanner 事务模型的直接前身
- [[paxos-1998]] —— Paxos 共识协议，Spanner 单 group 复制的基础
- [[foundationdb-2021]] —— 不依赖物理时钟的替代方案
