---
title: LLVM — 模块化编译器框架
来源: 'Lattner & Adve, "LLVM: A Compilation Framework for Lifelong Program Analysis & Transformation", CGO 2004'
日期: 2026-05-29
子分类: 编译器
分类: 编译器
难度: 中级
schema_version: legacy-long
provenance: legacy-migrated
---

## 是什么

LLVM 是把"前端语言（Clang / Rust / Swift）→ 后端 CPU/GPU 机器码"中间架一层 **IR（中间表示）**，让任何语言 + 任何硬件可以两两组合。

日常类比：**翻译外语不直接 A → B，而是 A → 世界语 → B**。世界语就是 LLVM IR——所有人都翻译到它，也都能从它翻译过去。

写一段 C：

```c
int add(int x, int y) { return x + y; }
```

经过 Clang 前端，变成 LLVM IR：

```llvm
define i32 @add(i32 %x, i32 %y) {
  %sum = add i32 %x, %y
  ret i32 %sum
}
```

再经过 LLVM 后端，输出 x86 / ARM / RISC-V 任何一种汇编。前端不必知道目标架构，后端不必知道源语言——LLVM IR 是它们共用的"普通话"。

## 为什么重要

不理解 LLVM，下面这些事都没法解释：

- 为什么 Clang / Rustc / Swift / Julia / Zig / MoonBit 全部用 LLVM 后端
- 为什么 Apple 把所有芯片（Mac / iPhone / Watch）都转向 LLVM-only 工具链
- 为什么"造一门新语言"的门槛降到几千行——不用自己写汇编生成
- 为什么 GPU 编译（NVIDIA NVPTX / AMD ROCm）、WebAssembly、MLIR 都把 LLVM 当根基

一句话：**LLVM 把"编译器后端"从每语言重写一次，变成全球共享一套基础设施**。

## 核心要点

LLVM 由三个核心组件拼起来：

1. **IR（中间表示）**：SSA 形式 + 静态类型 + 平台无关。SSA 意思是"每个变量只赋值一次"——账本只能追加不能修改，数据流分析直接退化成"找定义点"。

2. **Pass 管道**：一系列优化步骤，每步读 IR 写 IR。常量折叠、死代码消除、循环外提都是 Pass。`-O0` 不开优化，`-O3` 跑几十个 Pass。

3. **Backend**：把 IR lower 到具体机器码（x86 / ARM / RISC-V / WebAssembly / GPU）。LLVM 自带十几种后端，新硬件出来加一个 backend 就能编译。

三件事合起来：**前端只管把语言降到 IR，后端只管把 IR 升到硬件，中间所有优化复用**。

## 实践案例

### 案例 1：一段 C 编译成 LLVM IR

源代码：

```c
int main() { return 42; }
```

`clang -S -emit-llvm hello.c` 输出：

```llvm
define i32 @main() {
  ret i32 42
}
```

**逐部分解释**：

- `i32` —— 32 位整数（integer 32-bit）
- `@main` —— 全局函数 main，`@` 前缀表示全局符号
- `define i32 @main()` —— 定义返回 i32 的函数 main
- `ret i32 42` —— 返回 42

这就是 LLVM IR——比汇编高级（不用管寄存器分配），比 C 低级（已经没函数调用语法糖）。

### 案例 2：写一个最小 Pass（玩具）

LLVM Pass 是 C++ 类，实现一个 `runOnFunction` 方法。下面这个 10 行小玩具把所有 `add` 改成 `mul`：

```cpp
struct AddToMul : FunctionPass {
  bool runOnFunction(Function &F) override {
    for (auto &BB : F)
      for (auto &I : BB)
        if (I.getOpcode() == Instruction::Add)
          I.setOpcode(Instruction::Mul);
    return true;
  }
};
```

加载这个 `.so` 跑一遍，所有加法变乘法。**写 50 行就能做一个真实有效的优化**——这是 LLVM 给研究者最大的福利。

### 案例 3：Clang 的 -O0 / -O3 经过哪些 Pass

```bash
clang -O0 hello.c -o hello   # 不优化，跑得慢但调试方便
clang -O3 hello.c -o hello   # 跑 30+ 个 Pass
```

`-O3` 关键 Pass：

- `mem2reg` —— 把局部变量从内存提到寄存器
- `inline` —— 跨函数内联小函数
- `LICM` —— 循环不变量外提
- `GVN` —— 消除冗余计算
- `loop-vectorize` —— 循环向量化（用 SIMD 指令）

每个 Pass 都是独立 `.cpp`，可单独打开关闭，也可重新排序。

## 踩过的坑

1. **LLVM IR 看起来像汇编但不是汇编**：IR 平台无关，没有具体寄存器名。新人常误以为 `%x` 是寄存器，其实是 SSA 值。

2. **bitcode 格式跨版本不兼容**：新版 LLVM 能读旧 bitcode，反过来不行。团队 vendored LLVM 13，发出去的 `.bc` 不能被同事 LLVM 11 处理。

3. **编译速度慢**：LLVM `-O3` 走完几十个 Pass 显著慢于 GCC `-O2`。Rust 编译慢的锅一半在 LLVM——MIR → LLVM IR 已经膨胀，再过一轮 Pass 又一轮。

