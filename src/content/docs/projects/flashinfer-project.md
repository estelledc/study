---
title: FlashInfer — LLM 推理的 GPU 内核引擎
来源: https://github.com/flashinfer-ai/flashinfer
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

# FlashInfer — LLM 推理的 GPU 内核引擎

## 日常类比

想象一下，你是一家大图书馆的管理员。LLM（大语言模型）每次回答你的问题，都需要翻遍整个图书馆——从几万本书里找出"最相关"的内容，然后再组织语言回答。这个过程叫**注意力机制（Attention）**。

如果每次翻书都得走一趟图书馆，效率会很低。FlashInfer 做的事情，就是：
1. 把最常查的书放到手边的速查桌上（KV-Cache）
2. 用多线程同时翻书（GPU 并行）
3. 提前把书整理好分类（内核优化）

这样，LLM 回答的速度就能大幅提升。

**FlashInfer** 就是一个专门为 LLM 推理服务设计的 GPU 内核库。它给 PyTorch 提供了一个"加速工具箱"，让你在部署大语言模型时，推理速度更快、内存使用更低。

## 核心概念

### 1. 注意力机制的两种阶段

LLM 推理有两个完全不同的阶段，FlashInfer 为每个阶段都做了专门优化：

| 阶段 | 做什么 | 类比 |
|------|--------|------|
| **Prefill（预填充）** | 一次性处理用户输入的所有 token | 把一整本书放到速查桌上 |
| **Decode（解码）** | 一次只生成一个 token | 每次只翻一页写回答 |

这两个阶段的工作方式完全不同——prefill 是批量处理，decode 是串行生成。FlashInfer 分别用 `single_prefill_with_kv_cache` 和 `single_decode_with_kv_cache` 来优化。

### 2. KV-Cache（键值缓存）

Attention 计算中，Key 和 Value 矩阵会随着生成的 token 越来越多而变大。如果每次都重新计算，内存和计算量都会爆炸。

KV-Cache 就是把已经算过的 Key 和 Value 存起来，下次生成新 token 时直接复用，不用再翻"整本图书馆"了。

### 3. 多后端自动选择

FlashInfer 不是自己发明了一套算法，而是把多种后端集成在一起：

- **FlashAttention-2/3** — 学术界最经典的注意力优化
- **cuDNN** — NVIDIA 官方库
- **CUTLASS** — NVIDIA 矩阵乘法库
- **TensorRT-LLM** — NVIDIA 推理引擎

FlashInfer 会根据你的 GPU 型号和当前任务，自动选择最快的后端。

### 4. 支持的低精度计算

为了更快，FlashInfer 支持：

- **BF16** — 基础精度，兼容性好
- **FP8** — 更低精度，更快计算
- **FP4** — Blackwell 架构 GPU 专用，极致压缩

## 代码示例

### 示例一：最简入门 — 单请求 Decode

这是 FlashInfer 最基础的用法：给一个查询向量（query），给它一堆已缓存的键值对（key/value），返回注意力输出。

```python
import torch
import flashinfer

# 1. 准备数据：假设用 128 维的 embedding，16 个查询头
q = torch.randn(32, 128, device="cuda", dtype=torch.float16)  # [num_qo_heads, head_dim]

# 2. KV-Cache 里已经存了 2048 个 token 的 Key 和 Value
k = torch.randn(2048, 32, 128, device="cuda", dtype=torch.float16)  # [kv_len, num_kv_heads, head_dim]
v = torch.randn(2048, 32, 128, device="cuda", dtype=torch.float16)

# 3. 一行代码调用 FlashInfer 的 decode 内核
output = flashinfer.single_decode_with_kv_cache(q, k, v)

print(output.shape)  # torch.Size([32, 128])
```

对比原生 PyTorch 实现：

```python
# 原生 PyTorch — 需要手动实现 Attention
attn_weights = torch.einsum("hd,lhd->hl", q, k) / (128 ** 0.5)
attn_probs = torch.softmax(attn_weights, dim=-1)
output_torch = torch.einsum("hl,lhd->hd", attn_probs, v)
```

