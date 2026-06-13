---
title: AMP Arc Multi-Proposer Protocol with Bounded Inclusion
来源: https://arxiv.org/abs/2605.23677
日期: 2026-06-13
分类: 分布式系统
子分类: 共识与复制
provenance: pipeline-v3
---

# AMP：多提案者共识协议——零基础学习笔记

## 一、一个日常类比：餐厅点菜系统

想象一家餐厅，传统模式是这样运作的：

- 只有一位服务员（称为"区块组装者"）负责接收所有顾客的点单
- 这位服务员决定哪些订单能进菜单、按什么顺序做菜
- 问题来了：如果服务员故意不上一位顾客的菜（审查），或者为了赚小费把喜欢插队的 VIP 客人排在前面（MEV 操纵），你毫无办法

AMP 协议的做法完全不同：

- 餐厅请来多位服务员（称为"提案者"），每位都接收顾客点单
- 顾客把订单交给任意一位服务员，服务员打包成"托盘"（payload）
- 所有托盘送到厨房（验证者），厨师们互相确认收到哪些托盘
- 只要大多数厨师都确认某个托盘，它就**一定**会被做出来
- 最终上菜的顺序由一个固定的规则决定（按小费高低），而不是某个厨师说了算

这样，没有任何一个服务员可以单独决定"谁的菜不上"或"谁先吃"。

## 二、要解决的问题

区块链金融系统面临一个结构性矛盾：

**每个区块只有一个验证者负责组装交易。** 这个"区块组装者"拥有两项权力：

1. **排除权**：决定哪些交易进入区块，哪些被忽略
2. **排序权**：决定交易在区块中的执行顺序

这两项权力导致两个实际问题：

- **审查**：组装者可以故意延迟或忽略某些交易
- **MEV（最大可提取价值）**：组装者可以通过重新排序交易来牟利，比如"抢先交易"（front-running）和"三明治攻击"——这在传统金融市场是违法的

此外，单组装者模型还有性能瓶颈：吞吐量受限于一个节点的带宽，其余验证者的能力闲置。

## 三、核心概念

### 3.1 两层角色分离

AMP 的核心思想是把传统区块链中"区块组装者"的职责拆成两层：

| 角色 | 职责 | 类比 |
|------|------|------|
| **提案者（Proposer）** | 收集用户交易，打包成 payload，广播给所有验证者 | 餐厅里接收点单的多个服务员 |
| **验证者（Validator）** | 运行 Tendermint 共识，确认哪些 payload 应该入块 | 厨房里互相确认订单的厨师 |

关键区别：

- 提案者负责**传播**（带宽密集型）
- 验证者负责**达成共识**（延迟敏感型）
- 两者解耦后，网络可以同时利用多节点的处理能力，提高吞吐量

### 3.2 没有 Mempool

传统区块链有一个叫"内存池"（mempool）的地方，所有未确认的交易先堆积在那里，然后组装者从中挑选。

AMP 去掉了 mempool。用户交易直接进入提案者，提案者打包成 payload 后广播给验证者。交易只传播一次，不再重复。

### 3.3 有界包含保证（Bounded Inclusion Guarantee）

这是 AMP 最核心的安全保证：

> 如果一个 payload 被**所有诚实验证者**都确认过（即超过 2f+1 个验证者），那么它**必定**会在下一个区块中被包含。任何不包含这个 payload 的区块都会被诚实验证者拒绝。

这里的数学关系：

- 总共有 n 个验证者，最多 f 个可能出错
- 需要 n > 3f（少于三分之一出错才能安全）
- 一个"法定人数"是 2f+1 个验证者
- 如果一个 payload 获得超过 2f 次确认，那么即使 f 个坏验证者故意忽略它，也至少有 f+1 个诚实验证者确认了这个 payload —— 组装者无法绕过

### 3.4 确定性排序

即使多个提案者的 payload 进入同一个区块，AMP 用一个**确定性排序函数**来决定交易的执行顺序。这个函数按手续费优先级对交易排序，任何人用同样的输入都会得到同样的结果。

这意味着：

- 组装者不能随意改变交易顺序
- 用户知道他们的交易会按什么规则被处理
- MEV 空间被大幅压缩

### 3.5 投票扩展（Vote Extensions）

AMP 利用 Tendermint 共识的一个特性——"投票扩展"。在共识的 precommit 阶段，每个验证者可以在投票中附加一段应用层数据。

AMP 的做法：验证者在投票扩展中附带自己收到的 payload 的 ID 列表。这些 ID 被签名保护，无法篡改。区块组装者从这些投票扩展中提取出被超过 f 个验证者确认的 payload ID，放入新区块。

