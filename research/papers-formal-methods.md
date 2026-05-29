---
title: 论文候选 — 形式化方法 / 模型检测 / 自动定理证明
description: 50 篇候选，按 10 个子主题分组，避开现有 godel-1931 / hoare-logic / dijkstra-goto，以及 papers-compilers-pl 已收录的 compcert / cakeml / vellvm / lean / coc / fstar / agda / idris / 抽象解释通用论文 / 分离逻辑 / infer / astrée / slam，和 papers-operating-systems 已收录的 sel4-2009
日期: 2026-05-29
---

# 形式化方法 / 模型检测 / 自动定理证明主题候选

候选 50 篇，按 10 个子主题分组。覆盖 1960-2018，与 study 站既有的 godel-1931 / hoare-logic / dijkstra-goto / lambda-calculus / cook-levin / karp-21 / turing-1936 形成"逻辑奠基 → 形式化方法工程实现"的连续阅读路径。已与 papers-compilers-pl 候选池（含 calculus-of-constructions / lean / fstar / martin-lof-itt / agda / idris / cousot-abstract-interpretation / reynolds-separation-logic / astree / slam-microsoft / infer-biabduction / compcert / cakeml / vellvm / lean-tactics）和 papers-operating-systems 候选池（含 sel4-2009）交叉去重。

## 模型检测 / 时序逻辑（9 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `clarke-emerson-1981` | Design and Synthesis of Synchronization Skeletons Using Branching-Time Temporal Logic | 1981 | Clarke-Emerson 模型检测开山论文（与 Queille-Sifakis 并列）；CTL + 状态图遍历，2007 年图灵奖 | https://www.cs.cmu.edu/~emc/papers/Conference%20Papers/Design%20and%20Synthesis%20of%20Synchronization%20Skeletons%20Using%20Branching%20Time%20Temporal%20Logic.pdf |
| `pnueli-temporal-1977` | The Temporal Logic of Programs | 1977 | Pnueli 把时序逻辑引入程序验证，定义 LTL；所有后续模型检测、TLA+、liveness/safety 论文的概念入口；1996 图灵奖工作 | https://ieeexplore.ieee.org/document/4567924 |
| `mcmillan-smv-1993` | Symbolic Model Checking: 10^20 States and Beyond | 1993 | McMillan SMV 论文版（PhD 简化）；BDD 让状态空间从 10^6 跳到 10^20；NuSMV、Cadence SMV、ABC 全是其后裔 | https://www.kenmcmil.com/pubs/thesis.pdf |
| `biere-bmc-1999` | Symbolic Model Checking without BDDs | 1999 | Biere-Cimatti-Clarke-Zhu 引入 Bounded Model Checking + SAT；告别 BDD 内存爆炸，开启 SAT 求解器引领硬件 EDA 的时代 | https://www.cs.cmu.edu/~emc/papers/Conference%20Papers/Symbolic%20Model%20Checking%20without%20BDDs.pdf |
| `clarke-cegar-2003` | Counterexample-Guided Abstraction Refinement for Symbolic Model Checking | 2003 | Clarke-Grumberg-Jha-Lu-Veith 形式化 CEGAR 框架；SLAM、BLAST、CPAchecker 的核心循环 | https://dl.acm.org/doi/10.1145/876638.876643 |
| `holzmann-spin-1997` | The Model Checker SPIN | 1997 | Holzmann 把模型检测推到工业界；Promela 语言 + 显式状态搜索，NASA / Lucent 协议验证标配工具 | https://spinroot.com/spin/Doc/ieee97.pdf |
| `cimatti-nusmv-2002` | NuSMV 2: An OpenSource Tool for Symbolic Model Checking | 2002 | Cimatti-Clarke-Giunchiglia 等开源符号模型检测器；BDD + SAT 双引擎，今天 nuXmv / IC3 都基于它演化 | https://nusmv.fbk.eu/papers/cav2002.pdf |
| `lamport-tla-1994` | The Temporal Logic of Actions | 1994 | Lamport TLA 原始论文；状态机 + 时序逻辑统一为 actions，TLA+ 规范语言的形式基础 | https://lamport.azurewebsites.net/pubs/lamport-actions.pdf |
| `tla-yu-tlc-1999` | Model Checking TLA+ Specifications | 1999 | Yu-Manolios-Lamport TLC 检查器；让 TLA+ 规范可机检；AWS / Azure / MongoDB 设计审查使用的工具源头 | https://lamport.azurewebsites.net/pubs/lamport-yu-manolios-tlc.pdf |

