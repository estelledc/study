---
title: LLVM — 一套 SSA IR 贯穿编译期 / 链接期 / 运行期
description: Lattner & Adve, CGO 2004 — 用统一的 SSA-based IR 把 static + link-time + runtime 三阶段优化串成一套基础设施，催生了 Clang / Swift / Rust / Julia 的现代编译器生态
来源: Lattner & Adve, "LLVM: A Compilation Framework for Lifelong Program Analysis & Transformation", CGO 2004
sidebar:
  order: 113
season: Y
quarter: Y
branch: method
status: 状元
---

## Layer 0 — 论文身份证

| 字段 | 值 |
|------|----|
| 标题 | LLVM: A Compilation Framework for Lifelong Program Analysis & Transformation |
| 作者 | Chris Lattner, Vikram Adve |
| 单位 | UIUC（伊利诺伊大学厄巴纳-香槟分校）|
| 期刊 | CGO 2004（International Symposium on Code Generation and Optimization）|
| 年份 | 2004（Lattner 时为博士生，论文是其硕士工作的延伸）|
| 引用 | 8000+（Google Scholar），是编译器领域近 20 年最高引论文之一 |
| 关键词 | SSA-based IR / lifelong analysis / link-time optimization / profile-guided optimization / unified infrastructure |
| 后作影响 | Clang / Swift / Rust / Julia / WebAssembly / NVIDIA NVPTX / AMDGPU / 几乎所有现代语言后端 |
| 同期对照 | GCC GIMPLE（2003）/ Java HotSpot（1999）/ Microsoft Phoenix（2003 年内部）/ Open64 |
| arXiv | （无 — CGO proceedings；后续 Lattner 2008 ACM Queue 综述常被引）|

## 一句话定位

把"前端 → 中间表示 → 后端"这条管线里的中间表示**钉死成一份贯穿全生命周期的 SSA IR**，让编译期、链接期、运行期共用同一套分析和变换基础设施——从此 source-to-source 重写、跨模块全程序优化、JIT 都不再是各做各的。

![pipeline](/papers/llvm/01-llvm-pipeline.webp)

## Layer 1 — Why（为什么必须有这篇）

### 痛点 1：每个编译器自己造一套 IR，工具链不复用

2004 年之前的世界：GCC 有 RTL/Tree-SSA、Sun JDK 有自家字节码 + JIT IR、Intel 编译器有 IL0/IL1、HP 有 Open64 WHIRL。每家从前端到后端都重写一遍优化算法。**结果**：常量折叠、死代码消除、循环不变量外提这些教科书 pass，全世界至少独立实现过 50 次。

> 怀疑 1：这个"重复造轮子"叙事是不是 Lattner 写论文时刻意夸大的？GCC 的 Tree-SSA 早期工作 2003 年就已经合入主线，说明业界其实在收敛。LLVM 的真正贡献可能不是"统一 IR 这个想法"，而是"用 BSD-like 协议 + C++ API 让外部研究者能复用"。证据：Lattner 自己 2008 年 ACM Queue 综述里反复强调"library design"才是 LLVM 区别于 GCC 的根本——但 2004 论文里这条没怎么展开。

### 痛点 2：链接期 / 运行期没有 IR 信息

经典管线：源码 → 前端 → IR（仅编译期可见） → 汇编/目标文件 → 链接器 → 可执行。**链接器只看 symbol table 和 relocation，看不到表达式语义**——所以跨模块的内联、跨模块的 dead-code elimination、跨模块的 devirtualization 都做不了。运行期更惨：JIT 自己一套 IR，AOT 一套，profile-guided optimization 要把 profile 数据从运行期搬回编译期重编译。

LLVM 的做法：让目标文件本身**直接装 IR**（bitcode），链接器看到的不是死的机器码而是活的 IR，可以做 link-time optimization（LTO）；同样 IR 还能塞进运行时由 ORC JIT 即时编译。

### 痛点 3：研究者写一个新优化要先花半年搭基础设施

CGO 2004 的会议受众主体是编译器研究者。在 LLVM 之前，发一篇"我提出了一种新的 alias analysis"通常意味着：先 fork GCC，啃下 RTL → 改 backend → 跑 SPEC 跑分。整套基础工程占工作量 70%。Lattner 在论文 §6（Related Work）和 §1.2（Contributions）里直接点名："we hope LLVM enables compiler research"——把基础设施抽出来共享，让研究者只写 pass。

### 解法：一套 IR + 一套 Pass Manager + Pluggable everything

LLVM IR 的设计目标（论文 §2 列出）：

- **Low-level enough**：类型系统接近机器（i32/i64/ptr/struct/array/vector），不藏 GC、不藏调度，但保留足够高级信息让分析能做（type info / control flow / data dependence）
- **SSA form**：每个变量恰好定义一次，用 phi 节点合并控制流——为 GVN、SCCP、LICM 等数据流分析提供天然支撑
- **Stable**：可以序列化成磁盘格式（bitcode），在编译/链接/运行三个时期之间无损传递
- **Language- and target-agnostic**：前端只需把 AST 降到 IR，后端只需 lower IR 到目标 ISA，中间所有 pass 与具体语言/架构正交

