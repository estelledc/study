---
title: Megatron Core MoE 大规模训练 — 零基础学习笔记
来源: https://arxiv.org/abs/2603.07685
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

## 从日常类比开始：专科会诊中心 vs 总机接线

想象你要运营一家**超大型连锁医院**（千卡 GPU 集群），里面有两种科室：

- **Attention 层**像**总机 + 全科医生**：每个病人（token）都要和当天所有在院记录（上下文）对一遍话——计算模式**密集**，适合把同一份病历拆给几位医生并行看（**Tensor Parallelism, TP**）。
- **MoE 专家层**像**32 个专科门诊**：每个病人只被分到 **Top-K 个专家**会诊——总「名医库」很大，但单次会诊只开几间诊室。若把每位专家再切成碎片（对专家矩阵做 TP），单次 GEMM 更小、GPU 更闲；更自然的做法是**把不同专家放到不同 GPU**（**Expert Parallelism, EP**），再在 GPU 之间**派单、收单**（all-to-all 通信）。

旧训练框架的问题，相当于**强迫总机和专科门诊共用同一套排班表**：传统约束要求 `EP ≤ DP`（专家并行度不能超过数据并行度），Attention 想要 `TP=4` 时，MoE 层的 EP 也被迫受限——**dense 层和 sparse 层的最优拓扑互相打架**。

