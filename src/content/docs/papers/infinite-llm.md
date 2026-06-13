---
title: Infinite-LLM — 把注意力层拆出去，让 GPU 集群一起扛长上下文
来源: https://arxiv.org/abs/2401.02669
日期: 2026-06-13
分类: 分布式系统
子分类: LLM系统
provenance: pipeline-v3
---

## 从日常类比开始：合唱团的「声部分配」

想象一个合唱团在做演唱（LLM 推理）：

1. **歌词输入阶段（Prefill）**：歌手一次性拿到整段歌词，快速读一遍，然后唱出第一个音符。这一步像"大火爆炒"——所有人都要同时看同一份乐谱。

2. **逐字生成阶段（Decode）**：之后每唱一个词，歌手都要回头看之前所有唱过的歌词（KVCache），再决定下一个音。歌词越长，回顾的"乐谱"越厚，消耗的时间越多。

**传统做法**：每个合唱团（GPU 实例）独立负责自己的演唱。如果一个团的歌词特别长（长上下文），它需要把整本乐谱背下来——要么占用一台大合唱团的全部空间，要么干脆排不下。而那些歌词短的团，空间闲着也没用。

**Infinite-LLM 的做法**：把"回头看乐谱"这件事（Attention 层）从每个团的独立任务中拆出来，分配给集群里所有可用的"声部"。短团的空闲空间可以被长团借来存放部分乐谱，大家分工合作。

一句话：**不是让单张 GPU 变出更多显存，而是承认 Attention 层和其余层的资源需求不同，把 Attention 的计算和 KVCache 存储拆出去，用整个集群的显存池来服务。**

---

## 核心问题：为什么现有方案搞不定长上下文？

LLM 的推理有两个关键部分，它们的资源行为**截然不同**：

| 层类型 | 代表层 | 内存需求随上下文长度变化？ | 计算依赖 batch size？ |
|---|---|---|---|
| Attention 层 | QKV Linear + Multi-Head Attention | **是**——KVCache 随序列长度线性增长 | 否——每次只处理一个 token |
| 非 Attention 层 | FFN（前馈网络） | **否**——参数量固定 | **是**——batch 越大越能利用 GEMM |

这就是矛盾所在：

- **短请求**（1K token）：KVCache 很小，15GB 就够，甚至不到一张 A100 的容量。但如果为了同时支持 2000K token 而给每张实例分配 32 张 GPU，短请求就被"过度并行"了——FFN 层被切到太多 GPU，通信开销大，反而跑不快。
- **长请求**（1000K token）：KVCache 超过 500GB，相当于 7 张 A100 的容量。单张卡或少数几张卡根本存不下，必须跨卡分配。
- **同一张实例上**：长请求吃满了显存，batch size 被迫降到 1，FFN 层的计算利用率几乎为零。

传统的模型并行（Tensor Parallelism / Pipeline Parallelism）是**静态**的——每个实例分到的 GPU 数量在启动时就定死了。它无法根据请求的上下文长度动态调整 Attention 层和非 Attention 层的 GPU 分配。

---

## 核心概念 1：DistAttention — 注意力分布式计算的数学魔法

DistAttention 是 Infinite-LLM 最核心的创新。它回答了这个问题：**如果把 KVCache 按序列维度切分到不同 GPU 上，每个 GPU 怎么独立计算自己那部分的 Attention，而不需要把所有 KVCache 搬回来？**

### 原始 Attention 的痛点

标准 Attention 的计算公式是：

```
Attention(Q, K, V) = Σ [exp(QK^T - m_g) / Σ exp(QK^T - m_g)] * V
```

其中 `m_g = max(QK_1, ..., QK_seq)` 是**全局最大值**，需要在所有序列上取最大，再做全局求和。

如果直接把 KVCache 切分到多个 GPU 上，每个 GPU 只拿到一部分 K 和 V，那：
- 全局最大值 m_g 没法在局部计算
- 全局求和没法在局部完成
- 每次计算都要把所有 KVCache 从远程 GPU 搬回来

这会导致每个 decode 步骤都传输 GB 甚至 TB 级别的数据，彻底瘫痪性能。

### DistAttention 的数学等价变换

DistAttention 受在线 Softmax（online softmax）启发，对 Attention 公式做了等价变换，把全局操作拆解为**局部操作 + 少量聚合**：

**第一步**：每个 GPU（称为一个分片）在自己的局部序列上做独立的 Attention 计算：