## 四、协议工作流程

整个流程分 8 步：

1. **收集**：提案者收集用户交易，打包成 payload
2. **传播**：提案者通过"尽力广播"（Best-Effort Broadcast）把 payload 发送给所有验证者
3. **验证**：验证者收到 payload 后检查是否合法，合法的存下来
4. **投票扩展**：共识阶段，验证者在 precommit 投票中附上自己待确认的 payload ID
5. **提议**：区块组装者提出当前高度（height）的 commit 证书（携带上一高度的投票扩展）
6. **验证提议**：其他验证者检查提议是否包含了所有被超过 f 个验证者确认的 payload
7. **达成共识**：达到法定人数后，确认一组 payload ID
8. **最终确定**：验证者根据确定性排序规则，将 payload 排序后最终确定

## 五、代码示例

### 示例 1：验证者收到 payload 后的处理逻辑

这段伪代码展示了一个验证者收到 payload 后的核心处理流程：

```python
# 验证者维护的状态
ordered = {}       # 已确定的 payload: {height: [payload_ids]}
payloads = {}      # 存储的 payload: {payload_id: payload_data}
pending = set()    # 待确认的 payload ID 集合
next_height = 1    # 下一个要最终确定的高度

# 步骤1: 收到提案者广播的 payload
def on_receive_payload(payload, proposer):
    pid = hash(payload)  # payload 的唯一标识
    
    # 检查是否已处理过、是否已存储、是否合法
    if pid not in ordered.values() and pid not in payloads and validate(payload):
        pending.add(pid)
        payloads[pid] = payload
        
        # 如果这个 payload 已经被共识确定，但还没最终交付，
        # 它会留在 pending 中等待排序后交付

# 步骤2: 共识阶段 - 生成投票扩展
def extend_vote(precommit_message):
    """在 Tendermint precommit 阶段调用"""
    # 返回所有待确认的 payload ID
    # 注意：已经在本轮被接受的 payload 不会再次被 attest
    return pending - get_ids_already_in(precommit_message.value)

# 步骤3: 验证其他验证者的投票扩展
def verify_vote_extension(precommit, extension):
    """验证投票扩展是否合法"""
    for payload_id in extension:
        if not is_valid_payload_id(payload_id):
            return False
    return True

# 步骤4: 达成共识后 - 提取被超过 f 个验证者确认的 payload
def on_decided(height, value, commit_certificate):
    """height 达成共识后调用"""
    
    # 从 commit certificate 的投票扩展中提取
    # 被超过 f 个验证者确认的 payload ID
    confirmed_ids = extract_sound_ids(commit_certificate)
    
    # 记录到 ordered 映射中
    ordered[height] = confirmed_ids
    
    # 从 pending 中移除已确定的
    pending -= set(confirmed_ids)
    
    # 存储 commit certificate，用于下一轮的提议
    store_commit_for_next_round(commit_certificate)

# 步骤5: 最终确定 - 按确定性规则排序并交付给应用层
def finalize_payloads():
    """当所有确定的 payload 都可用时调用"""
    while True:
        target_height = next_height
        
        # 检查这个高度是否有确定的 payload
        if target_height not in ordered:
            break
            
        ids = ordered[target_height]
        
        # 检查所有 payload 是否都已收到
        if any(payloads.get(pid) is None for pid in ids):
            break  # 缺少 payload，等待传播
            
        # 提取所有 payload 并按确定性规则排序
        payload_list = [payloads[pid] for pid in ids]
        sorted_payloads = sort_by_priority_fee(payload_list)
        
        # 交付给应用层（区块链状态机）
        trigger_finalized(target_height, sorted_payloads)
        
        next_height += 1
```

### 示例 2：从 commit certificate 中提取有效 payload ID

这段代码展示了如何从共识的 commit certificate 中找出被超过 f 个验证者确认的 payload ID：

