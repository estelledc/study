---
title: CakeML — 从源码到机器码每一步都被数学证明的 ML 编译器
来源: 'Kumar, Myreen, Norrish & Owens, "CakeML: A Verified Implementation of ML", POPL 2014'
日期: 2026-05-30
分类: 编程语言
难度: 高级
---

## 是什么

CakeML 是 Standard ML 的一个能用子集，**连同它的编译器和运行时一起被数学证明过**：从你写的源码，到最终跑在 CPU 上的 x86-64 机器码，每一步翻译都有定理担保"语义没变"。日常类比：像盖一栋楼，每根钢筋焊点都让监理拿仪器测过；不是抽样，是全部。

具体讲，CakeML 项目里包含三件东西，三件都被验证：

1. **形式语义**：用 HOL4 定理证明器写下 ML 这门语言"应该怎么算"
2. **编译器**：把 ML 源码层层降级到 x86-64 机器码，每一段降级都有保语义证明
3. **运行时**：含垃圾回收器，也证明了不会破坏程序语义

最神奇的是 **bootstrapping**：编译器本身用 CakeML 写，然后被 CakeML 编译器编译，得到机器码二进制 —— 这份二进制的正确性也在证明里。

## 为什么重要

不理解 CakeML，下面这些事都没法解释：

- 为什么 CompCert（验证 C 编译器）在工业界很有名但仍被人挑刺"OCaml extraction 没证"——CakeML 就是来补这条缝的
- 为什么"我有一份证过的编译器"和"我有一份证过的编译器二进制"是两件事——bootstrapping 区分它们
- 为什么航空航天、加密协议、操作系统内核会愿意为"编译器正确性证明"付出 10 倍性能代价
- 为什么"可信基"（trusted base）是验证圈的核心词——CakeML 把它压缩到极限

## 核心要点

CakeML 的做法可以拆成 **三件事**：

1. **多步降级 + 每步保语义**：源码不是一次性翻译成机器码。中间走过好几种语言（AST → 中间表示 → 字节码 → 机器码），每一步都用 HOL4 证明：翻译前和翻译后"算出来的结果一样"。类比：跨语言翻译时每段都让翻译过双语的人复核。

2. **proof-producing synthesis**：编译器最早是写在 HOL4 里的纯函数。要让它能跑，得先变成可执行代码 —— 用一个工具自动把 HOL 函数翻译成 CakeML 程序，**翻译过程同时输出"两者等价"的证明**。这样合成出来的 CakeML 编译器，本身就带证书。

3. **bootstrapping 闭环**：合成出来的 CakeML 编译器是源码；用 CakeML 编译器自己编译它，得到 x86-64 机器码；这份机器码的语义已经被链式证明覆盖。从此可信基里**不再有 OCaml**，只剩 HOL4 内核 + 硬件模型。

## 实践案例

### 案例 1：一行表达式怎么走完全程

源码：

```ml
val x = 1 + 2
```

编译器内部大致经过：

```
源码 AST  →  ModLang（去模块）  →  ConLang（去模式匹配）
        →  DecLang  →  ExhLang  →  PatLang
        →  ClosLang  →  BVL  →  DataLang  →  WordLang
        →  StackLang  →  LabLang  →  x86-64 机器码
```

**每一段箭头**都对应一段 HOL4 证明，结论是"翻译前后这段表达式算出来的值一样"。最后一段从 LabLang 到 x86-64，连接到机器码语义模型，整个链条由此打通。

### 案例 2：bootstrapping 是怎么发生的

```
HOL4 里写出编译器函数 compile : ast → machine_code (作为数学对象)
       │
       │ proof-producing synthesis
       ▼
CakeML 程序 compile.cml （带"和上面那个 HOL 函数等价"的证书）
       │
       │ 用第 1 版编译器（已经验证）编译它
       ▼
x86-64 机器码二进制 compile.exe
```

最后这份 `compile.exe` 拿来再编译它自己，得到第二份机器码 —— 两次输出一致是 sanity check，但**正确性已经在证明链里**。从此你信 `compile.exe` 不是因为它跑过测试，是因为它带证书。

### 案例 3：和 CompCert 对照

```
CompCert：  Coq 证明 → OCaml extraction → 二进制
                              ↑
                              这一步不在证明里

CakeML：    HOL4 证明 → CakeML synthesis → 自举编译 → 二进制
                                                       ↑
                                                       证明覆盖到这里
```

CompCert 工业落地早、性能好，但 extraction 是漏洞；CakeML 性能差一截，但把链补全。两条路线互补，不是替代。

## 踩过的坑

1. **性能不是卖点**：CakeML 产物比 MLton / OCaml 慢一截 —— 大量传统优化（inline、循环展开）每加一个就要重新写证明，工程上太贵。

2. **可信基不是零**：仍然信 HOL4 内核（几千行 ML，社区审过几十年）、x86-64 硬件语义模型、操作系统加载器/链接器。证明只覆盖编译器本身。

3. **子集不是全集**：完整 Standard ML 的某些特性（generative functor、复杂模块系统、若干 IO 语义）被简化或省略。论文里写"实用子集"，工程上够用，但不能直接拿 SML 标准库往里灌。

