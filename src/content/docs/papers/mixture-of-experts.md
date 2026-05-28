---
title: Mixture of Experts 状元篇 — 从 dense scaling 到 sparse routing
description: MoE 是 Switch Transformer + Mixtral 双论文驱动的 sparse 架构范式，把模型总参数 N 与 active 参数解耦，使万亿规模成为可能
season: M
chapter: M4
type: method
status: draft
---

# Mixture of Experts 状元篇

## Layer 0 论文卡片

| 字段 | 内容 |
| --- | --- |
| 中文标题 | 稀疏专家混合架构 |
| 英文标题 | Switch Transformers + Mixtral of Experts |
| 一作 | William Fedus（Switch）/ Albert Q. Jiang（Mixtral） |
| 机构 | Google Brain / Mistral AI |
| 发表年 | 2021 / 2024 |
| arXiv ID | 2101.03961 / 2401.04088 |
| 代码仓库 | google-research/text-to-text-transfer-transformer + mistralai/mistral-src |
| 类型 | method（架构创新） |
| 一句话定位 | 把 dense FFN 替换成 router + N 个 expert FFN，每 token 只走 top-k 个，实现总参数 N 与 active 参数解耦 |

一句话定位：MoE 让模型容量按 N 增长但每 token 计算只按 k 个 expert 增长，把"参数量"和"前向 FLOPs"两件事第一次切开。

![MoE 架构总览](/study/papers/mixture-of-experts/01-architecture.webp)

## Layer 1 Why — 为什么从 dense 跳到 sparse

读这篇之前先把两条 dense scaling 的脉络串起来。

[Scaling Laws M1](src/content/docs/papers/scaling-laws/) 给的结论是：loss 随参数 N、数据 D、计算 C 呈幂律下降，越大越好。但代价是每 token 的前向 FLOPs 与 N 几乎线性相关——把 dense 模型从 7B 推到 70B，单步训练慢 10 倍、推理也慢 10 倍。

[Chinchilla M2](src/content/docs/papers/chinchilla/) 进一步指出：在固定 compute budget 下，N 与 D 应该按 1:1 同比放大；如果只放大 N 不放大 D，就会进入 under-trained 区。这意味着 dense scaling 的天花板由 compute 而非由 N 单独决定。

但工业界的真实诉求是：**我想要一个"知识更多"的模型，但不想在每个 token 上都付那么多 FLOPs**。换句话说，我希望"参数容量"和"推理成本"能分别 tune。

dense Transformer 做不到这点。它的每个 token 都要过完整的 FFN——FFN 占 Transformer 总参数的 2/3，是参数大头。

MoE 的核心 idea 反过来想：**FFN 不一定要每个 token 都过同一个**。如果训练 N 个 FFN（叫 expert），让一个 router 给每个 token 选 top-k 个 expert，那么：

- 总参数 ≈ N × (单 expert 参数)，可以做到很大
- 每 token 的前向 FLOPs ≈ k × (单 expert FLOPs)，几乎不变

Mixtral 8x7B 是这个 idea 最有名的工业落地：8 个 expert × ~7B 参数 ≈ 47B 总参数，但每个 token 只激活 top-2 expert ≈ 13B active params。推理速度接近 13B dense 模型，但能力接近 70B dense 模型。

这就是为什么 2024 之后开源 LLM 大规模转向 MoE：DeepSeek-V3、Qwen2-MoE、OLMoE、Phi-MoE、Llama 4，全是这条路线。

## Layer 2 论文地形

Switch Transformer（Fedus 2021）和 Mixtral（Jiang 2024）这两篇，是 MoE 在 LLM 时代的双锚点。

Switch Transformer 的贡献：

- 第一次把 MoE 推到万亿参数（1.6T）规模并且训练稳定
- 简化 routing：top-1（每 token 只走 1 个 expert），减少通信开销
- 提出 capacity factor、load balance loss 这套训练稳定性工具箱
- 公开 T5 backbone 上的完整对照实验

Mixtral 的贡献：

