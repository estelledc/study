---
title: CompCert — 每条优化都被数学证明保持语义的 C 编译器
来源: 'Xavier Leroy, "Formal Verification of a Realistic Compiler", CACM 2009'
日期: 2026-05-30
子分类: 类型与 PL 理论
分类: 编程语言
难度: 高级
provenance: pipeline-v3
---

## 是什么

CompCert 是一个**能编 C 代码、并且每一步翻译都被定理证明器机器证明过的编译器**。日常类比：像药品出厂——不光做了几千次抽检（这是普通编译器的"测试"），还有一份**数学证明**保证"这条生产线产出的每一颗药都和配方完全等效"。

普通编译器（gcc / clang）写完是测的：跑成千上万个测试用例没崩就发布。CompCert 不一样——作者 Xavier Leroy 把整个编译器写在 **Coq** 这个定理证明器里，证明了一个核心定理：**只要 CompCert 没报错，输出的汇编代码的可观察行为，必定是源 C 代码合法行为之一**。

整条编译流水有 15 个 pass，穿过 8 种中间语言（Clight、Cminor、RTL、Linear、Mach、Asm 等），每相邻两步之间都有一份单独的证明，最后链式拼起来。这是当时最大的可执行编译器机器证明工程，约 10 万行 Coq。

## 为什么重要

不理解 CompCert，下面这些事都没法解释：

- 为什么航空、铁路、医疗器械这种"代码错了会死人"的行业，敢用 C 写关键模块——他们用 CompCert 把"源代码层证明的安全性"延续到机器码
- 为什么"编译器有 bug"是个真问题——Csmith 等差分测试发现 gcc / llvm 都有 100+ 编错优化的 bug，CompCert 一个都没找到
- 为什么"我跑了几百万测试用例"不等于"我证明了正确"——形式化方法和测试是两种不同的保证强度
- 为什么 2021 年 ACM 软件系统奖会颁给一个编译器——和 Unix、TeX、Java 同级

## 核心要点

CompCert 的工程方法可以拆成 **三件事**：

1. **多语言流水线**：源 C 不直接翻译到汇编，而是依次降级穿过 8 个中间语言。类比：把一篇中文长文翻成英文，不是一次翻完，而是先改写成更简单的中文（去掉文言）、再翻成英文骨架、再润色。每一步降级都简单到可以单独证。

2. **Simulation diagram（模拟图）**：每个 pass 的证明长成"横线 = 源走一步，竖线 = 目标走一步，对角线 = 状态对应"的方框图。证明的是"源每走一步，目标能配上若干步，让两边的可观察行为始终对齐"。这是 Milner 在并发理论里发明的招数，被 Leroy 搬来证编译器。

3. **可观察行为 = 终止状态 + IO + volatile 读写**：定理只保证这些"外面看得见的"东西对齐。**不保证**执行时间、内存占用、是否泄露 side channel。这是个清晰的"信任边界"——CompCert 不是万能药。

三件事合起来，给"C 编译器"加上了一份数学诊断书。

## 实践案例

### 案例 1：一个 pass 的证明长什么样

考虑最简单的"删死代码"pass：把 `if (false) { ... }` 整段删掉。

证明思路（伪 Coq 风格）：

```coq
Theorem dce_preserves_behavior:
  forall S T, dce S = OK T ->
  forall b, behavior_of T b -> behavior_of S b.
```

读法："对任意源程序 S 和 dce 后的程序 T，如果 T 跑出了某个可观察行为 b，那 S 也能跑出同一个 b"。证明就是画一张 simulation diagram：S 走到死分支、T 直接跳过，二者的可观察行为序列重合。**整个 CompCert 是 15 张这样的图链起来**。

8 个中间语言的降级链是这样的：

```
Clight → C#minor → Cminor → CminorSel → RTL
  → LTL → LTLin → Linear → Mach → Asm
```

越往下越靠近硬件，越往上越像源 C；每一步 Coq 里都有完整的小步语义定义。

### 案例 2：CompCert 抓到了 gcc 抓不到的 bug

