---
title: Writing TLA+ After a Decade in Industry
来源: https://surfingcomplexity.blog/2026/05/tla-decade.html
日期: 2026-06-13
分类: 分布式系统
子分类: 共识与复制
provenance: pipeline-v3
---

# 写作 TLA+：十年行业实践之后的学习笔记

> 本文是阅读 Lorin Hochstein 在 [Surfing Complexity](https://surfingcomplexity.blog) 博客发表的 "Writing TLA+ After a Decade in Industry" 一文后的学习笔记。

---

## 一、从日常类比开始

想象你要建一座桥。工程师会先画设计图、做应力分析，然后才动工。但大多数软件工程师的做法是：直接开始写代码，等出了问题再修。TLA+ 的做法就像是——在动工之前，先用积木把整座桥搭一遍。如果积木倒下了，说明设计有问题，而你只需要花几分钟重新搭，而不是花几百万拆掉重建。

TLA+（Temporal Logic of Actions）是由图灵奖得主 Hillel Refin 发明的形式化规范语言。它的核心理念不是"写代码来让系统运行"，而是"写规格来让系统行为可被推理"。

---

## 二、核心概念

### 1. 规格（Specification）与模型（Model）

在 TLA+ 中，你写的不是代码，而是**规格**——一段描述"系统应该做什么"的文字。然后你用工具（TLA+ 的 TLC 模型检查器）来自动验证：这个规格在有限种可能的执行路径下，是否总是满足你提出的**性质（properties）**。

日常类比：规格就像餐厅的菜单描述——"牛排应七分熟"。模型检查就像厨师先拿一小块肉试煎，验证"七分熟"这个要求能否达成。

### 2. 状态（State）与状态转换（Transition）

一个 TLA+ 模型由一组状态和一组状态转换组成：

- **状态**：系统在某个时刻的全局快照（例如："缓冲区中有 3 个项目，消费者正在等待"）
- **转换**：系统从当前状态变到下一个状态的动作（例如："生产者向缓冲区加入一个项目"）

TLA+ 的关键洞察：**并发 bug 本质上是状态转换的组合爆炸**。人类大脑一次只能跟踪几件事，而并发系统可能有几十个线程在同时运行。TLC 检查器可以自动遍历所有可达状态，找到那些人类容易遗漏的极端路径。

### 3. 不变量（Invariant）

不变量是你希望始终为真的条件。例如：

- 缓冲区的大小永远不会超过它的容量
- 账户 A 和账户 B 的总金额在任何时候都保持不变

如果 TLC 在搜索过程中发现了一个违反不变量的状态序列，它会给出一个**反例追踪（counterexample trace）**——一条从初始状态到违规状态的具体执行路径。

---

## 三、代码示例

### 示例 1：生产者-消费者模型

这是最经典的并发模型之一。让我们用一个简单的 TLA+ 规格来描述它：

```tla+
---- MODULE ProducerConsumer ----
EXTENDS Integers, Sequences

(* 常量：缓冲区容量 *)
CONSTANT BufferSize

(* 状态变量：缓冲区内容和两个指针 *)
VARIABLES buffer, head, tail

(* 初始状态：缓冲区为空 *)
Init == buffer = <<>> /\ head = 0 /\ tail = 0

(* 生产者行动：向缓冲区添加一个元素 *)
ProducerAction ==
    /\ head - tail < BufferSize       (* 缓冲区未满 *)
    /\ buffer' = BufferAppend(buffer, 1)
    /\ head' = head + 1
    /\ UNCHANGED <<tail>>

(* 消费者行动：从缓冲区取出一个元素 *)
ConsumerAction ==
    /\ head - tail > 0                (* 缓冲区非空 *)
    /\ buffer' = Tail(buffer)
    /\ tail' = tail + 1
    /\ head' = head

(* 任一行动可以发生 *)
Next == ProducerAction \/ ConsumerAction

(* 规格：初始状态 + 所有可能的状态转换 *)
Spec == Init /\ [][Next]_<<buffer, head, tail>>

(* 性质1：缓冲区永远不会溢出 *)
NoOverflow == 
    A \in Ints => [] (head - tail <= BufferSize)

(* 性质2：缓冲区永远不会下溢 *)
NoUnderflow == 
    A \in Ints => [] (head - tail >= 0)

(* 性质3：缓冲区的长度永远不会超过容量 *)
BoundedLength ==
    [] (Len(buffer) <= BufferSize)

====
```

**解释：**

- `VARIABLES` 定义了系统的所有可变状态
- `Init` 描述初始状态
- `ProducerAction` 和 `ConsumerAction` 描述了两个线程各自能做什么
- `Next` 表示任一行动都可以发生（这就是并发的核心）
- `Spec` 将初始状态和所有转换组合成完整规格
- 最后的 `===` 之后的部分是要验证的性质

### 示例 2：两阶段提交协议

这是分布式系统中更复杂的例子，展示了 TLA+ 在处理真实工业级问题时的能力：

```tla+
---- MODULE TwoPhaseCommit ----
EXTENDS Integers, Sequences, FinSets

(* 参与者集合 *)
CONSTANT Participants

(* 状态变量：每个参与者的状态 *)
VARIABLES participantState

(* 每个参与者可能的状态 *)
VoteStates == {"init", "voted_yes", "voted_no", "prepared", "committed", "aborted"}

(* 初始状态：所有参与者都处于初始状态 *)
Init ==
    participantState :-> [self \in Participants |-> "init"]

(*  coordinator 发送准备消息 *)
SendPrepare ==
    /\ participantState = [self \in Participants |-> "init"]
    /\ participantState' = [self \in Participants |-> "voted_yes" \EXCEPT 
                               self = "prepared"]

(* 参与者投票 yes *)
VoteYes ==
    /\ participantState[self] = "prepared"
    /\ participantState'[self] = "voted_yes"
    /\ participantState' = participantState

(* 参与者投票 no *)
VoteNo ==
    /\ participantState[self] = "prepared"
    /\ participantState'[self] = "voted_no"
    /\ participantState' = participantState

(* 协调者提交 *)
Commit ==
    /\ \A p \in Participants : participantState[p] = "voted_yes"
    /\ participantState' = [self \in Participants |-> "committed"]

(* 协调者中止 *)
Abort ==
    /\ \E p \in Participants : participantState[p] = "voted_no"
    /\ participantState' = [self \in Participants |-> "aborted"]

(* 下一步行动 *)
Next ==
    SendPrepare \/
    (\E self \in Participants: VoteYes[self]) \/
    (\E self \in Participants: VoteNo[self]) \/
    Commit \/ Abort

(* 不变量：所有参与者最终都会到达终端状态 *)
AllTerminated ==
    \A p \in Participants : participantState[p] \in {"committed", "aborted"}

(* 不变量：不会出现不一致——不可能有的提交了有的中止了 *)
NoInconsistent ==
    \A p, q \in Participants :
        ~(participantState[p] = "committed" /\ participantState[q] = "aborted")

====
```

**解释：**

- 这个模型描述了分布式系统中著名的两阶段提交（2PC）协议
- `participantState` 是一个映射，记录了每个参与者的当前状态
- `VoteYes` 和 `VoteNo` 中的 `\E self \in Participants` 表示"任意一个参与者"可以同时行动——这正是并发
- `NoInconsistent` 这个不变量捕捉了 2PC 协议最重要的正确性保证：所有节点要么全部提交，要么全部中止，不会出现分裂

---

## 四、TLA+ 的核心抽象工具

### 1. 消去"实现细节"的干扰

代码中充满了实现细节——变量名、内存地址、调度顺序。这些细节会掩盖真正的并发问题。TLA+ 的规格剥离了所有实现细节，只保留**行为层面的描述**。这让推理变得可行。

### 2. 从粗到细的多层模型

写 TLA+ 时，不要一上来就写完整模型。正确的做法是：

1. **第一层**：写一个极简模型，验证核心逻辑
2. **第二层**：逐步添加约束和细节
3. **第三层**：验证与代码的一致性

每一层都是一个独立的 TLC 检查任务。如果底层模型能通过验证，上层模型的问题就会被显著缩小。

### 3. 反例是礼物

当 TLC 找到一个反例时，不要感到沮丧。反例追踪（counterexample trace）告诉你**具体**在哪条执行路径上出了什么问题。这比在代码 review 中花三小时猜哪里有问题高效得多。

---

## 五、TLA+ 的价值总结

| 传统方法 | TLA+ 方法 |
|---------|----------|
| 在代码中查找 bug | 在规格中证明 bug 不存在 |
| 依赖测试覆盖率 | 自动遍历所有可达状态 |
| 并发问题难以复现 | 反例追踪给出精确复现路径 |
| 修改代码可能引入新 bug | 修改规格后重新验证 |
| 团队对系统行为理解不一致 | 规格是唯一的、无歧义的理解 |

---

## 六、学习建议

1. **从 TLA+ 视频课程开始**：Hillel Refin 在 Coursera 上的课程是最佳起点
2. **先写规格，再写代码**：养成用文字描述系统行为再形式化的习惯
3. **不要追求完美模型**：第一版模型一定会很粗糙，这没关系
4. **用 TLC 验证你的直觉**：你觉得"这里不会死锁"——让 TLC 来验证
5. **阅读别人写好的规格**：Refin 的 [specification gallery](https://specification.org) 有很多高质量例子

---

## 七、关键术语对照表

| 术语 | 英文 | 简单解释 |
|------|------|---------|
| 规格 | Specification | 系统应该做什么的描述 |
| 模型 | Model | 用 TLC 可检查的状态转换系统 |
| 不变量 | Invariant | 始终为真的条件 |
| 反例追踪 | Counterexample trace | 违反性质的具体执行路径 |
| 状态转换 | Transition | 系统从一状态到另一状态的行动 |
| 模型检查 | Model checking | 自动验证所有可达状态 |

---

## 八、一句话总结

> TLA+ 不是用来写运行的代码的，它是用来在写代码之前，用最小的心智负担，确认你的系统设计在并发和时序上是正确的。