## SAT / SMT 求解（8 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `davis-putnam-1960` | A Computing Procedure for Quantification Theory | 1960 | Davis-Putnam 一阶谓词逻辑判定算法；后续 60 年所有 SAT/SMT 引擎的祖宗 | https://dl.acm.org/doi/10.1145/321033.321034 |
| `dpll-1962` | A Machine Program for Theorem-Proving | 1962 | Davis-Logemann-Loveland 把 D-P 改成栈式回溯（DPLL）；2026 年 MiniSat / Glucose / CaDiCaL 仍是 DPLL 派生 | https://dl.acm.org/doi/10.1145/368273.368557 |
| `marques-silva-grasp-1996` | GRASP: A Search Algorithm for Propositional Satisfiability | 1996 | Marques-Silva-Sakallah 引入 conflict-driven clause learning（CDCL）；现代 SAT 求解器性能跃迁的关键一步 | https://ieeexplore.ieee.org/document/769017 |
| `chaff-2001` | Chaff: Engineering an Efficient SAT Solver | 2001 | Moskewicz-Madigan-Zhao-Zhang-Malik 把 CDCL 工程化（VSIDS、watched literals）；Princeton Chaff 把 SAT 推到 EDA 主流 | https://www.princeton.edu/~chaff/publication/DAC2001v56.pdf |
| `minisat-2003` | An Extensible SAT-solver | 2003 | Eén-Sörensson 600 行 C++ 教科书级实现；学习 CDCL 内核与 watched-literal 的最佳起点 | http://minisat.se/downloads/MiniSat.pdf |
| `nelson-oppen-1979` | Simplification by Cooperating Decision Procedures | 1979 | Nelson-Oppen 理论组合算法；多个判定程序通过等价类共享 → SMT 求解器多 theory 协作的理论支柱 | https://dl.acm.org/doi/10.1145/357073.357079 |
| `nieuwenhuis-dpll-t-2006` | Solving SAT and SAT Modulo Theories | 2006 | Nieuwenhuis-Oliveras-Tinelli 抽象 DPLL(T) 框架；现代 SMT（Z3 / CVC4 / Yices / Bitwuzla）核心架构的形式化 | https://www.cs.upc.edu/~roberto/papers/jacm06.pdf |
| `z3-2008` | Z3: An Efficient SMT Solver | 2008 | de Moura-Bjørner Microsoft Z3；今天 Dafny / F\* / Boogie / SMT-LIB 测试集 / LLM 形式化助手默认后端 | https://link.springer.com/chapter/10.1007/978-3-540-78800-3_24 |

## 交互式定理证明（4 篇，避开 lean / coq / agda / idris / fstar — 已在 PL 候选池）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `isabelle-hol-2002` | Isabelle/HOL: A Proof Assistant for Higher-Order Logic | 2002 | Nipkow-Paulson-Wenzel 教科书；Isar 结构化证明语言；seL4 / IsaBelleVM / CompCert 部分定理在 Isabelle 验证 | https://link.springer.com/book/10.1007/3-540-45949-9 |
| `acl2-2000` | ACL2: An Industrial Strength Theorem Prover for a Logic Based on Common Lisp | 2000 | Kaufmann-Manolios-Moore ACL2；AMD / Intel 浮点单元、x86 指令语义、Centaur 处理器形式化都用它 | https://www.cs.utexas.edu/~moore/publications/km97a.pdf |
| `hol-light-2009` | HOL Light: An Overview | 2009 | Harrison 用 < 500 行 OCaml 实现 LCF 风格证明助手；Flyspeck（开普勒猜想）证明、Intel 浮点验证的核心工具 | https://www.cl.cam.ac.uk/~jrh13/papers/holhol.pdf |
| `nuprl-1986` | Implementing Mathematics with the Nuprl Proof Development System | 1986 | Constable 等 Nuprl 书；最早把 Martin-Löf 类型论搬上交互证明平台，构造性数学的实操起点 | https://www.nuprl.org/book/ |

## 同伦类型论 / 一致基础（3 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `awodey-warren-2009` | Homotopy Theoretic Models of Identity Types | 2009 | Awodey-Warren 把 identity type 解读为路径空间；HoTT 的数学起源，Voevodsky 一致基础工程的理论入口 | https://arxiv.org/abs/math/0709.0248 |
| `hott-book-2013` | Homotopy Type Theory: Univalent Foundations of Mathematics | 2013 | Univalent Foundations Program 团体作品（Awodey/Coquand/Voevodsky 等）；把 ITT 与同伦论统一，Univalence 公理首次系统化 | https://homotopytypetheory.org/book/ |
| `cubical-type-theory-2018` | Cubical Type Theory: A Constructive Interpretation of the Univalence Axiom | 2018 | Cohen-Coquand-Huber-Mörtberg 把 univalence 变成可计算原语；Cubical Agda、redtt、cooltt 的核心理论 | https://arxiv.org/abs/1611.02108 |

