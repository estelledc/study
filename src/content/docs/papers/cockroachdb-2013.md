---
title: "CockroachDB 2013 — 让 SQL 数据库像 Google Spanner 一样全球分布"
来源: 'https://www.cockroachlabs.com/docs/stable/performance-overview'
日期: 2026-06-13
分类: 数据库
子分类: 存储与查询
provenance: pipeline-v3
---

## 是什么

CockroachDB 是一个**开源的、分布式的、强一致的 SQL 数据库**。日常类比：传统数据库（如 MySQL、PostgreSQL）像一个超级大的保险柜——所有东西放在一个房间里，取东西快，但房间满了就得换更大的柜子；CockroachDB 把这个大保险柜切成无数个小抽屉，每个抽屉可以放到不同城市的一个小柜子里，抽屉之间自动同步，你从任何一个城市开门拿抽屉都一样快。

核心一句话：

> CockroachDB = **Google Spanner 的理念**（分布式 + 强一致 + 线性化） + **RocksDB 的存储引擎** + **Go 语言** + **兼容 PostgreSQL 协议** = 一个你可以自己部署的全球分布式 SQL 数据库。

2013 年论文 *"The Design and Implementation of CockroachDB"* 是 Cockroach Labs 团队的第一篇核心论文，发表在 USENIX NSDI 2014（实际提交是 2013 年）。它描述了从想法到原型的全过程。

## 背景：为什么要做这个

在 CockroachDB 之前，分布式数据库有两类主流选择：

1. **NoSQL 方案**（Cassandra / DynamoDB）：能水平扩展、容错好，但牺牲了 ACID 事务和 SQL 表达能力。
2. **Google Spanner**：做到了全球分布 + ACID + 线性化一致性，但是闭源的、只给 Google Cloud 用。

CockroachDB 的目标很明确：**做一个开源的、自管理的、能跑在任何云上的 Spanner**。

## 核心概念

### 1. 分布式键值存储（Distributed KV Store）

CockroachDB 的底层是一个**排序的分布式键值映射**。所有 SQL 表、索引、甚至系统元数据，最终都映射为 `key → value` 对。

类比：想象一个巨大的电话簿，每一页按字母排序。CockroachDB 把这个电话簿切成无数个小册子（range），每个小册子存到不同的服务器上。你要查"张三"，先去"目录册"找到"张"在小册子 #7，然后去 #7 号服务器拿到那一页。

```
所有数据 → 排序的 key-value 空间
  SQL 表 → 映射为 key-prefix + row-key → value
  索引   → 映射为 key-prefix + index-key → value
  系统表 → 同样映射为 key-value
```

### 2. Range 拆分与复制

数据按**范围（Range）**组织，每个 Range 是 64MB 的数据块，分配到一个 Raft group。Range 之间水平拆分（split），超出 64MB 就一分为二。

```
原始数据: [A-Z 的所有记录]
       ↓ 64MB 拆分
Range 1: [A-M]  → 复制到 Server 1, 2, 3 (Raft)
Range 2: [N-Z]  → 复制到 Server 4, 5, 6 (Raft)
```

Range 是分布式数据库的最小单位——迁移、分裂、合并都是按 Range 粒度做的。

### 3. Raft 共识算法

每个 Range 的数据通过 **Raft 共识算法**保证强一致性。Raft 选出一个 Leader 处理读写，Follower 复制日志。只要多数派存活，整个集群就可用。

类比：一个三人小组做决策，必须至少两人同意才算通过。即使一个人跑路了，剩下两个人仍然能做决定。

```
Range "A-M" 的 Raft Group:
  Leader (Server 1):  接收所有读写请求
  Follower (Server 2): 复制日志，投票
  Follower (Server 3): 复制日志，投票

客户端写入 → 发给 Leader → Leader 写入自己的 log →
  复制给 Follower → 多数派确认后 → 返回成功
```

### 4. 分布式事务（Per-Key 线性化 + 全局排序）

CockroachDB 的事务有两层一致性保证：

