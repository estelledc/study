---
title: Performance Left on the Table — 编译器自动向量化还剩多少性能没吃到
来源: 'Neil Adit & Adrian Sampson, "Performance Left on the Table: An Evaluation of Compiler Autovectorization for RISC-V", IEEE Micro, 2022 (DOI: 10.1109/MM.2022.3184867)'
日期: 2026-06-13
子分类: 类型与 PL 理论
分类: 编程语言
provenance: pipeline-v3
---

## 从日常类比开始：自动挡 vs 手动挡

想象你买了一辆带「运动模式」的新车，销售说引擎能输出 300 马力。你平时只用 D 挡通勤，仪表盘永远显示 150 马力——不是车坏了，而是**自动挡的换挡逻辑**没把你踩到底的油门完全翻译到轮子上。

写 C/C++ 程序时，编译器的 **autovectorization（自动向量化）** 就像这辆车的 D 挡：理论上 CPU 有 SIMD/向量单元（一次处理 4、8、16 个数据），编译器应该把标量循环改写成向量指令；但大量 benchmark 显示，**手写 intrinsics 的「手动挡」版本**往往比 `-O3` 自动向量化快一截，甚至快数倍。论文标题 *Performance Left on the Table* 说的就是：**桌上还摆着性能，编译器没帮你端起来**。

Adit & Sampson 在 RISC-V Vector Extension（RVV）和 LLVM 15 上做了系统测量，对比三种配置：

| 配置 | 含义 |
|------|------|
| Scalar | 纯标量，关闭向量化 |
| Hand-vector | 程序员用 RVV intrinsics 手写向量代码 |
| Autovector | 只写标量循环，交给 `clang -O3` 自动向量化 |

核心问题不是「向量化有没有用」（有用，TSVC 里常见 6–7× 指令数下降），而是 **length-agnostic ISA（长度无关向量 ISA）** 上的编译器支持，仍明显落后于 AVX-512 等固定宽度 ISA——以及即使向量化成功，和手写之间仍有 gap。

---

## 是什么

**Performance Left on the Table** 是一篇 **empirical compiler evaluation（实证编译器评估）** 论文，聚焦 **LLVM 对 RISC-V RVV 的 autovectorization 成熟度**，并与 **Intel AVX-512** 对照。

研究分两路：

1. **合成循环（TSVC）**：151 个经典向量化测试 loop，看 LLVM 在 RVV-VLS（编译期固定向量宽）与 RVV-VLA（向量长度在运行时由硬件决定）下各能 vectorize 多少。
2. **真实应用（RiVec benchmark suite）**：已有 RVV 手写实现的 PARSEC / Rodinia / PolyBench 程序，量化 autovector 与 hand-vector 的 **dynamic instruction count speedup** 差距，并通过**受控源码变换**模拟「若编译器/编程模型改进 X，gap 能缩小多少」。

论文产出 **Table 1：改进提案清单**，按难度标注为工程修复 (E)、编译器研究 (C)、编程模型研究 (P)——相当于给 RVV/SVE 生态的 roadmap。

---

## 为什么重要

### 1. 向量 ISA 正在换代

传统 **fixed-length SIMD**（x86 AVX、ARM Neon）把向量宽写死在 ISA 里：换一代 CPU 可能要重编译或改 intrinsics。新一代 **length-agnostic / scalable vector ISA**——**RISC-V RVV**、**ARM SVE**——用 `vsetvl` 等在运行时适配硬件向量长度，**同一份二进制**可在不同 core 上跑。但若编译器 autovector 跟不上， portability 的代价就是 **performance left on the table**。

### 2. 手写 intrinsics 不可持续

Hand-vector 要求程序员：

- 理解 `vsetvl` stripmining、mask、segment load/store；
- 处理 tail loop（剩余元素不足一个向量宽）；
- 为每种数据宽度、每种 libm 函数单独调优。

Autovector 的理想是：**写可读的标量循环，编译器生成接近手写的 RVV**。论文用数据说明：这个理想在 2022 年的 LLVM 上**部分成立**（Streamcluster、Jacobi-2D），**部分彻底失败**（Blackscholes 在 RVV 上 autovector 零加速）。

### 3. 对「编译器已经够聪明」的纠偏

