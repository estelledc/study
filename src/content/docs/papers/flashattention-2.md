---
title: FlashAttention-2 — 更高吞吐 Attention 的可执行优化
来源: 'Tri Dao, "FlashAttention-2: Faster Attention with Better Parallelism and Work Partitioning", arXiv 2307.08691 (2023)'
日期: 2026-07-10
分类: ml-systems
难度: 进阶
---

## 是什么

FlashAttention-2（**FA2**）是 Tri Dao 在 2023 年对 FlashAttention 的**调度重写**：数学结果仍是精确 attention，但把 GPU 上「谁算哪一块、warp 之间怎么分活」重新排了一遍，让吞吐更接近矩阵乘（GEMM）。

日常类比：FA1 已经把菜从仓库搬到操作台（tiling + online softmax）；FA2 发现厨师们还在互相抢同一块案板、或者有人闲着——于是改排班：少做非炒菜动作、让更多灶同时开火、灶内少传话。

```python
# 官方接口：与 FA1 同形，换的是底层 kernel
from flash_attn import flash_attn_func
out = flash_attn_func(q, k, v, causal=True)  # q/k/v: [B, S, H, D]
```

论文数字：相对 FA1 约 **2×**；A100 上达到理论峰值 FLOPs/s 的 **50–73%**；端到端训 GPT 风格模型可达约 **225 TFLOPs/s / A100**（约 72% model FLOPs utilization）。

## 为什么重要

不理解 FA2，下面这些事很难解释：

- 为什么 FA1 已经「省显存 + 加速」了，训练吞吐仍远低于 cuBLAS GEMM（FA1 常只有峰值的 25–40%）
- 为什么 2023 下半年起很多训练栈默认切到 FA2 / PyTorch SDPA 的 Flash 后端
- 为什么「同一个 head」也能被拆到多个 thread block 上跑——occupancy 不够时再优化算法也白搭
- 为什么非 matmul 的小开销（rescale、online softmax 更新）会拖垮整条 attention 流水线

## 核心要点

FA2 的加速可以拆成 **三刀**（论文贡献 1–3）：

1. **减少非 matmul FLOPs**：把 online softmax 的 rescale 路径改得更「像 GEMM」——GPU 的 Tensor Core 吃矩阵乘很香，吃零碎标量更新很贵。类比：少让厨师反复用小勺调味，把能合并的动作一次做完。

2. **跨 thread block 并行（含单 head）**：FA1 常按 batch×head 切块；序列很长、head 很少时 occupancy 上不去。FA2 把**序列维**也切开，让更多 SM 同时干活。类比：一桌菜不再只派一个灶，长桌可以分段同时炒。

3. **warp 内重划分，少走 shared memory**：同一 block 里各 warp 少互相读写共享缓存，降低同步与往返。类比：灶内每人固定负责一段工序，少把半成品传来传去。

三刀合起来：仍是 IO-aware 精确 attention，但更接近「硬件喜欢的工作形状」。

## 实践案例

### 案例 1：用 FA2 跑一次因果 attention

```python
import torch
from flash_attn import flash_attn_func

B, S, H, D = 2, 4096, 8, 64
q = torch.randn(B, S, H, D, device="cuda", dtype=torch.float16)
k, v = torch.randn_like(q), torch.randn_like(q)
out = flash_attn_func(q, k, v, dropout_p=0.0, causal=True)
print(out.shape)  # [2, 4096, 8, 64]
```

**逐部分解释**：

- `causal=True`：下三角掩码在 **kernel 内**完成，不会先物化 N×N 再 mask。
- dtype 用 fp16/bf16：FA2 主路径面向 Tensor Core；中间 m/l 统计仍需更高精度累加（实现细节）。
- 形状是 `[B, S, H, D]`（官方 flash-attn 约定），不要和 `[B, H, S, D]` 的 SDPA 布局搞混。

### 案例 2：和 PyTorch SDPA 对照「同结果、不同后端」

```python
import torch.nn.functional as F
from torch.nn.attention import SDPBackend, sdpa_kernel

# SDPA 期望 [B, H, S, D]
q2, k2, v2 = q.transpose(1, 2), k.transpose(1, 2), v.transpose(1, 2)
with sdpa_kernel(SDPBackend.FLASH_ATTENTION):
    out_sdpa = F.scaled_dot_product_attention(q2, k2, v2, is_causal=True)
```

**逐部分解释**：现代 PyTorch 把 Flash 类实现收进 SDPA；你要对比的是 **数值是否接近** 与 **ms / 显存**，而不是 API 名字。布局转置错了会直接报错或算出「看起来像对、其实 head 维错位」的结果。

