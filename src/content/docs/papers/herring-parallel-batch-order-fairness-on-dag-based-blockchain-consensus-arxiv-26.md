---
title: "Herring：并行批量顺序公平性——在 DAG 区块链共识中对抗 MEV"
来源: https://arxiv.org/abs/2605.23648
日期: 2026-06-13
分类: 分布式系统
子分类: 共识与复制
provenance: pipeline-v3
---

# Herring：并行批量顺序公平性——在 DAG 区块链共识中对抗 MEV

## 一、为什么要关心这件事？——排队打车的故事

想象你在一座大城市打网约车。每当你发出叫车请求，平台会收集成千上万个请求，然后决定"谁先被接单"。问题在于，控制这个排序的人可以从中牟利：

- 看到你有急事，故意把你的请求排在后面，然后让加价的人先接单
- 发现某只股票的买卖请求，抢先用自己的资金买入（这叫 front-running）

在加密货币世界，这种现象叫 **MEV（Maximal Extractable Value，最大可提取价值）**。据统计，每年因交易排序被操纵而损失的金额高达数十亿美元。

**核心问题：** 区块链节点（称为"验证者"）虽然对"哪些交易有效"达成共识，但对"交易的顺序"几乎完全自由。Herring 这篇论文要解决的就是——**让交易的排序尽可能公平，不让任何人操控**。

## 二、传统方案 vs DAG 方案：图书馆借书类比

### 传统 BFT 共识（单线排队）

传统的区块链共识（如 PBFT、HotStuff）像是一个**单窗口排队系统**：

1. 每个时刻只有一个" leader（领导者）"负责决定交易顺序
2. 所有交易必须排成一条线
3. 领导者可以随意排列——这就是漏洞所在

### DAG 共识（多人同时处理）

DAG（有向无环图）共识像是一个**多人同时工作的图书馆**：

1. 有多个"管理员"（验证者）可以同时处理交易
2. 管理员之间互相引用对方处理过的内容，形成一张网
3. 效率更高，但顺序公平性更难保证

### 三种公平性方案的对比

| 方案 | 怎么决定顺序 | 缺点 |
|------|------------|------|
| Themis | 单个领导者决定 | 单点瓶颈，领导者可作恶 |
| FairDAG | 所有管理员串行计算 | 多核 CPU 没法并行利用 |
| DoD | 在共识前计算 | 阻塞共识 Pipeline |
| **Herring** | **并行计算 + 共识后处理** | **无** |

## 三、核心概念拆解

### 3.1 γ-Batch-Order-Fairness（γ-批量顺序公平性）

这是论文要保障的核心属性。翻译成人话：

> 如果大部分节点（γ 比例的验证者）都先收到交易 A 再收到交易 B，那么最终输出时 A 必须排在 B 前面（或同一批）。

但有一个根本障碍叫 **Condorcet 悖论**（投票循环）：

假设有三个交易 a、b、c，三个节点收到顺序分别是：
- 节点1: a → b → c
- 节点2: b → c → a
- 节点3: c → a → b

于是出现了：多数认为 a 在 b 前，b 在 c 前，c 在 a 前——**一个无法打破的循环**。

Herring 的解法：把循环内的交易归入"同一批次"，批次内顺序无所谓，只保证批次之间的先后。

### 3.2 依赖图（Dependency Graph）

Herring 用一张有向图来记录"谁应该排在谁前面"：

- 每个交易是图上的一个点
- 如果多数节点先收到 tx_A 再收到 tx_B，就连一条 A→B 的箭头
- 当所有点对之间都有箭头时，排序就确定了

交易被分为三类（按收到的证据数量）：

```
Solid（实心）：至少 n-2f 个节点确认收到
Shaded（着色）：至少阈值个节点确认，但不到 n-2f
Blank（空白）：证据不足，暂时忽略
```

### 3.3 关键创新：并行化 + 共识后处理

这是 Herring 最核心的设计。论文发现 FairDAG 的性能瓶颈在于**构建依赖图的阶段完全串行执行**——即使有 64 核 CPU，也只能用 1 核。

Herring 的做法分两步：

**（1）共识后构建图（Post-consensus Graph Construction）**

不在共识的"关键路径"上做公平性计算。等共识层先把一批批交易确定下来（commit subdag），然后再离线构建依赖图。这样公平性工作不会拖慢共识本身。

**（2）并行构建子图**

每个已确认的子 DAG（subdag）可以独立构建自己的依赖图，多个线程同时工作：

```rust
// 伪代码：Herring 的并行图构建
fn build_dependency_graph_parallel(subdags: &[SubDag]) -> DependencyGraph {
    let mut threads = Vec::new();

    // 每个子 DAG 用一个独立线程处理
    for subdag in subdags {
        let handle = thread::spawn(move || {
            // 这个子 DAG 内部的图构建是串行的
            let local_graph = build_local_ordering(subdag);
            let weight_matrix = compute_pairwise_weights(local_graph);
            let edges = topological_sort(weight_matrix);
            (subdag.id, edges)
        });
        threads.push(handle);
    }

    // 等所有线程完成，合并结果
    let mut merged_graph = DependencyGraph::new();
    for handle in threads {
        let (subdag_id, edges) = handle.join().unwrap();
        merged_graph.merge(subdag_id, edges);
    }

    // 小量同步点：处理跨子 DAG 的边
    merged_graph.resolve_missing_edges();
    merged_graph
}
```