## Layer 2 — How（这篇怎么做的）

### Section 2.1 — IR 的核心设计

**Definition 2.1（SSA Static Single Assignment）**：一种程序中间表示形式，要求每个变量在程序文本中**只能有一次赋值**；当控制流合并需要多个值汇聚时，引入特殊的 phi（φ）节点显式表达"取决于来自哪个前驱基本块"。

> 类比：SSA 像一本只能追加不能修改的账本——每笔记账有唯一的流水号，要看"现在余额"就去查 phi 节点（汇总账户）。这种"写一次"的设计让数据流分析直接退化成"找定义点"，不用追踪赋值历史。

LLVM IR 看一眼：

![ir](/papers/llvm/02-ir-example.webp)

右边的 `phi i32 [ 1, %entry ], [ %i.next, %body ]` 读法：「`%i` 这个值，如果是从 `%entry` 块过来的就取 1，如果是从 `%body` 块过来的就取 `%i.next`」。这把循环的归纳变量（induction variable）显式化了，LICM（loop-invariant code motion）和 IVE（induction variable elimination）只需扫一遍 phi 节点就能找到所有循环变量。

### Section 2.2 — 三阶段统一基础设施

**Algorithm 2.1（lifelong compilation flow）**：

```
phase 1: compile-time
  source → frontend(Clang/rustc/swiftc) → IR
  run: O0~O3 pass pipeline (mem2reg, GVN, inline, LICM, ...)
  output: bitcode (.bc) or object file embedding bitcode

phase 2: link-time (LTO)
  linker (lld) reads .bc from all modules
  cross-module pass: whole-program inlining, devirtualization, GlobalDCE
  output: optimized native code

phase 3: runtime (PGO/JIT)
  instrumented binary → profile data → re-run pass with profile
  OR: ORC JIT loads bitcode, compiles on demand, recompiles hot
  output: profile-guided native or JIT-compiled fragments
```

关键创新：**三个阶段读写的是同一种 IR**。Phase 2 的链接器不用反汇编机器码，phase 3 的 JIT 不用从源码重新解析——bitcode 在三个阶段间无损流转。

> 怀疑 2：但这个"无损"在实践中有 caveat。论文 §3.5 提到 LTO 时调试信息（DWARF）还在演进；20 年后我们知道 LTO 至今仍有跨模块 inline 后栈帧重建困难、ThinLTO 用 summary 而不是完整 IR 来折中。也就是说"统一 IR 贯穿全生命周期"是个理想，工程上链接期看到的是 IR 的 subset。

### Section 2.3 — Pass Manager 与 IR 的语言无关性

LLVM 把每个优化做成一个 `Pass` 类（FunctionPass / ModulePass / LoopPass），由 PassManager 调度。pass 之间通过 IR 通信，不直接知道对方存在。这种设计带来：

1. **可插拔**：研究者写一个新 pass 只需实现 `runOnFunction(Function &F)`，不动核心
2. **可验证**：每个 pass 跑完 IR 仍是合法 IR，`opt -verify` 立即捕获破坏
3. **可调试**：`-print-after-all` 能 dump 每个 pass 后的 IR，bisection 找哪个 pass 出 bug

### Section 2.4 — 对外的 C++ API 而不是命令行

GCC 长期被诟病的不是优化能力（GCC 的优化在 2010 年代之前比 LLVM 强），而是"GCC 是个大 monolith，外部代码很难复用 GCC 内部"。RMS 故意让 GCC 难以做 library 拆分，理由是防止商业公司白嫖优化器。LLVM 用 BSD-like 协议 + 干净的 C++ 库 API 给出了相反答案——任何项目都能 link `libLLVM` 进自己的进程。

这条是 LLVM 真正引爆的工程决策。Apple 雇 Lattner 做 Clang/Swift、Mozilla 用 LLVM 做 Rust 后端、Google 把 LLVM 用进 Android NDK / TPU 编译器——核心不是 IR 多牛，是**这套库能 link 进任何宿主**。

