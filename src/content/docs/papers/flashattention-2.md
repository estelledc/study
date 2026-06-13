---
title: FlashAttention-2 — 更快的 Attention 与更好的并行
来源: https://arxiv.org/abs/2307.08691
日期: 2026-06-13
子分类: ML 系统
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：流水线已经省下了仓库运费，但车间排班还不对

FlashAttention（第一代）解决的是**仓库问题**：标准 attention 要把整张 N×N 的「谁看谁」分数表写进 HBM（显存里的慢速仓库），FlashAttention 用分块 + online softmax，**从不把整张表落盘**，显存从 O(N²) 降到 O(N)，速度也涨了 2–4×。

但 Tri Dao 在 2023 年的 FlashAttention-2 论文里发现：**仓库运费省下来了，车间里的工人排班还是乱的**。

想象一条 GPU 上的**汽车装配线**：

- **Streaming Multiprocessor（SM）** = 一条独立产线（A100 有 108 条）。
- **Thread block** = 一个班组，负责某批零件。
- **Warp（32 线程）** = 班组里 32 个工人，必须步调一致干活。

FlashAttention-1 的排班是：**每个 attention head 派一个班组**（thread block 数 ≈ batch × heads）。当 batch 很小、head 不多时，108 条产线可能只开了 8 条——**大量 SM 空转（低 occupancy）**。序列很长时，单个班组要干完一整头 attention，**内部工人还要互相传半成品（shared memory 读写）**，进一步拖慢。

FlashAttention-2 做了三件事：

1. **少做「非矩阵乘」杂活**——GPU 的 Tensor Core 算矩阵乘比算 exp/除法快一个数量级，把 rescale 挪到块末尾统一做。
2. **沿序列长度再切一刀并行**——哪怕 batch=1、head=1，长序列也能拆成多个 row block，**多条产线同时干同一头 attention**。
3. **班组内按 Q 行切 warp，而不是按 K 列切**——每个 warp 独立算自己那几行输出，**不用在 shared memory 里开会合并**。

结果：在 FlashAttention 已经很快的基础上再快约 **2×**，A100 上达到理论峰值 FLOPs 的 **50–73%**，端到端 GPT 训练约 **225 TFLOPs/s（72% MFU）**——接近 cuBLAS 那种纯 GEMM 的效率。

---

## 是什么