## 演绎程序验证 / 验证基础设施（8 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `boogie-2005` | Boogie: A Modular Reusable Verifier for Object-Oriented Programs | 2005 | Barnett-Chang-DeLine-Jacobs-Leino 中间验证语言；Spec# / VCC / Dafny / Corral 全部以 Boogie 为后端 | https://www.microsoft.com/en-us/research/publication/boogie-a-modular-reusable-verifier-for-object-oriented-programs/ |
| `why3-2013` | Why3: Where Programs Meet Provers | 2013 | Filliâtre-Paskevich Why3 平台；把 WhyML 程序条件转给 Z3/Alt-Ergo/CVC4/Coq 多后端，CryptoLine / Frama-C 都用它 | https://hal.inria.fr/hal-00789533/document |
| `frama-c-2012` | Frama-C: A Software Analysis Perspective | 2012 | Cuoq-Kirchner 等 Frama-C 平台综述；ACSL 注解 + WP 演绎 + EVA 抽象解释，欧洲航空 / 核电安全软件验证主力 | https://www.normalesup.org/~kosmatov/articles/frama-c.pdf |
| `dafny-2010` | Dafny: An Automatic Program Verifier for Functional Correctness | 2010 | Leino Dafny 论文；前后置条件 + 不变式直接编译到 Boogie/Z3；Amazon AWS、ETH、Yale 教学课程主力 | https://link.springer.com/chapter/10.1007/978-3-642-17511-4_20 |
| `vcc-2009` | VCC: A Practical System for Verifying Concurrent C | 2009 | Cohen 等 Microsoft VCC；Hyper-V hypervisor 35K 行 C 代码功能正确性证明；并发 C 验证的工业里程碑 | https://www.microsoft.com/en-us/research/wp-content/uploads/2009/06/Cohen-Verifying-C-with-VCC.pdf |
| `vst-2014` | Program Logics for Certified Compilers (Verified Software Toolchain) | 2014 | Appel VST 书；Coq 里把 separation logic 和 CompCert 的 C 语义对接，下游证明可一直拉到机器码 | https://www.cs.princeton.edu/~appel/papers/program-logics.pdf |
| `stainless-2017` | Stainless Verification System | 2017 | Hamza-Voirol-Kuncak EPFL Leon/Stainless；Scala 子集 + 自动归纳 + 合成；OOPSLA 2019 System FR 形式化其逻辑核心 | https://lara.epfl.ch/~kuncak/papers/HamzaETAL19SystemFR.pdf |
| `iris-2015` | Iris: Monoids and Invariants as an Orthogonal Basis for Concurrent Reasoning | 2015 | Jung-Swasey-Sieczkowski 等 Iris 框架；高阶并发分离逻辑 + ghost state；RustBelt / λRust / 各种现代分离逻辑论文都构建在它之上 | https://iris-project.org/pdfs/2015-popl-iris1-final.pdf |

## 形式化操作系统内核（3 篇，避开 sel4-2009）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `certikos-2016` | CertiKOS: An Extensible Architecture for Building Certified Concurrent OS Kernels | 2016 | Gu-Shao-Chen 等 Yale CertiKOS；端到端 Coq 证明的并发内核（mC2），用 deep specification 分层方法论解构验证规模 | https://www.usenix.org/system/files/conference/osdi16/osdi16-gu.pdf |
| `verisoft-2008` | The Verisoft Approach to Systems Verification | 2008 | Alkassar-Hillebrand-Leinenbach-Paul 德国 Verisoft 项目；从 VAMP CPU 到 C0 编译器到 OS 内核全栈 Isabelle 证明的 10 年工程 | https://www-wjp.cs.uni-saarland.de/publikationen/AHLP08.pdf |
| `hyperkernel-2017` | Hyperkernel: Push-Button Verification of an OS Kernel | 2017 | Nelson-Sigurbjarnarson-Zhang 等 Washington Hyperkernel；用 Z3 自动验证 xv6 风格内核，无须手写 Coq 证明，内核验证 SMT 化的代表 | https://unsat.cs.washington.edu/papers/nelson-hyperkernel.pdf |