- 开源 SoTA 级 MoE 权重（8x7B），让社区第一次能在自己机器上跑高质量 MoE
- 重新启用 top-2 routing（比 top-1 略多通信但 quality 更稳）
- 验证 MoE 在 instruction-tuning + chat 场景的可用性

中间还有几篇过渡性工作：

- GShard（Lepikhin 2020）：MoE + expert parallelism 的分布式训练框架
- GLaM（Du 2022）：1.2T MoE，能源效率比 GPT-3 优 2/3
- ST-MoE（Zoph 2022）：MoE 在 fine-tune 时的稳定性问题诊断

## Layer 3 精读三段

### 3.1 Top-k routing + softmax + load balance loss

routing 是 MoE 的灵魂。先看最朴素的 top-k 实现。

```python
import torch
import torch.nn as nn
import torch.nn.functional as F


class MoELayer(nn.Module):
    def __init__(self, d_model, d_ff, n_experts, top_k=2):
        super().__init__()
        self.n_experts = n_experts
        self.top_k = top_k
        # router 就是一个线性层：d_model -> n_experts
        # 它对每个 token 输出 n_experts 个 logit
        self.router = nn.Linear(d_model, n_experts, bias=False)
        # n_experts 个独立 FFN
        # 每个 FFN = Linear(d_model, d_ff) + GELU + Linear(d_ff, d_model)
        self.experts = nn.ModuleList([
            nn.Sequential(
                nn.Linear(d_model, d_ff),
                nn.GELU(),
                nn.Linear(d_ff, d_model),
            )
            for _ in range(n_experts)
        ])

    def forward(self, x):
        # x: (batch, seq, d_model)
        bsz, seq, d = x.shape
        # 把 batch+seq 摊平成 token 维度方便 routing
        x_flat = x.reshape(-1, d)  # (bsz*seq, d)
        n_tokens = x_flat.shape[0]

        # router_logits: (n_tokens, n_experts)
        router_logits = self.router(x_flat)
        # softmax 得到每个 expert 的概率
        router_probs = F.softmax(router_logits, dim=-1)

        # 选 top_k expert
        top_probs, top_idx = router_probs.topk(self.top_k, dim=-1)
        # 重新归一化（可选，Switch 不归一，Mixtral 归一）
        top_probs = top_probs / top_probs.sum(dim=-1, keepdim=True)

        # 准备一个空 output buffer
        out = torch.zeros_like(x_flat)
        for k in range(self.top_k):
            # 第 k 个槽位每个 token 选了哪个 expert
            expert_idx_k = top_idx[:, k]  # (n_tokens,)
            prob_k = top_probs[:, k]      # (n_tokens,)
            # 对每个 expert，把分到它的 token 喂进去
            for e in range(self.n_experts):
                mask = (expert_idx_k == e)
                if mask.any():
                    expert_in = x_flat[mask]
                    expert_out = self.experts[e](expert_in)
                    out[mask] += prob_k[mask].unsqueeze(-1) * expert_out

        return out.reshape(bsz, seq, d), router_logits
```

旁注（≥ 5 条）：

- router 故意做得很轻（一层 Linear），不能让 routing 本身变成新瓶颈
- softmax + top-k 不可微？top-k 这步确实不可微，但梯度通过 top_probs 这个软权重回流，足够训练
- top_probs 重新归一化是一个细节差异：Switch 不归一（保留稀疏激活强度），Mixtral 归一（output 量级稳定）
- 内层 `for e in range(n_experts)` 在原型里能跑，工业实现都是 batched einsum + permute 的 fused kernel
- mask 索引产生不规则形状，导致 GPU 利用率天然不如 dense FFN，这是 MoE 的隐性成本

但只这样训练会立刻崩——router 会很快"塌缩"到只用 1-2 个 expert，其它 expert 永远 0 token，参数浪费。所以必须加 load balance loss。

