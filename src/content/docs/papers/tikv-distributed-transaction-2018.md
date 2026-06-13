---
title: "TiKV: A Distributed Transactional Key-Value Database"
来源: https://arxiv.org/abs/2401.00004
日期: 2026-06-13
分类: 数据库
子分类: 存储与查询
provenance: pipeline-v3
---

# TiKV: 分布式事务型键值数据库

## 一、从一间大仓库说起

想象你经营着一家全国连锁的超市。

**问题 1 — 仓库太小**

只有一间仓库放所有商品？某天双 11 订单量暴涨 10 倍，仓库门口排起长龙，分拣员跑断腿也跟不上。

**解决方案：** 把一个大仓库拆成 100 个小仓库（称它们为"分片"或"region"）。每个分片只管一部分商品。订单来了，先查"商品 ID 属于哪个分片"，再直接找那个分片处理。这就是**水平分片（sharding）**。

**问题 2 — 某个分片挂了**

如果 42 号分片的服务器宕机了，那部分商品的信息就全部丢失，用户下单时会看到"数据不存在"。

**解决方案：** 每个分片不只存一份，而是同时在 3 台机器上各存一份。3 台机器通过一种叫 **Raft 协议** 的"民主投票"机制保证数据一致。只要超过半数（2 台）还活着，数据就不会丢。这就是 **Raft 一致性协议**。

**问题 3 — 多个仓库间要对账**

超市同时从广州仓发一批货、到北京仓收一批货。这两笔操作必须"要么都成功，要么都失败"。如果广州扣了库存、北京却没加上——账就对不上了。

**解决方案：** TiKV 使用 **Percolator 分布式事务模型**（源自 Google），配合 **Two-Phase Locking（两阶段锁）** 和 **Timestamp Oracle（时间戳 oracle，简称 TSOKV/TSO）** 来保证跨分片的 ACID 事务。

这就是 TiKV 要解决的核心问题。

---

## 二、TiKV 的架构全景

```
Client (应用)
    │
    ▼
TiKV Client SDK ── gRPC ──> PD (Placement Driver)  ◄── 集群的大脑
    │                            │
    ▼                            ▼
TiKV Server (Region 1)      TiKV Server (Region 2)
    │    │    │                   │    │    │
    ▼    ▼    ▼                   ▼    ▼    ▼
  Peer   Peer   Peer            Peer   Peer   Peer
  (A)    (B)    (C)             (A)    (B)    (C)
  Raft Group              Raft Group
```

三大组件：

| 组件 | 职责 | 类比 |
|------|------|------|
| **TiKV Server** | 存储键值数据，执行读写 | 仓库里的货架 |
| **PD (Placement Driver)** | 管理集群元数据、分配 region、生成全局时间戳 | 仓库管理员 + 时钟 |
| **TiKV Client SDK** | 应用侧的客户端库，连接 TiKV | 下单系统 |

---

## 三、核心概念详解

### 3.1 Region — 最小数据单元

TiKV 不是把整张表存在一台机器上，而是把数据切分成 **Region**（默认大小 96MB）。每个 Region 负责一段连续的 Key 范围，例如：

```
Region 1: ["a" ~ "m")
Region 2: ["m" ~ "z")
```

当应用写入 Key = "apple"时，Client 先向 PD 查询"apple 在哪个 Region"，然后直接连接到对应的 TiKV Server。

Region 会在数据膨胀时**自动分裂（split）**，也会在负载不均时**自动合并（merge）**。

### 3.2 Raft 组 — 数据复制的底层保障

每个 Region 有 3 个 Peer，分布在 3 台不同的机器上。它们组成一个 **Raft group**：

- **Leader**：处理所有读写请求
- **Follower**：复制 Leader 的日志
- **Candidate**：竞选 Leader 的临时状态

当 Leader 宕机时，剩下的 2 个 Follower 会通过 Raft 选举出一个新的 Leader。**这个过程通常只需要几百毫秒**。

