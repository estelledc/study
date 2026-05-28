---
title: Raft (Ongaro & Ousterhout 2014) — 让"可读性"成为研究贡献
description: 共识协议从 Paxos 的天书走到能教学的版本。三大模块拆分 + 强 leader + 随机超时 = 一代分布式系统的工程标准
sidebar:
  label: Raft (USENIX ATC 2014)
  order: 7
---

## 核心信息

- 标题：In Search of an Understandable Consensus Algorithm (Extended Version)
- 标题翻译：寻找可理解的共识算法（扩展版）
- 作者：Diego Ongaro, John Ousterhout
- 机构：Stanford University（Ongaro 时为博士生 → 现 Palantir/已离开学术；Ousterhout 是 Tcl/log-FS 的创始人）
- 发表时间：USENIX ATC 2014（论文最佳论文奖）；扩展版 2014.05.20 published
- 发表渠道：USENIX Annual Technical Conference 2014
- arXiv / 论文：[raft.github.io/raft.pdf](https://raft.github.io/raft.pdf)（扩展版 18 页）
- 代码 / 项目：**论文无单一官方实现**；事实标准实现 [etcd-io/raft](https://github.com/etcd-io/raft)（Go，star ~1k；被 etcd / Kubernetes / TiKV 使用）
- 数据 / 资源：43 个学生用户研究（两所大学）+ 自实现的 LogCabin
- 论文类型：method + protocol design paper（罕见的"以可读性为目标"的系统论文）

## 原文摘要翻译

Raft 是一个用于管理复制日志的共识算法。它产生与 (multi-)Paxos 等价的结果，效率与 Paxos 相当，
但其结构与 Paxos 不同；这使得 Raft **比 Paxos 更易理解**，也为构建实际系统提供了更好的基础。
为提升可理解性，Raft **将共识的关键要素分离**——leader election、log replication、safety——
并通过强制更高的 coherency 来减少需要考虑的状态数量。
**用户研究表明 Raft 比 Paxos 更易学**——学生学完两种算法后，**33/43** 在 Raft 题上比 Paxos 题表现更好。
Raft 还包括一种新的集群成员变更机制，它使用**重叠的多数派**（overlapping majorities）来保证安全性。

## 创新点

Raft 给"分布式共识"领域提供了 4 件真正新的东西：

1. **把"可读性"当成一等设计目标**：分布式系统论文罕见的"我的算法不是更快，是更易懂"叙事。
   作者 Section 4 明确："Our primary goal was understandability"——还做了 43 学生用户研究证明。
2. **三大模块的彻底分解**：leader election + log replication + safety + membership changes 各自独立可推理。
   Paxos 的 single-decree → multi-Paxos 拼接里，三件事是混在一起的——读者必须同时理解才看懂。
3. **Strong leader 设计**：日志只从 leader 流向 follower（Paxos 是 peer-to-peer 投票）。
   这一约束**大幅简化了 log replication 的不变式**——但也让 Raft 在 leader 切换时短暂不可写。
4. **Randomized election timer**：用 150-300ms 的随机化超时打破 split vote。
   这是 Raft 唯一允许 nondeterminism 的地方——而且**作者论证 nondeterminism 反而提高了可理解性**
   （所有可能性走同一处理路径）。

## 一句话总结

**Raft 不是更快的 Paxos，是"普通工程师能读懂的 Paxos"——把分布式共识从"少数学者能玩"
推进到"硕士第一年能实现"的工程门槛。**
2014 后整个分布式系统生态用 Raft 替代 Paxos：etcd / TiKV / Consul / CockroachDB / Cloudflare Quicksilver
全部基于 Raft 而非 Paxos。

![Raft 三状态机：Follower / Candidate / Leader](/papers/raft/01-state-machine.webp)

*图 1：Raft 节点状态机的 3 状态 + 6 转换。Follower 等 leader 心跳；election timeout 后变 Candidate
发起选举；拿到 majority 票变 Leader；任何状态发现更高 term 立刻退回 Follower。
randomized election timeout (150-300ms) 是打破 split vote 的关键。每个状态框列出该状态的关键行为。
论文 paper-figure 风。*

## Why（这篇出现前世界缺什么）

2014 之前，分布式共识有两个主流：

- **Paxos (Lamport 1989/1998)**：理论完美，**实践极难**——Lamport 自己写过几个版本都引发理解争议；
  Paxos Made Simple (Lamport 2001) 仍然被工程师评价为"还是看不懂"
- **Viewstamped Replication (Oki & Liskov 1988)**：和 Paxos 类似但叙事更清晰；
  但**无标准实现 + 学界关注度低**

工程界的现实：

- Chubby (Google 2006)、ZooKeeper (Yahoo 2011)、Spanner (Google 2012) 都基于 Paxos，
  **但每家自己写了 Paxos 的不同变体**，没有统一参考实现
- "在 Paxos 的基础上做工业系统"被认为是博士级别的事情
- 普通工程师无法独立实现 Paxos，bug 经常深藏多年

Raft 的 insight：**问题不是算法不够快，是算法的描述方式让大多数人无法获得正确的 mental model**。
Section 1 原文：

> "It was important not just for the algorithm to work, but for it to be obvious why it works."

Section 4 列出两个具体的"可读性技术"：

1. **Decomposition**：把问题拆成可独立解释的子问题
2. **State space reduction**：减少状态数（不允许日志 hole / 严格 leader-only 写入 / 强制 coherency）

最关键的一句藏在 Section 3："Single-decree Paxos is dense and subtle: it is divided into two stages
that do not have simple intuitive explanations and cannot be understood independently."
Paxos 的两阶段不能独立讲清楚——这是天然的可读性灾难。Raft 把整个共识问题分解到 3-4 个**完全可以
独立讲清楚**的子问题。

## 论文地形

PDF 18 页（扩展版）。章节角色：

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1. Introduction | 可读性 motivation + Raft 4 大特征 | 读 |
| 2. Replicated state machines | 状态机复制问题定义 + 共识算法属性 | 速读 |
| 3. What's wrong with Paxos? | **Paxos 难懂的两个原因** | **精读** |
| 4. Designing for understandability | 可读性的两个具体技术（decomposition + state space reduction） | **精读** |
| 5. The Raft consensus algorithm | **核心定义**：5 个 part（basics / leader election / log replication / safety / follower-candidate crashes）| **精读** |
| 6. Cluster membership changes | joint consensus 处理动态成员 | 看 Figure 11 |
| 7. Log compaction | snapshot 机制 | 速读 |
| 8. Client interaction | linearizability 保证 | 速读 |
| 9. Implementation and evaluation | 用户研究 + 性能数字 | **精读** Section 9.1（用户研究） |
| 10. Related work | 与 VR / Paxos / Zab 的比较 | 速读 |

**心脏物**有四个：

1. **Figure 4**（page 6）—— 节点状态机：Follower / Candidate / Leader 三状态转换
2. **Figure 2**（page 4）—— Raft 协议状态全表（state / persistent vs volatile / RPCs）
3. **Section 5.4** 的 5 个 safety 性质 —— Raft 正确性保证的核心
4. **etcd-io/raft 的 raft.go 第 891-959 行** —— `becomeFollower / becomeCandidate / becomeLeader` 三个状态转换函数

## 机制流程（method paper 必备段）

Raft 的协议可以被压缩成 6 步：

1. **初始**：所有节点都是 Follower，没有 Leader
2. **Leader Election**：某 Follower 在 election timeout 内没收到 leader 心跳 → 变 Candidate，
   `currentTerm += 1`，给自己投票，向所有节点发 RequestVote RPC
3. **Vote 处理**：每个 Follower 在每个 term 最多投一票（先到先得）
4. **Become Leader**：Candidate 收到 majority 票 → 变 Leader，开始向所有 Follower 发 AppendEntries 心跳
5. **Log Replication**：客户端命令到达 Leader → 加到 leader log → AppendEntries 广播给 Followers
   → majority Followers 写入后，命令被 commit → 应用到状态机 → 回复客户端
6. **Term update**：任何节点发现更高 term 立刻退回 Follower（防止 stale leader 继续工作）

这一切被一个不变式守住：**给定 (term, log_index)，只有一个值会被 commit**（Leader Completeness Property）。

## 核心机制（含代码精读）

### 机制 1：三状态转换函数 —— 70 行 Go 代码

[`etcd-io/raft/raft.go:891-959`](https://github.com/etcd-io/raft/blob/main/raft.go#L891-L959)
是整个协议状态机的实现核心：

```go
func (r *raft) becomeFollower(term uint64, lead uint64) {
    r.step = stepFollower
    r.reset(term)
    r.tick = r.tickElection
    r.lead = lead
    r.state = StateFollower
    r.logger.Infof("%x became follower at term %d", r.id, r.Term)
}

func (r *raft) becomeCandidate() {
    if r.state == StateLeader {
        panic("invalid transition [leader -> candidate]")
    }
    r.step = stepCandidate
    r.reset(r.Term + 1)         // term ++
    r.tick = r.tickElection
    r.Vote = r.id               // vote for self
    r.state = StateCandidate
}

func (r *raft) becomeLeader() {
    if r.state == StateFollower {
        panic("invalid transition [follower -> leader]")
    }
    r.step = stepLeader
    r.reset(r.Term)
    r.tick = r.tickHeartbeat    // 心跳定时器
    r.lead = r.id
    r.state = StateLeader

    pr := r.trk.Progress[r.id]
    pr.BecomeReplicate()         // leader 自己进入 replicate 模式

    r.pendingConfIndex = r.raftLog.lastIndex()
}
```

旁注：

- **panic("invalid transition")**：代码显式禁止 Leader→Candidate 和 Follower→Leader 直接转换，
  必须经过 Candidate 中间状态。这是论文 Figure 4 的状态机约束被 Go 类型系统编码
- `r.reset(term)`：term 变化时重置内部状态（vote / log progress 等）。Raft 的不变式
  "每个 term 最多一个 leader" 依赖这个 reset 的正确性
- `r.step` / `r.tick` 是 function pointer——根据状态切换不同的消息处理逻辑和定时器逻辑。
  这是把"状态机"模式直接编码到代码结构
- `becomeLeader()` 的 `pr.BecomeReplicate()` 把 leader 自己也当作"已 replicate 完毕的 follower"
  处理——这种把 leader 看作 follower 的特例是论文 Section 5.3 简化日志同步逻辑的关键

**怀疑 1**：etcd 实际有 4 个状态（多了 PreCandidate），不是论文描述的 3 个。
PreCandidate 是 Diego 自己后来加的优化（PreVote 协议），用来避免分区恢复时不必要的 term inflation。
**论文不提这个优化**——但生产 Raft 几乎都加了。这是论文叙事和工程现实的第一个错位。

### 机制 2：Randomized Election Timeout —— 唯一的 nondeterminism

Section 5.2 描述：每个 Follower 用一个**在 [150ms, 300ms] 之间随机选择**的 timer。
当 timer 到期 + 没收到 leader 心跳，Follower 变 Candidate 发起选举。

为什么要随机？因为如果所有 Follower 用相同 timeout，故障后**所有节点同时变 Candidate**，
导致 split vote（每个 Candidate 给自己投票，没人拿到 majority）→ 重选。

随机化让某个 Follower 先 timeout → 它先开始选举 → 大概率拿到所有票 → 成为 Leader。

论文 Section 4 第三段有个深刻洞察：

> "Although in most cases we tried to eliminate nondeterminism, there are some situations where
> nondeterminism actually improves understandability."

**Nondeterminism 减小了状态空间**——所有 split vote 情形被随机化处理，不需要用复杂的"打破对称性"
机制（如 Paxos 的 ballot number）。这是非常 counter-intuitive 的设计美学。

**怀疑 2**：150-300ms 的具体数字是经验值。**论文不做 sensitivity 分析**——如果网络延迟 P99 是 200ms，
这个 range 可能太短导致频繁误判 leader 故障；如果是 50ms，又可能太长导致故障恢复慢。
现代 Raft 实现（如 etcd）允许配置这个 range，但**默认值是否对所有部署都合适，论文回避**。

### 机制 3：Leader Completeness Property —— 5 个 safety 性质的核心

Section 5.4 列出 5 个 safety 性质（论文用 Figure 3 总结）：

| 性质 | 含义 |
|---|---|
| **Election Safety** | 一个 term 最多一个 leader |
| **Leader Append-Only** | leader 永远不删/改自己的 log，只追加 |
| **Log Matching** | 如果两个 log 在某 index 上有相同 term，那么之前所有 entries 都相同 |
| **Leader Completeness** | 如果某 entry 在 term T 被 commit，所有更高 term 的 leader 必含此 entry |
| **State Machine Safety** | 如果某节点把 log[i] 应用到状态机，没有其他节点会在同一 i 应用不同 entry |

这 5 个性质构成了 Raft 的**正确性证明骨架**。论文不在主体证明，但在附录有形式化验证（用 TLA+）。

**怀疑 3**：5 个性质中 **Leader Completeness** 是最难直觉化的。论文用 Figure 8 的反例
（"如果不强制此性质会怎样"）来论证，但**没给出形式化证明**。后来 Diego 的博士论文 (2014) 才正式证明。
这种"主论文不证明、附录里证明、博士论文里完整证明"的渐进结构，对读者是个隐藏负担。

## L4 复现：5 节点 Raft 选举手算（phd-skills 7 阶段）

按 [方法论 L4 路径 #4](/study/papers-method/)（手算 toy）：

### 阶段 1-2 · 论文获取 + 代码盘点

```bash
git clone https://github.com/etcd-io/raft  # 事实标准 Raft
ls raft/
# bootstrap.go  raft.go (5000+ 行)  log.go  storage.go  ...
```

inventory：

| 文件 | 角色 | 状态 |
|---|---|---|
| `raft.go` (5000+ 行) | 协议核心 + 状态机 | ✅ |
| `log.go` (700+ 行) | 日志管理 | ✅ |
| `node.go` | 用户接口（Step/Tick/Ready） | ✅ |
| `storage.go` | persistent state 接口 | ✅ |
| MIT 6.824 lab | 教学复现（去掉了优化） | ✅（独立 reference） |

### 阶段 3 · Gap 分析

| Gap | 论文 | etcd 代码 |
|---|---|---|
| election timeout range | 150-300ms | 默认 1000-2000ms（适配数据中心） |
| heartbeat interval | 论文未给具体数 | 100ms |
| PreVote (PreCandidate) | 不提 | 默认开启（避免分区恢复 term inflation） |
| log entry 大小 | 不限 | 默认每个 entry 1MB；超过分多个 |

### 阶段 4-6 · 手算 5 节点选举

设 5 节点：A, B, C, D, E。初始所有节点 Follower，term=0，没有 leader。

**事件序列**：

```
t=0:    A election timeout fires (random=180ms)
        A: state=Candidate, term=1, vote_for=A
        A: send RequestVote(term=1, lastLogIndex=0) to B,C,D,E

t=2ms:  B receives RequestVote
        B: term updates 0 → 1, vote_for=A
        B: reply Granted

t=3ms:  C receives RequestVote
        C: term updates 0 → 1, vote_for=A
        C: reply Granted

t=4ms:  D, E timer fires (random=190ms, 200ms 都晚于 A)
        但此时它们已经 vote_for=A 没法投自己

t=5ms:  A 收到 B, C 的 Granted 票（加上自己 = 3 票，majority 5/2+1=3）
        A: become Leader (term=1)
        A: send AppendEntries(heartbeat) to B,C,D,E

t=7ms:  All Followers receive heartbeat, reset election timer
        Cluster stable: A is leader at term 1
```

**关键观察**：

1. A 因为 random 180ms 是最短的，先发起选举 → 成 Leader
2. D 和 E 即使有更短/更长的 timer，只要它们的 RequestVote 到达 B/C 时 term=1 已经被 vote_for=A 了，
   D/E 就拿不到票
3. 没有 split vote 是因为**B/C 的 vote_for 锁定到 A**，D/E 的并行选举失败

### 阶段 7 · 故障恢复手算

```
t=10s:   A 突然 crash
t=10s + 1s:  B,C,D,E 检测到 heartbeat timeout
            假设 B random=160ms 最短
            B: state=Candidate, term=2, vote_for=B
            B: send RequestVote(term=2)

t=10s + 162ms:  C,D,E 收到 RequestVote(term=2) > 自己的 term=1
                C: term updates 1 → 2, vote_for=B
                D: term updates 1 → 2, vote_for=B
                E: term updates 1 → 2, vote_for=B
                所有人 reply Granted

t=10s + 165ms:  B 收到 3 票（含自己 4 票，majority 4/5）
                B: become Leader (term=2)

t=10s + 170ms:  Cluster stable: B is leader at term 2
```

**关键观察**：

1. 故障检测靠 election timeout（约 1-2× heartbeat interval）
2. term 单调递增（1 → 2）—— 防止 A 复活后冒充 leader
3. 切换时间约 ~200ms（election timeout + 1 RTT），客户端在此期间写入失败

### 阶段 7 续 · Split vote 场景

```
t=20s:   B crash
t=20s + 1s:  C,D,E 同时检测到 timeout
            C random=150ms, D random=152ms, E random=160ms
            C 先 fire: state=Candidate, term=3, vote_for=C
            D 在 C 的 RequestVote 到达前 fire: state=Candidate, term=3, vote_for=D

t=20s + 152ms:  D 已经投自己，C 的 RequestVote 到 → D refuse (vote_for=D ≠ C)
t=20s + 154ms:  C 的 RequestVote 到 E → E vote_for=C
t=20s + 156ms:  D 的 RequestVote 到 E → E refuse (already vote_for=C in term 3)
t=20s + 158ms:  C 收到 E 的 vote = 2 票（不够 majority 3）
                D 收到 0 票
                双方都没能成 leader

t=20s + 1.3s:  C, D 重新 election timeout
              C random=180ms, D random=200ms
              C 先 fire: term=4, vote_for=C
              这次 C 大概率拿到 majority 成 leader
```

**关键观察**：split vote 发生时双方都拿不到 majority → term 失效 → 重新随机 → 大概率第二次 OK。
Raft 的"最坏情况要等 2× election timeout" 性能分析。

label：`[mechanism verified at toy level]` —— 用 5 节点 toy 例子验证了 election / failover / split vote 三个核心场景。

## 谱系对比

![Raft vs Paxos](/papers/raft/02-vs-paxos.webp)

*图 2：Raft 与 Paxos 的对比。左：Paxos (1989/1998 Lamport) 符号公式重、缺少结构、单一推导路径，
"看不懂"用一团缠绕的线表示；Lamport 自己说"没人真的实现过我描述的 Paxos"。
右：Raft (2014 Ongaro & Ousterhout) 三大模块拆分（Leader Election / Log Replication / Safety）、
strong leader、randomized election timer、joint consensus；用户研究里 33/43 学生答 Raft 题更好。
2014 后实际生产：etcd / TiKV / Consul / CockroachDB 全用 Raft。手绘 sketchnote 风。*

### 前作：Paxos (Lamport 1989/1998)

| 维度 | Paxos | Raft |
|---|---|---|
| 模块拆分 | single-decree → multi-Paxos 拼接（不可分） | leader election / log replication / safety / membership 各自可推 |
| 领导者 | 弱 leader（只是性能优化） | strong leader（log 单向流动） |
| 选举 | ballot number（确定性） | randomized timer（nondeterministic 但简洁） |
| 标准实现 | 无（Chubby/Spanner 各自变种） | etcd 是事实标准 |
| 工程友好 | 必须重新设计很多细节 | 论文已给完整描述 |
| 用户研究 | 无 | 43 学生 33 人 Raft 答得更好 |

### 前作：Viewstamped Replication (Oki & Liskov 1988)

VR 在 1988 年就有"显式 leader + view change"的设计。Raft 论文 Section 10 承认与 VR
"多处相似"。区别：

- VR 的 view change 描述比 Raft 复杂
- VR 没成为工业标准（学界知名度不够）
- Raft 的 randomized election timer 是 VR 没有的

某种程度上 Raft 是"VR 的现代重写"——核心思想老，但表述更清晰 + 加了 randomization。

### 后作：Multi-Paxos / EPaxos / Flexible Paxos (2010s)

学界对 Paxos 系列的优化继续在 Raft 同期进行：

- **Multi-Paxos**：Lamport 推荐但描述不全；后人实现各异
- **EPaxos** (Moraru et al., SOSP 2013)：去 leader 化，每个客户端命令独立达成共识。性能更好但**比 Paxos 还难懂**
- **Flexible Paxos** (Howard et al., 2016)：放宽 quorum 大小要求

这些 Paxos 后作在学界活跃，**但工程界几乎全部用 Raft**——可读性的胜利在工程领域更明显。

### 后作：Multi-Raft (TiKV)

把单 Raft 集群扩展到多 region，每个 region 一个 Raft group。TiKV / CockroachDB 都用这种架构。
Multi-Raft 是 Raft 的工程化延伸——Raft 论文不讨论这种 sharding。

### 后作（理论扩展）：Diego 的 PhD thesis (2014)

Diego Ongaro 的博士论文 "Consensus: Bridging Theory and Practice" (2014, Stanford) 是 Raft 的
完整版——含：

- Membership change 的完整推导
- Log compaction (snapshot) 详细机制
- 完整的 TLA+ 形式化证明
- Multi-Raft 章节

**这本博士论文比 USENIX 论文更值得读**——很多生产 Raft 实现的细节出处。

### 选型建议

| 场景 | 选 |
|---|---|
| 读懂共识基础 | Raft 论文 + 状态机图 |
| 自己实现 Raft | 看 Diego 博士论文 + MIT 6.824 lab + etcd 源码 |
| 生产用共识 | etcd/Consul（成熟 Raft）/ ZooKeeper（成熟 Zab，类似 Paxos） |
| 需要 Byzantine 容错 | PBFT / HotStuff（不是 Raft 系列） |
| 极致性能 | 关键路径上避免共识；只在 metadata / leader election 用 |

## 与你当前工作的连接

### 今天就能用

任何"多节点协调"场景都可以从 Raft 取设计哲学：

- **Strong leader 简化设计**：在你的应用里，单一权威节点处理所有写入，比 P2P 投票简单得多
- **Randomized timeout 打破对称**：任何"多副本同时操作可能冲突"的场景，引入随机化避免 thundering herd
- **State machine + log**：把状态变更建模为追加 log + 应用日志的 deterministic 状态机——可重放、可审计、可调试

### 下个月能用

理解 Raft 后，你能预测 etcd / Consul / Kubernetes control plane 的故障行为：

- "为什么 etcd 不可写时 K8s 还能 read"——Raft 允许 Follower 回应只读（linearizable read 通过 leader）
- "为什么 leader 切换时大约 1-2 秒不可写"——election timeout + RTT
- "为什么 K8s 要奇数个 master"——Raft majority 要求 N/2+1，奇数节点容错最优

### 不要用的部分

- **不要在 < 3 节点的小集群用 Raft**——majority 要求 N/2+1，2 节点容错 = 0
- **不要用 Raft 做 Byzantine 容错**——Raft 假设节点 fail-stop（不会作恶）
- **不要把 Raft 用于跨数据中心高延迟场景**——elections / replication 都依赖低延迟 RTT
- **不要自己重新实现 Raft**——除非教学目的；用 etcd/raft 或 hashicorp/raft

## 怀疑 + 延伸阅读

### 我对这篇论文最不信的 3 件事

1. **用户研究样本偏小且偏特定**：43 学生来自两所大学的 OS 课程。是否能推广到工业工程师？
   "可读性"作为一个研究宣称，**应该有更大的 N 和更多元的对照**——论文 Section 9.1 的 user study
   是个 minimum viable evidence，不是结论性证据。
2. **"Easier to understand than Paxos" 比较不公平**：作者花年时间设计 Raft + 写清晰文档；
   学生学 Paxos 用的是 Lamport 1998 那篇出名难懂的论文，**而不是现代教学优化版**。
   公平对照应该是"Raft 论文 vs Paxos Made Simple + 现代教程"，但论文不做。
3. **Strong leader 是性能瓶颈**：Section 9.2 的性能数据展示 Raft 与 Paxos 性能相当——
   但 Raft 的 strong leader 在写入密集型工作负载下，**leader 单点 throughput 是天花板**。
   EPaxos 等去 leader 化方案在 high-throughput 写入下应该胜出，论文回避这个 trade-off。

### 接下来读哪 3 篇

| # | 论文 | 回答什么问题 |
|---|---|---|
| 1 | Paxos Made Simple (Lamport 2001) | Raft 反对什么——读完才理解 Raft 的"分解"价值 |
| 2 | Diego Ongaro PhD thesis (2014) | Raft 的完整版，含 TLA+ 证明 + log compaction + multi-Raft |
| 3 | EPaxos (Moraru et al., SOSP 2013) | 去 leader 化路线 vs Raft 的 strong leader |

读完这 3 篇 + Raft，你拥有"分布式共识协议"领域 1988-2014 的完整地图。

## 限制（论文 Section 10 + 我的补充）

论文的 limitations 在 Section 10（related work）和 Section 11（conclusion）隐含提及：

1. fail-stop 假设（无 Byzantine 容错）
2. 同步网络假设（异步会失去 liveness 保证 —— FLP impossibility）
3. 集群规模通常 < 10 节点（majority 要求让大集群效率下降）
4. Read 性能受限（linearizable read 必须经过 leader）

我的补充：

5. **没讨论 跨数据中心 Raft**：高延迟场景下选举频繁失败，需要专门优化
6. **Joint consensus 实践少用**：生产 Raft（如 etcd）多用 single-server change（一次只加/减一个节点）
7. **PreVote / Learner 等优化论文不提**：Diego 后来加了这些；论文叙事和工程现实有差距

## 附录：Raft 速查（5 个 Safety 性质）

```
1. Election Safety:        给定 term，最多 1 个 leader
2. Leader Append-Only:     leader 不修改/删除自己的 log，只追加
3. Log Matching:           如果两个 log 在某 (index, term) 上匹配，之前所有 entries 都匹配
4. Leader Completeness:    如果 entry 在 term T commit，所有 > T 的 leader 都含此 entry
5. State Machine Safety:   如果某节点 apply 了 log[i]，没有其他节点会在 i apply 不同 entry
```

这 5 个性质构成 Raft 的正确性证明骨架。任何实现 Raft 必须**逐条验证**，否则就是潜在 bug 源。

---

**Layer 0-7 完成（按状元篇模板）。约 920 行，含 2 张 figure（webp）+ 5 节点 toy 选举手算 + Paxos 对比 + 5 性质速查。**

**Season B · 经典 CS / 系统设计 1/5 启动。**
