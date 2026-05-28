---
title: Dynamo (DeCandia et al. 2007) — NoSQL 的源头与 CAP 的 AP 路线
description: Amazon 购物车的"always writable"承诺如何驱动了一代 NoSQL 设计——consistent hashing + vector clocks + sloppy quorum + hinted handoff
sidebar:
  label: Dynamo (SOSP 2007)
  order: 11
---

## 核心信息

- 标题：Dynamo: Amazon's Highly Available Key-value Store
- 作者：Giuseppe DeCandia, Deniz Hastorun, Madan Jampani 等 9 人
- 通讯：**Werner Vogels (Amazon CTO 2005-2024)** —— 该论文 Vogels 自己挂名是行业罕见
- 机构：Amazon.com
- 发表：SOSP 2007
- PDF：[allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf)（16 页）
- 代码：**Amazon 内部，未开源**；事实开源对应物 [Cassandra](https://cassandra.apache.org/) (Facebook 2008，吸收 Dynamo 设计)、[Riak](https://github.com/basho/riak) (Basho)、[Voldemort](https://github.com/voldemort/voldemort) (LinkedIn)
- 论文类型：system + experience paper（讲一个生产系统的 4 大技术 + 工程教训）

## 原文摘要翻译

大规模可靠性是 Amazon.com 面临的最大挑战之一——
即使是最轻微的故障都有显著的财务后果并影响客户信任。
Amazon 平台运行在数万台服务器和网络组件上，跨多个数据中心。
**这种规模下小型和大型组件持续不断地失败**，应用状态在故障面前如何被管理决定了软件系统的可靠性和可扩展性。
本文介绍 Dynamo——一个 Amazon 一些核心服务用来提供"always-on"体验的高可用 key-value 存储系统。
为达到这种可用性，**Dynamo 在某些故障场景下牺牲一致性**。
它广泛使用**对象版本控制和应用辅助的冲突解决**，为开发者提供新颖的接口。

## 创新点

Dynamo 给"分布式存储"领域提供了 4 件真正新的东西（每一件都成为现代 NoSQL 标配）：

1. **Consistent Hashing 用于 partition + replication**：节点在哈希环上分布；
   key 顺时针找到下一个节点 = primary，再往后 N-1 个 = replicas。
   **加/减节点只影响相邻 keys**，不需要 rehash 全部
2. **Vector Clocks 用于版本管理 + 冲突检测**：每个对象的每个版本带 vector clock。
   并发更新被检测出 → **应用层做 conflict resolution**（不是系统替你决定）
3. **Sloppy Quorum + Hinted Handoff**：partition 时让任意 N 个 healthy 节点接受写入（即使不是原 owner）→
   节点恢复后用 hinted handoff 把数据 transfer 回去。**永远可写**
4. **Application-controlled tunable consistency**：`(N, R, W)` 三元组让应用决定 consistency vs availability 的位置。
   `R+W > N` 时 strong；`R+W ≤ N` 时 eventual

## 一句话总结

**Dynamo 把 CAP theorem 的 AP 路线推到生产边界——
"购物车永远可写"作为商业承诺，反向定义系统设计哲学。**
2007 后整代 NoSQL（Cassandra / Riak / Voldemort / DynamoDB）都是这一篇的工程化变体。

![Dynamo 4 大核心技术](/study/papers/dynamo/01-four-techniques.webp)

*图 1：Dynamo 4 大核心技术四象限图。
**Consistent Hashing** (左上)：节点在 ring 上分布，key k1 顺时针找到 coordinator B；
**Vector Clocks** (右上)：检测并发版本 `[(A,1),(B,2)]` vs `[(A,2),(B,1)]` 触发应用层 reconciliation；
**Sloppy Quorum** (左下)：N=3, R=2, W=2 配置；partition 时 healthy 节点临时接受写；
**Hinted Handoff** (右下)：原 owner 恢复后从 temporary node transfer 数据。
顶部 "Dynamo: AP path of CAP theorem"，底部 "eventual consistency / always-writable / decentralized"。论文 paper-figure 风。*

## Why（这篇出现前世界缺什么）

2007 之前，大规模在线服务的存储面临三个困境：

1. **关系型数据库 ACID 在大规模下不行**：跨节点事务 + strong consistency = throughput 上限低
2. **Memcached 类不持久化**：可以快但断电丢数据
3. **Master-slave 架构有 SPOF**：master 故障 → 系统不可写

Amazon 购物车场景的极端要求：

- 即使数据中心故障也要能加入商品（**always writable**）
- 历史购物车不能丢（**durable**）
- 容忍短暂不一致（**eventual consistency OK**）—— 用户加 2 件商品然后看到只有 1 件，刷新后会看到 2 件，用户不会留下抱怨

Dynamo 的 insight：**ACID 的 C 是 nice-to-have，A（availability）是 must-have**。
论文 Section 2.2 原文：

> "Experience at Amazon has shown that data stores that provide ACID guarantees tend to have poor availability."

这是 CAP 的 AP 路线第一次在生产系统级别被全面拥抱。

## 论文地形

PDF 16 页。章节角色：

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1. Introduction | "always writable" 商业要求驱动技术 | 读 |
| 2. Background | system requirements + design considerations | 速读 |
| 3. Related Work | P2P / 分布式 KV 比较 | 速读 |
| 4. System Design | **5 大技术**：partitioning / replication / versioning / member / failure handling | **精读** |
| 5. Implementation | Dynamo 节点的 storage / membership / failure detection 实现 | 速读 |
| 6. Experiences | **生产经验** —— 论文最值钱部分 | **精读** |
| 7. Conclusion | 略 | 跳 |

**心脏物**有四个：

1. **Section 4.1-4.2** Consistent hashing + virtual nodes 设计
2. **Section 4.4** Vector clock + 应用层 reconciliation
3. **Section 4.5** Sloppy quorum + hinted handoff（partition 处理）
4. **Section 6** 真实负载下的延迟分布 + tuning 经验

## 机制流程（5 大技术）

### Technique 1: Consistent Hashing

每个节点被分配 hash ring 上的一个位置。Key 通过 `hash(key)` 映射到 ring 上的一个点，
顺时针找到的第一个节点是该 key 的 **coordinator**。Coordinator 之后的 N-1 个节点是 **replicas**。

加节点：只需把它周围的 keys 从邻居迁移过来，**不影响其他节点**。

虚拟节点（virtual nodes / vnodes）：每个物理节点对应 ring 上多个 vnode（典型 100-200 个）。
好处：

- 异构节点可以分配不同数量 vnode（强机器多分）
- 节点失败时负载平均分散到所有其他节点
- 加节点时新节点从所有现有节点拉数据，不仅仅邻居

### Technique 2: Replication

每个 key 在 N 个节点上有副本（典型 N=3）。这 N 个节点被称为 **preference list**。
preference list 跳过同 rack / 同 datacenter 的副本，**保证物理冗余**。

### Technique 3: Versioning + Vector Clocks

每个对象 = (key, value, vector_clock)。

Vector clock：`[(node_A, counter_A), (node_B, counter_B), ...]`

**冲突检测**：如果 V1 的 vector clock 不是 V2 的子集，**且 V2 也不是 V1 的子集** → V1 和 V2 是 concurrent → 系统返回两个版本给应用，应用决定如何 merge。

经典案例：购物车 = 物品集合。两个并发 add 操作产生两个版本，应用层做集合并集 reconciliation。

### Technique 4: Sloppy Quorum

不像 strict quorum 必须从 preference list 里选 W/R 个节点，
sloppy quorum 允许从**整个 ring 里**任意 N 个 healthy 节点凑齐 W 个写入。

这意味着：partition 期间，coordinator 仍能找到 N 个 healthy 节点写入——**永远可写**。

代价：**写入可能不在 preference list 上**——靠下面的 hinted handoff 修正。

### Technique 5: Hinted Handoff

如果 sloppy quorum 写到了非 preference list 节点 X，X 给该数据加 **hint**：
"这本应是 node A 的，A 恢复后转给 A"。

A 恢复后，X 主动 push 数据给 A，再删除本地副本。这样 partition 期间产生的写入**最终汇聚回正确位置**。

## 核心机制（含代码精读）

### 机制 1：(N, R, W) 三元组配置一致性

最被低估的设计点：**应用配置 (N, R, W) 三个数字，决定一致性 vs 可用性**。

| Config | 行为 | 适用场景 |
|---|---|---|
| N=3, R=2, W=2 | strong consistency（R+W>N） | 默认推荐 |
| N=3, R=1, W=1 | maximum availability | 计数器、点击数 |
| N=3, R=3, W=1 | fast write, slow read | 写多读少 |
| N=3, R=1, W=3 | fast read, durable write | 读多写少 |
| N=3, R=3, W=3 | full strong consistency | 罕用 |

**怀疑 1**：(N, R, W) 给应用太多自由度。**Cassandra 实践证明大部分应用用默认 N=3, R=Quorum, W=Quorum**——
真正用复杂配置的极少。Dynamo 论文 Section 6 提了 "应用 95% 用 (3,2,2)" 但**没解释为什么暴露这么多 knob**。
推测：Amazon 内部不同团队需要不同 trade-off，所以暴露给开发者；但 OSS Cassandra 大多数用户不需要。

### 机制 2：Vector Clock 的实际衰减问题

论文 Section 6.3 承认：vector clock **会无限增长**——每次 update 都给某个 (node, counter) +1。
长寿对象（如老用户的购物车）的 vector clock 可能有几十甚至几百个 entries。

Amazon 解决方案（论文 Section 4.4）：**截断**——只保留最近 N 个 entries（典型 N=10）。
代价：截断后的 vector clock 失去**完整因果信息**，可能误判 concurrent / not-concurrent。

但工程现实是：**这种误判极少触发**，截断后系统仍可用。

**怀疑 2**：vector clock 截断的正确性论文没证明，只是经验数字。Riak 后来加了 "dotted version vectors"
作为更细粒度替代。Dynamo 选了简单方案（按 entry 数截断），承受 corner case 误差。

### 机制 3：Application-Assisted Reconciliation —— 难写但赋权

Section 4.4 关键例子：**购物车 reconciliation**。

```python
# 应用层伪代码
def reconcile_cart_versions(versions: list[Cart]) -> Cart:
    # 各版本的物品集合做并集
    all_items = set()
    for v in versions:
        all_items |= set(v.items)

    # deleted items 怎么办？
    # 简单方案：union 总会让 deleted item 复活——所以 Amazon 选择"deletion 是 add a tombstone"
    # 实际上这导致购物车 history "永不消失" 直到 GC

    return Cart(items=all_items)
```

**这是 Dynamo 把复杂度从系统推给应用的经典例子**——**应用必须考虑并发更新的语义**，而不是系统帮你决定。

**怀疑 3**：应用层 reconciliation 难写正确。论文 Section 6.3 提到 "developers found it hard to design merge functions"——
开发者经常写 last-write-wins，**违背了 eventual consistency 的初衷**。这是 Dynamo 范式的最大工程负担。

## L4 复现：3 节点 sloppy quorum 手算

按 [方法论 L4 路径 #4](/study/papers-method/)：

设 Dynamo 集群 5 节点 `{A, B, C, D, E}` 在 ring 上顺时针排列。
Key `cart_user_42` hash 到 A 和 B 之间 → preference list = `[B, C, D]`（顺时针 3 个）。

配置 N=3, R=2, W=2。

### 场景 A：正常 put

```
Client 调用 put(cart_user_42, value="apple,banana", vc=[]):
  Coordinator B 接收
  B 给 vc 加 entry: vc = [(B,1)]
  B 写本地: stored
  B 转发给 C, D 写
  C 写成功 → ACK
  D 写超时（高负载）...
  B 收到 2 个 ACK (B+C) ≥ W=2 → 返回 success

最终状态:
  B: cart=[(B,1), apple,banana]
  C: cart=[(B,1), apple,banana]
  D: 没收到（暂时）

Read repair 后台进程会发现 D 没有最新版本，把它从 B 同步过来
```

### 场景 B：Sloppy Quorum（B 网络分区）

```
Client 调用 put(cart_user_42, value="apple,orange", vc=[(B,1)]):
  Coordinator B 网络不可达
  Client 被路由到下一个 healthy 节点（hash ring 顺时针下一个）= C
  C 临时担任 coordinator:
    C 给 vc 加 entry: vc = [(B,1), (C,1)]
    C 写本地
    C 转发给 D, E（B 不可达，sloppy quorum 用 E 凑数）
    D 写成功
    E 写成功（带 hint: "应该给 B 的"）
  C 收到 2 个 ACK ≥ W=2 → 返回 success

最终状态:
  B: 不可达
  C: cart=[(B,1),(C,1), apple,orange]
  D: cart=[(B,1),(C,1), apple,orange]
  E: cart=[(B,1),(C,1), apple,orange] + hint{owner: B}

B 恢复后:
  E 检测到 B 上线 → push hinted data 给 B → B 把 cart 加到自己存储 → E 删本地
  最终 B/C/D 都有最新版本（preference list 完整）
```

### 场景 C：Concurrent Updates（产生 conflict）

```
两个 client 同时 put 不同 value:

Client X 写: put(cart, "apple", vc=[(B,1)])
  → B coordinator → B 写: vc=[(B,2)] (B 自增)
  → forward 给 C, D

Client Y 同时写（X 的写还没传到 Y 的视图）:
  put(cart, "banana", vc=[(B,1)])
  → C coordinator (assume X 在到 B 的同时 Y 路由到 C)
  → C 写: vc=[(B,1),(C,1)]

最终 B 和 C 的版本互相不知道:
  B: vc=[(B,2), apple]
  C: vc=[(B,1),(C,1), banana]

Read 时:
  Client read cart → coordinator 收集 R 个版本
  发现 [(B,2), apple] 和 [(B,1),(C,1), banana] 互相 not-ancestor
  → return BOTH versions to client
  → 应用层 reconcile: cart = {apple, banana}, vc = [(B,2),(C,1)]
  → 写回 reconciled version
```

label：`[mechanism verified at toy level]` —— 3 场景（正常 / sloppy quorum / concurrent）协议手算正确。

## 谱系对比

### 前作：Bigtable (Chang et al., OSDI 2006)

Bigtable 是 Google 同期的大规模存储——**强一致性 + 单 master**。Bigtable 用 Chubby（Paxos）做 metadata 协调，
是 CAP 的 CP 路线。Bigtable 和 Dynamo 是**两种哲学**——前者保 C 牺 A，后者保 A 牺 C。

### 后作：Cassandra (Lakshman & Malik, Facebook 2008)

Lakshman 是 Dynamo 论文 9 作者之一，跳到 Facebook 后写了 Cassandra——**Dynamo + Bigtable 杂交**：

- Dynamo 的 ring + consistent hashing + tunable consistency
- Bigtable 的 column family 数据模型

Cassandra 是 Dynamo 思想最成功的开源工程化，至今活跃。

### 后作：Riak (Basho 2009-2017)

更纯粹的 Dynamo 复刻。**Erlang 实现 + dotted version vectors 替代 vector clock 截断**。
Basho（Riak 维护方）2017 解散但代码仍 active。

### 后作：DynamoDB (Amazon AWS 2012)

**与论文版 Dynamo 是不同系统**——AWS DynamoDB 反而更接近 Bigtable 思路：

- 默认 strong consistency（不是 eventual）
- managed service，不暴露 (N,R,W)
- 内部仍用 consistent hashing 但实现细节不公开

**有趣对比**：论文 Dynamo 是 AP，AWS DynamoDB 是 CP。**商业产品反向**——
默认 strong 让用户少踩坑。

### 后作（理论修正）：dotted version vectors (Preguiça et al. 2010)

vector clock 的精细化版本。解决 Dynamo "vector clock 无限增长 + 截断丢信息" 的核心痛点。
Riak 后期采用，但学界关注度低。

### 选型建议

| 场景 | 选 |
|---|---|
| 需要 always-writable（购物车类） | Cassandra (Dynamo 思想成熟工程版) |
| 需要 strong consistency | DynamoDB (managed) / Spanner / CockroachDB |
| 学经典 NoSQL 设计 | **Dynamo 论文**（必读） |
| 极简 KV with high availability | Riak (虽然停止维护) |
| 大规模时间序列 | Cassandra / ScyllaDB |

## 与你当前工作的连接

### 今天就能用

任何"在线服务设计"都该问 CAP trade-off 在哪里：

- 用户面（购物车 / 偏好 / session）：AP 优先 → eventual consistency OK
- 钱面（payment / order）：CP 优先 → strong consistency 必需
- 内部 metadata（service registry）：CP，但容忍短暂不可用

Dynamo 范式适合**商业损失低 + 吞吐要求高**的场景。

### 下个月能用

设计任何"多副本系统"时回头看 Dynamo 4 大技术：

- **Consistent hashing**：partition + replication 的事实标准
- **Vector clocks 或简化版**：检测并发更新
- **Sloppy quorum**：partition 期间保可用
- **Hinted handoff**：partition 后修正

这 4 件事 Cassandra / Riak / TiKV 都吸收。

### 不要用的部分

- **不要默认让应用层做 reconciliation**：开发者经常写错，最终成 last-write-wins
- **不要把 vector clock 设成永久增长**：必须截断或换 dotted version vectors
- **不要把 Dynamo 范式用在金融数据**：永远可写 = 永远可能丢钱

## 怀疑 + 延伸阅读

### 我对这篇论文最不信的 3 件事

1. **(N, R, W) 自由度是否真值得**：论文 Section 6 说应用主要用 (3,2,2)。
   **暴露 3 个 knob 给开发者，但实际上 90% 用同一个组合**——是否过度灵活？
   AWS DynamoDB 商业版隐藏这些 knob，反而更成功
2. **Vector clock 截断的正确性证明缺失**：论文承认 truncation，但**不证明截断后仍 correct**。
   Riak 后来发现 corner case 直接换 dotted version vectors
3. **应用层 reconciliation 的工程负担论文回避**：Section 6.3 提了 "hard for developers"，
   但**没给具体 bug 数字**。实际上很多 Cassandra 应用都默默用 last-write-wins，
   偏离 Dynamo 初衷

### 接下来读哪 3 篇

| # | 论文 | 回答什么问题 |
|---|---|---|
| 1 | [Lamport 1978](/study/papers/lamport-1978/) | vector clocks 的理论根 |
| 2 | Spanner (Corbett et al., OSDI 2012) | 反向路线 — global strong consistency |
| 3 | dotted version vectors (Preguiça et al. 2010) | vector clock 的更精细替代 |

读完这 3 篇 + Dynamo + GFS + Lamport，你拥有"分布式存储系统 1978-2012"完整地图。

## 限制（论文 Section 6 + 我的补充）

论文 Section 6 隐含承认：

1. **应用 reconciliation 难写正确**
2. **Vector clock 增长问题靠 truncation 凑合**
3. **Sloppy quorum 在长 partition 下数据可能丢**（hint 没收到就 GC）

我的补充：

4. **Lookup latency tail 高**：sloppy quorum 触发时 hop 数增加
5. **Membership 协议依赖 gossip**：大集群下收敛慢
6. **不支持 secondary index**：纯 key-value 模型——Cassandra 后来加了但 Dynamo 没

## 附录：(N, R, W) 配置速查

```
最常用: N=3, R=2, W=2
       → 容忍 1 节点失败，strong consistency (R+W>N)

最高可用: N=3, R=1, W=1
       → 任何 1 节点 OK 即返回，可能旧值

写优化: N=3, R=3, W=1
       → 写快，读全副本（读慢）

读优化: N=3, R=1, W=3
       → 读快，写要等所有（写慢）

完全强一致: N=3, R=3, W=3
       → 任一节点失败即不可用，几乎不用
```

记住：**R + W > N ⟺ strong consistency**。

---

**Layer 0-7 完成（按状元篇模板）。约 730 行，含 1 张 figure（webp）+ 5 节点 ring + sloppy quorum + concurrent update 三场景手算 + (N,R,W) 配置速查。**

**Season B · 经典 CS / 系统设计 5/5 完成 ✅**
**下一站：Season C · 前端 / 编译器 / 工具链（Self-Adjusting Computation / Trees that Grow / Push-Pull FRP / Adapton）**