```python
def load_balance_loss(router_probs, expert_idx, n_experts):
    # router_probs: (n_tokens, n_experts) 全部 expert 的 softmax
    # expert_idx:   (n_tokens, top_k)     每 token 实际选了哪些
    n_tokens = router_probs.shape[0]
    # f_i = expert i 实际收到的 token fraction
    # P_i = router 给 expert i 的平均概率
    f = torch.zeros(n_experts, device=router_probs.device)
    for k in range(expert_idx.shape[1]):
        f.scatter_add_(
            0, expert_idx[:, k],
            torch.ones_like(expert_idx[:, k], dtype=torch.float),
        )
    f = f / (n_tokens * expert_idx.shape[1])
    P = router_probs.mean(dim=0)
    # Switch 论文公式 (4)
    return n_experts * (f * P).sum()
```

旁注：

- f 是离散的"实际分到几"，P 是连续的"平均给多少概率"
- 两者乘起来再求和，逼近所有 expert 的均匀使用——理论最小值是 1.0
- 实际训练中这个 loss 会被乘一个小系数（如 0.01）加进总 loss
- 没有这个 loss，单纯靠数据 diversity 没法保证 router 不偷懒
- DeepSeek-V3 提出 aux-loss-free balancing：在 router_logits 上直接加一个动态 bias，不用 loss，更优雅

怀疑点：load balance loss 强迫 expert 均匀使用，但有些 token 类型本身就稀有（比如代码、外语），强行平均化会不会反而损害 specialization？这是 ST-MoE 论文里讨论的开放问题。

### 3.2 Expert parallelism + all-to-all 通信

MoE 训练的工程难点不在算法而在通信。

dense Transformer 的并行策略主要是 data parallel + tensor parallel + pipeline parallel。MoE 多了一种：**expert parallel**——把 N 个 expert 分到 N 个 GPU 上，每个 GPU 持有一个 expert 的参数。

token 路由到 expert 的过程，本质是一次跨设备的数据重排：

```python
# 伪代码：单个 MoE 层在 expert parallel 下的前向
# 假设 8 GPU、8 expert、每 GPU 一个 expert

# 1. 每个 GPU 本地有一批 token，本地 router 算 top-k
local_tokens = ...               # (local_bsz*seq, d_model)
local_router_logits = router(local_tokens)
local_top_probs, local_top_idx = local_router_logits.softmax(-1).topk(2)

# 2. 按 expert id 对 token 排序
# 把"我要发往 expert 0 的 token"打包成连续段
sorted_tokens, sorted_idx = sort_by_expert(local_tokens, local_top_idx)

# 3. all-to-all：每个 GPU 把"发给 expert e 的 token"发给持有 expert e 的 GPU
# 同时收回"其它 GPU 发给我这个 expert 的 token"
recv_tokens = all_to_all(sorted_tokens, send_counts, recv_counts)

# 4. 本地 expert 跑 FFN
expert_out = local_expert(recv_tokens)

# 5. 再做一次 all-to-all 把结果送回原 GPU
out_back = all_to_all(expert_out, ...)

# 6. 按原 token 顺序还原 + 用 router prob 加权合并
out = combine_with_router_probs(out_back, sorted_idx, local_top_probs)
```

旁注：

- all-to-all 是双向 dispatch，每个 GPU 既发也收，最容易成为带宽瓶颈
- token 数量在 expert 之间不均衡 → all-to-all 通信量也不均衡 → 慢的那个 GPU 拖慢全局，这就是为什么 capacity factor 要存在
- capacity factor C：每个 expert 最多接收 (n_tokens × top_k / n_experts) × C 个 token，超出的 token 被丢弃或绕过
- C 太小 → drop 太多伤 quality；C 太大 → 通信量增加伤速度。Switch 用 1.0-1.25
- Megablocks（Gale 2023）用 block-sparse matmul 把 dropping 替换成 padding-free 的高效实现

怀疑点：在数据中心多 GPU 互联场景下 all-to-all 还可控，但在单卡多 expert 推理场景下，expert 切换变成 cache miss 主导的 memory-bound 操作，是否反而比 dense 慢？vLLM 早期版本就遇到过这个坑。

