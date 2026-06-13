---
title: "Verified Compilers: From CompCert to CertiCoq"
来源: 'https://arxiv.org/abs/2401.00019'
日期: 2026-06-13
分类: 编程语言
子分类: formal-verification
provenance: pipeline-v3
---

## 是什么

这篇综述把**形式化验证编译器**（Verified Compiler）这个领域从 CompCert 一路讲到 CertiCoq，相当于给"如何证明一个编译器不会写错代码"画了一张全景地图。

日常类比：你让厨师按菜谱做菜，厨师做完你不靠尝（这是普通测试），而是拿了一套**数学规则**逐行检查："你把盐放进了碗，不是盘——这一步操作不违反规则"。验证编译器的思路完全一样：不是跑更多测试，而是用数学证明"编译器的每一步都遵守菜谱"。

普通编译器（gcc、clang）用测试和差分 fuzz 来找 bug。验证编译器把编译器本身写成定理证明器（Coq）里的一个程序，然后证明一条核心定理：

```
对任意合法源程序 S，CompCert 输出汇编 A，
如果 A 运行后产生了某个可观察行为 b（退出码、IO、volatile 读写），
那么 S 运行也一定可能产生 b。
```

这条定理叫**语义保持定理**（semantic preservation）。"语义"就是程序的外部可见行为——编译器保证不会把"输出 42"编成"输出 43"。

## 为什么重要

不理解验证编译器，很多事说不通：

- gcc 和 clang 每年都被差分模糊测试（Csmith）发现几十到上百个"优化破坏语义"的 bug，而这些 bug 在真实产品中可能潜伏很多年
- 航空（DO-178C）、铁路（EN 50128）、医疗（IEC 62304）这些行业允许用 C 写安全关键代码的前提是：编译环节不能再引入未知错误
- CompCert 2021 年拿了 ACM Software System Award，和 Unix、TeX、Java 并列——证明"编译器可以被验证"这件事本身改变了一个领域
- CertiCoq 展示了编译器的下一步：不再验证"从 C 到汇编"，而是直接验证"从 Coq 程序到 ARM 汇编"——编译器从"工具"变成了"程序本身"

## 核心概念

### 1. 语义保持定理（Semantic Preservation）

这是所有验证编译器的核心。定义里有一个关键抽象：**可观察行为**（observable behavior）。

```
可观察行为 = {
  程序终止值,
  打印输出,
  volatile 内存读写,
  异常信号
}
```

编译器只保证这些"从程序外面能看见的东西"对齐。内部怎么算的、算多快、用多少内存——不在定理覆盖范围。

证明方法通常是 **simulation diagram**（模拟图）。

```
   S (源程序)
   |  step_S
   v
   S'

   画一条对角线连接 "S 的行为 b" 和 "A 的行为 b"。
   证明 S 走一步，A 能走若干步（或不走）保持对齐。
```

### 2. 中间语言降级链（IR Pipeline）

编译不一步到位。从 C 到 x86 汇编中间要经过很多步，每步只做一个方向的小改动：

```
Clight（语法/语义完整的高级 C）
  → Cminor（去掉复杂表达式，每个表达式只做一个操作）
  → RTL（寄存器传递语言，引入虚拟寄存器）
  → LTL（线性化后分配真实寄存器，遇到溢出才回 spill）
  → Linear（线性化内存分配）
  → Mach（机器特定 IR）
  → Asm（汇编代码）
```

为什么拆这么多步？因为"一步证一个简单的事实"比"一步证一个复杂的事实"容易得多。

### 3. Coq 中的编译器和传统编译器

传统编译器的写法（伪代码）：

```python
def compile(source_c):
    parse()        # 解析成 AST
    optimize()     # 常量折叠、死代码消除...
    lower()        # 降低到 SSA
    allocate()     # 寄存器分配
    emit_asm()     # 输出 .s 文件
```

验证编译器的写法（在 Coq 里）：

```coq
Inductive source_program := | Prog of expr.

Definition compiler (prog : source_program) : option asm_program :=
  match parse prog with
  | Ok st =>
    let st1 := simplify st in
    let st2 := optimize st1 in
    let st3 := register_allocate st2 in
    let st4 := emit_asm st3 in
    Some st4
  | Error msg => None
  end.

(* 然后要证明这个函数的语义保持定理 *)
Theorem compiler_semantic_preservation :
  forall prog, compiler prog = Some asm ->
  semantics asm = semantics prog.
```

关键区别：**传统编译器的优化逻辑是"代码"，验证编译器的优化逻辑是"证明"**。每多一个优化 pass，就要多一张 simulation diagram。

### 4. CertiCoq：编译器变成了程序

CompCert 验证的是"从 C 到汇编"这个翻译过程。CertiCoq 做了更大胆的事：**直接把 Coq 写的程序编译到 ARM 汇编**，并且整个编译过程和 ARM 指令集语义都在 Coq 里证明过。

这意味着什么？你写的 Coq 程序本身就是一条定理。编译器编译它，编译器自身也被证明过——**你得到了一个端到端的数学保证**：

```
Coq 程序 P  ⊢  True      (P 是证明 / 定理)
    │
    ▼
编译证明 CompCertiCoq P = Ok ASM
    │
    ▼
ARM 汇编 ASM 的行为 = P 的行为（被证明过）
```

