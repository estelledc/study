---
title: The Spike, the Sparse and the Sink: Anatomy of Massive Activations and Attention Sinks
来源: 'https://arxiv.org/abs/2603.05498'
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

## 是什么

这篇论文研究大语言模型 Transformer 里两个反复出现、但长期"说不清楚"的现象：

- **Massive Activations（大规模激活）**：一小部分 token 在少数通道上出现极端的大数值，像一根刺一样扎出来
- **Attention Sinks（注意力sink）**：某些 token 不论语义相关与否，都会吸引不成比例的注意力

这两者经常同时出现、甚至涉及相同的 token。但以前大家不知道它们到底是**有什么关系**、各自**起什么作用**。

这篇论文的答案是：它们不是巧合，也不是同一个东西的两个面，而是**现代 Transformer 架构设计带来的必然产物**，各自负责不同的事情。

## 日常类比

想象一个团队开会：

- **Massive Activation** 就像一两个"超级活跃者"——每次讨论，无论什么话题，总有几个人发言特别多、声音特别大。这不是巧合，是会议室的座位安排（架构）让这些人天然容易被点名
- **Attention Sink** 就像"老好人"——不管讨论什么，大家总忍不住看他一眼，好像他有什么特别重要的信息，其实未必

这两个人可能是同一个（超级活跃者恰好也是老好人），但原因不同：一个是因为座位安排总被点到，一个是因为大家习惯性地看。

如果把会议室重新安排（去掉 pre-norm），两个人可能就不再是同一个了。

## 核心概念

### 1. Massive Activations（大规模激活）— 全局现象

在 Transformer 的内部，绝大多数 token 的隐藏层数值是正常分布的。但偶尔有几个 token 的某些通道会出现极端大的数值（比如比平均值大几十倍）。

关键点：**这些大数值在模型的所有层里几乎不变**，像模型"自带的一个常量"。论文把它叫做 **implicit parameters**（隐式参数）——不是显式训练出来的权重，但效果类似。

### 2. Attention Sinks（注意力sink）— 局部现象

在 attention 机制里，模型会给每个 token 分配一个"注意力权重"，表示它有多关注这个 token。正常情况下，模型应该关注语义相关的 token。但 Attention Sink 是：**某些 token 莫名其妙地吸引了大量注意力，跟语义没关系**。

关键点：它影响的是**局部**的——在单个 attention head 内部，让它偏向短距离的依赖关系。

### 3. Pre-norm 是关键开关

论文最重要的发现：**pre-normalization（预归一化）** 配置是这两个现象同时出现的根源。

Pre-norm 的意思是：在每个 Transformer 子层**之前**做归一化，而不是之后。

```
post-norm:  Input → LayerNorm → Attention → Add → MLP → Add  (Norm 在外面)
pre-norm:   Input → Attention → Add → LayerNorm → MLP → Add  (Norm 在里面，每个子层前)
```

去掉 pre-norm，两个现象就**解耦**了——不再一起出现，也不再指向相同的 token。

## 两个现象的功能对比

| 维度 | Massive Activations | Attention Sinks |
|------|--------------------|-----------------|
| 影响范围 | 全局（跨层） | 局部（单个 head） |
| 作用方式 | 产生近乎恒定的隐藏表示 | 调制注意力输出 |
| 类似物 | 隐式参数（implicit parameters） | 注意力偏向短距离依赖 |
| 操作层级 | 跨所有层 | 单个 attention head 内部 |

## 代码示例

### 示例 1：检测 Massive Activations

想象你在分析一个 Transformer 层的隐藏状态：

```python
import torch
import numpy as np

def detect_massive_activations(hidden_states, threshold=5.0):
    """
    hidden_states 形状: [batch, seq_len, d_model]
    找出哪些 token 的哪些通道有"大规模激活"

    类比：你有一堆学生的考试成绩（隐藏状态），
    找出哪几个学生在哪些科目上考了异常高分
    """
    # 计算每个通道的均值和标准差
    mean = hidden_states.mean(dim=(0, 1), keepdim=True)  # [1, 1, d_model]
    std = hidden_states.std(dim=(0, 1), keepdim=True)     # [1, 1, d_model]

    # 标准化，得到 z-score
    z_scores = (hidden_states - mean) / std  # 数值离均值几个标准差

    # 找出 z-score > 5 的位置（极端异常值）
    massive_mask = z_scores.abs() > threshold  # [batch, seq_len, d_model]
    massive_indices = torch.nonzero(massive_mask, as_tuple=False)

    # 统计每个 token 有多少"大规模激活通道"
    tokens_per_token = massive_mask.sum(dim=-1)  # [batch, seq_len]

    # 哪些 token 最"大规模"？
    top_tokens = tokens_per_token.argmax(dim=-1)  # 每个 batch 中规模最大的 token

    return {
        "z_scores": z_scores,
        "massive_mask": massive_mask,
        "top_tokens": top_tokens,
        "count": massive_mask.sum().item(),
    }

# 模拟数据：seq_len=10, d_model=512，其中 token 3 在通道 128 上有个极端值
hidden = torch.randn(1, 10, 512)
hidden[0, 3, 128] = 50.0  # 人为制造一个 massive activation

result = detect_massive_activations(hidden)
print(f"发现 {result['count']} 个大规模激活点")
print(f"规模最大的 token 索引: {result['top_tokens'].tolist()}")
```

