---
title: "Chop Chop: Byzantine Atomic Broadcast to the Network Limit"
来源: 'https://www.usenix.org/conference/osdi24/presentation/camaioni'
日期: 2026-06-13
分类: 分布式系统
子分类: 分布式共识
provenance: pipeline-v3
---

## 是什么

Chop Chop 是一个**拜占庭原子广播系统**（Byzantine Atomic Broadcast, BAB）。它的目标是：在存在恶意节点（拜占庭故障）的网络中，让所有诚实节点以**相同的顺序**看到**相同的一批消息**，并且速度接近"什么都不保护"时的极限。

日常类比：想象一个餐厅厨房有 N 个厨师（server），每个厨师从不同顾客那里收到点菜单（client message）。要求是：
1. 所有厨师最终按**完全相同的顺序**做菜
2. 如果某个厨师故意把菜单搞乱、伪造订单、或者拒绝上菜（拜占庭故障），其他诚实厨师不受影响
3. 即使每张小纸条只有 8 个字节（比如"加盐"），整个厨房也能以网络线速运转

传统方案（如 PBFT）在处理小消息时，每个消息都要单独签名、排序、验证，开销巨大。Chop Chop 的核心想法是：**把大量小消息"蒸馏"成一个批次，然后一次性验证整批**，就像把 1000 张 8 字节的小纸条压缩成一个密封信封——拆封时只需验一次印章。

## 为什么重要

不理解原子广播，就无法理解下面这些系统：
- **区块链**：比特币的 Nakamoto Consensus、以太坊的 Beacon Chain 本质上都是原子广播的变体——所有节点按相同顺序执行交易
- **Hyperledger Fabric / AWS Managed Blockchain**：企业级联盟链的排序服务（orderer）就是原子广播
- **State Machine Replication（状态机复制）**：数据库复制、分布式事务（如 TSMR）的基石
- **BLS 签名聚合**：Chop Chop 的高效蒸馏依赖 BLS 批量签名，这本身就是现代密码学的重要优化

如果原子广播太慢，整个区块链 TPS 就被锁死。Chop Chop 在 64 台中等服务器上达到 **4360 万条消息/秒**，延迟 3.6 秒，比当时最优方案高两个数量级。

## 核心概念

### 1. 原子广播的三要素

原子广播要求每个节点输出的消息序列满足：

- **一致序（Agreement）**：所有诚实节点按相同顺序看到消息
- **完整性（Integrity）**：每条消息最多被交付一次（去重）
- **真实性（Authenticity）**：每条消息都有合法签名

### 2. Distillation（蒸馏）—— Chop Chop 的杀手锏

传统方案对每条消息单独做签名验证和排序，复杂度是 O(N × M)，N 是消息数，M 是验证成本。Chop Chop 发明了 **distillation**：

1. Client 发送消息给 broker（facilitator）
2. Broker 收集一批消息，用 BLS 签名把它们"蒸馏"成一个聚合签名
3. Server 收到一批消息后，**只用一次签名验证**就能确认整批消息的真实性

这就像：传统方式是你每收到一封邮件都要当面核对寄件人印章；Chop Chop 是把 1000 封信装进一个保险箱，箱子上只有一个大印章——打开箱子前只需验一次。

### 3. Authenticated Memory Pool（认证内存池）

Chop Chop 引入了一个**未受信的 facilitator 层**（broker），位于 client 和 server 之间。Broker 负责收集、排序、聚合消息，但不存储最终状态。Server 维护一个"认证内存池"，只有经过蒸馏验证的消息才会进入池并参与共识。

```
Client A ──→ Broker 1 ──┐
Client B ──→ Broker 1 ──┤
Client C ──→ Broker 2 ──┼──→ Server 1 ──→ 共识层 ──→ 执行层
Client D ──→ Broker 2 ──┤                         ↓
Client E ──→ Broker 3 ──┘                    Server 2-64
```

### 4. BLS 签名聚合

BLS（Boneh-Lynn-Shacham）签名允许将多个签名压缩为一个。Chop Chop 用它来实现：