这是"编译工具"和"被编译程序"合二为一的第一步。

## 代码示例

### 示例 1：CompCert 的 simulation diagram 证明片段

```coq
(* 以 "删死代码" pass 为例 *)
(* 证明：删掉不可达代码后，程序的可观察行为不变 *)

Theorem dce_semantic_preservation :
  forall prog prog',
    dead_code_elim prog = Some prog' ->
    semantics prog' <= semantics prog.
Proof.
  intros prog prog' Helim.
  (* 证明思路：
     1. 展开 semantics 的定义（小步语义的固定点）
     2. 对死代码消除函数做结构归纳
     3. 对每个被删的语句块证明它不会影响可观察行为
     4. 构造simulation关系 R 证明 prog 和 prog' 对齐
  *)
  apply semantics_monotonicity with (R := simulation_rel).
  - intros s s' Hstate HR.
    destruct Hstate.
    + (* prog 终止 → prog' 也终止，值相同 *)
      constructor.
    + (* prog 产生 IO 行为 b → prog' 也产生 b *)
      constructor.
    + (* 继续一步 *)
      constructor.
  - (* 证明 simulation_rel 满足条件 *)
    (* ... 展开 dead_code_elim 的定义，逐块验证 *)
Qed.
```

### 示例 2：CertiCoq 编译 Coq 程序到 ARM

```coq
(* 在 CertiCoq 中，你写一个普通的 Coq 函数 *)
Definition add (x y : nat) : nat :=
  Nat.add x y.

(* CertiCoq 的编译器：
   CertiCoq add : option arm_program
   输出是 ARM 指令序列，例如：

   add:
     ADD R0, R0, R1
     BX LR

   但编译器不只是输出这些——它还输出一份
   Coq 证明项，证明这些 ARM 指令的行为等价于
   Coq 的 Nat.add 定义。
*)

(* 这个证明项就是 CertiCoq 的核心价值：
   它把"代码运行结果正确"转化成了"Coq 里的一个定理项"，
   可以在 Coq 里检查、组合、传递。
*)
```

### 示例 3：CompCert 不保证的部分——信任边界

```
┌─────────────────────────────────────────────────┐
│              CompCert 证明覆盖范围                │
│                                                   │
│  Clight ─→ Cminor ─→ RTL ─→ LTL ─→ Linear ─→ Asm │
│  （在 Coq 里，语义 + 语义保持定理全覆盖）          │
│                                                   │
│  cpp 预处理  ──→  ──→  gnu as 汇编  ──→  链接器  │
│   (未验证)                 (未验证)          (未验证)│
│                                                   │
│  编译器的"信任基" = Coq 内核 + OS + 汇编器 + 链接器 │
└─────────────────────────────────────────────────┘
```

## 踩过的坑

1. **语义保持 ≠ 功能正确**：定理保证编译器没写错翻译，但不保证源程序本身没 bug。`int x = 1/0;` 在 C 里是未定义行为，CompCert 不帮你修复它
2. **性能不是证明的目标**：CompCert 的优化级别有限（主要做常量折叠、死代码消除、函数内联），比不上 gcc -O3 的激进优化。证明正确性和极致优化是两条不同路线
3. **C 子集限制**：CompCert 不支持变长数组、`setjmp`/`longjmp`、内联汇编。直接编 Linux 内核几乎不可能
4. **证明成本随代码量增长**：每个新优化 pass 都要新增一张 simulation diagram。CertiCoq 的 ARM 后端有几百条指令，每条指令对应一条语义保持引理。这是"工程上可行但极其繁重"的工作

## 适用 vs 不适用场景

**适用**：
- 安全关键软件的编译器（航空、铁路、医疗、核电）
- 需要在 Coq 证明链中把代码一直带到机器码的工程
- 编译器 / 语言设计研究——验证编译器是最好的"教科书式"参考实现
- 密码学实现中需要证明编译环节不引入 side channel 的场景

**不适用**：
- 追求极致性能的通用软件编译
- 编译不受限 C 代码（指针魔法、内联汇编、VLA 等大量使用）
- 需要 JIT 编译器的场景（CompCert 是 AOT）
- 把它当"更好的 gcc"直接用——许可证和语言子集都不允许

## 延伸阅读

- CompCert 项目主页：[compcert.org](https://compcert.org/)
- CertiCoq 项目：[certicoq.github.io](https://certicoq.github.io/)
- Xavier Leroy 的 OPLSS 暑校讲义（4 小时视频）
- [CakeML](https://www.cl.cam.ac.uk/~pes20/cakeml/) —— 验证 ML 编译器，路线类似但目标语言是 ML 而非汇编
- [VST (Verified Software Toolchain)](https://verifiedsoftwaretoolchain.github.io/) —— 把 C 程序的证明一路带到机器码，和 CompCert 配套

## 关联

- [[compcert]] —— CompCert 详细笔记，本笔记的基石
- [[cakeml]] —— CakeML：从源码到机器码每一步都被数学证明的 ML 编译器
- [[certikos-2016]] —— CertiKOS：用 CompCert + Coq 验证的操作系统内核
- [[coq-tutorial-1990s]] —— Coq 定理证明器入门
- [[vst-2014]] —— VST：把 C 程序证明带到机器码的工具链
- [[calculus-of-constructions]] —— CIC：CompCert 所有证明的理论基础
