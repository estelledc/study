---
title: AMP 多提议者协议 — 有界包含保证与抗审查交易排序
来源: 'Daniel Cason, Gordon Liao, Sergio Mena, Nenad Milošević, Adi Seredinschi, Alessandro Sforzin, João Sousa, Preston Vander Vos. "AMP: Arc Multi-Proposer Protocol with Bounded Inclusion Guarantees". arXiv 2605.23677, 2026'
日期: 2026-06-13
分类: 分布式系统
子分类: 共识与复制
难度: 中级
provenance: pipeline-v3
---

## 是什么

AMP 是一套**让多个节点的交易打包结果都不能被单个人说了算**的区块链协议。日常类比：一家餐厅不再只有一个服务员收单——同时有多个服务员接单，每位服务员把得到的小条（交易）打包成一个托盘（payload），所有托盘送到厨房（验证者节点），厨师们互相确认"我们都看到了哪些托盘"，最后由固定规则（不是某个厨师的偏好）决定上菜顺序。

传统区块链中，每个区块由**一个验证者**负责组装。这个验证者对"哪些交易能进区块"和"交易按什么顺序执行"拥有单边决定权。这导致两个实际问题：

- **审查**：组装者可以故意延迟或永远不包含某些用户的交易
- **MEV（最大可提取价值）**：组装者通过重排交易顺序牟利，如抢先交易（front-running）和三明治攻击——这在传统金融市场属于违法行为

AMP 的做法是把"传播交易"和"对交易集合达成共识"拆成两层：**提议者**（proposer）负责收交易、打包、广播；**验证者**（validator）负责在共识过程中公开确认自己收到了哪些 payload，最后由**确定性排序算法**决定执行顺序。这样，没有任何单一节点能控制"谁进块"或"谁先跑"。

## 为什么重要

不理解 AMP 协议，下面这些事都没法解释：

- 为什么区块链金融系统被监管机构盯上"交易公平性"——传统交易所禁止的 front-running 在单验证者区块链中无法被协议层阻止
- 为什么"多提议者"不是简单的多加几个组装节点——多提议者的 payload 必须经过共识确认，否则不同节点看到的交易集合会不一致
- 为什么去掉 mempool 能提升吞吐量——传统区块链每笔交易在 mempool 和区块间传播多次，AMP 的交易只传播一次
- 为什么确定性排序比"让验证者排"更公平——确定性排序让每个人跑的排序结果完全相同，消除了排序操纵的空间

## 核心要点

AMP 的设计可以拆成**四个关键机制**：

1. **解耦传播与共识**：把传统区块链中混在一起的"收交易、挑交易、排顺序"拆成两层——提议者只负责收和广播（带宽密集型），验证者只负责共识确认（延迟敏感型）。类比：快递分拣和包裹签收分开——分拣员只管打包分发，签收员只管确认收货，各做各擅长的。

2. **有界包含保证（Bounded Inclusion Guarantee）**：如果某个 payload 被**超过 f 个验证者**在投票扩展中确认过（f 是系统容忍的最大恶意节点数），那么它**必定**会出现在下一个区块中。数学直觉：总共有 n 个验证者，最多 f 个作恶。如果一个 payload 获得了超过 f 个确认，即使 f 个恶意节点故意忽略它，也至少有 1 个诚实验证者确认了它——这 1 个诚实验证者的确认在共识中无法被绕过。

3. **投票扩展（Vote Extensions）**：利用 Tendermint 共识 precommit 阶段的扩展字段，验证者在投票时附上自己收到的 payload ID 列表。这些 ID 被签名保护。区块组装者从投票扩展中统计每个 payload 被确认的次数，超过 f 次确认的 payload 必须进入新区块。类比：开会表决时，每人在举手表决的同时递一张纸条列出"我今天收到哪些提案"，主持人统计纸条后决定哪些提案必须上议程。

