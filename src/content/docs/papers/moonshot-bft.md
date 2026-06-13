---
title: "Moonshot: Optimizing Chain-Based Rotating Leader BFT via Optimistic Proposals"
来源: https://arxiv.org/abs/2401.01791
日期: 2026-06-13
分类: 分布式系统
子分类: 分布式共识
provenance: pipeline-v3
---

# Moonshot：用乐观提案优化链式轮换领导者 BFT

## 一、日常类比：接力赛中的"抢跑"

想象一场 4×100 米接力赛。传统做法是：

1. 第 1 棒跑完，把接力棒交给第 2 棒
2. 第 2 棒接到棒后才能起跑
3. 以此类推

这就像传统的区块链共识协议——每个领导者（接力选手）必须等前一个被正式确认后，才能开始自己的工作。如果网络慢，每个人都要等很久。

**Moonshot 的核心想法**：第 2 棒不等第 1 棒"正式完成"，而是看到第 1 棒开始跑了，就**乐观地**跟着起跑——反正第 1 棒大概率能顺利交接。这就是"乐观提案"（Optimistic Proposal）。

当然，万一第 1 棒摔倒了怎么办？协议里有机制处理这种"回滚"（reorg），保证不会出错。

## 二、背景知识：为什么要发明 Moonshot？

### 2.1 几个关键角色

| 术语 | 意思 | 类比 |
|------|------|------|
| BFT | 拜占庭容错，一群人不全可信，但要达成一致 | 一群各有心思的人要投票决定一件事 |
| SMR | 状态机复制，所有人执行同样的操作序列 | 所有人抄写同一本账本 |
| 链式（Chain-based） | 区块像链条一样首尾相连 | 每一页账本引用上一页的编号 |
| 轮换领导者（Rotating Leader） | 每次由不同的人提议新区块 | 轮流当"记账人" |
| δ（delta） | 消息在网络中实际传输的时间 | 快递送到你家的时间 |
| Δ（Delta） | 网络最坏情况下的传输上限 | 快递最晚可能到的时间 |

### 2.2 前人做到了什么，还有什么没做到？

在 Moonshot 之前，主流协议（比如 HotStuff、Jolteon）有个瓶颈：

- **提交延迟至少 5δ**：一个区块从提出到被确认，至少要等 5 倍的网络传输时间
- **连续领导者之间至少间隔 2δ**：两个诚实的领导者不能紧挨着出块

Moonshot 的目标很明确：把这两个数字分别降到 **3δ** 和 **δ**。

## 三、核心概念详解

### 3.1 乐观提案（Optimistic Proposal）

这是整篇论文的"灵魂"。

传统做法中，领导者 v 提出区块 B 后，要等 B 获得足够多的投票（形成证书），领导者 v+1 才能基于 B 提出下一个区块。这个过程至少花 2δ。

Moonshot 的做法：领导者 v+1 **不用等 B 被确认**，只要看到 B 出现了，就乐观地在自己的提议中引用 B。如果后来 B 确实被确认了——完美！如果 B 没被确认（比如领导者 v 出错了）——那就引用另一个已经被确认的区块。

```
传统流程（慢）：
领导者 v 提出 B ──等待──▶ 节点们投票 ──等待──▶ B 获得证书 ──等待──▶ 领导者 v+1 提出 B'

Moonshot 流程（快）：
领导者 v 提出 B ──▶ 领导者 v+1 看到 B ──立即提出 B'（引用 B）
                                │
                         （如果 B 被确认 ✓）
                         （如果 B 没被确认 ✗，B' 引用另一个已确认区块）
```

### 3.2 三种 Moonshot 协议

论文提出了三个版本，复杂度递增：

| 协议 | 特点 | 提交延迟 | 连续区块间隔 | 流水线 |
|------|------|----------|-------------|--------|
| Simple Moonshot | 最简单 | 3δ | δ | 有 |
| Pipelined Moonshot | 更强响应性 | 3δ | δ | 有 |
| Commit Moonshot | 非流水线版 | 3δ | δ | 无 |

### 3.3 重组织韧性（Reorg Resilience）

如果一个诚实领导者在网络稳定后（GST 之后）提出了区块，协议保证这个区块最终会被纳入主链。这很重要——不然大家都不敢做诚实领导人了。

## 四、Simple Moonshot 协议流程

Simple Moonshot 是理解整个思想的最佳起点。它分为四个阶段：

### 4.1 阶段一：推进视图（Advance View）

每个节点维护一个"当前视图编号"。当节点收集到足够多的"推进"消息（2f+1 个），它就认为当前视图的领导者在忙，可以进入下一个视图了。

```python
class Node:
    def __init__(self, node_id, total_nodes):
        self.node_id = node_id
        self.view = 1                    # 当前视图编号
        self.locked_block = None         # 已锁定的区块
        self.locked_view = 0             # 锁定发生的视图
        self.quorum_size = 2 * (total_nodes // 3) + 1

    def on_advance_message(self, msg):
        """收到推进消息时，统计并判断是否可以进入下一视图"""
        self.advance_votes.append(msg)

        if len(self.advance_votes) >= self.quorum_size:
            # 收集到足够推进消息 → 进入下一视图
            self.view += 1
            self.advance_votes = []
            self.on_new_view()
```

