---
title: N-GRPO — 嵌入层邻居混合增强的策略优化
来源: 'https://arxiv.org/abs/2606.10768'
日期: 2026-06-13
分类: 机器学习
子分类: 强化学习
provenance: pipeline-v3
---

## 是什么

N-GRPO（**Neighbor-Enhanced Group Relative Policy Optimization**）是浙江大学团队在 2026 年 6 月提出的一种新的探索策略，集成到 GRPO（Group Relative Policy Optimization）框架中。它的核心创新是在**嵌入层（embedding level）**做"邻居混合"，而不是传统的 token 级别随机采样。

日常类比：想象你在解一道数学题。

- **传统方法（token-level sampling）**就像你每次写下一个词就掷骰子——可能掷出同义词替换，也可能掷出毫不相干的词。结果经常是"意思差不多但换了种说法"，多样性低。
- **随机噪声方法（embedding-level noise）**就像在你解题思路的中间突然塞进一本随机翻开的字典——虽然确实产生了变化，但语义经常断裂，思路断了。
- **N-GRPO**像你解题时旁边坐着一个同学，他偶尔在你思考的地方提供一两个"相近的思路"，让你的思路有变化但不会偏离主题。这些"相近思路"来自语义空间里的近邻——意思相近、方向相似。

论文发表于 **ACL 2026 Findings**，16 页，3 张图。代码开源在 https://github.com/ZJUSCL/N-GRPO。

## 为什么重要

理解 N-GRPO 的意义在于看清 LLM 推理能力训练中的一个根本矛盾：

- LLM 做数学推理时，需要在 rollout 阶段生成**多样化的有效解题路径**
- 太保守（greedy decoding）→ 所有路径雷同，GRPO 的 group 对比失去意义
- 太随机（高 temperature）→ 路径无效，reward 全低，策略学不到东西

N-GRPO 解决的是 **"探索与利用的权衡"**——在嵌入层注入的多样性既保持了语义一致性（沿着语义流形），又足够新颖（足以产生不同的解题路径）。这对所有基于 RL 的 LLM 推理训练都有参考价值。

## 核心概念

### 1. GRPO 回顾：没有 Critic 的 PPO

GRPO 是 DeepSeek R1 论文中提出的 PPO 简化版，核心改动是**去掉 critic model**。

传统 PPO 需要两个模型：
- **Actor**：生成答案的策略网络
- **Critic**：估计每个状态价值的价值网络

GRPO 的做法是用**一组采样（group of samples）的 reward 均值**来估计 baseline，不需要单独的 critic。具体做法：

1. 对同一个问题 prompt，用当前策略采样 G 个回答
2. 计算这 G 个回答的 reward 平均值
3. 每个回答的 advantage = 该回答 reward - 组内平均 reward
4. 用 clipped objective 做策略更新

好处：省了一个模型的显存和训练开销，工程上更简洁。

### 2. 语义邻居混合（Semantic Neighbor Mixing）

N-GRPO 的核心机制。思路是：在 autoregressive 生成的每一步，不是直接把当前 token 的 embedding 喂给模型继续预测下一个，而是**混合当前 token embedding 和其语义近邻的 embedding**。

步骤分解：

1. **取 anchor token embedding**：模型在当前步输出的 token 向量 h_t
2. **找语义邻居**：在嵌入空间中找与 h_t 最近的 k 个向量（用余弦距离）
3. **加权混合**：h_mixed = (1 - α) · h_t + α · Σ w_i · h_neighbor_i

α 是混合率（mixing rate），控制"偏离原路径有多远"。α=0 就是原始路径，α 越大探索越激进。

### 3. 为什么在嵌入层而不是 token 层

Token 层采样的问题是：从整个 vocab（比如 15000 个词）里均匀或 temperature 采样，得到的词可能在语义上跟上下文毫无关系。

嵌入层混合的好处：邻居们天然在语义空间里挨着，混合后的表示仍然落在**局部语义流形（local semantic manifold）**上。类比：你在地图上从"北京"走到"天津"，沿途每步都允许你稍微偏移到附近的城市——你还是在华北平原这片区域，不会突然跳到撒哈拉沙漠。

