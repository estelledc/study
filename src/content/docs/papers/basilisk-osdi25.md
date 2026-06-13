---
title: Basilisk - 用溯源不变量自动化证明不可判定协议
来源: https://www.usenix.org/conference/osdi25/presentation/zhang-tony
日期: 2026-06-13
分类: 分布式系统
子分类: 形式化验证
provenance: pipeline-v3
---

# Basilisk: 用溯源不变量自动化证明不可判定协议

## 一、日常类比：你不需要重新发明轮子

想象你要向朋友证明"这家餐厅的牛排绝对新鲜"。最笨的方法是：你要检查从牛出生、运输、屠宰、冷藏、到店、到端上桌的每一环节——这几乎不可能，因为环节太多了。

但聪明的方法是：你在牛排上贴了一个**溯源标签**。只要追溯这个标签，就能知道牛排是什么时候从哪个供应商送来的。如果供应商可信、运输条件合规，那牛排的新鲜度就**自动**得到了证明。

Basilisk 论文做的正是类似的事：它不要求程序员手动证明分布式协议的每一个复杂属性，而是给协议变量一个"溯源标签"，通过追溯标签自动推导出需要的证明。

## 二、问题是什么？为什么分布式协议这么难证明

分布式协议（比如 Paxos、Raft、两阶段提交）最难的地方在于：**你想证明的"安全属性"本身不够强**。

### 2.1 什么是不变量（Invariant）

不变量就是"不管协议怎么跑，永远成立的条件"。

比如两阶段提交（2PC）的安全属性是：

> 如果有任意参与者提交了事务（Commit），那么所有参与者的偏好都必须是 Yes。

但这个属性单独拿出来**不足以支持归纳证明**。也就是说，存在"满足安全属性但下一步就可能变不安全"的状态。

这就好比你说"这辆车永远不会闯红灯"，但如果不考虑交通规则、信号灯、司机行为等更强的条件，光靠这句话推不出结论。

### 2.2 归纳不变量的三个条件

要证明一个协议安全，需要找到一个更强的"归纳不变量 I"，满足：

1. **I 蕴含安全属性** —— I 比安全属性更强
2. **I 在初始状态成立** —— 一开始就是对的
3. **I 在每一步后仍然成立** —— 不会因为执行一步就变假

最难的部分是第 1 条：你怎么知道该找什么样的 I？

### 2.3 以前的做法：要么手写，要么限制逻辑

以前有两种选择：

- **手动推导**：像 IronFleet 团队证明 Multi-Paxos，花了几个月时间手动找出归纳不变量
- **限制逻辑**：用可判定的逻辑片段（如 EPR），但这禁止了算术运算等常见编程模式，协议写起来很不自然

Kondo（2024）做了部分自动化：它提出了一种"不变量分类法"，把不变量分成三类，其中两类（单调性、所有权）可以自动生成，但**涉及多个主机之间关系的复杂属性**仍需程序员手写。

**Basilisk 的目标：连这部分也自动化。**

## 三、核心概念：溯源不变量（Provenance Invariants）

### 3.1 什么是"溯源"

假设主机 R 的某个变量 `decision = Commit`。这个值从哪来的？

追溯链条可能是：

1. R 收到了一个 `DECIDE(Commit)` 消息
2. 这条消息是主机 S（协调者）发送的
3. S 发送这条消息时，S 自己的 `decision` 也是 `Commit`

这个从 R 的当前状态追溯到 S 发送消息时的状态的链条，就是**溯源**。

### 3.2 溯源不变量的两种类型

论文定义了两种溯源不变量：

**（1）网络溯源不变量（Network-Provenance Invariant）**

> 对于网络中的任意消息 m，如果 m 是 DECIDE 类型，那么必须存在协调者历史中的相邻两个状态，协调者执行了发送 DECIDE 的操作。

用 Dafny 风格表达：

```dafny
// 对于网络中的任意 DECIDE 消息，追溯其来源
forall m :: m in network && m.kind == DECIDE
  => exists i :: CoordinatorSendDecide(hist[i], hist[i+1], m)
```

这里的 `hist` 是协调者的执行历史（一个 append-only 日志）。因为历史是不可变的，所以这条不变量**天然就是归纳的**——一旦消息被发送并记录在历史中，就永远无法被否认。

**（2）主机溯源不变量（Host-Provenance Invariant）**

> 如果参与者的 `decision = Commit`，那么在其历史中必须存在相邻两个状态，参与者执行了 `ParticipantReceiveDecision` 步骤。

用 Dafny 风格表达：