- N 个消息的 N 个签名 → 聚合为 1 个签名
- 验证成本从 O(N) 降到 O(1)
- 这是蒸馏能"摊薄"签名开销的数学基础

## 代码示例

### 示例 1：蒸馏前 vs 蒸馏后的签名开销对比

```python
# ===== 传统方式：每条消息单独签名 =====
messages = [b"tx-001", b"tx-002", b"tx-003"]  # 假设 1000 条
signatures = []
for msg in messages:
    sig = schnorr_sign(private_key, msg)       # 每条消息做一次签名
    signatures.append(sig)

# 验证端：每条消息单独验证
for msg, sig in zip(messages, signatures):
    assert schnorr_verify(public_key, msg, sig)  # 1000 次验证

# 总签名大小: 1000 × 64 bytes = 64 KB
# 总验证次数: 1000 次
```

```python
# ===== Chop Chop 蒸馏方式：批量签名聚合 =====
messages = [b"tx-001", b"tx-002", b"tx-003"]  # 同样 1000 条
bls_messages = [hash_to_curve(msg) for msg in messages]

# 签名端：聚合签名
aggregated_sig = bls_aggregate_signatures(bls_messages, private_key)

# 验证端：一次验证整批
assert bls_verify_aggregate(public_key, bls_messages, aggregated_sig)

# 总签名大小: 1 × 64 bytes = 64 bytes（压缩了 1000 倍！）
# 总验证次数: 1 次
```

### 示例 2：Chop Chop 的 distillation 协议流程

```python
# ===== 简化版 distillation 交互 =====

class DistillationProtocol:
    def __init__(self, num_servers, threshold):
        # 需要 f+1 个 broker 签名才能构成有效批次（f = 最大拜占庭数）
        self.threshold = threshold
        self.batch_signatures = {}  # batch_id → List[sig]

    def on_client_message(self, client_id, message, signature):
        """Client 发送消息给 broker"""
        batch_id = compute_batch_hash(message)
        # broker 收集消息和签名
        self._collect_signature(batch_id, client_id, signature)

    def _collect_signature(self, batch_id, client_id, sig):
        """broker 累积签名，达到阈值后提交给 server"""
        if batch_id not in self.batch_signatures:
            self.batch_signatures[batch_id] = []

        self.batch_signatures[batch_id].append((client_id, sig))

        # 达到 threshold 个签名 → 蒸馏完成，打包成 batch 发给 server
        if len(self.batch_signatures[batch_id]) >= self.threshold:
            batch = self._build_distilled_batch(batch_id)
            self._submit_to_consensus(batch)

    def _build_distilled_batch(self, batch_id):
        """构建蒸馏批次：消息列表 + BLS 聚合签名"""
        clients, sigs = zip(*self.batch_signatures[batch_id])
        aggregated_sig = bls_aggregate(sigs)
        return {
            "batch_id": batch_id,
            "messages": list(zip(clients, sigs)),  # (client_id, individual_sig)
            "aggregate_sig": aggregated_sig,
        }

    def _submit_to_consensus(self, batch):
        """提交到共识层排序和交付"""
        consensus.submit(batch)


# ===== Server 端验证 =====
def verify_distilled_batch(batch, public_keys):
    """server 收到蒸馏批次后的一次性验证"""
    # 提取所有消息的哈希
    message_hashes = [hash_to_curve(msg) for _, msg in batch["messages"]]
    # 一次验证聚合签名
    return bls_verify_aggregate(public_keys, message_hashes, batch["aggregate_sig"])
```

### 示例 3：性能对比示意

```python
# 假设 64 台服务器、geo-distributed 部署
# Chop Chop vs 传统 BFT 方案

metrics = {
    "protocol":          ["Chop Chop", "HotStuff-BLS", "PBFT"],
    "throughput_mmsg_s": [43.6,         0.43,          0.01],    # 百万条/秒
    "latency_seconds":   [3.6,          3.6,           3.6],     # 相同延迟
    "min_msg_size":      ["8 bytes",    "64 bytes",    "64 bytes"],
}

# Chop Chop 在 8 字节最小消息尺寸下仍保持线速
# 传统方案在小消息场景下签名/排序开销占主导
# 蒸馏让签名开销被 batch 大小摊薄到可忽略
```