FlashInfer 的底层是用 CUDA 写的，避免了 Python 循环和内存复制，速度通常快 2-10 倍。

### 示例二：使用 Wrapper 管理批量推理

实际生产中，会有多个用户同时请求 LLM。FlashInfer 提供了 Wrapper 类来管理批量请求：

```python
import torch
import flashinfer

# 1. 创建 decode wrapper
batch_size = 4  # 4 个并发请求
head_dim = 128
num_kv_heads = 8
max_total_seq_len = 4096

decode_wrapper = flashinfer.decode.BatchDecodeWithKVCacheWrapper()

# 2. 初始化——告诉它总容量和注意力类型
decode_wrapper.begin_forward(
    kv_lens=[512, 1024, 256, 768],       # 每个请求已有的 token 数
    kv_layout=flashinfer.KvLayout.NHDC,  # 键值对内存布局
    num_qo_heads=32,
    num_kv_heads=num_kv_heads,
    head_dim=head_dim,
    pos_encoding_mode="NONE",
    rope_scale=1.0,
    rope_theta=10000.0,
)

# 3. 准备当前请求的 query 和共享的 KV-Cache
q = torch.randn(sum([1, 1, 1, 1]), 32, head_dim, device="cuda", dtype=torch.float16)
k = torch.randn(max_total_seq_len, num_kv_heads, head_dim, device="cuda", dtype=torch.float16)
v = torch.randn(max_total_seq_len, num_kv_heads, head_dim, device="cuda", dtype=torch.float16)

# 4. 批量计算注意力
output = decode_wrapper(q, k, v)
decode_wrapper.end_forward()

print(output.shape)  # torch.Size([4, 32, 128])
```

## FlashInfer 的主要功能模块

除了 Attention，FlashInfer 还提供了：

- **GEMM** — 优化的矩阵乘法（BF16/FP8/FP4）
- **MoE（混合专家）** — Fused MoE 内核，支持 DeepSeek-V3、Llama-4 等模型
- **采样（Sampling）** — Top-K、Top-P、Min-P 采样，不需要排序操作
- **RoPE** — 旋转位置编码（LLaMA 系列模型使用）
- **归一化（Norm）** — RMSNorm、LayerNorm 等
- **激活函数** — SiLU、GELU 等

## 支持的 GPU 架构

| 架构 | 计算能力 | 代表 GPU |
|------|----------|----------|
| Turing | SM 7.5 | T4, RTX 20 系列 |
| Ampere | SM 8.0/8.6 | A100, A10, RTX 30 系列 |
| Ada | SM 8.9 | L4, L40, RTX 40 系列 |
| Hopper | SM 9.0 | H100, H200 |
| Blackwell | SM 10.0/10.3/11.0 | B200, B300, Jetson Thor |

## 在实际项目中的位置

FlashInfer 不是独立的推理框架，而是作为"引擎部件"被集成到更大的系统中：

- **vLLM** — 用 FlashInfer 做注意力加速
- **SGLang** — 同样集成 FlashInfer 内核
- **TensorRT-LLM** — NVIDIA 官方推理引擎
- **TGI** — HuggingFace 的文本生成推理服务

## 学习建议

从零基础出发，理解 FlashInfer 的建议路径：

1. 先理解 Transformer 的基本架构和 Attention 机制
2. 理解 LLM 推理中 Prefill 和 Decode 两个阶段的区别
3. 理解 KV-Cache 是什么、为什么要缓存
4. 安装 FlashInfer 后，从 `single_decode_with_kv_cache` 这个小函数入手跑通
5. 再深入了解 Wrapper 类和批量推理

## 进一步阅读

- FlashInfer 文档：https://docs.flashinfer.ai/
- 论文：FlashInfer: Efficient and Customizable Attention Engine for LLM Inference Serving (arXiv:2501.01005)
- KV-Cache Layout 教程：https://docs.flashinfer.ai/tutorials/kv_layout.html
