---
title: FlashAttention — 不改算法，只改数据怎么进 GPU
来源: 'Tri Dao, Daniel Y. Fu, Stefano Ermon, Atri Rudra, Christopher Ré, "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness", NeurIPS 2022 (arXiv 2205.14135)'
日期: 2026-05-30
子分类: GPU 与系统
分类: 图形学
难度: 高级
provenance: pipeline-v3
---

## 是什么

FlashAttention 是一种**让 attention 在 GPU 上跑得更快、占更少显存**的算法。它**不改 attention 的数学定义**——同一个公式、同一个结果，只是换了"数据怎么在 GPU 内部搬运"的方式。

日常类比：开餐馆，菜谱（数学）没变，但你不再让厨师每切一片菜就跑去仓库取一次刀——你把刀、案板、调料一次性搬到台面上，一道菜从头做到尾，菜板（中间结果）根本不写到仓库（HBM）里去。

```python
# 用法：PyTorch 2.0+ 一行就走 FlashAttention 后端
import torch.nn.functional as F
out = F.scaled_dot_product_attention(q, k, v, is_causal=True)
```

效果：BERT-large 训练 +15%，GPT-2 加速 3x，long-range arena 加速 2.4x；**显存从 O(N²) 降为 O(N)**，16k / 64k 长序列首次可以训。

## 为什么重要

不理解 FlashAttention，下面这些事都没法解释：

- 为什么 GPT-3 / LLaMA / Mistral 这一代 Transformer 训练吞吐能突然涨 2-4x，但论文却说"attention 算法没改"
- 为什么 32k / 128k / 1M context 的长上下文模型在 2023-2025 突然爆发——不是模型变聪明，是 attention 显存终于不爆了
- 为什么 PyTorch 2.0 把 `scaled_dot_product_attention` 默认 backend 换了，老代码什么都没改速度就翻倍
- 为什么 attention 的瓶颈不是算力（FLOPs），而是 HBM 带宽——这点反直觉

## 核心要点

FlashAttention 把"快"拆成 **三件事**，缺一不可：

1. **tiling（分块进 SRAM）**：GPU 有两层内存——HBM（大但慢，1.5TB/s）和 SRAM（小但极快，19TB/s）。把 Q/K/V 切成小块，每块塞进 SRAM 算完再走。类比：仓库（HBM）里的食材搬一小筐到操作台（SRAM）上炒。

2. **online softmax（流式累加）**：standard softmax 要"先看完整行"才能 normalize，逼你物化整个 N×N 矩阵。online softmax 维护两个数 `(m, l)`——当前最大值 + 当前分母——每读一块 K/V 就更新一次，最后统一除一次。这样**永远不需要把 N×N 写出来**。

3. **recomputation（backward 重算）**：反向传播本来要存 N×N 的 attention 概率矩阵 P。FlashAttention 不存，**backward 时按需重算**——FLOPs 多 30%，但因为整体是 memory-bound，省下 HBM IO 的时间远超过多算的时间。

三件事合起来叫 **IO-aware attention**：算法的瓶颈是 IO 而不是 FLOPs，于是优化 IO 比优化算法更重要。

## 实践案例

### 案例 1：standard attention 的 IO 账

```python
# standard attention：每步都读写 HBM
S = Q @ K.T            # 读 Q,K（O(Nd)）；写 S（O(N²)）
P = softmax(S)         # 读 S（O(N²)）；写 P（O(N²)）
O = P @ V              # 读 P（O(N²)）、V（O(Nd)）；写 O（O(Nd)）
```

总 HBM IO ≈ `4N² + 4Nd`。N=8192、d=64 时 IO ≈ 268M 次。
A100 算力 312 TFLOPs/s 但实际只用了 5%，剩下 95% 时间在等 HBM。

### 案例 2：online softmax 手算

要算 `softmax([1, 3, 2])`，分两块：先看 `[1, 3]`，再看 `[2]`。

```
块 1 = [1, 3]: m₁ = 3, l₁ = e^(1-3) + e^(3-3) = 1.135 + 1 = 2.135
块 2 = [2]:    m_new = max(3, 2) = 3 → 不变
                l_new = l₁ * e^(3-3) + e^(2-3) = 2.135 + 0.368 = 2.503
最终: 输出 = e^(x-3) / 2.503，对 [1,3,2] 算出 [0.090, 0.665, 0.245]
```

**关键**：第二块不需要"重算第一块"——只需要更新 `(m, l)` 两个标量。FlashAttention 把这个手算逻辑写成 CUDA kernel，每读一块 K/V 就更新一次。

### 案例 3：PyTorch SDPA backend 切换