### 案例 3：用一次微基准感受「序列变长」

```python
import time, torch
from flash_attn import flash_attn_func

def bench(S):
    q = torch.randn(1, S, 16, 64, device="cuda", dtype=torch.float16)
    k, v = torch.randn_like(q), torch.randn_like(q)
    torch.cuda.synchronize(); t0 = time.time()
    for _ in range(20):
        flash_attn_func(q, k, v, causal=True)
    torch.cuda.synchronize()
    return (time.time() - t0) / 20

print(bench(1024), bench(4096), bench(8192))
```

**逐部分解释**：标准 attention 的时间和显存随 S² 炸；FA2 仍近似随 S 增长但斜率小得多。记录三组 S 的耗时，比只看「快了多少倍」口号更有用。

## 踩过的坑

1. **布局搞反**：`flash_attn_func` 要 `[B,S,H,D]`，SDPA 常是 `[B,H,S,D]`——转置漏了就全错。
2. **head_dim 不受支持或很慢**：常见甜区是 64/128；奇怪的 head_dim 可能走慢路径或直接不支持。
3. **以为「训练不适用」**：论文明确用 GPT 风格端到端训练验证；FA2 同时服务训练与推理。
4. **和旧 kernel 混用做对比**：没固定版本 / CUDA / 是否 causal，profiling 数字不可复现。

## 适用 vs 不适用

**适用**：

- A100 / 同类数据中心 GPU 上的长序列训练与推理（S 到数千–数万）
- 需要精确 softmax attention，又要把 HBM 流量压下去
- 想逼近 GEMM 级利用率，而不是停留在「比 naive 快一点」

**不适用**：

- 极短序列（例如 S≤128）：tiling 开销可能吃掉收益
- 没有 CUDA Flash 后端的设备（纯 CPU / 未适配的加速器）
- 要改 attention 公式本身（相对位置 bias 乱加、自定义核）——得自己写 kernel
- 只想要「近似线性 attention」那条算法路线（Performer 等）——那是换数学，不是 FA2

## 历史小故事（可跳过）

- **2022**：FlashAttention（FA1）证明 IO-aware 精确 attention 可行，但相对 GEMM 仍慢一截。
- **2023-07**：Tri Dao 放出 FA2（arXiv 2307.08691），核心不再是新公式，而是并行与工作划分。
- **2023 下半年**：训练框架与推理引擎迅速切换；FA2 成为「默认该用的那一版 Flash」。
- **2024**：FA3 转向 Hopper 异步与 FP8；FA2 仍是 A100 世代最常见的生产基线之一。

## 学到什么

1. **同一算法，工作划分可以差一倍吞吐**——瓶颈常在 occupancy 与通信，不在「还会不会写 softmax」。
2. **优化要顺着硬件偏好**：能变成 matmul 的就别拆成标量碎活。
3. **先固定可复现基线**（形状、dtype、causal、版本），再谈加速比。
4. **精确 attention 也能逼近 GEMM 效率**——不必先向近似方法投降。

## 延伸阅读

- 论文：[arXiv 2307.08691](https://arxiv.org/abs/2307.08691)
- 作者页 PDF：[tridao.me flash2](https://tridao.me/publications/flash2/flash2.pdf)
- 代码：[Dao-AILab/flash-attention](https://github.com/Dao-AILab/flash-attention)
- [[flash-attention]] —— FA1：IO-aware tiling 与 online softmax 的起点
- [[flashattention-3-2024]] —— FA3：面向 H100 的异步与 FP8
- [[hopper-architecture-2022]] —— 读懂 FA3 前先看 Hopper；对比 FA2 的 A100 语境

## 关联

- [[flash-attention]] —— FA2 的直接前作：先懂 tiling / online softmax
- [[flashattention-3-2024]] —— 下一跳：Warp 特化 + TMA + FP8
- [[attention]] —— 被加速的数学对象：scaled dot-product attention
- [[paged-attention]] —— 推理侧 KV cache 分页；与 FA 内核常一起出现
- [[fastertransformer-2021]] —— 更早的 NVIDIA 推理优化栈，对照「库内融合」思路
- [[transformer-2017]] —— Attention 成为标配的源头论文
- [[gpt-3]] —— 长上下文与大模型训练把 attention 内核推成系统瓶颈

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[flashattention-3-2024]] —— FlashAttention-3 — 面向 H100 的异步与低精度注意力
- [[kv-fold]] —— KV-Fold — 把 KV cache 当成 fold 的累加器，一段一段读长文