```
m_j = max(QK_1, ..., QK_seq_p)   // 局部最大值
e_j = Σ exp(QK_i^T - m_j)         // 局部归一化因子
MA_j = Σ [exp(QK_i^T - m_j) * V_i] // 局部注意力加权和
```

**第二步**：各分片把自己的结果（只有 `MA_j`、`m_j`、`e_j` 三个小量）发回主 GPU 做聚合：

```
m_g = max(m_1, ..., m_b)              // 全局最大值
e_g = Σ e_j * exp(m_j - m_g)           // 全局归一化因子
Attention = Σ MA_j * exp(m_j - m_g) / e_g  // 加权求和
```

**关键点**：分片只需要传输 query 向量和 2 个 float 值（`e_j`、`m_j`），总共只有**几 KB** 的数据，而不是 GB 级别的 KVCache。

### 代码示例 1：DistAttention 原理示意

```python
import torch
import torch.nn.functional as F

def standard_attention(Q, K, V):
    """
    标准 Multi-Head Attention（单 GPU，所有 KVCache 本地）
    Q: [batch, heads, 1, d]       — 当前生成 token 的 query
    K: [batch, heads, seq, d]     — 完整 KVCache
    V: [batch, heads, seq, d]     — 完整 KVCache
    """
    # QK^T: [batch, heads, 1, seq]
    scores = torch.matmul(Q, K.transpose(-2, -1)) / (d ** 0.5)
    # softmax：逐行减去最大值做数值稳定
    scores = F.softmax(scores, dim=-1)
    # 加权求和
    output = torch.matmul(scores, V)  # [batch, heads, 1, d]
    return output


def dist_attention(Q, distributed_blocks, d):
    """
    DistAttention：KVCache 被切分为 b 个分片，各自存在不同 GPU 上
    Q:   [batch, heads, 1, d]              — 主 GPU 上的 query
    distributed_blocks: [(K_j, V_j), ...]   — 每个分片的局部 KVCache
    每个分片 (K_j, V_j) 形状为 [batch, heads, seq_p, d]
    """
    local_outputs = []  # 收集各分片的结果
    local_m = []        # 收集各分片的局部最大值
    local_e = []        # 收集各分片的局部归一化因子

    # ========== 第 1 步：各分片独立计算 ==========
    for K_j, V_j in distributed_blocks:
        # 局部 QK^T
        scores_j = torch.matmul(Q, K_j.transpose(-2, -1)) / (d ** 0.5)

        # 局部数值稳定：减去局部最大值
        m_j = scores_j.max(dim=-1, keepdim=True).values  # [batch, heads, 1, 1]
        stabilized = scores_j - m_j

        # 局部 softmax 的分子部分（不除以分母）
        exp_scores = torch.exp(stabilized)  # [batch, heads, 1, seq_p]

        # 局部加权和
        ma_j = torch.matmul(exp_scores, V_j)  # [batch, heads, 1, d]

        # 局部归一化因子：exp_scores 所有元素求和
        e_j = exp_scores.sum(dim=-1, keepdim=True)  # [batch, heads, 1, 1]

        local_outputs.append(ma_j)
        local_m.append(m_j)
        local_e.append(e_j)

    # ========== 第 2 步：主 GPU 聚合 ==========
    # 全局最大值：m_g = max(m_1, ..., m_b)
    m_g = torch.cat(local_m, dim=-1).max(dim=-1, keepdim=True).values

    # 全局归一化因子：e_g = Σ e_j * exp(m_j - m_g)
    weighted_e = sum(
        e_j * torch.exp(m_j - m_g)
        for m_j, e_j in zip(local_m, local_e)
    )
    e_g = weighted_e.sum(dim=-1, keepdim=True)

    # 加权求和：Attention = Σ MA_j * exp(m_j - m_g) / e_g
    weighted_outputs = sum(
        ma_j * torch.exp(m_j - m_g)
        for ma_j, m_j in zip(local_outputs, local_m)
    )
    output = weighted_outputs / e_g  # [batch, heads, 1, d]

    return output
```

**对比通信量**：
- 传统方案：每次 decode 需要传输整个 KVCache（对于 1000K token 可能是 **500GB+**）
- DistAttention：每次 decode 只传输 query（几 KB）+ 各分片的 `m_j`、`e_j`（每个分片只有几字节）

