---
title: Triton — 让 Python 程序员也能写出贴近 cuBLAS 的 GPU kernel
来源: 'Philippe Tillet, H.T. Kung, David Cox, "Triton: An Intermediate Language and Compiler for Tiled Neural Network Computations", MAPL 2019'
日期: 2026-05-30
分类: 编译器与编程语言
难度: 中级
---

## 是什么

Triton 是一种 **GPU kernel 的领域专用语言（DSL）**，加上一个把它编译成 NVIDIA PTX 的编译器。日常类比：CUDA 让你**一粒一粒沙子地铺地面**（每条 thread 都得你亲自指挥），Triton 让你**一块砖一块砖地铺**——你描述对"一块砖"的运算，机器自己决定砖里那些沙子怎么摆。

这块"砖"在 Triton 里叫 **tile**（瓦片），通常是 64×64 或 128×128 的小密集矩阵。你写：

```python
@triton.jit
def add_kernel(x_ptr, y_ptr, out_ptr, n, BLOCK: tl.constexpr):
    pid = tl.program_id(0)
    offs = pid * BLOCK + tl.arange(0, BLOCK)
    x = tl.load(x_ptr + offs, mask=offs < n)
    y = tl.load(y_ptr + offs, mask=offs < n)
    tl.store(out_ptr + offs, x + y, mask=offs < n)
```

完全没出现 `threadIdx.x` / `__shared__` / 向量化 intrinsic。Triton 编译器自动决定 thread 怎么分、共享内存怎么用、怎么 coalesce 访问。

## 为什么重要

不理解 Triton，下面这些事都讲不清：

- 为什么 FlashAttention、vLLM 的 PagedAttention、PyTorch 2.0 Inductor **生成的 GPU 算子全是 Triton**——它已是事实标准
- 为什么写一个新算子的工程师**不再先学 CUDA**，而是先学 Triton（CUDA 留给真正需要稀疏 / 异构访问的人）
- 为什么同一个 kernel 在不同 GPU 上**重新 autotune 一下就能跑满**，不用手改 block size
- 为什么 OpenAI / NVIDIA / Meta **都在 Triton 上下注**

## 核心要点

Triton 的设计可拆成 **三个支柱**：

1. **tile 是一等公民**：变量本身就是 N 维 dense 数组（"砖"），不是单个 scalar。`a + b` 自动变成"两块砖逐元素相加"。类比：从"指挥每个士兵"升级到"指挥每个班"。

2. **三层 IR 渐进 lowering**：Triton-IR（程序员看到的级别，tile 是值）→ Triton-GPU IR（带 layout、warp 信息）→ LLVM IR → PTX。每层只解决一个问题，层与层之间有清晰的"砸到更低抽象"的 pass，思路上像 LLVM / [[mlir]]。

3. **autotune 搜超参**：tile size、num warps、num stages 这些"性能但不影响正确性"的参数，用户给一组候选，运行时自动 benchmark 选最好的。类比：你给厨师"火力档位 1-5"的选项，他自己试出哪档最快。

三件事加起来：用户写**正确性**，编译器和 autotune 负责**性能**。

## 实践案例

### 案例 1：向量加法——感受 program_id / tl.load / tl.store

```python
import triton, triton.language as tl
@triton.jit
def add(x_ptr, y_ptr, out_ptr, n, BLOCK: tl.constexpr):
    pid = tl.program_id(0)
    offs = pid * BLOCK + tl.arange(0, BLOCK)
    mask = offs < n
    tl.store(out_ptr + offs, tl.load(x_ptr+offs, mask=mask) + tl.load(y_ptr+offs, mask=mask), mask=mask)
```

`program_id(0)` 给当前 program（≈一个 thread block）一个编号；`tl.arange(0, BLOCK)` 生成 0…BLOCK-1 的 tile；`mask` 处理边界。CUDA 等价代码要 30 行。

### 案例 2：fused softmax——一次 kernel 顶 PyTorch 三次

PyTorch 写 softmax 通常 launch 三个 kernel：求 max → 求 exp 求和 → 除。每次 launch 都要从 HBM 读一遍输入。Triton 一次性写完：

```python
@triton.jit
def softmax(in_ptr, out_ptr, stride, N, BLOCK: tl.constexpr):
    row = tl.program_id(0); cols = tl.arange(0, BLOCK)
    x = tl.load(in_ptr + row*stride + cols, mask=cols<N, other=-float('inf'))
    z = tl.exp(x - tl.max(x, 0))
    tl.store(out_ptr + row*stride + cols, z / tl.sum(z, 0), mask=cols<N)
```

读一次写一次，吞吐通常比 PyTorch 高 2-4×。这种"算子融合"是 LLM 训练 / 推理性能的关键。

### 案例 3：FlashAttention——tile 抽象让 IO-aware 算法变得可写

[[flash-attention]] 把 Q×K^T、softmax、×V 全在一个 kernel 里完成，关键是不把中间 N×N 矩阵写回 HBM——只在 SRAM 里逐 tile 算。

CUDA 写这个要 1000+ 行：要手算 thread block 怎么协作分 Q/K tile、shared memory 里怎么放、warp 之间怎么同步、最后 softmax 的 running max 怎么更新。

Triton 实现约 200 行：外层循环遍历 K/V 的 tile，每次 `tl.load` 一块进 SRAM，做局部 dot 与局部 softmax，更新累加器；内层 thread 调度全交给编译器。Triton 让"按 tile 流式处理"自然到不用专门解释——这就是 DSL 设计的力量。

## 踩过的坑