## 架构拆解

### 三层架构

1. **Client 层**：生成消息并签名，发送给 broker
2. **Broker（Facilitator）层**：未受信，负责收集、排序、聚合消息。这是 Chop Chop 的创新点——把"重活"交给一个可以批量处理的中间层
3. **Server 层**：接收蒸馏批次，进入共识排序，最终交付执行

### 关键设计决策

- **Broker 不可信**：即使 broker 作恶，只要超过 2/3 的 server 诚实，系统仍然安全
- **Distillation 是交互式的**：broker 需要与多个 client 交互来积累足够签名
- **不改变共识本身**：Chop Chop 的 distillation 可以叠加在任何 BFT 共识之上（如 HotStuff）

## 踩过的坑

1. **不要混淆 distillation 和压缩**：蒸馏不是数据压缩，而是密码学签名聚合。数据本身不缩小，缩小的是签名开销
2. **不要假设 broker 可靠**：broker 是"未受信"的。如果 broker 丢弃消息或重新排序，server 层的共识会处理——但 throughput 会下降
3. **不要忽视阈值选择**：threshold 太低不安全，太高延迟增加。Chop Chop 选择 f+1（f = 拜占庭容错上限），这是理论最优
4. **BLS 聚合不是免费的**：聚合签名验证需要配对运算（pairing），虽然比 N 次验证快得多，但在资源受限设备上仍有成本

## 适用 vs 不适用场景

**适用**：
- 高吞吐区块链（需要百万级 TPS）
- 微秒/纳秒级小消息场景（IoT 传感器、高频交易信号）
- 多租户 DLT（多个租户共享同一排序服务）
- 需要拜占庭容错的高频消息流

**不适用**：
- 不需要拜占庭容错的场景（crash-only → 用 Raft/Paxos 更简单）
- 极低吞吐场景（几 msg/s → 传统 PBFT 足够）
- 消息大小本身就很大（> KB 级别 → distillation 的摊薄效果不明显）

## 学到什么

1. **把"逐条处理"改成"批量蒸馏"是性能跃迁的关键**——签名验证从 O(N) 降到 O(1) 不是优化，是范式转换
2. **引入"未受信中间层"可以解耦复杂度**——broker 做脏活累活，server 专注共识
3. **密码学原语的选择直接影响系统架构**——BLS 聚合签名让 distillation 成为可能，换了 Schnorr 就做不到同等效果
4. **理论界限是可以逼近的**——Chop Chop 证明 BAB 可以达到"网络线速"，即复杂度趋近于不做任何保护的基线协议

## 延伸阅读

- 论文 arXiv 版：[Chop Chop — arXiv](https://arxiv.org/abs/2401.03336)
- HotStuff 共识：[Wang et al., PODC 2019](https://arxiv.org/abs/1803.05069)（Chop Chop 的蒸馏可以叠加在 HotStuff 上）
- BLS 签名：[Boneh-Lynn-Shacham, Crypto 2001](https://link.springer.com/chapter/10.1007/3-540-44586-X_5)
- PBFT：[Castro & Liskov, OSDI 1999](https://www.usenix.org/legacy/events/osd99/tech/full_papers/castro/castro.pdf)（原子广播的经典方案）
- BullShark：[CCS 2022](https://dl.acm.org/doi/10.1145/3548606.3560638)（另一种高性能 BFT 方案，对比参考）

## 关联

- [[paxos]] —— 原子广播的非拜占庭版本；理解 Paxos 是理解 BAB 的第一步
- [[hotstuff]] —— Chop Chop 的蒸馏可以叠加在 HotStuff 共识之上
- [[bls-signature]] —— BLS 签名聚合是 distillation 的密码学基础
- [[pbft]] —— 传统拜占庭原子广播的代表，Chop Chop 要超越的对象
- [[state-machine-replication]] —— 原子广播是状态机复制的排序层