```python
import torch
from torch.nn.attention import SDPBackend, sdpa_kernel

q, k, v = ...  # [batch, heads, seq, dim]

# 强制走 FlashAttention（默认就是它）
with sdpa_kernel(SDPBackend.FLASH_ATTENTION):
    out_flash = F.scaled_dot_product_attention(q, k, v)

# 强制走 math（standard）
with sdpa_kernel(SDPBackend.MATH):
    out_slow = F.scaled_dot_product_attention(q, k, v)

# 数值结果一致；速度差 2-4x，显存差 5-10x
```

## 踩过的坑

1. **block size 不是越大越好**：SRAM 总共就 192KB（A100），block 太大会 spill 回 HBM 反而更慢。head_dim=64 时 block 常用 64-128；head_dim=128 时只能用 64。

2. **backward 多 30% FLOPs**：recomputation 是用算力换显存，前提是你 memory-bound。如果你跑在算力受限的小模型上，FlashAttention 的 backward 反而比 standard 慢——这套账不是无脑赢。

3. **mask 必须在 kernel 内做**：causal mask、sliding window 都得作为 kernel 参数传进去，让 tile 内部跳过。一旦"先算 P 再 mask"，N×N 就被物化了，所有省内存的优势全丢。

4. **softmax 数值稳定**：`m_new = max(m_old, m_block)` 这一步用 fp16/bf16 直接累加可能溢出（exp 会爆 65504）。FlashAttention-2/3 在 m/l 累加上用 fp32，输出再降回 fp16——精度不能省。

## 适用 vs 不适用场景

**适用**：

- 长序列 Transformer 训练 / 推理（seq_len ≥ 1k 收益明显，≥ 4k 是必须）
- 任何 GPU 后端（A100 / H100 / RTX 40 系；FlashAttention-3 专门吃 Hopper 异步）
- standard self-attention、causal attention、sliding window、cross-attention

**不适用**：

- 短序列（seq_len ≤ 128）：tiling overhead 比省下来的 IO 还多，standard 反而快
- 非常稀疏的 attention（block-sparse 大于 90%）：用 block-sparse FlashAttention 或 Longformer 这种专用 kernel
- 想自己改 attention 公式（如 attention with bias、Performer kernel）：得自己写 CUDA / Triton kernel
- 没有 SRAM 的硬件（CPU / 老 GPU / TPU）：TPU 有自己的 MXU/HBM 设计，得用 TPU 专版

## 历史小故事（可跳过）

- **2018 年**：NVIDIA 的 Milakov & Gimelshein 在一份技术报告里给出 **online softmax**——被绝大多数人忽视，因为没人觉得 softmax 慢。
- **2020-2021 年**：Linformer / Performer / Reformer 走"近似 attention"路线，把复杂度从 O(N²) 降到 O(N)。学术热闹但精度妥协，工业界不敢用。
- **2022 年 5 月**：Tri Dao（Stanford 博士生）在 Christopher Ré 实验室换思路——不改算法，改 IO 调度。论文 arXiv 上线，立刻被同时代大模型训练采用。
- **2023 年 7 月**：FlashAttention-2 把 warp 之间分工重排，再省 2x；同年进 PyTorch 2.0 SDPA 默认 backend。
- **2024 年 7 月**：FlashAttention-3 专门为 H100 Hopper 设计，用异步 wgmma + FP8 再翻一倍。Tri Dao 已成为 LLM 系统侧最有名的 PhD。

## 学到什么

1. **算法瓶颈不一定是算法**——attention 的"慢"不在数学，在数据搬运。先用 roofline 模型确认是 compute-bound 还是 memory-bound，再决定优化方向
2. **fuse 是 GPU 优化的第一武器**——把多个 kernel 合一个，省的不是 FLOPs 是 HBM 流量
3. **流式算法（streaming）思路** 不只是数据库才用——online softmax / online mean / online std 都是同一类技巧，只要你能维护"足够的状态"就能边读边算
4. **理论 → 系统 → 标配**：online softmax (2018) → FlashAttention (2022) → PyTorch 默认 (2023) → 全行业标配 (2024+)，4 年走完

## 延伸阅读

