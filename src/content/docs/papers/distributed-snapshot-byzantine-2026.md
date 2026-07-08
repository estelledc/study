---
title: Byzantine Linearizability — 让拜占庭客户端也像排队办业务
来源: 'Shir Cohen and Idit Keidar, "Tame the Wild with Byzantine Linearizability: Reliable Broadcast, Snapshots, and Asset Transfer", DISC 2021 / arXiv 2021'
日期: 2021-02-21
分类: distributed-systems
难度: 高级
---

## 是什么

Byzantine linearizability 是一套**让坏客户端乱来时，好客户端仍然像在使用一个有序共享对象**的正确性标准。日常类比：银行柜台有人拿假单、插队、重复喊号，系统不要求还原骗子的真实动机，只要求普通客户看到的结果能排成一条合法队伍。

这篇论文把这个标准用于共享内存里的三个常见对象：reliable broadcast、atomic snapshot、asset transfer。它问的问题很朴素：如果客户端可能拜占庭作恶，只靠 SWMR registers，还能不能造出这些对象？

核心答案是：能，但条件很硬。只要拜占庭进程数 `f < n/2`，论文给出 broadcast 和 snapshot 构造，并由 snapshot 得到资产转账；如果 `f >= n/2`，这些对象不可能保持论文要求的语义。

用一句话压缩：这篇不是在发明一个新数据库，而是在问“坏客户端参与时，共享对象还能不能像普通对象一样被解释”。

这个问题看起来理论，其实很贴近工程排障：如果系统重启后每个节点都说自己看见了不同状态，我们需要知道哪些差异还能被解释成一个合法时刻，哪些已经说明协议失守。

## 为什么重要

不理解这篇，下面这些事都很难解释：

- 为什么普通 crash-failure 下的 snapshot 算法，遇到拜占庭客户端就会失效：坏进程可以不断改寄存器，让 double-collect 永远不稳定。
- 为什么区块链里的资产转账不只是“大家广播交易”：还要说明余额读取、交易顺序、作恶客户端之间怎样进入同一个顺序解释。
- 为什么 `3f + 1` 不是所有拜占庭问题的唯一答案：在共享内存抽象上，客户端容错边界可以做到 `2f + 1`。
- 为什么重启诊断时要关心 snapshot 语义：如果快照能被线性化，重启后看到的状态才像来自某个明确时刻，而不是一堆互相打架的碎片。

## 核心要点

1. **先规定“好人看到什么”**。类比：监控录像坏了几段，但普通顾客的业务单据必须能排成一条合法队列。论文只保留 correct processes 的历史，再允许插入最多 `f` 个拜占庭进程的操作，使整体满足普通 linearizability。

2. **再证明多数正确进程是底线**。类比：班里一半同学都在撒谎，老师已经无法判断哪份作业代表真实进度。论文用 asset transfer 的反例说明，`n <= 2f` 时两个执行对好进程不可区分，却要求相反的余额结果。

3. **最后用 broadcast 帮 snapshot 防止“说两套话”**。类比：每张便条都要先被多人签名，再检查有没有冲突版本。reliable broadcast 用 send、echo、ready、deliver 四级寄存器推进；snapshot 再用它收集稳定的一组 start messages。

把三个对象串起来看：

- registers 是最底层的便签纸，每个进程主要写自己的格子。
- reliable broadcast 负责让“某人说过什么”不能被随意改口。
- snapshot 负责把很多格子的当前状态拼成一张可排序的照片。
- asset transfer 负责在这张照片上判断余额够不够、交易能不能成立。

## 实践案例

### 案例 1：为什么普通 double-collect 会被拜占庭进程破坏

```python
def double_collect(registers):
    first = [r.read() for r in registers]
    second = [r.read() for r in registers]
    return first if first == second else None
```

**逐部分解释**：

- `first` 和 `second` 是经典 snapshot 的“读两遍，看是否没变化”。
- crash-failure 模型里，坏掉的进程只是不动，所以两次读取有机会一致。
- Byzantine 模型里，作恶写者可以在每次读前改值，让好进程永远等不到稳定画面。
- 所以论文没有修补 double-collect，而是换成“广播过、签过、可证明”的稳定条件。

### 案例 2：共享内存版 reliable broadcast 怎么防冲突

```python
def can_deliver(message, ready, echo, f):
    enough_ready = count_signatures(ready, message) >= f + 1
    no_conflict = not exists_conflicting_echo(echo, message)
    return enough_ready and no_conflict
```

**逐部分解释**：

- `f + 1` 个 ready 签名意味着里面至少有一个来自正确进程。
- `echo` 像证据墙，记录某个发送者、时间戳是否出现过另一份消息。
- 两个条件一起用，才避免拜占庭发送者对不同人广播不同内容。
- `deliver` 不是自动推送事件，而是好进程主动读取并帮忙复制证明。

