---
title: Linearizability 1990 — 让并发对象看起来像一次只执行一个操作
来源: 'Maurice P. Herlihy & Jeannette M. Wing, "Linearizability: A Correctness Condition for Concurrent Objects", ACM TOPLAS Vol. 12 No. 3, July 1990'
日期: 2026-05-30
分类: papers / 分布式系统
难度: 中级
---

## 是什么

Linearizability（线性一致性）是给并发对象定的一条**正确性标准**：哪怕背后是十台机器、上百个线程在并发改一份共享数据，从外部看都得**像一份单机、单线程、一次只做一件事的对象**。日常类比：银行柜台里坐着十个柜员同时办业务，但**对账单**上每笔交易都能排出"哪一秒发生"的时刻表，且这个时刻表里早完成的交易一定排在晚开始的交易前面。

更具体地说，论文给每次操作画两条时刻：**invocation**（客户端发出请求的瞬间）和 **response**（拿到回复的瞬间）。线性一致要求：每次操作可以在自己 `[invocation, response]` 区间里挑一个**线性化点**，让所有操作按这些点排成一条单线程序列；并且如果操作 A 的 response 早于 B 的 invocation（A 真实时间上完整发生在 B 开始之前），则 A 必须排在 B 前。

CAP 定理里的 "C"、ZooKeeper 写、Raft linearizable read、Spanner external consistency，今天所有谈"强一致"的论文都引这一篇。

## 为什么重要

不理解这篇，下面这些事都没法解释：

- 为什么"写完 ack 后立刻读"在分布式数据库里**不一定读得到**——sequential consistency 允许这种事，linearizability 不允许
- 为什么 CAP 里的 C 不是数据库教科书里的 serializability，两者是不同层的概念
- 为什么 Spanner 要花钱买原子钟——它就是想给全球范围的对象做 linearizability
- 为什么 Jepsen 测试每次发现一致性 bug 都引用这篇——它就是测线性化点

## 核心要点

论文 30 页，但骨架就**四件事**：

1. **history（历史）**：把所有进程的 invoke/respond 事件按真实时间排成一行序列。一段 history 是 linearizable，当且仅当能**重排**成等价的顺序 history `S`，且 `S` 保留所有 "A.respond 早于 B.invoke" 的真实时间顺序。类比：监控录像剪成时间轴，再把每个动作压缩成一帧。

2. **线性化点（linearization point）**：每次操作在 invoke 与 respond 之间挑一个瞬间，认为它"瞬时生效"。两次重叠的操作可以任挑一边在前，但**没重叠的操作不能调换**。类比：你下单和我下单时间窗口重叠，谁先成交平台说了算；但你昨天下单成交、我今天下单，今天不可能排到昨天前。

3. **locality（局部性 / 可组合性）**：每个对象**各自**线性化 ⇒ 整个系统自动线性化。这是 sequential consistency 没有的属性——sequential consistency **不可组合**：A 单独看一致、B 单独看一致，A+B 合起来可能就不一致了。这条让分布式系统能"模块化推理"。

4. **non-blocking**：一个等待中的 invocation 永远不应该被另一个等待中的 invocation 卡住。类比：柜员 A 在帮 X 办，柜员 B 不能因为 A 还没结束就拒绝接待 Y。这是从正确性反推**实现**应该具备的活性属性。

## 实践案例

### 案例 1：sequential consistency vs linearizability

两个进程操作一个共享寄存器 `x`，初值 0：

```
P1:  W(x, 1) ────────────► (响应)
P2:                                     (开始) ──── R(x) → ?
```

P1 的 response 早于 P2 的 invoke，真实时间上 P1 完整发生在 P2 之前。

- **sequential consistency 允许 R(x) 返回 0**——只要每进程内部顺序对就行，跨进程不强制 real-time
- **linearizability 强制 R(x) 返回 1**——P1 必须线性化在 P2 之前

这就是为什么"我写完它读它"在某些"最终一致"系统里读不到——它们没给你 linearizability。

### 案例 2：concurrent FIFO 队列的线性化点

论文里的经典例子：两个线程同时操作 FIFO 队列：

```
T1:  enq(x) ────────► ack
T2:        enq(y) ────► ack    deq() ──► ?
```

T1 和 T2 的 enq 在时间上重叠：

- 线性化点可以选 `enq(x) → enq(y) → deq` ⇒ deq 返回 x（合法）
- 也可以选 `enq(y) → enq(x) → deq` ⇒ deq 返回 y（也合法）
- 但**不能**选 `deq → enq(x) → enq(y)`——deq 的 invoke 晚于两次 enq 的 response，real-time 不允许

因此实现里的"线性化点"通常是**那条 CAS 指令成功的瞬间**——硬件给你的原子点。

### 案例 3：Raft 的 linearizable read

Raft leader 直接读自己的状态机就足够 linearizable 吗？不够——leader 可能已被网络分区废黜了但自己不知道。Raft 的标准解法：

```python
def linearizable_read(key):
    # 1. 记下当前 commit_index
    read_index = self.commit_index
    # 2. 走一轮 heartbeat 确认自己还是 leader（多数派 ack）
    self.broadcast_heartbeat_and_wait_majority()
    # 3. 等 state machine apply 到 read_index
    self.wait_apply(read_index)
    # 4. 此时的快照对外的线性化点
    return self.state_machine.get(key)
```