### 3.4 显式缺失边解析（Explicit Missing Edge Resolution）

当两个交易之间还没有足够的证据来决定先后顺序时，它们的边就是"缺失"的。

FairDAG 用的是**隐式解析**——等新证据慢慢通过后续子 DAG 渗入，所有线程都得停下来等——这又回到了串行瓶颈。

Herring 用的是**显式解析**——通过 Narwhal 的可靠广播层，专门发送 FairUpdate 投票来补齐缺失边：

```rust
// 伪代码：显式缺失边解析
struct FairUpdate {
    /// 投票发起者的 ID
    source_id: ValidatorId,
    /// 当前轮次
    round: RoundNumber,
    /// 缺失对的列表：tx_A 在 tx_B 之前
    missing_pairs: Vec<(TransactionId, TransactionId)>,
    /// 签名证明这确实是该验证者发的
    signature: Signature,
}

// 每个工作线程发送自己的 FairUpdate
fn send_fair_update(&self, missing_pairs: Vec<(TxId, TxId)>) {
    let update = FairUpdate {
        source_id: self.id,
        round: self.current_round,
        missing_pairs,
        signature: self.sign(&update),
    };
    // 附着到 outgoing batch 上，通过 Narwhal 可靠广播
    self.worker.broadcast_batch(update.into());
}

// 收集投票直到达到阈值
fn resolve_missing_edges(&self, edges: &mut Vec<Edge>) {
    for pair in missing_pairs(&edges) {
        let votes = self.collect_votes(pair);
        if votes >= threshold(&self.validators) {
            // 投票够了，确定方向
            let direction = if votes > half(votes) {
                EdgeDirection::Forward
            } else {
                EdgeDirection::Backward
            };
            edges.insert_directed_edge(pair.tx_a, pair.tx_b, direction);
        }
    }
}
```

### 3.5 活体攻击（Liveness Attacks）的发现

Herring 的论文还做了另一件有价值的事：**发现了 FairDAG-RL 和 DoD 中都存在的漏洞**。

攻击方式很简单：恶意客户端故意只向部分验证者发送交易，使得公平性层永远无法收集到足够的证据来确定边的方向，导致排序永远卡住——系统**不宕机但也不前进**（liveness 被破坏）。

Herring 提出了补丁并集成到了 FairDAG 和 DoD 的复现代码中，让它们在评测中能够完整运行。

## 四、性能结果

Herring 建立在 Narwhal & Tusk（Rust 实现）之上，与 FairDAG-RL、DoD-W、Themis 对比：

| 指标 | Herring | FairDAG-RL | DoD-W |
|------|---------|-----------|-------|
| 吞吐量 | ~10,000 tx/s | 基准 | 基准 |
| 饱和吞吐量提升 | — | +90% | +100% |
| 执行延迟降低 | — | 最高 75% | 最高 75% |
| 公平性瓶颈 | 无 | 公平性层 | DAG Pipeline |
| 活体攻击漏洞 | 无 | 有（已补丁） | 有（已补丁） |

关键数字：**在 10,000 tx/s 下，Herring 的吞吐量几乎跟底层的 Narwhal & Tusk 持平**——说明公平性层的开销被压得非常低。

## 五、为什么叫 "Herring"？

论文作者没有正式说明命名来源。但结合上下文可以推测："Herring" 可能暗指"红鲱鱼（red herring）"——在分布式系统中，人们长期认为"高性能"和"顺序公平性"是不可兼得的红鲱鱼概念，而 Herring 证明了它们是兼容的。

## 六、总结：一句话理解 Herring

> 之前的 DAG 公平性方案把公平性计算变成了串行的性能瓶颈；Herring 把这块计算**并行化**，让公平性从"拖慢共识的累赘"变成了"可以水平扩展的 CPU 密集型任务"。

### 关键设计决策回顾

1. **Post-consensus**：公平性计算放在共识之后，不阻塞关键路径
2. **Parallel graph construction**：多个子 DAG 的图构建线程并行执行
3. **Explicit missing edge resolution**：通过可靠广播显式补齐缺失边，避免线程互相等待
4. **Self-referencing rule**：每个节点在 propose 新顶点时必须引用自己前一轮的证书，保证证据链不中断

### 下一步阅读建议

- Narwhal & Tusk 原始论文（理解底层 DAG 共识）
- Themis 论文（理解 batch unspooling 技术）
- Kelkar et al. 的 "Order-Fairness for Byzantine Consensus"（γ-batch-OF 的原始定义）