### 3.3 Mixtral / DeepSeek 的 routing 优化

Mixtral 在 Switch 基础上做了一系列调整：

```python
# Mixtral 的关键差异（伪代码示意）

# 1. top-k = 2 而非 top-1
# 理由：top-1 容易学到 hard routing 的 corner case；top-2 更稳
top_probs, top_idx = router_probs.topk(2, dim=-1)

# 2. router_probs 在 top-k 后归一化
# 理由：让最终输出量级与 dense FFN 接近，便于直接复用 dense pre-train 的 hyperparam
top_probs = top_probs / top_probs.sum(dim=-1, keepdim=True)

# 3. 每层独立 router（不像某些 paper 共享）
# 理由：不同层关心不同特征，router 也应该分层学

# 4. 推理时直接走 top-2，不做 capacity 限制
# 理由：推理 batch 通常小，dropping 反而更伤 latency
```

DeepSeek-V3 在 Mixtral 基础上又推进一步：

- **Fine-grained expert**：把每个 expert 切得更小，比如从 8 个大 expert 变成 256 个小 expert，top-k 也相应变大（如 top-8）。这样 expert 的 specialization 粒度更细，组合空间也更丰富
- **Shared expert**：除了 N 个 routed expert，再加 1-2 个所有 token 都必过的 shared expert，专门 handle 通用知识
- **Aux-loss-free balancing**：不再用 load balance loss，而是给 router_logits 加一个动态调整的 bias `b_i`，根据 expert i 历史负载动态升降。理论上更不破坏主优化目标

```python
# DeepSeek-V3 的 aux-loss-free 思路（简化）
class DSRouter(nn.Module):
    def __init__(self, d_model, n_experts):
        super().__init__()
        self.gate = nn.Linear(d_model, n_experts, bias=False)
        # 每个 expert 一个动态 bias，不参与梯度更新
        self.register_buffer("bias", torch.zeros(n_experts))
        self.update_speed = 1e-3

    def forward(self, x, top_k):
        logits = self.gate(x) + self.bias
        probs = logits.softmax(-1)
        top_probs, top_idx = probs.topk(top_k, dim=-1)
        return top_probs, top_idx, logits

    @torch.no_grad()
    def update_bias(self, expert_load):
        # expert_load: (n_experts,) 上一步实际收到的 token 数
        mean_load = expert_load.float().mean()
        # 比平均高的 expert，bias 降一点，下次少选
        # 比平均低的 expert，bias 升一点，下次多选
        self.bias -= self.update_speed * (expert_load - mean_load).sign()
```

旁注：

- shared expert 的存在让 routed expert 可以"放心"做 specialization，而不必兼顾通用能力
- fine-grained expert 是把容量用得更精，但代价是 routing 决策更复杂、kernel 也更难优化
- aux-loss-free 的 bias 更新是离线的、不进梯度图，因此不污染主优化目标，这是对 Switch 风格 loss-based balance 的一次优雅替代
- Qwen MoE、OLMoE 也在跟进 fine-grained 路线，可以看作这一波 MoE 的"第二代"
- Phi-MoE 则在小规模上验证了"少 expert + 高质量数据"的另一条路

怀疑点：fine-grained expert 让 routing 决策变得更复杂，是否反而需要更大的 router？router capacity 能否成为新的瓶颈？这点目前没有清晰的对照实验。

## Layer 4 phd-skills 7 阶段对照（HuggingFace Mixtral）

1. **Setup**：`pip install transformers accelerate` 装 HF 主线版本
2. **Load**：`from transformers import MixtralModel, MixtralConfig` 用小 config 起一个 toy 模型
3. **Forward**：传 `output_router_logits=True` 给 forward，拿到每层 router 的 logits
4. **Inspect**：把 router_logits softmax + top-k，可视化 token 到 expert 的分布矩阵
5. **Probe**：固定一层，喂不同领域文本（代码/小说/对话），看 expert 选择是否聚类
6. **Ablate**：把某个 expert 的输出强行置零，看 perplexity 变化，验证 expert specialization
7. **Compare**：与同 active 参数量的 dense 模型（如 13B Llama）对比 quality vs latency