### 4.2 阶段二：提议（Propose）

当前视图的领导者提出新区块。关键创新：**领导者可以提出两个区块**——一个引用前一个视图的区块（乐观），一个引用更早的已确认区块（回退）。

```python
    def on_new_view(self):
        """进入新视图时的初始化"""
        if self.is_leader(self.view):
            # 乐观提案：引用前一个视图的区块（即使还没被确认）
            optimistic_parent = self.latest_known_block
            # 回退提案：引用已锁定的区块（安全底线）
            fallback_parent = self.locked_block if self.locked_block else self.genesis

            # 提出两个区块
            optimistic_block = Block(
                view=self.view,
                parent_hash=hash(optimistic_parent),
                payload=self.pending_transactions
            )
            fallback_block = Block(
                view=self.view,
                parent_hash=hash(fallback_parent),
                payload=self.pending_transactions
            )

            self.broadcast(optimistic_block)
            self.broadcast(fallback_block)
```

为什么领导者要提两个？因为乐观提案依赖于"上一个领导者是诚实的"这个假设。万一他撒谎了，回退提案保证协议还能继续前进。

### 4.3 阶段三：投票（Vote）

节点收到区块后，检查是否合法，然后广播投票。投票的关键规则：

- 如果区块引用了自己已锁定的区块，无条件投票
- 如果区块引用了更新的锁定状态，也投票
- 否则不投

```python
    def on_proposal(self, block):
        """收到领导者提出的区块"""
        # 验证区块合法性
        if not self.validate_block(block):
            return

        # 投票规则：区块是否尊重了我的锁定状态？
        if self.can_vote_for(block):
            vote = Vote(
                view=self.view,
                block_hash=hash(block),
                signature=self.sign(hash(block))
            )
            self.broadcast(vote)

            # 收集 2f+1 个投票形成证书
            if self.collect_quorum_votes(block):
                self.commit(block)
```

### 4.4 阶段四：提交（Commit）

当一个区块收集到 2f+1 个有效投票，就形成了"区块证书"，该区块被提交。

## 五、为什么能达到 3δ 提交延迟？

让我们追踪一下时间线（假设网络已经稳定，GST 已过）：

```
时间 0:    领导者 v 提出区块 B
时间 δ:    B 到达所有节点
时间 δ:    节点们开始投票
时间 2δ:   投票到达领导者 v+1
时间 2δ:   领导者 v+1 提出区块 B'（乐观引用 B）
时间 3δ:   B' 到达所有节点，收集到足够投票 → B' 提交

总耗时：3δ
```

对比传统协议：

```
时间 0:    领导者 v 提出区块 B
时间 δ:    B 到达所有节点
时间 2δ:   节点们投票
时间 3δ:   投票汇总，B 获得证书
时间 4δ:   领导者 v+1 看到 B 有证书，提出 B'
时间 5δ:   B' 到达所有节点 → B' 提交

总耗时：5δ
```

Moonshot 省掉的 2δ 就是"等证书"的时间——通过乐观提案跳过了这一步。

## 六、Pipelined Moonshot 的改进

Simple Moonshot 有一个限制：它只在"连续两个领导者都是诚实的"时才能快速运行。Pipelined Moonshot 改进了这一点，实现了更强的"乐观响应性"——即使前一个领导者不诚实，只要当前领导者是诚实的，就能快速推进。

实现方式是引入了**线性超时证书**（Linear Timeout Certificates），用更简洁的方式证明"上一个领导者确实失败了"，而不需要复杂的门限签名。

## 七、论文的重要发现

### 7.1 降低通信复杂度的技巧反而降低了性能

论文的一个反直觉发现：为了减少通信量而常用的技术（如投票流水线化、指定投票聚合器），在实际广域网环境中**反而降低了性能**。这是因为这些技术增加了延迟，抵消了通信量减少的好处。

### 7.2 与 Jolteon 的对比

在 200 节点的广域网测试中：

- Moonshot 比 Jolteon 多提交约 **1.5 倍**的区块
- 平均延迟只有 Jolteon 的 **一半**
- 在领导者故障的情况下，非流水线版本的 Moonshot 表现更好，提交量是 Jolteon 的 **8 倍**

## 八、总结

Moonshot 的核心贡献可以用一句话概括：**通过"乐观地不等确认就继续工作"的思想，把链式 BFT 共识的速度提升了约 40%**。

关键创新点：

1. **乐观提案**——领导者不等前一个区块被确认就提出新区块
2. **双提案机制**——乐观 + 回退，兼顾速度与安全性
3. **重组织韧性**——保证诚实领导者的区块不会被无故丢弃
4. **3δ 提交延迟 + δ 连续区块间隔**——同时达到两个理论下限

这篇论文告诉我们：在分布式系统中，有时候"稍微冒一点险"（乐观假设），配合完善的"后悔机制"（回退提案），就能显著提高效率。这和生活中的很多决策逻辑是相通的——不是盲目冒进，而是在可控风险下加速前进。