聚合步骤的计算量不到总计算量的 1%，完全可以忽略。

---

## 核心概念 2：集群级 KVCache 调度 — "债务人"与"债权人"

DistAttention 让 Infinite-LLM 可以按任意粒度拆分和调度 KVCache。这不仅仅是为了支持超长请求，更是为了**整体提升集群吞吐量**。

### 场景：四个 GPU 实例

```
实例 A：处理一个 1000K 长请求 → 显存占满，batch size = 1（FFN 利用率极低）
实例 B：处理短请求 → batch size = 50，但剩余大量空闲显存
实例 C：处理短请求 → batch size = 30，还剩不少显存
实例 D：处理一个 500K 长请求 → 显存快满了，batch size 被迫降到 3
```

### 两种调度策略对比

**策略 1：被动放置**（传统方法）
- 长请求的 KVCache 超出单实例容量时，才把新块放到有剩余空间的实例上
- 结果：实例 A 的 batch size 仍然是 1，实例 D 的新块和本地短请求抢资源

**策略 2：主动放置**（Infinite-LLM）
- 长请求还没占满当前实例时，就**主动**把部分 KVCache 块借给有闲余空间的实例
- 结果：实例 A 腾出显存，可以容纳更多短请求，batch size 从 1 提升到 10+
- 实例 B、C 虽然多承担了一点 Attention 计算，但因为它们的 FFN 计算本就轻松，影响很小

### 债务人与债权人模型

- **债务人（Debtor）**：借入显存来存放自己部分 KVCache 的实例（A、D）。好处是 batch size 能提升，吞吐量增加；代价是要额外做聚合计算。
- **债权人（Creditor）**：借出显存来存放他人部分 KVCache 的实例（B、C）。代价是自身的 batch size 可能下降；但因为 Attention 计算不依赖 batch，影响有限。

### 代码示例 2：调度决策简化示意

```python
from dataclasses import dataclass
from typing import List, Tuple

@dataclass
class Instance:
    id: str
    total_memory: float        # 总显存 (GB)
    used_memory: float         # 已用显存 (GB)
    batch_size: int            # 当前 batch size
    request_lengths: List[int] # 各请求的长度 (token 数)

    @property
    def free_memory(self) -> float:
        return self.total_memory - self.used_memory

    @property
    def is_creditor(self) -> bool:
        # 如果空闲显存 > 30%，有资格当债权人
        return self.free_memory > self.total_memory * 0.3

    @property
    def is_debtor(self) -> bool:
        # 如果显存使用率 > 90%，需要借钱
        return self.used_memory > self.total_memory * 0.9


def estimate_throughput(instance: Instance) -> float:
    """
    估算实例的吞吐量（tokens/second）
    非 Attention 层的吞吐量随 batch size 提升
    Attention 层的吞吐量随请求长度增加而下降
    """
    # 简化模型：非 Attention 层贡献
    non_attn_tp = instance.batch_size * 100  # 假设每请求 100 tok/s

    # Attention 层贡献：请求越长越慢
    avg_length = sum(instance.request_lengths) / max(len(instance.request_lengths), 1)
    attn_tp = 10000 / avg_length  # 10000 是参考点

    return non_attn_tp + attn_tp


def greedy_schedule(instances: List[Instance]) -> List[Tuple[str, str, float]]:
    """
    贪婪调度算法：每次选择让全局吞吐量提升最大的借/贷决策
    返回：[(债务人ID, 债权人ID, 借入显存GB), ...]
    """
    transfers = []

    # 标记债务人和债权人
    debtors = [inst for inst in instances if inst.is_debtor]
    creditors = [inst for inst in instances if inst.is_creditor]

    while debtors and creditors:
        best_gain = 0.0
        best_pair = None
        best_amount = 0.0

        for debtor in debtors:
            for creditor in creditors:
                # 尝试让 debtor 从 creditor 借入不同大小的显存
                max_transfer = min(
                    creditor.free_memory * 0.5,  # 债权人最多借出一半空闲
                    debtor.free_memory * 2,       # 债务人需要的"补偿空间"
                )
                if max_transfer <= 0:
                    continue

                # 模拟转移 20% 空闲显存
                transfer = max_transfer * 0.2
                # 计算转移后的全局吞吐量
                # （简化：实际 Infinite-LLM 使用更精确的性能模型）
                debtor_new_batch = min(
                    int(debater.batch_size * (1 + transfer / debtor.free_memory)),
                    128,
                )
                creditor_new_batch = max(
                    creditor.batch_size - 1,
                    1,
                )

                # 估算提升
                old_global = sum(estimate_throughput(i) for i in instances)
                # 模拟变更
                old_batch = debtor.batch_size
                debtor.batch_size = debtor_new_batch
                creditor.batch_size = creditor_new_batch
                creditor.used_memory += transfer
                creditor.free_memory -= transfer
                debtor.used_memory -= transfer
                debtor.free_memory += transfer

                new_global = sum(estimate_throughput(i) for i in instances)
                gain = new_global - old_global

                # 恢复
                debtor.batch_size = old_batch

                if gain > best_gain:
                    best_gain = gain
                    best_pair = (debtor.id, creditor.id)
                    best_amount = transfer

        if best_pair is None or best_gain <= 0:
            break

        transfers.append((best_pair[0], best_pair[1], best_amount))
        print(f"  调度: {best_pair[0]} <- {best_pair[1]} : {best_amount:.1f} GB (提升 {best_gain:.0f} tok/s)")
        debtors = [i for i in instances if i.is_debtor]
        creditors = [i for i in instances if i.is_creditor]

    return transfers


# 示例：模拟一个 32 GPU 集群的调度
instances = [
    Instance("A", 80, 76, 1, [1000000]),           # 债务人：长请求占满
    Instance("B", 80, 40, 50, [2000, 1500]),        # 债权人：短请求，大量空闲
    Instance("C", 80, 50, 30, [3000]),              # 债权人
    Instance("D", 80, 75, 3, [500000]),             # 债务人：中长请求
    Instance("E", 80, 20, 80, [500, 800, 300]),     # 债权人：大量空闲
]

print("=== 贪婪调度 ===")
print("初始吞吐量:", sum(estimate_throughput(i) for i in instances))
result = greedy_schedule(instances)
print("最终吞吐量:", sum(estimate_throughput(i) for i in instances))
print(f"执行了 {len(result)} 次调度")
```

