---
title: Triton 2019 — 让 Python 写出贴近 cuBLAS 的 GPU kernel
来源: 'Philippe Tillet, H.T. Kung, David Cox, "Triton: An Intermediate Language and Compiler for Tiled Neural Network Computations", MAPL 2019'
日期: 2026-05-31
子分类: GPU 架构
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

Triton 是一种**让你只描述「对一小块数据做什么」、剩下排兵布阵交给编译器**的 GPU kernel 写法。日常类比：盖楼以前要自己一砖一瓦地砌；Triton 给你一个「整面墙」当基本零件，砖怎么码、灰浆怎么调，由施工队自动安排。

你写：

```python
@triton.jit
def add_kernel(x_ptr, y_ptr, out_ptr, n, BLOCK: tl.constexpr):
    pid = tl.program_id(0)
    offs = pid * BLOCK + tl.arange(0, BLOCK)
    mask = offs < n
    x = tl.load(x_ptr + offs, mask=mask)
    y = tl.load(y_ptr + offs, mask=mask)
    tl.store(out_ptr + offs, x + y, mask=mask)
```

整段没有 `threadIdx.x`、没有 shared memory、没有合并访存的人工调度——这些**全部由 Triton 编译器自动生成**。论文核心论点就是：把「tile（瓦片）」当成一等公民，性能能逼近手写 CUDA，但代码量约为 1/10。

## 为什么重要

不理解 Triton，下面这些事都没法解释：

- 为什么 FlashAttention 用几百行 Python 就跑赢 cuDNN——它就是 Triton 写的
- 为什么 PyTorch 2.0 的 Inductor 选 Triton 当默认 GPU 后端，不再自己生成 CUDA
- 为什么 vLLM / Unsloth / SGLang 这些 LLM infra 项目敢说「自己写 fused kernel」
- 为什么 2019 年的一篇 6 页 workshop 论文，6 年后成了写 LLM 算子的事实标准

## 核心要点

Triton 把写 GPU kernel 的认知负担拆成两层，**只让你管上面那层**：

1. **tile 是基本单元**：你操作的不是一个标量，也不是单个 thread，而是一个固定大小的小矩阵块（如 `[128, 64]`）。类比：你下单买的是「一打鸡蛋」，不是单个鸡蛋——超市内部怎么装箱不归你管。

2. **编译器三段 IR 自动 lower**：源码 → Triton-IR（与 LLVM 类似但 tile 是值）→ Triton-GPU IR（决定 tile 怎么切到 thread 和 shared memory）→ LLVM IR → PTX。每一段都把更细的硬件细节包起来。

3. **Autotuner 替你试 tile size**：同一个 kernel 在不同 GPU、不同输入形状下最佳 BLOCK_SIZE 不同。Triton 用 `@triton.autotune` 装饰器在运行时跑几组配置选最快的，写代码的人不用懂寄存器溢出和 occupancy。

三件加起来：**程序员的世界缩到「tile 进、tile 出」**，硬件的复杂度由编译器吃掉。

## 实践案例

### 案例 1：向量加法 kernel（最小例）

```python
import triton, triton.language as tl
@triton.jit
def add_k(x, y, z, n, BLOCK: tl.constexpr):
    pid = tl.program_id(0)
    offs = pid * BLOCK + tl.arange(0, BLOCK)
    m = offs < n
    tl.store(z + offs, tl.load(x + offs, m) + tl.load(y + offs, m), m)
```

**逐部分**：`program_id(0)` 是当前 tile 在网格中的编号；`tl.arange(0, BLOCK)` 生成 `[0..BLOCK)` 这个向量；`mask` 处理「最后一块不满 BLOCK」的边界。整段没写一行 thread 调度，但生成的 PTX 已经做好了合并访存。

### 案例 2：fused softmax，对照 PyTorch

PyTorch 写 softmax 通常是 3 个 kernel：减最大值、`exp`、除和。Triton 一个 kernel 把三步揉在一起：

```python
@triton.jit
def softmax_k(in_ptr, out_ptr, n_cols, BLOCK: tl.constexpr):
    row = tl.program_id(0)
    cols = tl.arange(0, BLOCK)
    m = cols < n_cols
    x = tl.load(in_ptr + row * n_cols + cols, mask=m, other=-float("inf"))
    e = tl.exp(x - tl.max(x, axis=0))
    tl.store(out_ptr + row * n_cols + cols, e / tl.sum(e, axis=0), mask=m)
```

省去 2 次 kernel launch + 2 次写回 HBM，长序列下能快 2-4×。这就是「fuse」——Triton 让 fuse 从 CUDA 里的高级技巧变成新人也能写的东西。

### 案例 3：FlashAttention 的 Triton 化

FlashAttention 的关键是把 attention 切成 tile，循环里 online 累加 softmax 的 max 和 sum。

这个算法用 CUDA 写要管 shared memory 双缓冲、register 切片、warp 同步——OpenAI Triton 的官方实现只有约 200 行 Python。

tile 抽象让 IO-aware 算法第一次「看起来像伪代码」，可读性接近教材。这也是论文 2019 年没料到的下游影响。

## 踩过的坑

1. **tile size 没选好性能差 5-10×**：新手照搬别人的 `BLOCK_SIZE=128`，到自己问题上可能寄存器溢出。必须用 `@triton.autotune` 把 32/64/128/256 都列进搜索空间。

