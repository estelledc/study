---
title: MiniMax Sparse Attention — 用"选重点区块"打破注意力二次方瓶颈
来源: 'https://arxiv.org/abs/2606.13392'
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

## 是什么

MiniMax Sparse Attention（简称 MSA）是 MiniMax 和北京大学联合提出的一种**稀疏注意力机制**，构建在 Grouped Query Attention（GQA）之上。它的核心思路很简单：对于每个查询 token，不再让它去"看"上下文里的所有历史 token，而是先用一个超轻量的 Index Branch 快速打分，选出最关键的 Top-k 个 KV 区块（block），然后 Main Branch 只在这 k 个区块上做精确的 softmax 注意力计算。

在 109B 参数的 MoE 模型上、1M 上下文长度时，MSA 将每 token注意力计算量降低了 28.4 倍；配合专门设计的 GPU 内核，在 H800 上预填充阶段加速 14.2 倍、解码阶段加速 7.6 倍。模型代码在 GitHub，生产级模型 MiniMax-M3 已在 HuggingFace 开源。

## 日常类比

想象你在读一本 100 万字的小说，突然要回答"主角在第三章做了什么"。

**标准注意力（Full Attention）** 的做法是：把整本小说从头到尾重读一遍，给每一句话都做一个"相关度评分"，然后加权汇总。这很精确，但太慢了——读一遍就要花 quadratic 时间。

**MSA 的做法** 类似人类的阅读策略：

1. 先用一个快速扫描（Index Branch）：整本书分成 7812 个 128 字区块，每个区块给一个"大概相关度"分数——这一步很快，因为每个区块只看一个代表分数。
2. 选出分数最高的 16 个区块（Top-k selection），再加上当前所在区块附近的一个本地区块，确保你不会丢失即时上下文。
3. 最后只在选中的这 16 个区块里做精细阅读（Main Branch），用标准 softmax 注意力。

结果是：你几乎不牺牲理解质量，但阅读速度提升了十几倍。

## 核心概念

### 概念一：分块（Block）与 GQA 分组

MSA 不逐个 token 做选择，而是把 KV 序列切分成固定大小的区块（block size B_k = 128）。每个区块包含 128 个 token 的 key 和 value。

在 GQA 架构中，多个 query head 共享同一个 key-value head，组成一个 GQA group。MSA 在每个 GQA group 级别做块选择——同一个 group 内的所有 query head 共享同一组被选中的 block。

### 概念二：Index Branch — 轻量打分器

Index Branch 引入两组可学习参数：
- 一个 index query head per GQA group：Q_idx = X @ W_q_idx
- 一个共享的 index key head：K_idx = X @ W_k_idx

对于查询位置 i 和 group r，先计算 token 级别的分值，再用**块级最大值池化**聚合到 block 级别：

```
S_idx = (Q_idx @ K_idx^T) / sqrt(d_idx)
M_block = max_pool(S_idx, block_size=128)   # 每个 block 取最大值作为分数
I = TopK(M_block, k=16)                      # 选出分数最高的 16 个 block
```

关键细节：无论分数如何，当前查询所在的那个本地区块总是被强制包含，防止模型完全忽略即时上下文。

### 概念三：Main Branch — 精确计算

Main Branch 用标准缩放点积注意力，但只作用于 Index Branch 选中的 block：

```
O = softmax(Q @ K[selected_blocks] / sqrt(d_h)) @ V[selected_blocks]
```

查询的开销从 O(N) 降到 O(k * B_k) = O(16 * 128) = O(2048)，与序列长度 N 无关。

### 概念四：KL Loss 训练 Index Branch

Top-k 选择是不可导的，不能直接用语言模型损失训练 Index Branch。MSA 用一个额外的 KL 散度损失来对齐：

- Index Branch 的输出分布 P_idx 作为学生
- Main Branch 在选中 token 上的注意力分布作为老师（带 stop-gradient）

```
L_KL = KL(stop_grad(P_main) || P_idx)
```

