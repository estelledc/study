---
title: 论文全景索引
description: 920 篇论文 · 按一级主题与子分类 · 自动从 frontmatter 生成
sidebar:
  order: 5
  label: 论文全景索引
---

> 本页由 `scripts/regen-atlas.mjs` 自动生成（每次 build 前重跑）。
> 分类 SSOT：`data/taxonomy.json` + 各笔记 frontmatter `分类` / `子分类`。批量更新：`node scripts/classify-notes.mjs --apply`

## 总览

- **总数**：920 篇
- **已分类**：920

### 按一级主题分布

| 主题 | 数量 |
|---|---:|
| [编程语言](#编程语言) | 109 |
| [分布式系统](#分布式系统) | 75 |
| [数据库](#数据库) | 67 |
| [操作系统](#操作系统) | 59 |
| [机器学习](#机器学习) | 215 |
| [后端 API](#后端-api) | 9 |
| [基础设施](#基础设施) | 12 |
| [网络协议](#网络协议) | 66 |
| [图形学](#图形学) | 122 |
| [形式化方法](#形式化方法) | 51 |
| [通信](#通信) | 1 |
| [信息检索](#信息检索) | 52 |
| [Agent](#agent) | 22 |
| [CLI](#cli) | 1 |
| [NLP](#nlp) | 9 |
| [编译器](#编译器) | 3 |
| [数据可视化](#数据可视化) | 4 |
| [安全与隐私](#安全与隐私) | 30 |
| [其他](#其他) | 13 |

---

## 编程语言

共 109 篇。

### 编程语言

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Adapton — 增量计算](/study/papers/adapton/) | ✅ v3 |  |
| [ALGOL 60 — BNF 与块结构](/study/papers/algol-60/) | 🗄 存量 |  |
| [双向类型检查 — 推断和检查两个方向交替前进](/study/papers/bidirectional-typing/) | ✅ v3 |  |
| [DSPy — 把 prompt 写成签名，让编译器替你调](/study/papers/dspy/) | ✅ v3 |  |
| [代数效应（Algebraic Effects）](/study/papers/effect-handlers/) | ✅ v3 |  |
| [Generational GC — 把全堆扫描换成"频繁扫小区，偶尔扫整堆"](/study/papers/generational-gc/) | ✅ v3 |  |
| [Hindley-Milner — 编译器自己猜变量类型](/study/papers/hindley-milner/) | 🗄 存量 |  |
| [McCarthy LISP 1960](/study/papers/mccarthy-lisp/) | ✅ v3 |  |
| [Push-Pull FRP — Functional Reactive Programming 实用化](/study/papers/push-pull-frp/) | ✅ v3 |  |
| [Salsa / Adapton — 让程序只重算"真的变了"的那一小块](/study/papers/salsa-adapton/) | ✅ v3 |  |
| [Self-Adjusting Computation — 输入小幅变化时只重算受影响的那部分](/study/papers/self-adjusting/) | ✅ v3 |  |
| [SIMULA 67 — 面向对象的诞生](/study/papers/simula-67/) | 🗄 存量 |  |
| [Smalltalk-80](/study/papers/smalltalk-80/) | ✅ v3 |  |
| [Standard ML — 让编译器替你把类型补完](/study/papers/standard-ml/) | ✅ v3 |  |
| [Tofte-Talpin Regions — 让类型系统替你管内存生命周期](/study/papers/tofte-talpin-regions/) | ✅ v3 |  |
| [Trees that Grow — 可扩展的语法树设计](/study/papers/trees-that-grow/) | ✅ v3 |  |
| [Wadler Prettier — 函数式优雅打印器](/study/papers/wadler-prettier/) | ✅ v3 |  |
| [ZGC — 让 GC 停顿与堆大小解耦的低延迟回收器](/study/papers/zgc/) | ✅ v3 |  |

### 计算理论

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Cook-Levin 定理 — NP-完全性的诞生](/study/papers/cook-levin/) | ✅ v3 |  |
| [Karp 21 — 21 个 NP-完全问题](/study/papers/karp-21/) | ✅ v3 |  |
| [Turing 1936 可计算性](/study/papers/turing-1936/) | ✅ v3 |  |

### 类型与 PL 理论

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Agda — 让你写代码的同时把数学也证明了](/study/papers/agda-norell/) | ✅ v3 |  |
| [Andersen 指针分析 — 让编译器自己算出 p 可能指向谁](/study/papers/andersen-pointer-analysis/) | ✅ v3 |  |
| [ASTRÉE 分析器 — 让飞机控制代码的静态分析做到零警告](/study/papers/astree/) | ✅ v3 |  |
| [CakeML — 从源码到机器码每一步都被数学证明的 ML 编译器](/study/papers/cakeml/) | ✅ v3 |  |
| [Calculus of Constructions — 让程序和数学证明共用一种语言](/study/papers/calculus-of-constructions/) | ✅ v3 |  |
| [Call-by-Need Lambda Calculus — 给惰性求值一套真正的演算](/study/papers/call-by-need-1995/) | ✅ v3 |  |
| [Chaitin 图染色寄存器分配 — 把硬件资源问题翻译成数学问题](/study/papers/chaitin-graph-coloring/) | ✅ v3 |  |
| [Coeffects — 让类型系统追踪「需要多少上下文」](/study/papers/coeffect-petricek/) | ✅ v3 |  |
| [CompCert — 每条优化都被数学证明保持语义的 C 编译器](/study/papers/compcert/) | ✅ v3 |  |
| [Cousot 抽象解释 — 给静态分析一套统一数学框架](/study/papers/cousot-abstract-interpretation/) | ✅ v3 |  |
| [CSP — 进程之间只许喊话不许共用内存](/study/papers/csp-hoare-1978/) | ✅ v3 |  |
| [DDlog (Differential Datalog) — 输入只改一条，引擎只算受影响的那一小块](/study/papers/differential-datalog/) | ✅ v3 |  |
| [Doligez-Leroy GC — OCaml 多线程并发垃圾回收](/study/papers/doligez-leroy-concurrent-gc/) | ✅ v3 |  |
| [Earley Parser — 一个表能解析任何 CFG 的通用解析器](/study/papers/earley-parser/) | ✅ v3 |  |
| [Feautrier 多面体调度 — 把循环并行化变成解几何方程](/study/papers/feautrier-polyhedral/) | ✅ v3 |  |
| [Frank — 让 effect handler 写得就像普通函数](/study/papers/frank-effects/) | ✅ v3 |  |
| [F* — 把依赖类型、SMT 自动化、副作用追踪揉到一门语言里](/study/papers/fstar/) | ✅ v3 |  |
| [G1 Garbage-First — 给暂停时间设个预算的垃圾回收器](/study/papers/g1-collector/) | ✅ v3 |  |
| [GADT — 让构造子告诉编译器"我返回的是更精确的类型"](/study/papers/gadt-pjones/) | ✅ v3 |  |
| [博弈论语义与 PCF — 把程序解释成两个人轮流下的对话棋](/study/papers/game-semantics-pcf/) | ✅ v3 |  |
| [GraalVM Truffle — 写一棵会自我特化的语法树就能自动得到 JIT](/study/papers/graalvm-truffle/) | ✅ v3 |  |
| [渐进类型 — 让动态和静态类型在同一份代码里共存](/study/papers/gradual-typing/) | ✅ v3 |  |
| [Granule — 让类型系统同时数次数、看安全级、追副作用](/study/papers/granule/) | ✅ v3 |  |
| [Halide — 把"算什么"和"怎么算"分开写](/study/papers/halide/) | ✅ v3 |  |
| [Helium — 让类型错误说人话的教学版 Haskell](/study/papers/helium-type-errors/) | ✅ v3 |  |
| [Herlihy-Moss 事务内存 — 把数据库事务搬进 CPU](/study/papers/herlihy-moss-tm/) | ✅ v3 |  |
| [Hewitt Actor 模型 — 把计算拆成一群只会发消息的小邮筒](/study/papers/hewitt-actor-model/) | ✅ v3 |  |
| [HotSpot Server Compiler — JVM 在运行时把热点 Java 代码翻译成飞快的本地码](/study/papers/hotspot-server-compiler/) | ✅ v3 |  |
| [Why FP Matters — 函数式真正赢在能拆能粘](/study/papers/hughes-fp-matters/) | ✅ v3 |  |
| [Idris — 让依赖类型从证明助理变成通用编程语言](/study/papers/idris-brady/) | ✅ v3 |  |
| [Immix — 把"扫"和"搬"两种垃圾回收揉成一个](/study/papers/immix-mark-region/) | ✅ v3 |  |
| [Bi-Abduction — 让静态分析自动猜出函数缺什么前提](/study/papers/infer-biabduction/) | ✅ v3 |  |
| [Kahn 自然语义 — 用一棵推理树说清楚程序求值](/study/papers/kahn-natural-semantics/) | ✅ v3 |  |
| [Kildall 数据流框架 — 用一套格论统一所有全局编译优化](/study/papers/kildall-dataflow/) | ✅ v3 |  |
| [Knuth LR(k) — 编译器自己读懂语法的算法](/study/papers/knuth-lr-1965/) | ✅ v3 |  |
| [DeRemer LALR(1) — 把 LR 表压到能用大小](/study/papers/lalr-deremer/) | ✅ v3 |  |
| [Landin SECD — 第一台机械求值 lambda 表达式的抽象机器](/study/papers/landin-secd/) | ✅ v3 |  |
| [Lean 4 — 用 Lean 重写的 Lean，让数学家和程序员共用一种语言](/study/papers/lean-prover/) | ✅ v3 |  |
| [Lean Tactics — 让证明助手把"写证明"当成写程序](/study/papers/lean-tactics/) | ✅ v3 |  |
| [Lerner 组合数据流 — 让小优化互相喂招](/study/papers/lerner-seminal/) | ✅ v3 |  |
| [Lieberman-Hewitt 1983 — 把对象寿命统计偏斜兑换成有界停顿](/study/papers/lieberman-realtime-gc/) | ✅ v3 |  |
| [Linear Scan 寄存器分配 — 把图染色换成单趟扫描，给 JIT 用](/study/papers/linear-scan-reg-alloc/) | ✅ v3 |  |
| [线性类型（Linear Types）](/study/papers/linear-types/) | ✅ v3 |  |
| [Liquid Types — 让编译器自己推导出"哪些值才合法"](/study/papers/liquid-types/) | ✅ v3 |  |
| [Local Type Inference — 编译器只看相邻节点也能推出类型](/study/papers/local-type-inference/) | ✅ v3 |  |
| [Martin-Löf 直觉主义类型论 — 让"证明"和"程序"变成同一件事](/study/papers/martin-lof-itt/) | ✅ v3 |  |
| [MetaML — 让你显式地写"先生成代码、再跑代码"](/study/papers/metaml-multi-stage/) | ✅ v3 |  |
| [π-演算 — 让通道名本身能在通道里流动](/study/papers/milner-pi-calculus/) | ✅ v3 |  |
| [MLIR — 给编译器一套乐高，每层抽象都能搭自己的方言](/study/papers/mlir/) | ✅ v3 |  |
| [Mycroft 严格性分析 — 编译器替你判定哪些参数能"先算"](/study/papers/mycroft-strictness/) | ✅ v3 |  |
| [Jones-Gomard-Sestoft 1993 — Partial Evaluation 与自动程序生成](/study/papers/partial-evaluation-jones/) | ✅ v3 |  |
| [PEG / Packrat — 用'有序选择'+'记忆化'写线性时间解析器](/study/papers/peg-packrat-ford/) | ✅ v3 |  |
| [Peyton Jones STG — 让 Haskell 的 lazy 在普通 CPU 上跑得快](/study/papers/peyton-jones-stg/) | ✅ v3 |  |
| [Plotkin SOS — 用规则讲清楚程序"走一步"是什么](/study/papers/plotkin-sos/) | ✅ v3 |  |
| [Pottier LR(1) Reachability — 让 LR 解析器的错误消息覆盖完整](/study/papers/pottier-merr/) | ✅ v3 |  |
| [Prolog 的诞生 — 让逻辑式子直接当程序跑](/study/papers/prolog-colmerauer/) | ✅ v3 |  |
| [PyPy meta-tracing JIT — 给解释器加一次 JIT，所有用它的语言一起加速](/study/papers/pypy-tracing-jit/) | ✅ v3 |  |
| [Refinement Types for ML — 让程序员告诉编译器"哪些子集才合法"](/study/papers/refinement-types-1991/) | ✅ v3 |  |
| [Reps-Horwitz-Sagiv IFDS — 把跨过程分析变成图上找路](/study/papers/reps-ifds/) | ✅ v3 |  |
| [Reynolds Definitional Interpreters — 用一种语言去定义另一种语言](/study/papers/reynolds-definitional-interpreters/) | ✅ v3 |  |
| [Separation Logic — 把 Hoare 逻辑扩到带指针的程序](/study/papers/reynolds-separation-logic/) | ✅ v3 |  |
| [Row Polymorphism — 让记录类型可扩展又不丢类型安全](/study/papers/row-polymorphism-remy/) | ✅ v3 |  |
| [Sagiv 参数化形状分析 — 用三值逻辑证明链表树仍是链表树](/study/papers/sagiv-shape-analysis/) | ✅ v3 |  |
| [Scala Macros — 让 Scala 在编译期把方法调用替换成任意代码](/study/papers/scala-macros/) | ✅ v3 |  |
| [Scott-Strachey 指称语义 — 给程序找一个独立于实现的数学含义](/study/papers/scott-strachey-denotational/) | ✅ v3 |  |
| [SELF Customization — 给每种"调用者类型"现场打一份方法](/study/papers/self-customization/) | ✅ v3 |  |
| [SLAM — 让 Windows 驱动 bug 自己撞到工具上](/study/papers/slam-microsoft/) | ✅ v3 |  |
| [Soufflé — 把 Datalog 编译成 C++ 让程序分析跑得动](/study/papers/souffle-datalog/) | ✅ v3 |  |
| [Steensgaard 指针分析 — 用等价合并把指针分析压到几乎线性](/study/papers/steensgaard-pointer/) | ✅ v3 |  |
| [STM Shavit-Touitou — 把"加锁"改成"事务"的源头](/study/papers/stm-shavit-touitou/) | ✅ v3 |  |
| [Strongtalk — 可以装可以卸的 Smalltalk 类型系统](/study/papers/strongtalk/) | ✅ v3 |  |
| [System F — 让类型也能像参数一样被传递](/study/papers/system-f-reynolds-1974/) | ✅ v3 |  |
| [Template Haskell — 让 Haskell 在编译期把代码当数据玩](/study/papers/template-haskell/) | ✅ v3 |  |
| [Theorems for Free — 类型签名直接给定理](/study/papers/theorems-for-free/) | ✅ v3 |  |
| [Tomita GLR — 让 LR 解析器扛得住歧义文法](/study/papers/tomita-glr/) | ✅ v3 |  |
| [TraceMonkey — 只编"真的走过的那一条路"](/study/papers/tracemonkey/) | ✅ v3 |  |
| [Triton — 让 Python 程序员也能写出贴近 cuBLAS 的 GPU kernel](/study/papers/triton-llm/) | ✅ v3 |  |
| [Turchin Supercompilation — 让编译器把程序模拟一遍再写回去](/study/papers/turchin-supercompilation/) | ✅ v3 |  |
| [TVM — 让一份模型能在所有硬件上跑得快](/study/papers/tvm/) | ✅ v3 |  |
| [Vellvm — 在 Coq 里给 LLVM IR 写一份机器证明的语义](/study/papers/vellvm/) | ✅ v3 |  |
| [WAM — 让 Prolog 跑得像编译型语言的抽象机器](/study/papers/wam-warren/) | ✅ v3 |  |
| [XLA — 给 TensorFlow / JAX 装一台真正的张量编译器](/study/papers/xla-compiler/) | ✅ v3 |  |

### 其他子类

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Compiler Error Messages — 让编译报错有用](/study/papers/compiler-errors/) | ✅ v3 |  |
| [Dijkstra 最短路径 — 一杯咖啡时间想出来的贪心算法](/study/papers/dijkstra-shortest-path/) | ✅ v3 |  |
| [Erlang OTP — 容错并发系统设计](/study/papers/erlang-otp/) | ✅ v3 |  |
| [Hoare Logic — 把"程序对不对"变成"数学证明对不对"](/study/papers/hoare-logic/) | 🗄 存量 |  |
| [Knuth TAOCP — 计算机程序设计艺术](/study/papers/knuth-taocp/) | ✅ v3 |  |
| [λ-演算 — 用三条规则表达所有可计算函数](/study/papers/lambda-calculus/) | 🗄 存量 |  |

## 分布式系统

共 75 篇。

### 分布式系统

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Borg — Google 把一万台机器假装成一台](/study/papers/borg/) | ✅ v3 |  |
| [Chubby — 给凡人用的分布式锁服务](/study/papers/chubby/) | ✅ v3 |  |
| [CRDT JSON — 协同编辑 JSON 数据结构](/study/papers/crdt-json/) | ✅ v3 |  |
| [Dynamo — 让购物车永远能写入的分布式存储](/study/papers/dynamo/) | ✅ v3 |  |
| [GFS — 编译器决定不做哪些事](/study/papers/gfs/) | ✅ v3 |  |
| [MapReduce — 用户只写两个函数，框架替你扛千节点](/study/papers/mapreduce/) | ✅ v3 |  |
| [Paxos — 分布式共识算法](/study/papers/paxos/) | ✅ v3 |  |
| [Raft — 易理解的共识算法](/study/papers/raft/) | 🗄 存量 |  |

### 共识与复制

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Akamai 2002 — 把网站搬到离用户 10 毫秒的地方](/study/papers/akamai-2002/) | ✅ v3 |  |
| [Apollo — 让两万台机器自己决定谁跑哪个任务](/study/papers/apollo-2014/) | ✅ v3 |  |
| [Bayou — 离线先改本地，再回来和别人合并](/study/papers/bayou-1995/) | ✅ v3 |  |
| [Borg / Omega / Kubernetes — Google 调度器三代同源](/study/papers/borg-omega-kube-2016/) | ✅ v3 |  |
| [拜占庭将军问题 — 节点能撒谎时怎么达成一致](/study/papers/byzantine-generals-1982/) | ✅ v3 |  |
| [CAP 十二年后 — Brewer 自己承认"三选二"是误读](/study/papers/cap-12-years-later-2012/) | ✅ v3 |  |
| [Chain Replication — 把多副本排成流水线，简单且强一致](/study/papers/chain-replication-2004/) | ✅ v3 |  |
| [Chandy-Lamport 1985 — 分布式系统不停机也能拍一张全家福](/study/papers/chandy-lamport-1985/) | ✅ v3 |  |
| [Consistent Hashing — 加机器只搬一小部分数据的哈希环](/study/papers/consistent-hashing-1997/) | ✅ v3 |  |
| [COPS — 大规模跨地域存储如何用得起的代价拿到因果一致](/study/papers/cops-2011/) | ✅ v3 |  |
| [CRAQ — 让链复制每个节点都能读，吞吐线性扩展](/study/papers/craq-2009/) | ✅ v3 |  |
| [CRDT JSON 2017 — 给嵌套 JSON 一套有数学证明的合并算法](/study/papers/crdt-json-2017/) | ✅ v3 |  |
| [CRDT — 让多副本各改各的，最终自动合一](/study/papers/crdt-shapiro-2011/) | ✅ v3 |  |
| [CRDT 形式定义 — SSS 2011 八页浓缩版](/study/papers/crdt-sss-2011/) | ✅ v3 |  |
| [Dapper — Google 大规模分布式系统链路追踪基础设施](/study/papers/dapper-2010/) | ✅ v3 |  |
| [Drizzle — 让 micro-batch 也能跑出 100ms 延迟](/study/papers/drizzle-2017/) | ✅ v3 |  |
| [EPaxos — 没有 leader 的 Paxos，让每个副本平起平坐](/study/papers/epaxos-2013/) | ✅ v3 |  |
| [f4 — Facebook 把 90 天前的旧图片搬到一个省 40% 存储的仓库](/study/papers/f4-2014/) | ✅ v3 |  |
| [Fast Paxos — 给 Paxos 加一条乐观快车道](/study/papers/fast-paxos-2006/) | ✅ v3 |  |
| [Fidge 1988 — 给每个进程一份"账本向量"，让因果关系变成可判定](/study/papers/fidge-1988/) | ✅ v3 |  |
| [Flexible Paxos — 两阶段不一定都要多数派](/study/papers/flexible-paxos-2016/) | ✅ v3 |  |
| [Flink 异步快照 — 不停机给流处理拍一致照片](/study/papers/flink-snapshots-2015/) | ✅ v3 |  |
| [FLP 1985 — 一个坏节点就能让异步共识永不终止](/study/papers/flp-1985/) | ✅ v3 |  |
| [Gilbert-Lynch 2002 — 把 CAP 从口号写成数学定理](/study/papers/gilbert-lynch-2002/) | ✅ v3 |  |
| [Gray 1978 — 数据库操作系统讲义，事务/2PL/2PC/恢复一次讲完](/study/papers/gray-1978-notes/) | 🗄 存量 |  |
| [Life Beyond Distributed Transactions — 大规模系统下放弃跨机事务的宣言](/study/papers/helland-2007/) | ✅ v3 |  |
| [HLC 2014 — 把逻辑时钟和物理时钟合一，让普通服务器也能拍一致快照](/study/papers/hlc-2014/) | ✅ v3 |  |
| [HotStuff — 让换领导也只花线性消息的 BFT 共识](/study/papers/hotstuff-2019/) | ✅ v3 |  |
| [Janus 2016 — 把并发控制和共识捏成一个协议](/study/papers/janus-2016/) | ✅ v3 |  |
| [Jupiter — 把 OT 简化成 client-server，让协同编辑能上工业](/study/papers/jupiter-1995/) | ✅ v3 |  |
| [Linearizability 1990 — 让并发对象看起来像一次只执行一个操作](/study/papers/linearizability-1990/) | ✅ v3 |  |
| [Logoot — 给每个字符发一张"永不过期的座位号"](/study/papers/logoot-2010/) | ✅ v3 |  |
| [Mattern 1989 — 虚拟时间与全局状态：把分布式时钟变成 N 维笛卡尔积](/study/papers/mattern-1989/) | ✅ v3 |  |
| [Megastore — 把数据切成"小数据库"换跨地域同步复制](/study/papers/megastore-2011/) | ✅ v3 |  |
| [Scaling Memcache at Facebook — 万台缓存怎么不被踩塌](/study/papers/memcached-fb-2013/) | ✅ v3 |  |
| [Mencius — 让多台服务器轮流当 Paxos 的 leader](/study/papers/mencius-2008/) | ✅ v3 |  |
| [Naiad — 一套引擎同时跑批处理、流处理和迭代计算](/study/papers/naiad-2013/) | ✅ v3 |  |
| [Narwhal & Tusk — 把 BFT 共识拆成『谁说过』和『谁先说』两件事](/study/papers/narwhal-tusk-2022/) | ✅ v3 |  |
| [NTP 1991 — 用四个时间戳和一组滤波器，让全网服务器的钟差几毫秒](/study/papers/ntp-mills-1991/) | ✅ v3 |  |
| [OT — 多人同时改一份文档，操作随上下文自动改坐标](/study/papers/ot-1989/) | ✅ v3 |  |
| [PBFT — 让拜占庭容错从理论变成能跑的工程](/study/papers/pbft-1999/) | ✅ v3 |  |
| [Percolator 2010 — 给 Bigtable 加分布式事务的客户端库](/study/papers/percolator-2010/) | ✅ v3 |  |
| [Pivot Tracing — 让运维事后想测什么就测什么](/study/papers/pivot-tracing-2015/) | ✅ v3 |  |
| [PNUTS — 介于强一致与最终一致之间的实用一致性](/study/papers/pnuts-2008/) | ✅ v3 |  |
| [Presumed Abort/Commit — 让 2PC 少写日志少发消息的两个默认共识](/study/papers/presumed-abort-1986/) | ✅ v3 |  |
| [Parameter Server — 多机训练前 AllReduce 时代的工业标准](/study/papers/ps-li-2014/) | ✅ v3 |  |
| [Quincy — 把"派活给机器"变成一道最小费用流题](/study/papers/quincy-2009/) | ✅ v3 |  |
| [Sagas — 长事务拆成一串能"反向走回去"的小事务](/study/papers/saga-1987/) | ✅ v3 |  |
| [Sequential Consistency 1979 — 多处理器内存模型的第一个正确性标准](/study/papers/sequential-consistency-1979/) | ✅ v3 |  |
| [Sinfonia 2007 — 把分布式协议降级成数据结构操作](/study/papers/sinfonia-2007/) | ✅ v3 |  |
| [Skeen 1981 三阶段提交 — 给 2PC 的阻塞缺陷打补丁](/study/papers/skeen-3pc-1981/) | ✅ v3 |  |
| [Sparrow — 让毫秒级任务也能被精准调度的去中心化调度器](/study/papers/sparrow-2013/) | ✅ v3 |  |
| [TAO — Facebook 给十亿人好友列表造的专用图数据库](/study/papers/tao-2013/) | ✅ v3 |  |
| [Tendermint — 把拜占庭共识塞进开放区块链的工程模板](/study/papers/tendermint-2016/) | ✅ v3 |  |
| [TensorFlow — 把神经网络拆成数据流图再跑到任何机器上](/study/papers/tensorflow-osdi-2016/) | ✅ v3 |  |
| [Eventually Consistent 2009 — 给互联网规模存储一套'放弃强一致'的官方词汇](/study/papers/vogels-eventual-2009/) | ✅ v3 |  |
| [VR 1988 — 用"主备 + 换届"做共识的另一脉](/study/papers/vr-1988/) | ✅ v3 |  |
| [VR Revisited 2012 — VR 协议的"工程化重写版"](/study/papers/vr-revisited-2012/) | ✅ v3 |  |
| [X-Trace — 比 Dapper 早 3 年的跨层跨协议追踪框架](/study/papers/xtrace-2007/) | ✅ v3 |  |
| [ZeRO 2020 — 把训练状态切成 N 份让万亿参数成为可能](/study/papers/zero-2020/) | ✅ v3 |  |

### 其他子类

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Bitcoin 白皮书](/study/papers/bitcoin/) | ✅ v3 |  |
| [DeepSpeed ZeRO — 微软优化大模型训练显存](/study/papers/deepspeed-zero/) | ✅ v3 |  |
| [Kafka — 把消息系统降维成只追加的日志文件](/study/papers/kafka/) | ✅ v3 |  |
| [Lamport 1978 — 分布式系统里没有"绝对的同时"](/study/papers/lamport-1978/) | 🗄 存量 |  |
| [Lampson Hints — 把做系统的隐式品味写成 27 条经验法则](/study/papers/lampson-hints/) | ✅ v3 |  |
| [Megatron-LM — NVIDIA 大规模训练框架](/study/papers/megatron-lm/) | ✅ v3 |  |
| [Spanner — 全球分布式 SQL 数据库](/study/papers/spanner/) | ✅ v3 |  |

## 数据库

共 67 篇。

### 存储与查询

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [ARIES 1992 — 数据库崩溃后怎么把账目对回来](/study/papers/aries-1992/) | ✅ v3 |  |
| [ART 自适应基数树 — 内存数据库为主索引重新选材](/study/papers/art-2013/) | ✅ v3 |  |
| [Windows Azure Storage 2011 — 云对象存储第一次在工业界做到强一致](/study/papers/azure-storage-2011/) | ✅ v3 |  |
| [B-Tree 1972 — 磁盘友好的索引结构](/study/papers/b-tree-1972/) | ✅ v3 |  |
| [Berenson 1995 — ANSI SQL 隔离级别的漏洞与快照隔离](/study/papers/berenson-1995-isolation/) | ✅ v3 |  |
| [Bernstein 1981 并发控制综述 — 把分布式数据库的 20+ 算法整成两条主线](/study/papers/bernstein-1981-cc/) | ✅ v3 |  |
| [Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统](/study/papers/bigtable-2006/) | 🗄 存量 |  |
| [Brewer CAP — 网络一断电，一致性和可用性只能留一个](/study/papers/brewer-cap-2000/) | ✅ v3 |  |
| [Calvin 2012 — 先排好顺序再执行，让跨分区事务不再走 2PC](/study/papers/calvin-2012/) | ✅ v3 |  |
| [Cascades 1995 — 用规则 + Memo 拼装一个可扩展查询优化器](/study/papers/cascades-1995/) | ✅ v3 |  |
| [Cassandra 2010 — 把 Dynamo 的 P2P 骨架和 Bigtable 的列族数据模型拼成一个东西](/study/papers/cassandra-2010/) | ✅ v3 |  |
| [Ceph — 让分布式文件系统不靠中心查表](/study/papers/ceph-2006/) | ✅ v3 |  |
| [ClickHouse — 把列存 OLAP 推到硬件极限](/study/papers/clickhouse/) | ✅ v3 |  |
| [CockroachDB 2020 — 没原子钟也能做全球强一致 SQL 数据库](/study/papers/cockroachdb-2020/) | ✅ v3 |  |
| [Codd 1970 — 关系模型奠基](/study/papers/codd-1970/) | ✅ v3 |  |
| [Codd 1979 — 给关系模型补上"语义"](/study/papers/codd-1979-extending/) | ✅ v3 |  |
| [Comer 1979 — B-Tree 综述：为什么这棵树到处都有](/study/papers/comer-1979-btree/) | ✅ v3 |  |
| [C-Store — 把数据按列存，分析查询直接快十倍](/study/papers/cstore-2005/) | ✅ v3 |  |
| [Dataflow Model — 流处理的四问框架](/study/papers/dataflow-model-2015/) | ✅ v3 |  |
| [DeWitt-Gray 1992 — 并行数据库取代专用机的宣言](/study/papers/dewitt-gray-1992/) | ✅ v3 |  |
| [DiskANN — 单机十亿向量近邻检索（图存 SSD）](/study/papers/diskann-2019/) | ✅ v3 |  |
| [D-Streams — 把流处理伪装成一串很小的批](/study/papers/dstreams-2013/) | ✅ v3 |  |
| [DuckDB — 把 OLAP 数据库塞进你的 Python 进程](/study/papers/duckdb-2019/) | ✅ v3 |  |
| [Eswaran 1976 — 串行化与谓词锁的源头](/study/papers/eswaran-1976/) | ✅ v3 |  |
| [F1 2013 — 把 Spanner 包成 SQL，扛起 AdWords 全部账单](/study/papers/f1-2013/) | ✅ v3 |  |
| [FAISS 2017 — 用 GPU 在十亿向量里找最近邻](/study/papers/faiss-2017/) | ✅ v3 |  |
| [Apache Flink — 流批一体的单引擎](/study/papers/flink-2015/) | ✅ v3 |  |
| [FoundationDB 2021 — 把数据库拆成五个角色，再用一个 seed 烧十年 bug](/study/papers/foundationdb-2021/) | ✅ v3 |  |
| [Gray 1981 — 把"事务"提升为通用抽象](/study/papers/gray-1981-transaction/) | ✅ v3 |  |
| [Haystack — Facebook 十亿张照片怎么存](/study/papers/haystack-2010/) | ✅ v3 |  |
| [HDFS — 把 GFS 用 Java 重写一遍并撑到 25 PB](/study/papers/hdfs-2010/) | ✅ v3 |  |
| [HNSW — 多层近邻图让向量检索从 O(N) 降到近似 O(log N)](/study/papers/hnsw-2018/) | ✅ v3 |  |
| [INGRES 1976 — Berkeley 平行实现的关系数据库](/study/papers/ingres-1976/) | ✅ v3 |  |
| [Kafka NetDB 2011 — 把消息中间件砍成"会写文件的水管"](/study/papers/kafka-2011/) | ✅ v3 |  |
| [Leis 2015 — 用真实数据打脸所有数据库的查询优化器](/study/papers/leis-2015-optimizers/) | ✅ v3 |  |
| [LMDB 2011 — 把数据库直接 mmap 进内存的嵌入式 KV 存储](/study/papers/lmdb-2011/) | ✅ v3 |  |
| [LSM-Tree 1996 — 写优化存储引擎](/study/papers/lsm-tree-1996/) | ✅ v3 |  |
| [MillWheel 2013 — Google 给互联网级流处理装上不漏不重的发动机](/study/papers/millwheel-2013/) | ✅ v3 |  |
| [Milvus — 为向量检索而生的数据库](/study/papers/milvus-2021/) | ✅ v3 |  |
| [MonetDB/X100 — 让数据库一次处理一向量行而不是一行](/study/papers/monetdb-x100-2005/) | ✅ v3 |  |
| [Adaptive Optimization of Very Large Join Queries — 100 张表也敢精确求解](/study/papers/neumann-2015-large-joins/) | ✅ v3 |  |
| [Paxos 1998 — 古希腊议会寓言里藏的共识协议](/study/papers/paxos-1998/) | 🗄 存量 |  |
| [Paxos Made Simple — Lamport 用平直英语把共识协议推导一遍](/study/papers/paxos-simple-2001/) | ✅ v3 |  |
| [Product Quantization — 把向量切碎再压成几个字节](/study/papers/product-quantization-2011/) | ✅ v3 |  |
| [RocksDB 2017 — 把 LSM-Tree 的"空间放大"压到极低的工业经验](/study/papers/rocksdb-2017/) | ✅ v3 |  |
| [Selinger 1979 — 基于代价的查询优化](/study/papers/selinger-1979/) | ✅ v3 |  |
| [SEQUEL 1974 — 让数据库"听懂"近似英语的查询](/study/papers/sequel-1974/) | ✅ v3 |  |
| [SILT — 0.7 字节内存索引一条记录的 flash 键值存储](/study/papers/silt-2011/) | ✅ v3 |  |
| [Skip List — 用抛硬币代替平衡树](/study/papers/skip-list-1990/) | ✅ v3 |  |
| [SMR 1990 — 把"容错服务"还原成"多副本一起跑同一台状态机"](/study/papers/smr-1990/) | ✅ v3 |  |
| [Snowflake 2016 — 把数仓拆成 storage / compute / services 三层](/study/papers/snowflake-2016/) | ✅ v3 |  |
| [Spanner 2012 — 用原子钟和 GPS 给全球数据库发时间戳](/study/papers/spanner-2012/) | ✅ v3 |  |
| [SQLite — 嵌入式数据库 30 年怎么活下来的](/study/papers/sqlite-2022/) | ✅ v3 |  |
| [Stonebraker 2010 SQL vs NoSQL — 慢的是老实现，不是 SQL](/study/papers/stonebraker-2010-sqlnosql/) | ✅ v3 |  |
| [System R 1976 — 第一个跑起来的关系数据库](/study/papers/system-r-1976/) | ✅ v3 |  |
| [Tachyon — 把集群存储推到内存速度，丢了再算回来](/study/papers/tachyon-2014/) | ✅ v3 |  |
| [TiDB 2020 — 给 Raft 加一个"旁听生"，让一份数据同时跑事务和分析](/study/papers/tidb-2020/) | ✅ v3 |  |
| [Trill — 一个引擎同时跑流、批、交互三种分析](/study/papers/trill-2014/) | ✅ v3 |  |
| [Vertica 2012 — C-Store 论文走向产品的七年改造账](/study/papers/vertica-2012/) | ✅ v3 |  |
| [Volcano 1994 — 把 SQL 执行写成 next() 拉式数据流](/study/papers/volcano-1994/) | ✅ v3 |  |
| [Zab — ZooKeeper 怎么把客户端写入按顺序复制到所有副本](/study/papers/zab-2011/) | ✅ v3 |  |

### 数据库

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [CouchDB — 把 HTTP + 多版本 + 多主复制揉成离线优先数据库](/study/papers/couchdb/) | ✅ v3 |  |
| [LSM-tree 与 RocksDB — 把所有写都变成顺序写](/study/papers/rocksdb-lsm/) | ✅ v3 |  |
| [TigerBeetle — 只能记账但把记账做到极致的金融数据库](/study/papers/tigerbeetle/) | ✅ v3 |  |
| [Volcano — 把'算子可组合'与'并行可分离'拼成执行器范式](/study/papers/volcano/) | ✅ v3 |  |

### 其他子类

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Aurora — 把数据库的下半身换成日志机](/study/papers/aurora/) | ✅ v3 |  |
| [BadgerDB — 把键和值分开存的 Go 原生 KV 库](/study/papers/badger/) | ✅ v3 |  |

## 操作系统

共 59 篇。

### 内核与虚拟化

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [AFS 1988 — 客户端缓存 + 回调失效让分布式文件系统真正能扩展](/study/papers/afs-1988/) | ✅ v3 |  |
| [Amoeba — 把整个机房当一台操作系统](/study/papers/amoeba-1990/) | ✅ v3 |  |
| [Barrelfish / Multikernel — 把多核机器当成一个小型网络来设计 OS](/study/papers/barrelfish-2009/) | ✅ v3 |  |
| [Belady 1966 — 缓存替换的理论最优与 FIFO 异常](/study/papers/belady-1966/) | ✅ v3 |  |
| [Btrfs — Linux 上"写时复制 B-tree"的工业级文件系统](/study/papers/btrfs-2013/) | ✅ v3 |  |
| [BVT 1999 — 让一份调度器同时照顾"急性子"和"老黄牛"](/study/papers/bvt-1999/) | ✅ v3 |  |
| [Capsicum: Practical Capabilities for UNIX](/study/papers/capsicum-2010/) | ✅ v3 |  |
| [Coda 1990 — 笔记本拔网线照样写文件，重连后自动合并](/study/papers/coda-1990/) | ✅ v3 |  |
| [Denali — 在一台机器上同时跑上千个轻量 VM 的早期实验](/study/papers/denali-2002/) | ✅ v3 |  |
| [Dijkstra 1965 — N 个进程怎么轮流上厕所而且谁也别卡死](/study/papers/dijkstra-1965/) | ✅ v3 |  |
| [Disco — 让没改过的商用 OS 在 64 核大机器上一起跑](/study/papers/disco-1997/) | ✅ v3 |  |
| [EROS — 让 capability 内核跑得跟 Linux 一样快](/study/papers/eros-1999/) | ✅ v3 |  |
| [ESX Memory 2002 — 让一台机器假装比自己更大的四个魔术](/study/papers/esx-memory-2002/) | ✅ v3 |  |
| [Exokernel — 把抽象推到用户态的极致设计](/study/papers/exokernel-1995/) | ✅ v3 |  |
| [Farsite — 把一群不可信桌面 PC 拼成一台可信文件服务器](/study/papers/farsite-2002/) | ✅ v3 |  |
| [FFS — 把磁盘几何写进文件系统](/study/papers/ffs-1984/) | ✅ v3 |  |
| [Firecracker 2020 — 给 serverless 量身定做的极简 microVM](/study/papers/firecracker-2020/) | ✅ v3 |  |
| [FlexSC — 把系统调用从同步陷入改成异步队列](/study/papers/flexsc-2010/) | ✅ v3 |  |
| [Frangipani — 把分布式文件系统盖在共享虚拟磁盘上](/study/papers/frangipani-1997/) | ✅ v3 |  |
| [ghOSt — 把 Linux 调度策略搬到用户态去写](/study/papers/ghost-2021/) | ✅ v3 |  |
| [Haven — 把整个应用装进 CPU 黑盒，让云服务商也看不见](/study/papers/haven-2014/) | ✅ v3 |  |
| [Hazard Pointers — 多线程下安全释放共享节点](/study/papers/hazard-pointers-2004/) | ✅ v3 |  |
| [HYDRA — 用 capability 把整个内核重做成对象 + 票据](/study/papers/hydra-1974/) | ✅ v3 |  |
| [jemalloc — 多 arena 让多线程 malloc 不再互相等](/study/papers/jemalloc-2006/) | ✅ v3 |  |
| [Kubernetes — 为什么选声明式 API 加协调环](/study/papers/kubernetes-2016/) | ✅ v3 |  |
| [KVM 2007 — 把 Linux 内核本身变成 hypervisor](/study/papers/kvm-2007/) | ✅ v3 |  |
| [L4 — Liedtke 用 12KB 内核反驳"微内核必然慢"](/study/papers/l4-1995/) | ✅ v3 |  |
| [LFS 1991 — 把整个磁盘当日志写](/study/papers/lfs-1991/) | ✅ v3 |  |
| [LOCUS 1980 — 让一群机器看起来像同一台机器](/study/papers/locus-1980/) | ✅ v3 |  |
| [彩票调度 — 用抽奖代替优先级的资源分配](/study/papers/lottery-1994/) | ✅ v3 |  |
| [Mach — 把内核拆成消息互通的小服务](/study/papers/mach-1986/) | ✅ v3 |  |
| [Mach VM — 把虚拟内存抽象成"对象"，与硬件解耦](/study/papers/mach-vm-1987/) | ✅ v3 |  |
| [MCS 锁 — 让每个线程自旋在自己的缓存行上](/study/papers/mcs-locks-1991/) | ✅ v3 |  |
| [Mesos 2011 — 把数据中心切成资源 offer 发给框架自己挑](/study/papers/mesos-2011/) | ✅ v3 |  |
| [MirageOS Unikernels — 应用即内核，把操作系统编译掉](/study/papers/mirage-2013/) | ✅ v3 |  |
| [Hoare Monitors 1974 — 把锁藏进对象里，让并发代码读起来像普通函数](/study/papers/monitors-1974/) | ✅ v3 |  |
| [MULTICS 1965 — 把计算机做成像电力一样的公共服务](/study/papers/multics-1965/) | ✅ v3 |  |
| [NFS 1985 — 让远程磁盘看起来像本地磁盘](/study/papers/nfs-1985/) | ✅ v3 |  |
| [Omega 2013 — 让多个调度器同时改一份 cluster 状态](/study/papers/omega-2013/) | ✅ v3 |  |
| [Plan 9 — 把"一切皆文件"真的做到极致的下一代 UNIX](/study/papers/plan9-1995/) | ✅ v3 |  |
| [RCU 2001 — 让"读"的代价归零的并发数据结构](/study/papers/rcu-2001/) | ✅ v3 |  |
| [Saltzer-Schroeder 1975 — 8 条至今教科书还在引的安全设计原则](/study/papers/saltzer-schroeder-1975/) | ✅ v3 |  |
| [seL4 — 第一个被数学证明"代码和规范完全一致"的操作系统内核](/study/papers/sel4-2009/) | ✅ v3 |  |
| [SELinux 2001 — 给每扇门都装上门卫，而不是给管理员一把万能钥匙](/study/papers/selinux-2001/) | ✅ v3 |  |
| [Innovative Instructions and Software Model for Isolated Execution](/study/papers/sgx-2013/) | ✅ v3 |  |
| [Shenango — 每 5 微秒重新分一次核的中央调度器](/study/papers/shenango-2019/) | ✅ v3 |  |
| [Slab Allocator 1994 — 内核按对象类型开缓存，不是按字节切](/study/papers/slab-1994/) | ✅ v3 |  |
| [Soft Updates — 不写 journal 也能保证文件系统元数据一致](/study/papers/soft-updates-1999/) | ✅ v3 |  |
| [Soltesz 2007 — 容器：比虚拟机轻一档的隔离方案](/study/papers/soltesz-2007/) | ✅ v3 |  |
| [Sprite 1988 — 把一屋子工作站伪装成一台大主机](/study/papers/sprite-1988/) | ✅ v3 |  |
| [THE 1968 — Dijkstra 用分层 + 信号量造出第一个可证明的 OS](/study/papers/the-os-1968/) | ✅ v3 |  |
| [Twine — Facebook 把整个数据中心当一台机器调度](/study/papers/twine-2020/) | ✅ v3 |  |
| [UNIX 1974 — 用极小内核做出能用的分时系统](/study/papers/unix-1974/) | ✅ v3 |  |
| [V 分布式系统 — 把局域网当成一台机器，内核只剩进程加 IPC](/study/papers/v-system-1988/) | ✅ v3 |  |
| [Xen 2003 — 让操作系统配合虚拟化，性能直接接近原生](/study/papers/xen-2003/) | ✅ v3 |  |
| [ZFS — 把磁盘当成水池，每滴水都贴标签](/study/papers/zfs-2003/) | ✅ v3 |  |

### 其他子类

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Boehm-Weiser 保守式垃圾回收 — 不改编译器也能给 C 加 GC](/study/papers/boehm-gc/) | ✅ v3 |  |
| [eBPF — 用户写小程序，内核证明安全后再跑](/study/papers/ebpf/) | ✅ v3 |  |
| [io_uring — Linux 让 N 次 IO 摊销到 1 次 syscall](/study/papers/io-uring/) | ✅ v3 |  |

## 机器学习

共 215 篇。

### 多模态 LLM

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Gemini 1.5 — 百万 token 多模态长上下文](/study/papers/gemini-15-2024/) | ✅ v3 |  |
| [MLLM Benchmark Survey — 200+ 多模态评测基准地图](/study/papers/mllm-benchmark-survey-2024/) | ✅ v3 |  |
| [MME Benchmark — 开源 MLLM 评测的事实起点](/study/papers/mme-benchmark-2023/) | ✅ v3 |  |
| [MME-Survey — 多模态 LLM 怎么评才靠谱](/study/papers/mme-survey-2024/) | ✅ v3 |  |
| [SigLIP — 用 Sigmoid 损失训练图文对齐](/study/papers/siglip-2023/) | ✅ v3 |  |

### 机器人与 VLA

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [机器人世界模型综述 — 预测未来再动手](/study/papers/world-model-robot-learning-2026/) | ✅ v3 |  |

### 模型与训练

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [A3C — 多个 CPU 同时跑游戏，让 RL 不再吃 GPU](/study/papers/a3c-2016/) | ✅ v3 |  |
| [Adafactor — 把 Adam 的优化器内存从 O(d) 压到 O(√d)](/study/papers/adafactor-2018/) | ✅ v3 |  |
| [Adam — 让深度学习自己挑步长的优化器](/study/papers/adam-2014/) | ✅ v3 |  |
| [AdamW — 把 weight decay 从梯度里拆出来](/study/papers/adamw-2017/) | ✅ v3 |  |
| [ALIGN — 用 18 亿条脏图文对训练，证明数据规模能压住噪声](/study/papers/align-2021/) | ✅ v3 |  |
| [Atlas — 把检索器和生成器一起训练，11B 打 540B](/study/papers/atlas-2022/) | ✅ v3 |  |
| [AWQ — 看激活脸色给权重打折](/study/papers/awq/) | ✅ v3 |  |
| [Batch Normalization — 把每层激活值规整到 0 均值 1 方差，深网训练时间砍成 1/14](/study/papers/batchnorm-2015/) | ✅ v3 |  |
| [BIG-bench — 204 道题给大模型出考卷](/study/papers/bigbench-2022/) | ✅ v3 |  |
| [BigGAN — 把 GAN 暴力放大到 ImageNet 512×512](/study/papers/biggan-2018/) | ✅ v3 |  |
| [BLIP-2 — 用 188M 小桥接器把冻结的视觉模型和大语言模型拼起来](/study/papers/blip2-2023/) | ✅ v3 |  |
| [Chatbot Arena — 让真人盲投，给 LLM 排出公允座次](/study/papers/chatbot-arena-2024/) | ✅ v3 |  |
| [Chronos — 把时间序列当语言来训练大模型](/study/papers/chronos-2024/) | ✅ v3 |  |
| [Classifier-Free Guidance — 让扩散模型自己听懂条件](/study/papers/classifier-free-guidance-2022/) | ✅ v3 |  |
| [CoCa — 把对比和生成两种多模态训练目标合到一个模型里](/study/papers/coca-2022/) | ✅ v3 |  |
| [Code Llama — 开源代码模型的完整训练配方](/study/papers/codellama-2023/) | ✅ v3 |  |
| [Codex — 让 GPT 学会写 Python，并造一把尺子量它](/study/papers/codex-2021/) | ✅ v3 |  |
| [Consistency Models — 把 50 步扩散压成 1 步出图](/study/papers/consistency-models-2023/) | ✅ v3 |  |
| [DDIM — 把扩散模型 1000 步采样压到 50 步](/study/papers/ddim-2020/) | ✅ v3 |  |
| [AI safety via debate — 让两个 AI 互辩，人类只当评委](/study/papers/debate-2018/) | ✅ v3 |  |
| [DeBERTa — 把"内容"和"位置"拆成两路独立看的 BERT](/study/papers/deberta-2021/) | ✅ v3 |  |
| [Decision Transformer — 把强化学习当成"文字接龙"](/study/papers/decision-transformer-2021/) | ✅ v3 |  |
| [DeepSeek-Coder — 按整个仓库喂代码的开源 SOTA](/study/papers/deepseek-coder-2024/) | ✅ v3 |  |
| [DeepSeek R1 — 强化学习推理模型](/study/papers/deepseek-r1/) | ✅ v3 |  |
| [Double Descent — 模型越大越准，过参数化时代的反常识曲线](/study/papers/double-descent-2019/) | ✅ v3 |  |
| [DreamFusion — 用 2D 扩散模型当老师，把 NeRF 教成 3D](/study/papers/dreamfusion-2022/) | ✅ v3 |  |
| [Dropout — 训练时随机关掉一半神经元，反而学得更好](/study/papers/dropout-2014/) | ✅ v3 |  |
| [EAGLE — 让大模型先在"特征层"猜下一步而不是猜 token](/study/papers/eagle/) | ✅ v3 |  |
| [EDM — 把扩散模型的训练配方一次拆清楚](/study/papers/edm-2022/) | ✅ v3 |  |
| [ELECTRA — 把猜词题改成判真假题，训练效率 4 倍](/study/papers/electra-2020/) | ✅ v3 |  |
| [ELMo — 让词向量随上下文变化](/study/papers/elmo-2018/) | ✅ v3 |  |
| [Flamingo — 让冻结的大模型学会看图，几张样例就上手](/study/papers/flamingo-2022/) | ✅ v3 |  |
| [FLAN — 用自然语言指令教模型学会"听话"](/study/papers/flan-2021/) | ✅ v3 |  |
| [GAT — 让图神经网络的邻居自带权重](/study/papers/gat-2018/) | ✅ v3 |  |
| [GCN 2017 — 把卷积搬到图结构上的最简版本](/study/papers/gcn-2017/) | ✅ v3 |  |
| [GIN — 把图神经网络的表达力顶到理论天花板](/study/papers/gin-2019/) | ✅ v3 |  |
| [GLUE — 给 NLU 模型出一张包含 9 道题的统考卷](/study/papers/glue-2018/) | ✅ v3 |  |
| [Goal Misgeneralization — 奖励函数完全正确，AI 还是可能学歪](/study/papers/goal-misgeneralization-2022/) | ✅ v3 |  |
| [Graphormer — 标准 Transformer 直接刷爆 GNN](/study/papers/graphormer-2021/) | ✅ v3 |  |
| [GraphSAGE 2017 — 给没见过的节点也能算嵌入](/study/papers/graphsage-2017/) | ✅ v3 |  |
| [Grokking — 训练 loss 早归零，几千步后才突然学会](/study/papers/grokking-2022/) | ✅ v3 |  |
| [GRU 2014 — 用两个门替代 LSTM 三个门，编码-解码范式登场](/study/papers/gru-2014/) | ✅ v3 |  |
| [Imagen — 文生图真正的引擎是语言模型](/study/papers/imagen-2022/) | ✅ v3 |  |
| [Instant-NGP — 秒级训练 NeRF 的多分辨率哈希编码](/study/papers/instant-ngp-2022/) | ✅ v3 |  |
| [InternVL — 6B 视觉基座 + QLLaMA 对齐开源多模态](/study/papers/internvl-2023/) | ✅ v3 |  |
| [Label Smoothing — 别让模型对正确答案过度自信](/study/papers/label-smoothing-2016/) | ✅ v3 |  |
| [Layer Normalization — 把归一化方向从 batch 转到 feature，让 RNN/Transformer 也能稳定训](/study/papers/layernorm-2016/) | ✅ v3 |  |
| [Lion — 让程序自己搜出来的优化器，比 AdamW 内存少一半](/study/papers/lion-2023/) | ✅ v3 |  |
| [Longformer — 滑窗加少数全局 token，把长文档喂进 Transformer](/study/papers/longformer-2020/) | ✅ v3 |  |
| [彩票假设 — 大网里藏着一张能独立训出来的小网](/study/papers/lottery-ticket-2019/) | ✅ v3 |  |
| [LSTM — 用门控让神经网络记得住上一段话](/study/papers/lstm-1997/) | ✅ v3 |  |
| [Magic3D — 把 DreamFusion 的 NeRF 拆成"先粗后精"两阶段](/study/papers/magic3d-2023/) | ✅ v3 |  |
| [MAML — 学一个"好起点"，几步就能学会新任务](/study/papers/maml-2017/) | ✅ v3 |  |
| [Mesa-Optimization 2019 — 训出来的模型自己也是个优化器](/study/papers/mesa-optimization-2019/) | ✅ v3 |  |
| [MiniCPM-V — 手机能跑的 GPT-4V 级多模态模型](/study/papers/minicpm-v-2024/) | ✅ v3 |  |
| [mixup — 把两张图按比例叠成一张，标签也一起叠](/study/papers/mixup-2018/) | ✅ v3 |  |
| [MMLU — 用 57 个学科的多选题考一考语言模型](/study/papers/mmlu-2021/) | ✅ v3 |  |
| [Mode Connectivity — 神经网络的两个最优解之间有低洼走廊](/study/papers/mode-connectivity-2018/) | ✅ v3 |  |
| [mPLUG-Owl — 模块化拼装多模态大模型](/study/papers/mplug-owl-2023/) | ✅ v3 |  |
| [N-BEATS — 纯前馈网络在时序预测上打败统计派](/study/papers/nbeats-2020/) | ✅ v3 |  |
| [NTK — 把无限宽的神经网络变成一个可解的核方法](/study/papers/ntk-2018/) | ✅ v3 |  |
| [NVILA — 先放大分辨率再压缩 token 的高效 VLM](/study/papers/nvila-2024/) | ✅ v3 |  |
| [Orca — 让一批 LLM 请求随到随走，不再排队等最长那个](/study/papers/orca-continuous-batching/) | ✅ v3 |  |
| [Parti — 把文生图当作翻译，用自回归 Transformer 一像素接一像素地写](/study/papers/parti-2022/) | ✅ v3 |  |
| [Performer — 用随机特征把 softmax attention 拉成线性复杂度](/study/papers/performer-2020/) | ✅ v3 |  |
| [Prototypical Networks — 每类算个均值，比距离就够了](/study/papers/prototypical-networks-2017/) | ✅ v3 |  |
| [Reformer — 用哈希分桶把 attention 从 O(L²) 压到 O(L log L)](/study/papers/reformer-2020/) | ✅ v3 |  |
| [REPLUG — 不动 LLM 一根毛，只把检索器调到它的"口味"上](/study/papers/replug-2023/) | ✅ v3 |  |
| [RoBERTa — 把 BERT 重训一遍就能拿 SOTA](/study/papers/roberta-2019/) | ✅ v3 |  |
| [RWKV — 让 RNN 拿到 Transformer 那张训练并行的入场券](/study/papers/rwkv-2023/) | ✅ v3 |  |
| [Soft Actor-Critic — 让强化学习既会拿分又愿意多试](/study/papers/sac-2018/) | ✅ v3 |  |
| [Self-Consistency — 让模型把同一道题做 40 遍再投票](/study/papers/self-consistency-2022/) | ✅ v3 |  |
| [Self-RAG — 让模型自己决定何时该查资料](/study/papers/self-rag-2023/) | ✅ v3 |  |
| [Self-Refine — 让同一个模型自己改自己写的东西](/study/papers/self-refine-2023/) | ✅ v3 |  |
| [Seq2Seq — 把翻译变成端到端神经网络](/study/papers/seq2seq-2014/) | ✅ v3 |  |
| [Sophia — 让二阶优化器第一次在 LLM 预训练里跑得动](/study/papers/sophia-2023/) | ✅ v3 |  |
| [StarCoder — 把训练数据完整公开的 15B 代码模型](/study/papers/starcoder-2023/) | ✅ v3 |  |
| [StyleGAN2 — 把 StyleGAN 的水滴瑕疵和潜空间纠葛一起修掉](/study/papers/stylegan2-2020/) | ✅ v3 |  |
| [Sycophancy 2023 — RLHF 模型为什么爱顺着用户说](/study/papers/sycophancy-2023/) | ✅ v3 |  |
| [T0 — 让 50 个人各写各的提示词，模型反而更会听新指令](/study/papers/t0-2021/) | ✅ v3 |  |
| [TabPFN — 一秒解决小表格分类的 Transformer](/study/papers/tabpfn-2023/) | ✅ v3 |  |
| [TD3 — 给 DDPG 装两副刹车，连续控制终于稳了](/study/papers/td3-2018/) | ✅ v3 |  |
| [Transformer-XL — 让 Transformer 像 RNN 那样把上下文滚动传下去](/study/papers/transformer-xl-2019/) | ✅ v3 |  |
| [Tree of Thoughts — 让 LLM 像下棋一样多想几步再答](/study/papers/tree-of-thoughts-2023/) | ✅ v3 |  |
| [VALL-E — 3 秒样本零样本语音克隆](/study/papers/vall-e-2023/) | ✅ v3 |  |
| [Whisper — 68 万小时弱监督训出的语音识别](/study/papers/whisper-2022/) | ✅ v3 |  |
| [XLNet — 把句子打乱顺序读，借此同时拿到 AR 和双向](/study/papers/xlnet-2019/) | ✅ v3 |  |

### 强化学习

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [DQN — Deep Q-Network](/study/papers/dqn/) | ✅ v3 |  |
| [MuZero — 不用规则也能下棋](/study/papers/muzero/) | 🗄 存量 |  |
| [PPO — Proximal Policy Optimization](/study/papers/ppo/) | ✅ v3 |  |

### 生成模型

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [DDPM — Denoising Diffusion Probabilistic Models](/study/papers/ddpm/) | 🗄 存量 |  |
| [DiT — Diffusion Transformer](/study/papers/dit/) | ✅ v3 |  |
| [Stable Diffusion — 开源文生图引爆](/study/papers/stable-diffusion/) | ✅ v3 |  |

### 视频理解

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [2D-TAN — 用二维时间图做自然语言时刻检索](/study/papers/2d-tan-2019/) | ✅ v3 |  |
| [Chapter-Llama — 语音引导采帧，一小时视频一次前向切章节](/study/papers/chapter-llama-2025/) | ✅ v3 |  |
| [Chat-UniVi — 动态视觉 token 统一图像与视频对话](/study/papers/chat-univi-2023/) | ✅ v3 |  |
| [CounterVQA — 因果图驱动的反事实视频 VQA](/study/papers/countervqa-2025/) | ✅ v3 |  |
| [COVER — 四象限反事实视频推理 benchmark](/study/papers/cover-2025/) | ✅ v3 |  |
| [Dense360 — 全景 ERP 密集理解与 ERP-RoPE](/study/papers/dense360-2025/) | ✅ v3 |  |
| [EgoSchema — 三分钟第一视角长视频理解的诊断探针](/study/papers/egoschema-2023/) | ✅ v3 |  |
| [Flash-VStream — STAR 双进程记忆的低延迟长流理解](/study/papers/flash-vstream-2024/) | ✅ v3 |  |
| [Grounded-VideoLLM — 双流编码 + 时间 token，把「何时发生」写进 Video LLM](/study/papers/grounded-videollm-2024/) | ✅ v3 |  |
| [HawkEye — 用递归缩窗把文本查询钉在长视频时间轴上](/study/papers/hawkeye-2024/) | ✅ v3 |  |
| [Hour-LLaVA — 记忆增强，让 LLaVA 读懂一小时视频](/study/papers/hour-llava-2025/) | ✅ v3 |  |
| [InternVideo2 — 三阶段渐进训练，把视频基础模型扩到 6B](/study/papers/internvideo2-2024/) | ✅ v3 |  |
| [InternVideo2.5 — 长富上下文 + HiCo 层次压缩](/study/papers/internvideo2-5-2025/) | ✅ v3 |  |
| [LiveVLM — 免训练流式视觉 token 压缩](/study/papers/livevlm-2025/) | ✅ v3 |  |
| [LLaMA-VID — 每帧两枚 token，把小时级视频塞进 LLM](/study/papers/llama-vid-2023/) | ✅ v3 |  |
| [LLaVA-OneVision — 单图、多图、视频一个模型全搞定](/study/papers/llava-onevision-2024/) | ✅ v3 |  |
| [LLaVA-Video — LLaVA-NeXT 视频主线，合成数据 + SlowFast 采帧](/study/papers/llava-video-2024/) | ✅ v3 |  |
| [LLMVS — 用 LLM 语义裁判给视频帧打分做摘要](/study/papers/llmvs-2025/) | ✅ v3 |  |
| [R-VLM — 长视频不靠均匀采帧，靠可学习检索选片段](/study/papers/long-video-retrieval-2023/) | ✅ v3 |  |
| [LongVA — 把语言模型的长上下文能力「搬」到视频上](/study/papers/longva-2024/) | ✅ v3 |  |
| [LongVideoBench — 一小时交织字幕视频的长上下文理解考卷](/study/papers/longvideobench-2024/) | ✅ v3 |  |
| [LongVILA — 把 VILA 从 8 帧扩到 2048 帧的长视频全栈方案](/study/papers/longvila-2024/) | ✅ v3 |  |
| [LVBench — 平均 68 分钟、六维能力的长视频极限考](/study/papers/lvbench-2024/) | ✅ v3 |  |
| [MLVTG — MambaAligner + 冻结 LLM 提纯的多模态视频时序定位](/study/papers/mlvtg-2025/) | ✅ v3 |  |
| [MLVU — 九类任务、多时长分层的长视频理解大考](/study/papers/mlvu-2024/) | ✅ v3 |  |
| [MovieChat — 从稠密帧到稀疏记忆，小时级电影也能聊](/study/papers/moviechat-2024/) | ✅ v3 |  |
| [MVBench — 二十道题拆穿视频大模型真懂还是装懂](/study/papers/mvbench-2023/) | ✅ v3 |  |
| [OmAgent — 长视频分治 Agent 与回退检索](/study/papers/omagent-2024/) | ✅ v3 |  |
| [全景空间推理 — MLLM 准备好面对 360° 了吗](/study/papers/omnidirectional-mllm-2025/) | ✅ v3 |  |
| [OmniSTVG — 按句子把视频里所有相关物体都框出来](/study/papers/omnistvg-2025/) | ✅ v3 |  |
| [QVHighlights — 用自然语言查询在视频里找精彩瞬间](/study/papers/qvhighlights-2021/) | ✅ v3 |  |
| [Qwen2.5-VL — 绝对时间编码 + 动态分辨率，小时级视频原生理解](/study/papers/qwen2-5-vl-2025/) | ✅ v3 |  |
| [Qwen2-VL — 动态分辨率 + M-RoPE，工业级视频理解的里程碑](/study/papers/qwen2-vl-2024/) | ✅ v3 |  |
| [ShareGPT4Video — 用 GPT-4V 级密集字幕，喂饱视频理解与生成](/study/papers/sharegpt4video-2024/) | ✅ v3 |  |
| [SpaceVLLM — 一个 MLLM 同时做时序定位、图像指代与时空管定位](/study/papers/spacevllm-2025/) | ✅ v3 |  |
| [ST-LLM — 把所有时空 token 交给 LLM，让它自己学时序](/study/papers/st-llm-2024/) | ✅ v3 |  |
| [StreamingBench — 流式视频理解的 18 任务在线大考](/study/papers/streamingbench-2024/) | ✅ v3 |  |
| [TA-STVG — 解耦「找谁 / 何时 / 何地」的时空视频定位](/study/papers/ta-stvg-2025/) | ✅ v3 |  |
| [TempCompass — 专门拆穿 Video LLM 有没有真懂时间](/study/papers/tempcompass-2024/) | ✅ v3 |  |
| [TimeChat — 带时间戳的多轮视频助手，长视频也能精确定位](/study/papers/timechat-2024/) | ✅ v3 |  |
| [TimeMarker — 时间分隔符 + 任意长度采帧的视频定位大模型](/study/papers/timemarker-2024/) | ✅ v3 |  |
| [TRACE — 用因果事件链同时输出时间、精彩度与描述](/study/papers/trace-2024/) | ✅ v3 |  |
| [TraveLER — 四段式多 Agent，帧级问答看懂长视频](/study/papers/traveler-2024/) | ✅ v3 |  |
| [UniVTG — 把视频时刻定位、高光检测、摘要合成一套框架](/study/papers/univtg-2023/) | ✅ v3 |  |
| [UniTime — 生成式 MLLM 做通用视频时序定位](/study/papers/uvtg-mllm-2025/) | ✅ v3 |  |
| [Vid-LLM Survey — 用大语言模型理解视频的全景地图](/study/papers/vid-llm-survey-2023/) | ✅ v3 |  |
| [Video-ChatGPT — 让大语言模型看懂视频并聊起来](/study/papers/video-chatgpt-2023/) | ✅ v3 |  |
| [Video-LLaMA — 把音频和视频同时塞进大语言模型](/study/papers/video-llama-2023/) | ✅ v3 |  |
| [Video-LLaVA — 投影之前先对齐，图像和视频共用一个 LLM](/study/papers/video-llava-2024/) | ✅ v3 |  |
| [VideoAgent (Wang) — LLM Agent 迭代选帧理解长视频](/study/papers/videoagent-longform-2024/) | ✅ v3 |  |
| [VideoAgent（Fan）— 双记忆 + 四工具，长视频逼近 Gemini](/study/papers/videoagent-memory-2024/) | ✅ v3 |  |
| [VideoChat — 把视频、指令微调、多轮对话第一次放进同一个系统](/study/papers/videochat-2023/) | ✅ v3 |  |
| [VideoChat-Flash — 分层压缩，让长视频理解又快又准](/study/papers/videochat-flash-2025/) | ✅ v3 |  |
| [VideoLLaMA 2 — 时空卷积连接器 + 音视频联合理解](/study/papers/videollama2-2024/) | ✅ v3 |  |
| [VideoLLaMA 3 — 动态分辨率视觉编码 + 视频 token 压缩](/study/papers/videollama3-2025/) | ✅ v3 |  |
| [VideoLLM-online — 流式视频对话的 LIVE 框架](/study/papers/videollm-online-2024/) | ✅ v3 |  |
| [Video-MME — 视频多模态大模型的「高考卷」](/study/papers/videomme-2024/) | ✅ v3 |  |
| [VideoPrism — 冻结一个模型就能搞定所有视频理解任务](/study/papers/videoprism-2024/) | ✅ v3 |  |
| [VidSTG — 用自然语言在长视频里框出「谁在何时何地」](/study/papers/vidstg-2020/) | ✅ v3 |  |
| [Vinoground — 时序反事实短视频探针](/study/papers/vinoground-2024/) | ✅ v3 |  |
| [VSI-Bench — 用室内漫游视频考视频大模型的空间智商](/study/papers/vsi-bench-2024/) | ✅ v3 |  |
| [VSLNet — 用 span-based QA 做自然语言视频定位](/study/papers/vslnet-2020/) | ✅ v3 |  |
| [VTG-LLM — 绝对时间 token + VTG-IT-120K，让 Video LLM 精确定位时刻](/study/papers/vtg-llm-2024/) | ✅ v3 |  |
| [VTimeLLM — 让 Video LLM 学会标出事件起止时间](/study/papers/vtimellm-2023/) | ✅ v3 |  |
| [WorldSense — 真实世界同步音视频理解 benchmark](/study/papers/worldsense-2025/) | ✅ v3 |  |

### 信息论

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Hamming 纠错码](/study/papers/hamming-1950/) | ✅ v3 |  |
| [Polar 极化码 — 把好坏不一的信道整成"完美/全错"两组](/study/papers/polar-codes-2009/) | ✅ v3 |  |
| [Reed-Solomon 编码](/study/papers/reed-solomon-1960/) | ✅ v3 |  |
| [Shannon 1948 — 信息论的诞生](/study/papers/shannon-1948/) | ✅ v3 |  |

### 智能体与 LLM

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [AutoGen — 多智能体对话框架](/study/papers/autogen/) | ✅ v3 |  |
| [MetaGPT — 多智能体软件公司](/study/papers/metagpt/) | ✅ v3 |  |
| [OpenHands — 开源 AI 软件工程师](/study/papers/openhands/) | ✅ v3 |  |
| [ReAct — Reasoning and Acting](/study/papers/react/) | ✅ v3 |  |
| [Reflexion — 让 LLM 自我反思](/study/papers/reflexion/) | ✅ v3 |  |
| [SWE-Agent — Princeton SWE-bench 解法](/study/papers/swe-agent/) | 🗄 存量 |  |
| [Toolformer — 教 LLM 自主调用 API](/study/papers/toolformer/) | 🗄 存量 |  |
| [Voyager — LLM 终身学习智能体](/study/papers/voyager/) | ✅ v3 |  |

### AI / NLP

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [GraphRAG — 微软的知识图谱 + RAG](/study/papers/graphrag/) | 🗄 存量 |  |
| [RAG (Lewis 2020) — 检索增强生成奠基](/study/papers/rag-lewis-2020/) | ✅ v3 |  |
| [RETRO — DeepMind 的检索增强 LLM](/study/papers/retro/) | ✅ v3 |  |

### AI 可解释性

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Activation Patching — 因果干预可解释性方法](/study/papers/activation-patching/) | ✅ v3 |  |
| [Anthropic Circuits — 把 Transformer 当电路逆向](/study/papers/anthropic-circuits/) | ✅ v3 |  |
| [Causal Abstraction — 神经网络与算法的因果对齐](/study/papers/causal-abstraction/) | ✅ v3 |  |
| [Induction Heads — Transformer 的 in-context learning 引擎](/study/papers/induction-heads/) | ✅ v3 |  |
| [Sparse Autoencoders — 把 superposition 解出来](/study/papers/sparse-autoencoders/) | 🗄 存量 |  |
| [Toy Models of Superposition](/study/papers/toy-models-superposition/) | ✅ v3 |  |

### 其他子类

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Agentless — 反 Agent 派的 SWE-bench 解法](/study/papers/agentless/) | ✅ v3 |  |
| [AlphaGo — 击败围棋世界冠军](/study/papers/alphago/) | ✅ v3 |  |
| [Anthropic Prompt Caching — 让长 prompt 只算一次，后续只付 10%](/study/papers/anthropic-prompt-caching/) | ✅ v3 |  |
| [Attention Is All You Need](/study/papers/attention/) | 🗄 存量 |  |
| [BentoML — 把模型 + 依赖 + API 打包成一个能直接跑的盒子](/study/papers/bentoml/) | ✅ v3 |  |
| [ClearML — 实验跟踪 + 远程执行 + 数据管理三合一](/study/papers/clearml/) | ✅ v3 |  |
| [CLIP — Contrastive Language-Image Pre-training](/study/papers/clip/) | ✅ v3 |  |
| [Constitutional AI — Anthropic 的对齐方法](/study/papers/constitutional-ai/) | ✅ v3 |  |
| [Chain-of-Thought Prompting](/study/papers/cot/) | ✅ v3 |  |
| [DALL-E 2 — 基于 CLIP + 扩散的图像生成](/study/papers/dalle-2/) | ✅ v3 |  |
| [DINO 自监督视觉 transformer](/study/papers/dino/) | ✅ v3 |  |
| [DistServe — 把 prefill 和 decode 拆到不同 GPU 上跑](/study/papers/distserve/) | ✅ v3 |  |
| [Huffman 编码](/study/papers/huffman-1952/) | ✅ v3 |  |
| [LLaMA — Meta 开源大语言模型](/study/papers/llama/) | ✅ v3 |  |
| [LLaVA — 开源多模态对话模型](/study/papers/llava/) | ✅ v3 |  |
| [MAE — Masked Autoencoders](/study/papers/mae/) | 🗄 存量 |  |
| [Mamba — 选择性状态空间模型](/study/papers/mamba/) | ✅ v3 |  |
| [MCP — 让一个 LLM 客户端能插任何外部能力的 USB 协议](/study/papers/mcp-spec/) | ✅ v3 |  |
| [Mixture of Experts (MoE)](/study/papers/mixture-of-experts/) | ✅ v3 |  |
| [MLflow — 给机器学习实验装上"记账本和身份证"](/study/papers/mlflow/) | ✅ v3 |  |
| [MMMU — 大学级多学科多模态推理基准](/study/papers/mmmu-2023/) | ✅ v3 |  |
| [Optuna — 让超参搜索像写普通 Python 代码一样自然](/study/papers/optuna/) | ✅ v3 |  |
| [ResNet — 残差连接](/study/papers/resnet/) | ✅ v3 |  |
| [RLHF Christiano 2017 — 人类偏好做奖励](/study/papers/rlhf-christiano/) | ✅ v3 |  |
| [SAM — Segment Anything](/study/papers/sam/) | ✅ v3 |  |
| [Sarathi-Serve — 让长 prompt 不再卡住所有人的流式回复](/study/papers/sarathi-serve/) | ✅ v3 |  |
| [Sleeper Agents — 故意藏后门的 LLM](/study/papers/sleeper-agents/) | ✅ v3 |  |
| [SWE-bench — 真实 GitHub Issue 评测](/study/papers/swe-bench/) | ✅ v3 |  |
| [ViT — Vision Transformer](/study/papers/vit/) | ✅ v3 |  |
| [vLLM — 把操作系统的分页搬进 GPU KV cache](/study/papers/vllm/) | ✅ v3 |  |

## 后端 API

共 9 篇。

### 后端

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [JWT RFC 7519 — 把身份证装进一段可校验的字符串](/study/papers/jwt-rfc-7519/) | ✅ v3 |  |
| [OAuth 2.1 — 把十年 OAuth 实战经验收口成一份能直接用的规范](/study/papers/oauth-21-rfc/) | ✅ v3 |  |
| [REST — Fielding 2000 给 Web API 写下的设计宪法](/study/papers/rest-fielding-2000/) | ✅ v3 |  |
| [SKIP LOCKED — 让 Postgres 当任务队列用](/study/papers/skip-locked-postgres-95/) | ✅ v3 |  |

### 其他子类

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Islands Architecture — 静态页面里只让需要交互的小块加载 JS](/study/papers/islands-architecture/) | ✅ v3 |  |
| [nvm — 在同一台机器上轻松切换 Node 版本](/study/papers/nvm/) | ✅ v3 |  |
| [React Server Components — 让组件自己决定在哪台机器跑](/study/papers/react-server-components/) | ✅ v3 |  |
| [Server-Sent Events — 服务器单向推送的标准协议](/study/papers/server-sent-events/) | ✅ v3 |  |
| [Stripe Rate Limiters — 工业级令牌桶长什么样](/study/papers/token-bucket-stripe/) | ✅ v3 |  |

## 基础设施

共 12 篇。

### 基础设施

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [coturn — 帮 WebRTC 穿越 NAT 的开源中转服务器](/study/papers/coturn/) | ✅ v3 |  |
| [k3s — 把整个 Kubernetes 装进一个 70 MB 的二进制](/study/papers/k3s/) | ✅ v3 |  |
| [Kustomize — 不写模板也能给 K8s 配置分环境](/study/papers/kustomize/) | 🗄 存量 |  |
| [OpenSearch — AWS 主导的 Apache 2.0 搜索引擎分叉](/study/papers/opensearch/) | ✅ v3 |  |
| [TimelineJS — 一张 Google Sheet 直接变成交互时间轴](/study/papers/timelinejs/) | ✅ v3 |  |
| [Weights & Biases — 几行 init 把指标系统代码自动入库](/study/papers/wandb/) | ✅ v3 |  |

### infrastructure

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [EMQX — Erlang 写的 MQTT broker，单集群扛千万 IoT 长连接](/study/papers/emqx/) | ✅ v3 |  |
| [ShellCheck — 帮你抓 Bash 脚本里那些"半夜才发作"的坑](/study/papers/shellcheck/) | ✅ v3 |  |
| [StarRocks — Doris 分叉出来的向量化 CBO 国产 OLAP](/study/papers/starrocks/) | ✅ v3 |  |

### 其他子类

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Cheney 1970 — 把活对象复制走，原地丢弃整片堆](/study/papers/cheney-gc/) | ✅ v3 |  |
| [Mermaid — 用文本写图，让代码评审能 diff 流程图](/study/papers/mermaid/) | ✅ v3 |  |
| [Scoop — Windows 上像 Homebrew 一样装命令行工具](/study/papers/scoop/) | ✅ v3 |  |

## 网络协议

共 66 篇。

### 网络协议

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Akamai 2010 — 从内容分发网络长成全球应用平台](/study/papers/akamai-2010/) | ✅ v3 |  |
| [Amplification Hell 2014 — 把家用宽带放大成几百 Gbps 的反射攻击](/study/papers/amplification-hell-2014/) | ✅ v3 |  |
| [Andromeda — Google Cloud 网络虚拟化的高速通道](/study/papers/andromeda-2018/) | ✅ v3 |  |
| [B4 — Google 用 SDN 把跨数据中心 WAN 利用率拉到 95%+](/study/papers/b4-2013/) | ✅ v3 |  |
| [BBR 2017 — 用瓶颈带宽和最小 RTT 替代丢包当拥塞信号](/study/papers/bbr-2017/) | ✅ v3 |  |
| [BitTorrent — 用"以牙还牙"逼大家都上传](/study/papers/bittorrent-2003/) | ✅ v3 |  |
| [Caesar-Rexford 2005 — 你的包为什么绕了大半个地球](/study/papers/caesar-rexford-2005/) | ✅ v3 |  |
| [Calder 2015 — Anycast CDN 在生产环境真的能用吗](/study/papers/calder-2015-anycast-cdn/) | ✅ v3 |  |
| [Cerf-Kahn 1974 — 用网关把异构网络拼成一个互联网](/study/papers/cerf-kahn-1974/) | ✅ v3 |  |
| [Chaum Mix Network — 把匿名通信从理论变成工程](/study/papers/chaum-1981-mix/) | ✅ v3 |  |
| [Chord — 让上万台机器排成圈，查任何 key 都只走 log N 步](/study/papers/chord-2001/) | ✅ v3 |  |
| [Clark 1988 — TCP/IP 七大目标的优先级，决定了 Internet 长成今天这样](/study/papers/clark-1988/) | ✅ v3 |  |
| [CoDoNS — 用 P2P 哈希表替代分层 DNS 的实验](/study/papers/codons-2004/) | ✅ v3 |  |
| [CUBIC 2008 — Linux 默认拥塞控制，三次曲线把千兆带宽喂饱](/study/papers/cubic-2008/) | ✅ v3 |  |
| [New Directions 1976 — 给协议世界写下公钥宪法](/study/papers/diffie-hellman-1976/) | ✅ v3 |  |
| [DNS — 把全球域名解析切成一棵可分布维护的树](/study/papers/dns/) | ✅ v3 |  |
| [DONAR 2010 — 把 DNS 全球调度写成一道可解的优化题](/study/papers/donar-2010/) | ✅ v3 |  |
| [DoT/DoH 性能 — 给 DNS 加密之后网页变快还是变慢](/study/papers/dot-doh-perf-2020/) | ✅ v3 |  |
| [Ethane 2007 — 把企业网安全策略集中到一台中央电脑上](/study/papers/ethane-2007/) | ✅ v3 |  |
| [Fat-Tree 2008 — 用一堆便宜交换机搭出现代数据中心](/study/papers/fat-tree-2008/) | ✅ v3 |  |
| [Fielding 2000 — 用约束推导法把 Web 的成功讲成了一门方法](/study/papers/fielding-rest-2000/) | ✅ v3 |  |
| [Frenetic 2011 — 把 OpenFlow 流表换成函数式程序](/study/papers/frenetic-2011/) | ✅ v3 |  |
| [Gao 2001 — 用算法猜出互联网上 AS 之间谁给谁付钱](/study/papers/gao-2001-as-relations/) | ✅ v3 |  |
| [Analysis and Design of the Google Congestion Control for Web Real-time Communication (WebRTC)](/study/papers/gcc-webrtc-2016/) | ✅ v3 |  |
| [Heartbleed — 一个忘了写边界检查的 bug 让全网 1/3 的 HTTPS 站点漏内存](/study/papers/heartbleed-2014/) | ✅ v3 |  |
| [HTTP/2 — 把 HTTP 从文本协议改造成二进制多路复用](/study/papers/http-2/) | ✅ v3 |  |
| [Interactive Connectivity Establishment (ICE): A Protocol for Network Address Translator (NAT) Traversal](/study/papers/ice-rfc-5245/) | ✅ v3 |  |
| [IPFS — 把"地址"换成"内容本身"的 P2P 文件系统](/study/papers/ipfs-2014/) | ✅ v3 |  |
| [Jacobson 1988 — 让互联网不再被自己塞死](/study/papers/jacobson-1988/) | ✅ v3 |  |
| [Jupiter Rising — Google 数据中心网络十年怎么做到带宽涨百倍](/study/papers/jupiter-2015/) | ✅ v3 |  |
| [Kademlia — 用 XOR 当距离的 P2P 路由表](/study/papers/kademlia-2002/) | ✅ v3 |  |
| [Karger 1997 一致性哈希 — 加机器不用全员搬家](/study/papers/karger-1997-consistent-hashing/) | ✅ v3 |  |
| [Krishnamurthy 1999 — HTTP/1.0 到 1.1 究竟改了什么](/study/papers/krishnamurthy-1999-http11/) | ✅ v3 |  |
| [Logjam 2015 — 全世界共用一把锁，国家级窃听者一次撬完](/study/papers/logjam-2015/) | ✅ v3 |  |
| [Lucky 13 — 用毫秒级时间差把 TLS 加密看穿](/study/papers/lucky13-2013/) | ✅ v3 |  |
| [Mahajan 2002 — 三周看互联网，1% 的路由更新是手滑](/study/papers/mahajan-2002-bgp-misconfig/) | ✅ v3 |  |
| [Metcalfe-Boggs 1976 — 一根线上几百台电脑怎么不打架](/study/papers/metcalfe-boggs-1976/) | ✅ v3 |  |
| [NTP 1991 — 用四个时间戳和一棵服务器树，让全互联网的钟差几毫秒](/study/papers/mills-ntp-1991/) | ✅ v3 |  |
| [Triple Handshake — TLS 同一把主密钥被复用，黑客就能换人不换锁](/study/papers/mitls-2014-triple-handshake/) | ✅ v3 |  |
| [Mockapetris 1988 DNS — 设计者亲口讲为什么 DNS 长这样](/study/papers/mockapetris-1988-dns/) | ✅ v3 |  |
| [Mogul 1995 — 为什么 HTTP 必须改成"一根连接复用多次请求"](/study/papers/mogul-1995-persistent-http/) | ✅ v3 |  |
| [MPTCP 2012 — 把一根 TCP 管道变成多条并行水管](/study/papers/mptcp-2012/) | ✅ v3 |  |
| [MQTT-S 2008 — 把发布/订阅消息机制装进传感器芯片](/study/papers/mqtt-s-2008/) | ✅ v3 |  |
| [NetKAT 2014 — 把网络转发写成可以做数学等式变换的代数式](/study/papers/netkat-2014/) | ✅ v3 |  |
| [OpenFlow 2008 — 把交换机的『分拣规则』搬到一台中央电脑上](/study/papers/openflow-2008/) | ✅ v3 |  |
| [P4 — 让交换机的转发逻辑像写代码一样改](/study/papers/p4-2014/) | ✅ v3 |  |
| [Padmanabhan-Mogul 1995 — 把 HTTP 三种提速方案放一起跑，看谁真的快](/study/papers/padmanabhan-1995-http-latency/) | ✅ v3 |  |
| [Pastry — 用 nodeId 的前缀一位一位逼近目标](/study/papers/pastry-2001/) | ✅ v3 |  |
| [R-BGP 2007 — 故障切换前先把备份路径塞进邻居口袋](/study/papers/r-bgp-2007/) | ✅ v3 |  |
| [RED — 让路由器在队列还没塞满时就提前丢包](/study/papers/red-1993/) | ✅ v3 |  |
| [RFC 3833 — IETF 第一次正式承认 DNS 不安全](/study/papers/rfc-3833-dns-threats/) | ✅ v3 |  |
| [RON 2001 — 让一小撮节点自己绕开 BGP 故障](/study/papers/ron-2001/) | ✅ v3 |  |
| [RTP RFC 1889 — 让 UDP 也能跑实时音视频](/study/papers/rtp-rfc-1889/) | ✅ v3 |  |
| [Salsify: Low-Latency Network Video Through Tighter Integration Between a Video Codec and a Transport Protocol](/study/papers/salsify-2018/) | ✅ v3 |  |
| [End-to-End Arguments — 把功能尽量推到端上做](/study/papers/saltzer-1984-e2e/) | ✅ v3 |  |
| [CMT-SCTP 2006 — 让两条网络路径同时干活而不打架](/study/papers/sctp-multipath-2006/) | ✅ v3 |  |
| [Subramanian 2002 — 用多个观察点把互联网切成 5 层](/study/papers/subramanian-2002-internet-hierarchy/) | ✅ v3 |  |
| [TCP Vegas 1995 — 不等丢包，靠 RTT 早一步看见拥塞](/study/papers/tcp-vegas-1995/) | ✅ v3 |  |
| [TLS 1.3 — 把 HTTPS 握手砍到一个来回](/study/papers/tls-13/) | ✅ v3 |  |
| [Tor 洋葱路由 — 让你的网络请求穿上三层马甲](/study/papers/tor-2004/) | ✅ v3 |  |
| [VL2 — 让一万台服务器像在同一台交换机上](/study/papers/vl2-2009/) | ✅ v3 |  |
| [How Speedy is SPDY — 换协议没让网页变快多少](/study/papers/wang-2014-spdy/) | ✅ v3 |  |
| [WebSocket RFC 6455 — 让浏览器和服务器开一条不挂断的双向电话](/study/papers/websocket-rfc-6455/) | ✅ v3 |  |
| [WireGuard: Next Generation Kernel Network Tunnel](/study/papers/wireguard-2017/) | ✅ v3 |  |

### 其他子类

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [QUIC — 把可靠传输从内核搬到用户空间](/study/papers/quic/) | ✅ v3 |  |
| [TCP — 在不可靠的 IP 上凿出一条 reliable 字节流](/study/papers/tcp/) | ✅ v3 |  |

## 图形学

共 122 篇。

### 渲染与图形

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Baraff-Witkin 1998 — 让布料模拟敢走大时间步](/study/papers/baraff-witkin-1998-cloth/) | ✅ v3 |  |
| [k-d 树 — 多维空间里的二叉搜索树](/study/papers/bentley-1975-kdtree/) | ✅ v3 |  |
| [Blinn 1977 — 用半角向量 H 把高光算量减半](/study/papers/blinn-1977/) | ✅ v3 |  |
| [Burgess 2020 RTX ON — Turing 把光线追踪做进硅片](/study/papers/burgess-2020-turing-rt/) | ✅ v3 |  |
| [Catmull 1974 Z-buffer — 用一张深度图解决谁挡谁的问题](/study/papers/catmull-1974-zbuffer/) | ✅ v3 |  |
| [Catmull-Clark 1978 — 让任意拓扑网格收敛成光滑曲面](/study/papers/catmull-clark-1978/) | ✅ v3 |  |
| [Cohen-Greenberg 1985 Hemicube — 把渲染硬件挪去算辐射度积分](/study/papers/cohen-1985-hemicube/) | ✅ v3 |  |
| [Distributed Ray Tracing — 把所有"模糊"效果统一成随机采样](/study/papers/cook-1984-distributed-ray-tracing/) | ✅ v3 |  |
| [Cook 1986 — 用噪声换掉锯齿](/study/papers/cook-1986-stochastic-sampling/) | ✅ v3 |  |
| [Cook-Torrance 1982 — 把镜面反射拆成微面元 × 几何遮挡 × Fresnel](/study/papers/cook-torrance-1982/) | ✅ v3 |  |
| [Curless-Levoy TSDF — 把多次扫描融成一个干净的 3D 模型](/study/papers/curless-levoy-1996-tsdf/) | ✅ v3 |  |
| [Debevec 1998 — 用真实世界的光照亮 CG 物体](/study/papers/debevec-1998-rendering-with-natural-light/) | ✅ v3 |  |
| [Deering 1988 Triangle Processor — 现代 GPU 的祖先架构](/study/papers/deering-1988-triangle-processor/) | ✅ v3 |  |
| [Desbrun 1999 — 把热扩散方程隐式离散到三角网](/study/papers/desbrun-1999-implicit-fairing/) | ✅ v3 |  |
| [Disney Principled BRDF 2012 — 11 个滑块封装 Cook-Torrance 全家桶](/study/papers/disney-brdf-2012/) | ✅ v3 |  |
| [QEM — 给三角网格『瘦身』时算每一刀的代价](/study/papers/garland-heckbert-1997-qem/) | ✅ v3 |  |
| [Goldsmith-Salmon 1987 — 让计算机自己给场景搭层次包围盒](/study/papers/goldsmith-1987-bvh/) | ✅ v3 |  |
| [Goral 1984 Radiosity — 把建筑工程的辐射热传导算法搬进图形学](/study/papers/goral-1984-radiosity/) | ✅ v3 |  |
| [Lumigraph — 给 4D 光场加一层粗糙几何，让插值不再鬼影](/study/papers/gortler-1996-lumigraph/) | ✅ v3 |  |
| [Hanrahan 1991 Hierarchical Radiosity — 让 radiosity 从 O(n²) 跌到 O(n)](/study/papers/hanrahan-1991-hierarchical-radiosity/) | ✅ v3 |  |
| [Heckbert 1986 — 把"贴图"这件事讲清楚的第一篇综述](/study/papers/heckbert-1986-texture-survey/) | ✅ v3 |  |
| [MLS-MPM — 把 MPM 重写到"几百行能跑实时"的现代版本](/study/papers/hu-2018-mls-mpm/) | ✅ v3 |  |
| [Jensen 光子映射 — 先撒光子再查密度的两 pass 全局光照](/study/papers/jensen-1996-photon-mapping/) | ✅ v3 |  |
| [Kajiya 渲染方程 — 把所有渲染算法统一成一个积分方程](/study/papers/kajiya-1986-rendering-equation/) | ✅ v3 |  |
| [Karis 2014 TAA — 让游戏每帧只采一次也能 4K 不锯齿](/study/papers/karis-2014-taa/) | ✅ v3 |  |
| [Karis UE4 PBR — 把电影质感塞进游戏的 33 毫秒](/study/papers/karis-2014-ue4-pbr/) | ✅ v3 |  |
| [Karras 2012 — 让每个 BVH 内部节点独立算自己（O(N) 全并行 GPU 构建）](/study/papers/karras-2012-parallel-bvh/) | ✅ v3 |  |
| [Poisson Surface Reconstruction — 把点云变成水密网格的全局解法](/study/papers/kazhdan-2006-poisson-recon/) | ✅ v3 |  |
| [Lafortune-Willems 1993 — 从相机和光源同时撒光线再"接龙"](/study/papers/lafortune-1993-bdpt/) | ✅ v3 |  |
| [Light Field Rendering — 把场景拍成 4D 数组，新视角靠查表](/study/papers/levoy-hanrahan-1996-light-field/) | ✅ v3 |  |
| [redner — 让光线追踪能反向传播过几何边缘](/study/papers/li-2018-redner/) | ✅ v3 |  |
| [Lindholm 2008 Tesla — SM、warp、SIMT 这套词汇的官方出生证明](/study/papers/lindholm-2008-tesla/) | ✅ v3 |  |
| [DLSS 2.0 — 把 4K 实时渲染的一半工作量交给神经网络](/study/papers/liu-2020-dlss/) | ✅ v3 |  |
| [Loop 1987 — 三角形网格的递归光滑细分](/study/papers/loop-1987-subdivision/) | ✅ v3 |  |
| [Position Based Fluids — 把水也塞进 PBD 同一套框架](/study/papers/macklin-2014-position-based-fluids/) | ✅ v3 |  |
| [Marching Cubes 1987 — 把体数据切成立方体查表生成三角网格](/study/papers/marching-cubes-1987/) | ✅ v3 |  |
| [Meagher 1982 八叉树 — 把立方体一分为八，递归地装下一整个 3D 世界](/study/papers/meagher-1982-octree/) | ✅ v3 |  |
| [SPH — 把流体拆成一群带核的粒子](/study/papers/monaghan-1992-sph/) | ✅ v3 |  |
| [Position Based Dynamics — 跳过力，直接挪位置](/study/papers/mueller-2007-pbd/) | ✅ v3 |  |
| [Instant-NGP — 把 NeRF 训练从几小时压到 5 秒](/study/papers/mueller-2022-instant-ngp/) | ✅ v3 |  |
| [NeRF — 用一个 MLP 把整个场景"背"下来](/study/papers/nerf-2020/) | ✅ v3 |  |
| [KinectFusion — 用消费级深度相机实时重建三维世界](/study/papers/newcombe-2011-kinectfusion/) | ✅ v3 |  |
| [Nickolls-Dally 2010 — GPU 怎么从画三角形变成跑 AI](/study/papers/nickolls-dally-2010-cuda-era/) | ✅ v3 |  |
| [Mitsuba 2 — 一份渲染代码同时编出 CPU / GPU / 可微版](/study/papers/nimier-david-2019-mitsuba2/) | ✅ v3 |  |
| [Owens 2007 GPGPU 综述 — CUDA 之前 GPU 通用计算的黑魔法时代](/study/papers/owens-2007-gpgpu-survey/) | ✅ v3 |  |
| [DeepSDF — 用一个 MLP 把整类 3D 形状的距离场背下来](/study/papers/park-2019-deepsdf/) | ✅ v3 |  |
| [Perlin Noise — 让计算机生成的图像不再有"机器味"](/study/papers/perlin-1985-noise/) | ✅ v3 |  |
| [Phong 1975 — 把光照拆成环境+漫反射+高光三项](/study/papers/phong-1975/) | ✅ v3 |  |
| [Plenoxels — 不要神经网络也能渲染辐射场](/study/papers/plenoxels-2022/) | ✅ v3 |  |
| [Saito-Takahashi 1990 — 第一次提出 G-buffer 的论文](/study/papers/saito-takahashi-1990-gbuffer/) | ✅ v3 |  |
| [Sorkine 2004 — 用拉普拉斯坐标编辑网格，拽把手不丢细节](/study/papers/sorkine-2004-laplacian-editing/) | ✅ v3 |  |
| [Stable Fluids — 让流体模拟时间步随便给都不爆](/study/papers/stam-1999-stable-fluids/) | ✅ v3 |  |
| [MPM — 让粒子背着自己的历史，借网格算一遍力](/study/papers/sulsky-1994-mpm/) | ✅ v3 |  |
| [Taubin 1995 — 把网格平滑当成低通滤波](/study/papers/taubin-1995-mesh-smoothing/) | ✅ v3 |  |
| [Veach MIS — 用一行加权公式让多种采样策略各取所长](/study/papers/veach-1995-mis/) | ✅ v3 |  |
| [Veach MLT — 用 Metropolis 在路径空间游走，专攻 BDPT 也算不动的难场景](/study/papers/veach-1997-mlt/) | ✅ v3 |  |
| [Wald 2007 — 把 SAH BVH 构建从分钟级砍到秒级的 binned 近似法](/study/papers/wald-2007-sah-bvh/) | ✅ v3 |  |
| [Ward 1992 — 第一个能落地的各向异性反射模型](/study/papers/ward-1992/) | ✅ v3 |  |
| [Whitted 1980 — 让光线在场景里递归跑三种次级射线](/study/papers/whitted-1980/) | ✅ v3 |  |
| [Williams 1983 mipmap — 提前烤好金字塔，纹理过滤变 O(1)](/study/papers/williams-1983-mipmap/) | ✅ v3 |  |

### GPU 架构

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Alpa — 把张量/流水/数据并行统一成一道搜索题](/study/papers/alpa-2022/) | ✅ v3 |  |
| [Amdahl 定律 — 串行比例决定并行加速比的上界](/study/papers/amdahl-law-1967/) | ✅ v3 |  |
| [NVIDIA Ampere — 第三代 Tensor Core 加 TF32 / BF16 / FP64，结构化稀疏 + MIG 重写大模型时代硬件假设](/study/papers/ampere-architecture-2020/) | ✅ v3 |  |
| [Aurora 2024 — 不用 NVIDIA 也能造 2 EFLOPS 超算](/study/papers/aurora-exascale-2024/) | ✅ v3 |  |
| [AWQ 2023 — 让 70B 大模型住进 RTX 4090](/study/papers/awq-2023/) | ✅ v3 |  |
| [big.LITTLE — 让一颗芯片同时装快核和省电核](/study/papers/big-little-2011/) | ✅ v3 |  |
| [NVIDIA Blackwell — 双 die NV-HBI + 第二代 Transformer Engine + FP4 让万亿参数训练日常化](/study/papers/blackwell-architecture-2024/) | ✅ v3 |  |
| [Blink — 按拓扑动态拼生成树替代 NCCL ring](/study/papers/blink-2020/) | ✅ v3 |  |
| [Yeh-Patt 1991 — 用最近 12 条分支的历史给 CPU 算命](/study/papers/branch-prediction-yeh-patt-1991/) | ✅ v3 |  |
| [Brook for GPUs — 让显卡第一次能用人话编程](/study/papers/brook-2004/) | ✅ v3 |  |
| [Case for RISC 1980 — 一篇没有芯片的论文，掀起 CPU 半世纪革命](/study/papers/case-for-risc-1980/) | ✅ v3 |  |
| [Cell BE — 一颗 CPU 里塞 8 个加速核](/study/papers/cell-be-2005/) | ✅ v3 |  |
| [CUDA Streams 并发量化研究 — 为什么 SM 利用率拉不满](/study/papers/cuda-streams-concurrency-2018/) | ✅ v3 |  |
| [cuDNN — 把卷积写成矩阵乘，让所有深度学习框架共享底层加速](/study/papers/cudnn-2014/) | ✅ v3 |  |
| [CUTLASS — 把 SOTA GEMM 拆成可组合的 C++ 模板层级](/study/papers/cutlass-2020/) | ✅ v3 |  |
| [Stanford DASH — 第一台真跑起来的目录式 CC-NUMA 多处理器](/study/papers/dash-numa-1992/) | ✅ v3 |  |
| [FasterTransformer 2021 — NVIDIA 第一代开源 LLM 推理引擎](/study/papers/fastertransformer-2021/) | ✅ v3 |  |
| [NVIDIA Fermi — 把 GPU 从游戏卡推上超算](/study/papers/fermi-architecture-2010/) | ✅ v3 |  |
| [FPGA HLS 2011 — 把 C 代码自动翻译成芯片电路的范式](/study/papers/fpga-hls-2011/) | ✅ v3 |  |
| [PyTorch FSDP — 把大模型切成 N 份分到 N 张卡](/study/papers/fsdp-2023/) | ✅ v3 |  |
| [GPipe — micro-batch 流水线让 GPU 排成生产线](/study/papers/gpipe-2019/) | ✅ v3 |  |
| [GPTQ — 把 175B 大模型压成 4-bit 还几乎不掉点](/study/papers/gptq-2023/) | ✅ v3 |  |
| [GPU 缓存一致性 — 用时戳代替失效消息](/study/papers/gpu-cache-coherence-2013/) | ✅ v3 |  |
| [GPU 微基准 — 用秒表把闭源芯片"戳"出真相](/study/papers/gpu-microbenchmarking-2010/) | ✅ v3 |  |
| [GPUDirect RDMA — 让网卡直接读写 GPU 显存](/study/papers/gpudirect-rdma-2014/) | ✅ v3 |  |
| [GShard — 用注解让 600B 模型自动跨设备切片](/study/papers/gshard-2020/) | ✅ v3 |  |
| [NVIDIA Hopper — Transformer Engine + FP8 + TMA + Thread Block Cluster 把硅片为 LLM 量身定制](/study/papers/hopper-architecture-2022/) | ✅ v3 |  |
| [NVIDIA Kepler — 把 GPU 调成深度学习训练默认机型](/study/papers/kepler-architecture-2012/) | ✅ v3 |  |
| [Kokkos — 一份 C++ 代码同时跑 CPU、GPU、Xeon Phi](/study/papers/kokkos-2014/) | ✅ v3 |  |
| [LLM.int8() — 大模型激活值里藏着几个超大异常通道](/study/papers/llm-int8-2022/) | ✅ v3 |  |
| [NVIDIA Maxwell — 同一工艺节点把性能每瓦翻一倍](/study/papers/maxwell-architecture-2014/) | ✅ v3 |  |
| [McFarling 1993 — 用 XOR 把全局历史和 PC 拧在一起，再让两个预测器打擂台](/study/papers/mcfarling-bp-1993/) | ✅ v3 |  |
| [Medusa — 让大模型自己同时猜好几个 token](/study/papers/medusa-2024/) | ✅ v3 |  |
| [MIPS 1981 — 让编译器自己安排流水线，CPU 就不用管](/study/papers/mips-1981/) | ✅ v3 |  |
| [Sweazey-Smith MOESI 1986 — 给多核 CPU 一份"谁手里有这块内存"的统一规则](/study/papers/moesi-cache-coherence-1986/) | ✅ v3 |  |
| [NVLink 2.0 + NVSwitch — 把 16 块 GPU 拼成一台机器](/study/papers/nvlink-nvswitch-2018/) | ✅ v3 |  |
| [NVMe — 为 SSD 重写的存储协议](/study/papers/nvme-protocol-2017/) | ✅ v3 |  |
| [OpenCL 2010 — 一份代码同时跑 CPU/GPU/DSP/FPGA 的开放标准](/study/papers/opencl-2010/) | ✅ v3 |  |
| [Orca — Transformer 生成模型的分布式推理调度](/study/papers/orca-2022/) | ✅ v3 |  |
| [NVIDIA Pascal P100 — HBM2 + NVLink + FP16 让 Tesla 真正变成 AI 卡](/study/papers/pascal-architecture-2016/) | ✅ v3 |  |
| [PMFS — 第一个为字节寻址持久内存设计的文件系统](/study/papers/persistent-memory-2014/) | ✅ v3 |  |
| [PipeDream — 1F1B 调度让流水线工位别空等](/study/papers/pipedream-2019/) | ✅ v3 |  |
| [Quantum Supremacy 2019 — 量子机用 200 秒做完超算 1 万年的事](/study/papers/quantum-supremacy-2019/) | ✅ v3 |  |
| [Ring All-Reduce — 把 HPC 的环形规约搬进深度学习](/study/papers/ring-allreduce-2017/) | ✅ v3 |  |
| [RISC I — 砍掉 90% 指令反而让 CPU 跑得更快](/study/papers/risc-i-1981/) | ✅ v3 |  |
| [SGLang — 把 LLM 程序当成共享前缀的树来跑](/study/papers/sglang-2024/) | ✅ v3 |  |
| [SmoothQuant 2023 — 把激活的烫手山芋扔给权重](/study/papers/smoothquant-2023/) | ✅ v3 |  |
| [SparseGPT — 175B 大模型一次过剪 50%，不重训](/study/papers/sparsegpt-2023/) | ✅ v3 |  |
| [SpecInfer — 让大模型一次"猜一棵树"再并行验证](/study/papers/specinfer-2023/) | ✅ v3 |  |
| [SYCL 2020 — 用一份标准 C++ 让 GPU/CPU/加速器一起跑](/study/papers/sycl-cpp-2020/) | ✅ v3 |  |
| [TASO — 让机器自己发现深度学习图重写规则](/study/papers/taso-2019/) | ✅ v3 |  |
| [TensorRT-LLM — NVIDIA 把 FT 升级成可调度的官方推理栈](/study/papers/tensorrt-llm-2023/) | ✅ v3 |  |
| [NVIDIA Tesla — 把显卡改造成通用并行计算机](/study/papers/tesla-architecture-2008/) | ✅ v3 |  |
| [Thrust — 让 GPU 编程像写 STL 一样一行调用](/study/papers/thrust-2010/) | ✅ v3 |  |
| [Tomasulo 算法 — 让 CPU 自己决定指令的执行顺序](/study/papers/tomasulo-1967/) | ✅ v3 |  |
| [Triton 2019 — 让 Python 写出贴近 cuBLAS 的 GPU kernel](/study/papers/triton-2019/) | ✅ v3 |  |
| [NVIDIA Turing — RT Core 把光追装进消费卡，Tensor Core 第二代下放 INT8](/study/papers/turing-architecture-2018/) | ✅ v3 |  |
| [TVM OSDI 2018 — 把 Halide 思想搬到深度学习](/study/papers/tvm-2018/) | ✅ v3 |  |
| [CUDA Unified Memory — 让 CPU 和 GPU 共享一张内存地图](/study/papers/unified-memory-2014/) | ✅ v3 |  |
| [NVIDIA Volta V100 — 第一代 Tensor Core 把 AI 训练算力一夜抬 6 倍](/study/papers/volta-architecture-2017/) | ✅ v3 |  |

### 其他子类

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [3D Gaussian Splatting — 用一堆 3D 模糊光斑重建场景](/study/papers/3d-gaussian-splatting/) | ✅ v3 |  |
| [FlashAttention — 不改算法，只改数据怎么进 GPU](/study/papers/flash-attention/) | ✅ v3 |  |

## 形式化方法

共 51 篇。

### 形式化验证

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [ACL2 — 用纯 Lisp 当数学对象，机器证明工业级硬件正确](/study/papers/acl2-2000/) | ✅ v3 |  |
| [Apron — 把区间/八边形/多面体塞进同一个插槽](/study/papers/apron-2009/) | ✅ v3 |  |
| [Awodey-Warren — 把『相等的证明』看成两点之间的路径](/study/papers/awodey-warren-2009/) | ✅ v3 |  |
| [Bounded Model Checking — 把硬件验证翻译成一道 SAT 题](/study/papers/biere-bmc-1999/) | ✅ v3 |  |
| [Boogie — 写一次验证后端，多种证明语言复用](/study/papers/boogie-2005/) | ✅ v3 |  |
| [CertiKOS — 把整个并发内核拆成 30 多层每层都被 Coq 证过](/study/papers/certikos-2016/) | ✅ v3 |  |
| [Chaff 2001 — 把 CDCL 工程化的两个杀手锏](/study/papers/chaff-2001/) | ✅ v3 |  |
| [Chapar — 第一个被机器证明的因果一致 KV 存储](/study/papers/chapar-2016/) | ✅ v3 |  |
| [NuSMV 2 — 把 BDD 和 SAT 两种验证引擎装进同一个开源工具](/study/papers/cimatti-nusmv-2002/) | ✅ v3 |  |
| [CEGAR — 用反例自动改进抽象，让大软件能被验证](/study/papers/clarke-cegar-2003/) | ✅ v3 |  |
| [Clarke-Emerson 1981 — 让机器自己检查并发程序对不对](/study/papers/clarke-emerson-1981/) | ✅ v3 |  |
| [Cousot-Halbwachs 凸多面体域 — 让分析器自己发现变量间的线性关系](/study/papers/cousot-halbwachs-polyhedra-1978/) | ✅ v3 |  |
| [CryptoVerif — 让计算机直接证密码协议在真实计算模型下安全](/study/papers/cryptoverif-2008/) | ✅ v3 |  |
| [Cubical Type Theory — 让 Univalence 公理真的能算出结果](/study/papers/cubical-type-theory-2018/) | ✅ v3 |  |
| [Dafny — 把"代码该满足的条件"直接写进语法，编译器自动证明](/study/papers/dafny-2010/) | ✅ v3 |  |
| [Davis-Putnam 1960 — 让机器自动判断一堆逻辑式能不能同时成立](/study/papers/davis-putnam-1960/) | ✅ v3 |  |
| [Disel — 把分布式协议拆成可独立证明、可拼装的 Coq 模块](/study/papers/disel-2018/) | ✅ v3 |  |
| [DPLL 1962 — 把"逻辑判定"从内存爆炸救成栈式回溯](/study/papers/dpll-1962/) | ✅ v3 |  |
| [EasyCrypt — 让密码学家的安全证明能被机器自动检查](/study/papers/easycrypt-2011/) | ✅ v3 |  |
| [Frama-C — 一个开源平台把 C 程序的多种验证方法拼到一起](/study/papers/frama-c-2012/) | ✅ v3 |  |
| [Graf-Saïdi — 用谓词把无限状态压成有限抽象](/study/papers/graf-saidi-1997/) | ✅ v3 |  |
| [HACL* — 用数学证明过的 C 加密代码，跑在你 Firefox 和 Linux 内核里](/study/papers/hacl-star-2017/) | ✅ v3 |  |
| [HOL Light — 不到 500 行 OCaml 写出能证开普勒猜想的证明助手](/study/papers/hol-light-2009/) | ✅ v3 |  |
| [SPIN — 让计算机帮你穷举并发程序的所有可能执行](/study/papers/holzmann-spin-1997/) | ✅ v3 |  |
| [HoTT Book — 把"相等"重定义为路径，再让数学和程序共用同一本教材](/study/papers/hott-book-2013/) | ✅ v3 |  |
| [Hyperkernel — 让 SMT 求解器一键验证操作系统内核](/study/papers/hyperkernel-2017/) | ✅ v3 |  |
| [Iris 2015 — 把并发推理拆成 monoid + invariant 两块积木](/study/papers/iris-2015/) | ✅ v3 |  |
| [IronFleet — 把分布式协议证到一行 bug 都没有](/study/papers/ironfleet-2015/) | ✅ v3 |  |
| [Isabelle/HOL — 让程序证明像写数学论文一样可读](/study/papers/isabelle-hol-2002/) | ✅ v3 |  |
| [Kami — 在 Coq 里造硬件并自动编译到 Verilog](/study/papers/kami-2017/) | ✅ v3 |  |
| [TLA — 把状态机和时序逻辑捏成一个公式](/study/papers/lamport-tla-1994/) | ✅ v3 |  |
| [GRASP 1996 — 让 SAT 求解器从冲突里学到东西](/study/papers/marques-silva-grasp-1996/) | ✅ v3 |  |
| [McMillan SMV 1993 — 把状态空间从 10^6 推到 10^20 的符号模型检测](/study/papers/mcmillan-smv-1993/) | ✅ v3 |  |
| [Miné 八边形抽象域 — 在区间和多面体之间的甜点](/study/papers/mine-octagon-2006/) | ✅ v3 |  |
| [MiniSat 2003 — 600 行 C++ 把 CDCL 写成教科书](/study/papers/minisat-2003/) | ✅ v3 |  |
| [Nelson-Oppen 1979 — 让多个判定程序坐下来交换"我刚发现 a=b"](/study/papers/nelson-oppen-1979/) | ✅ v3 |  |
| [Nieuwenhuis-Oliveras-Tinelli 2006 — 给 SMT 求解器写一套数学规则书](/study/papers/nieuwenhuis-dpll-t-2006/) | 🗄 存量 |  |
| [Nuprl — 第一个把 Martin-Löf 类型论搬上屏幕的证明助手](/study/papers/nuprl-1986/) | ✅ v3 |  |
| [Pnueli 时序逻辑 — 给"永远不死锁""请求最终被响应"找一套数学语言](/study/papers/pnueli-temporal-1977/) | ✅ v3 |  |
| [ProVerif — 把密码协议翻成 Prolog 规则让计算机自己证安全](/study/papers/proverif-2001/) | ✅ v3 |  |
| [Stainless — 让编译器替你证明 Scala 函数真的满足规约](/study/papers/stainless-2017/) | ✅ v3 |  |
| [Tamarin — 让计算机自己证 Signal、TLS 1.3 这种带 DH 的协议是不是真安全](/study/papers/tamarin-2012/) | ✅ v3 |  |
| [TLC — 让 TLA+ 规范可以一键机检的模型检查器](/study/papers/tla-yu-tlc-1999/) | ✅ v3 |  |
| [VAMP — 把一颗有流水线、乱序、浮点和 cache 的处理器从门电路证到指令集](/study/papers/vamp-verisoft-2006/) | ✅ v3 |  |
| [VCC — 给并发 C 加注解，让 SMT 自动证它对](/study/papers/vcc-2009/) | ✅ v3 |  |
| [Verdi — 在 Coq 里完整证明 Raft 协议的分布式系统验证框架](/study/papers/verdi-2015/) | ✅ v3 |  |
| [Verisoft — 把整台计算机从晶体管到邮件客户端全部用数学证完](/study/papers/verisoft-2008/) | ✅ v3 |  |
| [VST — 把 C 程序的数学证明一路带到机器码](/study/papers/vst-2014/) | ✅ v3 |  |
| [Why3 — 写一次程序规范，多个证明器一起来证](/study/papers/why3-2013/) | ✅ v3 |  |
| [Z3 2008 — 把 SMT 工程化到工业默认](/study/papers/z3-2008/) | ✅ v3 |  |

### 其他子类

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Gödel 1931 — 不完备性定理](/study/papers/godel-1931/) | ✅ v3 |  |

