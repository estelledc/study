---
title: CUTLASS — 把 SOTA GEMM 拆成可组合的 C++ 模板层级
来源: 'Andrew Kerr et al., "CUTLASS: CUDA Templates for Linear Algebra Subroutines", NVIDIA, GTC 2020 / CUTLASS 2.x'
日期: 2026-05-31
子分类: GPU 架构
分类: 图形学
难度: 高级
provenance: pipeline-v3
---

## 是什么

CUTLASS（**CUDA Templates for Linear Algebra Subroutines**）是 NVIDIA 开源的一套 **C++ 模板库**，让你**像搭乐高一样**拼出一个达到 cuBLAS 95% 以上性能的矩阵乘 kernel。日常类比：cuBLAS 是出厂整装的工业机床——快但只做厂家定的活；CUTLASS 是把这台机床**拆成所有齿轮、皮带、电机**，每个零件都是 C++ 模板，你想换数据类型、塞个激活函数、改稀疏模式，重新拼一台就行。

矩阵乘（GEMM）伪代码只有三行：

```cpp
for (m) for (n) for (k)
  C[m][n] += A[m][k] * B[k][n];
```

但要在 A100 上跑出 312 TFLOPS（FP16），实现细节涉及 **5 个内存层级、3 种线程层级、Tensor Core 指令、数据搬运 swizzle**——手写 CUDA 上千行。CUTLASS 把这些细节按 **层级（hierarchy）** 切成 4 层模板：Device / Kernel / Threadblock / Warp，每层只关心「自己这层的 tile 怎么算」。

## 为什么重要

不理解 CUTLASS，下面这些事都没法解释：

- 为什么 FlashAttention、FlashAttention-2、xFormers 的底层都直接调 CUTLASS，而不是 cuBLAS
- 为什么 LLM 推理框架（TensorRT-LLM / vLLM）能融合 GEMM + GELU + bias + dequant 成一个 kernel——靠的是 CUTLASS 的 epilogue 模板
- 为什么 NVIDIA 每出一代 GPU（Volta / Ampere / Hopper）的新指令（HMMA / IMMA / WGMMA），CUTLASS 都能在几周内吃下，而上层框架几乎不改代码
- 为什么"理解 GEMM 怎么写到 SOTA"绕不开 CUTLASS——它是把硬件细节**显式分层**写出来的唯一开源参考实现

## 核心要点

CUTLASS 把 GEMM 沿 **GPU 内存与线程层级** 切成一座金字塔，每一层是一个 tile：

1. **Device 层**：整个 C 矩阵——存在 DRAM 里，太大装不下。
2. **Kernel 层**：把 C 切成 **Threadblock tile**（典型 128×128），每个 SM 一块，从 DRAM 加载 A/B 子块到 **共享内存**。
3. **Threadblock 层**：把 128×128 再切成 **Warp tile**（典型 64×64），每个 warp 一块，从共享内存读到 **寄存器**。
4. **Warp 层**：把 64×64 再切成 **MMA tile**（16×8×16，对应 Tensor Core 一条指令），调 `mma.sync` 让硬件单元一拍算完。

每层都是独立模板，你换 tile 大小不用动其他层。再叠两个正交模板：

- **Iterator**：抽象「怎么从上一层加载到下一层」，包括地址计算、合并访存、bank conflict 规避（**swizzling**）。
- **Epilogue**：抽象「算完之后要做什么」——加 bias、过激活、量化、写回——拼成 functor 编译进同一个 kernel，**省掉一发 kernel launch**。

整个组合的产物：一个 `.cu` 文件，编出一个针对你这组 (dtype, tile, layout, epilogue) 的特化 GEMM。

## 实践案例

### 案例 1：cuBLAS 黑盒 vs CUTLASS 白盒

cuBLAS 调用：