## 形式化分布式系统（4 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `ironfleet-2015` | IronFleet: Proving Practical Distributed Systems Correct | 2015 | Hawblitzel-Howell-Kapritsos-Lorch 等 Microsoft 用 Dafny 证明 Multi-Paxos + 分布式 KV，整体精化（refinement）方法论 | https://www.microsoft.com/en-us/research/wp-content/uploads/2017/01/ironfleet-cacm17.pdf |
| `verdi-2015` | Verdi: A Framework for Implementing and Formally Verifying Distributed Systems | 2015 | Wilcox-Woos 等 Coq 框架 + 网络模型 transformer；率先在 Coq 里完整证明 Raft 协议，分布式协议形式化教材范例 | https://homes.cs.washington.edu/~mernst/pubs/verify-distsys-pldi2015.pdf |
| `disel-2018` | Programming and Proving with Distributed Protocols (DiSeL) | 2018 | Sergey-Wilcox-Tatlock 把分布式协议提炼为可组合 Coq 模块；学习"如何把 Paxos / 2PC 拆成可独立证明的组件" | https://ilyasergey.net/papers/disel-popl18.pdf |
| `chapar-2016` | Chapar: Certified Causally Consistent Distributed Key-Value Stores | 2016 | Lesani-Bell-Chlipala 在 Coq 里证明因果一致性 KV；分布式存储一致性模型（CC/CC+ 等）形式化的奠基论文 | https://lambda.uta.edu/popl16/chapar.pdf |

## 抽象解释 / 数值域（4 篇，避开 cousot-abstract-interpretation 通用论文 + astree）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `cousot-halbwachs-polyhedra-1978` | Automatic Discovery of Linear Restraints Among Variables of a Program | 1978 | Cousot-Halbwachs 把"凸多面体"引入静态分析；今天 NewPolka / Apron / ELINA / Crab-LLVM 数值域核心 | https://www.di.ens.fr/~cousot/COUSOTpapers/POPL78.shtml |
| `mine-octagon-2006` | The Octagon Abstract Domain | 2006 | Miné 八边形域：±x±y≤c 形式不变式，比多面体便宜得多；Astrée / Frama-C / IKOS 默认用它 | https://www-apr.lip6.fr/~mine/publi/article-mine-HOSC06.pdf |
| `graf-saidi-1997` | Construction of Abstract State Graphs with PVS | 1997 | Graf-Saïdi 谓词抽象（predicate abstraction）；SLAM / BLAST / SatAbs / CPAchecker 都基于它做软件模型检测 | https://www-verimag.imag.fr/~graf/PAPERS/GrafSaidi97.pdf |
| `apron-2009` | APRON: A Library of Numerical Abstract Domains for Static Analysis | 2009 | Jeannet-Miné Apron 库论文；多面体 / 八边形 / 区间 / 线性等式统一接口；过去十几年抽象解释工具的事实标准库 | https://www-apr.lip6.fr/~mine/publi/jeannet-mine-cav09.pdf |

## 协议与密码学验证（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `proverif-2001` | An Efficient Cryptographic Protocol Verifier Based on Prolog Rules | 2001 | Blanchet ProVerif；Horn 子句 + Dolev-Yao 攻击者模型，TLS 1.3 / Signal / Noise / 5G AKA 等协议形式化主力 | https://prosecco.gforge.inria.fr/personal/bblanche/publications/BlanchetCSFW01.pdf |
| `tamarin-2012` | Automated Analysis of Diffie-Hellman Protocols and Advanced Security Properties | 2012 | Schmidt-Meier-Cremers-Basin Tamarin；多重集 rewriting + 等价证明，验证带 DH 群运算的协议（Signal X3DH、TLS 1.3 一并使用） | https://infsec.ethz.ch/content/dam/ethz/special-interest/infk/inst-infsec/information-security-group-dam/research/publications/pub2012/CSF12-MS.pdf |
| `easycrypt-2011` | Computer-Aided Security Proofs for the Working Cryptographer | 2011 | Barthe-Grégoire-Heraud-Béguelin EasyCrypt；游戏跳跃证明（game hopping）机器化，OAEP / Cramer-Shoup / 后量子 KEM 形式化背后的工具 | https://www.iacr.org/archive/crypto2011/68410071/68410071.pdf |
| `cryptoverif-2008` | A Computationally Sound Mechanized Prover for Security Protocols | 2008 | Blanchet CryptoVerif；区别 ProVerif 的 symbolic 模型，CryptoVerif 直接证 computational 安全性，已用于 TLS 1.3 安全分析 | https://www.di.ens.fr/~blanchet/publications/BlanchetIEEEFoundationsSecurityAnalysis08.pdf |
| `hacl-star-2017` | HACL\*: A Verified Modern Cryptographic Library | 2017 | Zinzindohoué-Bhargavan-Protzenko-Beurdouche；F\* 写 + Z3 验，C 代码进 Firefox NSS / Linux Kernel WireGuard / mozilla-tls，密码学验证最大规模工业落地 | https://eprint.iacr.org/2017/536.pdf |

