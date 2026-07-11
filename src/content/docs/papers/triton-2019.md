---
title: Triton 2019 — 让 Python 写出贴近 cuBLAS 的 GPU kernel
来源: 'Philippe Tillet, H.T. Kung, David Cox, "Triton: An Intermediate Language and Compiler for Tiled Neural Network Computations", MAPL 2019'
日期: 2026-05-31
分类: 编译器与编程语言
难度: 中级
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

整段没有 `threadIdx.x`、没有 shared memory、没有合并访存的人工调度——这些**全部由 Triton 编译器自动生成**。论文主张：把「tile（瓦片）」当成一等公民，在其 GEMM 等 benchmark 上性能可逼近手写 CUDA，代码量约为手写的 1/10。

## 为什么重要

不理解 Triton，下面这些事都没法解释：

- 为什么后来的 FlashAttention Triton 教程/参考实现能用几百行 Python 逼近手写 CUDA——tile 抽象让 IO-aware 算法好写
- 为什么 PyTorch 2.0 的 Inductor（把 `torch.compile` 编成 GPU 代码的那层）默认选 Triton，不再自己吐 CUDA
- 为什么 vLLM / Unsloth / SGLang 这些 LLM 推理加速项目敢说「自己写 fused kernel」（把多步算子揉成一次启动）
- 为什么 2019 年一篇 6 页 workshop 论文，几年后成了写 LLM 算子的事实标准

## 核心要点

Triton 把写 GPU kernel 的认知负担拆成两层，**只让你管上面那层**：

1. **tile 是基本单元**：你操作的不是一个标量，也不是单个 thread，而是一个固定大小的小矩阵块（如 `[128, 64]`）。类比：你下单买的是「一打鸡蛋」，不是单个鸡蛋——超市内部怎么装箱不归你管。

2. **编译器三段 IR 自动 lower**：源码 → Triton-IR（tile 当值）→ Triton-GPU IR（切到 thread / shared memory）→ LLVM IR → PTX（GPU 能执行的汇编）。每段把更细的硬件细节包起来。

3. **Autotuner 替你试 tile size**：同一 kernel 在不同 GPU、不同形状下最佳 `BLOCK_SIZE` 不同。`@triton.autotune` 运行时试几组配置选最快的——你不用自己算「寄存器会不会装不下」（溢出）或「能同时跑多少个 warp」（occupancy）。

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
# 启动：grid = (ceil(n / BLOCK),)；add_k[grid](x, y, z, n, BLOCK=1024)
```

**逐部分**：`program_id(0)` 是当前 tile 编号；`tl.arange` 生成 `[0..BLOCK)`；`mask` 处理末块不满。没写 thread 调度，编译器已做好合并访存。

### 案例 2：fused softmax，对照 PyTorch

PyTorch 写 softmax 常是 3 个 kernel：减最大值、`exp`、除和。Triton 一个 kernel 揉在一起：

```python
@triton.jit
def softmax_k(in_ptr, out_ptr, n_cols, BLOCK: tl.constexpr):
    row = tl.program_id(0)
    cols = tl.arange(0, BLOCK)
    m = cols < n_cols
    x = tl.load(in_ptr + row * n_cols + cols, mask=m, other=-float("inf"))
    e = tl.exp(x - tl.max(x, axis=0))
    tl.store(out_ptr + row * n_cols + cols, e / tl.sum(e, axis=0), mask=m)
# 启动：softmax_k[(n_rows,)](inp, out, n_cols, BLOCK=next_pow2(n_cols))
```

省去 2 次 launch + 2 次写回 HBM（显存大仓库，进出贵）。长序列常快 2-4×——fuse 从 CUDA 高级技巧变成可写的东西。

### 案例 3：FlashAttention 式 tile 循环（伪代码）

原版 FlashAttention（2022）主实现是 CUDA；后来的 Triton 教程/参考实现把同一思路写成 Python。关键两步：

```python
# 伪代码：按 K/V 的 tile 循环，online 更新 softmax 的 max/sum
m_i, l_i, acc = -inf, 0, 0
for start in range(0, seq_len, BLOCK):
    k_tile = load_K(start, BLOCK)          # 只搬一块进快缓存
    qk = tl.dot(q_tile, k_tile)            # 本块分数
    m_new = max(m_i, max(qk))              # ① 更新全局 max
    l_i = l_i * exp(m_i - m_new) + sum(exp(qk - m_new))
    acc = acc * exp(m_i - m_new) + exp(qk - m_new) @ v_tile
    m_i = m_new                            # ② 累加分子
out = acc / l_i
```

**逐部分**：① 不一次装整行 attention；② 边扫边改缩放，避免二次遍历。CUDA 要管双缓冲与 warp 同步；Triton 版可读性接近教材——这是 2019 论文没料到的下游影响。

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

- **2019 年**：Tillet 等在 MAPL workshop 发表 Triton 论文，当时用户很少。
- **2021 年 7 月**：OpenAI 开源 Triton，并推进与 PyTorch 的集成。
- **2022–2023 年**：FlashAttention 原版以 CUDA 证明 IO-aware 路线；随后 Triton 教程/参考实现让同一思路更易复现，社区爆发。
- **2023 年**：PyTorch 2.0 Inductor 选 Triton 当 GPU 默认后端，`torch.compile` 背后常跑 Triton。
- **2024–2025 年**：vLLM / SGLang / Unsloth 大量核心算子迁到 Triton，LLM infra 圈把「会写 Triton」当成写 fused kernel 的标配技能。

## 学到什么

1. **抽象层选对，性能和易用性可以同时拿到**——tile 刚好兜住 dense 算子，又遮掉 thread 调度
2. **DSL 不必造新语言**：寄生在 Python 里（JIT + `tl`），算法工程师也能写
3. **autotune 是工程化关键**：没有它，tile size 会让「可移植」承诺破功
4. **学术工件 → 工业标准**常要数年 + 杀手应用（这里是 attention 算子生态 + PyTorch 2.0）
5. **粒度要贴硬件**：CUDA thread 与 warp（32 线程一捆的 SIMT 执行）已不天然契合；tile 更贴 tensor core 输入块

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
- [[flash-attention]] —— IO-aware attention；原版 CUDA，后有 Triton 参考实现
- [[vllm]] —— 大量自定义算子是 Triton kernel

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bentoml]] —— BentoML — 模型打包部署
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