CompCert 在空客 A380 项目使用时，曾遇到 gcc 把同一份 C 代码编出错误结果的真实案例。CompCert 的处理是——**要么拒绝编译（说明源代码歧义）、要么编出符合标准语义的版本**。这就是形式化的价值：测试只能告诉你"今天没崩"，证明告诉你"任何输入下都不会崩"。

更系统的证据是 Csmith / Yarpgen 这种差分模糊测试工具：往 gcc / clang / icc 灌随机 C 代码，发现成百个"优化破坏语义"的 bug。同样的输入灌给 CompCert，**截至 CACM 论文发表时一个都没有**。

性能上，CompCert 生成代码大致是这样的位置：

| 编译器 | 相对运行速度 |
|---|---|
| gcc -O0 | 1.0×（基线） |
| **CompCert -O** | **2.5-3.0×** |
| gcc -O1 | 3.0-3.3× |
| gcc -O3 | 3.5-4.0× |

够用、不极致——但这是"能被完整证明"的代价。

### 案例 3：CompCert 不验证的部分

```
  preprocessor → parser → [Clight → ... → Asm] → assembler → linker
  (cpp，未验证)  (部分验证)  (整段在 Coq 里证)    (gnu as，未验证)
```

CompCert 的"信任基"包括：**Coq 证明核心、操作系统、汇编器、链接器、CompCert 自己的 OCaml 运行时**。如果你的链接器有 bug、或宏展开错了，CompCert 救不了。这个"形式化保证 ≠ 全栈保证"的边界，是这篇论文反复强调的——也是新人最容易误解的地方。

## 踩过的坑

1. **"CompCert 输出 = 没有 bug" 是误解**：定理只覆盖被 Coq 证明的中段；前端 parser、汇编器、链接器、运行时都是未验证的 trusted base，需要单独建立信任。

2. **不保证非功能属性**：执行时间、内存占用、cache 行为、side channel 一概不在定理覆盖范围。做密码学常量时间实现的人不能直接依赖 CompCert 帮你保住"恒定时间"。

3. **不是 free software**：CompCert 用非商业许可，商业使用要找 AbsInt 买授权。把它当 gcc 替代直接发布到产品里是许可证违规。

4. **C 子集有限制**：变长数组（VLA）不支持，`setjmp`/`longjmp` 不保证行为，switch 默认要 MISRA 风格写法。直接编 Linux 内核基本编不动——它是给"被编写得规整的关键软件"用的。

## 适用 vs 不适用场景

**适用**：
- 航空、铁路、医疗、核电等高保信软件（DO-178C 等认证背书）
- 想把源代码层 Coq / Frama-C / VST 证明延续到机器码的工程
- 编译器研究——CompCert 已成为"如何形式化验证一个真实工具链"的教科书

**不适用**：
- 追求极致性能的通用编译（仍输给 gcc -O3 / llvm -O3）
- 编译完整 Linux 发行版（C 子集 + 许可证都不允许）
- 验证 JIT、动态语言运行时（CompCert 是静态 AOT 编译器）
- 把它当 "更好的 gcc" 用——用错场景，工程成本会失控

## 历史小故事（可跳过）

- **1995 年**：Xavier Leroy 在法国 INRIA 主导 OCaml 项目，期间一直在思考"编译器自己怎么验证自己"
- **2003 年**：相关 PhD 工作开始，证明小型编译器从 mini-ML 到 PowerPC 的语义保持
- **2005 年**：CompCert 立项，由法国 ANR（国家研究署）和 INRIA 联合资助
- **2006 年**：PLDI 发表第一篇验证 backend 的论文（Cminor → PowerPC）
- **2009 年**：CACM 这篇综述发表，把项目讲给非证明圈听
- **2010s**：陆续验证更多 pass、加 ARM / x86 / RISC-V 多架构
- **2015 年**：AbsInt 推出商业版本，开始进入工业认证软件供应链
- **2021 年**：Leroy 团队获 ACM Software System Award，CompCert 与 Unix / TeX / Java / TCP/IP 并列入册