工业界常见心态：「开 `-O3` 就行了」。论文用 RiVec 表明：**math lib 调用、指针别名、动态向量长度、shuffle 代价未建模** 等具体问题，会让 `-O3` 在关键 loop 上**完全放弃向量化**。这不是抽象讨论，而是可复现的 instruction count 和变换实验。

---

## 核心概念

### 1. Autovectorization（自动向量化）

编译器分析 loop 的 **data dependence（数据依赖）** 和 **memory access pattern（访存模式）**，若相邻迭代可并行，则生成 SIMD/向量指令，一次处理多个 lane。

**必要条件（简化）**：

- Loop 内无 **loop-carried dependence** 阻碍（或 dependence distance ≥ vector length）；
- 编译器能证明 **pointer aliasing（指针别名）** 不破坏语义；
- 无编译器无法 vectorize 的 **call**（如 scalar `log10`）。

### 2. RVV-VLS vs RVV-VLA

| 模式 | LLVM 标志 | 含义 |
|------|-----------|------|
| RVV-VLS | `-riscv-v-vector-bits-min=N` | 编译期假定向量宽为 N bit，类似传统 SIMD |
| RVV-VLA | `-scalable-vectorization=on` | 向量长度运行时才知道，IR 中用 **scalable vector type** |

论文发现：VLS 比 VLA **多 vectorize 13 个 TSVC loop**，因为有些 pass 需要 **compile-time fixed vector length**（例如 SLP vectorization、某些 stride load 模式）。VLA 后端往往退化为更通用的 `vluxei`（indexed gather），而 VLS 可选更高效的 `vlse`（strided load）。

### 3. Instruction count speedup

论文主指标：

```text
speedup_c = (scalar 动态指令数) / (配置 c 的动态指令数)
```

在 gem5（RVV）或 perf（AVX-512）上测 **dynamic instruction count**，不是 wall-clock——便于隔离「编译器生成了多少指令」，但仍与真实性能强相关。

### 4. 性能 gap 的六大来源（RiVec 总结）

论文 Table 1(B) 归纳 autovector 落后于 hand-vector 的主因：

1. **Vector math library 缺失**：RVV 没有像 AVX-512 那样接 `-fveclib=libmvec`，loop 里的 `exp`/`log` 阻断向量化。
2. **Vector-scalar width mismatch**：RV64 上标量 promoted 到 i64，向量仍是 i32，插入大量 width conversion。
3. **Dynamic vector length scalability**：Autovector 只用 max hardware vector length + scalar epilogue；手写用 `vsetvl` stripmine，tail 更高效。
4. **Shuffle pattern detection**：VLA 下 gather offset / shuffle mask 无法在 IR 里写成固定数组，后端选指令保守。
5. **Memory aliasing & access pattern**：编译器未识别 reuse，重复 load/store。
6. **Algorithmic structure**：需 loop fusion、interchange 等源码级变换才可向量化——属编程模型问题。

---

## 代码示例 1：strided access — VLS 能 vectorize，VLA 选指令更差

TSVC 类 loop（论文 synthetic study）：

```c
// 每隔一个元素写 a[i] = a[i-1] + b[i]
for (int i = 0; i < N; i += 2) {
    a[i] = a[i - 1] + b[i];
}
```

**零基础怎么读**：

- 这是 **strided（跨步）访存**：不是连续 `a[i]`、`a[i+1]`，而是步长 2。
- **RVV-VLS** 后端可选 **strided load (`vlse`)**——硬件直接按步长取数。
- **RVV-VLA** 因 IR 里 offset 不能写成「长度固定的数组」，常退化为 **indexed gather (`vluxei`)**——更通用、往往更慢。

**启示**：不是 loop「本质上不能向量化」，而是 **length-agnostic IR 表示不完整** 导致后端保守。论文建议：**Standardize IR representation for gather offsets and shuffle masks**（Table 1-A，难度 C）。

---

## 代码示例 2：Blackscholes — 一个 `log10` _CALL 毁掉整条 loop

Blackscholes 期权定价核心类似：

```c
for (int i = 0; i < numOptions; i++) {
    float price = ...;  // 若干算术
    float log_val = log10(price);   // ← scalar libm call
    result[i] = some_formula(price, log_val);
}
```

**现象（论文 Figure 1a，未修改 benchmark）**：

| 配置 | 相对 scalar 的指令 speedup |
|------|---------------------------|
| Hand-vector (RVV) | ~6.8× |
| Autovector RVV-VLA / VLS | **~1×（无加速）** |
| Autovector AVX-512 + libmvec | **~9.3×** |

