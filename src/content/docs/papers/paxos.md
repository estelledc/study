---
title: Paxos 异步分布式共识
来源: Lamport "The Part-Time Parliament" TOCS 1998 + "Paxos Made Simple" SIGACT News 2001
论文年份: 1998
作者: Leslie Lamport
分支: theory-D
状态: 状元篇
关联笔记:
  - "[[boehm-gc]]"
  - "[[selinger-1979]]"
  - "[[volcano]]"
  - "[[rocksdb-lsm]]"
  - "[[snowflake]]"
---

# Paxos 异步分布式共识（1989/1998/2001）

> 一句话总结：在异步网络里，让 2f+1 个节点对一个值达成共识，即使其中 f 个节点宕机或消息任意延迟，也保证安全性（永不出现两个冲突的最终值）；做不到的只是活性（极端调度下可能永远选不出值——这是 FLP 定理决定的物理边界，不是协议缺陷）。

## 0. 历史定位

### 0.1 1989 那个时间点

把自己拉回 1989：

- **分布式系统是新学科**：Lamport 自己 1978 年才发表「Time, Clocks and the Ordering of Events」奠基论文，1985 年才有 FLP 不可能定理。
- **互联网刚起步**：ARPANET 1983 切到 TCP/IP，DNS 1985 才设计出来，整个公网的全部主机数大约一万台。
- **数据库厂商各做各的**：Oracle 6 没有真正的分布式事务，Tandem NonStop 用专有硬件做 fail-over，没有"通用共识协议"这种东西。
- **两阶段提交（2PC）已知有问题**：协调者宕机会阻塞，但当时没有更好的方案。
- **Viewstamped Replication 1988**：Oki 和 Liskov 在 PODC'88 提出 VR，是第一个真正意义上的"异步共识 + 状态机复制"协议，但被绝大多数人忽略。

Lamport 在 DEC SRC（Digital Equipment Systems Research Center）。他想问一个简单到极致的问题：**有没有一个最少假设的协议，能让一群可能宕机的节点对单个值达成不可撤销的共识？**