## 通信

共 1 篇。

### 其他子类

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Asterisk — 把企业总机做成一台 Linux 服务器](/study/papers/asterisk/) | ✅ v3 |  |

## 信息检索

共 52 篇。

### 检索与排序

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [ANCE — 让模型自己挖训练负例，对比学习的"自给自足"](/study/papers/ance-2020/) | ✅ v3 |  |
| [Anh-Moffat 2005 — 让倒排表压到接近熵下限还能 SIMD 解码](/study/papers/anh-moffat-2005/) | ✅ v3 |  |
| [Anserini — 把工业搜索引擎 Lucene 改造成学术 IR 实验台](/study/papers/anserini-2017/) | ✅ v3 |  |
| [BERT4Rec — 把 BERT 的 MLM 搬进序列推荐做双向建模](/study/papers/bert4rec-2019/) | ✅ v3 |  |
| [Block-Max WAND — 给倒排索引加分块上界，跳过算不过 top-k 的整块](/study/papers/block-max-wand-2011/) | ✅ v3 |  |
| [BPR — 用『i 比 j 更受欢迎』替代『i 是正例 j 是负例』](/study/papers/bpr-2009/) | ✅ v3 |  |
| [Brill-Moore 2000 — 把拼写纠错的编辑操作从单字符扩成任意子串](/study/papers/brill-moore-2000/) | ✅ v3 |  |
| [coCondenser — 让 BERT 的 [CLS] 在预训练就学会"代表整段话"](/study/papers/cocondenser-2021/) | ✅ v3 |  |
| [ColBERT — 让 BERT 检索既准又能扛大规模](/study/papers/colbert-2020/) | ✅ v3 |  |
| [Croft-Harper 1979 — 没有相关性反馈也能跑概率检索](/study/papers/croft-harper-1979/) | ✅ v3 |  |
| [DCN — 在 DNN 旁边并联一条专门学特征交叉的网络](/study/papers/dcn-2017/) | ✅ v3 |  |
| [DIN — 让推荐模型按你看的广告决定该激活你哪段历史](/study/papers/din-2018/) | ✅ v3 |  |
| [DLRM — Meta 把工业推荐模型拆成 4 个标准积木](/study/papers/dlrm-2019/) | ✅ v3 |  |
| [doc2query — 让模型替文档预想"会被怎么搜"再写进倒排表](/study/papers/doc2query-2019/) | ✅ v3 |  |
| [DPR — 用 BERT 双塔把检索从 BM25 时代拉进稠密向量时代](/study/papers/dpr-2020/) | ✅ v3 |  |
| [DRMM — 检索里的匹配是相关性不是语义相似](/study/papers/drmm-2016/) | ✅ v3 |  |
| [DSSM — 把 query 和文档各编码成 128 维向量再算余弦](/study/papers/dssm-2013/) | ✅ v3 |  |
| [E5 — 用海量"自然出现的文本对"训通用 embedding](/study/papers/e5-2022/) | ✅ v3 |  |
| [FILIP — 把 CLIP 的图文对齐细化到 token 级](/study/papers/filip-2021/) | ✅ v3 |  |
| [GBRank — 把决策树堆起来学排序，一棵树纠正一处错排](/study/papers/gbrank-2007/) | ✅ v3 |  |
| [Google 1998 — 把整个网络爬下来、压扁、再用一秒查到](/study/papers/google-1998/) | ✅ v3 |  |
| [HITS — 给网页同时打两个分：权威页 + 索引页](/study/papers/hits-1999/) | ✅ v3 |  |
| [Indri 2005 — 把语言模型、推断网络、结构化查询拼成一个搜索引擎](/study/papers/indri-2005/) | ✅ v3 |  |
| [K-NRM — 用核函数把交互矩阵变成可微排序信号](/study/papers/knrm-2017/) | ✅ v3 |  |
| [Koren-Bell-Volinsky 2009 — 把推荐系统的 MF 写成 8 页教科书](/study/papers/koren-mf-2009/) | ✅ v3 |  |
| [LambdaRank — 跳过定义损失函数，直接把梯度写出来](/study/papers/lambdarank-2006/) | ✅ v3 |  |
| [LSH — 让相似点撞同一个桶，把高维最近邻查询从线性变成亚线性](/study/papers/lsh-indyk-1998/) | ✅ v3 |  |
| [Maron-Kuhns 1960 — 检索不是匹配，是猜"对你有用的概率"](/study/papers/maron-kuhns-1960/) | ✅ v3 |  |
| [MinHash — 用最小哈希值估算两个集合的重叠度](/study/papers/minhash-broder-1997/) | ✅ v3 |  |
| [MS MARCO — 1 千万 Bing 真实查询喂饱神经检索的标准评测集](/study/papers/ms-marco-2016/) | ✅ v3 |  |
| [BellKor Netflix Prize 2009 — 集成学习赢下 100 万美金的工程实录](/study/papers/netflix-bellkor-2009/) | ✅ v3 |  |
| [NeuMF — 用神经网络替掉推荐系统的内积](/study/papers/neumf-2017/) | ✅ v3 |  |
| [Robertson-Walker 1994 — 把 2-Poisson 压成一行能算的公式](/study/papers/okapi-bm25-1994/) | ✅ v3 |  |
| [PageRank — 用随机游走给整个网络的页面打分](/study/papers/pagerank-1998/) | ✅ v3 |  |
| [Personalized PageRank — 给每个人一份属于自己的网页排名](/study/papers/personalized-pagerank-2003/) | ✅ v3 |  |
| [RankNet — 让搜索引擎学会比较两个结果谁更好](/study/papers/ranknet-2005/) | ✅ v3 |  |
| [RM3 — 让搜索引擎自己看一眼结果再重搜一次](/study/papers/rm3-2001/) | ✅ v3 |  |
| [RocketQA — 把稠密检索的训练拧到工业级](/study/papers/rocketqa-2021/) | ✅ v3 |  |
| [Salton VSM 1975 — 把文档变成向量再用余弦比相似度](/study/papers/salton-vsm-1975/) | ✅ v3 |  |
| [SASRec — 用 Transformer 的 self-attention 替 RNN 做下一步推荐](/study/papers/sasrec-2018/) | ✅ v3 |  |
| [ScaNN — 让向量量化只精修「客户会看到的那一面」](/study/papers/scann-2020/) | ✅ v3 |  |
| [SimHash — 用随机超平面把余弦相似度变成汉明距离](/study/papers/simhash-charikar-2002/) | ✅ v3 |  |
| [SimRank — 两个节点相似当且仅当它们的邻居相似](/study/papers/simrank-2002/) | ✅ v3 |  |
| [SLIM — 让数据自己学一张稀疏的"看了又看"权重表](/study/papers/slim-2011/) | ✅ v3 |  |
| [SPANN — 内存放中心、SSD 放向量的十亿级近邻检索](/study/papers/spann-2021/) | ✅ v3 |  |
| [SPLADE — 让神经网络学出稀疏向量，直接复用倒排索引](/study/papers/splade-2021/) | ✅ v3 |  |
| [TrustRank — 用一小撮可信种子把整张 Web 的信誉算出来](/study/papers/trustrank-2004/) | ✅ v3 |  |
| [Wide & Deep — 让模型同时学会"记住"和"举一反三"](/study/papers/wide-deep-2016/) | ✅ v3 |  |
| [YouTube 双塔召回 — 把 DSSM 搬进推荐并补上两件工业关键](/study/papers/youtube-two-tower-2019/) | ✅ v3 |  |

