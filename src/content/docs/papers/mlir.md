---
title: MLIR — 给编译器一套乐高，每层抽象都能搭自己的方言
来源: 'Lattner et al., "MLIR: A Compiler Infrastructure for the End of Moore''s Law", arXiv 2002.11054, 2020'
日期: 2026-05-30
分类: 编译器与编程语言
难度: 中级
---

## 是什么

MLIR（**Multi-Level Intermediate Representation**，多层中间表示）是一套**让编译器作者能在不同抽象层级上自定义自己的"中间语言"**的基础设施。日常类比：像乐高积木——每个领域（深度学习 / GPU / 硬件 / 数据库）按需要拼出自己的小积木盒，但接口统一，盒子之间能互相套。

传统编译器只有一种中间表示（如 LLVM IR），高层语义全得"压扁"成低层指令。MLIR 让你定义"方言"（Dialect）：

```mlir
%matmul = linalg.matmul ins(%A, %B) outs(%C) : tensor<MxKxf32>, tensor<KxNxf32> -> tensor<MxNxf32>
```

这是 `linalg` 方言的一行——保留"矩阵乘"语义，没被分解成循环。后面再 lowering 到 `affine` → `vector` → `gpu` → `llvm` 一层层下降。

## 为什么重要

不理解 MLIR，下面这些事都没法解释：

- 为什么 TensorFlow / JAX / PyTorch 2.x / Triton / Mojo 突然都用同一套底座
- 为什么写 GPU kernel 现在能像写 NumPy 那样优雅（Triton 把张量 DSL 直接编进 PTX）
- 为什么硬件设计（CIRCT 项目）也开始借编译器框架，把 Verilog 当成"另一种方言"
- 为什么 Chris Lattner 用同一套思路造了 LLVM、Swift、MLIR 三代基础设施都成功

## 核心要点

MLIR 设计可以拆成 **三个支柱**：

1. **统一数据结构**：所有 IR 都由 Operation + Region + Block + Attribute 构成。类比：每个乐高块外形相同（接口一样），但里面装什么由你定。一个 Op 可能是"加法"，也可能是"整个 for 循环"，结构一致。

2. **方言（Dialect）= 命名空间**：用户可注册自己的 Op 集合。`linalg.matmul` / `gpu.launch` / `llvm.add` 都是不同方言的 Op，可在同一个 IR 文件里共存、互相引用。类比：英语 / 法语 / 日语句子混排在一份草稿里。

3. **渐进 lowering**：用 Dialect Conversion 框架把高层方言一步步降到低层。每一步只关心"我这层 → 邻近一层"的转换规则，不需要从顶到底一次写完。类比：翻译接力——中文 → 英文 → 法文，每个译者只懂相邻两种语言。

三个支柱加起来叫 **multi-level**，区别于 LLVM IR 的"single-level"。配套的 Pass + Pattern Rewriting 框架让每条规则像"找到形状 X 就替换成形状 Y"一样写，可读性接近代数变换。

## 实践案例

### 案例 1：TensorFlow / JAX 的编译路径

```
Python 模型
  → StableHLO 方言（图层语义，保留 reduce / dot / broadcast）
  → linalg 方言（拆成矩阵 / 张量原语）
  → affine 方言（显式循环 + 多面体优化）
  → vector / gpu 方言（向量化 + 并行）
  → LLVM IR → 机器码
```

每一层都能停下来调试、做特定优化。从前 XLA 把这些步骤糊成一团 C++，现在每层都是一个 Pass。

### 案例 2：Triton——让人写 GPU kernel 像写 NumPy

```python
@triton.jit
def add_kernel(x_ptr, y_ptr, out_ptr, N):
    pid = tl.program_id(0)
    offsets = pid * BLOCK + tl.arange(0, BLOCK)
    x = tl.load(x_ptr + offsets, mask=offsets < N)
    y = tl.load(y_ptr + offsets, mask=offsets < N)
    tl.store(out_ptr + offsets, x + y)
```

OpenAI 的 Triton 就用 MLIR 撑起这一套：Python DSL → Triton 方言 → MLIR GPU 方言 → PTX。开发者写得像 Python，跑出来的 kernel 能逼近 cuBLAS 性能。

### 案例 3：CIRCT——把硬件设计也搬上 MLIR

```
Chisel / Verilog
  → FIRRTL 方言（Chisel 的 IR）
  → HW 方言（综合友好的硬件原语）
  → Verilog 输出
```

EDA 工具一直是封闭世界，CIRCT 用 MLIR 第一次让"开源 + 可复用"的硬件编译栈成型。同一套 Pass / Pattern 框架，软件人也能进硬件圈。

三个案例的共同模式：上层 DSL 用专属方言保留语义，向下逐层 lowering 到通用方言（vector / gpu / llvm），最后出机器码或 Verilog。

## 踩过的坑

1. **学习曲线陡**：Op / Region / Block / Type / Attribute / Dialect / Trait / Interface 一堆术语，新人通常三周才能写出第一个有用的 Pass。

2. **方言之间 lowering 顺序敏感**：先降 Affine 还是先降 Vector？顺序错了性能能差 10x，框架不强约束你只能靠社区经验。

3. **TableGen 重度依赖**：定义一个 Op 要写 `.td` 文件，编译生成 C++。工具链复杂，IDE 支持差，初学者第一次报错经常是 TableGen 而不是 C++。