他的答案是 Paxos。但他用了一个"古希腊议会"的寓言把整篇论文包了起来——这个写法让 SRC 的 reviewer 集体看不懂，论文 1990 年投稿被拒，搁置了 8 年才在 1998 年正式发表（见 [Lamport 自序](https://lamport.azurewebsites.net/pubs/pubs.html#lamport-paxos)）。2001 年他又写了 *Paxos Made Simple* 重述一遍，标题就是认错——"我承认上一篇没人看懂"。

### 0.2 为什么这是 theory 分支 D 的开篇

`theory-D` 分支聚焦"系统正确性的形式化基础"，已经有的状元篇是 [[boehm-gc]]（保守式回收的可证明性）和 [[tofte-talpin-regions]]（编译期内存生命周期）。Paxos 是这一分支的另一极：它不是关于内存的，而是关于**多机一致性**的。两者的共同精神是"用形式化方法把一个看似软件工程问题转化为可证明的数学命题"——Boehm 把 GC 转化成 reachability 分析，Tofte-Talpin 把内存生命周期转化成 effect 推断，Lamport 把分布式状态机转化成共识 + 全序日志。

这一篇之后，theory-D 还会跟进 Raft（2014 易懂版）、Byzantine Paxos / PBFT（拜占庭场景）、Calvin（确定性事务）等。所有这些后续都把 Paxos 当作"地基论文"来引用。Calvin 见 [[calvin]]——它假设有一个共识层把请求定全序，那个共识层默认就是 Paxos / Raft 类协议。

### 0.3 时间线对照

- 1978 Lamport, *Time, Clocks and the Ordering of Events* — 分布式时序奠基
- 1979 Lamport, *State Machine Approach* — 复制状态机框架
- 1985 Fischer-Lynch-Paterson, *Impossibility of Distributed Consensus with One Faulty Process* — FLP 定理
- 1988 Oki-Liskov, *Viewstamped Replication* — 第一代实用异步共识协议
- 1989 Lamport, *The Part-Time Parliament* SRC TR — Paxos 草稿（被拒）
- 1990 Dwork-Lynch-Stockmeyer, *Consensus in the Presence of Partial Synchrony* — 部分同步模型
- 1998 Lamport, *The Part-Time Parliament* ACM TOCS — Paxos 正式发表
- 2001 Lamport, *Paxos Made Simple* SIGACT News — 简化重述
- 2006 Burrows, *The Chubby Lock Service* OSDI — Multi-Paxos 第一个工业化大型系统（Google）
- 2008 Chandra-Griesemer-Redstone, *Paxos Made Live* — Google 工程团队踩坑总结
- 2010 Junqueira-Reed-Serafini, *Zab: High-performance Broadcast for Primary-Backup* — ZooKeeper 的协议
- 2012 Corbett et al., *Spanner* — Multi-Paxos + TrueTime 的全球数据库
- 2013 Moraru et al., *EPaxos* — Egalitarian Paxos
- 2014 Ongaro-Ousterhout, *In Search of an Understandable Consensus Algorithm* — Raft

## 1. 共识问题：先把名词钉死

工业界把 "consensus" 这个词用得很泛——Kafka leader 选举叫 consensus，Redis Sentinel 也叫 consensus，连 Git 三方合并都有人叫 consensus。但 Paxos 论文里的共识有非常严格的形式定义。

### Definition 1（共识问题）

一组节点 $P_1, P_2, \ldots, P_N$ 中的若干个作为 **proposer** 提议值 $v_i$，所有节点最终需要 **chosen** 出唯一一个值 $v$，且满足三条性质：

1. **Agreement（一致性 / safety）**：任意两个节点 chosen 的值必须相同。换句话说，不存在节点 A chose v1 而节点 B chose v2 的情况。
2. **Validity（有效性）**：chosen 的值 v 必须是某个 proposer 真实提议过的值。不能凭空捏造一个 v。
3. **Termination（活性 / liveness）**：每个非故障节点最终都会 chose 某个值（不会永远卡住）。

这三条里，**前两条是 safety**（坏事永不发生），**第三条是 liveness**（好事最终会发生）。

FLP 定理（Fischer-Lynch-Paterson 1985）证明了：在异步网络里，只要可能有 1 个节点故障，就不可能有协议同时满足这三条。**Paxos 的取舍是放弃 termination 的强保证**：在异步极端调度下可能永远不 chose（活锁），但 safety 永远不破。Lamport 说 Paxos "almost always terminates"——这个 almost 是 FLP 定理强行刻在物理边界上的，不是工程实现的锅。

> 怀疑：Lamport 1990 用 Greek parliament 寓言写论文，被 SRC 拒稿 8 年。这种"娱乐性叙述"是阻力还是帮助？现代论文（Spanner / Raft）都不这么写了。如果当年没拒稿、协议早 8 年传播，工业界 Multi-Paxos 系统会不会提前到 1998 年而不是 2006 年才出现？又或者拒稿恰恰逼出了 *Paxos Made Simple*（2001）这个更易读的版本，反而是好事？

### Definition 2（ballot number n）

每个 proposer 发起的"提案轮次"用一个 ballot number $n$ 标识。$n$ 必须满足：

- **全序（total order）**：任意两个 ballot $n_1, n_2$ 都可比较。
- **每个 proposer 用过的 n 不重复**：可以用 `(round_id << bits | proposer_id)` 这种构造保证全局唯一。
- **单调递增**：每个 proposer 自己发的 n 必须比上一次大。

ballot number 的作用是给所有 proposer 的尝试一个全局排序，让 acceptor 能拒掉旧 ballot 的请求。**这个不变量是后面 safety 证明的支柱之一**。

### Definition 3（quorum）

quorum（法定多数集合）= 节点集合的任意子集 Q，满足 |Q| ≥ ⌊N/2⌋ + 1。当 N = 2f+1 时，quorum 大小至少是 f+1。

**最关键的性质**：任意两个 quorum 必相交（quorum intersection / pigeonhole）。证明很简单——两个 quorum 各自至少 f+1 个节点，总节点 2f+1，所以交集至少 |Q1| + |Q2| - N ≥ 2(f+1) - (2f+1) = 1 个节点。

这一条是 Paxos safety 证明的命脉。**所有"两 proposer 不会选出冲突值"的论证最终都化归到这个交集非空**。

> 怀疑：Paxos safety 证明依赖 quorum intersection（任意两 majority quorum 必相交）。如果改用 Byzantine 假设（节点可能撒谎而非只是宕机），quorum 就要从 (n+1)/2 涨到 (2n+1)/3，节点数从 2f+1 涨到 3f+1。这种"safety boundary 由故障模型决定"的现象，在 Lamport 1989 的论文里有没有暗示？他后来 1996 年做 Byzantine Paxos 是不是从这个直觉延伸出来的？

## 2. 角色与消息

Paxos 把所有节点的功能分成三种角色（一个物理节点可以同时扮演多种）：

- **Proposer**：发起提案，选 ballot n，提议值 v。
- **Acceptor**：投票者，记录自己 promise 过的最大 n 和 accept 过的 (n_a, v_a)。
- **Learner**：从 acceptor 集合学到 chosen 值。

消息只有 4 种（加 1 种 learn 通知）：

| # | 消息 | 方向 | 内容 |
|---|------|------|------|
| 1 | Prepare(n) | proposer → acceptors | "我想用 ballot n 跑一轮" |
| 2 | Promise(n, v_a, n_a) | acceptor → proposer | "我承诺不再接受 < n 的提案；我之前 accept 过的最大值是 (v_a, n_a)，没有就是 ⊥" |
| 3 | Accept(n, v) | proposer → acceptors | "请 accept 值 v" |
| 4 | Accepted(n, v) | acceptor → proposer + learner | "我已 accept (n, v)" |

只有这 4 种消息。整个协议的全部状态都靠这 4 种消息构造。

## 3. 协议主体

### Section 3.1 — Phase 1: Prepare / Promise

**Proposer 侧**：
1. 选一个新的 ballot $n$（必须比自己用过的所有 n 都大）。
2. 向所有 acceptor 广播 `Prepare(n)`。
3. 等待至少 quorum 个 acceptor 的 `Promise` 回复。

**Acceptor 侧**（收到 `Prepare(n)`）：
1. 如果 n ≤ 自己见过的最大 prepare ballot $n_{max}$，**拒绝**（可以发 NACK，也可以静默丢）。
2. 否则更新 $n_{max} = n$，回复 `Promise(n, v_a, n_a)`。其中 $(v_a, n_a)$ 是自己 accept 过的最高 ballot 的值和 ballot；如果从未 accept 过，就是 $(\bot, 0)$。
3. **持久化** $n_{max}$ 到磁盘（防宕机后违反承诺）。

Phase 1 的本质是 **proposer 占用 ballot n 这个槽位**，并打听过往 acceptor 的承诺历史。注意 Phase 1 不传具体的 v——v 是在 Phase 2 才决定的。

### Section 3.2 — Phase 2: Accept / Accepted

**Proposer 侧**（收到 quorum 个 Promise 后）：
1. 在所有 Promise 回复中找 $n_a$ 最大的那个对应的 $v_a$。
2. **如果有非空的 v_a**：proposer **必须**用这个 $v_a$ 作为本轮提议值 $v$（不能用自己原本想提的）。
3. **如果所有 v_a 都是 ⊥**：proposer 可以自由选 v（用自己 client 的请求值）。
4. 向所有 acceptor 广播 `Accept(n, v)`。
5. 等待 quorum 个 `Accepted(n, v)`。一旦收齐，**v 被 chosen**。

**Acceptor 侧**（收到 `Accept(n, v)`）：
1. 如果 n ≥ 自己当前的 $n_{max}$（注意是 ≥，不是 >），accept 这个提案：更新 $(v_a, n_a) = (v, n)$，持久化，回复 `Accepted(n, v)` 给 proposer 和所有 learner。
2. 否则拒绝。

第 2 步那个"必须用 v_a"是 Paxos 的灵魂。这条规则保证了**一旦某个 v 被 chosen 过，后续所有成功的 proposer 一定也会再次提议同一个 v**。这就是 safety 的来源。

### Section 3.3 — Learn

Learner 收到 quorum 个 `Accepted(n, v)`，就学到了 chosen 值 v。多个 learner 可以独立学习，无需互相通信。生产环境中通常让一个 distinguished learner 收齐后广播给其他 learner（节省消息复杂度从 O(QL) 降到 O(Q+L)）。

![Paxos 两阶段时序图](/papers/paxos/01-two-phase-protocol.webp)

> 怀疑：Phase 2 的 acceptor 接受条件是 $n \geq n_{max}$（含等号），而 Phase 1 的 promise 是严格 $n > n_{max}$。为什么不对称？我推测是因为 acceptor 在 Phase 1 已经 promise 过 n 了，Phase 2 同一个 n 来要求 accept 是合法延续。如果 Phase 2 也要求严格大于，会不会让协议根本无法终止？这种"非对称的边界条件"在论文里好像没用很大篇幅解释。

## 4. Safety 证明

接下来是 Paxos 最美的部分：**为什么这套规则能保证 agreement**。

### Theorem 1（Safety）

如果某个值 v 在 ballot $n_v$ 被 chosen，那么对于所有 ballot $n' > n_v$，凡是被 chosen 的值都是 v。

**证明思路**（按 ballot number 归纳）：

设 $S_n$ 是事件 "ballot n 选中了值 v"。我们要证明：如果 $S_{n_v}$ 发生，对所有 $n > n_v$ 凡 $S_n$ 发生则其值也是 v。

归纳起点 $n = n_v + 1$。考虑 ballot $n$ 的 proposer P'。它在 Phase 1 收到一个 quorum $Q'$ 的 Promise。

ballot $n_v$ 的 chosen 用了一个 quorum $Q_v$ 的 Accepted。**根据 Definition 3，$Q' \cap Q_v$ 至少有 1 个 acceptor a**。

a 在 ballot $n_v$ 时 accept 了 v。ballot $n$ 的 Prepare 来到时，a 必然记得自己 accept 过 (n_v, v)（持久化保证）。所以 a 给 P' 的 Promise 里 $(v_a, n_a)$ 至少包含 $(v, n_v)$。

P' 收到 quorum 的 Promise，里面**至少**包含来自 a 的 (v, n_v)。其它 acceptor 可能也回了 (v_a', n_a') 但 $n_a'$ 不可能大于 $n_v$ 而 $v_a' \neq v$——否则那个值早就违反归纳假设了。

所以 P' 在所有 promise 中找最大 n_a 对应的 v_a，必然就是 v（或者一个 ballot 在 $n_v$ 之后但值也是 v 的 v_a'）。**因此 P' 在 Phase 2 必须用 v 作为提议值**。归纳完成。

### Lemma 1（P2c 性质）

> 对于任意 ballot $n$ 的 proposer P，设它在 Phase 2 提议 v；如果存在某个 v' 在 ballot $n' < n$ 已被 chosen，则 v = v'。

这是上述归纳的核心步骤的形式化。Lamport 在 *Paxos Made Simple* 里把这条命名为 **P2c**，并说"协议设计的全部努力就是为了让 P2c 成立"。

### Section 4 — Liveness 与 dueling proposers

Safety 在异步模型下永远成立。但 **liveness 不保证**。

**dueling proposers** 场景：

1. Proposer A 用 n=1 跑 Phase 1，收齐 promise。
2. 在 A 跑 Phase 2 之前，Proposer B 用 n=2 跑 Phase 1，acceptor 把 promise 升级到 2，A 的 Phase 2 Accept 全被拒。
3. A 重试用 n=3 跑 Phase 1，B 的 Phase 2 又被拒。
4. 循环往复，**永不 chose**。

这就是 FLP 定理在 Paxos 里的具体体现。解决方案：

- **leader 选举**（Multi-Paxos）：选一个独占 proposer，其他人不发 prepare。
- **随机退避**（randomized backoff）：proposer 失败后等一个随机时间再试，概率上避免共振。
- **部分同步假设**（Dwork-Lynch-Stockmeyer 1990）：假设网络最终稳定，则 Paxos 在稳定后必然终止。

Spanner 和 Chubby 都用 leader + lease 的方式实践化。**生产环境的 Paxos 几乎都是 Multi-Paxos with leader**，纯 single-decree Paxos 反而少见。

## 5. Multi-Paxos

### Section 5.1 — 多 instance

实际系统要的不是"对一个值达成共识"，而是"对一个**操作日志**达成共识"。Multi-Paxos 把单个 Paxos 实例扩展到 N 个 instance，每个 instance 决定日志中的一个 slot。

最朴素的做法：每个 slot 跑一个完整的 single-decree Paxos。问题：每个 slot 至少 2 RTT（Phase 1 + Phase 2），开销爆炸。

### Section 5.2 — leader optimization

观察：如果同一个 leader 长期占用，它的 Phase 1 ballot n 不会变；那么对未来所有 slot，**Phase 1 可以一次性跑完**，每个新 slot 只需要 Phase 2 一次 RTT。

具体做法：
1. Leader 选举：用一轮 Paxos 选出 leader。
2. Leader 跑一次 Phase 1，对**所有未来 slot** 一次性占住 ballot n。
3. 后续每个 slot 只跑 Phase 2：leader 收到 client 请求 → Accept(n, slot, v) → quorum Accepted → chosen。
4. 如果 leader 失联，重新选一个，新 leader 用更大的 n 跑 Phase 1。

这就是 Chubby、Spanner、ZooKeeper（Zab）、TiKV 等所有工业系统的实际形态。**单 RTT 写入 + 0 RTT 本地读（leader lease 内）** 是 Multi-Paxos 的工程性能指标。

> 怀疑：Lamport 1998 的论文里 Multi-Paxos 几乎只一句话提到（"重复运行 Paxos 实例即可"），但工业界 100% 的实现都是 Multi-Paxos。这说明论文里的 single-decree Paxos 是"教学版"，而 Multi-Paxos 是"工业版"——这种"论文里简化、实现里复杂"的现象，在系统论文里是常态吗？同样的事情在 [[volcano]]（Volcano 论文也是把执行模型抽象到极简，工业里大量打补丁才能跑）和 [[selinger-1979]]（Selinger 论文里 cost model 极简，Oracle CBO 实际几万行 if-else）里也见过。

### Section 5.3 — membership change

论文里 Lamport 没讲怎么动态加节点 / 减节点。后续 Stoppable Paxos（Lamport-Malkhi-Zhou 2008）才系统化解决。Raft 论文专门用一章讲 joint consensus，是直接补 Paxos 这个洞。

## 6. 工业实现 Genealogy

![Paxos 家族 + 工业系统](/papers/paxos/02-genealogy.webp)

### 6.1 Google Chubby（2006）

Mike Burrows 在 OSDI'06 的 *The Chubby Lock Service for Loosely-Coupled Distributed Systems* 是 Paxos 第一个公开的大规模工业部署。Chubby 用 Multi-Paxos 实现一个 5 节点的 lock service，给 Google 内部所有需要分布式锁、leader election、metadata 存储的系统用（GFS/MapReduce/Bigtable 全是它的 client）。Burrows 这篇论文有个经典论断："There is only one consensus protocol, and that's Paxos. All other approaches are just broken versions of Paxos."（但这话被 Raft 团队 2014 年挑战了）。

后续 Chandra-Griesemer-Redstone *Paxos Made Live*（PODC 2007）讲了 Google 工程团队踩的坑——磁盘故障如何处理、leader 切换的边界条件、伪代码到生产代码的距离。这篇是任何想真正实现 Paxos 的人必读。

### 6.2 ZooKeeper / Zab（2010）

Yahoo 的 ZooKeeper（Hunt-Konar-Junqueira-Reed OSDI'10）选择不直接用 Paxos，而是发明 Zab（ZooKeeper Atomic Broadcast）。Zab 的设计思想接近 Paxos，但额外保证 **primary order**：同一个 primary 发的事务在所有 follower 上按顺序回放。这是 Zab 与 Multi-Paxos 的关键差异——后者只保证 chosen 顺序一致，不保证 primary 视角的局部顺序。

### 6.3 Spanner（2012）

Google Spanner（Corbett et al. OSDI'12）是 Paxos 在地理分布式数据库里的应用。每个 Paxos group 管理一段 key range，组内 5 节点（跨数据中心）跑 Multi-Paxos。Spanner 的真正创新在 TrueTime 上（用原子钟 + GPS 提供有界时钟误差），但底层日志复制还是 Paxos。

### 6.4 etcd / consul（2013-2014）

CoreOS 的 etcd 和 HashiCorp 的 consul 都选了 **Raft** 而不是 Paxos。原因是 Raft 论文（Ongaro-Ousterhout 2014）显式宣称 "more understandable than Paxos"，且提供了完整的 leader election、log replication、membership change、log compaction 设计，工程友好度极高。这两个系统是云原生时代分布式协调的事实标准。

链接示意（etcd raft 模块入口）：
[`https://github.com/etcd-io/etcd/blob/c0d1e74da1ef62893cd4e9b3ce4cb88a4f9b4e1d/raft/raft.go`](https://github.com/etcd-io/etcd/blob/c0d1e74da1ef62893cd4e9b3ce4cb88a4f9b4e1d/raft/raft.go)

链接示意（hashicorp/raft 主文件）：
[`https://github.com/hashicorp/raft/blob/8b85c7f7c3a2f1e8d9c8b2a6e4f1d3e9c5a2b7e8/raft.go`](https://github.com/hashicorp/raft/blob/8b85c7f7c3a2f1e8d9c8b2a6e4f1d3e9c5a2b7e8/raft.go)

### 6.5 TiKV / CockroachDB

TiKV 选择 Multi-Raft：把 key space 切成多个 region，每个 region 跑一个独立的 Raft group。同样思路在 CockroachDB 里。这种"分片 + 独立共识 group"是大规模分布式 KV 的通用做法。

链接示意（TiKV 的 peer.rs，每个 raft group 一个 peer）：
[`https://github.com/tikv/tikv/blob/4f3a2c8b9d6e7f1a5c3b9e8d2a4f6c1b7e9d3a5c/components/raftstore/src/store/peer.rs`](https://github.com/tikv/tikv/blob/4f3a2c8b9d6e7f1a5c3b9e8d2a4f6c1b7e9d3a5c/components/raftstore/src/store/peer.rs)

### 6.6 Cassandra LWT

Cassandra 2.0（2013）的 light-weight transaction（LWT）用 single-decree Paxos 实现条件写（compare-and-swap）。这是少见的"在最终一致 NoSQL 上贴一个强一致 Paxos 通道"的设计——大多数操作走最终一致的 quorum read/write，只有 IF NOT EXISTS / IF v = ... 这类条件操作走 Paxos。代价是 LWT 慢（4 RTT），所以只在必要场景用。

### 6.7 与 [[snowflake]] / [[rocksdb-lsm]] / [[volcano]] / [[selinger-1979]] 的对照

- [[snowflake]] 的多机协调用的是基于 FoundationDB 的 transaction layer（FDB 内核也是 Paxos 系），它把 Paxos 隐藏在 metadata service 里。
- [[rocksdb-lsm]] 是单机存储引擎，没有共识；但 TiKV 在它上面叠 Raft，所以 RocksDB + Raft 是工业组合。
- [[volcano]] 讲的是单机查询执行模型；分布式 SQL 引擎（Spanner SQL / TiDB / CockroachDB）把 Volcano-style 算子和 Paxos/Raft-replicated 存储拼在一起。
- [[selinger-1979]] 讲的是单机查询优化；分布式优化器需要考虑 Paxos group 的 region 分布，是 Selinger 模型的多机扩展。

## 7. 限制与代价

把 Paxos 当作万灵药是工程灾难。它有非常具体的局限：

1. **论文太难懂**——这是 Lamport 自己承认的。即便 *Paxos Made Simple* 也只是相对简单。Raft 论文 2014 用大量篇幅论证"我们比 Paxos 易懂"，并做了用户研究（Stanford 学生看完后做题对比）证明这一点。

2. **Liveness 不保证**——FLP 定理决定。dueling proposers 在异步极端调度下会活锁。生产环境必须用 leader + lease + 随机退避才能让活锁概率降到可忽略。

3. **Leader 切换的实现复杂度极高**——*Paxos Made Live* 一整篇讲的就是这个。新 leader 必须用更大的 ballot 跑 Phase 1，处理 split-brain，处理"上一任 leader 还没死透"等场景。生产代码里 leader 切换路径占 30-50% 的代码量。

4. **Membership change 论文没讲**——Lamport 1998 论文只讨论固定节点集合。动态加减节点要等到 Stoppable Paxos（2008）和 Vertical Paxos（2009）。Raft 论文专门用一章 joint consensus 解决这个。

5. **性能 latency 至少 1 RTT（Multi-Paxos with leader）或 2 RTT（leaderless single-decree）**——这是网络往返的物理下限。跨地域部署时（比如 Spanner 跨大洲）每次 commit 几十毫秒，不可避免。

6. **写吞吐被 leader 单机带宽 cap**——所有写都要过 leader，leader 是瓶颈。EPaxos / 各种 leaderless 变种就是为了缓解这一点（牺牲 latency 换吞吐）。

7. **状态机要求确定性**——日志复制只复制操作，每个节点本地回放生成状态。任何不确定性（time.Now() / random / 浮点 NaN 顺序）都会让节点状态分叉。Paxos 保证日志一致，不保证状态一致——后者要应用层自己控制。

8. **磁盘持久化是性能/正确性的拐点**——acceptor 的 promise 和 accept 必须 fsync 到磁盘才能回复，不然宕机后违反承诺，safety 就破。fsync 是几毫秒级开销，对吞吐冲击很大。SSD 时代缓解了这个问题，但仍然是热点。

> 怀疑：Raft 2014 是 Paxos 的"易懂版"还是不同协议？Diego Ongaro 论文说 Raft 在 leader election 用 randomized timeout、log replication 用 strong leader、membership change 用 joint consensus，这些都跟 Paxos 不同。但本质都是 quorum + 全序 ballot。我倾向于认为 Raft 是 Paxos 的"特定参数化 + 工程精炼"——它锁死了 Multi-Paxos 的诸多自由度（leader 必须是 majority log latest 的节点、ballot 全局严格递增等），换来了实现的可读性。这种"理论极简 + 工程加约束"的关系，跟 Standard ML（小核心）vs OCaml（大工程语言）的关系类似。

## 8. 学到什么

回到学习主线——这篇论文给我的核心 takeaway：

### 8.1 quorum intersection 是分布式安全性的母定理

只要协议保证"任意两次成功操作都经过两个相交的 quorum"，且交集中的节点持久化记忆，就能保证 safety。这条原则在 Paxos / Raft / Zab / VR / EPaxos / Byzantine Paxos 里**全部成立**——具体细节不同，但内核都是同一个 pigeonhole。

### 8.2 safety 与 liveness 是不同维度的属性

FLP 定理告诉我们：异步 + 故障容错 + 共识三选二。Paxos 选 safety + 故障容错，丢 liveness 强保证。**永远不要混淆 safety 和 liveness**——一个协议号称"快"通常是 liveness 改进，号称"对"是 safety 保证。所有"我有更快的共识协议"宣称都要先看它在最坏情况下还能不能保 safety。

### 8.3 论文易读性本身是 ROI 极高的工程

Paxos 1989 草稿被拒 8 年的最大教训：写得人看不懂的论文，影响力会被腰斩。Raft 2014 的"易懂"宣言不是噱头，而是真把工业界从 Paxos 阵营拉走了一半。**这一点对我自己写笔记也有借鉴**——零基础学习者读不懂的笔记，等于没记。所有从日常类比开始、有图、有反例、有怀疑段的笔记，长期价值远高于堆术语的"完整笔记"。

### 8.4 关联到我的笔记体系

- [[boehm-gc]]：保守式 GC 的 safety 论证依靠 reachability + over-approximation；Paxos 的 safety 依靠 quorum intersection。两者都是"用集合论保证不出错"。
- [[tofte-talpin-regions]]（如果 wiki 已索引）：编译期 region 推断把内存生命周期形式化；Paxos 把分布式状态变化形式化。
- [[selinger-1979]]：query planner 把 cost 形式化；Paxos 把共识形式化。"形式化是地基论文的通行特征"。
- [[volcano]]：执行模型抽象到极简（pull-based iterator）；Paxos 抽象到极简（4 种消息）。极简后给工业实现留改造空间。
- [[rocksdb-lsm]]：单机存储；Paxos 给它加分布式层就是 TiKV / CockroachDB。
- [[snowflake]]：云数仓的 metadata 用 FoundationDB（FDB 内核 Paxos 系）。

### 8.5 下一步该读什么

- *Paxos Made Live*（Chandra-Griesemer-Redstone 2007）——任何要实现 Paxos 的人必读。
- *In Search of an Understandable Consensus Algorithm*（Ongaro-Ousterhout 2014, Raft 论文）——对照 Paxos 看，理解"工程精炼"的意义。
- *Calvin: Fast Distributed Transactions for Partitioned Database Systems*（Thomson et al. SIGMOD 2012）——见 [[calvin]]。
- *Spanner: Google's Globally-Distributed Database*（Corbett et al. OSDI 2012）——TrueTime + Multi-Paxos 的合奏。
- Lamport 自己的 TLA+ 课程——Paxos 的形式化模型在 TLA+ 里只有几十行，看完会对协议有完全不同的理解。

## 8.6 类比的脚手架：Paxos 在日常里像什么

零基础读 Paxos 最大的障碍是抽象。我自己反复用过几个类比脚手架，记下来给以后的自己：

- **班级里订一份外卖**：30 个同学要决定一家店。班长（proposer）提议"麻辣烫"。如果一半以上同学（quorum）同意，就定这家。这是 single-decree。问题是如果两个班长同时提，会冲突——所以引入 ballot：晚提的覆盖早提的。这个类比能讲清 Phase 2，但讲不清 Phase 1 为什么需要——Phase 1 是为了在多 proposer 并发时，让晚来的 proposer 先承诺"我会用早 proposer 提过的值"。
- **会议室预订**：每个时段是一个 slot，预订系统要决定每个 slot 给谁。Multi-Paxos 就是这种"每个时段独立共识"的形态。
- **结婚誓词**：一旦 chosen，无法反悔。新 proposer 进来不能改写历史，只能延续——新 proposer 的"自由意志"在 Phase 1 收到 promise 后就被剥夺了，必须沿用旧值。

这三个类比合起来，能让一个零基础的人 30 分钟内对 Paxos 有粗略直觉。再读论文就不会被术语压垮。

## 8.7 一句话回顾每一节

把全文压成一行行的电报，方便复习时秒过：

- §0 历史定位：FLP 1985 → Paxos 1989 草稿 → 1998 TOCS → 2006 Chubby 工业化。
- §1 共识三性质：agreement / validity / termination；Paxos 牺牲 termination 强保证。
- §2 三角色四消息：proposer / acceptor / learner + prepare / promise / accept / accepted。
- §3 两阶段：Phase 1 锁 ballot 顺序 + 打听历史；Phase 2 锁值。
- §4 safety 证明：依赖 quorum intersection；P2c 是核心 lemma。
- §5 Multi-Paxos：leader + 跳过 Phase 1 = 单 RTT 写。
- §6 工业 genealogy：Chubby / Spanner / ZooKeeper / etcd / TiKV / Cassandra LWT。
- §7 限制：8 条具体局限，性能 / liveness / leader 切换 / membership 都是坑。
- §8 takeaway：quorum 是母定理；safety vs liveness；论文易读性是 ROI。

## 9. 备忘：常见误解清单

最后留一份给未来自己的"提醒清单"——这些是 Paxos 学习者经常踩的坑：

1. **"Paxos 解决拜占庭故障"**：不。Paxos 只解决 crash-stop 故障（节点宕机或消息丢失/延迟）。拜占庭故障要 Byzantine Paxos / PBFT，节点数从 2f+1 涨到 3f+1。

2. **"chosen 之后立刻全网知道"**：不。chosen 是逻辑事件——只要 quorum 个 acceptor accept 了，就 chosen 了。但 learner 还需要时间从 acceptor 那里学到这件事。chosen vs learned 是两个时刻。

3. **"Multi-Paxos 就是 N 个 single-decree 拼起来"**：朴素实现是这样，但工业 Multi-Paxos 都做了 leader 优化，省掉重复的 Phase 1。

4. **"Paxos 等于 Raft"**：内核相似（quorum + 全序 ballot），但接口、leader 规则、membership change 处理都不同。生产代码不可互换。

5. **"Paxos 保证强一致读"**：默认 Paxos 只保证写日志的 chosen 顺序，读路径要应用层自己保证（leader read with lease / quorum read / read-after-write）。Spanner 的 external consistency 是建立在 Paxos + TrueTime + 工程协议之上的额外承诺。

6. **"acceptor 数 = 容错 f + 1"**：不。**总节点数** 2f+1，quorum 大小 f+1，能容忍 f 个故障。容易混淆"quorum 大小"和"容错节点数"。

7. **"3 节点比 5 节点弱"**：3 节点容忍 1 故障，5 节点容忍 2 故障。但 quorum 大小都是 majority，3 节点 quorum=2，5 节点 quorum=3。一般 3 节点足够内部高可用，5 节点用于生产关键路径。

8. **"换 leader 期间服务不可用"**：是的，这段窗口（一般几百毫秒到几秒）是 Multi-Paxos 的固有代价。Spanner 用 lease + paxos group 切换 + multi-region failover 把可用性影响压到秒级。

9. **"持久化只是为了崩溃恢复"**：不止。acceptor 持久化的 promise 和 accept 是 safety 证明的物理载体——它告诉重启后的 acceptor "你之前承诺过什么不能反悔"。如果用纯内存，节点重启后丢了承诺记录，可能在 Phase 1 给两个不同 ballot 都发 promise 而内容矛盾，safety 立刻破。

10. **"日志可以无限增长"**：理论上可以，工程上不行。Paxos 论文没讲 log compaction，但 Multi-Paxos 实现都需要 snapshot + log truncation。Raft 论文专门一章讲 log compaction，可视为对 Paxos 这个洞的工程补全。

## 10. 给未来自己的 checklist

读 Spanner / TiKV 源码或自己实现 Paxos 时，对照这张表自检：

- [ ] ballot number 是否全局唯一 + 严格递增？
- [ ] acceptor 的 promise 和 accept 是否 fsync 到磁盘？
- [ ] proposer 在 Phase 2 是否正确处理"必须用最大 n_a 对应的 v_a"？
- [ ] leader 切换时新 leader 是否用更大的 ballot 跑过 Phase 1？
- [ ] 状态机回放是否完全确定？time / random / map iteration 顺序有没有泄漏？
- [ ] log compaction 与 snapshot 是否处理了"snapshot 后 follower 落后"的场景？
- [ ] membership change 是用 joint consensus 还是 single-step？是否有"两个 majority quorum 不重叠"的窗口？
- [ ] 网络分区时 minority 侧是否会拒绝写（避免 split-brain）？
- [ ] client 重试 + idempotency token 是否避免重复执行？
- [ ] read 路径是 leader read with lease、quorum read 还是 stale local read？语义边界是否文档化？

---

读完一遍是让我承认"我以为我懂分布式"是错的。读完两遍才开始看出 quorum intersection 的轮廓。读完 *Paxos Made Live* 才明白工业实现和论文之间的鸿沟。这篇笔记是给 6 个月后的自己的——届时读到 Spanner / TiKV 源码时，能直接回到这里查 quorum 与 ballot 的不变量定义。

Lamport 在 Greek parliament 寓言里把 acceptor 比作"懒散的议员们"——投了票就走，不参加后续讨论。这个比喻其实比"严谨的状态机"更接近实际生产环境：节点会消失、会延迟、会重启。Paxos 的伟大不在于"完美协议"，而在于**承认网络是混乱的，然后用最小的假设给出最强的保证**。

## 11. 复盘：为什么把 Paxos 放在 theory-D 开篇

从笔记体系视角，状元篇的排序本身就是判断。把 Paxos 放在 theory-D 的 Season R-1 开篇，是因为：

- Paxos 是后续大量分布式论文的"地基" — Spanner / Calvin / Raft / EPaxos / PBFT 全部从这里发散。先读地基，后读子嗣，比反着来高效得多。
- Paxos 的形式化思路（quorum intersection + 全序 ballot + 持久化承诺）是一种"思想模板"——读懂了它，看 Raft / Zab / VR 都能秒进入状态。
- Paxos 论文本身的难懂特征是反向教材：它教会我"零基础读论文要先建脚手架（类比/图/反例）"，这个 meta-技能会反哺后续每一篇 theory 论文的阅读节奏。
- Paxos 与 [[boehm-gc]] / [[tofte-talpin-regions]] 在 theory-D 内部形成三角：内存 safety、生命周期 safety、共识 safety。三者的论证结构（不变量 + 归纳 + 集合论）几乎完全平行，相互印证。

下一篇（theory-D 的下一站）我会读 Raft 论文，把"易懂版重写"的工程动机彻底搞清；再下一篇是 PBFT，把故障模型从 crash-stop 升到 Byzantine 看 quorum 怎么变。这条线读完，对系统正确性的形式化基础就有比较完整的纵向认知。

—— 状元篇 done。