### 数据检索

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [BM25 — 给文档打分的"老配方"](/study/papers/bm25-okapi/) | ✅ v3 |  |
| [ColBERTv2 — 让向量检索既精又能扛百万文档](/study/papers/colbert-v2/) | ✅ v3 |  |
| [RRF — 把多个搜索结果列表合并成一个的最简单办法](/study/papers/rrf-cormack-2009/) | ✅ v3 |  |

## Agent

共 22 篇。

### 智能体与 LLM

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Agent-R1 — 把 LLM agent 当 RL 环境训练的模块化框架](/study/papers/agent-r1-2511/) | ✅ v3 |  |
| [APEX — 给自进化 agent 配一张"策略图"防止它走老路](/study/papers/apex-policy-exploration/) | ✅ v3 |  |
| [ClawTrace — 把 agent 每步操作的"成本账"先算清再蒸馏](/study/papers/clawtrace-cost-aware/) | ✅ v3 |  |
| [Code as Agent Harness — 把代码当 agent 的"骨架"来重新看 agentic AI](/study/papers/code-as-agent-harness/) | ✅ v3 |  |
| [EffiSkill — 把代码效率优化经验抽成两层 skill 库](/study/papers/effiskill/) | ✅ v3 |  |
| [EVE-Agent — 自我训练前先把证据钉在桌上](/study/papers/eve-agent-evidence/) | ✅ v3 |  |
| [Evo-Memory — 给"会自己长记性"的 agent 出一份统一考卷](/study/papers/evo-memory-2511/) | ✅ v3 |  |
| [EXG 经验图 — 把 agent 的成败拼成一张可复用的关系图](/study/papers/exg-experience-graphs/) | ✅ v3 |  |
| [LLM-Wiki — 把外部知识编译成 agent 自己的"维基"](/study/papers/llm-wiki-retrieval-reasoning/) | ✅ v3 |  |
| [MemCoder — code agent 跟着你 git commit 一起成长](/study/papers/memcoder-co-evolution/) | ✅ v3 |  |
| [MIND-Skill — 用归纳和演绎双 agent 抽 skill 并保证质量](/study/papers/mind-skill/) | ✅ v3 |  |
| [Misevolution — 自进化 agent 也会"越改越坏"，连顶配模型也躲不过](/study/papers/misevolution-2509/) | ✅ v3 |  |
| [MMSkills — 把视觉 agent 的"操作经验"做成多模态卡片](/study/papers/mmskills-multimodal/) | ✅ v3 |  |
| [自进化 AI agent 综述 — 给"会自己升级"的 agent 画一张统一地图](/study/papers/self-evolving-agents-survey/) | ✅ v3 |  |
| [Self-Evolving RecSys — 让 LLM agent 自己跑超参实验上线](/study/papers/self-evolving-recsys-2602/) | 🗄 存量 |  |
| [BDI-LLM Self-Evolving Agents — 让 agent 自己改自己源代码](/study/papers/self-evolving-software-agents/) | 🗄 存量 |  |
| [SkCC — 给 LLM agent 写一个真正的 skill 编译器](/study/papers/skcc-skill-compiler/) | ✅ v3 |  |
| [Skill-as-Pseudocode — 把 agent 笔记本写成可校验的伪代码](/study/papers/skill-as-pseudocode/) | ✅ v3 |  |
| [Skill-Pro — 不动权重学可复用 skill 的非参数 PPO](/study/papers/skill-pro-nonparametric-ppo/) | ✅ v3 |  |
| [Skill-SD — 用 agent 自己抽出的 skill 当 dynamic teacher 自蒸馏](/study/papers/skill-sd-self-distillation/) | ✅ v3 |  |
| [WebXSkill — 给 Web agent 的可执行 skill 是参数化代码 + URL 图索引](/study/papers/webxskill/) | ✅ v3 |  |
| [Zombie Agents — 自进化 agent 的长期记忆能被持久化"借尸还魂"](/study/papers/zombie-agents-2602/) | ✅ v3 |  |

