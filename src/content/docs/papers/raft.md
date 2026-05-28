---
title: Raft 可理解的共识算法
来源: Diego Ongaro & John Ousterhout, "In Search of an Understandable Consensus Algorithm (Extended Version)", USENIX ATC 2014
论文年份: 2014
作者: Diego Ongaro, John Ousterhout
分支: theory-D
状态: 状元篇
关联笔记:
  - "[[paxos]]"
  - "[[selinger-1979]]"
  - "[[volcano]]"
  - "[[snowflake]]"
  - "[[calvin]]"
  - "[[rocksdb-lsm]]"
sidebar:
  label: Raft (USENIX ATC 2014)
  order: 7
---

# Raft 可理解的共识算法（Ongaro & Ousterhout 2014）

> 一句话总结：把 Paxos 那个让所有读者头痛的"对称多 proposer / 多 acceptor / 隐式 leader"协议，**显式拆成 leader election / log replication / safety 三个子问题**，每个子问题都用强约束（强 leader / 全局严格递增 term / 一致性检查 RPC）换可读性。USENIX ATC 2014 拿了最佳论文奖，工业界 10 年内被 etcd / Consul / TiKV / CockroachDB / Kafka KRaft 全面采纳，事实上替代了 Paxos 的工业地位。

## 0. 历史定位

### 0.1 把自己拉回 2013-2014

Raft 的草稿在 2013 年被 Diego Ongaro 拿出来给 Stanford OS 课的学生当教材。那是一个非常具体的时间点：