2. **Triton 不替代 CUDA**：它擅长 dense tile（GEMM、attention、layernorm）；稀疏图、不规则散列、warp-level 原语调度还是要原生 CUDA。

3. **shared memory / register 上限不会被屏蔽**：tile 太大照样 `CUDA_ERROR_ILLEGAL_ADDRESS`，编译器只是少帮你写代码，不是无中生有给你硬件。占用和溢出仍要看 `ptxas -v` 的输出心里有数。

4. **2019 论文 ≠ 今天的 Triton**：MAPL 那版语法和现在 OpenAI 维护的开源版差距很大，看老论文学 API 必踩雷，要对着 GitHub 最新 examples 写。论文当模型论参考，API 当历史看。

## 适用 vs 不适用场景

**适用**：

- 训练 / 推理里要 fuse 的算子（softmax、layernorm、rope、masked attention）
- 形状规则的 dense 计算：GEMM、卷积、element-wise + reduction 组合
- 需要在多种 GPU（V100 / A100 / H100）自动选 tile size 的算子库

**不适用**：

- 稀疏 / 动态 shape / 图遍历类负载 → 用 cuSPARSE / 手写 CUDA
- 需要 cooperative groups、tensor memory accelerator 这些最新硬件原语 → 还得 CUDA / [[mlir]]
- CPU / Metal 后端：Triton 主战场是 NVIDIA GPU；MLX 等才是 Apple Silicon 的选项

## 历史小故事（可跳过）

- **2019 年**：Tillet 在 Harvard 博士论文里提出 Triton，发表在 MAPL workshop，那时主要用户就是他自己。
- **2020 年**：OpenAI 把 Triton 项目接过去开源，加了 PyTorch 集成。
- **2022 年**：Tri Dao 用 Triton 重写 FlashAttention，证明它能产出 SOTA 算子，社区开始爆发。
- **2023 年**：PyTorch 2.0 Inductor 选 Triton 当 GPU 默认后端，从此 `torch.compile` 背后跑的就是 Triton。
- **2024-2025 年**：vLLM / SGLang / Unsloth 把核心算子全迁到 Triton，LLM infra 圈出现「不会 Triton 不好意思说自己写 kernel」的氛围。

## 学到什么

1. **抽象层选对，性能和易用性可以同时拿到**——tile 这个粒度刚好兜住 dense 算子的本质，又遮掉了 thread 调度
2. **DSL 不必造新语言**：Triton 寄生在 Python 里，只是 JIT 装饰器 + 一个 `tl` 命名空间，门槛低到能让算法工程师自己写
3. **autotune 是工程化关键**：没有它，tile size 这种参数会让 DSL 的承诺（可移植）破功
4. **学术工件 → 工业标准**通常要 4-6 年和一两个杀手 app（这里是 FlashAttention + PyTorch 2.0）
5. **粒度匹配硬件粒度才赢**：CUDA 的 thread 与现代 GPU SIMT 单元（warp = 32 thread）已不再天然契合，tile 反而更贴 tensor core 的输入形状

## 延伸阅读

- 官方文档与 tutorials：[triton-lang.org](https://triton-lang.org/main/getting-started/tutorials/index.html)（前 5 个 tutorial 走完就能上手）
- 论文 PDF：[Tillet et al., MAPL 2019](https://www.eecs.harvard.edu/~htk/publication/2019-mapl-tillet-kung-cox.pdf)（6 页，密度高）
- 视频：[Tri Dao — How to write a fast attention kernel](https://www.youtube.com/results?search_query=tri+dao+flash+attention+triton)（讲 tile 化思路）
- [[flash-attention]] —— Triton 最有名的下游用户
- [[xla-compiler]] —— 对照组：另一种 GPU codegen 路径
- [[halide]] —— Triton 的精神前辈：把「算什么」与「怎么算」分离

## 关联

- [[halide]] —— 同样把 schedule 与算法分开，但 Halide 更偏 CPU/图像，Triton 更偏 GPU/dense
- [[tvm]] —— 另一种 tensor compiler 思路，搜索空间更大但语法更重
- [[mlir]] —— Triton-GPU IR 后来迁到 MLIR 上做 lower pass
- [[llvm]] —— Triton 最终落地的后端，PTX 由 LLVM NVPTX 生成
- [[ssa]] —— Triton-IR 是 SSA 形式，与 LLVM IR 同源
- [[flash-attention]] —— 用 Triton 写出来的经典 IO-aware 算子
- [[vllm]] —— 大量自定义算子是 Triton kernel

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cutlass-2020]] —— CUTLASS — 把 SOTA GEMM 拆成可组合的 C++ 模板层级
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[halide]] —— Halide — 把"算什么"和"怎么算"分开写
- [[llvm]] —— LLVM — 模块化编译器框架
- [[mlir]] —— MLIR — 给编译器一套乐高，每层抽象都能搭自己的方言
- [[ssa]] —— SSA — 静态单赋值形式
- [[triton-inference-server]] —— Triton Inference Server — NVIDIA 多框架推理服务化标杆
- [[tvm]] —— TVM — 让一份模型能在所有硬件上跑得快
- [[vllm]] —— vLLM — 高吞吐 LLM 推理引擎
- [[xla-compiler]] —— XLA — 给 TensorFlow / JAX 装一台真正的张量编译器

