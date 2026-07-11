---
title: TVM — 让一份模型能在所有硬件上跑得快
来源: 'Chen et al., "TVM: An Automated End-to-End Optimizing Compiler for Deep Learning", OSDI 2018'
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

TVM 是一个**深度学习的端到端编译器**。给它一个 PyTorch 或 TensorFlow 训出来的模型，它能编译出在树莓派 CPU、安卓手机 GPU、Nvidia 服务器 GPU、甚至 FPGA 加速器上都跑得不慢的代码。日常类比：一份菜谱（模型），TVM 是一个"懂所有厨房的总厨"——给中式爆炒灶就用爆炒做法，给西式电磁炉就改用低温慢煮，给微波炉就再换一种思路，但出菜结果（语义）一致。

它把传统"每种硬件手写一套算子库"的活儿，换成"模型 → 中间表示（IR） → 自动搜出最快调度 → 生成原生代码"四步流水线。

```python
# 用户视角：3 行就能把模型跑到目标硬件上
mod, params = relay.frontend.from_pytorch(model, shape_dict)
target = "llvm -mcpu=cortex-a72"   # 换成 cuda / opencl / vulkan 都行
lib = relay.build(mod, target=target, params=params)
```

`target` 一改，背后生成的指令序列、循环切块、向量化方式全变；上层模型代码一行不动。

## 为什么重要

不理解 TVM，下面这些事都没法解释：

- 为什么 PyTorch 2.0 的 `torch.compile` / Google 的 IREE / Meta 的 Glow 都走"IR + autotune"路线——TVM 是这条路的开山之作
- 为什么深度学习落地手机/嵌入式不再要 vendor 出一套 SDK——通用编译器代替手工算子库
- 为什么 cuDNN / MKL 不是不可超越——人手只能调几十个 case，机器能搜上千个调度组合
- 为什么 MLIR 这种"多层 IR"思想会火——TVM 已经验证过分层 IR + 后端可插拔的工程价值

## 核心要点

TVM 的设计可以拆成 **三层栈**：

1. **图级 IR（Relay）**：把模型表达成"算子组成的计算图"。在这层做算子融合（conv + bias + relu 合一次）、布局变换、常量折叠。类比：先看整盘菜的搭配——哪些工序能合并、哪些原料能预处理。

2. **算子级 schedule（继承 Halide）**：单个算子（如矩阵乘）描述"算什么"（compute），再单独写"怎么算"（schedule：tile 多大、循环展开、绑到哪几个线程、用 SIMD 还是张量原语）。类比：菜谱写完后，再单独决定执行计划——切块大小、火候顺序、几口锅同时开。

3. **ML 自动调优（AutoTVM）**：人没法手调 1000 种 schedule 组合。给一个 schedule 模板和参数空间（split 因子、tile 尺寸等），用 XGBoost 等模型预测每种组合的速度，挑最优。类比：让 AI 试 1000 种火候组合，自己学出"哪种最快"。

三层叠起来叫 **end-to-end 编译**——上接框架，下接硬件。

## 实践案例

### 案例 1：同一个模型编到不同硬件

```python
import tvm
from tvm import relay

mod, params = relay.frontend.from_onnx(onnx_model, shape_dict)

# 编到 ARM 树莓派
target_arm = tvm.target.Target("llvm -mtriple=aarch64-linux-gnu -mcpu=cortex-a72")
lib_arm = relay.build(mod, target=target_arm, params=params)

# 编到 Nvidia GPU
target_cuda = tvm.target.Target("cuda -arch=sm_75")
lib_cuda = relay.build(mod, target=target_cuda, params=params)
```

**逐部分解释**：

- `from_onnx` 把第三方框架格式转成 TVM 自己的 Relay IR（图级）
- `target` 一变，编译器走的优化 pass 和后端代码生成全变
- 输出 `lib` 是个共享库，加载后直接调用，跟手写 C 库速度可比

### 案例 2：手写一个调度，看出 schedule 的力量

```python
# 算什么：8x8 矩阵乘，最朴素三重循环
A = te.placeholder((1024, 1024), name="A")
B = te.placeholder((1024, 1024), name="B")
k = te.reduce_axis((0, 1024), name="k")
C = te.compute((1024, 1024), lambda i, j: te.sum(A[i, k] * B[k, j], axis=k))

# 怎么算：默认调度跑得慢；改一改快 5 倍
s = te.create_schedule(C.op)
xo, yo, xi, yi = s[C].tile(C.op.axis[0], C.op.axis[1], 32, 32)  # 切块
s[C].vectorize(yi)                                              # 向量化
s[C].parallel(xo)                                               # 多线程
```

`tile / vectorize / parallel` 是 schedule 原语——计算结果完全没变，只是改了执行顺序和并行度。

### 案例 3：AutoTVM 让机器自己搜

```python
@autotvm.template("conv2d_nchw")
def conv2d_template(N, H, W, CO, CI, KH, KW):
    # ...定义计算...
    cfg = autotvm.get_config()
    cfg.define_split("tile_x", x, num_outputs=3)   # 拆 x 轴成 3 段，每段大小由搜索决定
    cfg.define_split("tile_y", y, num_outputs=3)
    cfg.define_knob("unroll", [0, 1])              # 要不要展开内循环

# 跑搜索：1000 个候选，cost model 排序后实测前 N 个
tuner = autotvm.tuner.XGBTuner(task)
tuner.tune(n_trial=1000, ...)
```