RVV 上 LLVM **无法把 `log10` 换成向量 math 库**，整个 inner loop 保持标量。AVX-512 有 GLIBC vector math，autovector 反而很强。

**受控实验**：把 hand-vector 和 autovector 版本里的 math 函数都改成 **no-op**，再比 speedup——Blackscholes 的 gap **完全消失**，autovector 甚至略超 hand-vector（~11× vs ~6.8×），说明 **compute pattern 本身编译器能优化得很好**，瓶颈在 **libm**。

```c
// 论文式「factor out math」变换（概念示意）
#define log10(x) ((void)(x), 0.0f)  // 仅用于测量 gap，非生产代码
```

**启示**：**Engineering fix (E)** —— 为 RISC-V 提供 **vectorized libm** 并接 `-fveclib`，可能一次性解锁大量科学计算 loop。

---

## 代码示例 3：动态向量长度 — 手写 stripmine vs 编译器 epilogue

**Hand-vector（RVV intrinsics 风格）**：

```c
#include <riscv_vector.h>

void saxpy(size_t n, float a, const float *x, float *y) {
    size_t vl;
    for (size_t i = 0; i < n; i += vl) {
        vl = __riscv_vsetvl_e32m1(n - i);   // 每次取当前硬件允许的长度
        vfloat32m1_t vx = __riscv_vle32_v_f32m1(&x[i], vl);
        vfloat32m1_t vy = __riscv_vle32_v_f32m1(&y[i], vl);
        vy = __riscv_vfmacc_vf_f32m1(vy, a, vx, vl);
        __riscv_vse32_v_f32m1(&y[i], vy, vl);
    }
}
```

**Autovector 近似生成的控制流（论文 pseudocode）**：

```c
int max_hwl = read_csr_vlen();           // 固定用最大硬件向量宽
for (int i = 0; i < N; i += max_hwl) {
    if ((N - i) < max_hwl) {
        // scalar epilogue：尾部不足一个向量宽时逐元素标量处理
        for (int j = i; j < N; j++)
            y[j] += a * x[j];
    } else {
        // 向量主体
        ...
    }
}
```

Streamcluster 的 `dist` 函数：autovector **指令数反而优于** hand-vector，因为手写版在 loop 内为 dynamic VL 加了额外 **vector control 指令**，而 autovector 生成的固定宽度主体更「干净」。但在 tail 占比高的 workload 上，**缺少 vsetvl 式 stripmine** 会浪费向量 lane。

**启示**：LLVM 应支持 **dynamic vector length scalability (C)**——在 autovector 代码里生成 `vsetvl` 循环，而非 max-width + scalar epilogue。

---

## 代码示例 4：指针别名 — 编译器「不敢」向量化

Stack Overflow / 社区长期讨论的经典模式（与论文 **Jacobi-2-D / Pathfinder 变换** 同类）：

```c
struct Buffer {
    size_t size;
    double *data;
};

void add1(Buffer *this, const Buffer *other) {
    for (size_t i = 0; i < this->size; i++)
        this->data[i] += other->data[i];  // 编译器担心 data[i]  alias 到 &size
}
```

在 strict aliasing 下，若 `data` 理论上可指向 `&this->size`，编译器必须假设 **`this->size` 每次迭代可能被写**，无法把 trip count hoist，也无法向量化。

**论文中的修复（Table 2）**：

- `restrict` 指针，或
- 简化 2-D 访存为 1-D 连续访问，
- 明确 non-aliasing memory。

```c
void add1_restrict(double * restrict data, size_t n, const double * restrict other) {
    for (size_t i = 0; i < n; i++)
        data[i] += other[i];
}
```

变换后 Jacobi-2-D、Pathfinder 的 autovector 接近 hand-vector，但仍可能因 **未识别 data reuse** 而多几次冗余 load。

---

## 实验结果速览

### TSVC（151 loops，vector length = 8）

- RVV-VLS 与 RVV-VLA **共同向量化** 82 个 loop，几何平均指令 speedup 约 **7× / 6.3×**。
- **仅 VLS 能向量化** 的额外 13 个 loop → VLA 编译器/IR 待补完。
- 议题：dependence analysis 需 **runtime vector length speculation**、SLP 需 **multilength 版本**、reduction 需在 loop 里做 vector register reduction。

### RiVec（7 个应用，Figure 1）

**未修改源码**：