1. **tile size 选错性能差 5-10×**：新手 copy 一个 BLOCK_SIZE=128 就跑，不同 GPU、不同 shape 最佳值差很多。必须用 `triton.autotune` 给一组候选让它搜。

2. **Triton 不是 CUDA 替代**：它擅长 **dense tile** 类算子（GEMM、attention、conv），**稀疏 / 不规则访问**（图算法、ragged tensor 边界）仍要手写 CUDA。别因为"潮"硬上 Triton。

3. **硬件硬约束 Triton 不会帮你绕**：shared memory 容量超限、寄存器 spill、`illegal memory access`——这些底层错误仍会出现。需要懂一点 GPU 架构基础再调。

4. **2019 论文版 ≠ 今天的开源 Triton**：MAPL paper 里的语法已被大改，Block Pointer / `tl.dot` API 都是 2020 年后加的。**学语法看 GitHub 最新文档，论文只读思想**。

## 适用 vs 不适用场景

**适用**：

- 写新的 dense GPU 算子（attention 变种、量化 GEMM、自定义 norm）
- 想做算子融合但不想写 1000 行 CUDA
- 在 PyTorch 2.0 里写自定义 op，让 Inductor 调度
- 跨 GPU 型号（A100 / H100 / 国产）想一份代码靠 autotune 跑满

**不适用**：

- 稀疏矩阵 / 图神经网络的 irregular access → 仍是 CUDA / cuSPARSE
- 跨 device 协同（multi-GPU collective）→ NCCL / [[xla-compiler]] 的事
- 极致性能且 tile 不是天然抽象（如非矩形 reduction） → 手写 CUDA + ptx asm
- AMD ROCm / TPU → 早期 Triton 只支持 NVIDIA，近年才加 AMD 后端

## 历史小故事（可跳过）

- **2019 年**：Philippe Tillet 在 Harvard 博士期间发表 MAPL paper，初版 Triton 是 C++ 嵌入 DSL，能写 GEMM 与 cuBLAS 同水位。当时知名度低。
- **2020 年**：Tillet 加入 OpenAI，把 Triton 改成 Python 前端开源，立刻爆火——博客 "Introducing Triton" 文章在 HN 上千赞。
- **2022 年**：Tri Dao 用 Triton 重写 FlashAttention（[[flash-attention]]），证明它能写 SOTA kernel。LLM 圈子开始大量采用。
- **2023 年**：PyTorch 2.0 发布，Inductor 后端选 Triton 作为 GPU code-gen 目标——即所有 `torch.compile` 出来的 GPU 算子都是 Triton 文本。

## 学到什么

1. **抽象的粒度决定生产力**：CUDA 是"thread"，Triton 是"tile"——多升一级，10× 代码量缩短
2. **正确性归用户、性能归编译器**：是 DSL 设计的黄金分工，类似 SQL 让你写"想要什么"而不是"怎么扫表"
3. **autotune > 手调**：让搜索引擎找超参，比让人类记 GPU 微架构靠谱；这是性能可移植性的关键
4. **学术原型如果 timing 对，能改写一个领域**：Triton 2019 不算引爆点，但 OpenAI 接手 + LLM 爆发让它成事实标准
5. **领域窄但深**：Triton 不试图做"通用 GPU 语言"，只搞定 dense tile——窄反而胜出

## 延伸阅读

- 官方教程：[Triton Tutorials](https://triton-lang.org/main/getting-started/tutorials/index.html)（vector add → matmul → fused softmax，跑一遍最快上手）
- 视频：[OpenAI Triton 介绍 by Philippe Tillet](https://www.youtube.com/watch?v=DdTsX6DQk24)（作者 1 小时讲设计动机）
- 实战：[FlashAttention Triton 实现](https://github.com/Dao-AILab/flash-attention/blob/main/flash_attn/flash_attn_triton.py)
- 论文 PDF：[Tillet et al. MAPL 2019](https://www.eecs.harvard.edu/~htk/publication/2019-mapl-tillet-kung-cox.pdf)
- [[flash-attention]] —— Triton 杀出名声的代表作
- [[mlir]] —— Triton 内部 IR 的设计同源思想

## 关联

- [[llvm]] —— Triton 最终 lower 到 LLVM IR 再生成 PTX
- [[mlir]] —— 现代 Triton（2023+）已迁到 MLIR 体系
- [[halide]] —— 同样"算法 vs 调度分离"思路，但 Halide 在 CPU 图像，Triton 在 GPU dense
- [[tvm]] —— 也是 tensor 编译器，但 TVM 走自动 schedule，Triton 让用户写 kernel
- [[flash-attention]] —— Triton 最有名的下游
- [[vllm]] —— Paged Attention 的 GPU kernel 用 Triton 写
- [[ssa]] —— Triton-IR 是 SSA 形式

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bentoml]] —— BentoML — 模型打包部署
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[halide]] —— Halide — 把"算什么"和"怎么算"分开写
- [[llvm]] —— LLVM — 模块化编译器框架
- [[mlir]] —— MLIR — 给编译器一套乐高，每层抽象都能搭自己的方言
- [[orca-continuous-batching]] —— Orca — 让一批 LLM 请求随到随走，不再排队等最长那个
- [[ssa]] —— SSA — 静态单赋值形式
- [[tensorrt-llm-2023]] —— TensorRT-LLM — NVIDIA 把 FT 升级成可调度的官方推理栈
- [[tvm]] —— TVM — 让一份模型能在所有硬件上跑得快
- [[vllm]] —— vLLM — 高吞吐 LLM 推理引擎
- [[xla-compiler]] —— XLA — 给 TensorFlow / JAX 装一台真正的张量编译器