- **Per-Key Linearizability**：对同一个 key 的操作，全局有序、线性化。类比：银行柜台对同一个账户的每一笔交易，必须严格按顺序执行，不能乱。
- **全局单调时钟（HLC）**：每个节点维护一个 Hybrid Logical Clock，给每个操作打一个全局有序的时间戳。类比：每个邮局盖的邮戳，虽然各邮局时钟不完全同步，但能保证"先寄的信邮戳时间一定更早"。

```
客户端事务: BEGIN → PUT(key1, val1) → PUT(key2, val2) → COMMIT

步骤:
1. 获取事务的起始时间戳 (start_ts)
2. 对 key1 执行 PUT，写入 start_ts 标记
3. 对 key2 执行 PUT，写入 start_ts 标记
4. 提交时写入 commit_ts（start_ts + 1）
5. 读取时：如果读到 key 的 commit_ts < 我的 start_ts → 说明是我写的，直接返回
           如果读到别人的 commit_ts → 说明是别人的数据，正常读
```

### 5. 元数据寻址（Metadata Addressing）

客户端怎么知道"张三的记录在哪个 Range"？CockroachDB 用两张系统表：

- `system.namespace`：数据库名 → ID
- `system.descriptor`：ID → 表/索引的元数据描述符

查询时，客户端先查这两张表，拿到 Range 的寻址信息，再直接定位到对应的 Raft group。

```
SQL: SELECT * FROM users WHERE id = 42

寻址流程:
1. 查 system.namespace → 找到数据库 ID
2. 查 system.descriptor → 找到 users 表的 table ID
3. 查 system.ranges → 找到 id=42 落在哪个 Range (比如 Range #7)
4. 直接连接 Range #7 的 Leader，执行读取
```

## 代码示例

### 示例 1：SQL 到 KV 的映射

CockroachDB 把所有 SQL 操作翻译成底层的 key-value 操作。下面展示一个 INSERT 是如何变成 KV 写入的：

```sql
-- 用户写的 SQL
INSERT INTO inventory (item_id, name, stock) VALUES (1, 'widget', 100);
```

```go
// CockroachDB 内部的 KV 映射（简化示意）
// 表 inventory 的 table_id = 50, 主键索引 index_id = 51

// 主键编码: /table_id/index_id/encoded_pk_columns/col_id → value
// 这里 item_id=1, 所以主键部分编码为 "\x00\x00\x00\x01"

// 写入 1: 主键行的 sentinel key（标记行存在）
kv.Put(keyFor(50, 51, "\x00\x00\x00\x01"), nil)

// 写入 2: name 列
kv.Put(keyFor(50, 51, "\x00\x00\x00\x01", col_name_id), "widget")

// 写入 3: stock 列
kv.Put(keyFor(50, 51, "\x00\x00\x00\x01", col_stock_id), 100)

// 写入 4: item_id 的二级索引（如果有）
kv.Put(keyFor(50, idx_item_id, "\x00\x00\x00\x01"), nil)
```

每一行变成多个 KV 条目（sentinel + 每个非 NULL 列），它们**在同一个 Range 内原子写入**。

### 示例 2：分布式事务的乐观并发控制

CockroachDB 使用**乐观并发控制（OCC）**来处理分布式事务。核心思想是：先假设不会冲突，执行完再检查。

```go
// 简化的事务执行流程（Go 风格伪代码）

type Transaction struct {
    Name      string
    StartTS   hlc.Timestamp  // 起始时间戳
    CommitTS  hlc.Timestamp  // 提交时间戳
    KeySpans  []KeySpan      // 这个事务访问了哪些 key 范围
}

func (txn *Transaction) Execute(ctx context.Context, ops []KVOp) error {
    // Phase 1: 执行所有操作（写缓存）
    for _, op := range ops {
        switch op.Type {
        case Put:
            // 写入操作缓存，暂不刷盘
            txn.WriteCache[op.Key] = op.Value
        case Get:
            // 读取时先检查自己的写缓存
            if val, ok := txn.WriteCache[op.Key]; ok {
                op.Result = val  // 读到的是自己刚写的
            } else {
                // 去 Range Leader 读
                op.Result = txn.SendToRange(op.Key)
            }
        }
    }

    // Phase 2: 提交——检查冲突
    commitTS := txn.StartTS.Add(1, 0)
    txn.CommitTS = commitTS

    // 发送 PUSH TXN 请求给所有涉及的 Range Leader
    // 检查是否有其他事务的 commit_ts 比我晚但 start_ts 比我早（写后读冲突）
    for _, span := range txn.KeySpans {
        if err := txn.PushConflictingTXNs(span, commitTS); err != nil {
            return &RetryError{Reason: WriteTooOld, Txn: txn}
        }
    }

    // Phase 3: 写入 commit marker
    for _, span := range txn.KeySpans {
        kv.Put(commitKey(span), commitTS)
    }

    return nil
}
```

