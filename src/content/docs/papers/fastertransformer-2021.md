---
title: FasterTransformer 2021 — NVIDIA 第一代开源 LLM 推理引擎
来源: NVIDIA, "FasterTransformer", GitHub 开源仓库, 2021
日期: 2026-05-31
子分类: GPU 架构
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

FasterTransformer（**FT**）是 NVIDIA 2021 年开源的一套**专门为推理（inference）写得极快的 Transformer C++/CUDA 库**。日常类比：PyTorch 像家用厨房——什么菜都能做，灶具齐全但不专；FT 像快餐连锁的中央厨房——只做几道固定菜（GPT/BERT/T5），但每道菜的火候、刀工、流程都被工程师抠到秒。

你给它一份训练好的 GPT 权重，它替你把"一次前向"跑得**比直接用 PyTorch 快 2~5 倍**，显存占用更小，多卡也能切。

它是 TensorRT-LLM 出现之前，业界做大模型推理时绕不过去的那套基线代码。

## 为什么重要

不理解 FT，下面这些事都说不清：

- 为什么"Transformer 推理"和"训练"要用**两套完全不同的代码**——训练要算反向，推理只前向，且 batch 小、延迟敏感
- 现代 vLLM / TensorRT-LLM / SGLang 这些"花哨的 LLM 引擎"里，**算子层（kernel）大部分思路是 FT 先趟过的**
- 为什么"kernel fusion（算子融合）"是推理优化里反复被提起的词——FT 把它做到极致，给后来者立了标杆
- 2021 年那时还没有 PagedAttention、没有连续批处理（continuous batching），FT 是当时最快的现成选择

## 核心要点

FT 的优化思路可以拆成 **四层**：

1. **算子融合**：把"线性层 + 加 bias + LayerNorm"原本三个 GPU kernel 合成一个。每个 kernel 启动有固定开销（几微秒），合起来减少启动次数 + 减少中间结果写显存。

2. **手写 Fused Multi-Head Attention**：QKV 的 GEMM、softmax、和 V 的乘法**写成一个大 kernel**，中间结果留在寄存器/共享内存，不落显存。这就是后来 FlashAttention 把它发扬光大的方向。

3. **KV cache 直接管理**：自回归生成时每步只产生 1 个 token，但前面所有 token 的 K/V 要复用。FT 用 C++ 显式开一块连续显存当 cache，每步追加，不重算。

4. **多卡切分（Tensor / Pipeline 并行）**：跟着 Megatron-LM 的切法——把注意力头按列切到多卡、FFN 按行切，靠 NCCL 做 all-reduce 同步。这套做法直接成了行业标准。

## 实践案例

### 案例 1：算子融合到底省了什么

PyTorch 里写一层 Transformer 的 FFN：

```python
x = linear1(x)        # kernel 1
x = x + bias1         # kernel 2
x = gelu(x)           # kernel 3
x = linear2(x)        # kernel 4
x = x + bias2         # kernel 5
```

5 次 kernel 启动 + 4 次中间结果写显存又读出来。FT 把它合成 **2 次**：

```
fused_gemm_bias_gelu(x)   // kernel 1: linear1 + bias1 + gelu
fused_gemm_bias(x)        // kernel 2: linear2 + bias2
```

省了 3 次启动开销 + 3 次显存来回。在小 batch 推理时，这种省下来的开销能占总时间 30% 以上。

### 案例 2：KV cache 是怎么"复用"的

GPT 生成第 100 个 token 时，前 99 个 token 的 K、V 矩阵理论上不会变。FT 的做法：

```
cache_k: [layer, max_seq_len, n_head, head_dim]   // 预分配大块
cache_v: [layer, max_seq_len, n_head, head_dim]
```

每生成一个新 token，把它的 K/V **追加到 cache 第 100 行**，注意力只对前 100 行算。比"每步重算 99 次"快了一个数量级。

但这块预分配是固定大小——序列变长就 OOM；序列短就浪费——这正是后来 PagedAttention 要解决的痛点。

### 案例 3：Tensor 并行的切法

把一个 175B 模型放到 8 张 A100 上跑。FT 跟着 Megatron 切：

- 注意力的 Q/K/V 投影矩阵**按 head 维度列切**——每张卡负责一部分 head
- FFN 的第一个矩阵**按列切**、第二个**按行切**——保证只在 FFN 出口做一次 all-reduce
- 整个 forward 每层只需要 **2 次 all-reduce**，通信量被压到最小

这个"按维度切 + 一次 all-reduce"的拼法，今天的 vLLM / TensorRT-LLM / SGLang 都还在用。

## 踩过的坑

1. **预分配 KV cache 浪费严重**：序列长度差异大的请求挤一起，短请求占着长 cache 的位置。这个浪费率能到 60% 以上——vLLM 用 PagedAttention 解决了，但代价是引入分页机制的复杂度。

2. **静态 batch 不友好**：FT 时代还是"凑齐一批 → 一起跑 → 都跑完才放"。一个 100 token 的请求要等同 batch 里 1000 token 的那个跑完。Orca 提出的连续批处理把这个砍掉了。

3. **C++ 改起来痛苦**：FT 是纯 C++/CUDA 写的，加新模型要写 kernel、调 cuBLAS heuristic、对齐内存布局。一个新模型从 0 接进来通常要 2~4 周。这是后来很多团队转向 vLLM（Python + 少量 CUDA）的原因之一。

4. **量化路径割裂**：INT8、FP16、BF16、FP8 各走各的 kernel 实现，复用度低。代码库膨胀成几万行，新人上手陡。