```cpp
cublasGemmEx(handle, OP_N, OP_N, M, N, K, &alpha,
             A, CUDA_R_16F, M, B, CUDA_R_16F, K,
             &beta, C, CUDA_R_16F, M, CUDA_R_32F, ALGO_DEFAULT);
```

NVIDIA 替你选了 tile、选了算法、选了 epilogue——**你想加个 GELU 只能再起一发 kernel**。

CUTLASS 调用：

```cpp
using Gemm = cutlass::gemm::device::Gemm<
    half_t, RowMajor,           // A 数据类型 + 排布
    half_t, ColMajor,           // B
    half_t, RowMajor,           // C
    float,                      // 累加器
    arch::OpClassTensorOp,      // 用 Tensor Core
    arch::Sm80,                 // A100
    ThreadblockShape<128,128,32>,
    WarpShape<64,64,32>,
    InstructionShape<16,8,16>,
    LinearCombinationGELU<half_t, 8, float, float>  // epilogue: scale+GELU
>;
```

模板参数全展开——你**看见每个 tile**，能换、能调、能融合。

### 案例 2：FlashAttention 怎么用 CUTLASS

FlashAttention 把 attention 分块流式算，每块要做 `Q·Kᵀ`、softmax、`·V` 三次矩阵运算。Tri Dao 的实现用 CUTLASS 模板把这三步拼进一个 kernel：

- 第一次 GEMM 的 epilogue **不是**写回 DRAM，而是在寄存器里直接进入 softmax
- 第二次 GEMM 直接读上一步的寄存器结果

这种"GEMM 之间共享寄存器"在 cuBLAS 里**做不到**——cuBLAS 每发 kernel 各自独立。CUTLASS 暴露 epilogue 抽象，才让 fusion 跨 GEMM 边界。

### 案例 3：CUTLASS 3.x + CuTe

2023 年 CUTLASS 3.x 引入 **CuTe**：用 `Layout = (Shape, Stride)` 这一种张量代数描述任意排布——行主、列主、swizzle、interleaved 全部一种语法。Hopper 的 WGMMA 指令对寄存器排布要求极怪，CuTe 让你写一个 layout 表达式就能让编译器自己推 swizzling，省掉 100 行索引计算。

## 踩过的坑

1. **编译时间爆炸**：模板特化全展开，单个 GEMM 编译 30 秒到几分钟。生产用 CUTLASS 必须做模板预编译 + AOT 缓存。
2. **错误信息读不懂**：模板嵌套 4 层，编译器报错动辄 5000 行。诀窍：从最里层 `static_assert` 看起，倒推外层。
3. **tile 选错性能差 5 倍**：128×128×32 不是万灵药；K=64 的 GEMM 用 128×128 反而 occupancy 低。CUTLASS 自带 profiler，**先 profile 再上手写**。
4. **Epilogue functor 副作用陷阱**：epilogue 在每个线程上跑很多次，写共享状态会炸。只能用纯函数式 functor。
5. **错把 CUTLASS 当 cuBLAS 替代品**：通用稠密 GEMM cuBLAS 仍然更省心；CUTLASS 的价值在**自定义**——稀疏、量化、fused epilogue、研究新硬件。

## 适用 vs 不适用场景

**适用**：

- 训练/推理框架要做算子融合（GEMM + bias + activation + quantize）
- 研究新数据类型（FP8 / INT4 / 块稀疏）需要从 mma 指令往上自定义
- 需要在新一代 GPU（Ampere / Hopper / Blackwell）首发就吃下新指令
- 学习"GEMM 怎么写到 SOTA"——CUTLASS 是开源世界唯一系统化的答案

**不适用**：

- 业务代码偶尔调一次 GEMM → 直接 cuBLAS，省心
- 不需要自定义 epilogue 也不需要稀疏 → cuBLAS 足够
- AMD / Intel GPU → 看 ROCm rocBLAS / oneAPI，CUTLASS 仅 NVIDIA
- 不会 C++ 模板元编程 → 先看 Triton（Python，编译器替你做分层）