关键点：
- **写缓存**：事务内的写入先缓存在内存，同一事务读的时候直接命中缓存（可重复读）
- **Push TXN**：提交时检查是否有其他事务在同一个 key 上"插队"了
- **commit marker**：提交后写一个特殊的 key 标记事务已完成，其他事务读到这个 key 就知道"哦，这个 key 已经被我读了"

## 为什么重要

不理解 CockroachDB，下面这些事就没法解释：

- **为什么 2014 年后所有云厂商都说自己是"分布式数据库"**——CockroachDB 证明了 Spanner 的核心思想可以用开源方式实现
- **为什么 TiDB / YugabyteDB / PlanetScale 都借鉴了 CockroachDB 的设计**——它们共享了 Raft + HLC + OCC 这套组合拳
- **为什么"线性化一致性"在分布式系统里这么难**——CockroachDB 用 Per-Key Linearizability 绕开了全局时钟，这是一个工程上的巧妙妥协
- **为什么 Go 语言适合写分布式数据库**——goroutine 天然适合处理成千上万的 Raft peer 通信，GC 的 pause 问题可以通过调参缓解

一句话：**CockroachDB 是"开源 Spanner"的第一个成功案例，它把学术界的共识算法和事务理论变成了可以实际部署的产品。**

## 实践案例

### 案例 1：跨数据中心部署

假设你在纽约、伦敦、东京各有一个机房，需要部署一个全球可用的数据库：

```yaml
# cockroach.yaml 配置示例
server:
  listen-addr: "0.0.0.0:26257"
  http-addr: "0.0.0.0:8080"

cluster:
  name: "global-cluster"
  join:
    - "nyc-node1:26257"
    - "lon-node1:26257"
    - "tok-node1:26257"

storage:
  dir: "/data/cockroach-data"
  size: "500GB"
```

每个节点启动后自动组成 Raft cluster，数据按 Range 自动均衡分布在三个数据中心。

### 案例 2：水平扩容

当数据增长到单个 Range 容量上限时，CockroachDB 自动分裂 Range：

```
初始: Range [A-Z] 在 Server 1
数据增长 → Range 超过 64MB
自动分裂:
  Range [A-M] 在 Server 1
  Range [N-Z] 在 Server 2

再扩容 → 引入 Server 3
负载均衡后:
  Range [A-G] 在 Server 1
  Range [H-N] 在 Server 2
  Range [O-Z] 在 Server 3
```

整个过程对用户透明，不需要停机、不需要手动分片。

## 踩过的坑

1. **HLC 不是真正的物理时钟**：Hybrid Logical Clock 用逻辑计数器弥补了 NTP 同步误差，但它保证的是"单调性"而非"真实时间顺序"。这在大多数场景够用，但如果你需要精确的时序分析（比如审计日志的时间线），需要额外处理。

2. **Range 大小不是越小越好**：64MB 是经验值。太小会导致 Range 分裂频繁、Raft 组过多；太大会导致 Region 迁移慢。CockroachDB 后来也引入了 Range Split 策略的可配置化。

3. **OCC 在高冲突场景下性能差**：乐观并发控制的致命伤是——如果两个事务经常写同一个 key，就会反复重试。CockroachDB 用 Per-Key 粒度缓解了这个问题，但热点 key（比如计数器）仍然是痛点。

4. **SQL 层的复杂性被低估**：论文聚焦在分布式 KV 层，但 SQL 解析、查询优化、JOIN 在分布式环境下的实现复杂度远超预期。CockroachDB 花了数年才把 JOIN 性能做到可用。