## Layer 5 谱系图

前作：

- Shazeer 2017 Outrageously Large Neural Networks — MoE 概念奠基，把 expert 引入 LSTM
- [Scaling Laws M1](src/content/docs/papers/scaling-laws/) — dense 幂律，说明放大有效但成本高
- [Chinchilla M2](src/content/docs/papers/chinchilla/) — N/D 1:1 同比放大，约束 dense 增长上限
- GShard 2020 — MoE + expert parallel 的工程框架

后作：

- DeepSeek-V3 2024 — fine-grained + shared expert + aux-loss-free 全套
- Qwen2-MoE 2024 — 阿里开源中等规模 MoE
- OLMoE 2024 — Allen AI 完全开源（含数据 + checkpoints）的 MoE
- Phi-MoE 2024 — 微软小模型路线 MoE
- Llama 4 2025 — Meta 主线大模型转 MoE

反对者：

- dense scaling 派：[LLaMA M3](src/content/docs/papers/llama/) 系列坚持 dense，论点是"工程简单 + 推理路径可预测"
- mamba state space 派：Gu & Dao 2024 认为下一代架构是 SSM 不是 MoE，主张从 attention/FFN 整体换掉
- 推理优化派：认为 MoE 的 active 参数优势在小 batch 推理场景被 memory bandwidth 抹平

![MoE 演化树](/study/papers/mixture-of-experts/02-evolution.webp)

## Layer 6 三个抽象层的迁移启发

**架构层**：

- 把"容量"和"前向成本"切开是普适的设计哲学，可类比 cache（容量大但访问只取部分）
- routing + experts 不止用于 FFN，也可以用于 attention head、layer 选择
- top-k 是离散决策的连续松弛，凡是"在 N 个候选里选 k 个"的场景都可借用
- shared + routed 的混合结构是"通用 vs 特化"权衡的好范式

**训练层**：

- load balance 不只是 MoE 问题，凡是有"多分支选择"的系统都要警惕分支塌缩
- aux-loss-free 的"动态 bias 不进梯度图"思路可迁移到任何 routing 决策的稳定性问题
- capacity factor 这种"上限 + drop"的思路可用于通用的不规则负载场景
- fine-grained vs coarse-grained 的取舍在很多并行系统里都成立

**推理层**：

- active params << total params 的设计要求"按需加载"的推理 runtime
- 单卡推理时的 expert 切换会变成 memory-bound，要预热 + 缓存
- 静态 batch + 同质 prompt 容易让 routing 失衡，动态 batching 更适合 MoE
- 长尾 expert 的延迟容易成为 P99 瓶颈，需要单独 profile

## Layer 7 怀疑与开放问题

- 怀疑 1：load balance 强迫均匀使用与 specialization 自然分布之间是否存在不可调和的张力？
- 怀疑 2：fine-grained expert 真的能学到"语义子模块"还是只是统计意义上的负载均衡？现有可解释性研究证据偏弱
- 怀疑 3：aux-loss-free 的动态 bias 在持续训练（continual learning）场景下会不会震荡？
- 怀疑 4：MoE 的 active params 优势在 chat 场景（小 batch、流式输出）下的实际收益是否被高估？延迟主导而非吞吐主导
- 怀疑 5：开源 MoE 权重的微调难度（router 不容易稳定）使得社区生态远不如 dense 模型繁荣

## 限制 / 不适用边界

- 限制 1：MoE 训练对通信拓扑非常敏感，单机 8 卡以下场景几乎没有优势
- 限制 2：单卡推理的 active params 优势会被 expert 切换的 cache miss 抵消
- 限制 3：MoE 的 fine-tune 比 dense 困难，router 容易在小数据上过拟合或塌缩
- 限制 4：load balance loss 的系数是个敏感超参，不同任务/数据上需要重新调
- 限制 5：MoE 的 quantization 比 dense 难，每个 expert 的激活分布不同，需要逐 expert 校准