## 代码示例

### 示例 1：语义邻居查找与混合（核心算法）

```python
import torch
import torch.nn.functional as F
from sklearn.neighbors import NearestNeighbors

def find_semantic_neighbors(anchor_embedding, embedding_matrix, k=5):
    """
    在嵌入空间中找 anchor 的 k 个最近语义邻居。
    anchor_embedding: (hidden_dim,) 当前 token 的嵌入向量
    embedding_matrix: (vocab_size, hidden_dim) 整个词的嵌入表
    k: 邻居数量
    """
    # 归一化后算余弦相似度
    anchor_norm = F.normalize(anchor_embedding.unsqueeze(0), dim=1)  # (1, hidden_dim)
    matrix_norm = F.normalize(embedding_matrix, dim=1)               # (vocab, hidden_dim)

    # 余弦相似度 → 转成距离
    sim = torch.matmul(anchor_norm, matrix_norm.T)                  # (1, vocab)
    distances = 1.0 - sim

    # 取 k 个最近邻居（排除自己）
    topk_dist, topk_idx = torch.topk(distances, k=k + 1, largest=False)
    # 第一个是自己，去掉
    neighbor_idx = topk_idx[1:]                                     # (k,)
    neighbor_embs = embedding_matrix[neighbor_idx]                  # (k, hidden_dim)

    return neighbor_idx, neighbor_embs


def semantic_neighbor_mix(
    anchor_embedding,
    embedding_matrix,
    alpha=0.15,
    k=5,
    distance_metric="cosine"
):
    """
    对 anchor embedding 做语义邻居混合，返回混合后的表示。
    alpha: 混合率，控制偏离程度。0 = 不混合，1 = 完全用邻居
    k: 邻居数量
    """
    _, neighbor_embs = find_semantic_neighbors(
        anchor_embedding, embedding_matrix, k=k
    )

    # 按距离加权：越近的邻居权重越高
    # 这里用 softmax 把距离转成权重
    neighbor_weights = F.softmax(-distance_metric_distances(
        anchor_embedding, neighbor_embs, metric=distance_metric
    ), dim=0)  # (k,)

    # 加权混合
    neighbor_mixed = (neighbor_weights.unsqueeze(1) * neighbor_embs).sum(dim=0)  # (hidden_dim,)
    mixed_embedding = (1 - alpha) * anchor_embedding + alpha * neighbor_mixed

    return mixed_embedding


def distance_metric_distances(anchor, neighbors, metric="cosine"):
    """计算 anchor 到各邻居的距离"""
    if metric == "cosine":
        norm_a = F.normalize(anchor.unsqueeze(0), dim=1)
        norm_n = F.normalize(neighbors, dim=1)
        return 1.0 - torch.matmul(norm_a, norm_n.T).squeeze()
    else:
        return torch.cdist(anchor.unsqueeze(0), neighbors).squeeze()
```

### 示例 2：N-GRPO 在 GRPO 训练循环中的集成