5. **cuBLAS heuristic 不稳**：FT 调用 cuBLAS 时要选合适的 GEMM 算法。同一个矩阵尺寸，A100 上选的最优算法到 H100 上可能慢一倍。FT 内置一个 `gemm_test` 工具，每换一次硬件就要重跑一次基准选号——不跑就只能拿默认实现，性能折损 10~30%。

## 适用 vs 不适用场景

**适用**：

- 想理解"现代 LLM 推理引擎到底在 GPU 上做了什么"——FT 是最干净的工业级参考实现
- 模型架构稳定（标准 GPT/BERT/T5）、batch size 固定、追求低延迟的生产环境
- 学习 CUDA kernel 编写和算子融合套路

**不适用**：

- 长序列、高并发、请求长度差异大的场景 → 用 vLLM（PagedAttention + 连续批处理）
- 模型架构常改、要快速迭代 → 用 PyTorch + torch.compile
- 想用最新模型（Llama-3、Mixtral、DeepSeek-V3 等）→ FT 已被 NVIDIA 自己用 TensorRT-LLM 替代

## 历史小故事（可跳过）

- **2018**：BERT 火起来，Transformer 推理的需求第一次大规模出现。NVIDIA 内部开始攒优化 kernel。
- **2019**：FasterTransformer 1.0 在 GitHub 开源，只支持 BERT encoder，主打 FP16 + 算子融合。
- **2021**：FT 4.0 加入 GPT 解码、KV cache、tensor 并行——这是它真正成为"LLM 推理事实标准"的版本，也是这篇笔记对应的时间点。
- **2022**：FT 5.0 加 INT8、pipeline 并行；同年 Orca 论文提出连续批处理，开始挑战 FT 的静态 batch 模型。
- **2023**：NVIDIA 推出 TensorRT-LLM，把 FT 的 kernel + TensorRT 的图优化合并；同年 vLLM 论文发表，PagedAttention 开始普及。
- **2024 之后**：FasterTransformer 仓库进入"维护模式"，新功能全在 TensorRT-LLM 里。但 FT 留下的 kernel 思路（融合、KV cache 布局、tensor 并行切法）成了所有后继者的地基。

## 学到什么

1. **训练框架和推理引擎是两种生物**——训练要灵活、要反向；推理要极致快、要稳。FT 让我第一次看清这条分界。
2. **算子融合不是玄学，是数学**——每多一个 kernel 启动就是几微秒的固定税，融合就是把税合并交。
3. **KV cache 的取舍最深**——预分配快但浪费；分页省但复杂。每个推理引擎都在这条线上选位置。
4. **Tensor 并行的切法是几篇论文 + 工程踩坑攒出来的**——不是凭空设计，是"试出来通信量最少的拼法"。
5. **第一代工业引擎的价值不在最优**——而在"立标杆"。FT 不是最快的（今天看），但它先把"算子层 + 多卡切 + KV 管理"这三件事一起做对了，后来者全在它的肩膀上走。
6. **C++ 写推理是个时代选择**——2021 年 PyTorch 的 JIT 还不够强，Triton 还没普及，写 CUDA + C++ 是当时唯一能榨干 GPU 的路径。今天有了 torch.compile / Triton / CUDA Graph，新引擎才敢用 Python 当主体。

## 延伸阅读

- 仓库本体：[NVIDIA/FasterTransformer](https://github.com/NVIDIA/FasterTransformer)（核心代码 + GPT/BERT/T5 三套示例）
- GPT 接入指南：[gpt_guide.md](https://github.com/NVIDIA/FasterTransformer/blob/main/docs/gpt_guide.md)（最直接的"算子结构图 + 多卡切法"参考）
- NVIDIA 博客：[Accelerated Inference for Large Transformer Models](https://developer.nvidia.com/blog/accelerated-inference-for-large-transformer-models-using-nvidia-fastertransformer-and-triton-inference-server/)（含基准对比，2022）
- 替代方案：[TensorRT-LLM](https://github.com/NVIDIA/TensorRT-LLM)（FT 的官方继承者）
- [[vllm]] —— 用 PagedAttention + 连续批处理冲掉 FT 静态 batch 痛点
- [[orca-2022]] —— 第一次系统提出连续批处理的论文
- [[flash-attention]] —— 把 FT 手写 fused attention 思路推广到训练侧
- [[attention]] —— 注意力机制本身

## 关联

- [[attention]] —— FT 优化的对象就是注意力 + FFN 这两块
- [[flash-attention]] —— 把"中间结果不落显存"的思路从推理推到训练
- [[orca-2022]] —— 连续批处理冲击 FT 的静态 batch 模型
- [[vllm]] —— PagedAttention 解决 FT 预分配 KV cache 的浪费
- [[ampere-architecture-2020]] —— FT 当年主打的硬件平台（A100）
- [[cuda-streams-concurrency-2018]] —— FT 多 kernel 调度依赖的 CUDA 基础抽象

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[cuda-streams-concurrency-2018]] —— CUDA Streams 并发量化研究 — 为什么 SM 利用率拉不满
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[graphormer-2021]] —— Graphormer — 标准 Transformer 直接刷爆 GNN
- [[llm-int8-2022]] —— LLM.int8() — 大模型激活值里藏着几个超大异常通道
- [[lstm-1997]] —— LSTM — 用门控让神经网络记得住上一段话
- [[orca-2022]] —— Orca — Transformer 生成模型的分布式推理调度
- [[seq2seq-2014]] —— Seq2Seq — 把翻译变成端到端神经网络
- [[tensorrt-llm-2023]] —— TensorRT-LLM — NVIDIA 把 FT 升级成可调度的官方推理栈
- [[transformer-xl-2019]] —— Transformer-XL — 让 Transformer 像 RNN 那样把上下文滚动传下去
- [[vllm]] —— vLLM — 高吞吐 LLM 推理引擎