## 硬件 / 微处理器形式化（2 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `kami-2017` | Kami: A Platform for High-Level Parametric Hardware Specification | 2017 | Choi-Vijayaraghavan-Sherman-Chlipala-Arvind MIT；Coq 里写参数化 RTL + 端到端编译到 Verilog；首个完整形式化的 RISC-V 流水线处理器 | https://adam.chlipala.net/papers/KamiPLDI17/KamiPLDI17.pdf |
| `vamp-verisoft-2006` | Putting It All Together: Formal Verification of the VAMP | 2006 | Beyer-Jacobi-Kröning-Leinenbach-Paul Verisoft 项目 VAMP 处理器；Isabelle/HOL 完整证明流水线 + 浮点 + cache 一致性，连接到 C0/C 编译器形式化 | https://www-wjp.cs.uni-saarland.de/publikationen/BJK+06.pdf |

---

## 备注

- 全 50 篇均有公开 PDF / DOI / 书籍页面
- 时间跨度 1960（Davis-Putnam）— 2018（DiSeL / Cubical），覆盖 10 个子主题
- 已与 study/papers/ 现有 godel-1931 / hoare-logic / dijkstra-goto / cook-levin / karp-21 / lambda-calculus / turing-1936 形式化奠基七篇交叉去重
- 已与 papers-compilers-pl 候选池去重：calculus-of-constructions / kahn-natural-semantics / cousot-abstract-interpretation / reynolds-separation-logic / compcert / cakeml / vellvm / lean-tactics / lean-prover / fstar / martin-lof-itt / agda-norell / idris-brady / liquid-types / refinement-types-1991 / infer-biabduction / astree / slam-microsoft 均不重复
- 已与 papers-operating-systems 候选池去重：sel4-2009 不重复
- 推荐阅读路径：
  - hoare-logic + 候选 boogie-2005 / why3-2013 / dafny-2010 / vcc-2009 / vst-2014 / iris-2015 → "公理化 → 工业演绎验证" 完整链
  - godel-1931 + lambda-calculus + 候选 isabelle-hol-2002 / acl2-2000 / hol-light-2009 / nuprl-1986 → "不完备性 → Curry-Howard → 交互证明助手" 50 年史
  - 候选 davis-putnam-1960 / dpll-1962 / marques-silva-grasp-1996 / chaff-2001 / minisat-2003 → SAT 求解器工程化进化树
  - 候选 nelson-oppen-1979 / nieuwenhuis-dpll-t-2006 / z3-2008 → SMT 理论组合 → 现代验证后端
  - 候选 clarke-emerson-1981 / pnueli-temporal-1977 / mcmillan-smv-1993 / biere-bmc-1999 / clarke-cegar-2003 / lamport-tla-1994 / tla-yu-tlc-1999 → 模型检测从理论到 AWS / Azure 落地
  - 候选 cousot-halbwachs-polyhedra-1978 / mine-octagon-2006 / graf-saidi-1997 / apron-2009 配合 papers-compilers-pl 的 cousot-abstract-interpretation / kildall-dataflow → 抽象解释完整数值域族
  - 候选 certikos-2016 / verisoft-2008 / hyperkernel-2017 配合 papers-operating-systems 的 sel4-2009 → 验证内核四种方法学（手写 Coq / Isabelle 全栈 / 自动 SMT / deep spec）对照
  - 候选 ironfleet-2015 / verdi-2015 / disel-2018 / chapar-2016 配合现有 paxos / raft / spanner / lamport-1978 → 分布式协议从工程实现走到机器证明
  - 候选 awodey-warren-2009 / hott-book-2013 / cubical-type-theory-2018 配合 papers-compilers-pl 的 martin-lof-itt → 类型论从 ITT 走到 Univalence 现代化
  - 候选 proverif-2001 / tamarin-2012 / easycrypt-2011 / cryptoverif-2008 / hacl-star-2017 配合现有 tls-1.3 / diffie-hellman / aes / rsa → "协议设计 + 密码原语 + 形式化验证" 三栈对照
  - 候选 kami-2017 / vamp-verisoft-2006 是少见的硬件验证入口，配合现有 ssa / llvm 看到"软件 IR 验证 → 硬件 RTL 验证" 同构思路