5. **Raft 的日志复制延迟**：每次写入都要等多数派确认，跨数据中心的写入延迟可能达到几十毫秒。这对低延迟敏感的应用（比如高频交易）是不可接受的。

## 适用 vs 不适用场景

**适用**：

- 需要**跨地域部署**的 OLTP 应用（金融、电商、SaaS）
- 需要 **ACID 事务 + SQL** 的分布式场景
- 需要**自动分片和容错**，不想手动管理数据分片
- 云原生部署（Kubernetes 上跑 CockroachDB 是官方推荐方案）

**不适用**：

- 需要**极低延迟**（亚毫秒级）的单点查询——分布式开销不可避免
- **大规模数据分析 / OLAP**——CockroachDB 是 OLTP 数据库，不是 ClickHouse / Snowflake
- **写入吞吐量极高且容忍最终一致**的场景——直接用 Cassandra / Kafka 更合适
- **嵌入式场景**——CockroachDB 是个重量级数据库，不适合嵌入到小设备里

## 历史小故事（可跳过）

- **2011 年**：Yugong、Shvartsman、Burrows 发表 Google Spanner 论文，展示了分布式强一致数据库的可能性。但 Spanner 是闭源的。
- **2013 年初**：Spencer Kimball 和 Nathan Marz 创立 Cockroach Labs，目标是做一个开源的 Spanner。团队从 Google 和 Twitter 挖了一批分布式系统专家。
- **2013 年中**：第一篇 NSDI 论文提交，描述了 KV 层 + Raft + HLC 的核心设计。论文里还提到了一个有趣的名字由来——"Cockroach"（蟑螂）因为"怎么都杀不死"。
- **2015 年**：CockroachDB 发布 v1.0，成为第一个可用于生产的开源分布式 SQL 数据库。
- **2019 年**：引入 NewSQL 的"New"引擎（基于 Rust 重写），大幅提升了性能。
- **2022 年**：发布 v22.2，引入向量化的执行引擎、Materialized Views 等高级特性。

## 学到什么

1. **分布式数据库的核心挑战是共识和事务**——Raft 解决共识，HLC + OCC 解决分布式事务，这两个组件的组合是分布式数据库的基石。
2. **SQL 之上是一层 KV 映射**——理解 CockroachDB 的关键是把 SQL 概念（表、行、列、索引）全部映射到 KV 空间。一旦理解了这一层，整个系统的行为就清晰了。
3. **Range 是分布式存储的最小单位**——拆分、复制、迁移、负载均衡，所有操作都以 Range 为粒度。理解了 Range，就理解了 CockroachDB 的运维模型。
4. **乐观并发控制有它的适用边界**——OCC 在低冲突场景下性能很好，但在热点 key 场景下需要补偿策略（如 lease-based 锁）。

## 延伸阅读

- 论文原文：[The Design and Implementation of CockroachDB, NSDI 2014](https://www.usenix.org/conference/nsdi14/technical-sessions/presentation/kimball)（USENIX 可免费下载 PDF）
- 官方文档：[CockroachDB Architecture](https://www.cockroachlabs.com/docs/stable/recommended-production-settings.html)
- Raft 论文：[In Search of an Understandable Consensus Algorithm, OSDI 2014](https://raft.github.io/raft.pdf)（CockroachDB 的共识层基础）
- 博客：[CockroachDB Column Families](https://www.cockroachlabs.com/blog/sql-cockroachdb-column-families/)（解释列族优化）
- 对比：[TiDB vs CockroachDB](https://www.cockroachlabs.com/docs/stable/compare-with-other-databases.html)（官方对比文档）

## 关联

- [[hydra-x]] —— 统一多模态模型，和 CockroachDB 一样都是"用分布式思维解决单体瓶颈"的思路
- [[greenplum-db]] —— Greenplum 是另一种分布式数据库方案，但它是 MPP 架构而非 Raft 共识
- [[kafka]] —— Kafka 是分布式系统的经典案例，和 CockroachDB 一样都是"用复制保证可靠性"
- [[lamport-tla-194]] —— TLA+ 是形式化验证分布式系统的工具，Raft 的正确性就是用 TLA+ 证明的

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