```python
def extract_sound_ids(commit_certificate):
    """
    从 commit certificate 中提取被超过 f 个验证者确认的 payload ID。
    
    commit_certificate 是一个列表，包含：
    [(validator_A, extension_A), (validator_B, extension_B), ...]
    
    每个 extension 是该验证者在 precommit 投票中附带的 payload ID 列表。
    
    返回：被超过 f 个验证者提及的 payload ID 集合。
    """
    count = {}  # payload_id -> 确认它的验证者数量
    
    for validator, extension in commit_certificate:
        for payload_id in extension:
            count[payload_id] = count.get(payload_id, 0) + 1
    
    # 只返回被超过 f 个验证者确认的 payload
    # 因为最多 f 个验证者可能是恶意的，
    # 超过 f 就意味着至少有一个诚实验证者确认了它
    sound_ids = {pid for pid, cnt in count.items() if cnt > f}
    
    return sound_ids


# 使用示例
# 假设有 7 个验证者，最多允许 f=2 个恶意节点
# commit_certificate 包含 7 个 (validator, extension) 对

f = 2  # 最大容错数

# 模拟 commit certificate
commit_cert = [
    ("validator_1", ["tx_001", "tx_002"]),   # 诚实
    ("validator_2", ["tx_001", "tx_003"]),   # 诚实
    ("validator_3", ["tx_001", "tx_002"]),   # 诚实
    ("validator_4", ["tx_002"]),              # 诚实
    ("validator_5", ["tx_001", "tx_003"]),   # 诚实
    ("validator_6", ["tx_002"]),              # 恶意（少确认）
    ("validator_7", []),                      # 恶意（不确认）
]

# 统计每个 payload 被确认的次数
count = {}
for validator, extension in commit_cert:
    for pid in extension:
        count[pid] = count.get(pid, 0) + 1

print("确认计数:", count)
# 输出: {'tx_001': 4, 'tx_002': 4, 'tx_003': 2}

# 提取 sound IDs（超过 f=2 次确认）
sound_ids = {pid for pid, cnt in count.items() if cnt > f}
print("有效 payload:", sound_ids)
# 输出: {'tx_001', 'tx_002'}
# tx_003 只有 2 次确认，不大于 f=2，所以不被包含
# 这意味着 tx_001 和 tx_002 必定在下个区块中被最终确定
```

## 六、AMP 的安全保证

### 6.1 安全性（Safety）

- 继承自 Tendermint：如果少于 1/3 的验证者作恶，永远不会产生两个不同的共识结果
- AMP 的额外保证：任何被超过 2f 个验证者确认的 payload 一定会出现在下一个区块中

### 6.2 活性（Liveness）

- 继承自 Tendermint：在网络最终同步后，系统最终会达成共识
- AMP 保证了被正确广播的 payload 不会被无限期延迟

### 6.3 抗审查性

- 没有单个实体可以排除特定交易
- 提案者可以选择不打包某笔交易，但只要有一笔提案者打包并广播，验证者就会确认它

### 6.4 MEV 缓解

- 确定性排序消除了组装者通过重新排序获利的能力
- payload 的传播与共识解耦，减少了抢先交易的机会窗口

## 七、设计权衡

AMP 不是没有代价的：

1. **额外延迟**：payload 需要先传播给所有验证者，经过共识确认，才能入块。这比传统模式多了一轮通信
2. **提案者需要信任**：虽然单个提案者不能审查交易（其他提案者可以覆盖），但用户需要确保至少有一个诚实的提案者接收并广播自己的交易
3. **复杂性增加**：需要维护 payload 存储、投票扩展、确定性排序等多层逻辑
4. **动态验证者集尚需解决**：论文指出验证者集合的动态变化是一个开放问题

## 八、与传统方案的对比

| 方案 | 多提案者 | 消除 mempool | 有界包含保证 | 确定性排序 |
|------|---------|-------------|------------|-----------|
| 传统 Tendermint | 否 | 否 | 否 | 否 |
| AMP | 是 | 是 | 是 | 是 |
| DAG 方案（Narwhal/Tusk） | 是 | 是 | 部分 | 部分 |
| FOCIL（以太坊） | 否 | 否 | 部分 | 否 |

## 九、总结

AMP 的核心贡献可以用一句话概括：**把"谁的交易进块"和"交易按什么顺序执行"这两件事，从单个验证者的手中拿走，交给一组提案者和共识机制共同决定。**

它的设计哲学是"分离关注点"：

- 传播归传播（提案者做）
- 共识归共识（验证者做）
- 排序归排序（确定性算法做）

这三件事各自做各自擅长的，合在一起就是一个既高效又公平的区块链交易处理系统。对于金融级的区块链应用来说，这种公平性不是锦上添花，而是刚需。

## 十、延伸阅读

- Arc L1 区块链：[Arc: An Open Layer-1 Blockchain Purpose-Built for Stablecoin Finance](https://arxiv.org/abs/2403.xxxxx)
- Tendermint 共识算法原文
- MEV 相关文献：Flash Boys 2.0
- FOCIL（EIP-7805）：以太坊的强制包含列表提案
- MPCP（Multiple Concurrent Proposers）：多并发提案者方案