| Benchmark | Autovector 表现摘要 |
|-----------|---------------------|
| Streamcluster | Autovector ≥ hand-vector（dist 规律访存 + reduction） |
| Blackscholes | RVV autovector **无加速**（libm） |
| Jacobi-2-D, Pathfinder | 有加速，但不如 hand-vector（reuse / alias） |
| Particle filter, Swaptions | 关键段未向量化，接近 scalar |

**Table 2 变换后（Figure 1b）**：skip math、loop fusion、restrict 等组合可 **大幅 closure gap**；Swaptions 除 math 外仍需 inline、loop interchange 等。

---

## 与更广的「性能留在桌上」

候选语料里把话题扩展到 **PGO、LTO、autovector 盲区**——与本论文一致的精神：

| 技术 | 「留在桌上」的典型原因 |
|------|------------------------|
| **Autovector** | alias、libm、dynamic VL、shuffle 代价 |
| **PGO** | 未采集代表性 profile；CI 未链 LTO+PGO |
| **LTO** | 跨 TU 边界 inlining / vectorization 仍受 IR 限制 |
| **Auto-parallel** | OpenMP 缺 `simd` / `declare simd` 提示 |

论文的方法论可复用：**(hand-opt baseline) − (autovector) = gap**，再 **受控变换** 归因到具体 pass 缺失。

---

## 改进路线图（Table 1 精简）

**A. 合成 loop / IR 层面**

- 标准化 length-agnostic gather/shuffle IR **(C)**
- Runtime vector-length-based dependence analysis **(E)**
- Multilength SLP **(E)**
- Vector reduction in dynamic loop **(E)**

**B. 应用 benchmark 层面**

- RISC-V vector math library **(E)** ← 高 ROI
- Infer scalar width from vector types **(C)**
- Dynamic VL in autovector output **(C)**
- Shuffle cost model for RVV backend **(C)**
- Algorithmic loop fusion **(P)**

---

## 零基础实践清单

1. **看编译器有没有向量化**：`clang -O3 -Rpass=loop-vectorize -Rpass-missed=loop-vectorize foo.c`
2. **对比汇编**：`llvm-objdump -d` 或 Compiler Explorer，搜 `vle`/`vse`（RVV）或 `vmovups`（x86）。
3. **排除 libm 阻断**：临时替换 math 调用或链接 vector libm（x86 上试 `-fveclib=libmvec`）。
4. **帮助 alias 分析**：`restrict`、`-fno-strict-aliasing`（仅诊断用，生产慎用）、结构体拆分 pointer 与 length。
5. **显式提示**：OpenMP `#pragma omp simd`、Clang `__attribute__((assume_aligned))`。
6. **仍不够再 intrinsics**：与论文结论一致——hand-vector 是现状下的性能上限参考。

---

## 局限与后续工作

- 指标是 **dynamic instruction count**，未涵盖 cache、分支预测、向量单元占用率；Blackscholes 上 autovector 去掉 math 后 **优于** hand-vector 仅说明「指令更省」，真实 wall-clock 还看 libm 实现。
- 评估锁定 **LLVM 15 + gem5**；2024–2026 的 LLVM 对 RVV 持续演进，需重新跑 RiVec/TSVC 验证 gap 是否缩小。
- 后续研究如 **VecTrans（LLM 辅助改写 TSVC 以触发 Clang 向量化）** 说明：gap 的一部分可通过 **源码变换 + 编译器** 联合关闭，而不只靠后端 patch。

---

## 一句话总结

**Performance Left on the Table** 用 RISC-V RVV 证明：在 length-agnostic 向量时代，**编译器 autovectorization 仍系统性弱于 fixed-width ISA 上的成熟度，也弱于手写 intrinsics**——主因是 vector libm、VLA IR/后端、dynamic vector length、alias 与访存模式，而非「向量化理论不适用」。性能不是不存在，而是 **留在桌上**；工程上优先补 vector math 与 alias 友好写法，往往比换 CPU 更便宜。

---

## 延伸阅读

- RISC-V Vector Extension spec（RVV v1.0）
- ARM SVE autovectorization 对比研究（与 Neon/AVX 对照的 prior work）
- TSVC / TSVC 2 向量化测试套件
- RiVec benchmark suite（RVV hand-vector 参考实现）
- VecTrans（arXiv:2503.19449）— LLM 改写不可向量化 loop 以触发 autovector