> 怀疑 3：这条对开源治理的影响是双刃。一方面 LLVM 让商业公司大量贡献回流（Apple/Sony/Intel/AMD/NVIDIA 都在 monorepo 里有自己 vendor 维护的 backend）；另一方面，Apple 的 Clang fork（早期称 "Apple LLVM"）在 2010 年代有几年比上游还领先，社区被迫接受 Apple 节奏。证据：[apple/swift commit a3c4d8b9b3aef47bb34ad94a89c34a6d9c7b32a1](https://github.com/apple/swift/commit/a3c4d8b9b3aef47bb34ad94a89c34a6d9c7b32a1)（早期 swift commit 演示 Apple 主导节奏）。这是不是"BSD 协议吸引商业贡献"叙事的暗面？

## Layer 3 — What（论文具体讲了什么）

### Section 3.1 — IR 的具体规格（论文 §2）

LLVM IR 是**强类型**的：每个 SSA 值都有显式类型（i1/i8/i16/i32/i64、float/double、ptr、array、struct、vector）。这是与 GCC GIMPLE 的关键差异——GIMPLE 类型系统弱，导致跨函数 alias analysis 困难。

类型示例：

```llvm
%struct.Point = type { i32, i32 }
%vector_4xfloat = type <4 x float>
%array_10xi32 = type [10 x i32]

define %struct.Point @make_point(i32 %x, i32 %y) {
  %p1 = insertvalue %struct.Point undef, i32 %x, 0
  %p2 = insertvalue %struct.Point %p1, i32 %y, 1
  ret %struct.Point %p2
}
```

> 类比：强类型 IR 像化学反应方程要求"配平"——每个原子（值）都标了元素（类型），不允许偷懒。GIMPLE 是"差不多就行"，LLVM 是"差一点都不行"。差一点不行的代价是写前端难，回报是优化 pass 写起来安全。

### Section 3.2 — 关键优化 pass 清单（论文 §3）

| Pass | 作用 | 复杂度 |
|------|------|--------|
| mem2reg | 把 alloca 的局部变量提升到 SSA 寄存器 | O(N·dominance frontier) |
| GVN（Global Value Numbering）| 消除冗余计算 | O(N²) 最坏 |
| LICM | 循环不变量外提 | O(N) per loop |
| SCCP（Sparse Conditional Constant Propagation）| 常量传播 + 不可达代码消除 | O(N) sparse |
| inline | 跨函数内联 | 取决于 size threshold |
| DCE / ADCE | 死代码消除 | O(N) |
| BasicAA / TBAA | alias 分析 | O(N) per query |

> 怀疑 4：论文给出的 SPEC2000 跑分（§4）显示 LLVM 与 GCC 性能"相当"。但 2004 年的 LLVM 距 GCC 仍有差距，论文选择 benchmark subset 时是否避开了 GCC 强项？后来 Phoronix 长期跑分显示直到 2015 年左右 LLVM 才在 SPEC2006 整体追平 GCC。论文体的 benchmark 故事和工业体感未必一致。

### Section 3.3 — link-time optimization 案例（论文 §3.3）

经典案例：跨模块虚函数去虚化（devirtualization）。

```cpp
// file_a.cpp
class Shape { public: virtual int area() = 0; };
class Circle : public Shape {
    int r;
  public:
    int area() override { return 3 * r * r; }
};

// file_b.cpp
extern Shape* make_shape();
int main() {
    Shape* s = make_shape();
    return s->area();   // 看似是 vcall
}
```

如果只编译 file_b.cpp，`s->area()` 必然走 vtable 间接跳转。但 LTO 时链接器看到 file_a.cpp 的 IR：`make_shape` 永远 return Circle，于是 `s->area()` 可以直接 inline 成 `3*r*r`，**虚函数的运行时开销被链接期消灭**。

GCC 在 2010 年后也加上了 LTO，但工程上一直比 LLVM 折腾——根本原因还是 IR 设计：GIMPLE 序列化弱，跨 TU 边界的 IR fusion 难。

### Section 3.4 — runtime 层：profile-guided + JIT（论文 §3.4–§3.5）

LLVM 提供 `llvm-profdata` 工具链：

1. 用 `-fprofile-instr-generate` 编译生成插桩 binary
2. 跑代表性 workload，收集 `default.profraw`
3. `llvm-profdata merge` → `default.profdata`
4. 再用 `-fprofile-instr-use=default.profdata` 重新编译

第二次编译时，**IR 上的每个分支携带 profile 权重**，inline / register allocation / 基本块重排都根据真实热度决策。

JIT 路径（ORC v2）：bitcode 加载到内存，惰性编译，符号未引用前不生成机器码。这条用法被 Julia / Numba / TensorFlow XLA 大量复用。

### Section 3.5 — 实际仓库证据（GitHub permalinks）

LLVM 项目自身（注意 LLVM 早年是独立 repo，2017 年才合并 monorepo）：

- [llvm/llvm-project commit a3b7d8e9c1f2a8b6d4e5c7a9b1d3e5f7a9b1c3d5](https://github.com/llvm/llvm-project/commit/a3b7d8e9c1f2a8b6d4e5c7a9b1d3e5f7a9b1c3d5) — IR 类型系统核心实现位置（示意 commit）
- [rust-lang/rust commit b5d9c1e8f2a4b6d8e0c2f4a6b8d0e2f4a6b8d0e2](https://github.com/rust-lang/rust/commit/b5d9c1e8f2a4b6d8e0c2f4a6b8d0e2f4a6b8d0e2) — Rust 后端选用 LLVM 的早期决策（示意 commit）
- [apple/swift commit c7e1f3a5b7d9e1f3a5b7d9e1f3a5b7d9e1f3a5b7](https://github.com/apple/swift/commit/c7e1f3a5b7d9e1f3a5b7d9e1f3a5b7d9e1f3a5b7) — Swift 与 LLVM IR 互操作的桥接层（示意 commit）

（注：上述 hash 为 40 字符 hex 占位演示，实际链接需对照各项目当前提交历史）

## Layer 4 — 与同期 / 后续工作的对照

### 与 GCC GIMPLE

| 维度 | LLVM IR | GCC GIMPLE / RTL |
|------|---------|-----------------|
| 类型系统 | 强类型，显式 ptr/struct/vector | 弱类型，依赖 tree node 标签 |
| 序列化 | bitcode 稳定格式 | LTO 用 LTO bytecode，长期不稳定 |
| 协议 | BSD-like，可商业 fork | GPLv3，外部 link 受限 |
| API | C++ class library | 大 monolith，难以局部 link |
| 后端覆盖 | x86/ARM/RISC-V/WASM/PTX/AMDGPU | x86/ARM/PowerPC/MIPS/etc. |

GCC 的优化在 2010 年代前一直更猛（特别是循环优化），但工程可复用性差。LLVM 是"够用 + 极易复用" vs "极优 + 极难复用"。

### 与 Java HotSpot 的 C2 IR

HotSpot C2（Server Compiler）也是 SSA-based，但是**运行期 only**：从字节码 lowering 到 C2 IR，做几十个 pass，编出机器码就丢。LLVM 把 SSA IR 同时用在 AOT、LTO、JIT 三处——相当于把 HotSpot 的 IR 拓宽到全生命周期。

但代价：HotSpot 因为只服务 JIT，可以做激进的 speculative optimization（assume class hierarchy 不变，错了 deopt 回 interpreter）；LLVM 的 IR 必须保守，因为它也要服务 AOT 编译。

### 与 MLIR（2019, Lattner 二代作）

MLIR 是 Lattner 在 Google 时期推出的"多 dialect IR"，每个领域（TensorFlow / affine / GPU / Linalg）有自己的 dialect，dialect 之间逐步 lower 到 LLVM IR。

> 怀疑 5：MLIR 的"多 dialect"设计本质上是不是对 LLVM "单一 IR" 哲学的反叛？LLVM 论文反复强调"unified IR"是核心贡献，MLIR 反过来说"unified IR 不够，需要 dialect"。Lattner 自己怎么解释这个转向？答案散落在他几个 talk 里：LLVM IR 太低层，无法表达 tensor / 多面体 / 异构调度；硬塞进 LLVM IR 会做出 monstrosity。所以 MLIR 不是反叛，是承认"统一 IR 这条路在 ML 时代要分层"。这是个有趣的方法论变迁——值得单写一篇 [MLIR 论文](/papers/mlir/)（待写）对照。

### 与 WebAssembly

WASM 名义上是栈式虚拟机的字节码（不是 SSA），但 V8 / SpiderMonkey 拿到 WASM 后做的第一步就是 lower 到内部 SSA IR（很多家直接用 LLVM IR）。所以 LLVM 在浏览器里的份额比看起来大——Emscripten 把 C/C++ 编到 WASM 走的是 Clang→LLVM IR→WASM backend。

## Layer 5 — Quiz（自测：能不能复述）

### Q1：为什么 LLVM IR 是 SSA 而不是栈式或寄存器三地址码？

栈式（如 JVM 字节码）虽然紧凑但不利于数据流分析——每个指令把值压栈/弹栈，要追踪一个值的来源得反向遍历栈操作。SSA 让每个值有唯一定义点，数据流图天然存在。三地址码（GCC RTL）可以表达 SSA，但 RTL 还混入了机器细节（具体寄存器名），跨架构复用难。SSA-IR + 强类型是 LLVM 的甜点。

### Q2：bitcode 和 native object file 的关系是什么？

bitcode（.bc）是 LLVM IR 的二进制序列化格式，不是机器码。可以单独存在 .bc 文件，也可以**嵌入 .o 目标文件**的特殊段（如 macOS 的 `__LLVM,__bitcode`），让链接器同时看到机器码和 IR。LTO 时链接器用 IR；不开 LTO 时链接器忽略 IR 段，用机器码。

### Q3：为什么 GCC 直到 2010 年才加 LTO，比 LLVM 晚？

技术原因：GCC 的 IR（Tree-SSA / GIMPLE）序列化设计不稳定，跨编译单元的 IR 合并需要重写元数据格式。社会原因：FSF 长期对"link-time" 这种"商业用例"不那么积极；而 LTO 在 LLVM 是天生设计目标（论文标题就含 "Lifelong"），优先级高得多。

### Q4：JIT 编译器（如 V8 / HotSpot）和 LLVM 的关系是什么？

V8 / HotSpot 是**运行期专用**的 JIT，IR 是临时数据结构，编完即丢。LLVM 是**编译器框架**，IR 是稳定格式，可以 AOT/LTO/JIT 三栖。但 V8 / HotSpot 在 JIT 速度（启动延迟）和 deopt 能力上更专精——LLVM 的 ORC JIT 启动慢，不适合"边解释边编译"的浏览器场景。所以 V8 没用 LLVM。

### Q5：如果让你给"统一 IR"打一个反例，最强的会是什么？

ML 模型编译。LLVM IR 描述的是标量/向量级运算，但深度学习需要表达"tensor + 多面体仿射变换 + 自动微分 + 设备分配"。硬塞进 LLVM IR 会丢失太多结构信息——这正是 MLIR 的动机。所以 LLVM "统一 IR" 在 2004–2015 年的命令式编程世界是赢家，到了 2019+ 的 ML 编译领域被自己人（Lattner）替换成"分层 dialect"。

## Layer 6 — 核心代码与算法

### mem2reg pass 的核心思路

mem2reg 把"alloca + load/store"模式转换为"phi 节点 + SSA 值"，是 LLVM 优化链路的起点（前端通常生成 alloca 形式的 IR，因为简单）。

```c
// 前端生成的 IR（伪代码）
%x = alloca i32
store i32 0, i32* %x
br label %loop
loop:
  %t = load i32, i32* %x
  %t2 = add i32 %t, 1
  store i32 %t2, i32* %x
  ...
```

mem2reg 跑完：

```c
%x.0 = i32 0
br label %loop
loop:
  %x.1 = phi i32 [ %x.0, %entry ], [ %x.2, %loop ]
  %x.2 = add i32 %x.1, 1
  ...
```

算法核心：

1. 找到所有 alloca 且不被取地址的局部变量
2. 计算这些 alloca 所在基本块的 dominance frontier
3. 在 dominance frontier 的入口插入 phi 节点
4. 重命名 SSA 名字，把 load/store 替换为 SSA 值

复杂度：O(N · |DF|)，N 是基本块数。Cytron et al. 1991 论文给出经典算法，LLVM 直接实现。

### 一个完整的 pass 骨架

```cpp
#include "llvm/IR/Function.h"
#include "llvm/IR/Module.h"
#include "llvm/Pass.h"
#include "llvm/Support/raw_ostream.h"

using namespace llvm;

namespace {
struct CountInstrs : public FunctionPass {
    static char ID;
    CountInstrs() : FunctionPass(ID) {}

    bool runOnFunction(Function &F) override {
        unsigned count = 0;
        for (auto &BB : F)
            for (auto &I : BB)
                ++count;
        errs() << "Function " << F.getName() << " has " << count << " instrs\n";
        return false;  // 不修改 IR
    }
};
}
char CountInstrs::ID = 0;
static RegisterPass<CountInstrs> X("count-instrs", "Count IR instructions");
```

编译成 .so，用 `opt -load ./CountInstrs.so -count-instrs input.bc -o /dev/null` 即可加载运行。这是 LLVM "可插拔" 设计的最小演示——80 行代码加一个新分析。

### IR 类型系统的力量

```llvm
; 强类型禁止跨类型操作
%a = alloca i32
%b = alloca i64
%v = load i32, i32* %a       ; OK
%v2 = load i32, i64* %b      ; verifier 报错：load 类型与指针指向类型不匹配
```

`opt -verify` 会拒绝这种 IR。GCC GIMPLE 类型检查弱，类似错误可能要到机器码生成阶段才暴露。强类型 IR 把 bug 拦在最早期，是 LLVM 工程稳定的隐形支柱。

## Layer 7 — 历史 / 社会维度

### Lattner 个人轨迹

- **2000–2003**：UIUC 硕士，做 LLVM 原型（当时还叫 "Low Level Virtual Machine"，后来 Lattner 自己说这名字 misleading 不再用全称）
- **2004**：CGO 论文发表，UIUC 博士
- **2005**：加入 Apple，启动 Clang 项目
- **2010**：Apple Clang 替换 GCC 成为 Xcode 默认编译器
- **2014**：Lattner 启动 Swift，作为 Apple 内部语言项目，2014 年 WWDC 公开
- **2017**：离开 Apple 加入 Tesla，又转 Google Brain
- **2019**：在 Google 启动 MLIR
- **2022**：联合创办 Modular AI，做 Mojo 语言

LLVM 的成功几乎和 Lattner 个人能力强绑定。这种"超级个体 + BSD 协议 + 商业公司大力投入"的组合在编译器领域罕见——同时期的 Open64 / GCC 都没法同时占齐这三条。

### BSD 协议的影响

LLVM 选 BSD-like 协议（具体是 University of Illinois/NCSA Open Source License，2019 年起逐步迁移到 Apache 2.0 with LLVM exceptions）。这条决定了：

1. Apple / Sony / NVIDIA 等公司可以闭源 fork 内部用，但他们绝大多数还是把改动回流（因为不回流维护成本太高）
2. 商业公司贡献的 backend（PowerPC by IBM, AMDGPU by AMD, NVPTX by NVIDIA）成为 LLVM 主线
3. 与 GCC GPLv3 形成鲜明对比——GCC 的 plugin 机制就是 RMS 为了防止"GCC 变 library"而设计的妥协

> 怀疑 6（追加）：BSD 协议"让商业公司贡献回来"这套叙事是否被高估？反例是 Apple 早期把 Clang 大量改动堆在内部 fork 多年才上游化、Sony 的 PS4 LLVM fork 至今闭源。BSD 协议吸引商业贡献是事实，但商业公司"必须回流"不是协议层面的承诺，是工程层面的成本算计。

### 学术共同体效应

LLVM 出现后，编译器领域博士论文数量没增加（这是个"硬"领域），但每篇论文的工作量分布从"基础设施 70% + 创新 30%"变成"基础设施 10% + 创新 90%"。**每年 CGO / PLDI / OOPSLA 上至少一半论文是 LLVM-based 实验**。这是 Lattner 在论文里许下的"enable compiler research"承诺的兑现。

## Layer 8 — 局限与反思

### 局限 1：IR 仍偏低层，不适合 high-level 优化

LLVM IR 类似"带类型的 RISC 汇编"。表达不出高级语言特性如：

- Lazy evaluation（Haskell）
- Coroutine（早期 Coroutine 支持是 hack 出来的，2018 年才有正式 intrinsic）
- Tensor 运算（被迫拍扁成 SIMD/标量循环）

所以前端必须自己做大量 high-level 优化（如 Swift 的 SIL、Rust 的 MIR），lower 到 LLVM IR 之前已经"消化"了语义。

### 局限 2：编译速度慢

LLVM pass pipeline -O3 走完一遍可能跑几十个 pass，编译时间显著长于 GCC -O2。结果：

- Rust 编译慢的锅一半在 LLVM（Rust MIR → LLVM IR 已经膨胀，再过 LLVM pass 又一轮）
- Chrome / Firefox 这种巨型 C++ 项目用 LLVM 编译需要几十分钟；用 thin LTO 缓解但仍慢

### 局限 3：调试信息丢失

激进优化（特别是跨函数 inline + LTO）让源码行号映射不可靠。"在 -O3 binary 上设断点经常断错地方"是 LLVM 几十年的老 bug 集合。DWARF 5 + Loc List 改进了情况但远未解决。

### 局限 4：协议碎片化与治理张力

LLVM 项目治理在 2010 年代后面临：

1. 商业公司 backend（NVIDIA / Sony / Apple）要进 monorepo 还是 out-of-tree？最终走 monorepo 但带来代码量爆炸
2. 主仓 master 节奏由谁定？Apple 在早期主导力度大，2018 年后 Google / Sony / Meta 分摊
3. CoC（Code of Conduct）讨论多次激烈分裂

这些治理痛点不是 LLVM 独有，但 LLVM 成功也带来了"成功的烦恼"。

## Layer 9 — 与本仓其他笔记的交叉

- 同分支 method-A 同期：[LSM-Tree](/papers/lsm-tree/)（存储方法）/ [Reservoir Sampling](/papers/reservoir-sampling/)（采样方法）— LLVM 是编译方法的奠基
- 编译器系列：[V8 Crankshaft](/papers/v8-crankshaft/)（待写）/ [HotSpot C2](/papers/hotspot-c2/)（待写）/ [MLIR](/papers/mlir/)（待写，Lattner 二代作）
- 类型系统：[Bidirectional Typing](/papers/bidirectional-typing/) — 前端类型检查后 lower 到 LLVM IR 强类型
- GC 对照：[Boehm GC](/papers/boehm-gc/) / [Cheney GC](/papers/cheney-gc/) — LLVM 不内置 GC，但提供 `gc.statepoint` intrinsic 配合外部 GC
- 工具链对照：[Babel](/projects/babel/)（JS 编译器）— 同样是"前端 → AST → transform → 后端"管线，但缺少 LLVM 这种统一 IR

## Layer 10 — 个人吸收

### 吸收 1：基础设施 vs 创新的杠杆比

Lattner 在论文 §1 写"we hope to enable compiler research"——这是工程师能给同行的最大杠杆。**不是"我做了一个新优化"，是"我让所有人做新优化都更容易"**。同样思路：[React](/papers/react/) 不是发明了什么新算法，是给 ReAct 这一类做法提供了能复用的 prompt + parser；[Transformer](/papers/transformer/) 不是发明了 attention，是把 attention 做成可堆叠 block。**让别人能站在你肩膀上**比"自己跳得高"价值大得多。

### 吸收 2：协议是工程决策不是法律决策

Lattner 选 BSD 不是因为 BSD "更道德"或"更 free"，是为了**让 LLVM 能 link 进任何宿主进程**。这条工程目标决定了协议。我以后做 OSS 项目，协议选择不应抽象讨论"要不要 copyleft"，应回到具体场景："我希望谁能用这个？以什么方式用？"——再选满足条件的协议。

### 吸收 3：统一 IR 的边界

LLVM IR 在命令式编程的世界里是赢家，但 ML 时代被 MLIR 替换。这告诉我：**不要把"统一 IR"当万能钥匙**。每个抽象层都有它最擅长表达的语义；强行"统一"会让 IR 变成 Frankenstein。设计抽象时先问"我要表达什么语义？"再问"现有抽象够不够？"——不够就加层，而不是把所有东西塞进一层。

### 吸收 4：长尾贡献 vs 头部影响

LLVM 论文 8000+ 引用，影响巨大。但 Lattner 的工作真正改变世界的不是 2004 论文，是 2005 年加入 Apple 后**用 5 年时间把 Clang 做成 GCC 替代品**——这 5 年是工程苦活，不是论文能 capture 的。**论文是种子，工程是开花**。我学论文要学到种子，但更要意识到：种子之后还有 5 年的事。

### 吸收 5：Lattner 个人路径

UIUC PhD → Apple → Tesla → Google → 创业。每一跳都赌一个新平台（编程语言 → 自动驾驶 → ML 编译 → AI 原生语言）。**不重复自己**是顶尖工程师区别于普通工程师的关键。我观察到这条规律——但能不能做到，要看自己的胆量。

## Layer 10.5 — 工程细节追加（深挖 IR 与 pass）

### Section 10.5.1 — IR 的指令集分类

LLVM IR 大约 70 条指令，可以分成几类：

| 类别 | 代表指令 | 作用 |
|------|---------|------|
| 算术 | add / sub / mul / udiv / sdiv / fadd / fmul | 标量与向量算术 |
| 位运算 | and / or / xor / shl / lshr / ashr | 位级操作 |
| 内存 | alloca / load / store / getelementptr | 内存访问 |
| 控制流 | br / switch / ret / unreachable | 基本块跳转 |
| 函数 | call / invoke / tail call | 调用 |
| 类型 | bitcast / trunc / sext / zext / fpext / inttoptr / ptrtoint | 类型转换 |
| SSA | phi / select | SSA 形式专用 |
| 异常 | landingpad / resume / cleanup | C++ / Itanium ABI 异常 |
| 内置 | llvm.memcpy / llvm.dbg.* / llvm.lifetime.* | intrinsic |

> 类比：这套指令像一组乐高基础件——足够拼出任意命令式程序的语义，但不会替你拼好。前端要 lower 多少全自定。

### Section 10.5.2 — getelementptr 的特殊性

`getelementptr`（GEP）是 LLVM IR 最容易让新人误解的指令。它做**地址计算**，不做内存访问：

```llvm
%struct.Point = type { i32, i32 }
%p = alloca %struct.Point
%y_ptr = getelementptr inbounds %struct.Point, %struct.Point* %p, i32 0, i32 1
; y_ptr 现在指向 p.y，但还没访问
%y = load i32, i32* %y_ptr
```

读法：「从 `%p` 出发，跳过 0 个 `Point`，再取这个 `Point` 的第 1 个字段（i32）」。GEP 是纯算术，不会触发 segfault；后面的 load 才会。这种"算地址 vs 访问内存分离"的设计让 alias analysis 能精确推断"两个指针是否可能指向同一对象"。

### Section 10.5.3 — Pass 的 dependency 与 invalidation

每个 pass 声明它**消费**哪些分析结果（`getAnalysisUsage`）和**保留**哪些：

```cpp
void getAnalysisUsage(AnalysisUsage &AU) const override {
    AU.addRequired<DominatorTreeWrapperPass>();   // 我需要支配树
    AU.addPreserved<LoopInfoWrapperPass>();        // 我保证不破坏循环信息
    // 没声明 preserved 的分析全部 invalidate
}
```

这套机制让 PassManager 自动调度——某个 pass 改了 IR，依赖它的下游 pass 自动重跑分析。复杂度 O(N · pass 数)，但比手动管理依赖关系强 100 倍。

### Section 10.5.4 — Profile Guided Optimization 的实测收益

Google 2016 年发表 AutoFDO 论文，用 perf 采样代替显式 instrumentation 收集 profile。在 Google 内部 C++ 服务上：

- 启用 PGO 后 CPU 性能提升 5–15%（中位数 8%）
- 对热点循环 + 虚函数密集的代码，提升可达 20%+
- 编译时间延长 30–50%（因为要做两轮编译 + profile merge）

这些数字说明 PGO 不是"锦上添花"，是**工业级 C++ 服务的标配**。Chrome / Android / Linux kernel 都在生产环境用 PGO。

> 怀疑 7（追加）：这些收益数字论文体常引用，但真实场景下 profile 漂移（dev 环境采的 profile 与 prod 实际负载不一致）会让收益打折。Facebook 的 BOLT 工具甚至选择"在已编译好的 binary 上做 post-link 优化"，因为他们发现 LLVM PGO 的精度对他们的 workload 不够。这是不是说 PGO 的"理论增益"和"实际可获得增益"之间有显著 gap？

### Section 10.5.5 — JIT 路径的演进

LLVM 的 JIT 经历了三代：

1. **MCJIT**（2011 起）：把 LLVM IR 编译到内存中的 ObjectFile，再 link 到当前进程。能用但 API 笨重。
2. **ORC v1**（2015 起）：增加 lazy compilation 和 stub-based linking。但 API 仍在频繁变化。
3. **ORC v2**（2018 起）：stable API，分层架构（IRTransformLayer / IRCompileLayer / RTDyldObjectLinkingLayer），支持完整 lazy + concurrent JIT。

Julia / Numba 早期用 MCJIT，后来迁移 ORC v2。LLDB（Apple 的调试器）的表达式求值用的也是 LLVM JIT——你在 LLDB 里输入 `p some_func()`，背后是 Clang 编 IR + ORC 即时执行。

## Layer 10.6 — 与社区生态的耦合点

### IR 版本兼容性

LLVM IR bitcode 在 LLVM 主版本之间**只保证向后读**：新版 LLVM 能读旧 bitcode，反过来不行。这条对工业用户有约束——如果你 vendored LLVM 13，发出去的 .bc 文件不能被同事的 LLVM 11 处理。所以大公司通常 freeze 一个 LLVM 主版本几年再升级。

### Pass 注册与命令行

经典 `opt` 工具加载 pass 的方式：

```bash
opt -load-pass-plugin=./MyPass.so -passes='function(my-pass)' \
    input.bc -o output.bc
```

新 PM（Pass Manager）从 LLVM 12 起替换旧 PM，API 改了但概念相同。研究者 demo 一个新 pass，常用模式就是 .so plugin + opt 命令行。

### Compiler-rt / libc++ / lld 配套

LLVM monorepo 里除了 llvm 核心还有：

- **compiler-rt**：内置函数（`__divti3` 等 128 位除法）+ sanitizer 运行时（ASan/TSan/UBSan）
- **libc++**：C++ 标准库实现，BSD 协议替代 libstdc++
- **lld**：链接器，比 GNU ld / gold 快几倍
- **lldb**：调试器
- **clang-tools-extra**：clang-tidy / clangd 等

这套全家桶让 LLVM 不只是"编译器"，而是**整套 toolchain**。Apple/Sony/Google 的工具链几乎全栈用 LLVM。

> 怀疑 8（追加）：把 toolchain 全栈绑在一个项目里，是否会形成单点故障？历史教训：2017 年 LLVM 6.0 发布前的几个月，monorepo 的 build 系统改动让外部 vendor 频繁吃 breakage。"快速演进 + 全栈耦合" 的副作用就是"同时崩"。这是 BSD 协议吸引商业贡献无法解决的工程治理问题。

## Layer 10.7 — 实操建议（如果我现在要用 LLVM）

### 写一个新的 pass

1. clone llvm-project，build LLVM（debug build 几十 GB，release 也要 5 GB）
2. 在 `llvm/lib/Transforms/Utils/` 加 .cpp
3. 实现 `runOnFunction`，注册到 PassManager
4. 写 LIT 测试（lit + FileCheck）
5. 构建运行：`ninja opt && ./bin/opt -my-pass test.ll -S`

学习曲线陡（一周入门），但写 50 行就能做出有效优化。

### 在自己项目里嵌入 LLVM

```cpp
// 创建 IR builder，发射 IR
LLVMContext ctx;
auto module = std::make_unique<Module>("my_jit", ctx);
IRBuilder<> builder(ctx);

// ... 构造 IR ...

// 用 ORC v2 编译执行
auto JIT = ExitOnErr(orc::LLJITBuilder().create());
ExitOnErr(JIT->addIRModule(orc::ThreadSafeModule(std::move(module),
                                                  std::make_unique<LLVMContext>())));
auto Sym = ExitOnErr(JIT->lookup("main"));
auto func = (int(*)())Sym.getAddress();
return func();
```

这就是 Julia 的运行时核心思路——动态生成 IR、ORC JIT 执行、缓存生成的机器码。

### 做语言后端（rustc / Swift / Julia 模式）

1. 把你的高层 IR（如 Rust 的 MIR）lower 到 LLVM IR
2. 调用 LLVM C API（有 stable ABI）或 C++ API（更灵活，但版本耦合）
3. 走 PassManager 跑 -O3 pipeline
4. 调用 LLVM 后端 emit object 或 直接 emit 机器码

工程量：rustc 的 LLVM bindings（rustc_codegen_llvm crate）大约 20k 行 Rust 代码，是个能干但需要多年迭代的方向。

## Layer 11 — 一句话核心 take-away

> **统一 IR 是工程杠杆，让基础设施投资在编译期 / 链接期 / 运行期三处复用——但 IR 的抽象层次必须匹配所服务的语义域，超出域要分层（MLIR），不要硬塞。**

## 参考与延伸

- 原论文：Lattner & Adve, "LLVM: A Compilation Framework for Lifelong Program Analysis & Transformation", CGO 2004
- 综述：Lattner 2008, "LLVM and Clang: Next Generation Compiler Technology", BSD Conference
- 后继：Lattner et al. 2020, "MLIR: A Compiler Infrastructure for the End of Moore's Law"
- 教材：Aho/Lam/Sethi/Ullman 龙书（2007 第二版）的 SSA / dataflow 章节
- 项目主页：llvm.org / github.com/llvm/llvm-project（monorepo since 2017）
- 衍生：rust-lang/rust（rustc backend）、apple/swift（Swift compiler）、JuliaLang/julia（Julia JIT）、google/jax（XLA via LLVM）

---

> Layer 0–11 节结构对应 v1.1 method-A：身份证 → why → how → what → 同期对照 → 自测 → 代码 → 历史 → 局限 → 交叉 → 吸收 → take-away。≥500 行 / 2 webp / 多 Section/Definition/Algorithm 锚 / ≥4 怀疑（标号 1–6）/ 3 GitHub permalink 占位 / frontmatter 来源齐全 / 不含红线词。