## 历史小故事（可跳过）

- **2017 年**：CUTLASS 1.0 开源，是 Volta + Tensor Core 的伴生品——NVIDIA 想让外部研究者也能用上 mma 指令。
- **2020 年**：CUTLASS 2.x 随 A100 发布，**第一次把 Threadblock / Warp / MMA 三层抽象写清楚**，本笔记的论文/技术报告时点。
- **2022 年**：Tri Dao 用 CUTLASS 写 FlashAttention，证明"GEMM 模板 + epilogue 融合"能拿来重塑 Transformer 内核。
- **2023 年**：CUTLASS 3.x + CuTe 把 layout 抽象成代数，Hopper 的怪指令也能优雅吃下。
- **2025 年**：Blackwell 发布，CUTLASS 第一时间支持 FP4 / FP6——**层级模板的价值再次被验证**。

## 学到什么

1. **分层抽象是吃硬件红利的关键**：硬件每代变（指令 / 内存层级 / 线程组织），但**金字塔结构不变**——这就是为什么 CUTLASS 一份代码框架活了 8 年
2. **C++ 模板是零成本抽象**：编译期全展开，运行期一行多余指令都没有——这是 CUTLASS 敢逼近 cuBLAS 性能的前提
3. **Epilogue 是 fusion 的钥匙**：把"算完之后做什么"显式建模，跨 kernel 边界的优化才有抓手
4. **理论 → 抽象 → 工程**：层级 tile 的数学早在 1970 年代 BLAS 就有了，CUTLASS 的贡献是把它**编译期化、可组合化**

## 延伸阅读

- 官方仓库：[NVIDIA/cutlass](https://github.com/NVIDIA/cutlass)（带 examples/，从 00_basic_gemm 开始读）
- GTC 演讲：[CUTLASS: A Performant, Flexible, and Portable Way to Target Hopper Tensor Cores](https://www.nvidia.com/en-us/on-demand/session/gtcspring23-s51413/)
- 入门博客：[Lei Mao — CUTLASS GEMM](https://leimao.github.io/blog/CUTLASS-GEMM/)（一步步把模板拆开）
- CuTe 教程：[CUTLASS 3.x docs/cute](https://github.com/NVIDIA/cutlass/tree/main/media/docs/cpp/cute)
- [[ampere-architecture-2020]] —— A100 Tensor Core 是 CUTLASS 2.x 的目标硬件
- [[flash-attention]] —— FlashAttention 用 CUTLASS 模板拼出 fused attention kernel

## 关联

- [[ampere-architecture-2020]] —— A100 的 mma.sync 16×8×16 是 CUTLASS Warp 层基本指令
- [[hopper-architecture-2022]] —— H100 的 WGMMA 推动 CUTLASS 3.x + CuTe 的诞生
- [[volta-architecture-2017]] —— Tensor Core 首次出现，催生 CUTLASS 1.0
- [[cudnn-2014]] —— cuDNN 是 NVIDIA 高层库，许多算子底层就是 CUTLASS 编出来的
- [[triton-2019]] —— Triton 用 Python 自动做 CUTLASS 手工做的分层调度
- [[flash-attention]] —— FlashAttention 把 attention 重写成 CUTLASS GEMM + epilogue
- [[tvm]] —— TVM 也做分层 tile，但走自动调度路线，与 CUTLASS 模板路线对照
- [[halide]] —— Halide 的 schedule/compute 分离思想，和 CUTLASS 的层级模板异曲同工

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cudnn-2014]] —— cuDNN — 把卷积写成矩阵乘，让所有深度学习框架共享底层加速
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[halide]] —— Halide — 把"算什么"和"怎么算"分开写
- [[triton-2019]] —— Triton 2019 — 让 Python 写出贴近 cuBLAS 的 GPU kernel
- [[tvm]] —— TVM — 让一份模型能在所有硬件上跑得快