4. **确定性排序**：所有进入区块的 payload 按手续费优先级排序——同一个输入，任何人跑出来的顺序完全相同。这意味着用户提前知道自己的交易会排在哪里，验证者无法偷偷调换顺序。类比：餐厅按小费高低上菜，规则公开透明，不像某个服务员私下把朋友的单往前插。

## 实践案例

### 案例 1：验证者收到 payload 后的完整处理流程

以下伪代码展示了一个验证者从收到 payload 到最终交付的核心状态维护：

```python
# 验证者维护的状态
ordered = {}       # 已确定: {height: [payload_ids]}
payloads = {}      # 存储: {payload_id: payload_data}
pending = set()    # 待确认的 payload ID

# 步骤1: 收到提案者广播的 payload
def on_receive_payload(payload):
    pid = hash(payload)
    # 检查：没处理过、没存过、合法
    already_seen = any(pid in ids for ids in ordered.values())
    if not already_seen and pid not in payloads and validate(payload):
        pending.add(pid)
        payloads[pid] = payload

# 步骤2: 生成投票扩展（Tendermint precommit 阶段）
def extend_vote(current_round_value):
    """返回本验证者确认的 payload ID 集合"""
    # 排除本轮已接受的 payload
    already_in = get_ids_from(current_round_value)
    return pending - already_in

# 步骤3: 共识达成后提取有效 payload
def on_decided(height, commit_certificate):
    # 从所有验证者的投票扩展中统计
    confirmed = extract_sound_ids(commit_certificate)
    ordered[height] = confirmed
    pending -= set(confirmed)

# 步骤4: 确定性排序后最终交付
def finalize():
    for height in sorted(ordered):
        ids = ordered[height]
        # 确定所有 payload 都已收到
        if any(pid not in payloads for pid in ids):
            break  # 等待传播
        payload_list = [payloads[pid] for pid in ids]
        sorted_list = sort_by_priority_fee(payload_list)
        deliver_to_app(sorted_list)
```

**逐部分解释**：

- `pending` 是待确认池——收到就放进去，等共识确认后移除
- `extend_vote` 是 AMP 的核心创新——验证者不只是投票"我同意这个区块"，还顺带说"我确认收到了这些 payload"
- `extract_sound_ids` 统计超过 f 个验证者确认的 payload ID（见案例 2）
- `finalize` 中的 `sort_by_priority_fee` 是确定性排序——任何诚实节点对同一组 payload 排出来的顺序完全一致

### 案例 2：从 commit certificate 中提取有效 payload ID

这段代码解释了有界包含保证的数学实现：

```python
def extract_sound_ids(commit_certificate):
    """
    commit_certificate: [(validator_id, extension), ...]
    extension: 该验证者在 precommit 中附带的 payload ID 列表
    返回: 被超过 f 个验证者确认的 payload ID
    """
    count = {}  # payload_id -> 确认该 id 的验证者数量
    for validator, extension in commit_certificate:
        for pid in extension:
            count[pid] = count.get(pid, 0) + 1

    # 关键数学: > f 意味着至少一个诚实验证者确认了它
    sound_ids = {pid for pid, cnt in count.items() if cnt > f}
    return sound_ids

# 示例: 7 个验证者, f=2 (最多容忍 2 个作恶)
f = 2
commit_cert = [
    ("v1", ["tx_A", "tx_B"]),  # 诚实
    ("v2", ["tx_A", "tx_C"]),  # 诚实
    ("v3", ["tx_A", "tx_B"]),  # 诚实
    ("v4", ["tx_B"]),           # 诚实
    ("v5", ["tx_A", "tx_C"]),  # 诚实
    ("v6", ["tx_B"]),           # 恶意（少确认）
    ("v7", []),                 # 恶意（不确认）
]

# 统计: tx_A: 4, tx_B: 4, tx_C: 2
# tx_A 和 tx_B 有 4 次确认 > f=2, 保证进块
# tx_C 只有 2 次确认, 不大于 f=2, 不保证
```

**逐部分解释**：