```dafny
// 参与者决定 Commit 的溯源
h.cur.decision == Some(Commit)
  => exists i, m ::
      hist[i].decision != Some(Commit)
  && hist[i+1].decision == Some(Commit)
  && ParticipantReceiveDecision(hist[i], hist[i+1], m)
```

### 3.3 核心洞察：用简单不变量替代复杂属性

这是论文最重要的贡献。以前需要程序员手写的"跨主机属性"（比如"如果有参与者提交了，协调者也一定提交了"），现在可以**分解为多个简单的溯源不变量**，通过链条式推导自动得到。

以两阶段提交的"参与者一致性"为例：

```
前提：某个参与者 h 决定了 Commit

第1步：由参与者决策溯源不变量
       => h 收到了一个 DECIDE(Commit) 消息 m

第2步：由网络溯源不变量
       => m 是协调者通过 CoordinatorSendDecide 步骤发送的

第3步：CoordinatorSendDecide 的定义
       => 协调者在发送时 decision == Commit

第4步：协调者的 decision 是单调的（不会改变）
       => 协调者当前的 decision 仍然是 Commit

结论：参与者一致性成立。
```

整个过程不需要程序员手动写出"参与者一致性"这个跨主机属性，它被自动推导出来了。

## 四、自动化：原子分片算法（Atomic Sharding）

### 4.1 问题：怎么自动找到溯源不变量？

知道了溯源不变量的概念后，下一个问题是：如何**自动**找到每个变量应该关联到哪个步骤？

手动做太累了。论文提出了**原子分片（Atomic Sharding）**算法来解决。

### 4.2 什么是"原子分片"

一个分片（shard）是主机局部变量的一个子集。如果一个分片是"原子的"，意味着：**所有修改这个分片中变量的步骤，总是同时修改分片中的全部变量，不会只改一部分。**

```
举例：
如果 {decision} 是一个原子分片，
那么任何修改 decision 的步骤，都会完整地更新它，
不会出现"只改了 decision 的一部分"的情况。
```

### 4.3 原子分片算法的三步

**第一步：估计每个步骤的"影响范围"（Footprint）**

```dafny
// 假设我们静态分析得到：
步骤 CoordinatorMakeDecision 的影响范围 = {decision, yesVotes, noVotes}
步骤 CoordinatorSendDecide 的影响范围 = {}  // 只发送消息，不改本地状态
步骤 ParticipantReceiveDecision 的影响范围 = {decision}
```

**第二步：用维恩图找出原子分片**

把每个步骤的影响范围画成维恩图，每个区域就是一个原子分片：

```
变量: {decision, yesVotes, noVotes}

CoordinatorMakeDecision 的影响范围 = {decision, yesVotes, noVotes}
ParticipantReceiveDecision 的影响范围 = {decision}

原子分片:
  {decision}      — 被两个步骤修改，但总是成对出现
  {yesVotes}      — 只被 CoordinatorMakeDecision 修改
  {noVotes}       — 只被 CoordinatorMakeDecision 修改
```

**第三步：为每个原子分片生成溯源不变量**

```dafny
// 原子分片 {decision} 被步骤 ParticipantReceiveDecision 修改
// 生成主机溯源不变量：

predicate ParticipantDecisionProvenance(h: Participant) {
  h.decision != None
    => exists i ::
        hist[i].decision == None
    && hist[i+1].decision == Some(_)
    && ParticipantReceiveDecision(hist[i], hist[i+1], _)
}
```

### 4.4 代码示例：完整的 Two-Phase Commit 模型

下面是一个简化版的两阶段提交协议定义，展示如何在 Dafny 中编写：