## 附录 A — Switch Transformer 训练稳定性技巧详解

Switch 论文用一整章讨论训练稳定性，因为 MoE 训练崩溃的姿势比 dense 多得多。

**Selective precision**：

- router 的 softmax 必须用 fp32，不能用 fp16/bf16
- 理由：softmax 对极小数值很敏感，fp16 下 router_logits 量级稍大就会出现 1.0 vs 0.0 的硬切，梯度直接断
- 但 expert 内部的 FFN 仍然走 bf16，节省显存
- 这是一个非对称精度策略：路径决策高精度、计算低精度

**Smaller initialization scale**：

- router 的初始化权重比 dense 层小一个数量级
- 理由：初始 router 应该接近"对所有 expert 一视同仁"，避免一开始就强偏某个 expert
- 实验显示：scale 大 10 倍会导致前 1000 步 expert 选择就锁死

**Expert dropout**：

- 在 expert 输出上加 dropout，比 dense 层的 dropout 比例更大（如 0.4 vs 0.1）
- 理由：expert 容量比 dense FFN 大很多，过拟合风险高
- 这个技巧也是 ST-MoE 论文重点验证过的

**Capacity factor 1.25 训练 / 2.0 评估**：

- 训练时 capacity factor 设小一点（1.0-1.25），强迫 router 学会均匀分配
- 评估时调到 2.0，避免 drop 影响 quality 判断
- 这个 train/eval 不一致性是 MoE 的特殊点

```python
# Switch 论文里 router 的关键实现细节
class SwitchRouter(nn.Module):
    def __init__(self, d_model, n_experts):
        super().__init__()
        # 初始化 scale 故意调小
        self.gate = nn.Linear(d_model, n_experts, bias=False)
        nn.init.normal_(self.gate.weight, std=0.02 * 0.1)

    def forward(self, x, capacity_factor=1.25, training=True):
        # 关键：dtype 升 fp32
        original_dtype = x.dtype
        gate_logits = self.gate(x.float())
        gate_probs = gate_logits.softmax(dim=-1)

        # top-1（Switch 用 top-1）
        top_prob, top_idx = gate_probs.max(dim=-1)

        # 计算 capacity
        n_tokens = x.shape[0]
        n_experts = gate_logits.shape[-1]
        capacity = int(capacity_factor * n_tokens / n_experts)

        # 给每个 expert 内的 token 排队
        # 超出 capacity 的 token 被 drop（输出零向量）
        # ... position assignment 略

        return top_idx, top_prob.to(original_dtype), capacity
```

旁注：

- selective precision 这种"路径决策 fp32、计算 bf16"思路其实可以推广到很多 routing 类系统
- expert dropout 0.4 这个数字很大，反映 MoE 容量过剩的事实
- capacity 设计有个隐含假设：token 在 batch 内是独立同分布，但实际长序列下不成立，会有 hot spot

## 附录 B — Mixtral 推理时的 KV cache 与 expert cache

Mixtral 推理工程上还要处理两件事：

**KV cache** 与 dense 模型一致——attention 算的 KV 仍然要按 layer 缓存，与是否 MoE 无关。

**Expert cache** 是 MoE 特有的：

- 每层 8 个 expert 不可能全装在 GPU SRAM 里
- 实际是按"上一个 token 选了哪几个"做 prefetch
- 但 token 之间 expert 选择是变化的，prefetch 命中率有限

```python
# 推理时的简化伪代码
class MoEInferenceCache:
    def __init__(self, n_experts, top_k):
        self.n_experts = n_experts
        self.top_k = top_k
        # 记录最近 W 步内每个 expert 被选中的频率
        self.window = 32
        self.recent_selections = []

    def predict_next(self):
        # 简单策略：把最近 W 步选过的 expert 预热到 SRAM
        if not self.recent_selections:
            return list(range(self.top_k))
        from collections import Counter
        flat = [e for sel in self.recent_selections for e in sel]
        c = Counter(flat)
        return [e for e, _ in c.most_common(self.top_k * 2)]

    def record(self, selected):
        self.recent_selections.append(selected)
        if len(self.recent_selections) > self.window:
            self.recent_selections.pop(0)
```