4. **文档跟不上代码**：核心 API 半年一变，blog 文章常常过时。最权威的"教程"其实是 LLVM 主仓 `mlir/test/` 里的实例文件。

## 适用 vs 不适用场景

**适用**：

- 领域特定编译器（DSL → GPU / TPU / 加速器）：深度学习、图像处理、信号处理
- 已有编译器需要重构（XLA、Glow、Halide 都在迁入或借鉴）
- 多层 lowering 场景：高层有语义、底层要优化
- 想统一前端 / 中端 / 后端术语的团队（一份 IR 框架走全栈）

**不适用**：

- 一次性脚本 / 临时小工具——MLIR 的方言注册成本高，单层 IR 用 LLVM IR 直接写更轻
- 纯解释器场景——MLIR 的核心价值是"多层降级"，没有降级需求就不需要它
- 编译器入门学习——先学 LLVM IR / SSA，懂了再学 MLIR 才有"对比感"
- 性能调优短平快需求——MLIR 编译时间显著长于直接写 LLVM IR，调一次性 hot path 不划算

## 历史小故事（可跳过）

- **2018 年**：Chris Lattner 在 Google 启动 MLIR，初衷是给 TensorFlow XLA 一套更干净的 IR，避免 XLA 内部"高层 HLO + 低层 LLVM"中间断层。
- **2019 年**：Google 把 MLIR 贡献给 LLVM Foundation，成为 LLVM 子项目。Lattner 同期离开 Google。
- **2020 年 2 月**：arXiv 预印本挂出（2002.11054）；**2021 年**：CGO 正式发表（标题略改为 *Scaling Compiler Infrastructure for Domain Specific Computation*），第一次系统介绍方言架构。
- **2021-2022 年**：JAX / IREE / Flang（LLVM 的 Fortran 前端）/ CIRCT 陆续基于 MLIR 重写。
- **2023 年**：OpenAI Triton 切到 MLIR；Modular Mojo 语言以 MLIR 为底层；PyTorch 2.x 的 Inductor 也开始引入 MLIR 思路。
- **2024-2025 年**：StableHLO 标准化为跨框架张量交换格式；MLIR 成为 AI 编译器事实标准。

Lattner 用同一思路造了 LLVM（2003）、Swift（2014）、MLIR（2018）三代基础设施，每代都获得行业广泛采用。

## 学到什么

1. **抽象层级是设计变量**——传统编译器只有"一层 IR"，MLIR 让"多少层 / 每层管什么"都成为你能配置的旋钮
2. **方言 = 用编译器思维做扩展点**——和 plugin 系统不同，方言保证类型 / Pass / Pattern 框架统一
3. **渐进降级是工程胜利**——一次写一层，比一次写"前端到后端的所有事"更可控
4. **基础设施的复利**：一份框架同时被 AI / GPU / 硬件 / 系统语言用上，复用性是单领域工具的 5-10 倍

## 延伸阅读

- 论文 PDF：[MLIR: A Compiler Infrastructure for the End of Moore's Law](https://arxiv.org/abs/2002.11054)（CGO 2021，30 页可读）
- 官方教程：[MLIR Toy Tutorial](https://mlir.llvm.org/docs/Tutorials/Toy/)（从零搭一门玩具语言到 MLIR，最经典入门）
- 视频：[Chris Lattner — MLIR Primer (LLVM Dev Mtg 2019)](https://www.youtube.com/watch?v=qzljG6DKgic)（设计动机讲得很清楚）
- [[llvm]] —— MLIR 的母项目，懂 LLVM 才能 lowering 到机器码
- [[ssa]] —— MLIR 的 Region / Block 模型基于 SSA
- [[triton]] —— 最有名的 MLIR 应用之一

## 关联

- [[llvm]] —— MLIR 是 LLVM 子项目，最终都降到 LLVM IR 出机器码
- [[ssa]] —— MLIR 内部用 SSA 做数据流，每个 Block 是 SSA basic block
- [[halide]] —— 早一代张量 DSL，调度与算法分离思想被 MLIR 借鉴
- [[tvm]] —— 同期的深度学习编译器栈，技术路线竞争 + 互相借鉴
- [[feautrier-polyhedral]] —— `affine` 方言的多面体优化基础
- [[cascades-1995]] —— 数据库优化器的 Pattern Rewriting 思路与 MLIR 类似
- [[attention]] —— Transformer 训练 / 推理是 MLIR 在 AI 领域最大的负载

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[passnet-graph-compiler]] —— PassNet — 让大模型给图编译器写优化 pass
- [[ssa]] —— SSA — 静态单赋值形式
- [[taso-2019]] —— TASO — 让机器自己发现深度学习图重写规则
- [[triton-2019]] —— Triton 2019 — 让 Python 写出贴近 cuBLAS 的 GPU kernel
- [[triton-llm]] —— Triton — 让 Python 程序员也能写出贴近 cuBLAS 的 GPU kernel
- [[tvm-2018]] —— TVM OSDI 2018 — 把 Halide 思想搬到深度学习
- [[vellvm]] —— Vellvm — 在 Coq 里给 LLVM IR 写一份机器证明的语义
- [[xla-compiler]] —— XLA — 给 TensorFlow / JAX 装一台真正的张量编译器
- [[numpy]] —— NumPy — Python 科学计算基石