- 论文 PDF：[FlashAttention arXiv 2205.14135](https://arxiv.org/abs/2205.14135)（35 页，附录的 IO 复杂度证明值得读）
- 视频精讲：[Tri Dao Stanford MLSys Seminar](https://www.youtube.com/watch?v=gMOAud7hZg4)（作者本人 1 小时讲透）
- 代码仓：[github.com/Dao-AILab/flash-attention](https://github.com/Dao-AILab/flash-attention)（CUDA / Triton 双实现，可直接 pip 装）
- [[attention]] —— FlashAttention 优化的对象，先理解 attention 的数学定义
- [[bert]] —— 论文里第一个 benchmark，BERT-large 训练 +15% 是直接证据

## 关联

- [[attention]] —— FlashAttention 是 attention 的 IO-aware 实现，数学结果完全相同
- [[bert]] —— 第一个用 FlashAttention 跑出 +15% 训练加速的真实模型
- [[gpt-3]] —— GPT-3 之后所有大语言模型训练都依赖 FlashAttention 才扛得住长序列
- [[llama]] —— LLaMA 训练全程 FlashAttention，4k context 才能在合理算力内完成
- [[mamba]] —— Mamba 是"换算法"路线（用 SSM 替代 attention），FlashAttention 是"不换算法"路线，两条路并行
- [[chinchilla]] —— Chinchilla 算的是"多大数据训多大模型"，FlashAttention 算的是"训得起多大 context"，互补

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[3d-gaussian-splatting]] —— 3D Gaussian Splatting — 用一堆 3D 模糊光斑重建场景
- [[anthropic-circuits]] —— Anthropic Circuits — 把 Transformer 当电路逆向
- [[attention]] —— Attention Is All You Need
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[chinchilla]] —— Chinchilla — 训练大模型的数据/参数最优比
- [[colbert-v2]] —— ColBERTv2 — 让向量检索既精又能扛百万文档
- [[cutlass-2020]] —— CUTLASS — 把 SOTA GEMM 拆成可组合的 C++ 模板层级
- [[distserve]] —— DistServe — 把 prefill 和 decode 拆到不同 GPU 上跑
- [[ds-zero-pp-comm]] —— ZeRO++ — 巨型模型训练中的极致高效集合通信
- [[eagle]] —— EAGLE — 让大模型先在"特征层"猜下一步而不是猜 token
- [[fastertransformer-2021]] —— FasterTransformer 2021 — NVIDIA 第一代开源 LLM 推理引擎
- [[fermi-architecture-2010]] —— NVIDIA Fermi — 把 GPU 从游戏卡推上超算
- [[flashattention-2]] —— FlashAttention-2 — 更快的 Attention 与更好的并行
- [[flashattention-3-2024]] —— FlashAttention-3 — Hopper 上的异步 Attention 与 FP8 低精度
- [[gat-2018]] —— GAT — 让图神经网络的邻居自带权重
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[gpu-microbenchmarking-2010]] —— GPU 微基准 — 用秒表把闭源芯片"戳"出真相
- [[http-2]] —— HTTP/2 — 把 HTTP 从文本协议改造成二进制多路复用
- [[liger-kernel-llm-training]] —— Liger Kernel — 面向 LLM 训练的高效 Triton Kernel 套件
- [[lindholm-2008-tesla]] —— Lindholm 2008 Tesla — SM、warp、SIMT 这套词汇的官方出生证明
- [[llama]] —— LLaMA — Meta 开源大语言模型
- [[longformer-2020]] —— Longformer — 滑窗加少数全局 token，把长文档喂进 Transformer
- [[mamba]] —— Mamba — 选择性状态空间模型
- [[medusa-2024]] —— Medusa — 让大模型自己同时猜好几个 token
- [[nerf-2020]] —— NeRF — 用一个 MLP 把整个场景"背"下来
- [[performer-2020]] —— Performer — 用随机特征把 softmax attention 拉成线性复杂度
- [[reformer-2020]] —— Reformer — 用哈希分桶把 attention 从 O(L²) 压到 O(L log L)
- [[rwkv-2023]] —— RWKV — 让 RNN 拿到 Transformer 那张训练并行的入场券
- [[sarathi-serve]] —— Sarathi-Serve — 让长 prompt 不再卡住所有人的流式回复
- [[sglang-radixattention]] —— SGLang — 结构化语言模型程序的高效执行（RadixAttention 零基础笔记）
- [[sparsegpt-2023]] —— SparseGPT — 175B 大模型一次过剪 50%，不重训
- [[specinfer-2023]] —— SpecInfer — 让大模型一次"猜一棵树"再并行验证
- [[tabpfn-2023]] —— TabPFN — 一秒解决小表格分类的 Transformer
- [[tensorrt-llm-overview]] —— TensorRT-LLM — NVIDIA 开源 LLM 推理优化库零基础笔记
- [[tesla-architecture-2008]] —— NVIDIA Tesla — 把显卡改造成通用并行计算机
- [[transformer-xl-2019]] —— Transformer-XL — 让 Transformer 像 RNN 那样把上下文滚动传下去
- [[triton-2019]] —— Triton 2019 — 让 Python 写出贴近 cuBLAS 的 GPU kernel
- [[triton-llm]] —— Triton — 让 Python 程序员也能写出贴近 cuBLAS 的 GPU kernel
- [[vit]] —— ViT — Vision Transformer