同时，Index Branch 的输入 X 也被 stop-gradient 隔离，确保 KL 损失只更新 Q_idx 和 K_idx 这两个小矩阵，不污染主模型的参数。

### 概念五：Warmup 两阶段训练

1. **Warmup 阶段**（前 40B token）：两个分支都用完整注意力，用 L_KL 初始化 Index Branch
2. **Sparse 阶段**（剩余 2.6T token）：切换到稀疏注意力，Index Branch 控制 Top-k 选择

### 概念六：GPU 内核协同设计

MSA 不只是算法，还配套设计了专用 GPU kernel：

- **无 exp 的 Top-k**：因为 softmax 是保序的，直接对原始分数排序就能得到正确的 Top-k 索引，省掉 max/exp/sum 步骤
- **KV-outer 迭代**：按 KV block 遍历，收集查询到每个 block 的 token，充分利用 Tensor Core
- **预调度分块**：对热门 block（被大量 query 选中）用分块策略分散到多个 CTA，避免热点瓶颈
- **两阶段前向**：先用一个 kernel 计算各 partial 的局部归一化结果，再用第二个 kernel 合并

## 计算复杂度对比

| 组件 | GQA | MSA |
|------|-----|-----|
| 主要计算 | 2 * H_q * d_h * N^2 | 4 * H_q * d_h * N * k * B_k |
| 额外开销 | 无 | H_kv * d_idx * N^2（Index Branch） |

当 k * B_k << N 时，Main Branch 的计算量从 O(N^2) 降到 O(N)，总计算量大幅降低。

## 代码示例

### 示例一：Index Branch 的伪代码实现