### 案例 3：资产转账为什么依赖 snapshot

```python
def transfer(src, dst, amount, ledger):
    snap = ledger.snapshot()
    if balance(src, snap) < amount:
        return False
    ledger.update(src, append_txn(src, dst, amount, snap))
    return True
```

**逐部分解释**：

- `snapshot()` 先取一张全局账本照片，用它计算余额。
- `append_txn` 不覆盖旧交易，而是把新交易接到自己的交易历史后面。
- 如果 snapshot 本身是 Byzantine linearizable，转账也能放进一条合法顺序里解释。
- 这解释了论文为什么先做 broadcast 和 snapshot，再把 asset transfer 放到附录里组合出来。

## 踩过的坑

1. **把 Byzantine 当成 crash**：crash 只是沉默，Byzantine 会写冲突值、恢复旧状态、伪装成另一次执行，所以原算法不能直接套。
2. **以为 linearizability 要解释坏人的真实操作**：论文只要求好进程的历史可被补上若干坏进程操作后线性化，因为坏人的内部意图不可观察。
3. **看到 `f + 1` 就以为不够安全**：在 `f < n/2` 下，任意 `f + 1` 集合至少含一个正确进程，签名和 non-equivocation 让这个交集变得有用。
4. **忽略“正确进程持续参与”假设**：如果少于多数正确进程不断迈步，系统等价于只剩 `2f` 个进程，论文的下界会立刻卡住进展。

## 适用 vs 不适用场景

**适用**：

- 需要在拜占庭客户端存在时定义共享对象语义，比如账本、快照、广播。
- 想把区块链转账问题拆成 shared-memory object，而不是直接跳到共识。
- 做分布式系统重启、诊断、审计时，需要“这份状态来自某个可解释时刻”的保证。

**不适用**：

- 服务器本身也大量拜占庭，且底层 shared memory 不能被可靠实现的场景。
- 追求低存储复杂度的工程实现；论文明确把效率留作后续问题。
- 完全同步或强中心化系统；那时可以用更简单的日志、锁或主从复制。

## 历史小故事（可跳过）

- **1985 年**：Chandy-Lamport snapshot 解决“没有全局时钟时怎样拍全局照片”的问题，但默认进程不撒谎。
- **1990 年**：Herlihy-Wing linearizability 给并发对象一个强直觉：每个操作像在某个瞬间发生。
- **1999 年**：PBFT 把拜占庭客户端和复制服务的正确性推进到工程语境。
- **2021 年**：Cohen 和 Keidar 把 shared-memory objects 的拜占庭客户端语义整理成 Byzantine linearizability，并给出 `f < n/2` 的紧边界。

## 学到什么

1. **正确性标准先于算法**：先说清“什么叫结果对”，后面的 broadcast、snapshot、asset transfer 才有共同尺子。
2. **拜占庭容错不是只能 `3f + 1`**：边界取决于模型、对象和底层抽象；这篇在客户端共享内存模型里得到 `2f + 1`。
3. **snapshot 的难点是稳定性**：不是读完数组就结束，而是要证明所有正确进程返回的数组能排成同一个顺序。
4. **资产转账可以不靠共识完成**：只要交易依赖关系和快照语义足够强，很多支付场景可用偏序解释。

## 延伸阅读

- 论文 PDF：[Tame the Wild with Byzantine Linearizability](https://arxiv.org/pdf/2102.10597v2.pdf)（本文主要依据）
- 会议版本：[DISC 2021 页面](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.DISC.2021.18)（含正式引用信息）
- [[chandy-lamport-1985]] —— 分布式 snapshot 的经典起点，先理解“拍照”再理解“防撒谎”
- [[linearizability-1990]] —— Byzantine linearizability 继承的并发对象正确性基础
- [[pbft-1999]] —— 拜占庭客户端和复制服务语义的工程化背景
- [[bitcoin]] —— asset transfer 的现实动机：谁能花钱、何时算花过

## 关联

- [[chandy-lamport-1985]] —— 解释 snapshot 的直觉来源，但不处理拜占庭写者。
- [[linearizability-1990]] —— 提供“并发操作可排成顺序”的核心标准。
- [[byzantine-generals-1982]] —— 说明拜占庭故障为什么比 crash 更难。
- [[pbft-1999]] —— 展示服务复制里如何处理拜占庭客户端请求。
- [[bitcoin]] —— asset transfer 是论文开头给出的主要应用动机。
- [[flink-snapshots-2015]] —— 工程系统里的快照更关注容错恢复，可和本文的语义保证对照。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