## CLI

共 1 篇。

### 其他子类

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Nix — 把每个软件包当成纯函数的输出](/study/papers/nix/) | ✅ v3 |  |

## NLP

共 9 篇。

### NLP

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [BERT — 双向 Transformer 预训练](/study/papers/bert/) | ✅ v3 |  |
| [Chinchilla — 训练大模型的数据/参数最优比](/study/papers/chinchilla/) | ✅ v3 |  |
| [DPO — Direct Preference Optimization](/study/papers/dpo/) | 🗄 存量 |  |
| [GPT-3 — Language Models are Few-Shot Learners](/study/papers/gpt-3/) | ✅ v3 |  |
| [InstructGPT — RLHF 让 LLM 听话](/study/papers/instructgpt/) | ✅ v3 |  |
| [Scaling Laws — 神经语言模型的缩放规律](/study/papers/scaling-laws/) | ✅ v3 |  |
| [T5 — Text-to-Text Transfer Transformer](/study/papers/t5/) | ✅ v3 |  |
| [Word2Vec — 词向量奠基](/study/papers/word2vec/) | ✅ v3 |  |

### 其他子类

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [REALM — 把检索器和 BERT 一起预训练的第一篇论文](/study/papers/realm/) | ✅ v3 |  |

## 编译器

共 3 篇。

### 编译器

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [LLVM — 模块化编译器框架](/study/papers/llvm/) | 🗄 存量 |  |
| [Self / PIC — 内联缓存的诞生](/study/papers/self-pic/) | ✅ v3 |  |
| [SSA — 静态单赋值形式](/study/papers/ssa/) | 🗄 存量 |  |

## 数据可视化

共 4 篇。

### 其他子类

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [CesiumJS — 把会动的 3D 地球塞进浏览器](/study/papers/cesium/) | ✅ v3 |  |
| [Cytoscape.js — 浏览器里画网络图、跑图算法的 JS 库](/study/papers/cytoscape-js/) | ✅ v3 |  |
| [Panel — 把 notebook 一键变交互式 web app](/study/papers/panel/) | ✅ v3 |  |
| [Vega-Lite — 用 JSON 三段式画复合图](/study/papers/vega-lite/) | ✅ v3 |  |

## 安全与隐私

共 30 篇。

### 安全与隐私

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [DP-SGD — 深度学习差分隐私训练](/study/papers/abadi-dpsgd-2016/) | ✅ v3 |  |
| [QL: Object-Oriented Queries on Relational Data](/study/papers/avgustinov-codeql-2016/) | ✅ v3 |  |
| [Scalable, Transparent, and Post-Quantum Secure Computational Integrity](/study/papers/ben-sasson-stark-2018/) | ✅ v3 |  |
| [AFLFast — 灰盒 Fuzz 的马尔可夫调度](/study/papers/bohme-aflfast-2016/) | ✅ v3 |  |
| [Bonawitz FL System 2019 — Google 工业级联邦学习系统设计](/study/papers/bonawitz-fl-system-2019/) | ✅ v3 |  |
| [CRYSTALS-Kyber: A CCA-Secure Module-Lattice-Based KEM](/study/papers/bos-kyber-2018/) | ✅ v3 |  |
| [Halo: Recursive Proof Composition without a Trusted Setup](/study/papers/bowe-halo-2019/) | ✅ v3 |  |
| [Fully Homomorphic Encryption without Bootstrapping](/study/papers/brakerski-bgv-2012/) | ✅ v3 |  |
| [Bulletproofs: Short Proofs for Confidential Transactions and More](/study/papers/bunz-bulletproofs-2018/) | ✅ v3 |  |
| [KLEE — 符号执行自动生成高覆盖测试](/study/papers/cadar-klee-2008/) | ✅ v3 |  |
| [Homomorphic Encryption for Arithmetic of Approximate Numbers](/study/papers/cheon-ckks-2017/) | ✅ v3 |  |
| [Faster Fully Homomorphic Encryption: Bootstrapping in Less Than 0.1 Seconds](/study/papers/chillotti-tfhe-2016/) | ✅ v3 |  |
| [CRYSTALS-Dilithium — 量子计算机来了也签不掉的数字签名](/study/papers/ducas-dilithium-2018/) | ✅ v3 |  |
| [Local Privacy and Statistical Minimax Rates](/study/papers/duchi-local-dp-2013/) | ✅ v3 |  |
| [校准噪声与敏感度 — Laplace 机制奠基](/study/papers/dwork-calibrating-noise-2006/) | ✅ v3 |  |
| [差分隐私 — ε 与邻接数据集不可区分](/study/papers/dwork-dp-icalp-2006/) | ✅ v3 |  |
| [分布式噪声生成 — 去掉可信管理员也能保护隐私](/study/papers/dwork-our-data-ourselves-2006/) | ✅ v3 |  |
| [RAPPOR — 本地差分隐私随机响应采集](/study/papers/erlingsson-rappor-2014/) | ✅ v3 |  |
| [Somewhat Practical Fully Homomorphic Encryption](/study/papers/fan-vercauteren-bfv-2012/) | ✅ v3 |  |
| [PLONK: Permutations over Lagrange-bases for Oecumenical Noninteractive arguments of Knowledge](/study/papers/gabizon-plonk-2019/) | ✅ v3 |  |
| [Gentry FHE — 全同态加密开山](/study/papers/gentry-fhe-2009/) | ✅ v3 |  |
| [联邦学习综述 — 60+ 作者合写的联邦学习百科与 58 道开放题](/study/papers/kairouz-advances-fl-2019/) | ✅ v3 |  |
| [FedAvg — 联邦学习奠基算法](/study/papers/mcmahan-fedavg-2017/) | ✅ v3 |  |
| [Rényi 差分隐私 — 隐私会计统一框架](/study/papers/mironov-renyi-dp-2017/) | ✅ v3 |  |
| [Dynamic Taint Analysis for Automatic Detection, Analysis, and Signature Generation of Exploits on Commodity Software](/study/papers/newsome-taintcheck-2005/) | ✅ v3 |  |
| [On Lattices, Learning with Errors, Random Linear Codes, and Cryptography](/study/papers/regev-lwe-2005/) | ✅ v3 |  |

### 密码学

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [AES Rijndael 对称分组密码](/study/papers/aes/) | ✅ v3 |  |
| [Diffie-Hellman 密钥交换](/study/papers/diffie-hellman/) | ✅ v3 |  |
| [RSA 公钥密码](/study/papers/rsa/) | ✅ v3 |  |
| [zk-SNARK 零知识证明](/study/papers/zk-snark/) | ✅ v3 |  |

## 其他

共 13 篇。

### 软件工程

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Beck TDD — 用红绿重构循环让设计自己长出来](/study/papers/beck-tdd/) | ✅ v3 |  |
| [CI Effects — 持续集成不是免费午餐，价值看实现细节](/study/papers/ci-effects/) | ✅ v3 |  |
| [Great SWE — 资深工程师"伟大"的标准是 humble + always learning](/study/papers/great-swe/) | ✅ v3 |  |
| [No Silver Bullet — 软件难度的二分手术刀](/study/papers/no-silver-bullet/) | ✅ v3 |  |
| [Pair Programming — 两个人共用一台机器写代码](/study/papers/pair-programming/) | ✅ v3 |  |
| [Programmer Interruption — IDE 数据告诉你被打断后多久才能继续敲代码](/study/papers/programmer-interruption/) | ✅ v3 |  |
| [Sillito 44 问题 — 程序员改代码时到底在问什么](/study/papers/sillito-questions/) | ✅ v3 |  |

### 其他子类

| 论文 | 质量 | 描述 |
|---|:---:|---|
| [Cognitive Load Theory — 学不会不是不努力，是工作记忆装不下](/study/papers/cognitive-load-theory/) | ✅ v3 |  |
| [Copilot RCT — AI 编程助手的第一个严格随机对照实验](/study/papers/copilot-rct/) | ✅ v3 |  |
| [Debugging Dichotomy — 程序员真实 debug 行为分两轨](/study/papers/debugging-dichotomy/) | ✅ v3 |  |
| [Dijkstra 1968 — Go To Statement Considered Harmful](/study/papers/dijkstra-goto/) | ✅ v3 | 1968 年 3 月 Dijkstra 写给 CACM 的不到 1000 字 letter，论证 goto 让源代码的静态文本顺序与运行时执行顺序错位、状态难以推理 |
| [FSRS — 让 Anki 知道每张卡什么时候快被你忘掉](/study/papers/fsrs-spaced-repetition/) | ✅ v3 |  |
| [Program Comprehension fMRI — 程序员读代码时大脑亮的是语言区不是数学区](/study/papers/program-comprehension-fmri/) | ✅ v3 |  |

---

## 全部 920 篇（字母序）