---

## 核心概念 3：系统架构 — gManager + rManager

Infinite-LLM 采用**集中式调度 + 分布式执行**的架构：

- **gManager（全局管理器）**：单一控制器，运行调度算法，追踪整个集群的 KVCache 分布，协调实例间的通信。
- **rManager（本地管理器）**：每个 GPU 实例上一个，负责执行调度决策、管理本地 KVCache、处理 DistAttention 的通信。
- **协议**：定义了两个管理器之间的交互协议，包括 KVCache 的追踪、迁移和注意力结果的聚合。

为了优化通信开销，Infinite-LLM 还做了**通信重叠优化**：在本地 GPU 做模型推理的同时，异步地把 KVCache 块传输到债权人实例，让传输时间和计算时间重叠，而不是串行等待。

---

## 评估结果（32 张 A100）

| 指标 | 结果 |
|---|---|
| 支持的最大上下文长度 | **2000K tokens**（200 万 token） |
| 吞吐量提升 | 相比现有方法提升 **1.35-3.4 倍** |
| 对比基线 | 传统静态模型并行 + 单实例 KVCache 调度 |
| 实验数据集 | 上下文长度从 1 到 2000K token |

关键发现：Infinite-LLM 不仅解决了"超长上下文跑不了"的问题，更重要的是通过集群级资源调度，让短请求和长请求能够**互补利用资源**，整体吞吐量显著提升。

---

## 总结

Infinite-LLM 的核心洞察可以概括为一句话：

> **Attention 层和非 Attention 层的资源需求特性完全不同，用同一套静态并行策略来服务所有请求，必然导致一方浪费、一方不够。**

通过三个层层递进的创新，Infinite-LLM 解决了这个问题：

1. **DistAttention** — 数学上等价变换 Attention，让 KVCache 可以分布式存储和计算，通信开销从 GB 级降到 KB 级
2. **债务人/债权人调度** — 把集群显存当作一个池子，长请求从短请求的空闲空间中借内存，提升全局吞吐量
3. **gManager + rManager** — 集中调度 + 分布式执行，支持实时动态调整

这套思路对理解 LLM 推理系统的演进很重要——它标志着从"固定资源分配"到"动态资源池化"的范式转变。后续的系统（如 vLLM 的 PagedAttention、DeepSpeed-UltraScale 等）都在不同方向上延续了类似的资源解耦思想。