```python
import torch
import torch.nn as nn

class NGRPOTrainer:
    """
    N-GRPO 训练器：在 GRPO 的 rollout 阶段嵌入邻居混合。
    """

    def __init__(self, model, tokenizer, embedding_matrix, alpha=0.15, k=5, group_size=8):
        self.model = model
        self.tokenizer = tokenizer
        self.embedding_matrix = embedding_matrix  # (vocab_size, hidden_dim)
        self.alpha = alpha                         # 混合率
        self.k = k                                 # 邻居数
        self.group_size = group_size               # GRPO 每组采样数

    def rollout_with_neighbor_mix(self, prompt_ids):
        """
        带邻居混合的 rollout：逐 token 生成，每步可选择是否混合。
        prompt_ids: (batch, seq_len) 输入的 prompt token ids
        返回: generated sequences (batch * group_size, full_seq_len)
        """
        batch_size = prompt_ids.shape[0]
        all_sequences = []

        for _ in range(self.group_size):
            # 复制 prompt 并逐步生成
            generated = prompt_ids.clone()
            current_ids = prompt_ids[:, -1:]  # 最后一个 token 作为起点

            while True:
                with torch.no_grad():
                    outputs = self.model(current_ids, output_hidden_states=True)
                    last_hidden = outputs.hidden_states[-1][:, -1, :]  # (batch, hidden_dim)
                    logits = outputs.logits[:, -1, :]                     # (batch, vocab)

                # 决定是否做邻居混合（训练时可以加随机概率）
                if torch.rand(1).item() < 0.5:  # 50% 概率混合
                    mixed_embeddings = []
                    for i in range(last_hidden.shape[0]):
                        mixed_emb = semantic_neighbor_mix(
                            last_hidden[i], self.embedding_matrix,
                            alpha=self.alpha, k=self.k
                        )
                        mixed_embeddings.append(mixed_emb)
                    last_hidden_mixed = torch.stack(mixed_embeddings)

                    # 用混合后的表示重新算 logits（简化版：直接偏移 logits）
                    offset = (last_hidden_mixed - last_hidden) @ self.embedding_matrix.T
                    logits = logits + 0.5 * offset

                # 采样下一个 token
                next_token = torch.multinomial(F.softmax(logits / 0.8, dim=-1), num_samples=1)
                current_ids = next_token
                generated = torch.cat([generated, current_ids], dim=1)

                if next_token.item() == self.tokenizer.eos_token_id:
                    break

            all_sequences.append(generated)

        return torch.cat(all_sequences, dim=0)

    def compute_group_advantage(self, rewards):
        """
        GRPO 的优势估计：组内 reward 减去组均值。
        rewards: (group_size,) 每个采样的 reward
        """
        mean_r = rewards.mean()
        std_r = rewards.std() + 1e-8
        advantages = (rewards - mean_r) / std_r
        return advantages

    def train_step(self, prompt_ids, reward_fn):
        """
        一步 N-GRPO 训练。
        """
        # 1. 带邻居混合的 rollout
        trajectories = self.rollout_with_neighbor_mix(prompt_ids)  # (B*G, T)

        # 2. 算 reward
        rewards = torch.stack([reward_fn(traj) for traj in trajectories])

        # 3. 算 advantage（组内相对）
        advantages = self.compute_group_advantage(rewards)

        # 4. 计算 importance ratio 和 clipped loss
        # （简化示意，实际需要保存 old log probs）
        # loss = -min(ratio * A, clip(ratio, 1-eps, 1+eps) * A).mean()

        return rewards.mean(), advantages
```

### 示例 3：混合率消融实验（论文中的关键分析）

```python
"""
论文 4.5.1 节：不同混合率 α 的效果对比。
α=0 等价于标准 GRPO（无混合），α 增大探索更强但可能偏离语义。
"""
import matplotlib.pyplot as plt

alpha_values = [0.0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40]

# 模拟 AIME 2024 上的准确率（论文 Figure 2 的趋势）
aime_scores = [60.0, 61.5, 63.3, 65.0, 64.2, 63.8, 62.1, 58.5]

fig, ax = plt.subplots(figsize=(8, 4))
ax.plot(alpha_values, aime_scores, marker='o', linewidth=2)
ax.axvline(x=0.15, color='red', linestyle='--', alpha=0.5, label='论文推荐值 α=0.15')
ax.set_xlabel('Mixing Rate α', fontsize=12)
ax.set_ylabel('AIME 2024 Accuracy (%)', fontsize=12)
ax.set_title('N-GRPO: Impact of Mixing Rate on Math Reasoning', fontsize=14)
ax.legend()
ax.grid(alpha=0.3)
plt.tight_layout()
plt.savefig('n-grpo-alpha-ablation.png', dpi=150)
```

## 实验结果

论文在 **DeepSeek-R1-Distill-Qwen** 系列模型（1.5B / 7B）上做了评估：