- `f` 是拜占庭容错参数——n > 3f 是 Tendermint 的安全前提
- `count > f` 的逻辑：即使 f 个恶意节点故意忽略某个 payload，但只要超过 f 个节点确认了它，就**至少有一个诚实验证者**确认了
- tx_C 只有 2 次确认 = f，不满足 > f，说明可能所有确认来自恶意节点（它们可以假装确认了但实际上没有），所以不能保证包含

### 案例 3：确定性排序对抗 MEV——为什么排序规则必须公开

```python
def sort_by_priority_fee(payloads):
    """
    确定性排序: 同一组输入 → 同一组输出, 任何人跑结果一样
    规则: 按每笔交易的 gas fee 降序排列, fee 相同则按交易哈希字典序
    """
    all_txs = []
    for payload in payloads:
        all_txs.extend(payload.transactions)

    # 排序键: (负的 fee 实现降序, 哈希保证确定性)
    all_txs.sort(key=lambda tx: (-tx.fee_per_gas, tx.hash))
    return all_txs

# 为什么这能对抗 MEV:
# 场景: Alice 出价 100 gas 买 token, Bob 出价 50 gas 也想买
# 单验证者模式: 组装者可以先跑 Bob 的交易再跑 Alice 的,
#   从价差中获利 (三明治攻击)
# AMP 模式: 所有验证者跑同一个 sort_by_priority_fee,
#   Alice (100 > 50) 一定排在 Bob 前面, 组装者无法调换
```

**逐部分解释**：

- 排序键的第二维 `tx.hash` 是关键——fee 相同时必须有 tiebreaker，否则不同实现可能出不同结果
- 确定性排序不消除 MEV 本身（跑在前面的交易仍有信息优势），但消除了**验证者通过操纵排序来牟利**的空间
- 用户提前知道排序规则，可以据此出价——这类似于传统交易所的"价格优先、时间优先"规则

## 踩过的坑

1. **额外延迟不能忽视**：payload 需要先广播到所有验证者，再经共识确认，比传统单验证者模式多一轮通信延迟。如果你的应用对出块时间极度敏感（毫秒级），这多出来的一轮可能影响体验。

2. **提议者并不是越多越好**：多一些提议者增加抗审查性（总有诚实提议者收你的交易），但也增加带宽消耗——每个提议者都在向所有验证者广播 payload。实际部署需要根据网络条件调参。

3. **投票扩展的消息体积**：每个验证者在 precommit 投票中附带的 payload ID 列表会增加共识消息的大小。如果 payload 数量急剧增长，投票扩展可能成为瓶颈——这是 Tendermint 投票扩展机制本身的设计权衡。

4. **交易提交不等于最终确认**：用户把交易发给提议者后，交易进入 pending 状态，但要等下一轮共识才能确认入块。这期间如果提议者宕机，交易可能丢失——用户需要**重发**给另一个提议者。这不是 bug，是协议为去中心化付出的必要代价。

## 适用 vs 不适用场景

**适用**：

- 金融级区块链——交易公平性（不能被人为审查或排序操纵）是刚需
- 需要高吞吐量的去中心化系统——多个提议者并行处理交易，解耦传播和共识利用多节点带宽
- 有明确排序规则的应用——如按手续费排序的 DEX，排序规则对用户完全透明
- 希望消除 mempool 瓶颈的链——传统 mempool 中交易被重复传播，AMP 的一轮广播更高效

**不适用**：

- 对延迟极度敏感的单机或小规模系统——多一轮共识通信的延迟加成可能不值得
- 不需要抗审查的场景（如私有链、联盟链）——单验证者模型更简单，维护成本更低
- 所有交易必须严格按接收时间排序的场景——确定性排序不保留"谁先到"的时间顺序
- 验证者数量很少的系统（n 小导致 f 也很小）——有界包含保证的数学边界变弱

## 历史小故事（可跳过）

- **2016 年**：Ethan Buchman 提出 Tendermint 共识算法——第一个实用的 BFT 共识引擎，奠定了 Cosmos 生态的基础。Tendermint 的投票扩展（vote extension）机制后来成为 AMP 的核心构件。