| Slug | 论文 | 质量 | 一级 | 子分类 |
|---|---|:---:|---|---|
| `2d-tan-2019` | [2D-TAN — 用二维时间图做自然语言时刻检索](/study/papers/2d-tan-2019/) | ✅ v3 | 机器学习 | 视频理解 |
| `3d-gaussian-splatting` | [3D Gaussian Splatting — 用一堆 3D 模糊光斑重建场景](/study/papers/3d-gaussian-splatting/) | ✅ v3 | 图形学 | 计算机图形 / 三维重建 |
| `a3c-2016` | [A3C — 多个 CPU 同时跑游戏，让 RL 不再吃 GPU](/study/papers/a3c-2016/) | ✅ v3 | 机器学习 | 模型与训练 |
| `abadi-dpsgd-2016` | [DP-SGD — 深度学习差分隐私训练](/study/papers/abadi-dpsgd-2016/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `acl2-2000` | [ACL2 — 用纯 Lisp 当数学对象，机器证明工业级硬件正确](/study/papers/acl2-2000/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `activation-patching` | [Activation Patching — 因果干预可解释性方法](/study/papers/activation-patching/) | ✅ v3 | 机器学习 | AI 可解释性 |
| `adafactor-2018` | [Adafactor — 把 Adam 的优化器内存从 O(d) 压到 O(√d)](/study/papers/adafactor-2018/) | ✅ v3 | 机器学习 | 模型与训练 |
| `adam-2014` | [Adam — 让深度学习自己挑步长的优化器](/study/papers/adam-2014/) | ✅ v3 | 机器学习 | 模型与训练 |
| `adamw-2017` | [AdamW — 把 weight decay 从梯度里拆出来](/study/papers/adamw-2017/) | ✅ v3 | 机器学习 | 模型与训练 |
| `adapton` | [Adapton — 增量计算](/study/papers/adapton/) | ✅ v3 | 编程语言 | 编程语言 |
| `aes` | [AES Rijndael 对称分组密码](/study/papers/aes/) | ✅ v3 | 安全与隐私 | 密码学 |
| `afs-1988` | [AFS 1988 — 客户端缓存 + 回调失效让分布式文件系统真正能扩展](/study/papers/afs-1988/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `agda-norell` | [Agda — 让你写代码的同时把数学也证明了](/study/papers/agda-norell/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `agent-r1-2511` | [Agent-R1 — 把 LLM agent 当 RL 环境训练的模块化框架](/study/papers/agent-r1-2511/) | ✅ v3 | Agent | 智能体与 LLM |
| `agentless` | [Agentless — 反 Agent 派的 SWE-bench 解法](/study/papers/agentless/) | ✅ v3 | 机器学习 | AI / 软件工程 |
| `akamai-2002` | [Akamai 2002 — 把网站搬到离用户 10 毫秒的地方](/study/papers/akamai-2002/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `akamai-2010` | [Akamai 2010 — 从内容分发网络长成全球应用平台](/study/papers/akamai-2010/) | ✅ v3 | 网络协议 | 网络协议 |
| `algol-60` | [ALGOL 60 — BNF 与块结构](/study/papers/algol-60/) | 🗄 存量 | 编程语言 | 编程语言 |
| `align-2021` | [ALIGN — 用 18 亿条脏图文对训练，证明数据规模能压住噪声](/study/papers/align-2021/) | ✅ v3 | 机器学习 | 模型与训练 |
| `alpa-2022` | [Alpa — 把张量/流水/数据并行统一成一道搜索题](/study/papers/alpa-2022/) | ✅ v3 | 图形学 | GPU 架构 |
| `alphago` | [AlphaGo — 击败围棋世界冠军](/study/papers/alphago/) | ✅ v3 | 机器学习 | 强化学习 / AI |
| `amdahl-law-1967` | [Amdahl 定律 — 串行比例决定并行加速比的上界](/study/papers/amdahl-law-1967/) | ✅ v3 | 图形学 | GPU 架构 |
| `amoeba-1990` | [Amoeba — 把整个机房当一台操作系统](/study/papers/amoeba-1990/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `ampere-architecture-2020` | [NVIDIA Ampere — 第三代 Tensor Core 加 TF32 / BF16 / FP64，结构化稀疏 + MIG 重写大模型时代硬件假设](/study/papers/ampere-architecture-2020/) | ✅ v3 | 图形学 | GPU 架构 |
| `amplification-hell-2014` | [Amplification Hell 2014 — 把家用宽带放大成几百 Gbps 的反射攻击](/study/papers/amplification-hell-2014/) | ✅ v3 | 网络协议 | 网络协议 |
| `ance-2020` | [ANCE — 让模型自己挖训练负例，对比学习的"自给自足"](/study/papers/ance-2020/) | ✅ v3 | 信息检索 | 检索与排序 |
| `andersen-pointer-analysis` | [Andersen 指针分析 — 让编译器自己算出 p 可能指向谁](/study/papers/andersen-pointer-analysis/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `andromeda-2018` | [Andromeda — Google Cloud 网络虚拟化的高速通道](/study/papers/andromeda-2018/) | ✅ v3 | 网络协议 | 网络协议 |
| `anh-moffat-2005` | [Anh-Moffat 2005 — 让倒排表压到接近熵下限还能 SIMD 解码](/study/papers/anh-moffat-2005/) | ✅ v3 | 信息检索 | 检索与排序 |
| `anserini-2017` | [Anserini — 把工业搜索引擎 Lucene 改造成学术 IR 实验台](/study/papers/anserini-2017/) | ✅ v3 | 信息检索 | 检索与排序 |
| `anthropic-circuits` | [Anthropic Circuits — 把 Transformer 当电路逆向](/study/papers/anthropic-circuits/) | ✅ v3 | 机器学习 | AI 可解释性 |
| `anthropic-prompt-caching` | [Anthropic Prompt Caching — 让长 prompt 只算一次，后续只付 10%](/study/papers/anthropic-prompt-caching/) | ✅ v3 | 机器学习 | AI 工程 |
| `apex-policy-exploration` | [APEX — 给自进化 agent 配一张"策略图"防止它走老路](/study/papers/apex-policy-exploration/) | ✅ v3 | Agent | 智能体与 LLM |
| `apollo-2014` | [Apollo — 让两万台机器自己决定谁跑哪个任务](/study/papers/apollo-2014/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `apron-2009` | [Apron — 把区间/八边形/多面体塞进同一个插槽](/study/papers/apron-2009/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `aries-1992` | [ARIES 1992 — 数据库崩溃后怎么把账目对回来](/study/papers/aries-1992/) | ✅ v3 | 数据库 | 存储与查询 |
| `art-2013` | [ART 自适应基数树 — 内存数据库为主索引重新选材](/study/papers/art-2013/) | ✅ v3 | 数据库 | 存储与查询 |
| `asterisk` | [Asterisk — 把企业总机做成一台 Linux 服务器](/study/papers/asterisk/) | ✅ v3 | 通信 | 通信 / 开源 PBX |
| `astree` | [ASTRÉE 分析器 — 让飞机控制代码的静态分析做到零警告](/study/papers/astree/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `atlas-2022` | [Atlas — 把检索器和生成器一起训练，11B 打 540B](/study/papers/atlas-2022/) | ✅ v3 | 机器学习 | 模型与训练 |
| `attention` | [Attention Is All You Need](/study/papers/attention/) | 🗄 存量 | 机器学习 | 深度学习 / NLP |
| `aurora` | [Aurora — 把数据库的下半身换成日志机](/study/papers/aurora/) | ✅ v3 | 数据库 | 数据库系统 |
| `aurora-exascale-2024` | [Aurora 2024 — 不用 NVIDIA 也能造 2 EFLOPS 超算](/study/papers/aurora-exascale-2024/) | ✅ v3 | 图形学 | GPU 架构 |
| `autogen` | [AutoGen — 多智能体对话框架](/study/papers/autogen/) | ✅ v3 | 机器学习 | 智能体与 LLM |
| `avgustinov-codeql-2016` | [QL: Object-Oriented Queries on Relational Data](/study/papers/avgustinov-codeql-2016/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `awodey-warren-2009` | [Awodey-Warren — 把『相等的证明』看成两点之间的路径](/study/papers/awodey-warren-2009/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `awq` | [AWQ — 看激活脸色给权重打折](/study/papers/awq/) | ✅ v3 | 机器学习 | 模型与训练 |
| `awq-2023` | [AWQ 2023 — 让 70B 大模型住进 RTX 4090](/study/papers/awq-2023/) | ✅ v3 | 图形学 | GPU 架构 |
| `azure-storage-2011` | [Windows Azure Storage 2011 — 云对象存储第一次在工业界做到强一致](/study/papers/azure-storage-2011/) | ✅ v3 | 数据库 | 存储与查询 |
| `b-tree-1972` | [B-Tree 1972 — 磁盘友好的索引结构](/study/papers/b-tree-1972/) | ✅ v3 | 数据库 | 存储与查询 |
| `b4-2013` | [B4 — Google 用 SDN 把跨数据中心 WAN 利用率拉到 95%+](/study/papers/b4-2013/) | ✅ v3 | 网络协议 | 网络协议 |
| `badger` | [BadgerDB — 把键和值分开存的 Go 原生 KV 库](/study/papers/badger/) | ✅ v3 | 数据库 | 存储系统 |
| `baraff-witkin-1998-cloth` | [Baraff-Witkin 1998 — 让布料模拟敢走大时间步](/study/papers/baraff-witkin-1998-cloth/) | ✅ v3 | 图形学 | 渲染与图形 |
| `barrelfish-2009` | [Barrelfish / Multikernel — 把多核机器当成一个小型网络来设计 OS](/study/papers/barrelfish-2009/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `batchnorm-2015` | [Batch Normalization — 把每层激活值规整到 0 均值 1 方差，深网训练时间砍成 1/14](/study/papers/batchnorm-2015/) | ✅ v3 | 机器学习 | 模型与训练 |
| `bayou-1995` | [Bayou — 离线先改本地，再回来和别人合并](/study/papers/bayou-1995/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `bbr-2017` | [BBR 2017 — 用瓶颈带宽和最小 RTT 替代丢包当拥塞信号](/study/papers/bbr-2017/) | ✅ v3 | 网络协议 | 网络协议 |
| `beck-tdd` | [Beck TDD — 用红绿重构循环让设计自己长出来](/study/papers/beck-tdd/) | ✅ v3 | 其他 | 软件工程 |
| `belady-1966` | [Belady 1966 — 缓存替换的理论最优与 FIFO 异常](/study/papers/belady-1966/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `ben-sasson-stark-2018` | [Scalable, Transparent, and Post-Quantum Secure Computational Integrity](/study/papers/ben-sasson-stark-2018/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `bentley-1975-kdtree` | [k-d 树 — 多维空间里的二叉搜索树](/study/papers/bentley-1975-kdtree/) | ✅ v3 | 图形学 | 渲染与图形 |
| `bentoml` | [BentoML — 把模型 + 依赖 + API 打包成一个能直接跑的盒子](/study/papers/bentoml/) | ✅ v3 | 机器学习 | MLOps / 模型服务 |
| `berenson-1995-isolation` | [Berenson 1995 — ANSI SQL 隔离级别的漏洞与快照隔离](/study/papers/berenson-1995-isolation/) | ✅ v3 | 数据库 | 存储与查询 |
| `bernstein-1981-cc` | [Bernstein 1981 并发控制综述 — 把分布式数据库的 20+ 算法整成两条主线](/study/papers/bernstein-1981-cc/) | ✅ v3 | 数据库 | 存储与查询 |
| `bert` | [BERT — 双向 Transformer 预训练](/study/papers/bert/) | ✅ v3 | NLP | NLP |
| `bert4rec-2019` | [BERT4Rec — 把 BERT 的 MLM 搬进序列推荐做双向建模](/study/papers/bert4rec-2019/) | ✅ v3 | 信息检索 | 检索与排序 |
| `bidirectional-typing` | [双向类型检查 — 推断和检查两个方向交替前进](/study/papers/bidirectional-typing/) | ✅ v3 | 编程语言 | 编程语言 |
| `biere-bmc-1999` | [Bounded Model Checking — 把硬件验证翻译成一道 SAT 题](/study/papers/biere-bmc-1999/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `big-little-2011` | [big.LITTLE — 让一颗芯片同时装快核和省电核](/study/papers/big-little-2011/) | ✅ v3 | 图形学 | GPU 架构 |
| `bigbench-2022` | [BIG-bench — 204 道题给大模型出考卷](/study/papers/bigbench-2022/) | ✅ v3 | 机器学习 | 模型与训练 |
| `biggan-2018` | [BigGAN — 把 GAN 暴力放大到 ImageNet 512×512](/study/papers/biggan-2018/) | ✅ v3 | 机器学习 | 模型与训练 |
| `bigtable-2006` | [Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统](/study/papers/bigtable-2006/) | 🗄 存量 | 数据库 | 存储与查询 |
| `bitcoin` | [Bitcoin 白皮书](/study/papers/bitcoin/) | ✅ v3 | 分布式系统 | 分布式系统 / 密码学 |
| `bittorrent-2003` | [BitTorrent — 用"以牙还牙"逼大家都上传](/study/papers/bittorrent-2003/) | ✅ v3 | 网络协议 | 网络协议 |
| `blackwell-architecture-2024` | [NVIDIA Blackwell — 双 die NV-HBI + 第二代 Transformer Engine + FP4 让万亿参数训练日常化](/study/papers/blackwell-architecture-2024/) | ✅ v3 | 图形学 | GPU 架构 |
| `blink-2020` | [Blink — 按拓扑动态拼生成树替代 NCCL ring](/study/papers/blink-2020/) | ✅ v3 | 图形学 | GPU 架构 |
| `blinn-1977` | [Blinn 1977 — 用半角向量 H 把高光算量减半](/study/papers/blinn-1977/) | ✅ v3 | 图形学 | 渲染与图形 |
| `blip2-2023` | [BLIP-2 — 用 188M 小桥接器把冻结的视觉模型和大语言模型拼起来](/study/papers/blip2-2023/) | ✅ v3 | 机器学习 | 模型与训练 |
| `block-max-wand-2011` | [Block-Max WAND — 给倒排索引加分块上界，跳过算不过 top-k 的整块](/study/papers/block-max-wand-2011/) | ✅ v3 | 信息检索 | 检索与排序 |
| `bm25-okapi` | [BM25 — 给文档打分的"老配方"](/study/papers/bm25-okapi/) | ✅ v3 | 信息检索 | 数据检索 |
| `boehm-gc` | [Boehm-Weiser 保守式垃圾回收 — 不改编译器也能给 C 加 GC](/study/papers/boehm-gc/) | ✅ v3 | 操作系统 | 内存管理 |
| `bohme-aflfast-2016` | [AFLFast — 灰盒 Fuzz 的马尔可夫调度](/study/papers/bohme-aflfast-2016/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `bonawitz-fl-system-2019` | [Bonawitz FL System 2019 — Google 工业级联邦学习系统设计](/study/papers/bonawitz-fl-system-2019/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `boogie-2005` | [Boogie — 写一次验证后端，多种证明语言复用](/study/papers/boogie-2005/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `borg` | [Borg — Google 把一万台机器假装成一台](/study/papers/borg/) | ✅ v3 | 分布式系统 | 分布式系统 |
| `borg-omega-kube-2016` | [Borg / Omega / Kubernetes — Google 调度器三代同源](/study/papers/borg-omega-kube-2016/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `bos-kyber-2018` | [CRYSTALS-Kyber: A CCA-Secure Module-Lattice-Based KEM](/study/papers/bos-kyber-2018/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `bowe-halo-2019` | [Halo: Recursive Proof Composition without a Trusted Setup](/study/papers/bowe-halo-2019/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `bpr-2009` | [BPR — 用『i 比 j 更受欢迎』替代『i 是正例 j 是负例』](/study/papers/bpr-2009/) | ✅ v3 | 信息检索 | 检索与排序 |
| `brakerski-bgv-2012` | [Fully Homomorphic Encryption without Bootstrapping](/study/papers/brakerski-bgv-2012/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `branch-prediction-yeh-patt-1991` | [Yeh-Patt 1991 — 用最近 12 条分支的历史给 CPU 算命](/study/papers/branch-prediction-yeh-patt-1991/) | ✅ v3 | 图形学 | GPU 架构 |
| `brewer-cap-2000` | [Brewer CAP — 网络一断电，一致性和可用性只能留一个](/study/papers/brewer-cap-2000/) | ✅ v3 | 数据库 | 存储与查询 |
| `brill-moore-2000` | [Brill-Moore 2000 — 把拼写纠错的编辑操作从单字符扩成任意子串](/study/papers/brill-moore-2000/) | ✅ v3 | 信息检索 | 检索与排序 |
| `brook-2004` | [Brook for GPUs — 让显卡第一次能用人话编程](/study/papers/brook-2004/) | ✅ v3 | 图形学 | GPU 架构 |
| `btrfs-2013` | [Btrfs — Linux 上"写时复制 B-tree"的工业级文件系统](/study/papers/btrfs-2013/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `bunz-bulletproofs-2018` | [Bulletproofs: Short Proofs for Confidential Transactions and More](/study/papers/bunz-bulletproofs-2018/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `burgess-2020-turing-rt` | [Burgess 2020 RTX ON — Turing 把光线追踪做进硅片](/study/papers/burgess-2020-turing-rt/) | ✅ v3 | 图形学 | 渲染与图形 |
| `bvt-1999` | [BVT 1999 — 让一份调度器同时照顾"急性子"和"老黄牛"](/study/papers/bvt-1999/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `byzantine-generals-1982` | [拜占庭将军问题 — 节点能撒谎时怎么达成一致](/study/papers/byzantine-generals-1982/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `cadar-klee-2008` | [KLEE — 符号执行自动生成高覆盖测试](/study/papers/cadar-klee-2008/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `caesar-rexford-2005` | [Caesar-Rexford 2005 — 你的包为什么绕了大半个地球](/study/papers/caesar-rexford-2005/) | ✅ v3 | 网络协议 | 网络协议 |
| `cakeml` | [CakeML — 从源码到机器码每一步都被数学证明的 ML 编译器](/study/papers/cakeml/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `calculus-of-constructions` | [Calculus of Constructions — 让程序和数学证明共用一种语言](/study/papers/calculus-of-constructions/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `calder-2015-anycast-cdn` | [Calder 2015 — Anycast CDN 在生产环境真的能用吗](/study/papers/calder-2015-anycast-cdn/) | ✅ v3 | 网络协议 | 网络协议 |
| `call-by-need-1995` | [Call-by-Need Lambda Calculus — 给惰性求值一套真正的演算](/study/papers/call-by-need-1995/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `calvin-2012` | [Calvin 2012 — 先排好顺序再执行，让跨分区事务不再走 2PC](/study/papers/calvin-2012/) | ✅ v3 | 数据库 | 存储与查询 |
| `cap-12-years-later-2012` | [CAP 十二年后 — Brewer 自己承认"三选二"是误读](/study/papers/cap-12-years-later-2012/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `capsicum-2010` | [Capsicum: Practical Capabilities for UNIX](/study/papers/capsicum-2010/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `cascades-1995` | [Cascades 1995 — 用规则 + Memo 拼装一个可扩展查询优化器](/study/papers/cascades-1995/) | ✅ v3 | 数据库 | 存储与查询 |
| `case-for-risc-1980` | [Case for RISC 1980 — 一篇没有芯片的论文，掀起 CPU 半世纪革命](/study/papers/case-for-risc-1980/) | ✅ v3 | 图形学 | GPU 架构 |
| `cassandra-2010` | [Cassandra 2010 — 把 Dynamo 的 P2P 骨架和 Bigtable 的列族数据模型拼成一个东西](/study/papers/cassandra-2010/) | ✅ v3 | 数据库 | 存储与查询 |
| `catmull-1974-zbuffer` | [Catmull 1974 Z-buffer — 用一张深度图解决谁挡谁的问题](/study/papers/catmull-1974-zbuffer/) | ✅ v3 | 图形学 | 渲染与图形 |
| `catmull-clark-1978` | [Catmull-Clark 1978 — 让任意拓扑网格收敛成光滑曲面](/study/papers/catmull-clark-1978/) | ✅ v3 | 图形学 | 渲染与图形 |
| `causal-abstraction` | [Causal Abstraction — 神经网络与算法的因果对齐](/study/papers/causal-abstraction/) | ✅ v3 | 机器学习 | AI 可解释性 |
| `cell-be-2005` | [Cell BE — 一颗 CPU 里塞 8 个加速核](/study/papers/cell-be-2005/) | ✅ v3 | 图形学 | GPU 架构 |
| `ceph-2006` | [Ceph — 让分布式文件系统不靠中心查表](/study/papers/ceph-2006/) | ✅ v3 | 数据库 | 存储与查询 |
| `cerf-kahn-1974` | [Cerf-Kahn 1974 — 用网关把异构网络拼成一个互联网](/study/papers/cerf-kahn-1974/) | ✅ v3 | 网络协议 | 网络协议 |
| `certikos-2016` | [CertiKOS — 把整个并发内核拆成 30 多层每层都被 Coq 证过](/study/papers/certikos-2016/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `cesium` | [CesiumJS — 把会动的 3D 地球塞进浏览器](/study/papers/cesium/) | ✅ v3 | 数据可视化 | 可视化 |
| `chaff-2001` | [Chaff 2001 — 把 CDCL 工程化的两个杀手锏](/study/papers/chaff-2001/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `chain-replication-2004` | [Chain Replication — 把多副本排成流水线，简单且强一致](/study/papers/chain-replication-2004/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `chaitin-graph-coloring` | [Chaitin 图染色寄存器分配 — 把硬件资源问题翻译成数学问题](/study/papers/chaitin-graph-coloring/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `chandy-lamport-1985` | [Chandy-Lamport 1985 — 分布式系统不停机也能拍一张全家福](/study/papers/chandy-lamport-1985/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `chapar-2016` | [Chapar — 第一个被机器证明的因果一致 KV 存储](/study/papers/chapar-2016/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `chapter-llama-2025` | [Chapter-Llama — 语音引导采帧，一小时视频一次前向切章节](/study/papers/chapter-llama-2025/) | ✅ v3 | 机器学习 | 视频理解 |
| `chat-univi-2023` | [Chat-UniVi — 动态视觉 token 统一图像与视频对话](/study/papers/chat-univi-2023/) | ✅ v3 | 机器学习 | 视频理解 |
| `chatbot-arena-2024` | [Chatbot Arena — 让真人盲投，给 LLM 排出公允座次](/study/papers/chatbot-arena-2024/) | ✅ v3 | 机器学习 | 模型与训练 |
| `chaum-1981-mix` | [Chaum Mix Network — 把匿名通信从理论变成工程](/study/papers/chaum-1981-mix/) | ✅ v3 | 网络协议 | 网络协议 |
| `cheney-gc` | [Cheney 1970 — 把活对象复制走，原地丢弃整片堆](/study/papers/cheney-gc/) | ✅ v3 | 基础设施 | 系统 |
| `cheon-ckks-2017` | [Homomorphic Encryption for Arithmetic of Approximate Numbers](/study/papers/cheon-ckks-2017/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `chillotti-tfhe-2016` | [Faster Fully Homomorphic Encryption: Bootstrapping in Less Than 0.1 Seconds](/study/papers/chillotti-tfhe-2016/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `chinchilla` | [Chinchilla — 训练大模型的数据/参数最优比](/study/papers/chinchilla/) | ✅ v3 | NLP | NLP |
| `chord-2001` | [Chord — 让上万台机器排成圈，查任何 key 都只走 log N 步](/study/papers/chord-2001/) | ✅ v3 | 网络协议 | 网络协议 |
| `chronos-2024` | [Chronos — 把时间序列当语言来训练大模型](/study/papers/chronos-2024/) | ✅ v3 | 机器学习 | 模型与训练 |
| `chubby` | [Chubby — 给凡人用的分布式锁服务](/study/papers/chubby/) | ✅ v3 | 分布式系统 | 分布式系统 |
| `ci-effects` | [CI Effects — 持续集成不是免费午餐，价值看实现细节](/study/papers/ci-effects/) | ✅ v3 | 其他 | 软件工程 |
| `cimatti-nusmv-2002` | [NuSMV 2 — 把 BDD 和 SAT 两种验证引擎装进同一个开源工具](/study/papers/cimatti-nusmv-2002/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `clark-1988` | [Clark 1988 — TCP/IP 七大目标的优先级，决定了 Internet 长成今天这样](/study/papers/clark-1988/) | ✅ v3 | 网络协议 | 网络协议 |
| `clarke-cegar-2003` | [CEGAR — 用反例自动改进抽象，让大软件能被验证](/study/papers/clarke-cegar-2003/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `clarke-emerson-1981` | [Clarke-Emerson 1981 — 让机器自己检查并发程序对不对](/study/papers/clarke-emerson-1981/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `classifier-free-guidance-2022` | [Classifier-Free Guidance — 让扩散模型自己听懂条件](/study/papers/classifier-free-guidance-2022/) | ✅ v3 | 机器学习 | 模型与训练 |
| `clawtrace-cost-aware` | [ClawTrace — 把 agent 每步操作的"成本账"先算清再蒸馏](/study/papers/clawtrace-cost-aware/) | ✅ v3 | Agent | 智能体与 LLM |
| `clearml` | [ClearML — 实验跟踪 + 远程执行 + 数据管理三合一](/study/papers/clearml/) | ✅ v3 | 机器学习 | MLOps |
| `clickhouse` | [ClickHouse — 把列存 OLAP 推到硬件极限](/study/papers/clickhouse/) | ✅ v3 | 数据库 | 存储与查询 |
| `clip` | [CLIP — Contrastive Language-Image Pre-training](/study/papers/clip/) | ✅ v3 | 机器学习 | 多模态 / 计算机视觉 |
| `coca-2022` | [CoCa — 把对比和生成两种多模态训练目标合到一个模型里](/study/papers/coca-2022/) | ✅ v3 | 机器学习 | 模型与训练 |
| `cockroachdb-2020` | [CockroachDB 2020 — 没原子钟也能做全球强一致 SQL 数据库](/study/papers/cockroachdb-2020/) | ✅ v3 | 数据库 | 存储与查询 |
| `cocondenser-2021` | [coCondenser — 让 BERT 的 [CLS] 在预训练就学会"代表整段话"](/study/papers/cocondenser-2021/) | ✅ v3 | 信息检索 | 检索与排序 |
| `coda-1990` | [Coda 1990 — 笔记本拔网线照样写文件，重连后自动合并](/study/papers/coda-1990/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `codd-1970` | [Codd 1970 — 关系模型奠基](/study/papers/codd-1970/) | ✅ v3 | 数据库 | 存储与查询 |
| `codd-1979-extending` | [Codd 1979 — 给关系模型补上"语义"](/study/papers/codd-1979-extending/) | ✅ v3 | 数据库 | 存储与查询 |
| `code-as-agent-harness` | [Code as Agent Harness — 把代码当 agent 的"骨架"来重新看 agentic AI](/study/papers/code-as-agent-harness/) | ✅ v3 | Agent | 智能体与 LLM |
| `codellama-2023` | [Code Llama — 开源代码模型的完整训练配方](/study/papers/codellama-2023/) | ✅ v3 | 机器学习 | 模型与训练 |
| `codex-2021` | [Codex — 让 GPT 学会写 Python，并造一把尺子量它](/study/papers/codex-2021/) | ✅ v3 | 机器学习 | 模型与训练 |
| `codons-2004` | [CoDoNS — 用 P2P 哈希表替代分层 DNS 的实验](/study/papers/codons-2004/) | ✅ v3 | 网络协议 | 网络协议 |
| `coeffect-petricek` | [Coeffects — 让类型系统追踪「需要多少上下文」](/study/papers/coeffect-petricek/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `cognitive-load-theory` | [Cognitive Load Theory — 学不会不是不努力，是工作记忆装不下](/study/papers/cognitive-load-theory/) | ✅ v3 | 其他 | 认知科学 |
| `cohen-1985-hemicube` | [Cohen-Greenberg 1985 Hemicube — 把渲染硬件挪去算辐射度积分](/study/papers/cohen-1985-hemicube/) | ✅ v3 | 图形学 | 渲染与图形 |
| `colbert-2020` | [ColBERT — 让 BERT 检索既准又能扛大规模](/study/papers/colbert-2020/) | ✅ v3 | 信息检索 | 检索与排序 |
| `colbert-v2` | [ColBERTv2 — 让向量检索既精又能扛百万文档](/study/papers/colbert-v2/) | ✅ v3 | 信息检索 | 数据检索 |
| `comer-1979-btree` | [Comer 1979 — B-Tree 综述：为什么这棵树到处都有](/study/papers/comer-1979-btree/) | ✅ v3 | 数据库 | 存储与查询 |
| `compcert` | [CompCert — 每条优化都被数学证明保持语义的 C 编译器](/study/papers/compcert/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `compiler-errors` | [Compiler Error Messages — 让编译报错有用](/study/papers/compiler-errors/) | ✅ v3 | 编程语言 | 编程语言 / 编译器 |
| `consistency-models-2023` | [Consistency Models — 把 50 步扩散压成 1 步出图](/study/papers/consistency-models-2023/) | ✅ v3 | 机器学习 | 模型与训练 |
| `consistent-hashing-1997` | [Consistent Hashing — 加机器只搬一小部分数据的哈希环](/study/papers/consistent-hashing-1997/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `constitutional-ai` | [Constitutional AI — Anthropic 的对齐方法](/study/papers/constitutional-ai/) | ✅ v3 | 机器学习 | AI 安全 / NLP |
| `cook-1984-distributed-ray-tracing` | [Distributed Ray Tracing — 把所有"模糊"效果统一成随机采样](/study/papers/cook-1984-distributed-ray-tracing/) | ✅ v3 | 图形学 | 渲染与图形 |
| `cook-1986-stochastic-sampling` | [Cook 1986 — 用噪声换掉锯齿](/study/papers/cook-1986-stochastic-sampling/) | ✅ v3 | 图形学 | 渲染与图形 |
| `cook-levin` | [Cook-Levin 定理 — NP-完全性的诞生](/study/papers/cook-levin/) | ✅ v3 | 编程语言 | 计算理论 |
| `cook-torrance-1982` | [Cook-Torrance 1982 — 把镜面反射拆成微面元 × 几何遮挡 × Fresnel](/study/papers/cook-torrance-1982/) | ✅ v3 | 图形学 | 渲染与图形 |
| `copilot-rct` | [Copilot RCT — AI 编程助手的第一个严格随机对照实验](/study/papers/copilot-rct/) | ✅ v3 | 其他 | 软件工程实证 |
| `cops-2011` | [COPS — 大规模跨地域存储如何用得起的代价拿到因果一致](/study/papers/cops-2011/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `cot` | [Chain-of-Thought Prompting](/study/papers/cot/) | ✅ v3 | 机器学习 | AI / LLM |
| `coturn` | [coturn — 帮 WebRTC 穿越 NAT 的开源中转服务器](/study/papers/coturn/) | ✅ v3 | 基础设施 | 基础设施 |
| `couchdb` | [CouchDB — 把 HTTP + 多版本 + 多主复制揉成离线优先数据库](/study/papers/couchdb/) | ✅ v3 | 数据库 | 数据库 |
| `countervqa-2025` | [CounterVQA — 因果图驱动的反事实视频 VQA](/study/papers/countervqa-2025/) | ✅ v3 | 机器学习 | 视频理解 |
| `cousot-abstract-interpretation` | [Cousot 抽象解释 — 给静态分析一套统一数学框架](/study/papers/cousot-abstract-interpretation/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `cousot-halbwachs-polyhedra-1978` | [Cousot-Halbwachs 凸多面体域 — 让分析器自己发现变量间的线性关系](/study/papers/cousot-halbwachs-polyhedra-1978/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `cover-2025` | [COVER — 四象限反事实视频推理 benchmark](/study/papers/cover-2025/) | ✅ v3 | 机器学习 | 视频理解 |
| `craq-2009` | [CRAQ — 让链复制每个节点都能读，吞吐线性扩展](/study/papers/craq-2009/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `crdt-json` | [CRDT JSON — 协同编辑 JSON 数据结构](/study/papers/crdt-json/) | ✅ v3 | 分布式系统 | 分布式系统 |
| `crdt-json-2017` | [CRDT JSON 2017 — 给嵌套 JSON 一套有数学证明的合并算法](/study/papers/crdt-json-2017/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `crdt-shapiro-2011` | [CRDT — 让多副本各改各的，最终自动合一](/study/papers/crdt-shapiro-2011/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `crdt-sss-2011` | [CRDT 形式定义 — SSS 2011 八页浓缩版](/study/papers/crdt-sss-2011/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `croft-harper-1979` | [Croft-Harper 1979 — 没有相关性反馈也能跑概率检索](/study/papers/croft-harper-1979/) | ✅ v3 | 信息检索 | 检索与排序 |
| `cryptoverif-2008` | [CryptoVerif — 让计算机直接证密码协议在真实计算模型下安全](/study/papers/cryptoverif-2008/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `csp-hoare-1978` | [CSP — 进程之间只许喊话不许共用内存](/study/papers/csp-hoare-1978/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `cstore-2005` | [C-Store — 把数据按列存，分析查询直接快十倍](/study/papers/cstore-2005/) | ✅ v3 | 数据库 | 存储与查询 |
| `cubic-2008` | [CUBIC 2008 — Linux 默认拥塞控制，三次曲线把千兆带宽喂饱](/study/papers/cubic-2008/) | ✅ v3 | 网络协议 | 网络协议 |
| `cubical-type-theory-2018` | [Cubical Type Theory — 让 Univalence 公理真的能算出结果](/study/papers/cubical-type-theory-2018/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `cuda-streams-concurrency-2018` | [CUDA Streams 并发量化研究 — 为什么 SM 利用率拉不满](/study/papers/cuda-streams-concurrency-2018/) | ✅ v3 | 图形学 | GPU 架构 |
| `cudnn-2014` | [cuDNN — 把卷积写成矩阵乘，让所有深度学习框架共享底层加速](/study/papers/cudnn-2014/) | ✅ v3 | 图形学 | GPU 架构 |
| `curless-levoy-1996-tsdf` | [Curless-Levoy TSDF — 把多次扫描融成一个干净的 3D 模型](/study/papers/curless-levoy-1996-tsdf/) | ✅ v3 | 图形学 | 渲染与图形 |
| `cutlass-2020` | [CUTLASS — 把 SOTA GEMM 拆成可组合的 C++ 模板层级](/study/papers/cutlass-2020/) | ✅ v3 | 图形学 | GPU 架构 |
| `cytoscape-js` | [Cytoscape.js — 浏览器里画网络图、跑图算法的 JS 库](/study/papers/cytoscape-js/) | ✅ v3 | 数据可视化 | 可视化 |
| `dafny-2010` | [Dafny — 把"代码该满足的条件"直接写进语法，编译器自动证明](/study/papers/dafny-2010/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `dalle-2` | [DALL-E 2 — 基于 CLIP + 扩散的图像生成](/study/papers/dalle-2/) | ✅ v3 | 机器学习 | 生成模型 / 计算机视觉 |
| `dapper-2010` | [Dapper — Google 大规模分布式系统链路追踪基础设施](/study/papers/dapper-2010/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `dash-numa-1992` | [Stanford DASH — 第一台真跑起来的目录式 CC-NUMA 多处理器](/study/papers/dash-numa-1992/) | ✅ v3 | 图形学 | GPU 架构 |
| `dataflow-model-2015` | [Dataflow Model — 流处理的四问框架](/study/papers/dataflow-model-2015/) | ✅ v3 | 数据库 | 存储与查询 |
| `davis-putnam-1960` | [Davis-Putnam 1960 — 让机器自动判断一堆逻辑式能不能同时成立](/study/papers/davis-putnam-1960/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `dcn-2017` | [DCN — 在 DNN 旁边并联一条专门学特征交叉的网络](/study/papers/dcn-2017/) | ✅ v3 | 信息检索 | 检索与排序 |
| `ddim-2020` | [DDIM — 把扩散模型 1000 步采样压到 50 步](/study/papers/ddim-2020/) | ✅ v3 | 机器学习 | 模型与训练 |
| `ddpm` | [DDPM — Denoising Diffusion Probabilistic Models](/study/papers/ddpm/) | 🗄 存量 | 机器学习 | 生成模型 |
| `debate-2018` | [AI safety via debate — 让两个 AI 互辩，人类只当评委](/study/papers/debate-2018/) | ✅ v3 | 机器学习 | 模型与训练 |
| `deberta-2021` | [DeBERTa — 把"内容"和"位置"拆成两路独立看的 BERT](/study/papers/deberta-2021/) | ✅ v3 | 机器学习 | 模型与训练 |
| `debevec-1998-rendering-with-natural-light` | [Debevec 1998 — 用真实世界的光照亮 CG 物体](/study/papers/debevec-1998-rendering-with-natural-light/) | ✅ v3 | 图形学 | 渲染与图形 |
| `debugging-dichotomy` | [Debugging Dichotomy — 程序员真实 debug 行为分两轨](/study/papers/debugging-dichotomy/) | ✅ v3 | 其他 | 软件工程实证 |
| `decision-transformer-2021` | [Decision Transformer — 把强化学习当成"文字接龙"](/study/papers/decision-transformer-2021/) | ✅ v3 | 机器学习 | 模型与训练 |
| `deepseek-coder-2024` | [DeepSeek-Coder — 按整个仓库喂代码的开源 SOTA](/study/papers/deepseek-coder-2024/) | ✅ v3 | 机器学习 | 模型与训练 |
| `deepseek-r1` | [DeepSeek R1 — 强化学习推理模型](/study/papers/deepseek-r1/) | ✅ v3 | 机器学习 | 模型与训练 |
| `deepspeed-zero` | [DeepSpeed ZeRO — 微软优化大模型训练显存](/study/papers/deepspeed-zero/) | ✅ v3 | 分布式系统 | 模型与训练 |
| `deering-1988-triangle-processor` | [Deering 1988 Triangle Processor — 现代 GPU 的祖先架构](/study/papers/deering-1988-triangle-processor/) | ✅ v3 | 图形学 | 渲染与图形 |
| `denali-2002` | [Denali — 在一台机器上同时跑上千个轻量 VM 的早期实验](/study/papers/denali-2002/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `dense360-2025` | [Dense360 — 全景 ERP 密集理解与 ERP-RoPE](/study/papers/dense360-2025/) | ✅ v3 | 机器学习 | 视频理解 |
| `desbrun-1999-implicit-fairing` | [Desbrun 1999 — 把热扩散方程隐式离散到三角网](/study/papers/desbrun-1999-implicit-fairing/) | ✅ v3 | 图形学 | 渲染与图形 |
| `dewitt-gray-1992` | [DeWitt-Gray 1992 — 并行数据库取代专用机的宣言](/study/papers/dewitt-gray-1992/) | ✅ v3 | 数据库 | 存储与查询 |
| `differential-datalog` | [DDlog (Differential Datalog) — 输入只改一条，引擎只算受影响的那一小块](/study/papers/differential-datalog/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `diffie-hellman` | [Diffie-Hellman 密钥交换](/study/papers/diffie-hellman/) | ✅ v3 | 安全与隐私 | 密码学 |
| `diffie-hellman-1976` | [New Directions 1976 — 给协议世界写下公钥宪法](/study/papers/diffie-hellman-1976/) | ✅ v3 | 网络协议 | 网络协议 |
| `dijkstra-1965` | [Dijkstra 1965 — N 个进程怎么轮流上厕所而且谁也别卡死](/study/papers/dijkstra-1965/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `dijkstra-goto` | [Dijkstra 1968 — Go To Statement Considered Harmful](/study/papers/dijkstra-goto/) | ✅ v3 | 其他 | 软件工程 / 控制流理论 |
| `dijkstra-shortest-path` | [Dijkstra 最短路径 — 一杯咖啡时间想出来的贪心算法](/study/papers/dijkstra-shortest-path/) | ✅ v3 | 编程语言 | 算法 |
| `din-2018` | [DIN — 让推荐模型按你看的广告决定该激活你哪段历史](/study/papers/din-2018/) | ✅ v3 | 信息检索 | 检索与排序 |
| `dino` | [DINO 自监督视觉 transformer](/study/papers/dino/) | ✅ v3 | 机器学习 | 自监督视觉 |
| `disco-1997` | [Disco — 让没改过的商用 OS 在 64 核大机器上一起跑](/study/papers/disco-1997/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `disel-2018` | [Disel — 把分布式协议拆成可独立证明、可拼装的 Coq 模块](/study/papers/disel-2018/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `diskann-2019` | [DiskANN — 单机十亿向量近邻检索（图存 SSD）](/study/papers/diskann-2019/) | ✅ v3 | 数据库 | 存储与查询 |
| `disney-brdf-2012` | [Disney Principled BRDF 2012 — 11 个滑块封装 Cook-Torrance 全家桶](/study/papers/disney-brdf-2012/) | ✅ v3 | 图形学 | 渲染与图形 |
| `distserve` | [DistServe — 把 prefill 和 decode 拆到不同 GPU 上跑](/study/papers/distserve/) | ✅ v3 | 机器学习 | 数据科学与 AI |
| `dit` | [DiT — Diffusion Transformer](/study/papers/dit/) | ✅ v3 | 机器学习 | 生成模型 |
| `dlrm-2019` | [DLRM — Meta 把工业推荐模型拆成 4 个标准积木](/study/papers/dlrm-2019/) | ✅ v3 | 信息检索 | 检索与排序 |
| `dns` | [DNS — 把全球域名解析切成一棵可分布维护的树](/study/papers/dns/) | ✅ v3 | 网络协议 | 网络协议 |
| `doc2query-2019` | [doc2query — 让模型替文档预想"会被怎么搜"再写进倒排表](/study/papers/doc2query-2019/) | ✅ v3 | 信息检索 | 检索与排序 |
| `doligez-leroy-concurrent-gc` | [Doligez-Leroy GC — OCaml 多线程并发垃圾回收](/study/papers/doligez-leroy-concurrent-gc/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `donar-2010` | [DONAR 2010 — 把 DNS 全球调度写成一道可解的优化题](/study/papers/donar-2010/) | ✅ v3 | 网络协议 | 网络协议 |
| `dot-doh-perf-2020` | [DoT/DoH 性能 — 给 DNS 加密之后网页变快还是变慢](/study/papers/dot-doh-perf-2020/) | ✅ v3 | 网络协议 | 网络协议 |
| `double-descent-2019` | [Double Descent — 模型越大越准，过参数化时代的反常识曲线](/study/papers/double-descent-2019/) | ✅ v3 | 机器学习 | 模型与训练 |
| `dpll-1962` | [DPLL 1962 — 把"逻辑判定"从内存爆炸救成栈式回溯](/study/papers/dpll-1962/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `dpo` | [DPO — Direct Preference Optimization](/study/papers/dpo/) | 🗄 存量 | NLP | NLP |
| `dpr-2020` | [DPR — 用 BERT 双塔把检索从 BM25 时代拉进稠密向量时代](/study/papers/dpr-2020/) | ✅ v3 | 信息检索 | 检索与排序 |
| `dqn` | [DQN — Deep Q-Network](/study/papers/dqn/) | ✅ v3 | 机器学习 | 强化学习 |
| `dreamfusion-2022` | [DreamFusion — 用 2D 扩散模型当老师，把 NeRF 教成 3D](/study/papers/dreamfusion-2022/) | ✅ v3 | 机器学习 | 模型与训练 |
| `drizzle-2017` | [Drizzle — 让 micro-batch 也能跑出 100ms 延迟](/study/papers/drizzle-2017/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `drmm-2016` | [DRMM — 检索里的匹配是相关性不是语义相似](/study/papers/drmm-2016/) | ✅ v3 | 信息检索 | 检索与排序 |
| `dropout-2014` | [Dropout — 训练时随机关掉一半神经元，反而学得更好](/study/papers/dropout-2014/) | ✅ v3 | 机器学习 | 模型与训练 |
| `dspy` | [DSPy — 把 prompt 写成签名，让编译器替你调](/study/papers/dspy/) | ✅ v3 | 编程语言 | 编程语言 |
| `dssm-2013` | [DSSM — 把 query 和文档各编码成 128 维向量再算余弦](/study/papers/dssm-2013/) | ✅ v3 | 信息检索 | 检索与排序 |
| `dstreams-2013` | [D-Streams — 把流处理伪装成一串很小的批](/study/papers/dstreams-2013/) | ✅ v3 | 数据库 | 存储与查询 |
| `ducas-dilithium-2018` | [CRYSTALS-Dilithium — 量子计算机来了也签不掉的数字签名](/study/papers/ducas-dilithium-2018/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `duchi-local-dp-2013` | [Local Privacy and Statistical Minimax Rates](/study/papers/duchi-local-dp-2013/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `duckdb-2019` | [DuckDB — 把 OLAP 数据库塞进你的 Python 进程](/study/papers/duckdb-2019/) | ✅ v3 | 数据库 | 存储与查询 |
| `dwork-calibrating-noise-2006` | [校准噪声与敏感度 — Laplace 机制奠基](/study/papers/dwork-calibrating-noise-2006/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `dwork-dp-icalp-2006` | [差分隐私 — ε 与邻接数据集不可区分](/study/papers/dwork-dp-icalp-2006/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `dwork-our-data-ourselves-2006` | [分布式噪声生成 — 去掉可信管理员也能保护隐私](/study/papers/dwork-our-data-ourselves-2006/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `dynamo` | [Dynamo — 让购物车永远能写入的分布式存储](/study/papers/dynamo/) | ✅ v3 | 分布式系统 | 分布式系统 |
| `e5-2022` | [E5 — 用海量"自然出现的文本对"训通用 embedding](/study/papers/e5-2022/) | ✅ v3 | 信息检索 | 检索与排序 |
| `eagle` | [EAGLE — 让大模型先在"特征层"猜下一步而不是猜 token](/study/papers/eagle/) | ✅ v3 | 机器学习 | 模型与训练 |
| `earley-parser` | [Earley Parser — 一个表能解析任何 CFG 的通用解析器](/study/papers/earley-parser/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `easycrypt-2011` | [EasyCrypt — 让密码学家的安全证明能被机器自动检查](/study/papers/easycrypt-2011/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `ebpf` | [eBPF — 用户写小程序，内核证明安全后再跑](/study/papers/ebpf/) | ✅ v3 | 操作系统 | 操作系统 |
| `edm-2022` | [EDM — 把扩散模型的训练配方一次拆清楚](/study/papers/edm-2022/) | ✅ v3 | 机器学习 | 模型与训练 |
| `effect-handlers` | [代数效应（Algebraic Effects）](/study/papers/effect-handlers/) | ✅ v3 | 编程语言 | 编程语言 |
| `effiskill` | [EffiSkill — 把代码效率优化经验抽成两层 skill 库](/study/papers/effiskill/) | ✅ v3 | Agent | 智能体与 LLM |
| `egoschema-2023` | [EgoSchema — 三分钟第一视角长视频理解的诊断探针](/study/papers/egoschema-2023/) | ✅ v3 | 机器学习 | 视频理解 |
| `electra-2020` | [ELECTRA — 把猜词题改成判真假题，训练效率 4 倍](/study/papers/electra-2020/) | ✅ v3 | 机器学习 | 模型与训练 |
| `elmo-2018` | [ELMo — 让词向量随上下文变化](/study/papers/elmo-2018/) | ✅ v3 | 机器学习 | 模型与训练 |
| `emqx` | [EMQX — Erlang 写的 MQTT broker，单集群扛千万 IoT 长连接](/study/papers/emqx/) | ✅ v3 | 基础设施 | infrastructure |
| `epaxos-2013` | [EPaxos — 没有 leader 的 Paxos，让每个副本平起平坐](/study/papers/epaxos-2013/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `erlang-otp` | [Erlang OTP — 容错并发系统设计](/study/papers/erlang-otp/) | ✅ v3 | 编程语言 | 编程语言 / 分布式系统 |
| `erlingsson-rappor-2014` | [RAPPOR — 本地差分隐私随机响应采集](/study/papers/erlingsson-rappor-2014/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `eros-1999` | [EROS — 让 capability 内核跑得跟 Linux 一样快](/study/papers/eros-1999/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `eswaran-1976` | [Eswaran 1976 — 串行化与谓词锁的源头](/study/papers/eswaran-1976/) | ✅ v3 | 数据库 | 存储与查询 |
| `esx-memory-2002` | [ESX Memory 2002 — 让一台机器假装比自己更大的四个魔术](/study/papers/esx-memory-2002/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `ethane-2007` | [Ethane 2007 — 把企业网安全策略集中到一台中央电脑上](/study/papers/ethane-2007/) | ✅ v3 | 网络协议 | 网络协议 |
| `eve-agent-evidence` | [EVE-Agent — 自我训练前先把证据钉在桌上](/study/papers/eve-agent-evidence/) | ✅ v3 | Agent | 智能体与 LLM |
| `evo-memory-2511` | [Evo-Memory — 给"会自己长记性"的 agent 出一份统一考卷](/study/papers/evo-memory-2511/) | ✅ v3 | Agent | 智能体与 LLM |
| `exg-experience-graphs` | [EXG 经验图 — 把 agent 的成败拼成一张可复用的关系图](/study/papers/exg-experience-graphs/) | ✅ v3 | Agent | 智能体与 LLM |
| `exokernel-1995` | [Exokernel — 把抽象推到用户态的极致设计](/study/papers/exokernel-1995/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `f1-2013` | [F1 2013 — 把 Spanner 包成 SQL，扛起 AdWords 全部账单](/study/papers/f1-2013/) | ✅ v3 | 数据库 | 存储与查询 |
| `f4-2014` | [f4 — Facebook 把 90 天前的旧图片搬到一个省 40% 存储的仓库](/study/papers/f4-2014/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `faiss-2017` | [FAISS 2017 — 用 GPU 在十亿向量里找最近邻](/study/papers/faiss-2017/) | ✅ v3 | 数据库 | 存储与查询 |
| `fan-vercauteren-bfv-2012` | [Somewhat Practical Fully Homomorphic Encryption](/study/papers/fan-vercauteren-bfv-2012/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `farsite-2002` | [Farsite — 把一群不可信桌面 PC 拼成一台可信文件服务器](/study/papers/farsite-2002/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `fast-paxos-2006` | [Fast Paxos — 给 Paxos 加一条乐观快车道](/study/papers/fast-paxos-2006/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `fastertransformer-2021` | [FasterTransformer 2021 — NVIDIA 第一代开源 LLM 推理引擎](/study/papers/fastertransformer-2021/) | ✅ v3 | 图形学 | GPU 架构 |
| `fat-tree-2008` | [Fat-Tree 2008 — 用一堆便宜交换机搭出现代数据中心](/study/papers/fat-tree-2008/) | ✅ v3 | 网络协议 | 网络协议 |
| `feautrier-polyhedral` | [Feautrier 多面体调度 — 把循环并行化变成解几何方程](/study/papers/feautrier-polyhedral/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `fermi-architecture-2010` | [NVIDIA Fermi — 把 GPU 从游戏卡推上超算](/study/papers/fermi-architecture-2010/) | ✅ v3 | 图形学 | GPU 架构 |
| `ffs-1984` | [FFS — 把磁盘几何写进文件系统](/study/papers/ffs-1984/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `fidge-1988` | [Fidge 1988 — 给每个进程一份"账本向量"，让因果关系变成可判定](/study/papers/fidge-1988/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `fielding-rest-2000` | [Fielding 2000 — 用约束推导法把 Web 的成功讲成了一门方法](/study/papers/fielding-rest-2000/) | ✅ v3 | 网络协议 | 网络协议 |
| `filip-2021` | [FILIP — 把 CLIP 的图文对齐细化到 token 级](/study/papers/filip-2021/) | ✅ v3 | 信息检索 | 检索与排序 |
| `firecracker-2020` | [Firecracker 2020 — 给 serverless 量身定做的极简 microVM](/study/papers/firecracker-2020/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `flamingo-2022` | [Flamingo — 让冻结的大模型学会看图，几张样例就上手](/study/papers/flamingo-2022/) | ✅ v3 | 机器学习 | 模型与训练 |
| `flan-2021` | [FLAN — 用自然语言指令教模型学会"听话"](/study/papers/flan-2021/) | ✅ v3 | 机器学习 | 模型与训练 |
| `flash-attention` | [FlashAttention — 不改算法，只改数据怎么进 GPU](/study/papers/flash-attention/) | ✅ v3 | 图形学 | GPU 与系统 |
| `flash-vstream-2024` | [Flash-VStream — STAR 双进程记忆的低延迟长流理解](/study/papers/flash-vstream-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `flexible-paxos-2016` | [Flexible Paxos — 两阶段不一定都要多数派](/study/papers/flexible-paxos-2016/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `flexsc-2010` | [FlexSC — 把系统调用从同步陷入改成异步队列](/study/papers/flexsc-2010/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `flink-2015` | [Apache Flink — 流批一体的单引擎](/study/papers/flink-2015/) | ✅ v3 | 数据库 | 存储与查询 |
| `flink-snapshots-2015` | [Flink 异步快照 — 不停机给流处理拍一致照片](/study/papers/flink-snapshots-2015/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `flp-1985` | [FLP 1985 — 一个坏节点就能让异步共识永不终止](/study/papers/flp-1985/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `foundationdb-2021` | [FoundationDB 2021 — 把数据库拆成五个角色，再用一个 seed 烧十年 bug](/study/papers/foundationdb-2021/) | ✅ v3 | 数据库 | 存储与查询 |
| `fpga-hls-2011` | [FPGA HLS 2011 — 把 C 代码自动翻译成芯片电路的范式](/study/papers/fpga-hls-2011/) | ✅ v3 | 图形学 | GPU 架构 |
| `frama-c-2012` | [Frama-C — 一个开源平台把 C 程序的多种验证方法拼到一起](/study/papers/frama-c-2012/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `frangipani-1997` | [Frangipani — 把分布式文件系统盖在共享虚拟磁盘上](/study/papers/frangipani-1997/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `frank-effects` | [Frank — 让 effect handler 写得就像普通函数](/study/papers/frank-effects/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `frenetic-2011` | [Frenetic 2011 — 把 OpenFlow 流表换成函数式程序](/study/papers/frenetic-2011/) | ✅ v3 | 网络协议 | 网络协议 |
| `fsdp-2023` | [PyTorch FSDP — 把大模型切成 N 份分到 N 张卡](/study/papers/fsdp-2023/) | ✅ v3 | 图形学 | GPU 架构 |
| `fsrs-spaced-repetition` | [FSRS — 让 Anki 知道每张卡什么时候快被你忘掉](/study/papers/fsrs-spaced-repetition/) | ✅ v3 | 其他 | 学习与认知 |
| `fstar` | [F* — 把依赖类型、SMT 自动化、副作用追踪揉到一门语言里](/study/papers/fstar/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `g1-collector` | [G1 Garbage-First — 给暂停时间设个预算的垃圾回收器](/study/papers/g1-collector/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `gabizon-plonk-2019` | [PLONK: Permutations over Lagrange-bases for Oecumenical Noninteractive arguments of Knowledge](/study/papers/gabizon-plonk-2019/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `gadt-pjones` | [GADT — 让构造子告诉编译器"我返回的是更精确的类型"](/study/papers/gadt-pjones/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `game-semantics-pcf` | [博弈论语义与 PCF — 把程序解释成两个人轮流下的对话棋](/study/papers/game-semantics-pcf/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `gao-2001-as-relations` | [Gao 2001 — 用算法猜出互联网上 AS 之间谁给谁付钱](/study/papers/gao-2001-as-relations/) | ✅ v3 | 网络协议 | 网络协议 |
| `garland-heckbert-1997-qem` | [QEM — 给三角网格『瘦身』时算每一刀的代价](/study/papers/garland-heckbert-1997-qem/) | ✅ v3 | 图形学 | 渲染与图形 |
| `gat-2018` | [GAT — 让图神经网络的邻居自带权重](/study/papers/gat-2018/) | ✅ v3 | 机器学习 | 模型与训练 |
| `gbrank-2007` | [GBRank — 把决策树堆起来学排序，一棵树纠正一处错排](/study/papers/gbrank-2007/) | ✅ v3 | 信息检索 | 检索与排序 |
| `gcc-webrtc-2016` | [Analysis and Design of the Google Congestion Control for Web Real-time Communication (WebRTC)](/study/papers/gcc-webrtc-2016/) | ✅ v3 | 网络协议 | 网络协议 |
| `gcn-2017` | [GCN 2017 — 把卷积搬到图结构上的最简版本](/study/papers/gcn-2017/) | ✅ v3 | 机器学习 | 模型与训练 |
| `gemini-1.5-2024` | [Gemini 1.5 — 百万 token 多模态长上下文](/study/papers/gemini-15-2024/) | ✅ v3 | 机器学习 | 多模态 LLM |
| `generational-gc` | [Generational GC — 把全堆扫描换成"频繁扫小区，偶尔扫整堆"](/study/papers/generational-gc/) | ✅ v3 | 编程语言 | 编程语言 |
| `gentry-fhe-2009` | [Gentry FHE — 全同态加密开山](/study/papers/gentry-fhe-2009/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `gfs` | [GFS — 编译器决定不做哪些事](/study/papers/gfs/) | ✅ v3 | 分布式系统 | 分布式系统 |
| `ghost-2021` | [ghOSt — 把 Linux 调度策略搬到用户态去写](/study/papers/ghost-2021/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `gilbert-lynch-2002` | [Gilbert-Lynch 2002 — 把 CAP 从口号写成数学定理](/study/papers/gilbert-lynch-2002/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `gin-2019` | [GIN — 把图神经网络的表达力顶到理论天花板](/study/papers/gin-2019/) | ✅ v3 | 机器学习 | 模型与训练 |
| `glue-2018` | [GLUE — 给 NLU 模型出一张包含 9 道题的统考卷](/study/papers/glue-2018/) | ✅ v3 | 机器学习 | 模型与训练 |
| `goal-misgeneralization-2022` | [Goal Misgeneralization — 奖励函数完全正确，AI 还是可能学歪](/study/papers/goal-misgeneralization-2022/) | ✅ v3 | 机器学习 | 模型与训练 |
| `godel-1931` | [Gödel 1931 — 不完备性定理](/study/papers/godel-1931/) | ✅ v3 | 形式化方法 | 数学逻辑 / 计算理论 |
| `goldsmith-1987-bvh` | [Goldsmith-Salmon 1987 — 让计算机自己给场景搭层次包围盒](/study/papers/goldsmith-1987-bvh/) | ✅ v3 | 图形学 | 渲染与图形 |
| `google-1998` | [Google 1998 — 把整个网络爬下来、压扁、再用一秒查到](/study/papers/google-1998/) | ✅ v3 | 信息检索 | 检索与排序 |
| `goral-1984-radiosity` | [Goral 1984 Radiosity — 把建筑工程的辐射热传导算法搬进图形学](/study/papers/goral-1984-radiosity/) | ✅ v3 | 图形学 | 渲染与图形 |
| `gortler-1996-lumigraph` | [Lumigraph — 给 4D 光场加一层粗糙几何，让插值不再鬼影](/study/papers/gortler-1996-lumigraph/) | ✅ v3 | 图形学 | 渲染与图形 |
| `gpipe-2019` | [GPipe — micro-batch 流水线让 GPU 排成生产线](/study/papers/gpipe-2019/) | ✅ v3 | 图形学 | GPU 架构 |
| `gpt-3` | [GPT-3 — Language Models are Few-Shot Learners](/study/papers/gpt-3/) | ✅ v3 | NLP | NLP |
| `gptq-2023` | [GPTQ — 把 175B 大模型压成 4-bit 还几乎不掉点](/study/papers/gptq-2023/) | ✅ v3 | 图形学 | GPU 架构 |
| `gpu-cache-coherence-2013` | [GPU 缓存一致性 — 用时戳代替失效消息](/study/papers/gpu-cache-coherence-2013/) | ✅ v3 | 图形学 | GPU 架构 |
| `gpu-microbenchmarking-2010` | [GPU 微基准 — 用秒表把闭源芯片"戳"出真相](/study/papers/gpu-microbenchmarking-2010/) | ✅ v3 | 图形学 | GPU 架构 |
| `gpudirect-rdma-2014` | [GPUDirect RDMA — 让网卡直接读写 GPU 显存](/study/papers/gpudirect-rdma-2014/) | ✅ v3 | 图形学 | GPU 架构 |
| `graalvm-truffle` | [GraalVM Truffle — 写一棵会自我特化的语法树就能自动得到 JIT](/study/papers/graalvm-truffle/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `gradual-typing` | [渐进类型 — 让动态和静态类型在同一份代码里共存](/study/papers/gradual-typing/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `graf-saidi-1997` | [Graf-Saïdi — 用谓词把无限状态压成有限抽象](/study/papers/graf-saidi-1997/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `granule` | [Granule — 让类型系统同时数次数、看安全级、追副作用](/study/papers/granule/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `graphormer-2021` | [Graphormer — 标准 Transformer 直接刷爆 GNN](/study/papers/graphormer-2021/) | ✅ v3 | 机器学习 | 模型与训练 |
| `graphrag` | [GraphRAG — 微软的知识图谱 + RAG](/study/papers/graphrag/) | 🗄 存量 | 机器学习 | AI / NLP |
| `graphsage-2017` | [GraphSAGE 2017 — 给没见过的节点也能算嵌入](/study/papers/graphsage-2017/) | ✅ v3 | 机器学习 | 模型与训练 |
| `gray-1978-notes` | [Gray 1978 — 数据库操作系统讲义，事务/2PL/2PC/恢复一次讲完](/study/papers/gray-1978-notes/) | 🗄 存量 | 分布式系统 | 共识与复制 |
| `gray-1981-transaction` | [Gray 1981 — 把"事务"提升为通用抽象](/study/papers/gray-1981-transaction/) | ✅ v3 | 数据库 | 存储与查询 |
| `great-swe` | [Great SWE — 资深工程师"伟大"的标准是 humble + always learning](/study/papers/great-swe/) | ✅ v3 | 其他 | 软件工程 |
| `grokking-2022` | [Grokking — 训练 loss 早归零，几千步后才突然学会](/study/papers/grokking-2022/) | ✅ v3 | 机器学习 | 模型与训练 |
| `grounded-videollm-2024` | [Grounded-VideoLLM — 双流编码 + 时间 token，把「何时发生」写进 Video LLM](/study/papers/grounded-videollm-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `gru-2014` | [GRU 2014 — 用两个门替代 LSTM 三个门，编码-解码范式登场](/study/papers/gru-2014/) | ✅ v3 | 机器学习 | 模型与训练 |
| `gshard-2020` | [GShard — 用注解让 600B 模型自动跨设备切片](/study/papers/gshard-2020/) | ✅ v3 | 图形学 | GPU 架构 |
| `hacl-star-2017` | [HACL* — 用数学证明过的 C 加密代码，跑在你 Firefox 和 Linux 内核里](/study/papers/hacl-star-2017/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `halide` | [Halide — 把"算什么"和"怎么算"分开写](/study/papers/halide/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `hamming-1950` | [Hamming 纠错码](/study/papers/hamming-1950/) | ✅ v3 | 机器学习 | 信息论 |
| `hanrahan-1991-hierarchical-radiosity` | [Hanrahan 1991 Hierarchical Radiosity — 让 radiosity 从 O(n²) 跌到 O(n)](/study/papers/hanrahan-1991-hierarchical-radiosity/) | ✅ v3 | 图形学 | 渲染与图形 |
| `haven-2014` | [Haven — 把整个应用装进 CPU 黑盒，让云服务商也看不见](/study/papers/haven-2014/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `hawkeye-2024` | [HawkEye — 用递归缩窗把文本查询钉在长视频时间轴上](/study/papers/hawkeye-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `haystack-2010` | [Haystack — Facebook 十亿张照片怎么存](/study/papers/haystack-2010/) | ✅ v3 | 数据库 | 存储与查询 |
| `hazard-pointers-2004` | [Hazard Pointers — 多线程下安全释放共享节点](/study/papers/hazard-pointers-2004/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `hdfs-2010` | [HDFS — 把 GFS 用 Java 重写一遍并撑到 25 PB](/study/papers/hdfs-2010/) | ✅ v3 | 数据库 | 存储与查询 |
| `heartbleed-2014` | [Heartbleed — 一个忘了写边界检查的 bug 让全网 1/3 的 HTTPS 站点漏内存](/study/papers/heartbleed-2014/) | ✅ v3 | 网络协议 | 网络协议 |
| `heckbert-1986-texture-survey` | [Heckbert 1986 — 把"贴图"这件事讲清楚的第一篇综述](/study/papers/heckbert-1986-texture-survey/) | ✅ v3 | 图形学 | 渲染与图形 |
| `helium-type-errors` | [Helium — 让类型错误说人话的教学版 Haskell](/study/papers/helium-type-errors/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `helland-2007` | [Life Beyond Distributed Transactions — 大规模系统下放弃跨机事务的宣言](/study/papers/helland-2007/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `herlihy-moss-tm` | [Herlihy-Moss 事务内存 — 把数据库事务搬进 CPU](/study/papers/herlihy-moss-tm/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `hewitt-actor-model` | [Hewitt Actor 模型 — 把计算拆成一群只会发消息的小邮筒](/study/papers/hewitt-actor-model/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `hindley-milner` | [Hindley-Milner — 编译器自己猜变量类型](/study/papers/hindley-milner/) | 🗄 存量 | 编程语言 | 编程语言 |
| `hits-1999` | [HITS — 给网页同时打两个分：权威页 + 索引页](/study/papers/hits-1999/) | ✅ v3 | 信息检索 | 检索与排序 |
| `hlc-2014` | [HLC 2014 — 把逻辑时钟和物理时钟合一，让普通服务器也能拍一致快照](/study/papers/hlc-2014/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `hnsw-2018` | [HNSW — 多层近邻图让向量检索从 O(N) 降到近似 O(log N)](/study/papers/hnsw-2018/) | ✅ v3 | 数据库 | 存储与查询 |
| `hoare-logic` | [Hoare Logic — 把"程序对不对"变成"数学证明对不对"](/study/papers/hoare-logic/) | 🗄 存量 | 编程语言 | 编程语言 / 形式化方法 |
| `hol-light-2009` | [HOL Light — 不到 500 行 OCaml 写出能证开普勒猜想的证明助手](/study/papers/hol-light-2009/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `holzmann-spin-1997` | [SPIN — 让计算机帮你穷举并发程序的所有可能执行](/study/papers/holzmann-spin-1997/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `hopper-architecture-2022` | [NVIDIA Hopper — Transformer Engine + FP8 + TMA + Thread Block Cluster 把硅片为 LLM 量身定制](/study/papers/hopper-architecture-2022/) | ✅ v3 | 图形学 | GPU 架构 |
| `hotspot-server-compiler` | [HotSpot Server Compiler — JVM 在运行时把热点 Java 代码翻译成飞快的本地码](/study/papers/hotspot-server-compiler/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `hotstuff-2019` | [HotStuff — 让换领导也只花线性消息的 BFT 共识](/study/papers/hotstuff-2019/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `hott-book-2013` | [HoTT Book — 把"相等"重定义为路径，再让数学和程序共用同一本教材](/study/papers/hott-book-2013/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `hour-llava-2025` | [Hour-LLaVA — 记忆增强，让 LLaVA 读懂一小时视频](/study/papers/hour-llava-2025/) | ✅ v3 | 机器学习 | 视频理解 |
| `http-2` | [HTTP/2 — 把 HTTP 从文本协议改造成二进制多路复用](/study/papers/http-2/) | ✅ v3 | 网络协议 | 网络协议 |
| `hu-2018-mls-mpm` | [MLS-MPM — 把 MPM 重写到"几百行能跑实时"的现代版本](/study/papers/hu-2018-mls-mpm/) | ✅ v3 | 图形学 | 渲染与图形 |
| `huffman-1952` | [Huffman 编码](/study/papers/huffman-1952/) | ✅ v3 | 机器学习 | 信息论 / 算法 |
| `hughes-fp-matters` | [Why FP Matters — 函数式真正赢在能拆能粘](/study/papers/hughes-fp-matters/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `hydra-1974` | [HYDRA — 用 capability 把整个内核重做成对象 + 票据](/study/papers/hydra-1974/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `hyperkernel-2017` | [Hyperkernel — 让 SMT 求解器一键验证操作系统内核](/study/papers/hyperkernel-2017/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `ice-rfc-5245` | [Interactive Connectivity Establishment (ICE): A Protocol for Network Address Translator (NAT) Traversal](/study/papers/ice-rfc-5245/) | ✅ v3 | 网络协议 | 网络协议 |
| `idris-brady` | [Idris — 让依赖类型从证明助理变成通用编程语言](/study/papers/idris-brady/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `imagen-2022` | [Imagen — 文生图真正的引擎是语言模型](/study/papers/imagen-2022/) | ✅ v3 | 机器学习 | 模型与训练 |
| `immix-mark-region` | [Immix — 把"扫"和"搬"两种垃圾回收揉成一个](/study/papers/immix-mark-region/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `indri-2005` | [Indri 2005 — 把语言模型、推断网络、结构化查询拼成一个搜索引擎](/study/papers/indri-2005/) | ✅ v3 | 信息检索 | 检索与排序 |
| `induction-heads` | [Induction Heads — Transformer 的 in-context learning 引擎](/study/papers/induction-heads/) | ✅ v3 | 机器学习 | AI 可解释性 |
| `infer-biabduction` | [Bi-Abduction — 让静态分析自动猜出函数缺什么前提](/study/papers/infer-biabduction/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `ingres-1976` | [INGRES 1976 — Berkeley 平行实现的关系数据库](/study/papers/ingres-1976/) | ✅ v3 | 数据库 | 存储与查询 |
| `instant-ngp-2022` | [Instant-NGP — 秒级训练 NeRF 的多分辨率哈希编码](/study/papers/instant-ngp-2022/) | ✅ v3 | 机器学习 | 模型与训练 |
| `instructgpt` | [InstructGPT — RLHF 让 LLM 听话](/study/papers/instructgpt/) | ✅ v3 | NLP | NLP |
| `internvideo2-2024` | [InternVideo2 — 三阶段渐进训练，把视频基础模型扩到 6B](/study/papers/internvideo2-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `internvideo2-5-2025` | [InternVideo2.5 — 长富上下文 + HiCo 层次压缩](/study/papers/internvideo2-5-2025/) | ✅ v3 | 机器学习 | 视频理解 |
| `internvl-2023` | [InternVL — 6B 视觉基座 + QLLaMA 对齐开源多模态](/study/papers/internvl-2023/) | ✅ v3 | 机器学习 | 模型与训练 |
| `io-uring` | [io_uring — Linux 让 N 次 IO 摊销到 1 次 syscall](/study/papers/io-uring/) | ✅ v3 | 操作系统 | 操作系统 |
| `ipfs-2014` | [IPFS — 把"地址"换成"内容本身"的 P2P 文件系统](/study/papers/ipfs-2014/) | ✅ v3 | 网络协议 | 网络协议 |
| `iris-2015` | [Iris 2015 — 把并发推理拆成 monoid + invariant 两块积木](/study/papers/iris-2015/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `ironfleet-2015` | [IronFleet — 把分布式协议证到一行 bug 都没有](/study/papers/ironfleet-2015/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `isabelle-hol-2002` | [Isabelle/HOL — 让程序证明像写数学论文一样可读](/study/papers/isabelle-hol-2002/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `islands-architecture` | [Islands Architecture — 静态页面里只让需要交互的小块加载 JS](/study/papers/islands-architecture/) | ✅ v3 | 后端 API | 前端框架 |
| `jacobson-1988` | [Jacobson 1988 — 让互联网不再被自己塞死](/study/papers/jacobson-1988/) | ✅ v3 | 网络协议 | 网络协议 |
| `janus-2016` | [Janus 2016 — 把并发控制和共识捏成一个协议](/study/papers/janus-2016/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `jemalloc-2006` | [jemalloc — 多 arena 让多线程 malloc 不再互相等](/study/papers/jemalloc-2006/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `jensen-1996-photon-mapping` | [Jensen 光子映射 — 先撒光子再查密度的两 pass 全局光照](/study/papers/jensen-1996-photon-mapping/) | ✅ v3 | 图形学 | 渲染与图形 |
| `jupiter-1995` | [Jupiter — 把 OT 简化成 client-server，让协同编辑能上工业](/study/papers/jupiter-1995/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `jupiter-2015` | [Jupiter Rising — Google 数据中心网络十年怎么做到带宽涨百倍](/study/papers/jupiter-2015/) | ✅ v3 | 网络协议 | 网络协议 |
| `jwt-rfc-7519` | [JWT RFC 7519 — 把身份证装进一段可校验的字符串](/study/papers/jwt-rfc-7519/) | ✅ v3 | 后端 API | 后端 |
| `k3s` | [k3s — 把整个 Kubernetes 装进一个 70 MB 的二进制](/study/papers/k3s/) | ✅ v3 | 基础设施 | 基础设施 |
| `kademlia-2002` | [Kademlia — 用 XOR 当距离的 P2P 路由表](/study/papers/kademlia-2002/) | ✅ v3 | 网络协议 | 网络协议 |
| `kafka` | [Kafka — 把消息系统降维成只追加的日志文件](/study/papers/kafka/) | ✅ v3 | 分布式系统 | databases / 分布式系统 |
| `kafka-2011` | [Kafka NetDB 2011 — 把消息中间件砍成"会写文件的水管"](/study/papers/kafka-2011/) | ✅ v3 | 数据库 | 存储与查询 |
| `kahn-natural-semantics` | [Kahn 自然语义 — 用一棵推理树说清楚程序求值](/study/papers/kahn-natural-semantics/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `kairouz-advances-fl-2019` | [联邦学习综述 — 60+ 作者合写的联邦学习百科与 58 道开放题](/study/papers/kairouz-advances-fl-2019/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `kajiya-1986-rendering-equation` | [Kajiya 渲染方程 — 把所有渲染算法统一成一个积分方程](/study/papers/kajiya-1986-rendering-equation/) | ✅ v3 | 图形学 | 渲染与图形 |
| `kami-2017` | [Kami — 在 Coq 里造硬件并自动编译到 Verilog](/study/papers/kami-2017/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `karger-1997-consistent-hashing` | [Karger 1997 一致性哈希 — 加机器不用全员搬家](/study/papers/karger-1997-consistent-hashing/) | ✅ v3 | 网络协议 | 网络协议 |
| `karis-2014-taa` | [Karis 2014 TAA — 让游戏每帧只采一次也能 4K 不锯齿](/study/papers/karis-2014-taa/) | ✅ v3 | 图形学 | 渲染与图形 |
| `karis-2014-ue4-pbr` | [Karis UE4 PBR — 把电影质感塞进游戏的 33 毫秒](/study/papers/karis-2014-ue4-pbr/) | ✅ v3 | 图形学 | 渲染与图形 |
| `karp-21` | [Karp 21 — 21 个 NP-完全问题](/study/papers/karp-21/) | ✅ v3 | 编程语言 | 计算理论 |
| `karras-2012-parallel-bvh` | [Karras 2012 — 让每个 BVH 内部节点独立算自己（O(N) 全并行 GPU 构建）](/study/papers/karras-2012-parallel-bvh/) | ✅ v3 | 图形学 | 渲染与图形 |
| `kazhdan-2006-poisson-recon` | [Poisson Surface Reconstruction — 把点云变成水密网格的全局解法](/study/papers/kazhdan-2006-poisson-recon/) | ✅ v3 | 图形学 | 渲染与图形 |
| `kepler-architecture-2012` | [NVIDIA Kepler — 把 GPU 调成深度学习训练默认机型](/study/papers/kepler-architecture-2012/) | ✅ v3 | 图形学 | GPU 架构 |
| `kildall-dataflow` | [Kildall 数据流框架 — 用一套格论统一所有全局编译优化](/study/papers/kildall-dataflow/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `knrm-2017` | [K-NRM — 用核函数把交互矩阵变成可微排序信号](/study/papers/knrm-2017/) | ✅ v3 | 信息检索 | 检索与排序 |
| `knuth-lr-1965` | [Knuth LR(k) — 编译器自己读懂语法的算法](/study/papers/knuth-lr-1965/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `knuth-taocp` | [Knuth TAOCP — 计算机程序设计艺术](/study/papers/knuth-taocp/) | ✅ v3 | 编程语言 | 算法 |
| `kokkos-2014` | [Kokkos — 一份 C++ 代码同时跑 CPU、GPU、Xeon Phi](/study/papers/kokkos-2014/) | ✅ v3 | 图形学 | GPU 架构 |
| `koren-mf-2009` | [Koren-Bell-Volinsky 2009 — 把推荐系统的 MF 写成 8 页教科书](/study/papers/koren-mf-2009/) | ✅ v3 | 信息检索 | 检索与排序 |
| `krishnamurthy-1999-http11` | [Krishnamurthy 1999 — HTTP/1.0 到 1.1 究竟改了什么](/study/papers/krishnamurthy-1999-http11/) | ✅ v3 | 网络协议 | 网络协议 |
| `kubernetes-2016` | [Kubernetes — 为什么选声明式 API 加协调环](/study/papers/kubernetes-2016/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `kustomize` | [Kustomize — 不写模板也能给 K8s 配置分环境](/study/papers/kustomize/) | 🗄 存量 | 基础设施 | 基础设施 |
| `kvm-2007` | [KVM 2007 — 把 Linux 内核本身变成 hypervisor](/study/papers/kvm-2007/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `l4-1995` | [L4 — Liedtke 用 12KB 内核反驳"微内核必然慢"](/study/papers/l4-1995/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `label-smoothing-2016` | [Label Smoothing — 别让模型对正确答案过度自信](/study/papers/label-smoothing-2016/) | ✅ v3 | 机器学习 | 模型与训练 |
| `lafortune-1993-bdpt` | [Lafortune-Willems 1993 — 从相机和光源同时撒光线再"接龙"](/study/papers/lafortune-1993-bdpt/) | ✅ v3 | 图形学 | 渲染与图形 |
| `lalr-deremer` | [DeRemer LALR(1) — 把 LR 表压到能用大小](/study/papers/lalr-deremer/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `lambda-calculus` | [λ-演算 — 用三条规则表达所有可计算函数](/study/papers/lambda-calculus/) | 🗄 存量 | 编程语言 | 编程语言 / 计算理论 |
| `lambdarank-2006` | [LambdaRank — 跳过定义损失函数，直接把梯度写出来](/study/papers/lambdarank-2006/) | ✅ v3 | 信息检索 | 检索与排序 |
| `lamport-1978` | [Lamport 1978 — 分布式系统里没有"绝对的同时"](/study/papers/lamport-1978/) | 🗄 存量 | 分布式系统 | papers / 分布式系统 |
| `lamport-tla-1994` | [TLA — 把状态机和时序逻辑捏成一个公式](/study/papers/lamport-tla-1994/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `lampson-hints` | [Lampson Hints — 把做系统的隐式品味写成 27 条经验法则](/study/papers/lampson-hints/) | ✅ v3 | 分布式系统 | 系统设计 |
| `landin-secd` | [Landin SECD — 第一台机械求值 lambda 表达式的抽象机器](/study/papers/landin-secd/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `layernorm-2016` | [Layer Normalization — 把归一化方向从 batch 转到 feature，让 RNN/Transformer 也能稳定训](/study/papers/layernorm-2016/) | ✅ v3 | 机器学习 | 模型与训练 |
| `lean-prover` | [Lean 4 — 用 Lean 重写的 Lean，让数学家和程序员共用一种语言](/study/papers/lean-prover/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `lean-tactics` | [Lean Tactics — 让证明助手把"写证明"当成写程序](/study/papers/lean-tactics/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `leis-2015-optimizers` | [Leis 2015 — 用真实数据打脸所有数据库的查询优化器](/study/papers/leis-2015-optimizers/) | ✅ v3 | 数据库 | 存储与查询 |
| `lerner-seminal` | [Lerner 组合数据流 — 让小优化互相喂招](/study/papers/lerner-seminal/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `levoy-hanrahan-1996-light-field` | [Light Field Rendering — 把场景拍成 4D 数组，新视角靠查表](/study/papers/levoy-hanrahan-1996-light-field/) | ✅ v3 | 图形学 | 渲染与图形 |
| `lfs-1991` | [LFS 1991 — 把整个磁盘当日志写](/study/papers/lfs-1991/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `li-2018-redner` | [redner — 让光线追踪能反向传播过几何边缘](/study/papers/li-2018-redner/) | ✅ v3 | 图形学 | 渲染与图形 |
| `lieberman-realtime-gc` | [Lieberman-Hewitt 1983 — 把对象寿命统计偏斜兑换成有界停顿](/study/papers/lieberman-realtime-gc/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `lindholm-2008-tesla` | [Lindholm 2008 Tesla — SM、warp、SIMT 这套词汇的官方出生证明](/study/papers/lindholm-2008-tesla/) | ✅ v3 | 图形学 | 渲染与图形 |
| `linear-scan-reg-alloc` | [Linear Scan 寄存器分配 — 把图染色换成单趟扫描，给 JIT 用](/study/papers/linear-scan-reg-alloc/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `linear-types` | [线性类型（Linear Types）](/study/papers/linear-types/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `linearizability-1990` | [Linearizability 1990 — 让并发对象看起来像一次只执行一个操作](/study/papers/linearizability-1990/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `lion-2023` | [Lion — 让程序自己搜出来的优化器，比 AdamW 内存少一半](/study/papers/lion-2023/) | ✅ v3 | 机器学习 | 模型与训练 |
| `liquid-types` | [Liquid Types — 让编译器自己推导出"哪些值才合法"](/study/papers/liquid-types/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `liu-2020-dlss` | [DLSS 2.0 — 把 4K 实时渲染的一半工作量交给神经网络](/study/papers/liu-2020-dlss/) | ✅ v3 | 图形学 | 渲染与图形 |
| `livevlm-2025` | [LiveVLM — 免训练流式视觉 token 压缩](/study/papers/livevlm-2025/) | ✅ v3 | 机器学习 | 视频理解 |
| `llama` | [LLaMA — Meta 开源大语言模型](/study/papers/llama/) | ✅ v3 | 机器学习 | NLP / LLM |
| `llama-vid-2023` | [LLaMA-VID — 每帧两枚 token，把小时级视频塞进 LLM](/study/papers/llama-vid-2023/) | ✅ v3 | 机器学习 | 视频理解 |
| `llava` | [LLaVA — 开源多模态对话模型](/study/papers/llava/) | ✅ v3 | 机器学习 | 多模态 / NLP |
| `llava-onevision-2024` | [LLaVA-OneVision — 单图、多图、视频一个模型全搞定](/study/papers/llava-onevision-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `llava-video-2024` | [LLaVA-Video — LLaVA-NeXT 视频主线，合成数据 + SlowFast 采帧](/study/papers/llava-video-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `llm-int8-2022` | [LLM.int8() — 大模型激活值里藏着几个超大异常通道](/study/papers/llm-int8-2022/) | ✅ v3 | 图形学 | GPU 架构 |
| `llm-wiki-retrieval-reasoning` | [LLM-Wiki — 把外部知识编译成 agent 自己的"维基"](/study/papers/llm-wiki-retrieval-reasoning/) | ✅ v3 | Agent | 智能体与 LLM |
| `llmvs-2025` | [LLMVS — 用 LLM 语义裁判给视频帧打分做摘要](/study/papers/llmvs-2025/) | ✅ v3 | 机器学习 | 视频理解 |
| `llvm` | [LLVM — 模块化编译器框架](/study/papers/llvm/) | 🗄 存量 | 编译器 | 编译器 |
| `lmdb-2011` | [LMDB 2011 — 把数据库直接 mmap 进内存的嵌入式 KV 存储](/study/papers/lmdb-2011/) | ✅ v3 | 数据库 | 存储与查询 |
| `local-type-inference` | [Local Type Inference — 编译器只看相邻节点也能推出类型](/study/papers/local-type-inference/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `locus-1980` | [LOCUS 1980 — 让一群机器看起来像同一台机器](/study/papers/locus-1980/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `logjam-2015` | [Logjam 2015 — 全世界共用一把锁，国家级窃听者一次撬完](/study/papers/logjam-2015/) | ✅ v3 | 网络协议 | 网络协议 |
| `logoot-2010` | [Logoot — 给每个字符发一张"永不过期的座位号"](/study/papers/logoot-2010/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `long-video-retrieval-2023` | [R-VLM — 长视频不靠均匀采帧，靠可学习检索选片段](/study/papers/long-video-retrieval-2023/) | ✅ v3 | 机器学习 | 视频理解 |
| `longformer-2020` | [Longformer — 滑窗加少数全局 token，把长文档喂进 Transformer](/study/papers/longformer-2020/) | ✅ v3 | 机器学习 | 模型与训练 |
| `longva-2024` | [LongVA — 把语言模型的长上下文能力「搬」到视频上](/study/papers/longva-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `longvideobench-2024` | [LongVideoBench — 一小时交织字幕视频的长上下文理解考卷](/study/papers/longvideobench-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `longvila-2024` | [LongVILA — 把 VILA 从 8 帧扩到 2048 帧的长视频全栈方案](/study/papers/longvila-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `loop-1987-subdivision` | [Loop 1987 — 三角形网格的递归光滑细分](/study/papers/loop-1987-subdivision/) | ✅ v3 | 图形学 | 渲染与图形 |
| `lottery-1994` | [彩票调度 — 用抽奖代替优先级的资源分配](/study/papers/lottery-1994/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `lottery-ticket-2019` | [彩票假设 — 大网里藏着一张能独立训出来的小网](/study/papers/lottery-ticket-2019/) | ✅ v3 | 机器学习 | 模型与训练 |
| `lsh-indyk-1998` | [LSH — 让相似点撞同一个桶，把高维最近邻查询从线性变成亚线性](/study/papers/lsh-indyk-1998/) | ✅ v3 | 信息检索 | 检索与排序 |
| `lsm-tree-1996` | [LSM-Tree 1996 — 写优化存储引擎](/study/papers/lsm-tree-1996/) | ✅ v3 | 数据库 | 存储与查询 |
| `lstm-1997` | [LSTM — 用门控让神经网络记得住上一段话](/study/papers/lstm-1997/) | ✅ v3 | 机器学习 | 模型与训练 |
| `lucky13-2013` | [Lucky 13 — 用毫秒级时间差把 TLS 加密看穿](/study/papers/lucky13-2013/) | ✅ v3 | 网络协议 | 网络协议 |
| `lvbench-2024` | [LVBench — 平均 68 分钟、六维能力的长视频极限考](/study/papers/lvbench-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `mach-1986` | [Mach — 把内核拆成消息互通的小服务](/study/papers/mach-1986/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `mach-vm-1987` | [Mach VM — 把虚拟内存抽象成"对象"，与硬件解耦](/study/papers/mach-vm-1987/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `macklin-2014-position-based-fluids` | [Position Based Fluids — 把水也塞进 PBD 同一套框架](/study/papers/macklin-2014-position-based-fluids/) | ✅ v3 | 图形学 | 渲染与图形 |
| `mae` | [MAE — Masked Autoencoders](/study/papers/mae/) | 🗄 存量 | 机器学习 | 计算机视觉 / 自监督 |
| `magic3d-2023` | [Magic3D — 把 DreamFusion 的 NeRF 拆成"先粗后精"两阶段](/study/papers/magic3d-2023/) | ✅ v3 | 机器学习 | 模型与训练 |
| `mahajan-2002-bgp-misconfig` | [Mahajan 2002 — 三周看互联网，1% 的路由更新是手滑](/study/papers/mahajan-2002-bgp-misconfig/) | ✅ v3 | 网络协议 | 网络协议 |
| `mamba` | [Mamba — 选择性状态空间模型](/study/papers/mamba/) | ✅ v3 | 机器学习 | NLP / 深度学习 |
| `maml-2017` | [MAML — 学一个"好起点"，几步就能学会新任务](/study/papers/maml-2017/) | ✅ v3 | 机器学习 | 模型与训练 |
| `mapreduce` | [MapReduce — 用户只写两个函数，框架替你扛千节点](/study/papers/mapreduce/) | ✅ v3 | 分布式系统 | 分布式系统 |
| `marching-cubes-1987` | [Marching Cubes 1987 — 把体数据切成立方体查表生成三角网格](/study/papers/marching-cubes-1987/) | ✅ v3 | 图形学 | 渲染与图形 |
| `maron-kuhns-1960` | [Maron-Kuhns 1960 — 检索不是匹配，是猜"对你有用的概率"](/study/papers/maron-kuhns-1960/) | ✅ v3 | 信息检索 | 检索与排序 |
| `marques-silva-grasp-1996` | [GRASP 1996 — 让 SAT 求解器从冲突里学到东西](/study/papers/marques-silva-grasp-1996/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `martin-lof-itt` | [Martin-Löf 直觉主义类型论 — 让"证明"和"程序"变成同一件事](/study/papers/martin-lof-itt/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `mattern-1989` | [Mattern 1989 — 虚拟时间与全局状态：把分布式时钟变成 N 维笛卡尔积](/study/papers/mattern-1989/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `maxwell-architecture-2014` | [NVIDIA Maxwell — 同一工艺节点把性能每瓦翻一倍](/study/papers/maxwell-architecture-2014/) | ✅ v3 | 图形学 | GPU 架构 |
| `mccarthy-lisp` | [McCarthy LISP 1960](/study/papers/mccarthy-lisp/) | ✅ v3 | 编程语言 | 编程语言 |
| `mcfarling-bp-1993` | [McFarling 1993 — 用 XOR 把全局历史和 PC 拧在一起，再让两个预测器打擂台](/study/papers/mcfarling-bp-1993/) | ✅ v3 | 图形学 | GPU 架构 |
| `mcmahan-fedavg-2017` | [FedAvg — 联邦学习奠基算法](/study/papers/mcmahan-fedavg-2017/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `mcmillan-smv-1993` | [McMillan SMV 1993 — 把状态空间从 10^6 推到 10^20 的符号模型检测](/study/papers/mcmillan-smv-1993/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `mcp-spec` | [MCP — 让一个 LLM 客户端能插任何外部能力的 USB 协议](/study/papers/mcp-spec/) | ✅ v3 | 机器学习 | AI 工程 |
| `mcs-locks-1991` | [MCS 锁 — 让每个线程自旋在自己的缓存行上](/study/papers/mcs-locks-1991/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `meagher-1982-octree` | [Meagher 1982 八叉树 — 把立方体一分为八，递归地装下一整个 3D 世界](/study/papers/meagher-1982-octree/) | ✅ v3 | 图形学 | 渲染与图形 |
| `medusa-2024` | [Medusa — 让大模型自己同时猜好几个 token](/study/papers/medusa-2024/) | ✅ v3 | 图形学 | GPU 架构 |
| `megastore-2011` | [Megastore — 把数据切成"小数据库"换跨地域同步复制](/study/papers/megastore-2011/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `megatron-lm` | [Megatron-LM — NVIDIA 大规模训练框架](/study/papers/megatron-lm/) | ✅ v3 | 分布式系统 | 模型与训练 |
| `memcached-fb-2013` | [Scaling Memcache at Facebook — 万台缓存怎么不被踩塌](/study/papers/memcached-fb-2013/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `memcoder-co-evolution` | [MemCoder — code agent 跟着你 git commit 一起成长](/study/papers/memcoder-co-evolution/) | ✅ v3 | Agent | 智能体与 LLM |
| `mencius-2008` | [Mencius — 让多台服务器轮流当 Paxos 的 leader](/study/papers/mencius-2008/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `mermaid` | [Mermaid — 用文本写图，让代码评审能 diff 流程图](/study/papers/mermaid/) | ✅ v3 | 基础设施 | 工具与基础设施 |
| `mesa-optimization-2019` | [Mesa-Optimization 2019 — 训出来的模型自己也是个优化器](/study/papers/mesa-optimization-2019/) | ✅ v3 | 机器学习 | 模型与训练 |
| `mesos-2011` | [Mesos 2011 — 把数据中心切成资源 offer 发给框架自己挑](/study/papers/mesos-2011/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `metagpt` | [MetaGPT — 多智能体软件公司](/study/papers/metagpt/) | ✅ v3 | 机器学习 | 智能体与 LLM |
| `metaml-multi-stage` | [MetaML — 让你显式地写"先生成代码、再跑代码"](/study/papers/metaml-multi-stage/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `metcalfe-boggs-1976` | [Metcalfe-Boggs 1976 — 一根线上几百台电脑怎么不打架](/study/papers/metcalfe-boggs-1976/) | ✅ v3 | 网络协议 | 网络协议 |
| `mills-ntp-1991` | [NTP 1991 — 用四个时间戳和一棵服务器树，让全互联网的钟差几毫秒](/study/papers/mills-ntp-1991/) | ✅ v3 | 网络协议 | 网络协议 |
| `millwheel-2013` | [MillWheel 2013 — Google 给互联网级流处理装上不漏不重的发动机](/study/papers/millwheel-2013/) | ✅ v3 | 数据库 | 存储与查询 |
| `milner-pi-calculus` | [π-演算 — 让通道名本身能在通道里流动](/study/papers/milner-pi-calculus/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `milvus-2021` | [Milvus — 为向量检索而生的数据库](/study/papers/milvus-2021/) | ✅ v3 | 数据库 | 存储与查询 |
| `mind-skill` | [MIND-Skill — 用归纳和演绎双 agent 抽 skill 并保证质量](/study/papers/mind-skill/) | ✅ v3 | Agent | 智能体与 LLM |
| `mine-octagon-2006` | [Miné 八边形抽象域 — 在区间和多面体之间的甜点](/study/papers/mine-octagon-2006/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `minhash-broder-1997` | [MinHash — 用最小哈希值估算两个集合的重叠度](/study/papers/minhash-broder-1997/) | ✅ v3 | 信息检索 | 检索与排序 |
| `minicpm-v-2024` | [MiniCPM-V — 手机能跑的 GPT-4V 级多模态模型](/study/papers/minicpm-v-2024/) | ✅ v3 | 机器学习 | 模型与训练 |
| `minisat-2003` | [MiniSat 2003 — 600 行 C++ 把 CDCL 写成教科书](/study/papers/minisat-2003/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `mips-1981` | [MIPS 1981 — 让编译器自己安排流水线，CPU 就不用管](/study/papers/mips-1981/) | ✅ v3 | 图形学 | GPU 架构 |
| `mirage-2013` | [MirageOS Unikernels — 应用即内核，把操作系统编译掉](/study/papers/mirage-2013/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `mironov-renyi-dp-2017` | [Rényi 差分隐私 — 隐私会计统一框架](/study/papers/mironov-renyi-dp-2017/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `misevolution-2509` | [Misevolution — 自进化 agent 也会"越改越坏"，连顶配模型也躲不过](/study/papers/misevolution-2509/) | ✅ v3 | Agent | 智能体与 LLM |
| `mitls-2014-triple-handshake` | [Triple Handshake — TLS 同一把主密钥被复用，黑客就能换人不换锁](/study/papers/mitls-2014-triple-handshake/) | ✅ v3 | 网络协议 | 网络协议 |
| `mixture-of-experts` | [Mixture of Experts (MoE)](/study/papers/mixture-of-experts/) | ✅ v3 | 机器学习 | NLP / 深度学习 |
| `mixup-2018` | [mixup — 把两张图按比例叠成一张，标签也一起叠](/study/papers/mixup-2018/) | ✅ v3 | 机器学习 | 模型与训练 |
| `mlflow` | [MLflow — 给机器学习实验装上"记账本和身份证"](/study/papers/mlflow/) | ✅ v3 | 机器学习 | MLOps / ML 平台 |
| `mlir` | [MLIR — 给编译器一套乐高，每层抽象都能搭自己的方言](/study/papers/mlir/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `mllm-benchmark-survey-2024` | [MLLM Benchmark Survey — 200+ 多模态评测基准地图](/study/papers/mllm-benchmark-survey-2024/) | ✅ v3 | 机器学习 | 多模态 LLM |
| `mlvtg-2025` | [MLVTG — MambaAligner + 冻结 LLM 提纯的多模态视频时序定位](/study/papers/mlvtg-2025/) | ✅ v3 | 机器学习 | 视频理解 |
| `mlvu-2024` | [MLVU — 九类任务、多时长分层的长视频理解大考](/study/papers/mlvu-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `mme-benchmark-2023` | [MME Benchmark — 开源 MLLM 评测的事实起点](/study/papers/mme-benchmark-2023/) | ✅ v3 | 机器学习 | 多模态 LLM |
| `mme-survey-2024` | [MME-Survey — 多模态 LLM 怎么评才靠谱](/study/papers/mme-survey-2024/) | ✅ v3 | 机器学习 | 多模态 LLM |
| `mmlu-2021` | [MMLU — 用 57 个学科的多选题考一考语言模型](/study/papers/mmlu-2021/) | ✅ v3 | 机器学习 | 模型与训练 |
| `mmmu-2023` | [MMMU — 大学级多学科多模态推理基准](/study/papers/mmmu-2023/) | ✅ v3 | 机器学习 | 多模态大模型 |
| `mmskills-multimodal` | [MMSkills — 把视觉 agent 的"操作经验"做成多模态卡片](/study/papers/mmskills-multimodal/) | ✅ v3 | Agent | 智能体与 LLM |
| `mockapetris-1988-dns` | [Mockapetris 1988 DNS — 设计者亲口讲为什么 DNS 长这样](/study/papers/mockapetris-1988-dns/) | ✅ v3 | 网络协议 | 网络协议 |
| `mode-connectivity-2018` | [Mode Connectivity — 神经网络的两个最优解之间有低洼走廊](/study/papers/mode-connectivity-2018/) | ✅ v3 | 机器学习 | 模型与训练 |
| `moesi-cache-coherence-1986` | [Sweazey-Smith MOESI 1986 — 给多核 CPU 一份"谁手里有这块内存"的统一规则](/study/papers/moesi-cache-coherence-1986/) | ✅ v3 | 图形学 | GPU 架构 |
| `mogul-1995-persistent-http` | [Mogul 1995 — 为什么 HTTP 必须改成"一根连接复用多次请求"](/study/papers/mogul-1995-persistent-http/) | ✅ v3 | 网络协议 | 网络协议 |
| `monaghan-1992-sph` | [SPH — 把流体拆成一群带核的粒子](/study/papers/monaghan-1992-sph/) | ✅ v3 | 图形学 | 渲染与图形 |
| `monetdb-x100-2005` | [MonetDB/X100 — 让数据库一次处理一向量行而不是一行](/study/papers/monetdb-x100-2005/) | ✅ v3 | 数据库 | 存储与查询 |
| `monitors-1974` | [Hoare Monitors 1974 — 把锁藏进对象里，让并发代码读起来像普通函数](/study/papers/monitors-1974/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `moviechat-2024` | [MovieChat — 从稠密帧到稀疏记忆，小时级电影也能聊](/study/papers/moviechat-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `mplug-owl-2023` | [mPLUG-Owl — 模块化拼装多模态大模型](/study/papers/mplug-owl-2023/) | ✅ v3 | 机器学习 | 模型与训练 |
| `mptcp-2012` | [MPTCP 2012 — 把一根 TCP 管道变成多条并行水管](/study/papers/mptcp-2012/) | ✅ v3 | 网络协议 | 网络协议 |
| `mqtt-s-2008` | [MQTT-S 2008 — 把发布/订阅消息机制装进传感器芯片](/study/papers/mqtt-s-2008/) | ✅ v3 | 网络协议 | 网络协议 |
| `ms-marco-2016` | [MS MARCO — 1 千万 Bing 真实查询喂饱神经检索的标准评测集](/study/papers/ms-marco-2016/) | ✅ v3 | 信息检索 | 检索与排序 |
| `mueller-2007-pbd` | [Position Based Dynamics — 跳过力，直接挪位置](/study/papers/mueller-2007-pbd/) | ✅ v3 | 图形学 | 渲染与图形 |
| `mueller-2022-instant-ngp` | [Instant-NGP — 把 NeRF 训练从几小时压到 5 秒](/study/papers/mueller-2022-instant-ngp/) | ✅ v3 | 图形学 | 渲染与图形 |
| `multics-1965` | [MULTICS 1965 — 把计算机做成像电力一样的公共服务](/study/papers/multics-1965/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `muzero` | [MuZero — 不用规则也能下棋](/study/papers/muzero/) | 🗄 存量 | 机器学习 | 强化学习 |
| `mvbench-2023` | [MVBench — 二十道题拆穿视频大模型真懂还是装懂](/study/papers/mvbench-2023/) | ✅ v3 | 机器学习 | 视频理解 |
| `mycroft-strictness` | [Mycroft 严格性分析 — 编译器替你判定哪些参数能"先算"](/study/papers/mycroft-strictness/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `naiad-2013` | [Naiad — 一套引擎同时跑批处理、流处理和迭代计算](/study/papers/naiad-2013/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `narwhal-tusk-2022` | [Narwhal & Tusk — 把 BFT 共识拆成『谁说过』和『谁先说』两件事](/study/papers/narwhal-tusk-2022/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `nbeats-2020` | [N-BEATS — 纯前馈网络在时序预测上打败统计派](/study/papers/nbeats-2020/) | ✅ v3 | 机器学习 | 模型与训练 |
| `nelson-oppen-1979` | [Nelson-Oppen 1979 — 让多个判定程序坐下来交换"我刚发现 a=b"](/study/papers/nelson-oppen-1979/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `nerf-2020` | [NeRF — 用一个 MLP 把整个场景"背"下来](/study/papers/nerf-2020/) | ✅ v3 | 图形学 | 渲染与图形 |
| `netflix-bellkor-2009` | [BellKor Netflix Prize 2009 — 集成学习赢下 100 万美金的工程实录](/study/papers/netflix-bellkor-2009/) | ✅ v3 | 信息检索 | 检索与排序 |
| `netkat-2014` | [NetKAT 2014 — 把网络转发写成可以做数学等式变换的代数式](/study/papers/netkat-2014/) | ✅ v3 | 网络协议 | 网络协议 |
| `neumann-2015-large-joins` | [Adaptive Optimization of Very Large Join Queries — 100 张表也敢精确求解](/study/papers/neumann-2015-large-joins/) | ✅ v3 | 数据库 | 存储与查询 |
| `neumf-2017` | [NeuMF — 用神经网络替掉推荐系统的内积](/study/papers/neumf-2017/) | ✅ v3 | 信息检索 | 检索与排序 |
| `newcombe-2011-kinectfusion` | [KinectFusion — 用消费级深度相机实时重建三维世界](/study/papers/newcombe-2011-kinectfusion/) | ✅ v3 | 图形学 | 渲染与图形 |
| `newsome-taintcheck-2005` | [Dynamic Taint Analysis for Automatic Detection, Analysis, and Signature Generation of Exploits on Commodity Software](/study/papers/newsome-taintcheck-2005/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `nfs-1985` | [NFS 1985 — 让远程磁盘看起来像本地磁盘](/study/papers/nfs-1985/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `nickolls-dally-2010-cuda-era` | [Nickolls-Dally 2010 — GPU 怎么从画三角形变成跑 AI](/study/papers/nickolls-dally-2010-cuda-era/) | ✅ v3 | 图形学 | 渲染与图形 |
| `nieuwenhuis-dpll-t-2006` | [Nieuwenhuis-Oliveras-Tinelli 2006 — 给 SMT 求解器写一套数学规则书](/study/papers/nieuwenhuis-dpll-t-2006/) | 🗄 存量 | 形式化方法 | 形式化验证 |
| `nimier-david-2019-mitsuba2` | [Mitsuba 2 — 一份渲染代码同时编出 CPU / GPU / 可微版](/study/papers/nimier-david-2019-mitsuba2/) | ✅ v3 | 图形学 | 渲染与图形 |
| `nix` | [Nix — 把每个软件包当成纯函数的输出](/study/papers/nix/) | ✅ v3 | CLI | 包管理 / 系统 |
| `no-silver-bullet` | [No Silver Bullet — 软件难度的二分手术刀](/study/papers/no-silver-bullet/) | ✅ v3 | 其他 | 软件工程 |
| `ntk-2018` | [NTK — 把无限宽的神经网络变成一个可解的核方法](/study/papers/ntk-2018/) | ✅ v3 | 机器学习 | 模型与训练 |
| `ntp-mills-1991` | [NTP 1991 — 用四个时间戳和一组滤波器，让全网服务器的钟差几毫秒](/study/papers/ntp-mills-1991/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `nuprl-1986` | [Nuprl — 第一个把 Martin-Löf 类型论搬上屏幕的证明助手](/study/papers/nuprl-1986/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `nvila-2024` | [NVILA — 先放大分辨率再压缩 token 的高效 VLM](/study/papers/nvila-2024/) | ✅ v3 | 机器学习 | 模型与训练 |
| `nvlink-nvswitch-2018` | [NVLink 2.0 + NVSwitch — 把 16 块 GPU 拼成一台机器](/study/papers/nvlink-nvswitch-2018/) | ✅ v3 | 图形学 | GPU 架构 |
| `nvm` | [nvm — 在同一台机器上轻松切换 Node 版本](/study/papers/nvm/) | ✅ v3 | 后端 API | 前端工具链 |
| `nvme-protocol-2017` | [NVMe — 为 SSD 重写的存储协议](/study/papers/nvme-protocol-2017/) | ✅ v3 | 图形学 | GPU 架构 |
| `oauth-2.1-rfc` | [OAuth 2.1 — 把十年 OAuth 实战经验收口成一份能直接用的规范](/study/papers/oauth-21-rfc/) | ✅ v3 | 后端 API | 后端 |
| `okapi-bm25-1994` | [Robertson-Walker 1994 — 把 2-Poisson 压成一行能算的公式](/study/papers/okapi-bm25-1994/) | ✅ v3 | 信息检索 | 检索与排序 |
| `omagent-2024` | [OmAgent — 长视频分治 Agent 与回退检索](/study/papers/omagent-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `omega-2013` | [Omega 2013 — 让多个调度器同时改一份 cluster 状态](/study/papers/omega-2013/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `omnidirectional-mllm-2025` | [全景空间推理 — MLLM 准备好面对 360° 了吗](/study/papers/omnidirectional-mllm-2025/) | ✅ v3 | 机器学习 | 视频理解 |
| `omnistvg-2025` | [OmniSTVG — 按句子把视频里所有相关物体都框出来](/study/papers/omnistvg-2025/) | ✅ v3 | 机器学习 | 视频理解 |
| `opencl-2010` | [OpenCL 2010 — 一份代码同时跑 CPU/GPU/DSP/FPGA 的开放标准](/study/papers/opencl-2010/) | ✅ v3 | 图形学 | GPU 架构 |
| `openflow-2008` | [OpenFlow 2008 — 把交换机的『分拣规则』搬到一台中央电脑上](/study/papers/openflow-2008/) | ✅ v3 | 网络协议 | 网络协议 |
| `openhands` | [OpenHands — 开源 AI 软件工程师](/study/papers/openhands/) | ✅ v3 | 机器学习 | 智能体与 LLM |
| `opensearch` | [OpenSearch — AWS 主导的 Apache 2.0 搜索引擎分叉](/study/papers/opensearch/) | ✅ v3 | 基础设施 | 基础设施 |
| `optuna` | [Optuna — 让超参搜索像写普通 Python 代码一样自然](/study/papers/optuna/) | ✅ v3 | 机器学习 | 机器学习 / 超参优化 |
| `orca-2022` | [Orca — Transformer 生成模型的分布式推理调度](/study/papers/orca-2022/) | ✅ v3 | 图形学 | GPU 架构 |
| `orca-continuous-batching` | [Orca — 让一批 LLM 请求随到随走，不再排队等最长那个](/study/papers/orca-continuous-batching/) | ✅ v3 | 机器学习 | 模型与训练 |
| `ot-1989` | [OT — 多人同时改一份文档，操作随上下文自动改坐标](/study/papers/ot-1989/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `owens-2007-gpgpu-survey` | [Owens 2007 GPGPU 综述 — CUDA 之前 GPU 通用计算的黑魔法时代](/study/papers/owens-2007-gpgpu-survey/) | ✅ v3 | 图形学 | 渲染与图形 |
| `p4-2014` | [P4 — 让交换机的转发逻辑像写代码一样改](/study/papers/p4-2014/) | ✅ v3 | 网络协议 | 网络协议 |
| `padmanabhan-1995-http-latency` | [Padmanabhan-Mogul 1995 — 把 HTTP 三种提速方案放一起跑，看谁真的快](/study/papers/padmanabhan-1995-http-latency/) | ✅ v3 | 网络协议 | 网络协议 |
| `pagerank-1998` | [PageRank — 用随机游走给整个网络的页面打分](/study/papers/pagerank-1998/) | ✅ v3 | 信息检索 | 检索与排序 |
| `pair-programming` | [Pair Programming — 两个人共用一台机器写代码](/study/papers/pair-programming/) | ✅ v3 | 其他 | 软件工程 |
| `panel` | [Panel — 把 notebook 一键变交互式 web app](/study/papers/panel/) | ✅ v3 | 数据可视化 | 数据可视化 |
| `park-2019-deepsdf` | [DeepSDF — 用一个 MLP 把整类 3D 形状的距离场背下来](/study/papers/park-2019-deepsdf/) | ✅ v3 | 图形学 | 渲染与图形 |
| `parti-2022` | [Parti — 把文生图当作翻译，用自回归 Transformer 一像素接一像素地写](/study/papers/parti-2022/) | ✅ v3 | 机器学习 | 模型与训练 |
| `partial-evaluation-jones` | [Jones-Gomard-Sestoft 1993 — Partial Evaluation 与自动程序生成](/study/papers/partial-evaluation-jones/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `pascal-architecture-2016` | [NVIDIA Pascal P100 — HBM2 + NVLink + FP16 让 Tesla 真正变成 AI 卡](/study/papers/pascal-architecture-2016/) | ✅ v3 | 图形学 | GPU 架构 |
| `pastry-2001` | [Pastry — 用 nodeId 的前缀一位一位逼近目标](/study/papers/pastry-2001/) | ✅ v3 | 网络协议 | 网络协议 |
| `paxos` | [Paxos — 分布式共识算法](/study/papers/paxos/) | ✅ v3 | 分布式系统 | 分布式系统 |
| `paxos-1998` | [Paxos 1998 — 古希腊议会寓言里藏的共识协议](/study/papers/paxos-1998/) | 🗄 存量 | 数据库 | 存储与查询 |
| `paxos-simple-2001` | [Paxos Made Simple — Lamport 用平直英语把共识协议推导一遍](/study/papers/paxos-simple-2001/) | ✅ v3 | 数据库 | 存储与查询 |
| `pbft-1999` | [PBFT — 让拜占庭容错从理论变成能跑的工程](/study/papers/pbft-1999/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `peg-packrat-ford` | [PEG / Packrat — 用'有序选择'+'记忆化'写线性时间解析器](/study/papers/peg-packrat-ford/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `percolator-2010` | [Percolator 2010 — 给 Bigtable 加分布式事务的客户端库](/study/papers/percolator-2010/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `performer-2020` | [Performer — 用随机特征把 softmax attention 拉成线性复杂度](/study/papers/performer-2020/) | ✅ v3 | 机器学习 | 模型与训练 |
| `perlin-1985-noise` | [Perlin Noise — 让计算机生成的图像不再有"机器味"](/study/papers/perlin-1985-noise/) | ✅ v3 | 图形学 | 渲染与图形 |
| `persistent-memory-2014` | [PMFS — 第一个为字节寻址持久内存设计的文件系统](/study/papers/persistent-memory-2014/) | ✅ v3 | 图形学 | GPU 架构 |
| `personalized-pagerank-2003` | [Personalized PageRank — 给每个人一份属于自己的网页排名](/study/papers/personalized-pagerank-2003/) | ✅ v3 | 信息检索 | 检索与排序 |
| `peyton-jones-stg` | [Peyton Jones STG — 让 Haskell 的 lazy 在普通 CPU 上跑得快](/study/papers/peyton-jones-stg/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `phong-1975` | [Phong 1975 — 把光照拆成环境+漫反射+高光三项](/study/papers/phong-1975/) | ✅ v3 | 图形学 | 渲染与图形 |
| `pipedream-2019` | [PipeDream — 1F1B 调度让流水线工位别空等](/study/papers/pipedream-2019/) | ✅ v3 | 图形学 | GPU 架构 |
| `pivot-tracing-2015` | [Pivot Tracing — 让运维事后想测什么就测什么](/study/papers/pivot-tracing-2015/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `plan9-1995` | [Plan 9 — 把"一切皆文件"真的做到极致的下一代 UNIX](/study/papers/plan9-1995/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `plenoxels-2022` | [Plenoxels — 不要神经网络也能渲染辐射场](/study/papers/plenoxels-2022/) | ✅ v3 | 图形学 | 渲染与图形 |
| `plotkin-sos` | [Plotkin SOS — 用规则讲清楚程序"走一步"是什么](/study/papers/plotkin-sos/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `pnueli-temporal-1977` | [Pnueli 时序逻辑 — 给"永远不死锁""请求最终被响应"找一套数学语言](/study/papers/pnueli-temporal-1977/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `pnuts-2008` | [PNUTS — 介于强一致与最终一致之间的实用一致性](/study/papers/pnuts-2008/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `polar-codes-2009` | [Polar 极化码 — 把好坏不一的信道整成"完美/全错"两组](/study/papers/polar-codes-2009/) | ✅ v3 | 机器学习 | 信息论 |
| `pottier-merr` | [Pottier LR(1) Reachability — 让 LR 解析器的错误消息覆盖完整](/study/papers/pottier-merr/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `ppo` | [PPO — Proximal Policy Optimization](/study/papers/ppo/) | ✅ v3 | 机器学习 | 强化学习 |
| `presumed-abort-1986` | [Presumed Abort/Commit — 让 2PC 少写日志少发消息的两个默认共识](/study/papers/presumed-abort-1986/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `product-quantization-2011` | [Product Quantization — 把向量切碎再压成几个字节](/study/papers/product-quantization-2011/) | ✅ v3 | 数据库 | 存储与查询 |
| `program-comprehension-fmri` | [Program Comprehension fMRI — 程序员读代码时大脑亮的是语言区不是数学区](/study/papers/program-comprehension-fmri/) | ✅ v3 | 其他 | 软件工程认知科学 |
| `programmer-interruption` | [Programmer Interruption — IDE 数据告诉你被打断后多久才能继续敲代码](/study/papers/programmer-interruption/) | ✅ v3 | 其他 | 软件工程 |
| `prolog-colmerauer` | [Prolog 的诞生 — 让逻辑式子直接当程序跑](/study/papers/prolog-colmerauer/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `prototypical-networks-2017` | [Prototypical Networks — 每类算个均值，比距离就够了](/study/papers/prototypical-networks-2017/) | ✅ v3 | 机器学习 | 模型与训练 |
| `proverif-2001` | [ProVerif — 把密码协议翻成 Prolog 规则让计算机自己证安全](/study/papers/proverif-2001/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `ps-li-2014` | [Parameter Server — 多机训练前 AllReduce 时代的工业标准](/study/papers/ps-li-2014/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `push-pull-frp` | [Push-Pull FRP — Functional Reactive Programming 实用化](/study/papers/push-pull-frp/) | ✅ v3 | 编程语言 | 编程语言 |
| `pypy-tracing-jit` | [PyPy meta-tracing JIT — 给解释器加一次 JIT，所有用它的语言一起加速](/study/papers/pypy-tracing-jit/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `quantum-supremacy-2019` | [Quantum Supremacy 2019 — 量子机用 200 秒做完超算 1 万年的事](/study/papers/quantum-supremacy-2019/) | ✅ v3 | 图形学 | GPU 架构 |
| `quic` | [QUIC — 把可靠传输从内核搬到用户空间](/study/papers/quic/) | ✅ v3 | 网络协议 | 计算机网络 |
| `quincy-2009` | [Quincy — 把"派活给机器"变成一道最小费用流题](/study/papers/quincy-2009/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `qvhighlights-2021` | [QVHighlights — 用自然语言查询在视频里找精彩瞬间](/study/papers/qvhighlights-2021/) | ✅ v3 | 机器学习 | 视频理解 |
| `qwen2-5-vl-2025` | [Qwen2.5-VL — 绝对时间编码 + 动态分辨率，小时级视频原生理解](/study/papers/qwen2-5-vl-2025/) | ✅ v3 | 机器学习 | 视频理解 |
| `qwen2-vl-2024` | [Qwen2-VL — 动态分辨率 + M-RoPE，工业级视频理解的里程碑](/study/papers/qwen2-vl-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `r-bgp-2007` | [R-BGP 2007 — 故障切换前先把备份路径塞进邻居口袋](/study/papers/r-bgp-2007/) | ✅ v3 | 网络协议 | 网络协议 |
| `raft` | [Raft — 易理解的共识算法](/study/papers/raft/) | 🗄 存量 | 分布式系统 | 分布式系统 |
| `rag-lewis-2020` | [RAG (Lewis 2020) — 检索增强生成奠基](/study/papers/rag-lewis-2020/) | ✅ v3 | 机器学习 | AI / NLP |
| `ranknet-2005` | [RankNet — 让搜索引擎学会比较两个结果谁更好](/study/papers/ranknet-2005/) | ✅ v3 | 信息检索 | 检索与排序 |
| `rcu-2001` | [RCU 2001 — 让"读"的代价归零的并发数据结构](/study/papers/rcu-2001/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `react` | [ReAct — Reasoning and Acting](/study/papers/react/) | ✅ v3 | 机器学习 | 智能体与 LLM |
| `react-server-components` | [React Server Components — 让组件自己决定在哪台机器跑](/study/papers/react-server-components/) | ✅ v3 | 后端 API | 前端框架 |
| `realm` | [REALM — 把检索器和 BERT 一起预训练的第一篇论文](/study/papers/realm/) | ✅ v3 | NLP | 自然语言处理 |
| `red-1993` | [RED — 让路由器在队列还没塞满时就提前丢包](/study/papers/red-1993/) | ✅ v3 | 网络协议 | 网络协议 |
| `reed-solomon-1960` | [Reed-Solomon 编码](/study/papers/reed-solomon-1960/) | ✅ v3 | 机器学习 | 信息论 |
| `refinement-types-1991` | [Refinement Types for ML — 让程序员告诉编译器"哪些子集才合法"](/study/papers/refinement-types-1991/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `reflexion` | [Reflexion — 让 LLM 自我反思](/study/papers/reflexion/) | ✅ v3 | 机器学习 | 智能体与 LLM |
| `reformer-2020` | [Reformer — 用哈希分桶把 attention 从 O(L²) 压到 O(L log L)](/study/papers/reformer-2020/) | ✅ v3 | 机器学习 | 模型与训练 |
| `regev-lwe-2005` | [On Lattices, Learning with Errors, Random Linear Codes, and Cryptography](/study/papers/regev-lwe-2005/) | ✅ v3 | 安全与隐私 | 安全与隐私 |
| `replug-2023` | [REPLUG — 不动 LLM 一根毛，只把检索器调到它的"口味"上](/study/papers/replug-2023/) | ✅ v3 | 机器学习 | 模型与训练 |
| `reps-ifds` | [Reps-Horwitz-Sagiv IFDS — 把跨过程分析变成图上找路](/study/papers/reps-ifds/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `resnet` | [ResNet — 残差连接](/study/papers/resnet/) | ✅ v3 | 机器学习 | 计算机视觉 / 深度学习 |
| `rest-fielding-2000` | [REST — Fielding 2000 给 Web API 写下的设计宪法](/study/papers/rest-fielding-2000/) | ✅ v3 | 后端 API | 后端 |
| `retro` | [RETRO — DeepMind 的检索增强 LLM](/study/papers/retro/) | ✅ v3 | 机器学习 | AI / NLP |
| `reynolds-definitional-interpreters` | [Reynolds Definitional Interpreters — 用一种语言去定义另一种语言](/study/papers/reynolds-definitional-interpreters/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `reynolds-separation-logic` | [Separation Logic — 把 Hoare 逻辑扩到带指针的程序](/study/papers/reynolds-separation-logic/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `rfc-3833-dns-threats` | [RFC 3833 — IETF 第一次正式承认 DNS 不安全](/study/papers/rfc-3833-dns-threats/) | ✅ v3 | 网络协议 | 网络协议 |
| `ring-allreduce-2017` | [Ring All-Reduce — 把 HPC 的环形规约搬进深度学习](/study/papers/ring-allreduce-2017/) | ✅ v3 | 图形学 | GPU 架构 |
| `risc-i-1981` | [RISC I — 砍掉 90% 指令反而让 CPU 跑得更快](/study/papers/risc-i-1981/) | ✅ v3 | 图形学 | GPU 架构 |
| `rlhf-christiano` | [RLHF Christiano 2017 — 人类偏好做奖励](/study/papers/rlhf-christiano/) | ✅ v3 | 机器学习 | 强化学习 / AI 安全 |
| `rm3-2001` | [RM3 — 让搜索引擎自己看一眼结果再重搜一次](/study/papers/rm3-2001/) | ✅ v3 | 信息检索 | 检索与排序 |
| `roberta-2019` | [RoBERTa — 把 BERT 重训一遍就能拿 SOTA](/study/papers/roberta-2019/) | ✅ v3 | 机器学习 | 模型与训练 |
| `rocketqa-2021` | [RocketQA — 把稠密检索的训练拧到工业级](/study/papers/rocketqa-2021/) | ✅ v3 | 信息检索 | 检索与排序 |
| `rocksdb-2017` | [RocksDB 2017 — 把 LSM-Tree 的"空间放大"压到极低的工业经验](/study/papers/rocksdb-2017/) | ✅ v3 | 数据库 | 存储与查询 |
| `rocksdb-lsm` | [LSM-tree 与 RocksDB — 把所有写都变成顺序写](/study/papers/rocksdb-lsm/) | ✅ v3 | 数据库 | 数据库 |
| `ron-2001` | [RON 2001 — 让一小撮节点自己绕开 BGP 故障](/study/papers/ron-2001/) | ✅ v3 | 网络协议 | 网络协议 |
| `row-polymorphism-remy` | [Row Polymorphism — 让记录类型可扩展又不丢类型安全](/study/papers/row-polymorphism-remy/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `rrf-cormack-2009` | [RRF — 把多个搜索结果列表合并成一个的最简单办法](/study/papers/rrf-cormack-2009/) | ✅ v3 | 信息检索 | 数据检索 |
| `rsa` | [RSA 公钥密码](/study/papers/rsa/) | ✅ v3 | 安全与隐私 | 密码学 |
| `rtp-rfc-1889` | [RTP RFC 1889 — 让 UDP 也能跑实时音视频](/study/papers/rtp-rfc-1889/) | ✅ v3 | 网络协议 | 网络协议 |
| `rwkv-2023` | [RWKV — 让 RNN 拿到 Transformer 那张训练并行的入场券](/study/papers/rwkv-2023/) | ✅ v3 | 机器学习 | 模型与训练 |
| `sac-2018` | [Soft Actor-Critic — 让强化学习既会拿分又愿意多试](/study/papers/sac-2018/) | ✅ v3 | 机器学习 | 模型与训练 |
| `saga-1987` | [Sagas — 长事务拆成一串能"反向走回去"的小事务](/study/papers/saga-1987/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `sagiv-shape-analysis` | [Sagiv 参数化形状分析 — 用三值逻辑证明链表树仍是链表树](/study/papers/sagiv-shape-analysis/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `saito-takahashi-1990-gbuffer` | [Saito-Takahashi 1990 — 第一次提出 G-buffer 的论文](/study/papers/saito-takahashi-1990-gbuffer/) | ✅ v3 | 图形学 | 渲染与图形 |
| `salsa-adapton` | [Salsa / Adapton — 让程序只重算"真的变了"的那一小块](/study/papers/salsa-adapton/) | ✅ v3 | 编程语言 | 编程语言 |
| `salsify-2018` | [Salsify: Low-Latency Network Video Through Tighter Integration Between a Video Codec and a Transport Protocol](/study/papers/salsify-2018/) | ✅ v3 | 网络协议 | 网络协议 |
| `salton-vsm-1975` | [Salton VSM 1975 — 把文档变成向量再用余弦比相似度](/study/papers/salton-vsm-1975/) | ✅ v3 | 信息检索 | 检索与排序 |
| `saltzer-1984-e2e` | [End-to-End Arguments — 把功能尽量推到端上做](/study/papers/saltzer-1984-e2e/) | ✅ v3 | 网络协议 | 网络协议 |
| `saltzer-schroeder-1975` | [Saltzer-Schroeder 1975 — 8 条至今教科书还在引的安全设计原则](/study/papers/saltzer-schroeder-1975/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `sam` | [SAM — Segment Anything](/study/papers/sam/) | ✅ v3 | 机器学习 | 计算机视觉 |
| `sarathi-serve` | [Sarathi-Serve — 让长 prompt 不再卡住所有人的流式回复](/study/papers/sarathi-serve/) | ✅ v3 | 机器学习 | 大模型服务 |
| `sasrec-2018` | [SASRec — 用 Transformer 的 self-attention 替 RNN 做下一步推荐](/study/papers/sasrec-2018/) | ✅ v3 | 信息检索 | 检索与排序 |
| `scala-macros` | [Scala Macros — 让 Scala 在编译期把方法调用替换成任意代码](/study/papers/scala-macros/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `scaling-laws` | [Scaling Laws — 神经语言模型的缩放规律](/study/papers/scaling-laws/) | ✅ v3 | NLP | NLP |
| `scann-2020` | [ScaNN — 让向量量化只精修「客户会看到的那一面」](/study/papers/scann-2020/) | ✅ v3 | 信息检索 | 检索与排序 |
| `scoop` | [Scoop — Windows 上像 Homebrew 一样装命令行工具](/study/papers/scoop/) | ✅ v3 | 基础设施 | 工具与基础设施 |
| `scott-strachey-denotational` | [Scott-Strachey 指称语义 — 给程序找一个独立于实现的数学含义](/study/papers/scott-strachey-denotational/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `sctp-multipath-2006` | [CMT-SCTP 2006 — 让两条网络路径同时干活而不打架](/study/papers/sctp-multipath-2006/) | ✅ v3 | 网络协议 | 网络协议 |
| `sel4-2009` | [seL4 — 第一个被数学证明"代码和规范完全一致"的操作系统内核](/study/papers/sel4-2009/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `self-adjusting` | [Self-Adjusting Computation — 输入小幅变化时只重算受影响的那部分](/study/papers/self-adjusting/) | ✅ v3 | 编程语言 | 编程语言 |
| `self-consistency-2022` | [Self-Consistency — 让模型把同一道题做 40 遍再投票](/study/papers/self-consistency-2022/) | ✅ v3 | 机器学习 | 模型与训练 |
| `self-customization` | [SELF Customization — 给每种"调用者类型"现场打一份方法](/study/papers/self-customization/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `self-evolving-agents-survey` | [自进化 AI agent 综述 — 给"会自己升级"的 agent 画一张统一地图](/study/papers/self-evolving-agents-survey/) | ✅ v3 | Agent | 智能体与 LLM |
| `self-evolving-recsys-2602` | [Self-Evolving RecSys — 让 LLM agent 自己跑超参实验上线](/study/papers/self-evolving-recsys-2602/) | 🗄 存量 | Agent | 智能体与 LLM |
| `self-evolving-software-agents` | [BDI-LLM Self-Evolving Agents — 让 agent 自己改自己源代码](/study/papers/self-evolving-software-agents/) | 🗄 存量 | Agent | 智能体与 LLM |
| `self-pic` | [Self / PIC — 内联缓存的诞生](/study/papers/self-pic/) | ✅ v3 | 编译器 | 编译器 |
| `self-rag-2023` | [Self-RAG — 让模型自己决定何时该查资料](/study/papers/self-rag-2023/) | ✅ v3 | 机器学习 | 模型与训练 |
| `self-refine-2023` | [Self-Refine — 让同一个模型自己改自己写的东西](/study/papers/self-refine-2023/) | ✅ v3 | 机器学习 | 模型与训练 |
| `selinger-1979` | [Selinger 1979 — 基于代价的查询优化](/study/papers/selinger-1979/) | ✅ v3 | 数据库 | 存储与查询 |
| `selinux-2001` | [SELinux 2001 — 给每扇门都装上门卫，而不是给管理员一把万能钥匙](/study/papers/selinux-2001/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `seq2seq-2014` | [Seq2Seq — 把翻译变成端到端神经网络](/study/papers/seq2seq-2014/) | ✅ v3 | 机器学习 | 模型与训练 |
| `sequel-1974` | [SEQUEL 1974 — 让数据库"听懂"近似英语的查询](/study/papers/sequel-1974/) | ✅ v3 | 数据库 | 存储与查询 |
| `sequential-consistency-1979` | [Sequential Consistency 1979 — 多处理器内存模型的第一个正确性标准](/study/papers/sequential-consistency-1979/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `server-sent-events` | [Server-Sent Events — 服务器单向推送的标准协议](/study/papers/server-sent-events/) | ✅ v3 | 后端 API | 前端 |
| `sglang-2024` | [SGLang — 把 LLM 程序当成共享前缀的树来跑](/study/papers/sglang-2024/) | ✅ v3 | 图形学 | GPU 架构 |
| `sgx-2013` | [Innovative Instructions and Software Model for Isolated Execution](/study/papers/sgx-2013/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `shannon-1948` | [Shannon 1948 — 信息论的诞生](/study/papers/shannon-1948/) | ✅ v3 | 机器学习 | 信息论 |
| `sharegpt4video-2024` | [ShareGPT4Video — 用 GPT-4V 级密集字幕，喂饱视频理解与生成](/study/papers/sharegpt4video-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `shellcheck` | [ShellCheck — 帮你抓 Bash 脚本里那些"半夜才发作"的坑](/study/papers/shellcheck/) | ✅ v3 | 基础设施 | infrastructure |
| `shenango-2019` | [Shenango — 每 5 微秒重新分一次核的中央调度器](/study/papers/shenango-2019/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `siglip-2023` | [SigLIP — 用 Sigmoid 损失训练图文对齐](/study/papers/siglip-2023/) | ✅ v3 | 机器学习 | 多模态 LLM |
| `sillito-questions` | [Sillito 44 问题 — 程序员改代码时到底在问什么](/study/papers/sillito-questions/) | ✅ v3 | 其他 | 软件工程 |
| `silt-2011` | [SILT — 0.7 字节内存索引一条记录的 flash 键值存储](/study/papers/silt-2011/) | ✅ v3 | 数据库 | 存储与查询 |
| `simhash-charikar-2002` | [SimHash — 用随机超平面把余弦相似度变成汉明距离](/study/papers/simhash-charikar-2002/) | ✅ v3 | 信息检索 | 检索与排序 |
| `simrank-2002` | [SimRank — 两个节点相似当且仅当它们的邻居相似](/study/papers/simrank-2002/) | ✅ v3 | 信息检索 | 检索与排序 |
| `simula-67` | [SIMULA 67 — 面向对象的诞生](/study/papers/simula-67/) | 🗄 存量 | 编程语言 | 编程语言 |
| `sinfonia-2007` | [Sinfonia 2007 — 把分布式协议降级成数据结构操作](/study/papers/sinfonia-2007/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `skcc-skill-compiler` | [SkCC — 给 LLM agent 写一个真正的 skill 编译器](/study/papers/skcc-skill-compiler/) | ✅ v3 | Agent | 智能体与 LLM |
| `skeen-3pc-1981` | [Skeen 1981 三阶段提交 — 给 2PC 的阻塞缺陷打补丁](/study/papers/skeen-3pc-1981/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `skill-as-pseudocode` | [Skill-as-Pseudocode — 把 agent 笔记本写成可校验的伪代码](/study/papers/skill-as-pseudocode/) | ✅ v3 | Agent | 智能体与 LLM |
| `skill-pro-nonparametric-ppo` | [Skill-Pro — 不动权重学可复用 skill 的非参数 PPO](/study/papers/skill-pro-nonparametric-ppo/) | ✅ v3 | Agent | 智能体与 LLM |
| `skill-sd-self-distillation` | [Skill-SD — 用 agent 自己抽出的 skill 当 dynamic teacher 自蒸馏](/study/papers/skill-sd-self-distillation/) | ✅ v3 | Agent | 智能体与 LLM |
| `skip-list-1990` | [Skip List — 用抛硬币代替平衡树](/study/papers/skip-list-1990/) | ✅ v3 | 数据库 | 存储与查询 |
| `skip-locked-postgres-9.5` | [SKIP LOCKED — 让 Postgres 当任务队列用](/study/papers/skip-locked-postgres-95/) | ✅ v3 | 后端 API | 后端 |
| `slab-1994` | [Slab Allocator 1994 — 内核按对象类型开缓存，不是按字节切](/study/papers/slab-1994/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `slam-microsoft` | [SLAM — 让 Windows 驱动 bug 自己撞到工具上](/study/papers/slam-microsoft/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `sleeper-agents` | [Sleeper Agents — 故意藏后门的 LLM](/study/papers/sleeper-agents/) | ✅ v3 | 机器学习 | AI 安全 |
| `slim-2011` | [SLIM — 让数据自己学一张稀疏的"看了又看"权重表](/study/papers/slim-2011/) | ✅ v3 | 信息检索 | 检索与排序 |
| `smalltalk-80` | [Smalltalk-80](/study/papers/smalltalk-80/) | ✅ v3 | 编程语言 | 编程语言 |
| `smoothquant-2023` | [SmoothQuant 2023 — 把激活的烫手山芋扔给权重](/study/papers/smoothquant-2023/) | ✅ v3 | 图形学 | GPU 架构 |
| `smr-1990` | [SMR 1990 — 把"容错服务"还原成"多副本一起跑同一台状态机"](/study/papers/smr-1990/) | ✅ v3 | 数据库 | 存储与查询 |
| `snowflake-2016` | [Snowflake 2016 — 把数仓拆成 storage / compute / services 三层](/study/papers/snowflake-2016/) | ✅ v3 | 数据库 | 存储与查询 |
| `soft-updates-1999` | [Soft Updates — 不写 journal 也能保证文件系统元数据一致](/study/papers/soft-updates-1999/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `soltesz-2007` | [Soltesz 2007 — 容器：比虚拟机轻一档的隔离方案](/study/papers/soltesz-2007/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `sophia-2023` | [Sophia — 让二阶优化器第一次在 LLM 预训练里跑得动](/study/papers/sophia-2023/) | ✅ v3 | 机器学习 | 模型与训练 |
| `sorkine-2004-laplacian-editing` | [Sorkine 2004 — 用拉普拉斯坐标编辑网格，拽把手不丢细节](/study/papers/sorkine-2004-laplacian-editing/) | ✅ v3 | 图形学 | 渲染与图形 |
| `souffle-datalog` | [Soufflé — 把 Datalog 编译成 C++ 让程序分析跑得动](/study/papers/souffle-datalog/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `spacevllm-2025` | [SpaceVLLM — 一个 MLLM 同时做时序定位、图像指代与时空管定位](/study/papers/spacevllm-2025/) | ✅ v3 | 机器学习 | 视频理解 |
| `spann-2021` | [SPANN — 内存放中心、SSD 放向量的十亿级近邻检索](/study/papers/spann-2021/) | ✅ v3 | 信息检索 | 检索与排序 |
| `spanner` | [Spanner — 全球分布式 SQL 数据库](/study/papers/spanner/) | ✅ v3 | 分布式系统 | 分布式系统 / 数据库 |
| `spanner-2012` | [Spanner 2012 — 用原子钟和 GPS 给全球数据库发时间戳](/study/papers/spanner-2012/) | ✅ v3 | 数据库 | 存储与查询 |
| `sparrow-2013` | [Sparrow — 让毫秒级任务也能被精准调度的去中心化调度器](/study/papers/sparrow-2013/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `sparse-autoencoders` | [Sparse Autoencoders — 把 superposition 解出来](/study/papers/sparse-autoencoders/) | 🗄 存量 | 机器学习 | AI 可解释性 |
| `sparsegpt-2023` | [SparseGPT — 175B 大模型一次过剪 50%，不重训](/study/papers/sparsegpt-2023/) | ✅ v3 | 图形学 | GPU 架构 |
| `specinfer-2023` | [SpecInfer — 让大模型一次"猜一棵树"再并行验证](/study/papers/specinfer-2023/) | ✅ v3 | 图形学 | GPU 架构 |
| `splade-2021` | [SPLADE — 让神经网络学出稀疏向量，直接复用倒排索引](/study/papers/splade-2021/) | ✅ v3 | 信息检索 | 检索与排序 |
| `sprite-1988` | [Sprite 1988 — 把一屋子工作站伪装成一台大主机](/study/papers/sprite-1988/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `sqlite-2022` | [SQLite — 嵌入式数据库 30 年怎么活下来的](/study/papers/sqlite-2022/) | ✅ v3 | 数据库 | 存储与查询 |
| `ssa` | [SSA — 静态单赋值形式](/study/papers/ssa/) | 🗄 存量 | 编译器 | 编译器 |
| `st-llm-2024` | [ST-LLM — 把所有时空 token 交给 LLM，让它自己学时序](/study/papers/st-llm-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `stable-diffusion` | [Stable Diffusion — 开源文生图引爆](/study/papers/stable-diffusion/) | ✅ v3 | 机器学习 | 生成模型 |
| `stainless-2017` | [Stainless — 让编译器替你证明 Scala 函数真的满足规约](/study/papers/stainless-2017/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `stam-1999-stable-fluids` | [Stable Fluids — 让流体模拟时间步随便给都不爆](/study/papers/stam-1999-stable-fluids/) | ✅ v3 | 图形学 | 渲染与图形 |
| `standard-ml` | [Standard ML — 让编译器替你把类型补完](/study/papers/standard-ml/) | ✅ v3 | 编程语言 | 编程语言 |
| `starcoder-2023` | [StarCoder — 把训练数据完整公开的 15B 代码模型](/study/papers/starcoder-2023/) | ✅ v3 | 机器学习 | 模型与训练 |
| `starrocks` | [StarRocks — Doris 分叉出来的向量化 CBO 国产 OLAP](/study/papers/starrocks/) | ✅ v3 | 基础设施 | infrastructure |
| `steensgaard-pointer` | [Steensgaard 指针分析 — 用等价合并把指针分析压到几乎线性](/study/papers/steensgaard-pointer/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `stm-shavit-touitou` | [STM Shavit-Touitou — 把"加锁"改成"事务"的源头](/study/papers/stm-shavit-touitou/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `stonebraker-2010-sqlnosql` | [Stonebraker 2010 SQL vs NoSQL — 慢的是老实现，不是 SQL](/study/papers/stonebraker-2010-sqlnosql/) | ✅ v3 | 数据库 | 存储与查询 |
| `streamingbench-2024` | [StreamingBench — 流式视频理解的 18 任务在线大考](/study/papers/streamingbench-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `strongtalk` | [Strongtalk — 可以装可以卸的 Smalltalk 类型系统](/study/papers/strongtalk/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `stylegan2-2020` | [StyleGAN2 — 把 StyleGAN 的水滴瑕疵和潜空间纠葛一起修掉](/study/papers/stylegan2-2020/) | ✅ v3 | 机器学习 | 模型与训练 |
| `subramanian-2002-internet-hierarchy` | [Subramanian 2002 — 用多个观察点把互联网切成 5 层](/study/papers/subramanian-2002-internet-hierarchy/) | ✅ v3 | 网络协议 | 网络协议 |
| `sulsky-1994-mpm` | [MPM — 让粒子背着自己的历史，借网格算一遍力](/study/papers/sulsky-1994-mpm/) | ✅ v3 | 图形学 | 渲染与图形 |
| `swe-agent` | [SWE-Agent — Princeton SWE-bench 解法](/study/papers/swe-agent/) | 🗄 存量 | 机器学习 | 智能体与 LLM |
| `swe-bench` | [SWE-bench — 真实 GitHub Issue 评测](/study/papers/swe-bench/) | ✅ v3 | 机器学习 | AI / 软件工程 |
| `sycl-cpp-2020` | [SYCL 2020 — 用一份标准 C++ 让 GPU/CPU/加速器一起跑](/study/papers/sycl-cpp-2020/) | ✅ v3 | 图形学 | GPU 架构 |
| `sycophancy-2023` | [Sycophancy 2023 — RLHF 模型为什么爱顺着用户说](/study/papers/sycophancy-2023/) | ✅ v3 | 机器学习 | 模型与训练 |
| `system-f-reynolds-1974` | [System F — 让类型也能像参数一样被传递](/study/papers/system-f-reynolds-1974/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `system-r-1976` | [System R 1976 — 第一个跑起来的关系数据库](/study/papers/system-r-1976/) | ✅ v3 | 数据库 | 存储与查询 |
| `t0-2021` | [T0 — 让 50 个人各写各的提示词，模型反而更会听新指令](/study/papers/t0-2021/) | ✅ v3 | 机器学习 | 模型与训练 |
| `t5` | [T5 — Text-to-Text Transfer Transformer](/study/papers/t5/) | ✅ v3 | NLP | NLP |
| `ta-stvg-2025` | [TA-STVG — 解耦「找谁 / 何时 / 何地」的时空视频定位](/study/papers/ta-stvg-2025/) | ✅ v3 | 机器学习 | 视频理解 |
| `tabpfn-2023` | [TabPFN — 一秒解决小表格分类的 Transformer](/study/papers/tabpfn-2023/) | ✅ v3 | 机器学习 | 模型与训练 |
| `tachyon-2014` | [Tachyon — 把集群存储推到内存速度，丢了再算回来](/study/papers/tachyon-2014/) | ✅ v3 | 数据库 | 存储与查询 |
| `tamarin-2012` | [Tamarin — 让计算机自己证 Signal、TLS 1.3 这种带 DH 的协议是不是真安全](/study/papers/tamarin-2012/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `tao-2013` | [TAO — Facebook 给十亿人好友列表造的专用图数据库](/study/papers/tao-2013/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `taso-2019` | [TASO — 让机器自己发现深度学习图重写规则](/study/papers/taso-2019/) | ✅ v3 | 图形学 | GPU 架构 |
| `taubin-1995-mesh-smoothing` | [Taubin 1995 — 把网格平滑当成低通滤波](/study/papers/taubin-1995-mesh-smoothing/) | ✅ v3 | 图形学 | 渲染与图形 |
| `tcp` | [TCP — 在不可靠的 IP 上凿出一条 reliable 字节流](/study/papers/tcp/) | ✅ v3 | 网络协议 | 网络 |
| `tcp-vegas-1995` | [TCP Vegas 1995 — 不等丢包，靠 RTT 早一步看见拥塞](/study/papers/tcp-vegas-1995/) | ✅ v3 | 网络协议 | 网络协议 |
| `td3-2018` | [TD3 — 给 DDPG 装两副刹车，连续控制终于稳了](/study/papers/td3-2018/) | ✅ v3 | 机器学习 | 模型与训练 |
| `tempcompass-2024` | [TempCompass — 专门拆穿 Video LLM 有没有真懂时间](/study/papers/tempcompass-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `template-haskell` | [Template Haskell — 让 Haskell 在编译期把代码当数据玩](/study/papers/template-haskell/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `tendermint-2016` | [Tendermint — 把拜占庭共识塞进开放区块链的工程模板](/study/papers/tendermint-2016/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `tensorflow-osdi-2016` | [TensorFlow — 把神经网络拆成数据流图再跑到任何机器上](/study/papers/tensorflow-osdi-2016/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `tensorrt-llm-2023` | [TensorRT-LLM — NVIDIA 把 FT 升级成可调度的官方推理栈](/study/papers/tensorrt-llm-2023/) | ✅ v3 | 图形学 | GPU 架构 |
| `tesla-architecture-2008` | [NVIDIA Tesla — 把显卡改造成通用并行计算机](/study/papers/tesla-architecture-2008/) | ✅ v3 | 图形学 | GPU 架构 |
| `the-os-1968` | [THE 1968 — Dijkstra 用分层 + 信号量造出第一个可证明的 OS](/study/papers/the-os-1968/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `theorems-for-free` | [Theorems for Free — 类型签名直接给定理](/study/papers/theorems-for-free/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `thrust-2010` | [Thrust — 让 GPU 编程像写 STL 一样一行调用](/study/papers/thrust-2010/) | ✅ v3 | 图形学 | GPU 架构 |
| `tidb-2020` | [TiDB 2020 — 给 Raft 加一个"旁听生"，让一份数据同时跑事务和分析](/study/papers/tidb-2020/) | ✅ v3 | 数据库 | 存储与查询 |
| `tigerbeetle` | [TigerBeetle — 只能记账但把记账做到极致的金融数据库](/study/papers/tigerbeetle/) | ✅ v3 | 数据库 | 数据库 |
| `timechat-2024` | [TimeChat — 带时间戳的多轮视频助手，长视频也能精确定位](/study/papers/timechat-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `timelinejs` | [TimelineJS — 一张 Google Sheet 直接变成交互时间轴](/study/papers/timelinejs/) | ✅ v3 | 基础设施 | 基础设施 |
| `timemarker-2024` | [TimeMarker — 时间分隔符 + 任意长度采帧的视频定位大模型](/study/papers/timemarker-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `tla-yu-tlc-1999` | [TLC — 让 TLA+ 规范可以一键机检的模型检查器](/study/papers/tla-yu-tlc-1999/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `tls-1.3` | [TLS 1.3 — 把 HTTPS 握手砍到一个来回](/study/papers/tls-13/) | ✅ v3 | 网络协议 | 网络协议 |
| `tofte-talpin-regions` | [Tofte-Talpin Regions — 让类型系统替你管内存生命周期](/study/papers/tofte-talpin-regions/) | ✅ v3 | 编程语言 | 编程语言 |
| `token-bucket-stripe` | [Stripe Rate Limiters — 工业级令牌桶长什么样](/study/papers/token-bucket-stripe/) | ✅ v3 | 后端 API | 后端工程 |
| `tomasulo-1967` | [Tomasulo 算法 — 让 CPU 自己决定指令的执行顺序](/study/papers/tomasulo-1967/) | ✅ v3 | 图形学 | GPU 架构 |
| `tomita-glr` | [Tomita GLR — 让 LR 解析器扛得住歧义文法](/study/papers/tomita-glr/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `toolformer` | [Toolformer — 教 LLM 自主调用 API](/study/papers/toolformer/) | 🗄 存量 | 机器学习 | 智能体与 LLM |
| `tor-2004` | [Tor 洋葱路由 — 让你的网络请求穿上三层马甲](/study/papers/tor-2004/) | ✅ v3 | 网络协议 | 网络协议 |
| `toy-models-superposition` | [Toy Models of Superposition](/study/papers/toy-models-superposition/) | ✅ v3 | 机器学习 | AI 可解释性 |
| `trace-2024` | [TRACE — 用因果事件链同时输出时间、精彩度与描述](/study/papers/trace-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `tracemonkey` | [TraceMonkey — 只编"真的走过的那一条路"](/study/papers/tracemonkey/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `transformer-xl-2019` | [Transformer-XL — 让 Transformer 像 RNN 那样把上下文滚动传下去](/study/papers/transformer-xl-2019/) | ✅ v3 | 机器学习 | 模型与训练 |
| `traveler-2024` | [TraveLER — 四段式多 Agent，帧级问答看懂长视频](/study/papers/traveler-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `tree-of-thoughts-2023` | [Tree of Thoughts — 让 LLM 像下棋一样多想几步再答](/study/papers/tree-of-thoughts-2023/) | ✅ v3 | 机器学习 | 模型与训练 |
| `trees-that-grow` | [Trees that Grow — 可扩展的语法树设计](/study/papers/trees-that-grow/) | ✅ v3 | 编程语言 | 编程语言 |
| `trill-2014` | [Trill — 一个引擎同时跑流、批、交互三种分析](/study/papers/trill-2014/) | ✅ v3 | 数据库 | 存储与查询 |
| `triton-2019` | [Triton 2019 — 让 Python 写出贴近 cuBLAS 的 GPU kernel](/study/papers/triton-2019/) | ✅ v3 | 图形学 | GPU 架构 |
| `triton-llm` | [Triton — 让 Python 程序员也能写出贴近 cuBLAS 的 GPU kernel](/study/papers/triton-llm/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `trustrank-2004` | [TrustRank — 用一小撮可信种子把整张 Web 的信誉算出来](/study/papers/trustrank-2004/) | ✅ v3 | 信息检索 | 检索与排序 |
| `turchin-supercompilation` | [Turchin Supercompilation — 让编译器把程序模拟一遍再写回去](/study/papers/turchin-supercompilation/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `turing-1936` | [Turing 1936 可计算性](/study/papers/turing-1936/) | ✅ v3 | 编程语言 | 计算理论 |
| `turing-architecture-2018` | [NVIDIA Turing — RT Core 把光追装进消费卡，Tensor Core 第二代下放 INT8](/study/papers/turing-architecture-2018/) | ✅ v3 | 图形学 | GPU 架构 |
| `tvm` | [TVM — 让一份模型能在所有硬件上跑得快](/study/papers/tvm/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `tvm-2018` | [TVM OSDI 2018 — 把 Halide 思想搬到深度学习](/study/papers/tvm-2018/) | ✅ v3 | 图形学 | GPU 架构 |
| `twine-2020` | [Twine — Facebook 把整个数据中心当一台机器调度](/study/papers/twine-2020/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `unified-memory-2014` | [CUDA Unified Memory — 让 CPU 和 GPU 共享一张内存地图](/study/papers/unified-memory-2014/) | ✅ v3 | 图形学 | GPU 架构 |
| `univtg-2023` | [UniVTG — 把视频时刻定位、高光检测、摘要合成一套框架](/study/papers/univtg-2023/) | ✅ v3 | 机器学习 | 视频理解 |
| `unix-1974` | [UNIX 1974 — 用极小内核做出能用的分时系统](/study/papers/unix-1974/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `uvtg-mllm-2025` | [UniTime — 生成式 MLLM 做通用视频时序定位](/study/papers/uvtg-mllm-2025/) | ✅ v3 | 机器学习 | 视频理解 |
| `v-system-1988` | [V 分布式系统 — 把局域网当成一台机器，内核只剩进程加 IPC](/study/papers/v-system-1988/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `vall-e-2023` | [VALL-E — 3 秒样本零样本语音克隆](/study/papers/vall-e-2023/) | ✅ v3 | 机器学习 | 模型与训练 |
| `vamp-verisoft-2006` | [VAMP — 把一颗有流水线、乱序、浮点和 cache 的处理器从门电路证到指令集](/study/papers/vamp-verisoft-2006/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `vcc-2009` | [VCC — 给并发 C 加注解，让 SMT 自动证它对](/study/papers/vcc-2009/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `veach-1995-mis` | [Veach MIS — 用一行加权公式让多种采样策略各取所长](/study/papers/veach-1995-mis/) | ✅ v3 | 图形学 | 渲染与图形 |
| `veach-1997-mlt` | [Veach MLT — 用 Metropolis 在路径空间游走，专攻 BDPT 也算不动的难场景](/study/papers/veach-1997-mlt/) | ✅ v3 | 图形学 | 渲染与图形 |
| `vega-lite` | [Vega-Lite — 用 JSON 三段式画复合图](/study/papers/vega-lite/) | ✅ v3 | 数据可视化 | 数据可视化 |
| `vellvm` | [Vellvm — 在 Coq 里给 LLVM IR 写一份机器证明的语义](/study/papers/vellvm/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `verdi-2015` | [Verdi — 在 Coq 里完整证明 Raft 协议的分布式系统验证框架](/study/papers/verdi-2015/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `verisoft-2008` | [Verisoft — 把整台计算机从晶体管到邮件客户端全部用数学证完](/study/papers/verisoft-2008/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `vertica-2012` | [Vertica 2012 — C-Store 论文走向产品的七年改造账](/study/papers/vertica-2012/) | ✅ v3 | 数据库 | 存储与查询 |
| `vid-llm-survey-2023` | [Vid-LLM Survey — 用大语言模型理解视频的全景地图](/study/papers/vid-llm-survey-2023/) | ✅ v3 | 机器学习 | 视频理解 |
| `video-chatgpt-2023` | [Video-ChatGPT — 让大语言模型看懂视频并聊起来](/study/papers/video-chatgpt-2023/) | ✅ v3 | 机器学习 | 视频理解 |
| `video-llama-2023` | [Video-LLaMA — 把音频和视频同时塞进大语言模型](/study/papers/video-llama-2023/) | ✅ v3 | 机器学习 | 视频理解 |
| `video-llava-2024` | [Video-LLaVA — 投影之前先对齐，图像和视频共用一个 LLM](/study/papers/video-llava-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `videoagent-longform-2024` | [VideoAgent (Wang) — LLM Agent 迭代选帧理解长视频](/study/papers/videoagent-longform-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `videoagent-memory-2024` | [VideoAgent（Fan）— 双记忆 + 四工具，长视频逼近 Gemini](/study/papers/videoagent-memory-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `videochat-2023` | [VideoChat — 把视频、指令微调、多轮对话第一次放进同一个系统](/study/papers/videochat-2023/) | ✅ v3 | 机器学习 | 视频理解 |
| `videochat-flash-2025` | [VideoChat-Flash — 分层压缩，让长视频理解又快又准](/study/papers/videochat-flash-2025/) | ✅ v3 | 机器学习 | 视频理解 |
| `videollama2-2024` | [VideoLLaMA 2 — 时空卷积连接器 + 音视频联合理解](/study/papers/videollama2-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `videollama3-2025` | [VideoLLaMA 3 — 动态分辨率视觉编码 + 视频 token 压缩](/study/papers/videollama3-2025/) | ✅ v3 | 机器学习 | 视频理解 |
| `videollm-online-2024` | [VideoLLM-online — 流式视频对话的 LIVE 框架](/study/papers/videollm-online-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `videomme-2024` | [Video-MME — 视频多模态大模型的「高考卷」](/study/papers/videomme-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `videoprism-2024` | [VideoPrism — 冻结一个模型就能搞定所有视频理解任务](/study/papers/videoprism-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `vidstg-2020` | [VidSTG — 用自然语言在长视频里框出「谁在何时何地」](/study/papers/vidstg-2020/) | ✅ v3 | 机器学习 | 视频理解 |
| `vinoground-2024` | [Vinoground — 时序反事实短视频探针](/study/papers/vinoground-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `vit` | [ViT — Vision Transformer](/study/papers/vit/) | ✅ v3 | 机器学习 | 计算机视觉 |
| `vl2-2009` | [VL2 — 让一万台服务器像在同一台交换机上](/study/papers/vl2-2009/) | ✅ v3 | 网络协议 | 网络协议 |
| `vllm` | [vLLM — 把操作系统的分页搬进 GPU KV cache](/study/papers/vllm/) | ✅ v3 | 机器学习 | 数据科学与 AI |
| `vogels-eventual-2009` | [Eventually Consistent 2009 — 给互联网规模存储一套'放弃强一致'的官方词汇](/study/papers/vogels-eventual-2009/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `volcano` | [Volcano — 把'算子可组合'与'并行可分离'拼成执行器范式](/study/papers/volcano/) | ✅ v3 | 数据库 | 数据库 |
| `volcano-1994` | [Volcano 1994 — 把 SQL 执行写成 next() 拉式数据流](/study/papers/volcano-1994/) | ✅ v3 | 数据库 | 存储与查询 |
| `volta-architecture-2017` | [NVIDIA Volta V100 — 第一代 Tensor Core 把 AI 训练算力一夜抬 6 倍](/study/papers/volta-architecture-2017/) | ✅ v3 | 图形学 | GPU 架构 |
| `voyager` | [Voyager — LLM 终身学习智能体](/study/papers/voyager/) | ✅ v3 | 机器学习 | 智能体与 LLM |
| `vr-1988` | [VR 1988 — 用"主备 + 换届"做共识的另一脉](/study/papers/vr-1988/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `vr-revisited-2012` | [VR Revisited 2012 — VR 协议的"工程化重写版"](/study/papers/vr-revisited-2012/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `vsi-bench-2024` | [VSI-Bench — 用室内漫游视频考视频大模型的空间智商](/study/papers/vsi-bench-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `vslnet-2020` | [VSLNet — 用 span-based QA 做自然语言视频定位](/study/papers/vslnet-2020/) | ✅ v3 | 机器学习 | 视频理解 |
| `vst-2014` | [VST — 把 C 程序的数学证明一路带到机器码](/study/papers/vst-2014/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `vtg-llm-2024` | [VTG-LLM — 绝对时间 token + VTG-IT-120K，让 Video LLM 精确定位时刻](/study/papers/vtg-llm-2024/) | ✅ v3 | 机器学习 | 视频理解 |
| `vtimellm-2023` | [VTimeLLM — 让 Video LLM 学会标出事件起止时间](/study/papers/vtimellm-2023/) | ✅ v3 | 机器学习 | 视频理解 |
| `wadler-prettier` | [Wadler Prettier — 函数式优雅打印器](/study/papers/wadler-prettier/) | ✅ v3 | 编程语言 | 编程语言 |
| `wald-2007-sah-bvh` | [Wald 2007 — 把 SAH BVH 构建从分钟级砍到秒级的 binned 近似法](/study/papers/wald-2007-sah-bvh/) | ✅ v3 | 图形学 | 渲染与图形 |
| `wam-warren` | [WAM — 让 Prolog 跑得像编译型语言的抽象机器](/study/papers/wam-warren/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `wandb` | [Weights & Biases — 几行 init 把指标系统代码自动入库](/study/papers/wandb/) | ✅ v3 | 基础设施 | 基础设施 |
| `wang-2014-spdy` | [How Speedy is SPDY — 换协议没让网页变快多少](/study/papers/wang-2014-spdy/) | ✅ v3 | 网络协议 | 网络协议 |
| `ward-1992` | [Ward 1992 — 第一个能落地的各向异性反射模型](/study/papers/ward-1992/) | ✅ v3 | 图形学 | 渲染与图形 |
| `websocket-rfc-6455` | [WebSocket RFC 6455 — 让浏览器和服务器开一条不挂断的双向电话](/study/papers/websocket-rfc-6455/) | ✅ v3 | 网络协议 | 网络协议 |
| `webxskill` | [WebXSkill — 给 Web agent 的可执行 skill 是参数化代码 + URL 图索引](/study/papers/webxskill/) | ✅ v3 | Agent | 智能体与 LLM |
| `whisper-2022` | [Whisper — 68 万小时弱监督训出的语音识别](/study/papers/whisper-2022/) | ✅ v3 | 机器学习 | 模型与训练 |
| `whitted-1980` | [Whitted 1980 — 让光线在场景里递归跑三种次级射线](/study/papers/whitted-1980/) | ✅ v3 | 图形学 | 渲染与图形 |
| `why3-2013` | [Why3 — 写一次程序规范，多个证明器一起来证](/study/papers/why3-2013/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `wide-deep-2016` | [Wide & Deep — 让模型同时学会"记住"和"举一反三"](/study/papers/wide-deep-2016/) | ✅ v3 | 信息检索 | 检索与排序 |
| `williams-1983-mipmap` | [Williams 1983 mipmap — 提前烤好金字塔，纹理过滤变 O(1)](/study/papers/williams-1983-mipmap/) | ✅ v3 | 图形学 | 渲染与图形 |
| `wireguard-2017` | [WireGuard: Next Generation Kernel Network Tunnel](/study/papers/wireguard-2017/) | ✅ v3 | 网络协议 | 网络协议 |
| `word2vec` | [Word2Vec — 词向量奠基](/study/papers/word2vec/) | ✅ v3 | NLP | NLP |
| `world-model-robot-learning-2026` | [机器人世界模型综述 — 预测未来再动手](/study/papers/world-model-robot-learning-2026/) | ✅ v3 | 机器学习 | 机器人与 VLA |
| `worldsense-2025` | [WorldSense — 真实世界同步音视频理解 benchmark](/study/papers/worldsense-2025/) | ✅ v3 | 机器学习 | 视频理解 |
| `xen-2003` | [Xen 2003 — 让操作系统配合虚拟化，性能直接接近原生](/study/papers/xen-2003/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `xla-compiler` | [XLA — 给 TensorFlow / JAX 装一台真正的张量编译器](/study/papers/xla-compiler/) | ✅ v3 | 编程语言 | 类型与 PL 理论 |
| `xlnet-2019` | [XLNet — 把句子打乱顺序读，借此同时拿到 AR 和双向](/study/papers/xlnet-2019/) | ✅ v3 | 机器学习 | 模型与训练 |
| `xtrace-2007` | [X-Trace — 比 Dapper 早 3 年的跨层跨协议追踪框架](/study/papers/xtrace-2007/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `youtube-two-tower-2019` | [YouTube 双塔召回 — 把 DSSM 搬进推荐并补上两件工业关键](/study/papers/youtube-two-tower-2019/) | ✅ v3 | 信息检索 | 检索与排序 |
| `z3-2008` | [Z3 2008 — 把 SMT 工程化到工业默认](/study/papers/z3-2008/) | ✅ v3 | 形式化方法 | 形式化验证 |
| `zab-2011` | [Zab — ZooKeeper 怎么把客户端写入按顺序复制到所有副本](/study/papers/zab-2011/) | ✅ v3 | 数据库 | 存储与查询 |
| `zero-2020` | [ZeRO 2020 — 把训练状态切成 N 份让万亿参数成为可能](/study/papers/zero-2020/) | ✅ v3 | 分布式系统 | 共识与复制 |
| `zfs-2003` | [ZFS — 把磁盘当成水池，每滴水都贴标签](/study/papers/zfs-2003/) | ✅ v3 | 操作系统 | 内核与虚拟化 |
| `zgc` | [ZGC — 让 GC 停顿与堆大小解耦的低延迟回收器](/study/papers/zgc/) | ✅ v3 | 编程语言 | 编程语言 |
| `zk-snark` | [zk-SNARK 零知识证明](/study/papers/zk-snark/) | ✅ v3 | 安全与隐私 | 密码学 |
| `zombie-agents-2602` | [Zombie Agents — 自进化 agent 的长期记忆能被持久化"借尸还魂"](/study/papers/zombie-agents-2602/) | ✅ v3 | Agent | 智能体与 LLM |