4. **调试信息丢失**：激进优化（特别是 inline + LTO）让源码行号映射不可靠。`-O3` binary 上设断点经常断错地方——LLVM 几十年的老问题。

5. **`getelementptr` 最坑**：GEP 做**地址计算**但**不做内存访问**。`%y_ptr = getelementptr ...` 不会 segfault，后面的 `load %y_ptr` 才会。新人常误把 GEP 当成"读字段"。

## 适用 vs 不适用场景

**适用**：

- 造一门新语言（Rust / Swift / Julia / Zig / Mojo）——复用 LLVM 后端节省 5 年工程
- 跨平台 C/C++ 编译（Clang）——一份代码编 x86 / ARM / RISC-V / WASM
- GPU / 异构计算编译（CUDA NVPTX / AMD ROCm）
- JIT（Julia / LuaJIT 后期）——ORC v2 提供完整 lazy + concurrent JIT

**不适用**：

- 浏览器引擎（V8 / SpiderMonkey）——启动延迟太大，他们自家做 JIT
- 深度学习编译 —— LLVM IR 太低层，表达不了 tensor / 多面体 / 自动微分；用 MLIR（Lattner 后续作）
- 完全动态语言（Python / Ruby）—— 类型不稳定，静态 IR 优化空间小
- Lisp 这类 Image-based 系统 —— 与 LLVM IR 静态结构哲学冲突

## 历史小故事（可跳过）

- **2000 年**：Chris Lattner 在 UIUC 读硕士，导师 Vikram Adve；做 "Low Level Virtual Machine" 原型（后来 Lattner 自己说全称 misleading 不再用）。
- **2003 年**：硕士论文完成，原型已能编 C 跑 SPEC2000。
- **2004 年**：CGO 论文发表，奠定 LLVM 设计基础。
- **2005 年**：Apple 雇 Lattner 启动 Clang 项目，目标替换 Apple 的 GCC fork。
- **2010 年**：Apple Clang 替换 GCC 成 Xcode 默认编译器。
- **2012 年**：Lattner 启动 Swift，借助 LLVM 6 个月就出原型。
- **2014 年**：Swift 在 WWDC 公开，Apple 平台从此 LLVM-only。
- **2015 年**：Rust 1.0 基于 LLVM 发布。
- **现在**：所有现代编译器都是它的客户——Julia / Zig / MoonBit / Mojo 一律选 LLVM 后端。

LLVM 几乎和 Lattner 个人能力强绑定。"超级个体 + BSD 协议 + 商业公司大力投入"的组合在编译器领域罕见——同时期 Open64 / GCC 都没法同时占齐这三条。

## 学到什么

1. **基础设施 vs 创新的杠杆比**：Lattner 没发明新优化算法，他做的是"让所有人做新优化都更容易"。基础设施投资比创新本身价值大得多。

2. **协议是工程决策不是法律决策**：Lattner 选 BSD-like 协议，是为了让 LLVM 能 link 进任何宿主进程。GCC GPLv3 反而限制了它的复用。

3. **统一 IR 有边界**：LLVM IR 在命令式编程世界是赢家，到 ML 时代被 MLIR 替换。**不要把统一 IR 当万能钥匙**——每个抽象层都有它最擅长的语义域。

4. **理论 → 算法 → 工程**，每步隔 5–10 年。1991 SSA 论文 → 2004 LLVM 论文 → 2010 Apple 全栈替换 → 2015 Rust/Swift 起飞。

## 延伸阅读