### 3.3 全局时间戳 — TSO (Timestamp Oracle)

TiKV 的每张表都有一个**全局单调递增的时间戳**，由 PD 统一分配。这个时间戳用于：

1. **MVCC（多版本并发控制）**：每次写操作都会生成一个新版本，旧版本用时间戳来区分。
2. **分布式事务的快照隔离**：事务开始时的时间戳就是它的"快照时间"。

```rust
// 伪代码：获取全局时间戳
// TiKV Client SDK 内部自动完成，但理解它很重要

let start_ts = pd_client.get_timestamp().await?;
// start_ts = 420876512345678912
// 这个时间戳在全局范围内单调递增，保证一致性
```

### 3.4 MVCC — 多版本并发控制

TiKV 使用 MVCC 来支持高并发读而不阻塞写。每条记录实际上存了两个版本：

```
Key: "user:1001"

┌──────────────────────────────────────┐
│ Primary lock (start_ts=100)           │  ← 事务还在进行中
│   value: "Alice"                      │
├──────────────────────────────────────┤
│ Committed version (commit_ts=99)      │  ← 历史版本
│   value: "Bob"                        │
└──────────────────────────────────────┘
```

读请求会根据自己事务的 `start_ts`，选择对应时间戳的版本来读取——这就是**快照读（snapshot read）**。

### 3.5 分布式事务 — Percolator 两阶段提交

这是 TiKV 最核心的特性。假设要把用户 A 的 100 元转给用户 B：

```
-- 事务 1：A 转 100 元给 B --
BEGIN
  LOCK user:1001  (start_ts=100)    -- 第一阶段：加锁（Locking）
  SET   user:1001.balance = 900      -- A: 1000 -> 900
  LOCK user:1002  (start_ts=100)
  SET   user:1002.balance = 1010     -- B: 1000 -> 1010
COMMIT  commit_ts=101                -- 第二阶段：提交（Committing）
```

两个阶段：

**第一阶段 — Locking（加锁）**

为涉及的每个 Key 写入一条 Lock 记录，包含 `start_ts`。如果另一个事务已经锁了同一个 Key，就会产生冲突，需要回退或等待。

**第二阶段 — Committing（提交）**

使用**批量提交**：所有被锁的 Key 的 commit_ts 设为同一个值。如果某个 Key 的 commit 中途失败，TiKV 会进行**回滚（rollback）**，清除 Lock 记录。

```rust
// Rust 伪代码 — 应用使用 TiKV 客户端进行分布式事务
use tikv_client::{Client, Transaction};

async fn transfer(from: &str, to: &str, amount: i64) -> Result<()> {
    // 1. 创建分布式事务
    let mut txn = Client::connect(["127.0.0.1:2379"]).await?
        .into_transaction().await?;

    // 2. 读取源账户
    let from_balance = txn.get(from).await?;
    let to_balance = txn.get(to).await?;

    // 3. 写入新余额（自动加锁）
    txn.put(from, &(from_balance - amount)).await?;
    txn.put(to, &(to_balance + amount)).await?;

    // 4. 两阶段提交
    txn.commit().await?;
    //     │
    //     ├── Phase 1: 对 from 和 to 加锁
    //     └── Phase 2: 批量写入 commit_ts
}
```

---

## 四、代码示例

### 示例 1：用 Rust SDK 读写 TiKV

```rust
use tikv_client::{Client, Config};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 连接到 PD 地址列表（PD 是 TiKV 集群的元数据中心）
    let mut client = Client::new(
        vec!["192.168.1.10:2379", "192.168.1.11:2379"],
        Config::default(),
    ).await?;

    // 创建一个即时事务（非分布式事务，适合单 Key 操作）
    let mut txn = client.into_transaction().await?;

    // 写入键值对
    txn.put(b"user:1".to_vec(), b"Alice".to_vec()).await?;

    // 读取键值对
    let value = txn.get(b"user:1".to_vec()).await?;
    println!("user:1 = {:?}", value);  // 输出: user:1 = Some(b"Alice")

    // 提交事务
    txn.commit().await?;

    Ok(())
}
```