```python
class MiniMaxSparseAttention(nn.Module):
    """MSA 核心结构——Index Branch + Main Branch"""

    def __init__(self, d_model, num_kv_heads, head_dim, block_size=128, top_k=16):
        super().__init__()
        self.num_kv_heads = num_kv_heads
        self.block_size = block_size
        self.top_k = top_k
        self.d_idx = 64  # index head 维度

        # 标准 GQA 投影
        self.q_proj = nn.Linear(d_model, num_kv_heads * head_dim)
        self.k_proj = nn.Linear(d_model, num_kv_heads * head_dim)
        self.v_proj = nn.Linear(d_model, num_kv_heads * head_dim)

        # Index Branch：每组一个 query head，共享一个 key head
        self.q_idx_proj = nn.Linear(d_model, num_kv_heads * self.d_idx)
        self.k_idx_proj = nn.Linear(d_model, self.d_idx)  # 共享

    def forward(self, hidden_states):
        """
        hidden_states: (seq_len, d_model)
        返回: (seq_len, d_model)
        """
        seq_len = hidden_states.shape[0]

        # ---- Main Branch 投影 ----
        q = self.q_proj(hidden_states)       # (seq_len, num_kv_heads, d_h)
        k = self.k_proj(hidden_states)       # (seq_len, num_kv_heads, d_h)
        v = self.v_proj(hidden_states)       # (seq_len, num_kv_heads, d_h)

        # ---- Index Branch ----
        # 输入用 stop-grad 隔离
        hidden_detached = hidden_states.detach()
        q_idx = self.q_idx_proj(hidden_detached)   # (seq_len, num_kv_heads, d_idx)
        k_idx = self.k_idx_proj(hidden_detached)   # (seq_len, 1, d_idx)

        # 按 GQA group 计算 index 分数
        # q_idx: (seq_len, num_kv_heads, d_idx)
        # k_idx: (seq_len, 1, d_idx) -> expand 到 (seq_len, num_kv_heads, d_idx)
        k_idx = k_idx.expand(-1, q_idx.shape[1], -1)

        # token-level 分数: (seq_len, num_kv_heads, seq_len)
        scores_idx = torch.matmul(q_idx, k_idx.transpose(1, 2)) / (self.d_idx ** 0.5)

        # 用 -inf 掩码保证因果性
        causal_mask = torch.tril(
            torch.ones(seq_len, seq_len, device=hidden_states.device)
        )
        scores_idx = scores_idx.masked_fill(causal_mask == 0, float('-inf'))

        # ---- 块级最大值池化 ----
        num_blocks = (seq_len + self.block_size - 1) // self.block_size
        block_scores = self._block_max_pool(scores_idx, self.block_size)
        # block_scores: (seq_len, num_kv_heads, num_blocks)

        # ---- Top-k 选择 ----
        # 每个查询位置，对每个 GQA group 选 top-k 个 block
        indices = torch.topk(block_scores, k=self.top_k, dim=-1).indices
        # indices: (seq_len, num_kv_heads, top_k)

        # 强制加入本地 block
        local_block = (torch.arange(seq_len, device=hidden_states.device) // self.block_size).unsqueeze(-1)
        local_block = local_block.unsqueeze(-1).expand(-1, -1, self.top_k)
        # 把 local block 替换 top_k 中分数最低的那个
        indices = self._force_local_block(indices, local_block)

        # ---- Main Branch 稀疏注意力 ----
        output = self._sparse_attention(q, k, v, indices, num_blocks)

        # ---- KL Loss（训练时） ----
        kl_loss = self._compute_kl_loss(q_idx, k_idx, q, k, indices)

        return output, kl_loss

    def _block_max_pool(self, scores, block_size):
        """将 token-level 分数聚合到 block level，每个 block 取最大值"""
        seq_len = scores.shape[0]
        num_blocks = (seq_len + block_size - 1) // block_size

        padded = F.pad(scores, (0, num_blocks * block_size - seq_len))
        # reshape 成 (seq_len, num_kv_heads, num_blocks, block_size)
        padded = padded.view(seq_len, scores.shape[1], num_blocks, block_size)
        # 因果性：当前 block 内只看到 <= 查询位置的部分
        causal_local = torch.tril(torch.ones(block_size, block_size))
        causal_local = causal_local.bool()
        padded = padded.masked_fill(~causal_local.unsqueeze(0).unsqueeze(0), float('-inf'))

        # 每 block 取最大值
        block_scores = padded.max(dim=-1).values  # (seq_len, num_kv_heads, num_blocks)
        return block_scores

    def _force_local_block(self, indices, local_block):
        """用 local block 替换 top-k 中分数最低的那个"""
        # 简单策略：找到 top_k 中每个查询位置的第一个位置，用 local block 替换
        indices[:, :, 0] = local_block.squeeze(-1)
        return indices

    def _sparse_attention(self, q, k, v, indices, num_blocks):
        """对选中的 block 执行标准 softmax 注意力"""
        seq_len = q.shape[0]
        output = torch.zeros_like(q)

        for head in range(q.shape[1]):
            q_head = q[:, head, :]  # (seq_len, d_h)
            k_head = k[:, head, :]
            v_head = v[:, head, :]

            attn_output = torch.zeros_like(q_head)
            for i in range(seq_len):
                # 取当前 block 的 top-k 索引
                block_ids = indices[i, head, :]  # (top_k,)
                # 展开成 token 索引
                token_ids = []
                for bid in block_ids:
                    start = bid * self.block_size
                    end = min(start + self.block_size, i + 1)  # 因果性
                    token_ids.extend(range(start, end))
                token_ids = torch.tensor(token_ids, device=q.device)

                if len(token_ids) == 0:
                    continue

                # 标准注意力
                scores = torch.matmul(q_head[i], k_head[token_ids].T) / (self.q_proj.out_features ** 0.5)
                attention = F.softmax(scores, dim=-1)
                attn_output[i] = torch.matmul(attention, v_head[token_ids])

            output[:, head, :] = attn_output

        return output

    def _compute_kl_loss(self, q_idx, k_idx, q_main, k_main, indices):
        """计算 Index Branch 与 Main Branch 的 KL 散度"""
        # 这里省略完整实现——核心是对选中的 token 集合，
        # 比较 P_idx（index 分数归一化）和 P_main（main 注意力归一化）
        return 0.0  # placeholder
```