- 视频：[Chris Lattner — LLVM Story](https://www.youtube.com/watch?v=yCd3CzGSte8)（Lattner 自己讲 LLVM 来龙去脉，1 小时）
- 入门：[Mapping High Level Constructs to LLVM IR](https://mapping-high-level-constructs-to-llvm-ir.readthedocs.io/)（C++ 各种语法映射到 IR 怎么写）
- 官方教程：[LLVM Kaleidoscope](https://llvm.org/docs/tutorial/)（用 LLVM 写一个迷你语言）
- [[hindley-milner]] —— 类型推导经典，与 LLVM 一起构成现代编译器双引擎
- [[lambda-calculus]] —— 任何高级语言最终编译的还是函数应用

## 关联

- [[hindley-milner]] —— HM 在前端推类型，LLVM 在后端生机器码；现代编译器双引擎
- [[lambda-calculus]] —— 高级语言 lower 到 LLVM IR 之前都先过类似 λ-演算的中间形式
- [[mccarthy-lisp]] —— LISP 提出"代码即数据"，与 LLVM 静态 IR 哲学冲突；MLIR 一定程度调和
- [[standard-ml]] —— ML 是第一个工业 HM 宿主；现代 ML 派生（OCaml / Reason）后端常选 LLVM

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[andersen-pointer-analysis]] —— Andersen 指针分析 — 让编译器自己算出 p 可能指向谁
- [[boogie-2005]] —— Boogie — 写一次验证后端，多种证明语言复用
- [[case-for-risc-1980]] —— Case for RISC 1980 — 一篇没有芯片的论文，掀起 CPU 半世纪革命
- [[chaitin-graph-coloring]] —— Chaitin 图染色寄存器分配 — 把硬件资源问题翻译成数学问题
- [[circuitpython]] —— CircuitPython — 插上 USB 就能写 Python 的微控制器运行时
- [[compcert]] —— CompCert — 每条优化都被数学证明保持语义的 C 编译器
- [[compiler-errors]] —— Compiler Error Messages — 让编译报错有用
- [[ebpf]] —— eBPF — 用户写小程序，内核证明安全后再跑
- [[feautrier-polyhedral]] —— Feautrier 多面体调度 — 把循环并行化变成解几何方程
- [[fpga-hls-2011]] —— FPGA HLS 2011 — 把 C 代码自动翻译成芯片电路的范式
- [[graalvm-truffle]] —— GraalVM Truffle — 写一棵会自我特化的语法树就能自动得到 JIT
- [[halide]] —— Halide — 把"算什么"和"怎么算"分开写
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[hotspot-server-compiler]] —— HotSpot Server Compiler — JVM 在运行时把热点 Java 代码翻译成飞快的本地码
- [[immix-mark-region]] —— Immix — 把"扫"和"搬"两种垃圾回收揉成一个
- [[jax]] —— JAX — Google 函数式数值计算
- [[jupiter-2015]] —— Jupiter Rising — Google 数据中心网络十年怎么做到带宽涨百倍
- [[kildall-dataflow]] —— Kildall 数据流框架 — 用一套格论统一所有全局编译优化
- [[knuth-lr-1965]] —— Knuth LR(k) — 编译器自己读懂语法的算法
- [[lalr-deremer]] —— DeRemer LALR(1) — 把 LR 表压到能用大小
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[landin-secd]] —— Landin SECD — 第一台机械求值 lambda 表达式的抽象机器
- [[lerner-seminal]] —— Lerner 组合数据流 — 让小优化互相喂招
- [[linear-scan-reg-alloc]] —— Linear Scan 寄存器分配 — 把图染色换成单趟扫描，给 JIT 用
- [[mccarthy-lisp]] —— McCarthy LISP 1960
- [[micropython]] —— MicroPython — 在 MCU 上跑 Python 3 的精简实现
- [[mips-1981]] —— MIPS 1981 — 让编译器自己安排流水线，CPU 就不用管
- [[mlir]] —— MLIR — 给编译器一套乐高，每层抽象都能搭自己的方言
- [[numpy]] —— NumPy — Python 科学计算基石
- [[p4-2014]] —— P4 — 让交换机的转发逻辑像写代码一样改
- [[platformio-core]] —— PlatformIO Core — 一套命令行，统管千块嵌入式开发板
- [[pytorch]] —— PyTorch — 深度学习主流框架
- [[quickjs]] —— QuickJS — 装进口袋的 JavaScript 引擎
- [[reps-ifds]] —— Reps-Horwitz-Sagiv IFDS — 把跨过程分析变成图上找路
- [[risc-i-1981]] —— RISC I — 砍掉 90% 指令反而让 CPU 跑得更快
- [[self-pic]] —— Self / PIC — 内联缓存的诞生
- [[skcc-skill-compiler]] —— SkCC — 给 LLM agent 写一个真正的 skill 编译器
- [[solana]] —— Solana — Rust 写的高性能 PoH 链
- [[spin]] —— Spin — 用 WebAssembly 模块当 serverless handler 的开源框架
- [[ssa]] —— SSA — 静态单赋值形式
- [[standard-ml]] —— Standard ML — 让编译器替你把类型补完
- [[steensgaard-pointer]] —— Steensgaard 指针分析 — 用等价合并把指针分析压到几乎线性
- [[sycl-cpp-2020]] —— SYCL 2020 — 用一份标准 C++ 让 GPU/CPU/加速器一起跑
- [[tensorflow]] —— TensorFlow — Google 端到端 DL 平台
- [[tesla-architecture-2008]] —— NVIDIA Tesla — 把显卡改造成通用并行计算机
- [[theorems-for-free]] —— Theorems for Free — 类型签名直接给定理
- [[triton-2019]] —— Triton 2019 — 让 Python 写出贴近 cuBLAS 的 GPU kernel
- [[triton-llm]] —— Triton — 让 Python 程序员也能写出贴近 cuBLAS 的 GPU kernel
- [[tvm]] —— TVM — 让一份模型能在所有硬件上跑得快
- [[tvm-2018]] —— TVM OSDI 2018 — 把 Halide 思想搬到深度学习
- [[vellvm]] —— Vellvm — 在 Coq 里给 LLVM IR 写一份机器证明的语义
- [[wam-warren]] —— WAM — 让 Prolog 跑得像编译型语言的抽象机器
- [[xla-compiler]] —— XLA — 给 TensorFlow / JAX 装一台真正的张量编译器
- [[zgc]] —— ZGC — 让 GC 停顿与堆大小解耦的低延迟回收器
- [[zksync-era]] —— zkSync Era — Matter Labs 的 zkEVM L2