NVIDIA 2026 年 3 月发布的技术报告 **《Scalable Training of Mixture-of-Experts Models with Megatron Core》**（arXiv:[2603.07685](https://arxiv.org/abs/2603.07685)）系统总结了 **Megatron-Core MoE** 栈：用 **Parallel Folding** 给 Attention 和 MoE **各排各的班**，再叠加内存、通信、计算三面优化，在 GB200/GB300 上把 DeepSeek-V3-685B、Qwen3-235B 推到 **900–1200+ TFLOPS/GPU** 量级。

一句话：**MoE 训练不是「把 dense 训练脚本多加几个 expert 参数」——而是 memory × communication × compute 的系统共设计。**

---

## 是什么

| 项目 | 内容 |
|------|------|
| 类型 | 技术报告（Technical Report） |
| 机构 | NVIDIA |
| 代码 | [NVIDIA/Megatron-LM](https://github.com/NVIDIA/Megatron-LM) 的 `megatron/core/transformer/moe/` |
| 关联论文 | [MoE Parallel Folding (2504.14960)](https://arxiv.org/abs/2504.14960) |
| 验证模型 | DeepSeek-V3、Qwen3-235B、Mixtral、Qwen2/3 系列等 |
| 规模 | 数十亿到**万亿**参数、**数千 GPU** 集群 |

报告不是提出新的 MoE 路由算法，而是回答：**在真实硬件上，如何把 MoE 训快、训稳、训得起。**

---

## 为什么重要

### 1. MoE 改变了「参数」与「算力」的关系

Dense 模型：参数量 N 与每 token FLOPs 大致同阶增长——加卡、加算力比较「齐步走」。

MoE 模型：总参数可以 685B，但每 token 只激活 ~37B（DeepSeek-V3，约 **18×** 差距）。**显存要装下全部专家**，**算力却只跑一小撮**——于是出现报告里的 **parameter-compute mismatch（参数-计算错配）**。

### 2. 三面墙（Three Walls）彼此牵连

| 墙 | 典型症状 | 只修一面会怎样 |
|----|----------|----------------|
| **Memory Wall** | 激活 > 权重；DeepSeek-V3 单卡激活可达 **131 GB** | 开 recomputation 省内存 → 通信占比暴露 |
| **Communication Wall** | EP all-to-all 占 **20–60%** 迭代时间 | overlap 通信 → 专家 GEMM 太短，overlap 吃不饱 |
| **Compute Wall** | 小 batch、多专家 → kernel 碎片化、MFU 低 | 上 CUDA Graph → 与 dropless 动态 shape 冲突 |

Megatron-Core 的核心主张：**三面要一起调**，不能「头痛医头」。

### 3. 工业界事实标准栈

DeepSeek-V3、Qwen3 等模型的**预训练配置**大量出现在 Megatron-MoE-Model-Zoo；读这篇报告 ≈ 读当前大规模 MoE **系统最佳实践清单**。

---

## 核心概念

### 1. MoE 层四阶段前向（Route → Dispatch → Compute → Combine）

Megatron-Core 把 MoE 层拆成模块化流水线：

```text
输入 tokens
  → [1 Route]     Router 选 Top-K 专家 + 路由权重
  → [2 Dispatch]  按专家 permute + 跨 GPU 搬运（all-to-all / DeepEP / HybridEP）
  → [3 Compute]   本地专家 Grouped GEMM（TEGroupedMLP）
  → [4 Combine]   加权聚合 + unpermute 回原 token 顺序
```

**Router、Dispatcher、Experts** 可独立优化：换 dispatcher 不必改 expert 内核；expert 换 FP8 后端不必动 router 融合。

### 2. 五维并行 + Parallel Folding

传统 Megatron **dense** 并行：**TP、PP、DP、CP（Context Parallel）**。

MoE 再加第五维：**EP（Expert Parallel）**——每个 rank 持 `E/EP` 个专家。

**Parallel Folding** 为 Attention 与 MoE **分别定义进程组**：

| 层类型 | 典型符号 | 含义 |
|--------|----------|------|
| Attention | TP, CP, DP | 与 dense Transformer 类似 |
| MoE | **ETP**, **EP**, **EDP** | Expert Tensor / Expert / Expert Data Parallel |

关键突破：**打破 `EP ≤ DP`**。MoE 的 EP 可以「折叠」到 Attention 的 `TP × CP × DP` 子组之上。

**示例（报告 Figure 5 思路）**：256 GPU，`PP=4`，Attention 侧 `TP=4, CP=2, DP=8`；MoE 侧可设 `ETP=1, EP=64, EDP=1`——专家并行度是旧约束下的 **8×**。

### 3. Token Dispatcher 三种后端

| 类型 | 特点 | 适用 |
|------|------|------|
| **AllGather** | 实现简单 | 小规模、调试 |
| **all-to-all** | NCCL 标准 EP 通信 | 通用 |
| **Flex（DeepEP / HybridEP）** | 针对 NVLink / 跨节点优化 | H100、B200、GB200 生产 |

HybridEP 在 GB200 上对 hidden=7168、seq=4096、256 experts 等配置，**通信延迟 consistently 低于纯 all-to-all**（跨节点差距更大）。

### 4. Grouped GEMM 与 dropless MoE

每个 GPU 上多个专家的小 GEMM 若逐个 launch，SM 利用率极差。**Grouped GEMM** 把「同一 rank 上所有专家的 MLP」合成一次 batched GEMM（Megablocks / Tutel / Transformer Engine 路线）。

**Token dropless（dMoE）**：不丢弃过载 token，允许动态每个 expert 收到不同 token 数——更保真，但 shape 动态，与 **CUDA Graph** 冲突；Megatron 用 **sync-free execution**、细粒度 graph scope（如只 capture attention）折中。

### 5. 内存优化组合拳（DeepSeek-V3 单卡 BF16 示意）

报告 Table 3：`PP4 × VPP4 × EP64`，256 GPU，**未优化前 ~199.5 GB/GPU**（远超 H100 80GB）：

| 组件 | 占用 | 主要手段 |
|------|------|----------|
| 权重+梯度 | 36.4 GB | PP / EP / TP 分片 |
| 优化器状态 | 32.1 GB | Distributed Optimizer、BF16 moments、FSDP+EP |
| **激活** | **131.0 GB** | FP8/NVFP4、细粒度 recomputation、offload、Memory-Efficient Permutation |

**Memory-Efficient Permutation**：把 router 概率 `p_i` 从「专家输出后乘」改到「SwiGLU 激活后、第二层线性前乘」——数学等价（无 bias 时），却少存一份 expert 输出用于反传，DeepSeek-V3 上约 **省 26.3 GB** 激活，**零额外算力**。

### 6. 低精度：FP8 / NVFP4

MoE 训练支持 blockwise FP8、NVFP4：线性层输入存低精度 → 激活内存 **减半或 1/4**；通信量也可下降；Tensor Core GEMM 加速。需 **selective precision**（router、norm 等仍 BF16）保收敛。GB200 上 DeepSeek-V3 优化配置可达 **1048 TFLOPS/GPU**（Table 17）。

### 7. 性能数字（报告摘要）

| 模型 | 平台 | TFLOPS/GPU（报告峰值） |
|------|------|------------------------|
| DeepSeek-V3-685B | GB300 / GB200 | **1233 / 1048** |
| Qwen3-235B | GB300 / GB200 | **974 / 919** |
| DeepSeek-V3 | H100 ×1024 | **368**（配置不同，跨节点 EP 更重） |

另：Parallel Folding 论文在 H100 上 Mixtral 8×22B 约 **49.3% MFU**，Qwen2-57B-A14B 约 **39.0% MFU**。

---

## 代码示例

### 示例 1：用 Python 模拟 MoE 四阶段与 EP 派单

下面不是 Megatron 源码，而是帮助理解 **Route → Dispatch → Compute → Combine** 与 **EP 分片** 的最小模型：

```python
import torch
from collections import defaultdict

NUM_EXPERTS = 8
TOP_K = 2
EP_SIZE = 4  # 4 个 GPU，每 rank 2 个专家
HIDDEN = 16

# 模拟 6 个 token、随机 router logits
tokens = torch.randn(6, HIDDEN)
logits = torch.randn(6, NUM_EXPERTS)
weights, experts = torch.topk(logits, TOP_K, dim=-1)
route_w = torch.softmax(weights, dim=-1)

def ep_rank(expert_id: int) -> int:
    """专家 e 落在哪个 EP rank"""
    return expert_id // (NUM_EXPERTS // EP_SIZE)

# --- Stage 1: Route（已完成：experts, route_w）---

# --- Stage 2: Dispatch — 按 (rank, expert) 分桶 ---
buckets = defaultdict(list)  # (rank, local_expert) -> [(token_idx, weight)]
for t in range(tokens.size(0)):
    for k in range(TOP_K):
        e = experts[t, k].item()
        r = ep_rank(e)
        local_e = e % (NUM_EXPERTS // EP_SIZE)
        buckets[(r, local_e)].append((t, route_w[t, k].item()))

print("Dispatch buckets (rank, local_expert) -> token indices:")
for key, pairs in sorted(buckets.items()):
    print(f"  {key}: {[p[0] for p in pairs]}")

# --- Stage 3: Compute — 每 rank 上对本地专家做 MLP（此处用恒等映射示意）---
expert_out = torch.zeros_like(tokens)
for t in range(tokens.size(0)):
    acc = torch.zeros(HIDDEN)
    for k in range(TOP_K):
        acc = acc + route_w[t, k] * tokens[t]  # 真实场景是 Expert_MLP_e(x)
    expert_out[t] = acc

# --- Stage 4: Combine ---
output = expert_out  # 已按 token 顺序聚合
print("output shape:", output.shape)
```

真实训练中，**Dispatch/Combine** 是 NCCL all-to-all 或 DeepEP；**Compute** 是 `TEGroupedMLP` 一次调用多个专家。

### 示例 2：Megatron-LM 训练脚本中的 MoE 与性能 flag

来自官方 `megatron/core/transformer/moe/README.md` 的推荐配置片段：

```bash
# ===== 基础 MoE 结构（8 专家、Top-2、辅助负载均衡损失）=====
--num-experts 8
--moe-shared-expert-intermediate-size 2048
--moe-router-load-balancing-type aux_loss
--moe-router-topk 2
--moe-aux-loss-coeff 1e-2

# ===== Token 派单：生产环境优先 Flex + DeepEP/HybridEP =====
--moe-token-dispatcher-type flex
--moe-flex-dispatcher-backend deepep   # GB200 上可换 hybridep

# ===== 计算与融合 =====
--moe-grouped-gemm
--moe-router-fusion
--moe-permute-fusion

# ===== 并行与通信 overlap =====
--use-distributed-optimizer
--overlap-param-gather
--overlap-grad-reduce
--overlap-moe-expert-parallel-comm
--delay-wgrad-compute

# ===== 内存：细粒度 recomputation（mla / moe / norm 等可选）=====
--recompute-granularity selective
--recompute-modules moe moe_act norm
```

**Parallel Folding** 具体 TP/EP/PP 组合需按模型与 GPU 显存迭代；Model Zoo 提供 DeepSeek-V3、Qwen3-235B 等参考 config。单机调试可用 `--fake-init-process-group` 在 **1 GPU** 上模拟分布式显存占用，先找「不 OOM 的可行并行度」。

### 示例 3：Parallel Folding 配置直觉（伪 YAML）

```yaml
# 256 × GB200，DeepSeek-V3 风格（报告 Table 17 简化）
cluster:
  gpus: 256
  model: deepseek_v3_685b

attention_parallel:
  pipeline_parallel: 4
  tensor_parallel: 4      # 仅 Attention / Dense 部分
  context_parallel: 2
  data_parallel: 8

moe_parallel:              # Parallel Folding：与 attention 解耦
  expert_tensor_parallel: 1   # 专家不做 TP，保持 GEMM 粒度
  expert_parallel: 64         # 可 > attention DP，打破 EP≤DP
  expert_data_parallel: 1

dispatcher:
  type: flex
  backend: hybridep        # NVL72 域内 EP

precision:
  compute: fp8_blockwise
  optimizer_states: bf16
```

---

## MoE 训练调参工作流（报告 Section 9 提炼）

```text
Step 1  在显存预算内找可行并行度
        → fake-init / 估算 activation、权重、optimizer 三分量
Step 2  最小化 TP/EP，最大化 DP（通信开销 vs 内存）
        → EP×TP 尽量落在单节点 NVLink 域
Step 3  跨节点优先加 PP，而非把 EP 拉过网络
Step 4  三面墙迭代：permute 内存 → dispatcher → overlap → Grouped GEMM → FP8 → CUDA Graph
Step 5  长上下文单独调：CP + MLA recomputation + optimizer CPU offload
```

**Guideline 记忆点**：MoE 的 EP 通信是 **medium–high** 带宽敏感；Attention 的 TP 是 **high**；PP 跨节点但 activation 不随 EP 分片——**激活常常是调 parallel mapping 的第一约束**。

---

## 与相关系统对比

| 系统 | 侧重点 |
|------|--------|
| **GShard / Switch / GLaM** | MoE 算法与负载均衡先驱 |
| **Tutel / DeepSpeed-MoE** | 早期 MoE 系统优化 |
| **Megatron-Core MoE（本篇）** | 生产级全栈：Parallel Folding + DeepEP/HybridEP + TE Grouped GEMM + FP8/NVFP4 + 长上下文 |
| **vLLM / SGLang** | **推理** serving；本篇是 **训练** |

训练栈与推理栈问题不同：训练要存 **optimizer + 全量 expert 权重 + 反向激活**；推理只需活跃专家与 KV cache。

---

## 实践案例

### 案例 1：DeepSeek-V3 on GB200（256 GPU）

- 配置：`PP=4`，Parallel Folding，HybridEP，CUDA Graph（缓解 FP8 下 CPU launch 瓶颈）
- 结果：**1048 TFLOPS/GPU**
- 启示：Blackwell 上 **host 开销** 可能成为新瓶颈，graph 不是可选项

### 案例 2：DeepSeek-V3 on H100（1024 GPU）

- 跨节点 **EP64**，通信占主导 → DeepEP + **EP A2A overlap** + FP8 blockwise
- 结果：**368 TFLOPS/GPU**（仍远低于 GB200，但集群可扩展）
- 启示：**同模型不同硬件 = 不同优化栈**，不能照搬 flag

### 案例 3：长上下文 256K

组合 **CP + TP + selective recomputation（MLA up-proj 等）+ optimizer CPU offload**；DeepSeek-V3 在 256 Hopper GPU 上长上下文 MFU 可达短上下文的 **88%**。

---

## 常见误区

1. **「MoE 参数多但算力省，显存应该更省」** — 错。未激活专家权重仍要驻留；激活还随层数、top-k、batch 增长。
2. **「EP 越大越好」** — 错。EP 增大 → all-to-all 体积与次数上升；需 NVLink 域内或 overlap。
3. **「全开 recomputation 就行」** — 错。MoE 层整层 checkpoint 会 **重跑 all-to-all**；应 **细粒度**（SwiGLU、LayerNorm、MLA up-proj）。
4. **「Attention 和 MoE 用同一 TP/DP」** — 旧范式；大模型应评估 **Parallel Folding**。

---

## 延伸阅读

- 报告全文：[arXiv:2603.07685](https://arxiv.org/abs/2603.07685)
- Parallel Folding 细节：[arXiv:2504.14960](https://arxiv.org/abs/2504.14960)
- 代码 README：[megatron/core/transformer/moe/README.md](https://github.com/NVIDIA/Megatron-LM/blob/main/megatron/core/transformer/moe/README.md)
- 预训练 config 参考：[Megatron-MoE-ModelZoo](https://github.com/yanring/Megatron-MoE-ModelZoo)

---

## 小结

| 你学到的 | 一句话 |
|----------|--------|
| 参数-计算错配 | 总参数 ≫ 每 token 计算 → 必须 EP，且内存装全量专家 |
| 三面墙 | Memory / Communication / Compute 联动，单点优化会暴露其他瓶颈 |
| Parallel Folding | Attention 与 MoE **分开排并行度**，打破 EP≤DP |
| 四阶段 MoE 层 | Route → Dispatch → Compute → Combine，模块可替换 |
| 系统优化 | Grouped GEMM、DeepEP/HybridEP、细粒度 recomputation、FP8/NVFP4、CUDA Graph |
| 数字 | DeepSeek-V3 **1000+ TFLOPS/GPU**（GB200 级），依赖整栈而非单 trick |

Megatron-Core MoE 这篇报告的价值，在于把「能训万亿 MoE」拆成**可操作的系统 checklist**——从进程组拓扑到 dispatcher 选型，从 permute 的数学等价变形到 FP8 该存哪些 tensor。下次你看到 `--moe-token-dispatcher-type flex`，知道它背后是 **Communication Wall** 上的一整套工程，而不只是一个 CLI 开关。