### 示例 2：Go 客户端进行 Range 扫描

```go
package main

import (
    "context"
    "fmt"
    "log"

    "github.com/tikv/client-go/v2/txnkv"
)

func main() {
    // 创建事务客户端
    txn, err := txnkv.NewClient(
        []string{"192.168.1.10:2379"},
    )
    if err != nil {
        log.Fatal(err)
    }

    ctx := context.Background()

    // 写入
    err = txn.Set(ctx, []byte("order:1001"), []byte(`{"item":"book","qty":3}`))
    if err != nil {
        log.Fatal(err)
    }

    // 范围扫描（扫描 key 从 "order:" 到 "order:" + 结束符）
    // TiKV 的 Key 是有序的，所以范围扫描效率很高
    iterator, err := txn.Iter(
        []byte("order:"),
        []byte("order;\x00"),
    )
    if err != nil {
        log.Fatal(err)
    }
    defer iterator.Close()

    for iterator.Valid() {
        fmt.Printf("%s = %s\n", iterator.Key(), iterator.Value())
        iterator.Next()
    }

    // 提交
    err = txn.Commit(ctx, uint64(0))
    if err != nil {
        log.Fatal(err)
    }
}
```

---

## 五、TiKV 在生态中的位置

TiKV 不是孤立的。它通常作为 TiDB（分布式关系型数据库）的**存储引擎**来使用：

```
TiDB (SQL 层)          ← 你写标准的 SQL 语句
    │
    ▼
TiKV (存储层)          ← 把 SQL 翻译成 KV 读写操作
    │
    ▼
PD (调度层)            ← 管理数据分布和全局时间戳
```

你可以直接用 TiKV 做 KV 存储（像 Redis 一样），也可以通过 TiDB 用 SQL 操作它。这是 TiKV 设计上的一个**分层架构**好处。

---

## 六、关键性能设计

| 设计 | 说明 |
|------|------|
| **Store-Per-Region 模型** | 每个 Region 只在一个 TiKV Server 上是 Leader，简化了一致性逻辑 |
| **Batch RPC** | 一次网络请求带多个 KV 操作，减少延迟 |
| **Raft-Propose-Lease** | 读请求可以走本地快照，不需要每次都问 Leader |
| **Lock GC** | 后台定期清理过期的事务 Lock，防止膨胀 |
| **Encoded Raftstate** | Raft 状态用 Protobuf 编码，减少存储开销 |

---

## 七、学习小结

TiKV 解决的核心问题是：**如何在多台机器上，既保证数据不丢失，又保证分布式事务的 ACID 特性，同时还能水平扩展？**

它的答案可以浓缩为三句话：

1. **用 Raft 保证复制一致性**——每台机器上的数据副本通过投票达成一致。
2. **用 TSO + MVCC 实现高并发快照读**——写操作生成新版本，读操作取旧版本，互不阻塞。
3. **用 Percolator 两阶段提交实现分布式事务**——先加锁再批量提交，失败自动回滚。

---

## 思考题

1. Raft 选举中为什么要求"多数派（quorum）"才能选出新 Leader？如果只有 2 台机器会怎样？
2. 为什么分布式事务的两阶段提交在某个阶段失败了，需要 rollback 而不是直接"部分提交"？
3. 如果一个 Region 的数据量超过了 96MB，TiKV 会怎么操作？这个过程对应用透明吗？

---

*原文献：PingCAP. "TiKV: A Distributed Transactional Key-Value Database." arXiv preprint, 2018.*
*本笔记基于论文内容整理，面向零基础学习者，用日常类比逐层解释分布式系统概念。*