| 基准 | 基线 GRPO | N-GRPO | 提升 |
|------|-----------|--------|------|
| AIME 2024 | ~60% | ~65% | +5pp |
| Math 500 | ~82% | ~85% | +3pp |
| OlympiadBench | ~40% | ~43% | +3pp |

关键发现：
- α=0.15 是经验最佳值，太小没效果，太大语义漂移
- 在 OOD（分布外）任务上泛化能力也更好
- 可以迁移到 GSPO（另一种 GRPO 变体）上同样有效

## 踩过的坑（基于论文分析的推断）

1. **邻居查找的代价**：每次生成都要在 embedding matrix 里找 k 个近邻，如果 vocab 很大（50000+）会很慢。论文可能用了近似最近邻（ANN）如 FAISS 来加速，否则实时生成不可行。

2. **α 的敏感度**：α 太大 → 语义漂移，生成的路径无效；α 太小 → 和标准 GRPO 没区别。不同任务的最佳 α 可能不同。

3. **混合概率**：不是每一步都做混合（论文中 50% 概率），因为有些步骤原文路径就是最优的，混合反而会破坏。

4. **与 temperature 的交互**：N-GRPO 和 temperature sampling 可以同时用，但两者都设太高会导致过度探索。

## 适用 vs 不适用场景

**适用**：
- 基于 GRPO / PPO 训练 LLM 推理能力（数学、代码、逻辑）
- 需要生成多样化有效轨迹但不想牺牲语义一致性的场景
- OOD 泛化能力要求高的任务

**不适用**：
- 不需要探索的确定性推理（答案唯一、路径固定）
- 资源极度受限（邻居查找增加计算开销）
- 非 autoregressive 模型（N-GRPO 依赖 token-by-token 生成）

## 历史脉络

- **2017 年**：Schulman 提出 PPO——给策略更新加"幅度上限"
- **2022 年**：InstructGPT 用 PPO 做 RLHF，让 LLM 对齐人类偏好
- **2024 年**：DeepSeek R1 提出 GRPO——去掉 critic，用组内对比，训练推理模型
- **2024 年底**：DPO 等直接偏好优化方法兴起，绕过 RL 直接优化
- **2026 年 6 月**：N-GRPO 出现，回到 GRPO 的探索机制，在嵌入层做语义邻居混合

有趣的是，DPO 证明了"不需要 RL 也能对齐"，但在**推理能力**这个维度上，基于 rollouts 的 GRPO 系列仍然是最强的。N-GRPO 的出现说明：即使 DPO 很流行，RL-based 推理训练还在持续进化。

## 学到什么

1. **探索不需要是随机的**——语义空间里的邻居混合是一种结构化的探索方式
2. **GRPO 的价值被低估了**——去掉 critic 的简化版 PPO 在推理训练中反而更好用
3. **嵌入层操作比 token 层操作更"懂语义"**——在连续空间里操作比离散选择更灵活
4. **α=0.15 是一个好的经验起点**——偏离不要太远，保持在语义流形附近
5. **N-GRPO 不是取代 GRPO，而是增强它**——加一层混合，不影响 GRPO 的其他部分

## 延伸阅读

- 论文：[arXiv 2606.10768](https://arxiv.org/abs/2606.10768)（ACL 2026 Findings，16 页）
- 代码：[github.com/ZJUSCL/N-GRPO](https://github.com/ZJUSCL/N-GRPO)
- [[ppo]] —— PPO 是 GRPO 的前身，建议先看 PPO 再看 GRPO
- [[deepseek-r1]] —— GRPO 首次被提出用于训练推理模型
- [[dpo]] —— 绕过 RL 的直接偏好优化方法，与 GRPO 形成对照

## 关联

- [[ppo]] —— GRPO 的前身，PPO 的简化版
- [[deepseek-r1]] —— 首次提出 GRPO 用于 LLM 推理训练
- [[dpo]] —— 绕过 RL 的替代方案，与 N-GRPO 形成方法对比
- [[instructgpt]] —— RLHF 奠基论文，PPO 在 LLM 中的首次大规模应用
- [[reasoning-with-sampling]] —— 推理时的采样策略，与 N-GRPO 的探索思想相通
