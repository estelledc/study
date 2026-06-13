---
title: "SwiftPaxos: Fast Geo-Replicated State Machines — 零基础学习笔记"
来源: https://www.usenix.org/conference/nsdi24/presentation/ryabinin
日期: 2026-06-13
分类: 分布式系统
子分类: 分布式共识
provenance: pipeline-v3
---

# SwiftPaxos：让全球复制的共识变得更快

## 从开会说起

想象一个跨国公司有 5 个分公司（旧金山、伦敦、新加坡、悉尼、圣保罗），它们要共同维护一份账本。

每个分公司有一台电脑（叫它**副本**），上面运行着同一个程序（叫它**状态机**），程序读一份初始数据，大家按相同顺序执行相同命令，最后账本应该完全一致。这就是**状态机复制（SMR）**。

问题在于：大家怎么**同意**一个命令的执行顺序？

传统方法（Paxos）是：只有一个**领导者**说了算。所有人把命令发给领导者，领导者决定顺序，再广播给其他人。这要 4 次消息传递（client→leader→replica→client），跨洲延迟可能达到 300ms。

SwiftPaxos 的思路是：如果没人打架，2 次消息就能搞定；如果有人打架，leader 出来调解，3 次消息搞定。

这就是这篇论文的核心贡献。

## 前置概念速查

| 概念 | 类比解释 |
|------|----------|
| 状态机复制（SMR） | 多个人看同一本账，按相同顺序记账，最终账本一致 |
| 线性一致性（Linearizability） | 所有操作看起来像在同一时刻、单点完成 |
| 冲突（Conflict） | 两条命令都改同一个 key，执行顺序就重要了 |
| 可交换（Commute） | 两条命令互不干扰——先 A 后 B 和先 B 后 A 结果一样 |
| 投票箱/快取（Quorum） | 多数票原则，N=5 时只要 3 人同意就够了 |
|  ballot | 一次"领导任期"，用编号区分 |

## 核心问题：两种路径的矛盾

Paxos 的慢，根本原因是**只有 leader 能决定顺序**。

Fast Paxos 改进过：客户端直接把命令发给所有副本，副本各自按收到的顺序做"提议"。如果多数副本提议相同，2 次消息就完成（fast path）。否则回退到 leader 走慢路径（slow path）。

但 Fast Paxos 有一个致命缺陷：如果 fast path 没达成一致，就**必须换 leader（换 ballot）**，这代价巨大——要传递大量状态，期间所有命令都不能处理。

Generalized Paxos 允许只按"冲突命令的顺序"达成一致，减少冲突面。但一旦有冲突，同样要换 leader，导致它从未在现实中大规模使用。

EPaxos 干脆不要 leader，所有人平起平坐。但它有个 convoy 效应：一条慢命令会拖住整个系统，延迟尾巴很长。

SwiftPaxos 想要兼顾三件事：

1. 无冲突时 2 次消息（像 Fast Paxos）
2. 有冲突时只多 1 次消息，不换 leader（不像 Generalized Paxos）
3. 延迟尾巴短（不像 EPaxos）

## 核心创新：双投票机制

SwiftPaxos 最巧妙的地方在于：**允许一个副本投两次票**。

先投给自己的提议（"我收到命令的顺序是这样"），然后再投给 leader 的提议（"leader 说应该这样排"）。

为什么这在 Paxos 传统中是不允许的？因为 Paxos 要求一个节点在同一个 ballot 中只能做一个承诺，否则可能破坏安全保证。

SwiftPaxos 的安全保障来自一个关键设计：**所有 fast quorum 必须包含 leader**。

这意味着：如果一个 fast quorum 里的节点投了自己的票，但 leader 不在其中——leader 可以告诉这些节点："你们刚才那票不算，跟我走"。因为 leader 参与了所有 quorum，任何冲突都能被 leader 检测和纠正。

流程如下：

1. 客户端广播命令 `c` 给所有副本
2. 每个副本计算 `c` 的**依赖集合**（哪些已提交的命令和 `c` 冲突，必须在 `c` 之前执行）
3. 每个副本提出一个依赖顺序，作为投票
4. 如果多数副本的投票一致，fast path 达成，2 次消息
5. 如果不一致，leader 提出一个顺序，副本改为投 leader 的票，3 次消息

## 依赖关系：不要求所有命令同意同一顺序

传统 Paxos 要求所有命令必须按完全相同的顺序执行。SwiftPaxos 更灵活：只要求**冲突的命令**按相同顺序执行。

不冲突的命令（比如操作不同的 key），不同副本可以有不同的执行顺序——不影响最终一致性。

举个例子：

```
副本 A 执行顺序:  A(修改x) → B(修改y) → C(修改x)
副本 B 执行顺序:  B(修改y) → A(修改x) → C(修改x)
副本 C 执行顺序:  A(修改x) → B(修改y) → C(修改x)
```

A 和 B 顺序不同，但它们不冲突（操作不同 key），所以是安全的。C 依赖 A，所以顺序一致。

## 代码示例：依赖关系计算

SwiftPaxos 中，每个副本收到命令后，需要计算它的依赖集。伪代码逻辑如下：