4. **IO 用预言机建模**：外部世界（系统调用、文件、终端）用 oracle 抽象 —— 输入输出序列是事实，IO 行为的正确性条件依赖这个模型。不证明操作系统对不对，只证明编译器对外部世界的"假设"成立时程序行为符合源码语义。

## 适用 vs 不适用场景

**适用**：

- 高保证场景的 ML / 函数式代码（航空、加密协议、操作系统验证组件）
- 想从顶到底压缩可信基的研究项目（CakeML 后端被 seL4 之外的多个验证项目用）
- 教学：想让学生看见"端到端验证编译器长什么样"
- 后续衍生项目（Pancake、CakeML for Dafny、Verified Cogent 等）的目标后端

**不适用**：

- 性能优先的生产 ML 编译（用 MLton / OCaml / SML/NJ）
- 需要完整 SML 标准、完整模块系统、完整 IO（CakeML 是子集）
- 不熟 HOL4 的团队 —— 改一句优化要补几页证明
- 不允许信 HOL4 内核 + 硬件模型的极端可信基项目（那要走 Coq + bedrock 等更激进的路线）

## 历史小故事（可跳过）

- **1989 年**：Milner 和团队发表 Definition of Standard ML，把 ML 语义写在纸上 —— 但只是数学符号，没机器证明
- **2006 年**：Leroy 在 Coq 里做 CompCert，验证 C 编译器到汇编 —— 漂亮，但 OCaml extraction 那一步不在证明里
- **2008 年起**：Myreen 在 HOL4 造 decompilation-into-logic 工具 —— 能把机器码反编到 HOL 命题，为后来的端到端验证打地基
- **2012 年前后**：Owens、Kumar 把 ML 语义在 HOL4 里写定，编译器从中间语言开始一段段加证明
- **2014 年**：POPL 论文集大成 —— 端到端 + bootstrapping 一并完成，CakeML 1.0 发布
- **2016 年起**：重写成 new CakeML compiler，加入 ARM / MIPS / RISC-V 后端，被 Pancake、Verified Dafny Backend 等项目当目标

## 学到什么

1. **"证明过的编译器"和"证明过的编译器二进制"是两件事** —— bootstrapping 把后者拉进可信基里
2. **可信基是个连续光谱** —— 你信什么、不信什么、为什么这条线划在这里，每一个项目都要自己回答
3. **多步降级 + 每步保语义**是可扩展的验证模式 —— 不要一次跨太大，每一段都小到能证
4. **性能 vs 保证**永远在博弈 —— CakeML 选了保证那一端，CompCert 选了"够用"那一段，两条路都对

## 延伸阅读

- 项目主页：[cakeml.org](https://cakeml.org/)（含论文列表、源码、tutorials）
- 论文 PDF：[Kumar et al. POPL 2014](https://www.cl.cam.ac.uk/~scd/popl14.pdf)（密度高，先看摘要 + 第 1 节即可）
- 视频：[Magnus Myreen — Verified Compilers in HOL4](https://www.youtube.com/results?search_query=cakeml+myreen)（多场会议演讲，从动机讲起）
- [[compcert]] —— CakeML 的姊妹项目，验证 C 编译器，路径不同
- [[standard-ml]] —— CakeML 的源语言基础
- [[hoare-logic]] —— 验证编译器证明里的核心推理工具

## 关联

- [[compcert]] —— 都是验证编译器，CompCert 验 C 用 Coq；CakeML 验 ML 用 HOL4 + 自举
- [[standard-ml]] —— CakeML 实现的是 SML 的实用子集
- [[hindley-milner]] —— ML 类型推导的核心算法，CakeML 类型检查器是它的工业实现
- [[hoare-logic]] —— 程序正确性证明的语言，验证编译器的工程化推理基础
- [[lambda-calculus]] —— ML 语义的最底层数学骨架
- [[plotkin-sos]] —— 小步操作语义，CakeML 多份语义中的一种风格
- [[ssa]] —— 现代编译器中间表示，CakeML 自己设计了多套 IR

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[hacl-star-2017]] —— HACL* — 用数学证明过的 C 加密代码，跑在你 Firefox 和 Linux 内核里
- [[idris-brady]] —— Idris — 让依赖类型从证明助理变成通用编程语言
- [[isabelle-hol-2002]] —— Isabelle/HOL — 让程序证明像写数学论文一样可读
- [[knuth-lr-1965]] —— Knuth LR(k) — 编译器自己读懂语法的算法
- [[lalr-deremer]] —— DeRemer LALR(1) — 把 LR 表压到能用大小
- [[netkat-2014]] —— NetKAT 2014 — 把网络转发写成可以做数学等式变换的代数式
- [[sel4-2009]] —— seL4 — 第一个被数学证明"代码和规范完全一致"的操作系统内核
- [[slam-microsoft]] —— SLAM — 让 Windows 驱动 bug 自己撞到工具上
- [[vamp-verisoft-2006]] —— VAMP — 把一颗有流水线、乱序、浮点和 cache 的处理器从门电路证到指令集
- [[verisoft-2008]] —— Verisoft — 把整台计算机从门电路到邮件客户端全部用数学证完
- [[vst-2014]] —— VST — 把 C 程序的数学证明一路带到机器码