**逐部分解释**：
- heartbeat 确认 leader 身份 = 防止旧 leader 读出过期状态（违反 real-time）
- 等 apply 到 `read_index` = 保证读到该时刻所有已提交写
- 第 4 步那一瞬间就是这次 read 的线性化点

## 踩过的坑

1. **把 linearizability 当 serializability**：不是一回事。Serializability 是**事务级**（多操作打包），允许把已提交事务的等价顺序倒过来排；linearizability 是**对象级**（单操作），且强制 real-time order。MySQL 的 SERIALIZABLE 隔离级别**不**保证 linearizable，跨连接读旧值是可能的。

2. **以为 sequential consistency 够用**：sequential consistency 不强制 real-time、且**不可组合**。两个 SC 对象拼起来整体可能违反 SC。Linearizability 多加 real-time 这一条，才换来 locality 这条工程上至关重要的性质。

3. **线性化点放错位置**：在 RDMA / async I/O 系统里，"写完返回"的瞬间和"对端真正可见"的瞬间有窗口。如果把线性化点放在前者，但后续读走另一条路径看不到，就会被 Jepsen 捉到。规则：**线性化点必须是所有未来读都能看见的那一刻**。

4. **认为多数派写就自动 linearizable**：不一定。Paxos / Raft 的写多数派只保证**最终持久**，读路径走错（如直接读 follower 不验 lease）照样能读到旧值。Linearizability 是端到端属性，不是单层写得对就成。

## 适用 vs 不适用场景

**适用**：
- 共享并发对象（lock-free queue / stack / register）的正确性证明
- 强一致分布式存储（ZooKeeper / etcd / Spanner read-write）
- 需要"写完即可读到"的语义（配置中心 / 服务注册）

**不适用**：
- 跨地域、需要低延迟的写——CAP 定理里 P 出现时只能 C 与 A 取一个，linearizability 是 C
- 协同编辑这类**意图保留**优先的场景——CRDT / OT 给最终一致即可，硬上 linearizability 性能不可接受
- 流式系统的 exactly-once——那是处理语义不是对象一致性，请用 [[chandy-lamport-1985]] 的 snapshot 思路

## 历史小故事（可跳过）

- **1979 年**：Lamport 发表 sequential consistency，给多处理器内存模型的第一个正确性条件
- **1986 年**：Herlihy 在 CMU 博士论文里第一次写出 linearizability 雏形，叫 "atomic objects"
- **1987 年**：Herlihy & Wing 在 PODC 投出短版
- **1990 年 7 月**：TOPLAS 30 页正式版，确立现在的术语和证明框架
- **2002 年**：Gilbert & Lynch 证 CAP 定理，里面的 "C" 直接采用 linearizability 的定义
- **2013 年**：Kyle Kingsbury 启动 Jepsen 项目，用 Knossos 检查器对工业系统做线性化测试，发现一票数据库违规
- **1993 年**：Herlihy & Moss 在 ISCA 提出硬件 transactional memory；**2003 年**前后软件 TM（如 DSTM）热潮沿同一正确性思路展开；今天 lock-free 教科书仍把 1990 这篇当原点

## 学到什么

1. **正确性条件可以独立于实现**：论文不规定怎么造一致系统，只定义"长得像什么才算对"。这种"标准 / 实现"分离让后续 30 年的实现百花齐放
2. **加一条约束换来组合性**：linearizability 比 sequential consistency 多一条 real-time，代价是分布式实现更难，收益是 locality（可组合）——这是工程师能模块化推理的前提
3. **线性化点是抽象 + 实现的接缝**：抽象上每次操作有一个时刻，实现上要把这个时刻**钉在**某条 CAS、某个多数派 ack、某个 lease 验证完成的具体指令上
4. **强一致是端到端属性**：单层正确不代表整链正确，写路径 + 读路径 + 故障恢复必须一起满足

## 延伸阅读

- 论文 PDF：[Linearizability: A Correctness Condition for Concurrent Objects](https://cs.brown.edu/~mph/HerlihyW90/p463-herlihy.pdf)（30 页，先读 Section 1-3）
- 教材：Herlihy & Shavit *The Art of Multiprocessor Programming* 第 3 章把这篇展开成一整章
- 工程视角：Martin Kleppmann *Designing Data-Intensive Applications* 第 9 章 "Consistency and Consensus"
- 测试工具：[Jepsen / Knossos](https://github.com/jepsen-io/knossos) 和 [Elle](https://github.com/jepsen-io/elle) — 把这篇的定义变成可执行检查器

## 关联

- [[lamport-1978]] —— happens-before 给的是因果（partial order）时间观，linearizability 给的是真实（total real-time）时间观，互为补集
- [[fidge-1988]] —— vector clock 能判定 concurrent，但不给"什么算正确"的标准；linearizability 给标准但不告诉你怎么测因果
- [[chandy-lamport-1985]] —— snapshot 给"全局一致截面"，linearizability 给"每次操作一致瞬间"，前者是状态视角后者是操作视角
- [[paxos-1998]] —— Paxos 提供的是构造 linearizable 复制状态机的工具
- [[paxos-simple-2001]] —— 同上，平直版讲解
- [[spanner-2012]] —— TrueTime 让"真实时间"在全球范围可观测，是把 linearizability 工程化到跨数据中心的关键拼图
- [[raft]] —— linearizable read 的工程实现，依赖 lease + read_index
- [[zab-2011]] —— ZooKeeper 写路径的 linearizability 实现
- [[smr-1990]] —— 同年 Schneider 的状态机复制综述，告诉你怎么用复制实现 linearizable 服务