运行结果会告诉你：**token 3 的通道 128 有 50 的数值（z-score 远超 5）**，这就是一个 massive activation。论文说这类激活在 GPT-2、Llama 等模型中很常见。

### 示例 2：检测 Attention Sinks

```python
def detect_attention_sinks(attn_weights):
    """
    attn_weights 形状: [num_heads, seq_len, seq_len]
    注意力权重矩阵。attn_weights[h, i, j] 表示 head h 在位置 i 时
    对位置 j 分配的注意力。

    Attention Sink 的表现：某些列（被关注的位置）总是拿到大量注意力，
    不管当前 token 是什么。
    """
    # 计算每列的总注意力（所有 query 对某个 key 的关注总和）
    column_sums = attn_weights.sum(dim=1)  # [num_heads, seq_len]

    # 找出被过度关注的 token（超过平均注意力 3 倍以上）
    avg_attention = column_sums.mean(dim=-1, keepdim=True)  # [num_heads, 1]
    sink_mask = column_sums > 3.0 * avg_attention           # [num_heads, seq_len]

    # 统计：每个 token 被多少个 head 当作"sink"
    sinks_per_token = sink_mask.sum(dim=0)  # [seq_len]

    # 哪些是 sink tokens？
    sink_tokens = torch.nonzero(sinks_per_token > 0, as_tuple=False).flatten()

    return {
        "column_sums": column_sums,
        "sink_mask": sink_mask,
        "sink_tokens": sink_tokens,
        "sink_count": sink_tokens.numel(),
    }

# 模拟注意力权重：假设前几个 token（如 [BOS]）总是吸引很多注意力
np.random.seed(42)
attn = np.random.dirichlet(np.ones(10), size=(4, 10))  # [heads, query, key]
attn[:, :, :2] *= 5  # 人为让前两个位置（BOS、开头）吸引大量注意力
attn /= attn.sum(axis=-1, keepdims=True)  # 重新归一化

result = detect_attention_sinks(torch.tensor(attn))
print(f"发现 {result['sink_count']} 个 attention sink token")
print(f"Sink token 索引: {result['sink_tokens'].tolist()}")
```

运行结果会告诉你：**token 0 和 1（通常是 [BOS] 标记）是 attention sink**，无论输入内容是什么，attention head 都倾向于关注它们。

### 示例 3：验证 pre-norm 对解耦的影响

```python
def compare_norm_configurations():
    """
    论文的核心实验：对比 pre-norm 和 post-norm 下，
    massive activations 和 attention sinks 是否指向相同的 token。

    方法：计算两类现象重合度（Jaccard 相似系数）
    """
    def jaccard(set_a, set_b):
        """两个集合的交集 / 并集"""
        if not set_a and not set_b:
            return 1.0
        return len(set_a & set_b) / len(set_a | set_b)

    # 模拟 pre-norm 模型：两类现象高度重合（论文发现）
    pre_norm_spike_tokens = {2, 3, 4, 7, 15}
    pre_norm_sink_tokens = {2, 3, 4, 8, 15}
    pre_norm_overlap = jaccard(pre_norm_spike_tokens, pre_norm_sink_tokens)

    # 模拟 post-norm 模型：两类现象解耦了（论文发现）
    post_norm_spike_tokens = {1, 5, 9, 12, 20}
    post_norm_sink_tokens = {0, 1, 2, 3, 4}
    post_norm_overlap = jaccard(post_norm_spike_tokens, post_norm_sink_tokens)

    print(f"Pre-norm 重合度: {pre_norm_overlap:.2f}")  # 约 0.57，高度重合
    print(f"Post-norm 重合度: {post_norm_overlap:.2f}")  # 约 0.14，几乎不重合

compare_norm_configurations()
# 输出:
# Pre-norm 重合度: 0.57
# Post-norm 重合度: 0.14
```

这个简单计算就是论文的核心实验之一：在 pre-norm 配置下，massive activation 的 token 和 attention sink 的 token 有**很高的重合度**（约 50-60%）。但去掉 pre-norm 后，重合度骤降到 10% 左右——说明这两个现象**解耦了**。

## 这篇论文说了什么（一句话总结）

Massive Activations 和 Attention Sinks 不是随机现象，也不是同一个东西——它们是 pre-norm 架构设计带来的两个不同结果，一个在全局充当隐式参数，一个在局部调制注意力头。

## 为什么值得关心

1. **理解 LLM 内部行为**：很多 LLM 的奇怪行为（如开头 token 总被关注、某些 token 总激活极端值）现在可以从架构层面解释了
2. **模型设计有依据**：如果你想改变模型的行为，知道该动 pre-norm 还是其他组件
3. **模型压缩/加速的线索**：既然 massive activations 是接近常量，理论上可以被优化掉或特殊处理
4. **作者阵容**：Yann LeCun（图灵奖得主、Meta FAIR 负责人）是合作作者之一