```dafny
// ============ 数据类型定义 ============

datatype Preference = Yes | No

datatype Decision = Abort | Commit

datatype Message =
  VOTE(pref: Preference, src: nat)
| DECIDE(dec: Decision)

// 单调可选类型：只能从无到有，不能改变
datatype MonotonicOption<T> = None | Some(value: T)

// ============ 主机状态定义 ============

datatype Coordinator = Variables(
  numParticipants: nat,
  decision: MonotonicOption<Decision>,  // 初始为 None
  yesVotes: set<nat>,                   // 初始为空，单调增加
  noVotes: set<nat>                     // 初始为空，单调增加
)

datatype Participant = Variables(
  hostId: nat,
  preference: Preference,               // 非确定性常量
  decision: MonotonicOption<Decision>   // 初始为 None
)

// ============ 步骤定义 ============

// 协调者决定：如果收到所有 Yes 则 Commit，有 No 则 Abort
predicate CoordinatorMakeDecision(
  v: Coordinator, v': Coordinator)
  requires v.decision == None
  ensures v' == v && (
    (|v.yesVotes| == v.numParticipants
     => v'.decision == Some(Commit))
    || (|v.noVotes| > 0
     => v'.decision == Some(Abort))
    || (|v.yesVotes| < v.numParticipants
     && |v.noVotes| == 0
     => v'.decision == None)
  )

// 协调者发送决策
predicate CoordinatorSendDecide(
  v: Coordinator, v': Coordinator, send: Message)
  requires v.decision match { Some(d) => true; _ => false }
  ensures send == DECIDE(v.decision.value)
  ensures v' == v

// 参与者接收决策
predicate ParticipantReceiveDecision(
  v: Participant, v': Participant, recv: Message)
  requires recv match { DECIDE(d) => true; _ => false }
  requires v.decision == None
  ensures v'.decision == Some(recv.value)
  ensures v' == v && v'.preference == v.preference

// ============ 安全属性 ============

// 如果任意参与者决定 Commit，所有参与者的偏好都是 Yes
predicate Safety(h: Participant) {
  h.decision match {
    Some(Commit) => h.preference == Yes,
    _            => true
  }
}
```

### 4.5 代码示例：Basilisk 如何自动生成不变量

下面是 Basilisk 根据上面的协议定义自动生成的溯源不变量：

```dafny
// ============ Basilisk 自动生成的不变量 ============

// 不变量 1：协调者决定 Commit 的溯源
// （由原子分片 {decision} 自动生成）
predicate CoordinatorDecisionProvenance(c: Coordinator) {
  c.decision match {
    Some(Commit) =>
      exists i ::
        hist[i].decision == None
      && hist[i+1].decision == Some(Commit)
      && CoordinatorMakeDecision(hist[i], hist[i+1])
  }
}

// 不变量 2：DECIDE 消息的网络溯源
// （对每种消息类型自动生成）
predicate DecideMsgProvenance(network: set<Message>) {
  forall m :: m in network && m match { DECIDE(d) => true; _ => false }
    => exists i ::
        CoordinatorSendDecide(hist[i], hist[i+1], m)
}

// 不变量 3：参与者决定 Commit 的溯源
predicate ParticipantDecisionProvenance(p: Participant) {
  p.decision match {
    Some(Commit) =>
      exists i, m ::
        hist[i].decision == None
      && hist[i+1].decision == Some(Commit)
      && ParticipantReceiveDecision(hist[i], hist[i+1], m)
  }
}

// ============ 单调性不变量 ============

// decision 是单调的：一旦设为某个值就不再改变
predicate MonotonicDecisionInvariant(p: Participant) {
  forall i, j :: 0 <= i < j < |hist|
    => (hist[i].decision != None => hist[i].decision == hist[j].decision)
}
```

## 五、工作流程

Basilisk 的使用流程可以概括为四步：

```
用户定义协议（主机状态 + 步骤）
        ↓
Basilisk 自动生成历史 preserving 异步协议模型
        ↓
Basilisk 自动生成不变量 + 归纳性证明
        ↓
用户证明：不变量蕴含安全属性
```

用户唯一需要"动脑"的步骤是最后一步：证明安全属性成立。这比传统方法（先猜不变量、再证归纳性、反复迭代）简单得多。

## 六、评估结果

Basilisk 在 16 个分布式协议上做了测试，包括：

- 两阶段提交（2PC）
- Paxos 及其变体（Paxos-Combined, Paxos-Dynamic, Flexible Paxos, SwiftPaxos）
- Raft 领导选举
- Multi-Paxos（ notoriously complex ）
- 分布式锁、ShardedKV 等

**关键结果：**

- Basilisk **全自动**找到了所有 16 个协议的归纳不变量
- 对比 Kondo，后者在大多数协议上仍需用户手写多个不变量（比如 Paxos 需要 20 个手写属性，Multi-Paxos 需要更多）
- 即使是 Multi-Paxos 这样的复杂协议，Basilisk 也无需任何手动不变量

## 七、总结

Basilisk 的核心贡献可以一句话概括：**把"跨主机复杂属性"拆解为"单个主机的简单溯源关系"，然后通过链条自动组合。**

类比回开头的餐厅例子：

- 旧方法：你手动检查从牛出生到端上桌的每一个环节
- 新方法：你只检查溯源标签，标签自动告诉你的每一步信息

Basilisk 让形式化验证从"几个月的手写工作"变成了"定义协议 + 少量 proof lemma"。对分布式协议的设计者和验证者来说，这是一个很大的进步。