- **2020 年**：Daian 等人发表 "Flash Boys 2.0"，系统性地揭示了以太坊上 MEV 的规模和危害——套利机器人通过抢先交易每年提取数亿美元的价值。这让学术界和工业界开始认真对待"交易排序公平性"问题。

- **2022 年**：Narwhal/Tusk 提出基于 DAG 的多提议者架构，证明了分离传播层和共识层可以显著提升吞吐量。AMP 继承了这一设计哲学，但选择了不同的实现路径（基于 Tendermint 而非 DAG）。

- **2024-2025 年**：以太坊社区提出 FOCIL（Fork-Choice Enforced Inclusion Lists）等方案，试图在以太坊的单验证者框架中引入抗审查机制。但这些方案是"打补丁"，没有从根本上改变单验证者架构。

- **2026 年**：Daniel Cason 等 8 位作者发表 AMP 论文，作为 Arc L1 区块链的核心协议组件。Arc L1 定位为稳定币金融专用区块链——在这个场景中，交易公平性和抗审查不是锦上添花，而是监管合规的刚需。

## 学到什么

1. **"谁决定谁的交易进块"是区块链设计的核心问题**——不是性能问题，是权力问题。AMP 展示了如何通过协议设计来分散这种权力，而不是依赖对验证者"别作恶"的道德期望。

2. **解耦是一种通用设计模式**——把传播（dissemination）和共识（agreement）拆开，让两个层各自优化，整体性能超过混在一起的单层方案。这和 CPU 的流水线设计思路类似：把一件事拆成多个独立步骤，每一步可以并行处理不同的数据。

3. **有界包含保证是"软保证"和"硬保证"的折中**——不强求每笔交易都入块（那不现实），但承诺"只要获得了足够的验证者确认，就绝对不落下"。这种 pragmatic 的设计思路在分布式系统中很常见。

4. **交易公平性是区块链走向主流金融必须解决的问题**——传统金融市场有成熟的监管框架来防止市场操纵，区块链不能指望靠"去中心化"三个字就自动解决这个问题。AMP 展示了一条技术路线：用协议机制而非外部监管来实现交易公平。

## 延伸阅读

- 论文原文：[AMP: Arc Multi-Proposer Protocol with Bounded Inclusion Guarantees](https://arxiv.org/abs/2605.23677)（2026）
- [[tendermint-2016]] —— AMP 的共识底座，Buchman 2016 年提出的 BFT 共识引擎
- [[narwhal-tusk-2022]] —— 另一个多提议者架构，基于 DAG 的分层设计，与 AMP 的设计哲学对比
- [[daian-flash-boys-2020]] —— MEV 问题的经典揭露，理解"为什么需要 AMP"的前置阅读
- [[byzantine-generals-1982]] —— 拜占庭将军问题，所有 BFT 共识协议的理论源头
- [[hotstuff-2019]] —— 另一个 BFT 共识协议变体，可对比理解不同共识设计的取舍

## 关联

- [[tendermint-2016]] —— AMP 构建在 Tendermint 共识之上，复用其投票扩展机制和 BFT 安全假设
- [[narwhal-tusk-2022]] —— 同样解耦传播与共识，但用 DAG 做传播层，是 AMP 最主要的对比方案
- [[daian-flash-boys-2020]] —— 揭示 MEV 问题的严重性，AMP 的确定性排序正是针对这类攻击
- [[byzantine-generals-1982]] —— AMP 的安全性建立在拜占庭容错假设之上（n > 3f）
- [[pbft-1999]] —— 实用拜占庭容错的开山之作，Tendermint 和 AMP 的思想源头
- [[hotstuff-2019]] —— 另一种 BFT 共识设计，线性通信复杂度，与 Tendermint 的设计取舍不同
- [[flp-1985]] —— FLP 不可能性定理：异步网络中确定性共识不可能，理解 AMP 为何要"最终同步"假设

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