INRIA 这股"理论 + 实现一起做"的工程文化，从 OCaml 到 Coq 到 CompCert，是一脉相承的。

## 学到什么

1. **形式化验证 ≠ 测试的加强版**——它是另一种保证：把"对任意输入正确"从经验断言变成数学定理
2. **信任边界要画清楚**：CompCert 反复强调"哪些部分是被证明的、哪些不是"。这种诚实是工程严谨性的标志
3. **"够用 + 能证" 比 "强大但难证" 更值钱**：CompCert 的优化级别不及 gcc -O3，但因为能证明而被关键软件采纳
4. **理论可以喂工程**：simulation diagram 来自 1980 年代 Milner 的并发理论，30 年后变成航空软件的安全保障

## 延伸阅读

- 视频：[Xavier Leroy — Formal Verification of a Realistic Compiler](https://www.youtube.com/watch?v=BQu1YN3PbV4)（作者本人 OPLSS 暑校 4 小时课）
- 项目主页：[compcert.org](https://compcert.org/)（手册 + 安装 + Coq 源码索引）
- 论文 PDF：[Leroy 2009 CACM](https://xavierleroy.org/publi/compcert-CACM.pdf)（这就是本笔记的源论文）
- 后续工作：[CertiKOS（验证操作系统）](https://flint.cs.yale.edu/certikos/) —— 用 CompCert 编出来再加证 OS 内核

## 关联

- [[calculus-of-constructions]] —— Coq 的理论基础，CompCert 的所有证明都是 CIC 项
- [[hoare-logic]] —— 给"程序对不对"建立公理化框架，是程序证明的祖师爷
- [[cousot-abstract-interpretation]] —— CompCert 里的常量传播 / 区间分析等优化的理论基础
- [[reynolds-separation-logic]] —— 推理含指针的 C 程序时常用，VST + CompCert 是配套链
- [[kildall-dataflow]] —— 数据流分析的格论统一框架，CompCert 的多个优化 pass 直接基于它
- [[ssa]] —— 静态单赋值形式，CompCert 的 RTL 中间表示和 LLVM 类似都基于 SSA 思想
- [[llvm]] —— 对照组：LLVM 是工程极致优化路线，CompCert 是形式化验证路线，两条线殊途

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apron-2009]] —— Apron — 把区间/八边形/多面体塞进同一个插槽
- [[cakeml]] —— CakeML — 从源码到机器码每一步都被数学证明的 ML 编译器
- [[calculus-of-constructions]] —— Calculus of Constructions — 让程序和数学证明共用一种语言
- [[certikos-2016]] —— CertiKOS — 把整个并发内核拆成 30 多层每层都被 Coq 证过
- [[cousot-abstract-interpretation]] —— Cousot 抽象解释 — 给静态分析一套统一数学框架
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[kami-2017]] —— Kami — 在 Coq 里造硬件并自动编译到 Verilog
- [[kildall-dataflow]] —— Kildall 数据流框架 — 用一套格论统一所有全局编译优化
- [[knuth-lr-1965]] —— Knuth LR(k) — 编译器自己读懂语法的算法
- [[lalr-deremer]] —— DeRemer LALR(1) — 把 LR 表压到能用大小
- [[llvm]] —— LLVM — 模块化编译器框架
- [[pottier-merr]] —— Pottier LR(1) Reachability — 让 LR 解析器的错误消息覆盖完整
- [[reynolds-separation-logic]] —— Separation Logic — 把 Hoare 逻辑扩到带指针的程序
- [[ssa]] —— SSA — 静态单赋值形式
- [[vamp-verisoft-2006]] —— VAMP — 把一颗有流水线、乱序、浮点和 cache 的处理器从门电路证到指令集
- [[vellvm]] —— Vellvm — 在 Coq 里给 LLVM IR 写一份机器证明的语义
- [[verisoft-2008]] —— Verisoft — 把整台计算机从晶体管到邮件客户端全部用数学证完
- [[vst-2014]] —— VST — 把 C 程序的数学证明一路带到机器码