```swift
// 每个副本收到命令 c 时的处理
func receive(command c: Command) {
    // 1. 计算 c 的依赖：找出所有与 c 冲突且已提交/处理中的命令
    var deps: Set<CommandID> = []
    for d in allProcessedCommands {
        if conflicts(d, c) {
            deps.append(d.id)
        }
    }

    // 2. 构建依赖路径（deps 的 deps 的 deps...）
    let depPaths = buildDependencyPaths(deps)

    // 3. 将 (id(c), deps, depPaths) 作为自己的投票广播出去
    broadcast(FastAck(id: c.id, deps: deps, paths: depPaths))
}

// 判断两个命令是否冲突（简化版：操作相同 key）
func conflicts(c1: Command, c2: Command) -> Bool {
    return c1.keysIntersect(c2.keys)
}

// 递归构建依赖路径（解决传递依赖）
func buildDependencyPaths(_ deps: [CommandID]) -> [DependencyPath] {
    var paths: [DependencyPath] = []
    for dep in deps {
        paths.append(DependencyPath(
            id: dep,
            subDeps: buildDependencyPaths(retrieveDeps(dep))
        ))
    }
    return paths
}
```

这里的 `DependencyPath` 是一个树形结构，记录了一个命令的所有**传递依赖**。如果 A 依赖 B，B 依赖 C，那么 A 的 depPath 中包含 C，即使 A 和 C 没有直接冲突。

## 代码示例：快路径与慢路径决策

```swift
// 收到 fast quorum 的投票后的决策逻辑
func onFastQuorumArrived(votes: [FastAck]) {
    // 1. 检查所有投票的依赖集是否一致
    let firstDep = votes[0].deps
    let allAgree = votes.allSatisfy { $0.deps == firstDep }

    if allAgree && votes.count > N * 3 / 4 {
        // ===== Fast Path =====
        // 3/4 以上副本同意同一顺序 → 2 次消息完成
        commit(commandId: currentCmd.id, deps: firstDep)
        sendReplyToClient(result: execute(currentCmd))
    } else {
        // ===== 触发 Slow Path =====
        // 投票不一致 → 等待 leader 的提议
        // leader 收集所有冲突信息，提出一个统一的顺序
        waitForLeaderProposal()
    }
}

// Leader 提出慢路径的顺序
func onLeaderProposal(proposal: DependencySet) {
    // 2. 所有副本接受 leader 的顺序（双投票的第二票）
    for ack in receivedAcks {
        if ack.deps == proposal {
            confirmedCount += 1
        }
    }

    if confirmedCount >= majority {
        commit(commandId: currentCmd.id, deps: proposal)
        sendReplyToClient(result: execute(currentCmd))
    }
}
```

## 消息延迟对比

| 协议 | 无冲突 | 有冲突 | 最坏情况 |
|------|--------|--------|----------|
| Paxos | 4δ | 4δ | 4δ |
| Fast Paxos | 3δ | 4δ+1 | 4δ+1 |
| EPaxos | 2δ+1 | O(nδ) | O(nδ) |
| SwiftPaxos | **2δ+1** | **3δ+1** | **3δ+1** |

δ 是消息传递延迟。SwiftPaxos 的 3δ+1 是最坏情况——即便所有命令冲突，也不会退化成 O(n)。

## SwiftPaxos 的三个关键不变量

论文用数学证明了 SwiftPaxos 的正确性，核心有三个不变量：

**Invariant 1**：任意两个副本对同一命令提交的依赖集合相同。保证了无论哪台副本先回复客户端，结果一致。

**Invariant 2**：对任意两个冲突命令，总是一个依赖于另一个。避免了循环依赖导致的顺序混乱。

**Invariant 3**：依赖图是无环的。保证命令可以被安全地执行。

这些不变量通过 leader 参与所有 quorum 的设计来保证。

## 实验结果

在 AWS 13 个 Region 上部署测试：

- 平均延迟比 Paxos 低 16–29%
- 在 YCSB 混合工作负载下，吞吐量最高是 EPaxos 的 2.9 倍
- 与 CURP+N2 Paxos 对比，SwiftPaxos 在低延迟方面有持续优势

## 为什么双投票是安全的

回到最初的问题：Paxos 传统中为什么不允许一个节点投两次票？

因为在标准 Paxos 中，一个节点可能同时支持两个不同 leader 的提议，导致两个不同的值被提交——破坏了安全性。

SwiftPaxos 的双投票之所以安全，是因为：

1. **Leader 在所有 quorum 中**：任何 fast quorum 无法在没有 leader 的情况下达成多数。这意味着如果 fast path 失败了，所有已经投过自己票的节点都知道"我的票还没被 commit"。
2. **后票覆盖前票**：节点改投 leader 的票时，发送一条新消息明确覆盖之前的投票。由于 leader 在之前已经看到了那些投票，它知道哪些节点"还没 commit"。
3. **ballot 编号递增**：如果 leader 真的失败了，新 leader 通过更高的 ballot 编号来"说服"旧节点。但 SwiftPaxos 不需要换 leader——leader 直接在同一个 ballot 内解决冲突。

## 总结

SwiftPaxos 的核心洞见：**冲突不需要换 leader，leader 直接调解就行。**

通过允许双投票、将 leader 嵌入所有 quorum、以及只按冲突命令的顺序达成一致，SwiftPaxos 在保持 Paxos 框架的同时，把无冲突延迟从 4δ 降到 2δ，把有冲突延迟从 4δ 降到 3δ。

它既不是完全去中心化的（像 EPaxos），也不是纯粹的中心化（像 Paxos），而是在两者之间找到了一条实用的中间道路。

论文代码开源在 GitHub（参考链接中的 `cite.swiftpaxos-code`）。

## 延伸阅读

- Paxos 原文：Lamport, "The Part-Time Parliament" (2001)
- Fast Paxos：Lamport (2006)
- Generalized Paxos：Lamport (2005)
- EPaxos：Moraru et al., SOSP (2013)
- CURP：Park & Ousterhout, NSDI (2019)