机器枚举 split/unroll 各种组合，XGBoost 学"每种组合在这块 GPU 上大概多快"，挑最快的。原始论文报告：在 ARM、Mali、Nvidia GPU 三类后端，AutoTVM 调出来的算子打到与 cuDNN/MKL 等手工库可比甚至更优。

## 踩过的坑

1. **autotune 慢**——单个算子搜 1000 个候选要几十分钟到几小时；2020 年后 Ansor / MetaSchedule 才把这块磨平到可接受。
2. **cost model 换硬件就要重训**——XGBoost 学的是"这块 GPU 上时延"，换张卡分布就漂；冷启动阶段常被人工库回打。
3. **schedule 语言 verbose**——"算法 vs 调度解耦"听着优雅，实际写出来的 schedule 像汇编技巧合集，调一组 tile 因子要试很多次。
4. **新算子覆盖度**——遇到没见过的新算子（如新 attention 变体），TVM 没现成 schedule 模板，fallback 路径慢，得手动补。

## 适用 vs 不适用场景

**适用**：

- 把训好的模型部署到非主流硬件（嵌入式 CPU、Mali GPU、自研 NPU/FPGA）
- 想榨干特定算子在特定硬件上的最后 20% 性能
- 多硬件统一部署栈——避免每个平台一套 SDK
- 学术 / 公司内部 ML 编译器原型——TVM 是公认参考实现

**不适用**：

- 训练（TVM 主打推理；训练有 PyTorch / JAX 自家编译器）
- 极致动态 shape（早期 TVM 偏静态 shape；近年 TIR + Relax 才补齐）
- 想要"开箱即用 5 分钟跑通"——autotune 那一步躲不过
- vendor 已经把硬件吃透的场景（Nvidia 服务端 fp16 推理，cuDNN/TensorRT 通常更香）

## 历史小故事（可跳过）

- **2013**：MIT 的 Ragan-Kelley 等发表 Halide，第一次把"算法 vs schedule"分离做到工业级，但只面向图像处理。
- **2016-2017**：华盛顿大学 Tianqi Chen（XGBoost / MXNet 作者）把 Halide 思路推到深度学习，加上图级 IR 与 ML cost model。
- **2018**：OSDI 论文发表，开源到 Apache。同年 PyTorch / TensorFlow 都还在堆 vendor 算子库，TVM 是少数走"通用编译器"路线的项目。
- **2019-2022**：Ansor / MetaSchedule 把搜索效率提升 10 倍以上；MLIR / IREE / TorchInductor 一波 ML 编译器都吸收了 TVM 的设计。
- **今天**：Apache TVM 仍是 ML 编译器领域的开源参考；其分层 IR + 自动调优思想已渗透到几乎所有现代深度学习编译栈。

## 学到什么

1. **分离"算什么"与"怎么算"**——这是 Halide 留给 TVM、再留给整个 ML 编译器领域的核心 idea
2. **调度空间太大就让机器搜**——人手能调几十个 case，cost model + 自动调优能搜上千个，结果常超人手
3. **分层 IR 是后端可插拔的关键**——图级 IR 做高层优化、算子级 IR 做低层调度，新硬件只需补底层 codegen
4. **ML 系统的瓶颈不是算法是工程**——TVM 真正的价值是把"模型 → 任意硬件"的部署成本从月降到天

## 延伸阅读

- 论文 PDF：[TVM OSDI 2018](https://www.usenix.org/system/files/osdi18-chen.pdf)（建议先看 §3 设计概览，§5 自动调优可跳）
- 视频：[Tianqi Chen 在 OSDI'18 讲 TVM](https://www.youtube.com/watch?v=K5cDmKeY3hc)
- 官方教程：[TVM Tutorials](https://tvm.apache.org/docs/tutorial/)（从一个 conv2d 调度搜起，最入门）
- 后续工作：[Ansor (OSDI'20)](https://www.usenix.org/system/files/osdi20-zheng.pdf)（搜索效率提升 10×）
- [[halide]] —— TVM 直接继承的"算法 vs 调度"分离思想
- [[llvm]] —— TVM 的最终代码生成走 LLVM 后端

## 关联

- [[halide]] —— 算法 vs schedule 分离的开山之作；TVM 把它从图像处理推到深度学习
- [[llvm]] —— TVM 算子最终通过 LLVM 后端落到机器码；类似的"模块化编译"思想
- [[feautrier-polyhedral]] —— 多面体模型；TVM 的循环变换与之有思想相通处
- [[ssa]] —— TVM IR 也走 SSA 风格，便于做数据流分析
- [[kildall-dataflow]] —— 图级 IR 上的常量折叠/死代码消除走的就是数据流框架
- [[cascades-1995]] —— 数据库优化器的"transformation rule"思想，与 schedule 搜索同构
- [[attention]] —— 现代模型核心算子，常被 TVM 当 benchmark 调优

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cutlass-2020]] —— CUTLASS — 把 SOTA GEMM 拆成可组合的 C++ 模板层级
- [[mlir]] —— MLIR — 给编译器一套乐高，每层抽象都能搭自己的方言
- [[triton-2019]] —— Triton 2019 — 让 Python 写出贴近 cuBLAS 的 GPU kernel
- [[triton-llm]] —— Triton — 让 Python 程序员也能写出贴近 cuBLAS 的 GPU kernel
- [[xla-compiler]] —— XLA — 给 TensorFlow / JAX 装一台真正的张量编译器
- [[numpy]] —— NumPy — Python 科学计算基石
- [[paddle-lite]] —— Paddle Lite — 端侧轻量推理引擎
