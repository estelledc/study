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

- 为什么 FlashAttention、vLLM 的 PagedAttention、PyTorch 2.0 Inductor **默认用 Triton 生成 GPU kernel**——它已是事实标准之一
- 为什么写一个新算子的工程师**往往先学 Triton**，而不是先啃 CUDA（CUDA 留给稀疏 / 不规则访问）
- 为什么同一个 kernel 在不同 GPU 上**重新 autotune 一下就能跑满**，不用手改 block size
- 为什么 OpenAI 维护 Triton、Meta / 业界大量采用它写自定义算子

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

**逐部分解释**：

1. `program_id(0)`：给当前 program（≈一个 thread block）发工号，像快递分区号
2. `arange` + `pid * BLOCK`：算出本块负责的下标；`mask` 挡住越界（尾巴不够一整块时）
3. `load` / `store`：按这块下标读写；启动时用 `grid=(ceil(n/BLOCK),)` 开够块数

CUDA 等价代码常要 30 行手写 thread 下标。

### 案例 2：fused softmax——一次 kernel 顶 PyTorch 三次

PyTorch 写 softmax 通常 launch 三个 kernel：求 max → 求 exp 求和 → 除。每次都要从显存（HBM，像仓库）读一遍。Triton 一次写完（本例假设一行长度 ≤ `BLOCK`，更长需再分块）：

```python
@triton.jit
def softmax(in_ptr, out_ptr, stride, N, BLOCK: tl.constexpr):
    row = tl.program_id(0); cols = tl.arange(0, BLOCK)
    x = tl.load(in_ptr + row*stride + cols, mask=cols<N, other=-float('inf'))
    z = tl.exp(x - tl.max(x, 0))
    tl.store(out_ptr + row*stride + cols, z / tl.sum(z, 0), mask=cols<N)
```

**三步**：`load` 一行 → 减 max 再 `exp` → 除以 `sum` 后 `store`。读一次写一次，吞吐常比 PyTorch 高 2-4×。

### 案例 3：FlashAttention——tile 抽象让 IO-aware 算法变得可写

[[flash-attention]] 把 Q×K^T、softmax、×V 放进一个 kernel：中间大矩阵不回写仓库（HBM），只在芯片近处缓存（SRAM，像案板）上按砖算。

类比：做长卷寿司——每次只切一小段配料上案板，滚动更新"目前最辣一口"（running max），而不是先把整条铺满桌子。

Triton 骨架：`for` 遍历 K/V 的 tile → `tl.load` → 局部 `dot` / softmax → 更新累加器；thread 调度交给编译器（约 200 行 vs CUDA 1000+）。

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

- [[papers/bentoml]] —— BentoML — 把模型 + 依赖 + API 打包成一个能直接跑的盒子
- [[orca-continuous-batching]] —— Orca — 让一批 LLM 请求随到随走，不再排队等最长那个
- [[tensorrt-llm-2023]] —— TensorRT-LLM — NVIDIA 把 FT 升级成可调度的官方推理栈