### 示例二：使用 MSA 的模型推理配置

```python
"""在实际项目中，MSA 作为注意力层被嵌入到 MoE 模型中"""

from transformers import PretrainedConfig, PreTrainedModel

class MSAConfig(PretrainedConfig):
    """MSA 模型的配置——来自 MiniMax-M3 的实际参数"""
    model_type = "minimax_m3"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # 模型结构
        self.num_attention_heads = 64        # query heads
        self.num_key_value_heads = 4         # KV heads, GQA ratio = 16
        self.hidden_size = 3072
        self.head_dim = 128
        self.rope_dim = 64
        self.num_hidden_layers = 41          # 3 dense + 38 MoE

        # MSA 参数
        self.msa_block_size = 128
        self.msa_top_k = 16
        self.msa_index_dim = 64

        # MoE 参数
        self.num_experts = 128
        self.num_experts_per_tok = 4
        self.shared_expert = True

        # 训练
        self.vocab_size = 200_000
        self.warmup_tokens = 40_000_000_000  # 40B


# 推理时，MSA 的使用方式和普通注意力层一样透明：
def run_inference_with_msa():
    """从 HuggingFace 加载使用 MSA 的模型——对调用者完全透明"""
    from transformers import AutoModelForCausalLM

    model = AutoModelForCausalLM.from_pretrained("MiniMaxAI/MiniMax-M3")
    config = MSAConfig()

    # 输入长上下文文本（例如百万字代码仓库）
    prompt = "请分析以下代码仓库的架构..."

    # 推理——MSA 在后台自动做 block 选择和稀疏计算
    # 用户不需要知道、也不需要关心 MSA 的内部细节
    inputs = model.tokenizer(prompt, return_tensors="pt")
    outputs = model.generate(**inputs, max_new_tokens=512)

    return model.tokenizer.decode(outputs[0], skip_special_tokens=True)

# 性能预期（H800 GPU，1M 上下文）：
#   预填充阶段：比 GQA 快 14.2 倍
#   解码阶段：比 GQA 快 7.6 倍
#   每 token 注意力计算量：降低 28.4 倍
```

## 关键设计决策一览

| 设计选择 | MSA 的做法 | 原因 |
|---------|-----------|------|
| 粒度 | 块级（128 token/block） | 比 token 级高效，比 block 级更灵活 |
| k 值 | 16 个 block | 兼顾稀疏度和质量，适配各种 GPU |
| Index Branch 参数量 | 每 group 一组 Q/K | 极轻量，几乎零额外开销 |
| 梯度隔离 | stop-gradient 切断 X → Index | KL 损失不污染主模型参数 |
| 训练策略 | 先 full attn warmup → 后 sparse | 避免早期随机选择导致崩溃 |
| 本地区块 | 强制包含 | 保证即时上下文不被遗漏 |
| GPU 内核 | exp-free Top-k + KV-outer | 消除 softmax 冗余，提升 Tensor Core 利用率 |

## 实验结果摘要

在 109B MoE 模型上、3T token 训练预算下：

- **MSA-PT**（从零训练）：在数学、图像、视频、长上下文检索等多项基准上**超过**了 Full Attention 基线
- **MSA-CPT**（从已有检查点继续训练）：在文本、代码、困惑度上**接近** Full Attention，适合已有模型的稀疏化改造
- 训练损失曲线和梯度范数与 Full Attention **几乎重合**，训练稳定性良好
- Block recall 和 score recall 在训练中保持稳定，说明 Index Branch 持续选择到重要的 block

## 总结

MSA 的设计哲学是"奥卡姆剃刀"——去掉所有非必要组件，只保留最核心的部分：一个超轻量的 Index Branch 做粗筛，一个标准 Main Branch 做精算。它不引入新的数学运算，完全兼容现有 CUDA 生态，因此可以高效部署在各种 GPU 上。对于需要百万 token 上下文的应用（agent 工作流、代码仓库推理、持久记忆等），MSA 是目前最简洁实用的稀疏注意力方案之一。