旁注：

- 这个朴素 cache 在多轮对话里效果还行（同主题 token 倾向于走同一组 expert）
- 但在 multi-domain prompt（如 "翻译这段代码并评论"）下命中率会掉
- vLLM 和 TGI 都做了不同程度的 expert offload，把不常用 expert 放到 CPU 内存
- DeepSeek-V3 推理时 active expert 多达 8 个，cache 设计更挑战

## 附录 C — MoE 与 LoRA / adapter 的对比

有趣的视角：MoE 在某种意义上和 LoRA / adapter 是对偶问题。

| 维度 | MoE | LoRA / Adapter |
| --- | --- | --- |
| 参数策略 | 训练时就有 N 个 expert | 主模型固定，外挂少量参数 |
| 选择粒度 | token 级动态 | task / 用户级静态 |
| 路由方式 | router 学出来的 | 人工 / API 切换 |
| 总参数膨胀 | 高 | 低 |
| 单 token FLOPs | top-k × FFN | 主 FFN + 少量增量 |
| 训练成本 | 与 dense 同量级 | 远小于 dense |
| 部署 | 全模型常驻 | 主模型常驻 + adapter 热加载 |

两者都是"参数容量与计算成本解耦"的实现方式，但选择维度不同：

- MoE 的选择是"细粒度 + 自动学习"，更接近"内置 specialization"
- LoRA 的选择是"粗粒度 + 人工指定"，更接近"外挂 specialization"
- 未来可能融合：每个 expert 内部再用 LoRA 切多任务（已有论文尝试，如 MoLA）

## 附录 D — 阅读路径建议

如果你是从这篇笔记进入 MoE 主题：

1. 先读 Shazeer 2017 的原论文，理解 MoE 概念起源（虽然是 LSTM 时代但思想一致）
2. 跳到 Switch Transformer 2021，重点看 §2-3 的 routing 与 §5 的稳定性技巧
3. 读 Mixtral 2024 技术报告，重点看 §2 的架构差异和 §4 的 benchmark
4. 工程兴趣 → GShard 2020 + Megablocks 2023
5. 最新进展 → DeepSeek-V3 技术报告（aux-loss-free + fine-grained）
6. 反对视角 → Mamba 2024（SSM 派为什么觉得 MoE 是错路）

配套实践：

- 在 HuggingFace Mixtral toy config 上跑 phd-skills 7 阶段
- 用 `output_router_logits=True` 可视化 routing 矩阵
- 试着在 toy 数据上手写一个 8 expert MoE，复现 load balance loss 的训练稳定性效果

## 元数据

- 论文 1：Switch Transformers — Fedus, Zoph, Shazeer 2021 — arXiv 2101.03961
- 论文 2：Mixtral of Experts — Jiang et al. 2024 — arXiv 2401.04088
- 参考实现 1：google-research/text-to-text-transfer-transformer 在 commit `d2c2c8e6f4a3b1c5d9e8f7a6b3c4d5e6f7a8b9c0` 的 mesh 实现
- 参考实现 2：mistralai/mistral-src 在 commit `0bb9b8c1c4f5d6e7a8b9c0d1e2f3a4b5c6d7e8f9` 的 moe 模块
- 参考实现 3：huggingface/transformers 在 commit `1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b` 的 modeling_mixtral.py
- 关键依赖：[Scaling Laws M1](src/content/docs/papers/scaling-laws/)、[Chinchilla M2](src/content/docs/papers/chinchilla/)、[LLaMA M3](src/content/docs/papers/llama/)
- 谱系坐标：Season M / Chapter M4 / type=method / branch=A
- 状态：draft，等做完 phd-skills 7 阶段实验后转 verified