**FlashAttention-2: Faster Attention with Better Parallelism and Work Partitioning**（Tri Dao，2023 年 7 月，[arXiv:2307.08691](https://arxiv.org/abs/2307.08691)）是在 FlashAttention **数学完全不变**（仍是 exact attention，无近似）的前提下，重写 CUDA kernel，优化 **GPU 并行调度与工作划分**。

| 项目 | 内容 |
|------|------|
| 作者 | Tri Dao（Stanford，Christopher Ré 组） |
| 实现 | 基于 NVIDIA CUTLASS 3.x / CuTe 从零重写 |
| 相对 FA1 | 约 **2×** kernel 加速；A100 达峰值 FLOPs 的 50–73%（FA1 仅 25–40%） |
| 端到端 | GPT 类模型训练最高约 **225 TFLOPs/s / A100**，**72% model FLOPs utilization** |
| 开源 | [github.com/Dao-AILab/flash-attention](https://github.com/Dao-AILab/flash-attention)（v2 起默认后端） |

与 PagedAttention（[[paged-attention-vllm]]）正交：PagedAttention 管 **KV cache 怎么存**；FlashAttention-2 管 **attention 矩阵怎么算**。现代 LLM 栈里两者常一起出现。

---

## 为什么重要

- **长上下文训练/推理的算力底座**：32k、128k context 若仍用 naive attention，算力和显存都扛不住；FA2 让「长序列 + 大 batch」在硬件上可行。
- **PyTorch 2.x 默认路径**：`F.scaled_dot_product_attention` 在 CUDA 上优先走 FlashAttention-2/3 kernel，**不改模型代码**就吃到加速。
- **说明「系统优化第二幕」**：FA1 证明 IO-aware 能赢；FA2 证明 **occupancy + warp 分工** 还能再榨一倍——瓶颈从 HBM 转向 SM 利用率与 kernel 融合。
- **与 [[flash-attention]] 的关系**：先读 v1 理解 tiling / online softmax；v2 是在 v1 正确性之上做 **工程并行化**，不是新算法。

---

## 核心概念

### 1. 标准 attention 的两层瓶颈（复习）

对序列长度 N、head 维度 d：

```
Attention(Q, K, V) = softmax(QK^T / √d) · V
```

- **数学复杂度**：O(N²d) FLOPs。
- **内存**：物化 QK^T 要 O(N²) HBM（FlashAttention-1 已消除）。
- **FA1 之后的新瓶颈**：kernel 仍慢，因为 GPU **SM 没喂饱**、**非 matmul 指令占比高**、**warp 间 shared memory 通信多**。

### 2. 减少 non-matmul FLOPs

A100 上 Tensor Core 做 bf16/fp16 矩阵乘，吞吐远高于 CUDA core 上的 exp、max、除法。

FlashAttention-2 调整 **online softmax 的 rescaling 时机**：在每个 K/V tile 累加时少做几次标量 rescale，**在 tile 边界统一归一化**，让更多时间花在 `QK^T` 和 `PV` 这类 GEMM 上。

直觉：**尽量让 Tensor Core 一直转，别让几个 CPU 式标量运算把流水线卡住。**

### 3. 序列维度并行（2D tiling）

FlashAttention-1 的 thread block 网格大致是：

```
grid ≈ (batch_size × num_heads)
```

当 `batch × heads < SM 数量`（例如推理 batch=1、模型 head=32，A100 有 108 SM）时，**大量 SM 闲置**。

FlashAttention-2 把 Q 的行再切成 `T_r = ⌈N / B_r⌉` 个 **row block**，每个 `(batch, head, row_block)` 启动一个 thread block：

```
grid ≈ (batch_size × num_heads × T_r)
```

长序列（N 大）时，即使 batch 和 head 都小，也能 **用满 GPU**。反向传播类似地沿 K/V 的列块切分。

### 4. Warp 级工作划分：split-Q 取代 split-K

在一个 thread block 内部，FA1 曾把 **K 的列** 分给不同 warp（split-K）：warp 0 算 K 的前几列、warp 1 算后几列……最后 partial output 要在 **shared memory 里 reduce**，跨 warp 读写频繁。

FA2 改为 **split-Q**：

- 每个 warp 负责 **Q 的不同行子集**（输出行的不同 slice）。
- K、V 的 tile **所有 warp 共享读取**。
- 各 warp 独立算完自己的输出 slice，**无需 warp 间归约**。

类比：以前 4 个工人各切菜的不同部位，最后还要把半成品倒进同一个盆搅拌；现在每人负责一道完整的小份菜，**各做各的，互不打扰**。

### 5. 性能数字怎么读

| 指标 | FA1（约） | FA2（约） | 含义 |
|------|-----------|-----------|------|
| 峰值 FLOPs 利用率 | 25–40% | 50–73% | 离 A100 312 TFLOPs/s 理论峰值有多近 |
| 相对 FA1 加速 | 1× | ~2× | 同硬件、同精度、同 N |
| 端到端 GPT 训练 | — | ~225 TFLOPs/s | 含 embedding、MLP、通信等全模型 |
| MFU | — | ~72% | Model FLOPs Utilization，业界常用训练效率指标 |

「接近 GEMM 效率」的含义：attention 这种带 softmax 的非纯 matmul 算子，终于能和 cuBLAS 矩阵乘 **处在同一数量级** 的硬件利用率。

---

## 代码示例

### 示例 1：PyTorch 里显式选用 FlashAttention-2 后端

PyTorch 2.0+ 的 SDPA 会自动选最快 backend；下面演示如何 **强制对比** math（朴素）与 flash：

```python
import torch
import torch.nn.functional as F
from torch.nn.attention import SDPBackend, sdpa_kernel

# shape: [batch, num_heads, seq_len, head_dim]
B, H, N, D = 2, 32, 8192, 128
q = torch.randn(B, H, N, D, device="cuda", dtype=torch.bfloat16)
k = torch.randn(B, H, N, D, device="cuda", dtype=torch.bfloat16)
v = torch.randn(B, H, N, D, device="cuda", dtype=torch.bfloat16)

# FlashAttention-2（PyTorch 内部调用 flash_attn CUDA kernel）
with sdpa_kernel(SDPBackend.FLASH_ATTENTION):
    out_flash = F.scaled_dot_product_attention(
        q, k, v, is_causal=True, scale=1.0 / (D ** 0.5)
    )

# 朴素实现：会物化 N×N，长序列 OOM 或极慢
with sdpa_kernel(SDPBackend.MATH):
    out_math = F.scaled_dot_product_attention(
        q, k, v, is_causal=True, scale=1.0 / (D ** 0.5)
    )

# exact attention：数值应一致（允许 bf16 微小误差）
torch.testing.assert_close(out_flash, out_math, rtol=1e-2, atol=1e-2)
```

长序列（N=8192）+ causal 时，`MATH` 往往 **显存爆炸或慢一个数量级**；`FLASH_ATTENTION` 走 FA2 分块路径，**显存 O(N)**、吞吐接近 GEMM。

### 示例 2：直接用 flash-attn 包（训练栈常见写法）

HuggingFace / LLaMA 训练脚本里更常显式依赖 `flash_attn`：

```python
# pip install flash-attn --no-build-isolation
from flash_attn import flash_attn_func

# 输入 layout 与 SDPA 不同：[batch, seq, heads, dim]
x = torch.randn(2, 4096, 32, 128, device="cuda", dtype=torch.bfloat16)
q = k = v = x  # 自注意力示意

# causal=True 启用 GPT 式下三角 mask；softmax_scale 默认 1/sqrt(d)
out = flash_attn_func(q, k, v, causal=True, softmax_scale=None)

# out.shape == (2, 4096, 32, 128)
# backward 同样走 FA2 kernel，不存 N×N attention matrix
loss = out.sum()
loss.backward()
```

`flash_attn_func` 的 v2 实现即论文中的 **split-Q + 序列并行** kernel；与 `torch.compile`、FSDP 等组合时，注意 **head_dim** 仅支持常见值（64、128 等），非 8 倍数可能 fallback。

### 示例 3（伪代码）：online softmax 与 FA2 的 rescale 优化

理解 FA2「少做 non-matmul」可对照下面 **分块流式 softmax**（与 [[flash-attention]] 中 `(m, l)` 记号一致）：

```python
import math

def online_softmax_blocks(scores_blocks):
    """scores_blocks: 把一行 N 个 logits 切成多块，模拟 FA tiling。"""
    m = float("-inf")   # 当前最大值
    l = 0.0             # 当前 exp 之和（未归一化）
    acc = None          # 加权 V 的分子累加（示意）

    for block in scores_blocks:
        m_new = max(m, max(block))
        # FA2：尽量把 rescale 合并到块边界，减少块内多次标量除法
        scale_old = math.exp(m - m_new) if m > float("-inf") else 0.0
        l = l * scale_old + sum(math.exp(x - m_new) for x in block)
        m = m_new
        # ... 同步更新 acc（PV 的在线累加）...

    return [math.exp(x - m) / l for block in scores_blocks for x in block]
```

标准实现每来一块就可能对 **已有累加结果** 做一次 rescale；FA2 在 CUDA 里 **合并 rescale 次数**，让 warp 更多周期花在 `mma.sync`（矩阵乘）上。

---

## FlashAttention-1 vs FlashAttention-2 对照

| 维度 | FlashAttention-1 | FlashAttention-2 |
|------|------------------|------------------|
| 核心创新 | IO-aware tiling + online softmax | 更好的并行与工作划分 |
| Thread block 并行轴 | batch × heads | batch × heads × **seq row blocks** |
| Warp 策略 | split-K，需 shared memory reduce | **split-Q**，warp 独立 |
| non-matmul 占比 | 较高 | **降低**（rescale 合并） |
| A100 峰值利用率 | ~25–40% | **~50–73%** |
| 实现基础 | 手写 CUDA | **CUTLASS 3 / CuTe 重写** |

数学输出：**bit-exact（在浮点语义下与 naive attention 一致）**，不是近似 attention。

---

## 踩过的坑

1. **head_dim 与硬件对齐**：FA2 kernel 对 d=64、128 等优化最充分；奇异的 head_dim 可能无法 dispatch，静默 fallback 到慢路径。
2. **短序列不划算**：N 很小时，额外 thread block 与 tiling 开销 > 收益；seq_len < 512 可能不如朴素 kernel。
3. **与 dropout / 自定义 bias**：训练时 attention dropout 需在 kernel 内支持；自定义 alibi / sliding window 要查 `flash_attn` 版本是否实现。
4. **多卡训练 MFU 仍受通信限制**：单卡 225 TFLOPs/s 是 kernel 胜利；全集群 MFU 还被 ZeRO、梯度 all-reduce 拉低——**别用单卡 micro-benchmark 直接外推集群效率**。
5. **FA3 已针对 H100**：Hopper 上 FlashAttention-3 用 WGMMA 异步再提速；A100 上 FA2 仍是主力。

---

## 适用 vs 不适用

**适用**：

- 长序列 self-attention / causal LM 训练与推理
- 需要 **exact attention**、不能接受 Performer / Linformer 近似
- A100 / RTX 40 系 / H100（配合 FA3）等 NVIDIA GPU
- 与 PyTorch SDPA、HuggingFace、`flash_attn` 生态集成

**不适用**：

- CPU / Apple Silicon 无 CUDA kernel（用 MPS 或 CPU SDPA）
- 极端稀疏 attention pattern（需 block-sparse 专用 kernel）
- 要改 attention 公式本身（如新增可学习 bias 矩阵）——需自写 Triton/CUDA（可参考 [[triton-llm]]）

---

## 与相关工作的位置

```text
Attention 太慢 / 太占显存
    ├── 改算法（近似）: Performer, Linformer, [[mamba]] …
    └── 不改算法（系统）:
            FlashAttention-1  → IO-aware，O(N) 显存
            FlashAttention-2  → 并行 + warp 划分，~2× 更快  ← 本篇
            FlashAttention-3  → Hopper 异步 + FP8
            PagedAttention    → KV cache 分页（[[paged-attention-vllm]]）
```

---

## 历史小故事（可跳过）

- **2022**：FlashAttention-1 在 NeurIPS 2022 亮相，Industry 几乎立刻 adopt。
- **2023 年 7 月**：Tri Dao 单人（相对 v1 合作者更少）发布 FA2 论文；同月/blog 宣布 **CUTLASS 3 完全重写**。
- **2023 下半年**：PyTorch 2.1+ 将 flash 后端默认化；LLaMA 2、Mistral 等训练栈默认 `flash_attn`。
- **2024**：FlashAttention-3 瞄准 H100；FA2 仍是 Ampere/Ada 世代事实标准。

Tri Dao 的轨迹说明：**PhD 期间把一个问题（attention 效率）连续挖三代**，每一代都是同一数学、不同系统层——这是 MLSys 研究的典型成功路径。

---

## 学到什么

1. **第一层优化解决「能不能跑」**（FA1：显存）；**第二层解决「跑满 GPU」**（FA2：occupancy + matmul 占比）。
2. **并行维度要匹配硬件规模**：108 SM 的机器上，并行度只有 8 就会浪费 90% 算力——**序列长度也是并行轴**。
3. **shared memory 是隐形杀手**：warp 间 reduce 看起来便宜，在 attention 这种重复 K/V 读取的结构里会被放大；**改数据归属（split-Q）** 往往比改算法更有效。
4. **读 roofline**：先判断 memory-bound 还是 compute-bound；FA1 针对前者，FA2 在 memory 问题解决后针对 **compute 利用率**。

---

## 延伸阅读

- 论文：[arXiv:2307.08691](https://arxiv.org/abs/2307.08691)
- 作者博客：[Princeton NLP — FlashAttention-2](https://princeton-nlp.github.io/flash-atttention-2/)（含 warp 划分示意图）
- 代码：[Dao-AILab/flash-attention](https://github.com/Dao-AILab/flash-attention)
- 前置笔记：[[flash-attention]]（v1：tiling 与 online softmax）
- 推理侧互补：[[paged-attention-vllm]]（KV cache 分页）
- 基础：[[attention]]（Transformer 原始定义）

## 关联

- [[flash-attention]] —— FlashAttention 第一代，IO-aware exact attention
- [[attention]] —— FlashAttention-2 优化的核心算子
- [[paged-attention-vllm]] —— 推理显存管理，与 FA2 正交互补
- [[cutlass-2020]] —— FA2 基于 CUTLASS 3.x / CuTe 重写 kernel
- [[triton-llm]] —— 若需自定义 attention variant，Triton 是常见第二选择
- [[gpt-3]] / [[llama]] —— 大模型训练依赖 FlashAttention 系列扛长序列
- [[mamba]] —— 「换算法降复杂度」路线，与「精确 attention + 系统优化」路线对照