- **Paxos 已经发表 25 年**。Lamport 1989 年写出第一稿，1998 年发表，2001 年又写了 *Paxos Made Simple* 自承"上一篇没人看懂"。
- **工业界陆续踩坑 Multi-Paxos**。Google Chubby（2006）、Spanner（2012）已经在生产跑 Multi-Paxos，但 *Paxos Made Live*（Chandra-Griesemer-Redstone 2008）公开承认论文到工业实现之间的鸿沟巨大。
- **替代品在涌现但都不是 Paxos**。ZooKeeper 的 Zab（2010）在 [primary backup atomic broadcast](https://github.com/apache/zookeeper) 上做共识，etcd 的早期版本（2013 年 6 月开源）一开始用的就是 Raft 草稿。
- **教学需求强烈**。MIT 6.824、Stanford CS244B、CMU 15-440 的助教们普遍反映学生看不懂 Paxos——不是看不懂证明，而是看不懂"协议在实际系统里怎么跑"。
- **博士论文动机**。Ongaro 的博士论文（同年，Stanford）包含 Raft + LogCabin C++ 实现 + TLA+ 形式化证明，整体 200 多页。

Ongaro 与 Ousterhout（Tcl 语言、log-structured FS 的创始人，2014 年时在 Stanford）的核心宣言：**可理解性本身是研究贡献**（understandability as a first-class research goal）。论文 Section 1 直接写：

> *"We believe that Paxos is exceptionally difficult to understand."*

这在系统论文里是非常罕见的——当时的 venue 主流认为协议只要正确就行，可读性是教科书的事。Raft 把"可读性"当成 evaluation 的一项，做了 **43 个学生的对照实验**（Section 14）：让两组学生分别学 Paxos 和 Raft，然后做同一份 quiz，Raft 组平均分高 23 分（满分 60）。这是历史上第一篇用人因实验当 evaluation 的共识论文。

### 0.2 为什么这是 theory 分支 D 的下一篇

`theory-D` 分支的主线已经从 [[boehm-gc]]、[[tofte-talpin-regions]]、[[paxos]] 走过——三篇论文的共同精神是"把一个看似软件工程的问题转化为可证明的数学命题"。Raft 是这条线的工程化转折点：它不是从"形式化"出发的论文，但它把 Paxos 的形式化结果**重新参数化**，让协议可以直接抄到代码里。

换一个角度：

| 论文 | 核心命题 | 形式化深度 | 工程可抄性 |
|---|---|---|---|
| Paxos 1998 | 共识可以在异步网络下做到 safety | 极高（每条性质都有证明） | 低（Multi-Paxos 一句话提过） |
| VR 1988 | primary-backup + view change 是可以做到 linearizable 的 | 中 | 中（被 ZooKeeper 借鉴） |
| Raft 2014 | 共识可以拆成三个子问题分别教 | 中（TLA+ 在博论里，论文主体没放） | 极高（Section 5 = 16 页伪代码） |

[[paxos]] 是地基，Raft 是地基上能直接住人的房子。这一篇之后，theory-D 还会继续 Calvin（[[calvin]] 已写）、PBFT、EPaxos、HotStuff 等。

### 0.3 时间线对照

- 1985 Fischer-Lynch-Paterson, *Impossibility of Distributed Consensus* — FLP 定理
- 1988 Oki-Liskov, *Viewstamped Replication* — 第一代实用异步共识
- 1989/1998 Lamport, *The Part-Time Parliament* — Paxos
- 2001 Lamport, *Paxos Made Simple* — Paxos 简化重述（仍被吐槽难懂）
- 2006 Burrows, *The Chubby Lock Service* OSDI — Multi-Paxos 第一个工业大型系统
- 2008 Chandra et al., *Paxos Made Live* — Google 工程团队踩坑总结
- 2010 ZooKeeper Zab — primary backup 风格的共识
- 2013 etcd 0.1 开源（CoreOS）— 直接基于 Raft 草稿
- 2014.05 Ongaro PhD thesis defended — Raft 完整版（含 TLA+）
- 2014.06 USENIX ATC 2014 — Raft 短版获最佳论文奖
- 2014.10 HashiCorp/raft 0.1 — Consul / Nomad 的依赖
- 2017 TiKV 用 Multi-Raft（每个 region 一个 Raft 组）
- 2017 Heidi Howard et al., *Raft Refloated* — 指出 single-server 改动的 corner case
- 2019 CockroachDB 用 Multi-Raft + Range
- 2020 Kafka KIP-500 提出用 KRaft 替换 ZooKeeper
- 2024 Kafka 4.0 默认 KRaft，ZooKeeper mode 退役

## 1. 共识问题：钉死定义

工业界把 "consensus" 用得太泛。Raft 论文里的共识问题与 Paxos 完全一致——区别只在协议表述。先把名词钉死。

### Definition 1（term）

**term** 是 Raft 引入的一个**逻辑时钟**。每个 term 是一个连续整数 $t \in \mathbb{N}$，全集群所有节点在任何时刻都有一个本地视角的 `currentTerm`。term 的语义：

1. **每次发起 leader election，candidate 把自己的 currentTerm 自增 1**。
2. **每个 term 至多有一个 leader**（safety 性质，由 Election Restriction 保证）。
3. **任何 RPC 携带的 term 都要与本地 currentTerm 比较**：收到更高的 term，立刻把自己的 currentTerm 抬上去并 step down 成 follower。

term 替代了 Paxos 里的 ballot number，但有两个工程上的差别：

- Paxos 的 ballot 是 (round, proposer_id) 的字典序，需要全局唯一；Raft 的 term 是单纯整数，靠 election 流程保证递增。
- Paxos 一个 ballot 对应**一个 instance 的一轮**；Raft 一个 term 可能跨**多个 log entry**（同一个 leader 在自己的 term 内复制多条 entry）。这个差别让 Raft 的 commitIndex 推进比 Multi-Paxos 简单很多，但也带来 Section 5.4.2 的跨 term 复杂情况。

> 怀疑：term 在持久化语义上必须先写盘再回应 RPC，否则崩溃重启可能选出两个 leader。这条规则在论文 Figure 2 写得很短（"Persistent state on all servers: currentTerm"），但 etcd 早期版本曾因 fsync 时机错误踩坑。论文这种"一句话覆盖关键持久化语义"的写法是不是有意压缩？还是因为他们假设读者会自己理解 fsync 的工程含义？

### Definition 2（log entry）

每个 log entry 是一个三元组 $(t, i, c)$，其中：

- $t \in \mathbb{N}$ 是 entry 被 leader 接收时的 term（不是 entry 创建的时间）。
- $i \in \mathbb{N}^+$ 是 1-based log index，全局严格递增。
- $c$ 是 application command（任意 byte string，由 state machine 解释）。

每个 follower 的 log 是这些 entry 的有序数组。Raft 的核心不变量是**log[i] 在所有 server 上一旦达成 majority 复制并被 leader 标记 committed，则永远不会被覆盖**。

Log entry 的两个额外字段：

- 所有 server 维护 `commitIndex`：已知被 commit 的最大 index（committed 的语义见 Definition 4）。
- 所有 server 维护 `lastApplied`：已经 apply 到 state machine 的最大 index。`lastApplied <= commitIndex` 永远成立。

> 怀疑：log entry 用 (term, index, command) 三元组就足够了吗？工业实现（[etcd raftpb.Entry](https://github.com/etcd-io/etcd/blob/727d34394fd6def9740afa55a83ddb96f15bf2dd/raft/raftpb/raft.pb.go) 里加了 `Type`、`Data`、`Context` 等字段）说明实践里需要扩展。论文为了 understandability 做了简化，但这种"教学用 3 元组、生产用 7 元组"的差距，会不会让初学者从论文跳到代码时再次卡壳？

### Definition 3（state machine — 节点角色）

每个 server 在任意时刻处于三种状态之一：

- **Follower**：被动响应 leader 和 candidate 的 RPC，不主动发起任何动作。初始状态。
- **Candidate**：election timeout 到期后从 follower 切到 candidate，开始拉票。
- **Leader**：拿到 majority votes 后切到 leader，开始处理 client 请求并复制 log；通过周期性 AppendEntries（含心跳）维持权威。

转换边见 Figure 1：

- Follower → Candidate：election timeout（150-300 ms 随机）触发，currentTerm++，给自己投票。
- Candidate → Leader：收到 majority votes（包括自己）。
- Candidate → Follower：发现更高 term（来自 RPC 携带的 term 字段），或发现已存在的合法 leader（收到 AppendEntries）。
- Leader → Follower：发现更高 term，立刻 step down。
- Candidate → Candidate：split vote 导致没人拿到 majority，election timeout 再触发，term 再加 1。

### Definition 4（committed）

一个 log entry $e_i$ 在 term $T$ 中被 leader 创建。$e_i$ 被认为 **committed** 当且仅当：

1. **Leader 在自己的 term $T$ 内复制了 $e_i$ 到 majority 节点**（含自己），且
2. **同一 term 至少存在一条 entry 已经被 majority 复制**（这是 Section 5.4.2 的关键：跨 term 时不能直接 commit 旧 term 的 entry）。

一旦 committed，这条 entry 永远不会从 log 里消失，且会被所有未来 leader 包含（Theorem 1 Leader Completeness）。

### Definition 5（up-to-date log 比较）

candidate $C$ 的 log 比 voter $V$ 的 log "up-to-date" 当且仅当：

- $C$ 的 last entry 的 term 严格大于 $V$ 的 last entry 的 term，**或**
- 两者 last entry 的 term 相同，但 $C$ 的 log 长度 ≥ $V$ 的 log 长度。

这个比较函数是 RequestVote RPC 的核心约束（Section 5.4.1 Election Restriction）。

## 2. 角色与消息

Raft 只有**两种 RPC**（论文宣称的极简之一）：

| RPC | 发起方 | 接收方 | 用途 |
|---|---|---|---|
| RequestVote | Candidate | 全体 | 拉票 |
| AppendEntries | Leader | 全体 follower | 复制 log entry + 心跳 + 推进 commitIndex |

后来扩展版增加了第三个：

| RPC | 发起方 | 接收方 | 用途 |
|---|---|---|---|
| InstallSnapshot | Leader | 落后过多的 follower | 一次性发送 state machine 快照 |

每个 RPC 的请求/响应都携带 `term` 字段。**所有 server 在收到任何 RPC 时第一件事是比较 term**：低于自己 → 拒绝；高于自己 → 抬高 currentTerm 并 step down。这条规则在论文 Figure 2 用一句话概括，但是是 Raft 全协议安全性的总闸。

## 3. Section 5.1 — Leader Election

### 3.1 election timeout

每个 follower 维护一个 election timer，超时（150-300 ms 随机）就切到 candidate。三个工程关键：

- **随机化是必须的**。如果所有节点 timeout 一致，每次 split vote 都重演，活锁成灾。论文 Section 5.2 给出 150-300 ms 的工程经验值，并在 Figure 16 用模拟实验验证。
- **timeout 重置时机**：follower 收到合法 AppendEntries（含心跳）就重置 timer。"合法"指 leader 的 term ≥ 自己 currentTerm。
- **leader 的心跳频率**：通常是 election timeout 下限的 1/10 左右（如 15-30 ms 一次），保证网络正常时 follower 不会误以为 leader 挂了。

> 怀疑：randomized timeout 用 150-300 ms 是工程经验值，不同网络下应该不同。论文 Section 5.2 + Figure 16 给出了模拟结果（不同 timeout 区间下的 election 收敛时间），但没有给出**理论分析**——比如 RTT 分布与最优 timeout 的解析关系。如果跨数据中心部署（RTT 50-150 ms），是不是 timeout 下限要至少 5×RTT 才安全？工业实现（HashiCorp/raft 默认 1 秒）跟论文的 150-300 ms 差了一个量级，这种 gap 是不是说明 randomized timeout 的"理论最优"还没人推导清楚？

### 3.2 RequestVote RPC

Candidate 发出的 RequestVote 携带：

- term：candidate 的 currentTerm
- candidateId
- lastLogIndex：candidate 最后一条 log 的 index
- lastLogTerm：candidate 最后一条 log 的 term

Voter 的决策（论文 Figure 2）：

1. 如果 RPC 的 term < currentTerm，直接拒绝。
2. 如果 currentTerm 内已经投过票（votedFor != null）且不是给同一个 candidate，拒绝。
3. 如果 candidate 的 log 不是 up-to-date（见 Definition 5），拒绝。
4. 否则同意，把 votedFor 写盘后回应 success=true。

第 3 条就是 **Election Restriction**——这是 Raft safety 证明的关键。

### 3.3 majority quorum

Candidate 收到 majority votes（含自己投给自己那一票）即赢得选举。majority 在 $2f+1$ 节点集群里就是 $f+1$ 个。这与 Paxos 完全一致——quorum intersection 仍然是 safety 的母定理。

赢得选举后，新 leader 立刻向所有 follower 广播一次空 AppendEntries 作为"权威宣告"，把心跳节奏接管过来。

## 4. Section 5.2 — Log Replication

### 4.1 AppendEntries RPC

Leader 收到 client 请求 → 把 command 追加到自己 log → 并行向所有 follower 发 AppendEntries。RPC 字段（论文 Figure 2）：

- term：leader 的 currentTerm
- leaderId
- prevLogIndex：紧邻新 entries 之前的 entry 的 index
- prevLogTerm：上面那条 entry 的 term
- entries[]：要追加的 entry 数组（空数组 = 心跳）
- leaderCommit：leader 的 commitIndex

Follower 的决策：

1. 如果 RPC 的 term < currentTerm，拒绝。
2. 如果 follower 在 prevLogIndex 处没有 entry，或者那条 entry 的 term ≠ prevLogTerm，**拒绝**（一致性检查）。
3. 否则截断 follower log 在 prevLogIndex 之后的所有内容（如果有冲突），把 entries 追加进去。
4. 如果 leaderCommit > commitIndex，则把 commitIndex 设为 min(leaderCommit, 自己 log 的最后 index)。

第 2 条的失败会让 leader 把这个 follower 的 nextIndex 减一，下一次 AppendEntries 带上更早的 prevLogIndex，直到匹配为止。这就是"backtracking 修复机制"。

### 4.2 nextIndex / matchIndex

Leader 为每个 follower 维护两个 index：

- `nextIndex[follower]`：leader 认为 follower 下一条要接收的 entry 的 index。新 leader 初始化为 lastLogIndex + 1。
- `matchIndex[follower]`：leader 已知 follower 复制到的最高 index。初始 0。

每次 AppendEntries 失败 → `nextIndex[follower]--`，重试。
每次 AppendEntries 成功 → `matchIndex[follower] = prevLogIndex + len(entries)`，`nextIndex[follower] = matchIndex[follower] + 1`。

工业实现往往用 **batched backtracking**：失败回应携带 `conflictTerm` / `conflictIndex` 让 leader 一步跳到正确位置，避免线性回退。这是论文 Section 5.3 的"optimization"，工业必备。

### 4.3 commitIndex 推进

Leader 推进 commitIndex 的规则（论文 Section 5.3，**关键**）：

> 存在 N > commitIndex，使得 majority of matchIndex[i] >= N，**且 log[N].term == currentTerm**，则 commitIndex = N。

**最后那个条件**（log[N].term == currentTerm）是 Section 5.4.2 的核心 — 不能跨 term commit 旧 entry。

> 怀疑：跨 term commit 限制（Section 5.4.2 + Figure 8）是 Raft 论文最微妙的一段。Diego 自己在博士论文 Chapter 3 用了整整 4 页解释。etcd 早期版本（2014）曾经踩坑——刚选上 leader 就 commit 旧 term 的 entry，导致后续 leader 选出来发现冲突。这个反例非常反直觉："已经被 majority 复制了为什么还不能算 committed？" 论文标榜"可理解"，但这一处的可理解性其实低于 Paxos 的对称表达。"可理解"是不是只对 Section 5.1-5.2 那两节真正成立？

## 5. Section 5.4 — Safety

### Theorem 1（Leader Completeness）

**陈述**：如果一条 log entry $e$ 在 term $T$ 内被 commit，那么对于所有 term $T' > T$ 的未来 leader $L'$，$L'$ 的 log 一定包含 $e$。

**证明骨架**（论文 Figure 9 + Lemma 1-3）：

1. 假设反例：存在最早的 term $T_x > T$，其 leader $L_x$ 不包含 $e$。
2. $e$ 在 term $T$ 被 commit ⟹ majority 节点（quorum $Q_1$）的 log 包含 $e$。
3. $L_x$ 在 term $T_x$ 当选 ⟹ majority 节点（quorum $Q_2$）投票给 $L_x$。
4. quorum intersection: $Q_1 \cap Q_2$ 至少有一个节点 $v$。
5. $v$ 投票给 $L_x$ ⟹ $L_x$ 的 log 在 $v$ 看来 up-to-date（Election Restriction）。
6. $v$ 的 log 包含 $e$（来自 $Q_1$）⟹ $L_x$ 的 last entry 的 term 必须 $\geq e$ 的 term，且若相等则 log 长度 $\geq v$。
7. 进一步推出 $L_x$ 的 log 必须包含 $e$，与假设矛盾。

第 4 步是 quorum intersection——这是与 Paxos 共享的母定理。第 5 步是 Election Restriction——这是 Raft 独有的强约束（Paxos 没有这个，因为 Paxos 没有 leader 概念）。

### Lemma 1（Log Matching）

**陈述**：如果两台 server 的 log 在某个 index $i$ 处的 term 相同，那么它们在 index $i$ 之前的所有 log entry 都完全相同。

**证明**：由 AppendEntries 的一致性检查（prevLogIndex / prevLogTerm）+ 数学归纳法。对 index $i$ 归纳：

- base case: index 1 的 entry 由集群第一个 leader 创建，所有 follower 通过 AppendEntries 一致性检查得到同一份。
- inductive step: 如果 log[i] 相同，那么 log[i+1] 创建时它们的 leader 在 prevLogIndex=i 处通过了一致性检查，所以 log[i+1] 也相同。

Log Matching 是 Raft 的"局部不变量"——只看任意两条 log，不需要看全集群状态。这种局部性是 Raft 比 Paxos 易理解的核心来源。

### Section 5.4.1 — Election Restriction

候选人必须有"足够新"的 log 才能赢得选举。"足够新"由 Definition 5 定义：last entry 的 (term, index) 字典序比较。

这条约束的工程后果：**Raft 不允许任意 follower 升级为 leader**。如果一个 follower 长期落后，它永远当不了 leader，必须先靠 AppendEntries 追上来。这跟 Paxos 完全不同——Paxos 任何 proposer 都可以发起新 ballot，没有 "log 必须最新" 的限制。

> 怀疑：Election Restriction 让 Raft 在"新加入节点"或"长期分区恢复"场景下有副作用——新节点 / 落后节点必须先做 catchup 才能参与选举。如果 leader 又恰好挂了，那段空窗期没人能当 leader。HashiCorp/raft 加了 PreVote 阶段缓解，etcd 加了 learner 角色让新节点先不参与投票。这些扩展都是工业打的补丁。Raft 的"强 leader"是不是也是它的可用性脆弱点？

### Section 5.4.2 — 跨 term commit 的特殊情况

论文 Figure 8 是整篇最反直觉的一图。场景：

1. Term 2 的 leader S1 把 entry $e_2$ 复制到 S1, S2（majority of 5）。
2. S1 挂掉，S5 在 term 3 当选（log 较短但被 S3, S4, S5 投票，因为 S2 挂了）。
3. S5 在 term 3 写入 $e_3$，但还没 commit 就挂了。
4. S1 在 term 4 复活当选 leader，发现 $e_2$ 在多数节点（S1, S2, S3）。

**陷阱**：如果 S1 此时直接 commit $e_2$（因为 majority 已复制），但接下来 S5 又起来选上 leader（log 是 $e_3$，比 $e_2$ 长一截）——它会覆盖 $e_2$，违反 Leader Completeness。

**修复**：term 4 的 leader 不能直接 commit term 2 的 $e_2$，必须等 term 4 内自己的某条 entry 也达成 majority（"only commit log entries from the leader's current term"）。一旦 term 4 的 entry 被 commit，根据 Log Matching，更早的 $e_2$ 会被"间接"commit。

这是 [Diego 博士论文 Chapter 3 Section 3.6.3](https://github.com/ongardie/dissertation) 用 4 页讲清楚的——论文短版只有半页，是论文最被诟病的可读性弱点。

## 6. 嵌入图 01 — 状态机

![Figure 1: Raft 节点状态机](/papers/raft/01-state-transitions.webp)

三个状态、五条转换边、随机化 timeout、currentTerm 单调递增——这张图是 Raft 论文 Figure 4 的改绘版本。理解 Raft 的入口就是这张图。

## 7. Section 6 — Cluster Membership Change

如果集群从 3 节点扩到 5 节点，不能直接切换：会出现两个 majority（旧的 majority of 3 = 2 节点，新的 majority of 5 = 3 节点）同时合法的窗口，破坏 safety。

### 7.1 论文方案：Joint Consensus

两阶段切换：

1. **C_old → C_old,new**：同时使用旧配置和新配置的 majority 双重确认。这个中间配置叫 joint consensus。
2. **C_old,new → C_new**：等 joint consensus 配置自己 commit 后，再切到 C_new。

任何 entry 在 joint phase 必须**同时**在 C_old 和 C_new 都达成 majority 才算 commit。leader election 也是双重 majority。

### 7.2 博士论文方案：Single-Server Changes

Diego 博士论文 Chapter 4 改用更简单的方案：**一次只加/减一个节点**。可以证明此时新旧 majority 必然有交集（因为只差一个节点），所以不需要 joint consensus 的复杂性。

### 7.3 Heidi Howard 2017 的发现

[Heidi Howard et al., "Raft Refloated"](https://github.com/heidihoward/distributed-consensus-reading-list) 在 Diego 博士的 single-server 方案里找到 corner case：当两次 single-server change 在网络分区下交叠时，仍然可能选出冲突 leader。修复需要额外约束（每次 change 必须等上一次 commit 后才能开始）。

> 怀疑：Raft membership change 论文先用 joint consensus，博论改用 single-server，Heidi 又指出 corner case。Raft 在 membership 上是不是没收敛？工业实现各家方案都不同（etcd 用 joint，HashiCorp/raft 用 single-server，TiKV 用 joint），互相不兼容。"可理解"在这个子问题上完全失败了——三个方案、三处 corner case、三种工业实现。是不是说明 membership change 在共识协议里本质就是个不优雅的子问题？

## 8. Section 7 — Log Compaction

如果 log 一直增长，重启时回放全 log 不现实。Raft 用 **snapshot**：

- 每个 server 周期性把 state machine 序列化成 snapshot（含 lastIncludedIndex / lastIncludedTerm）。
- 之前的 log entry 全部丢弃（只保留 snapshot 之后的）。
- Leader 发现 follower 落后到 snapshot 之前的位置 → 用 **InstallSnapshot RPC** 一次性传 snapshot。

工程要点：

- snapshot 必须由 application 层配合（state machine 知道怎么序列化）。共识层只管 log，不管 state。
- snapshot 的写入要避免 stop-the-world，工业实现用 copy-on-write fork 或 LSM 风格 immutable segments。
- InstallSnapshot 完成后 follower 把 commitIndex 抬到 snapshot 末尾，丢弃所有冲突 log。

## 9. 嵌入图 02 — log replication

![Figure 2: Raft log replication](/papers/raft/02-log-replication.webp)

四种 follower 状态：完全同步 / 落后 / 不一致 / 长期分区。AppendEntries 的 backtracking + 一致性检查负责把所有这些情况收敛回到与 leader 一致。这张图是论文 Figure 7 的改绘版本，加了 commitIndex 标线。

## 10. Section 8 — Client Interaction

### 10.1 leader stickiness

client 必须把请求发给 leader。如果 client 找错了节点（比如旧 leader 的缓存）：

- follower 收到 client 请求 → 回应 "我不是 leader"，附带最新 leader 的 ID（自己知道的话）。
- candidate 收到 client 请求 → 回应错误，让 client 重试。

工业实现会让 client 维护 leader 缓存 + 重试时优先尝试上次成功的 leader。

### 10.2 linearizable read

最朴素方案：所有 read 走 leader 的 log（read-as-write），保证 linearizable 但性能差。

优化方案：

- **read index**：leader 拿到当前 commitIndex，向 majority 发心跳确认自己仍然是 leader，然后用 read index 处的 state 回应 client。绕开了 log 写入。
- **lease read**：leader 用 election timeout 推理 "我至少在 lease 时间内仍然是 leader"，期间不需要确认 majority。性能最好但依赖时钟假设。

> 怀疑：lease read 依赖时钟漂移有界这个工程假设。NTP 同步偶尔会跳秒（leap second / 抖动），lease read 会不会读到脏数据？Spanner 用 TrueTime 解决了类似问题（[[paxos]] 提到过），但 Raft 论文没怎么讨论 lease 的安全边界。生产里使用 lease read 是不是默认接受了一个工程妥协但论文不写？

## 11. Section 11 — 工业实现 Genealogy

Raft 在 2014-2024 这十年里成了事实标准。主要 lineage：

### 11.1 etcd 2014（CoreOS → Red Hat → CNCF）

Brandon Philips（CoreOS 创始人）在 2013 年读 Raft 草稿，决定用 Go 实现。早期版本（v0.1-v0.4）协议正确性踩了多次坑。v2.0（2015）协议层重写后基本稳定。Kubernetes 把 etcd 作为 control plane 的状态存储，让 Raft 一夜间走向所有云原生工程师。

工业核心代码示意：

[`https://github.com/etcd-io/etcd/blob/727d34394fd6def9740afa55a83ddb96f15bf2dd/raft/raft.go`](https://github.com/etcd-io/etcd/blob/727d34394fd6def9740afa55a83ddb96f15bf2dd/raft/raft.go)（链接示意；commit hash 用于锚定具体版本）

`raft.go` 里的核心 step 函数对应论文 Figure 2 的状态转换，只不过 etcd 把 leader / follower / candidate 的逻辑分成三个 `stepLeader / stepFollower / stepCandidate` 函数，更便于阅读。

### 11.2 HashiCorp/raft 2015

Mitchell Hashimoto 用 Go 写了一个独立的 Raft 库，被 Consul、Nomad、Vault 共用。设计上比 etcd/raft 更"图书馆化"——把 transport / storage / FSM 都做成接口，调用方自己实现。

[`https://github.com/hashicorp/raft/blob/8b85c7f7c3a2f1e8d9c8b2a6e4f1d3e9c5a2b7e8/raft.go`](https://github.com/hashicorp/raft/blob/8b85c7f7c3a2f1e8d9c8b2a6e4f1d3e9c5a2b7e8/raft.go)（链接示意）

PreVote 是 HashiCorp/raft 的一个重要扩展：candidate 在真正自增 currentTerm 之前先发一个 "pre-vote" RPC，确认大概率能赢，避免分区恢复时无意义的 term 跳跃。

### 11.3 TiKV 2017（PingCAP）

TiKV 引入 **Multi-Raft**：把数据按 key 切成多个 region，每个 region 独立跑一个 Raft 组。这个模式被 CockroachDB 跟进。

[`https://github.com/tikv/raft-rs/blob/4f3a2c8b9d6e7f1a5c3b9e8d2a4f6c1b7e9d3a5c/src/raft.rs`](https://github.com/tikv/raft-rs/blob/4f3a2c8b9d6e7f1a5c3b9e8d2a4f6c1b7e9d3a5c/src/raft.rs)（链接示意）

Multi-Raft 让单个集群可以横向扩展到几百 TB——这是 etcd 单 Raft 集群做不到的。代价是 region split / merge 的复杂度。

### 11.4 CockroachDB（2015 起）

CockroachDB 也是 Multi-Raft，但 range 比 TiKV 大（默认 64MB / range）。每个 range 有自己的 Raft group，跨 range 的事务通过分布式两阶段提交（基于 [[calvin]] 的精神）。

### 11.5 Kafka KRaft（KIP-500，2020-2024）

Kafka 历史上靠 ZooKeeper 做元数据共识。KIP-500 提出用 Raft 替换 ZooKeeper（叫 KRaft），到 Kafka 4.0（2024）默认 KRaft，ZooKeeper mode 退役。这是 Raft 工业普及的最高峰——一个 2014 年的协议 10 年后干掉了 ZooKeeper（基于 2010 年的 Zab）。

### 11.6 RethinkDB / Redis Sentinel / 其他

- RethinkDB（已停产，被 Linux Foundation 接管）原生用 Raft 做集群协调。
- Redis Sentinel 不是严格 Raft，但 leader election 部分明显借鉴了 Raft 的 randomized timeout。

## 12. 限制与代价

### 12.1 leader 写入瓶颈

Raft 的所有写都要经过 leader。集群 throughput 上限 = leader 的 CPU / 网卡。这跟 Multi-Paxos 一样，但比 leaderless 协议（EPaxos / Mencius）差。EPaxos 论文（2013）声称 throughput 高 3-4 倍，但工业界没大规模采用——可能是 EPaxos 自己也很难实现。

工业绕过方法：**Multi-Raft**（TiKV/CockroachDB/etcd 3.x）把数据切片，每片有独立 leader。但这只是分而治之，没解决"单 leader 是瓶颈"这个根问题。

### 12.2 liveness 在网络分区下不保证

FLP 定理（[[paxos]] 已论述）说异步网络下 safety + liveness 不能同时强保证。Raft 选择放弃 liveness 强保证：

- 网络分区时 minority side 永远选不出 leader（majority 不可达），完全停摆。
- 网络抖动时 leader 频繁丢心跳 → 频繁 election → throughput 抖动。PreVote 缓解了一部分。

### 12.3 membership change 的复杂度

如 Section 7.3 所述，论文 / 博论 / Heidi 三个方案都有边界 corner case。工业实现互相不兼容。

### 12.4 log compaction 需要 application 层配合

snapshot 不是协议层能独立完成的——必须 state machine 自己知道怎么序列化。这违反了"共识层与应用层正交"的工程理想。对比 Paxos Made Live 里 Google 实现的"snapshot 由共识层透明处理"，Raft 把这部分推给了 application 层，可读性优于 Multi-Paxos 但工程负担更高。

### 12.5 read 一致性

linearizable read 在 Raft 协议里需要额外做 read index 或 lease。如果 client 直接读 follower 而不通过 leader read index 校验，会读到脏数据。工业实现的"follower read"（如 TiKV stale read）都加了 read timestamp 比较，本质是把 lineraizability 弱化为 stale snapshot read。

## 13. 怀疑追问（深层）

> 怀疑：Raft 论文标榜"可理解"，但 Section 5.4.2 跨 term commit 的微妙情形仍然让很多实现踩坑（包括 etcd 早期）。"可理解"是相对的，还是宣传过头？我倾向于认为"可理解"主要成立于 Section 5.1-5.2（election + replication），到 5.4 safety 证明其实跟 Paxos 一样难。论文真正的贡献不是"算法可理解"，而是"算法的工程接口可抄写"——AppendEntries / RequestVote 两个 RPC 直接对应 RPC 框架的 API，伪代码可以一行一行翻译成代码。这个"工程可抄写性"才是 Raft 工业普及的真正原因。

> 怀疑：Raft 单 leader 写入瓶颈在大集群（>5 节点）下明显，但工业系统普遍只用 3-5 节点 quorum。是因为 Multi-Raft 分片解决了，还是 5+ 节点 quorum 在工业里就是个反需求（节点越多 quorum 越大，写入延迟反而变高）？我的猜测是后者：5 节点已经在 RTO/RPO 与延迟之间平衡得最好，再多节点是浪费。如果这是对的，那"Raft 不擅长大集群"根本不是缺陷，是问题压根就不需要大集群。

> 怀疑：Raft membership change 论文用 joint consensus 的复杂方式，但 Diego 博士论文 Chapter 4 改用 single-server changes 简化。Heidi Howard 2017 又指出 corner case。Raft 在 membership 上是不是没收敛？三个方案、三种工业实现互不兼容——这暴露了协议论文的一个普遍问题：**子问题如果没有在原论文里完整解决，后续会无限分叉**。Paxos 也有 reconfiguration 论文（Lamport 2010），同样有多个变种。共识协议的 membership change 是不是天然就是个"不可能优雅"的子问题？

> 怀疑：Raft 的 randomized timeout 用 150-300ms 是工程经验值，不同网络下应该不同。论文 Section 5.2 + Figure 16 给出了模拟分析（不同 timeout 区间下 leader 选举完成时间），但没有给出**理论解析**。工业实现的 timeout 普遍比论文推荐的大一个量级（HashiCorp/raft 默认 1 秒）。如果存在一个"最优 timeout = f(RTT 分布, 集群大小, 故障率)"的解析公式，10 年了为什么没人推导出来？是不是这个问题根本没有 closed-form 解，只能靠工程调参？

## 14. Paxos vs Raft 对照表

| 维度 | Paxos（Multi-Paxos） | Raft |
|---|---|---|
| leader 概念 | 隐式（distinguished proposer 是优化） | 显式（每个 term 唯一 leader） |
| ballot / term | (round, proposer_id) 字典序 | 单纯整数 term |
| 提案权限 | 任何 proposer 都可以发起新 ballot | 只有 leader 可以提议 entry |
| log 同步 | 每个 instance 独立跑 Phase 1+2 | leader 通过 AppendEntries 推送，follower 被动接收 |
| 一致性检查 | 隐式（acceptor 拒绝低 ballot） | 显式（prevLogIndex / prevLogTerm 检查） |
| safety 关键约束 | quorum intersection + P2c | quorum intersection + Election Restriction |
| membership change | reconfiguration 论文（多种方案） | joint consensus 或 single-server（多种方案） |
| 论文描述长度 | TOCS 1998 = 33 页（含寓言） | USENIX 2014 = 14 页 / 扩展版 18 页 |
| 学生学习时间 | 平均 5-7 小时（论文 + 简化版） | 平均 3-4 小时（论文 Section 5） |
| 工业事实标准 | Spanner / Chubby / Cassandra LWT | etcd / Consul / TiKV / CockroachDB / KRaft |

两者本质都是 quorum + 全序 ballot。差别在"如何把这个本质暴露给读者和实现者"。Paxos 选择了对称美学（任何节点都对称），代价是 Multi-Paxos 落到工程时要打很多补丁；Raft 选择了 leader 中心化，牺牲对称性换工程清晰度。

## 15. 学到什么

### 15.1 "可理解性"作为研究贡献的方法论

Raft 论文在 evaluation 一节做了 43 个学生的对照实验，把"可读性"量化成可比较的指标。这种"用人因实验当 evaluation"的做法在系统论文里非常罕见。它把 Raft 从"另一篇共识协议论文"提升到了"协议设计方法论的样板"。

学到的方法论：**当一个领域已经有正确性证明完备的协议（Paxos）时，下一个突破点不一定是"更正确"，可能是"更可教学" + "更可抄写"**。这跟 [[selinger-1979]]、[[volcano]] 的精神一致——把已有理论包装成工程可用的形式本身就是研究。

### 15.2 强约束换可读性的工程哲学

Raft 比 Paxos 增加的强约束包括：

- 显式 leader（牺牲对称性）
- 单调整数 term（牺牲 ballot 的灵活性）
- Election Restriction（牺牲任意节点都可当 leader 的灵活性）
- AppendEntries 的一致性检查（牺牲乱序复制的可能）

每一条都让协议的自由度降低，但每一条都让"实现一次写对"的概率提高。这种"理论极简换工程鲁棒"的取舍，在 Standard ML（小核心）vs OCaml（工程化扩展）的对比里也见过——但 Raft 是反方向：先有理论极简的 Paxos，再加约束做工程化的 Raft。

### 15.3 学术影响 vs 工业影响

Paxos 学术引用比 Raft 高（Lamport 1998 在 Google Scholar > 13000；Raft 2014 > 8000），但**工业系统的事实标准是 Raft**。10 年的时间足够说明：研究领域里"被引"和"被用"是两件事。Raft 在被引上输给 Paxos，在被用上完胜。

### 15.4 关联到我的笔记体系

| 节点 | 关联 |
|---|---|
| [[paxos]] | 同领域上一篇；Raft 是 Paxos 的"工程化版本" |
| [[selinger-1979]] | 同样是"理论 → 工程接口"的方法论范式 |
| [[volcano]] | 同样把抽象模型简化到极致以便工程实现 |
| [[snowflake]] | Snowflake 的 metadata service 用类似 Raft 的复制状态机 |
| [[calvin]] | Calvin 的 sequencer 假设有一个共识层，那个共识层默认是 Raft / Paxos |
| [[rocksdb-lsm]] | etcd 的 storage 层用 BoltDB，但 TiKV 的 raft-rs 直接落到 RocksDB |

### 15.5 下一步该读什么

- **Diego Ongaro PhD thesis 2014**（200+ 页）— 完整 TLA+ 证明 + LogCabin 实现细节。论文版省略的所有细节都在这里。
- **Heidi Howard, "Raft Refloated"**（2017）— 找出 single-server membership change 的 corner case。
- **Diego Ongaro & James Cowling, "Egalitarian Paxos"（EPaxos）— 与 Raft 反向的设计：no leader, throughput 高。
- **Kafka KIP-500** — 工业上把 ZooKeeper 替换成 Raft 的实战决策文档。
- **PingCAP TiKV multi-raft 设计文档** — Multi-Raft 在大集群下的工程实践。

## 16. 类比脚手架：Raft 在日常里像什么

- **Raft 像球队队长**：队长（leader）一个人喊战术（log entry），队员（follower）一致执行。队长下场（step down）大家投票选新队长（election）。Paxos 是没有固定队长的篮球——每个人都可以喊战术，但要先得到队友过半同意。
- **term 像考试届数**：每届有唯一获胜者（每个 term 唯一 leader），下一届从头投票（new election），永远不能回到上一届的状态。
- **AppendEntries 一致性检查像填鸭式考勤**：班长（leader）发新通知前先确认你上一条通知的内容是否一致，否则倒回去补全。
- **commitIndex 像班级公告栏的"已发布"标线**：标线之前的内容大家都看过且不可撤回，标线之后还在草稿状态。
- **Section 5.4.2 跨 term 限制像"新班长不能直接给上届的草稿盖章"**：必须先在自己届里发一份新通知盖章成功，旧通知才连带生效。

## 17. 一句话回顾每一节

| 节 | 一句话 |
|---|---|
| 0 | Raft 是 2014 年用"可理解"作为研究贡献的共识协议论文 |
| 1 | term / log entry / state machine / committed / up-to-date 五个名词钉死语义 |
| 2 | 协议主体只有两种 RPC：RequestVote 和 AppendEntries |
| 3 | randomized election timeout + RequestVote 决定 leader |
| 4 | AppendEntries 把 log 推到 follower，nextIndex 回退修复不一致 |
| 5 | safety 由 Election Restriction + Log Matching + 跨 term 限制保证 |
| 6 | 状态机图：三状态、五边、currentTerm 单调 |
| 7 | membership change 论文是 joint consensus，博论改 single-server，仍有 corner case |
| 8 | log compaction = snapshot + InstallSnapshot RPC |
| 9 | log replication 时序图 + 四种 follower 状态 |
| 10 | client 必须找 leader；linearizable read 有 read index 和 lease 两种优化 |
| 11 | 工业 lineage：etcd → HashiCorp/raft → TiKV → CockroachDB → KRaft |
| 12 | 限制：单 leader 瓶颈 / liveness 不保证 / membership 复杂 / snapshot 需 app 配合 / read 一致性 |
| 13 | 深层怀疑 4 条，质疑"可理解"的边界与 membership change 的不收敛 |
| 14 | Paxos vs Raft 对照表 |
| 15 | 学到：可读性是研究贡献 / 强约束换可读性 / 学术引用 ≠ 工业普及 |
| 16 | 类比脚手架：队长 / 考试届数 / 考勤 / 公告栏 |
| 17 | 一句话回顾本表 |
| 18 | 给未来自己的 checklist |

## 18. 给未来自己的 checklist

读 / 实现 / 引用 Raft 时要警惕：

- [ ] currentTerm / votedFor / log[] 三个状态必须 fsync 后才能回应 RPC，否则崩溃重启可能选出两个 leader。
- [ ] commitIndex 推进必须满足"当前 term 内有 entry 已 majority"——跨 term 直接 commit 旧 entry 是 etcd 早期踩过的坑。
- [ ] Election Restriction 的 up-to-date 比较是 (lastLogTerm, lastLogIndex) 字典序，不是单纯比 index。
- [ ] randomized election timeout 的范围跟 RTT 必须有 5-10 倍 buffer，跨数据中心默认值要调大。
- [ ] PreVote 在生产强烈建议加（HashiCorp/raft 默认开），避免分区恢复时无意义 term 跳跃。
- [ ] membership change 选 joint consensus 还是 single-server 取决于库；不要混用，不要在论文版基础上自己改。
- [ ] linearizable read 必须有 read index 校验或 lease；直接读 follower 是脏读。
- [ ] log compaction 要跟 application state machine 配合，单纯共识层做不了。
- [ ] AppendEntries 的 batched backtracking（携带 conflictTerm/conflictIndex）是必备优化，否则线性回退在大 log 下慢得离谱。
- [ ] 不要在大集群（>7 节点）下跑单 Raft；用 Multi-Raft 分片。

## 19. 复盘：为什么把 Raft 放在 theory-D 这一档

theory-D 已有 [[boehm-gc]]、[[tofte-talpin-regions]]、[[paxos]]。Raft 跟它们的差异：

- Boehm GC 是"理论可证明性 → 工程可用 GC"，Tofte-Talpin 是"理论 effect 推断 → 工程 region 内存"，Paxos 是"理论共识不可能性 → 工程共识协议"。这三篇都从理论命题出发推工程方案。
- **Raft 是反方向**：从已有的工程实现需求（Paxos 难懂）出发，重新参数化协议，让"工程可抄写"成为论文的一等贡献。

放在 theory-D 是因为它的核心仍然是**形式化协议** + **safety 性质证明**——只是论文版把证明简化了，完整 TLA+ 在博论里。如果只看 USENIX 短版，Raft 看起来像分支 A（method/system），但博论 + Heidi Howard 后续工作 + TLA+ 证明把它锚定在 theory 这一档。

---

> 状元篇收官：Raft 作为 theory-D 的第二篇（继 [[paxos]]），完成了"共识协议从形式化论文到工程事实标准"这条主线的闭环。后续 theory-D 会跟进 Calvin（[[calvin]]，已写）的确定性事务、PBFT/HotStuff（拜占庭场景）、EPaxos（leaderless）等。
