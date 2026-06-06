---
title: Hoare Logic — 把"程序对不对"变成"数学证明对不对"
来源: 'C.A.R. Hoare, "An Axiomatic Basis for Computer Programming", CACM 1969'
日期: 2026-05-30
子分类: 编程语言 / 形式化方法
分类: 编程语言
难度: 中级
schema_version: legacy-long
provenance: legacy-migrated
---

## 是什么

Hoare logic 是一套**用数学公式描述程序行为**的方法。核心是一个三元组：

```
{P} S {Q}
```

读作"在前置条件 P 成立时执行程序 S，**如果它停下来**，结果就满足后置条件 Q"。

日常类比：**一份炒蛋菜谱**。

- P = 食材清单（"两个鸡蛋 + 一勺油 + 一撮盐"）
- S = 操作步骤（"打散 → 倒油 → 中火翻炒 30 秒"）
- Q = 成品描述（"得到一份金黄色炒蛋"）

菜谱的承诺是：**只要你食材对、按步骤做、并且确实做完了，就一定得到炒蛋**。"会不会做一半锅烧穿"——那是终止性，三元组不管。

Hoare 1969 给这门"菜谱学"配上 6 条公理，让你可以把"这段代码会做什么"写成像数学等式一样可推导的命题。

## 为什么重要

不理解 Hoare logic，下面这些事说不清：

- 为什么 Rust 不让你写出空指针 / 数据竞争——它的所有权检查就是"穷人版程序证明"
- 为什么 AWS / Airbus / 核电站软件愿意花数年用 Dafny / Frama-C 证一段几千行的代码
- 为什么 TLA+ 能在系统设计阶段就找出 DynamoDB / S3 的并发 bug
- 为什么单元测试再多也不算"证明正确"——它只示例了几条路径，没盖住所有输入

## 核心要点

Hoare 把"程序证明"拆成三个层次的抽象：

1. **三元组语法**：`{P} S {Q}` 是命题，不是代码注释。`P`、`Q` 用一阶逻辑写（如 `x > 0 ∧ y = x + 1`），可被机器检查。类比：把"炒蛋成不成"变成"两个等式之间的对错"。

2. **6 条规则**：每种语法（赋值 / 顺序 / if / while / 强化弱化 / 复合）配一条推理规则。最反直觉的是赋值——`{Q[E/x]} x:=E {Q}`，前置条件是"把后置里所有 x 替换成 E"，从后往前推，不是从前往后。

3. **循环不变式 I**：循环规则的核心。`I` 是一条"进循环前成立、每轮迭代仍成立、退出后还成立"的断言。找 I 不是套规则的事，是设计能力——它本质上是"程序员对这个循环到底在干什么"的精确描述。

## 实践案例

### 案例 1：用赋值公理反推前置条件

题目：要让 `x := x + 1` 执行后 `x > 0` 成立，前置条件应该是什么？

```
{?} x := x + 1 {x > 0}
```

**用 Hoare 赋值公理推**：把 Q 里所有 x 替换成 E（这里 E = `x + 1`）：

- Q = `x > 0`
- Q[x+1/x] = `(x+1) > 0` = `x > -1` = `x ≥ 0`

所以最弱前置条件是 `x ≥ 0`。直觉上"赋值后变大、前置应该更小"是错的——记住公式：**新 x 的角色就是旧 E**，所以"关于新 x 的 Q"等价于"关于旧 E 的 Q"。

### 案例 2：阶乘程序的循环不变式

```
{n ≥ 0}
  fact := 1; i := 1;
  while i ≤ n do
    fact := fact * i;
    i := i + 1
{fact = n!}
```

**找 I**：进入第 k 次迭代时（k=1,2,…），i = k，fact 应已累乘到 (k-1)!。所以：

```
I: fact = (i-1)! ∧ 1 ≤ i ≤ n+1
```

**三步验证**：

- 初始：`fact=1=0!=(1-1)!`、`1 ≤ i=1 ≤ n+1`（用 n≥0），成立
- 保持：执行 `fact := fact*i; i := i+1` 后 `fact_new = i!`，`i_new = i+1`，`fact_new = (i_new-1)!` 仍成立
- 退出：`i > n` 加 `i ≤ n+1` 推出 `i = n+1`，所以 `fact = (i-1)! = n!`

写程序写半小时，写不变式可能要写一小时——这就是程序证明的真实成本。

### 案例 3：Dafny 把不变式直接写成代码注解

```dafny
method Sum(a: array<int>) returns (s: int)
  ensures s == SumOf(a[..])
{
  s := 0;
  var i := 0;
  while i < a.Length
    invariant 0 <= i <= a.Length
    invariant s == SumOf(a[..i])
  {
    s := s + a[i];
    i := i + 1;
  }
}
```

`invariant` 行就是 Hoare 的 I。Dafny 把整段代码 + 注解扔给 Z3（SMT 求解器），机器自动验证规则成立——你不用手写证明树，但要写得出不变式。

## 踩过的坑

1. **赋值公理方向反直觉**——是 `{Q[E/x]} x:=E {Q}`，把后置里 x 替换成 E，不是反过来。新人十有八九第一次写错，得用案例 1 反复纠正。
2. **部分正确不证终止**——一个永远不停的 `while true do x := x` 也能被部分正确逻辑"证"为对，因为承诺只在"if terminates"前提下生效。完全正确要额外加终止度量（loop variant）。
3. **找不变式是真正瓶颈**——太强证不动保持，太弱推不出目标。这是程序证明半个世纪没自动化的核心难题，主流方案仍是启发式 + 模板拼凑。
4. **共享指针让原版爆炸**——两个变量可能指同一块内存（别名），前置条件要枚举所有别名情况，复杂度指数级。这要等 Separation Logic（2002）的 `P * Q` 才解。

## 适用 vs 不适用场景

**适用**：

- 安全关键软件：航空（Airbus A380 用 Frama-C）、核电（EDF）、操作系统内核（seL4 用 Coq+Isabelle）
- 系统设计阶段建模：分布式协议（AWS 用 TLA+ 验 DynamoDB / S3 一致性）
- 编译器后端正确性：CompCert 用 Coq 证 C 编译器各阶段语义保持
- 理解类型系统、契约式设计、Rust 借用检查的思想源头

**不适用**：

- 普通业务后端 / 前端：bug 修复成本远低于证明成本，单元测试 + 类型 + code review 已能解决 80% 的问题
- 频繁变更的代码：写不变式比写代码慢 5-10 倍，跟不上需求
- 含高阶函数 / 复杂闭包：当前主流工具吃力，常需手写大量提示
- 全自动化预期：不变式 inference 50 年没本质突破，仍需人写

## 历史小故事（可跳过）

- **1965-1968**：硬件指数增长但软件项目频频失败，1968 NATO 会议正式提出"软件危机"一词。学术界开始问：**程序能不能像数学定理那样被严格证明？**
- **1967**：Floyd 在论文 *Assigning Meanings to Programs* 里提出在流程图节点上贴断言——是 Hoare logic 的直接前身。
- **1969**：Hoare 把 Floyd 的思路公理化，写成与具体语言无关的 6 条规则，发表在 CACM。论文不到 8 页，影响半个世纪。
- **1975**：Dijkstra 在 *Guarded Commands* 里把"从后置反推前置"系统化为最弱前置条件 wp，成为程序证明的另一只脚。
- **1978**：Cook 证明 Hoare logic 相对完备性——只要算术理论存在，所有真三元组都可证。
- **1980**：Hoare 因此论文等贡献获图灵奖；2002 年 O'Hearn & Reynolds 发表 Separation Logic 解决指针别名爆炸问题。

## 学到什么

- **三元组思维 ≠ 写证明**：先训练自己每写一个函数都明确想"前置 / 后置 / 不变式"是什么，哪怕只写在注释里——这就拿到了 80% 的价值
- **找不变式是设计能力**——看一个循环只看代码看不出 I，要先想清楚"这个循环每轮维护的承诺是什么"
- **形式化方法的现代实战形态是窄化 + 自动化**：Rust 不让普通工程师写谓词，但用类型系统把内存安全这个具体属性证给你看；这条路比"通用证明任意属性"实际得多
- **学术地基 vs 工业落地是两回事**：Hoare logic 是地基，但 99% 的开发者一辈子用不到原版——不要被图灵奖光环误导以为这是日常技能

## 延伸阅读

- 教程：[Software Foundations Vol. 2](https://softwarefoundations.cis.upenn.edu/plf-current/index.html) —— Pierce 团队的开源 Coq 教程，从 IMP 语言到 Hoare logic 完整推导
- 论文 8 页 PDF：[Hoare 1969 — An Axiomatic Basis](https://www.cs.cmu.edu/~crary/819-f09/Hoare69.pdf)（密度极高，看不懂正常）
- 工具上手：[Dafny 入门教程](https://dafny.org/dafny/OnlineTutorial/guide) —— 微软的 Dafny 是 Hoare 三元组最易学的工业实现
- 讲座视频：[Leslie Lamport — TLA+ for Engineers](https://www.youtube.com/watch?v=p54W-XOIEF8) —— Hoare 思想在分布式领域的延伸
- [[reynolds-separation-logic]] —— 解决指针别名爆炸的关键扩展

## 关联

- [[reynolds-separation-logic]] —— 把 Hoare 三元组扩展到共享可变状态，`P * Q` 让指针程序证明从指数变多项式
- [[dijkstra-goto]] —— 同期同精神：结构化编程让程序结构能被证明
- [[cousot-abstract-interpretation]] —— 用近似断言代替精确断言，是 Hoare logic 自动化的另一条路
- [[mycroft-strictness]] —— 在惰性语言里对"严格性"做形式分析，Hoare 思路在编译优化的应用
- [[reps-ifds]] —— 程序间数据流分析，把过程间属性推导自动化
- [[partial-evaluation-jones]] —— 把"程序变换保持语义"用形式化方式说清楚
- [[hindley-milner]] —— 类型推导也是"用规则推程序属性"，是 Hoare 思路在类型层的化身

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[acl2-2000]] —— ACL2 — 用纯 Lisp 当数学对象，机器证明工业级硬件正确
- [[astree]] —— ASTRÉE 分析器 — 让飞机控制代码的静态分析做到零警告
- [[biere-bmc-1999]] —— Bounded Model Checking — 把硬件验证翻译成一道 SAT 题
- [[boogie-2005]] —— Boogie — 写一次验证后端，多种证明语言复用
- [[cakeml]] —— CakeML — 从源码到机器码每一步都被数学证明的 ML 编译器
- [[certikos-2016]] —— CertiKOS — 把整个并发内核拆成 30 多层每层都被 Coq 证过
- [[chapar-2016]] —— Chapar — 第一个被机器证明的因果一致 KV 存储
- [[cimatti-nusmv-2002]] —— NuSMV 2 — 把 BDD 和 SAT 两种验证引擎装进同一个开源工具
- [[clarke-cegar-2003]] —— CEGAR — 用反例自动改进抽象，让大软件能被验证
- [[clarke-emerson-1981]] —— Clarke-Emerson 1981 — 让机器自己检查并发程序对不对
- [[compcert]] —— CompCert — 每条优化都被数学证明保持语义的 C 编译器
- [[costan-sgx-explained-2016]] —— Intel SGX 详解 — 在不可信云里圈一块硬件保险箱
- [[cousot-abstract-interpretation]] —— Cousot 抽象解释 — 给静态分析一套统一数学框架
- [[csp-hoare-1978]] —— CSP — 进程之间只许喊话不许共用内存
- [[dafny-2010]] —— Dafny — 把"代码该满足的条件"直接写进语法，编译器自动证明
- [[davis-putnam-1960]] —— Davis-Putnam 1960 — 让机器自动判断一堆逻辑式能不能同时成立
- [[dijkstra-goto]] —— Dijkstra 1968 — Go To Statement Considered Harmful
- [[dpll-1962]] —— DPLL 1962 — 把"逻辑判定"从内存爆炸救成栈式回溯
- [[easycrypt-2011]] —— EasyCrypt — 让密码学家的安全证明能被机器自动检查
- [[eswaran-1976]] —— Eswaran 1976 — 串行化与谓词锁的源头
- [[frama-c-2012]] —— Frama-C — 一个开源平台把 C 程序的多种验证方法拼到一起
- [[fstar]] —— F* — 把依赖类型、SMT 自动化、副作用追踪揉到一门语言里
- [[graf-saidi-1997]] —— Graf-Saïdi — 用谓词把无限状态压成有限抽象
- [[hacl-star-2017]] —— HACL* — 用数学证明过的 C 加密代码，跑在你 Firefox 和 Linux 内核里
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[holzmann-spin-1997]] —— SPIN — 让计算机帮你穷举并发程序的所有可能执行
- [[hyperkernel-2017]] —— Hyperkernel — 让 SMT 求解器一键验证操作系统内核
- [[infer-biabduction]] —— Bi-Abduction — 让静态分析自动猜出函数缺什么前提
- [[iris-2015]] —— Iris 2015 — 把并发推理拆成 monoid + invariant 两块积木
- [[isabelle-hol-2002]] —— Isabelle/HOL — 让程序证明像写数学论文一样可读
- [[kahn-natural-semantics]] —— Kahn 自然语义 — 用一棵推理树说清楚程序求值
- [[kim-rowhammer-2014]] —— RowHammer — 只读内存也能把邻居的 bit 敲 flip
- [[lamport-tla-1994]] —— TLA — 把状态机和时序逻辑捏成一个公式
- [[lampson-hints]] —— Lampson Hints — 把做系统的隐式品味写成 27 条经验法则
- [[lean-tactics]] —— Lean Tactics — 让证明助手把"写证明"当成写程序
- [[lipp-meltdown-2018]] —— Meltdown — 乱序执行偷读内核内存
- [[liquid-types]] —— Liquid Types — 让编译器自己推导出"哪些值才合法"
- [[marques-silva-grasp-1996]] —— GRASP 1996 — 让 SAT 求解器从冲突里学到东西
- [[mcmillan-smv-1993]] —— McMillan SMV 1993 — 把状态空间从 10^6 推到 10^20 的符号模型检测
- [[milner-pi-calculus]] —— π-演算 — 让通道名本身能在通道里流动
- [[mitls-2014-triple-handshake]] —— Triple Handshake — TLS 同一把主密钥被复用，黑客就能换人不换锁
- [[monitors-1974]] —— Hoare Monitors 1974 — 把锁藏进对象里，让并发代码读起来像普通函数
- [[mycroft-strictness]] —— Mycroft 严格性分析 — 编译器替你判定哪些参数能"先算"
- [[nelson-oppen-1979]] —— Nelson-Oppen 1979 — 让多个判定程序坐下来交换"我刚发现 a=b"
- [[netkat-2014]] —— NetKAT 2014 — 把网络转发写成可以做数学等式变换的代数式
- [[nieuwenhuis-dpll-t-2006]] —— Nieuwenhuis-Oliveras-Tinelli 2006 — 给 SMT 求解器写一套数学规则书
- [[no-silver-bullet]] —— No Silver Bullet — 软件难度的二分手术刀
- [[partial-evaluation-jones]] —— Jones-Gomard-Sestoft 1993 — Partial Evaluation 与自动程序生成
- [[pnueli-temporal-1977]] —— Pnueli 时序逻辑 — 给"永远不死锁""请求最终被响应"找一套数学语言
- [[prolog-colmerauer]] —— Prolog 的诞生 — 让逻辑式子直接当程序跑
- [[proverif-2001]] —— ProVerif — 把密码协议翻成 Prolog 规则让计算机自己证安全
- [[reps-ifds]] —— Reps-Horwitz-Sagiv IFDS — 把跨过程分析变成图上找路
- [[reynolds-separation-logic]] —— Separation Logic — 把 Hoare 逻辑扩到带指针的程序
- [[scott-strachey-denotational]] —— Scott-Strachey 指称语义 — 给程序找一个独立于实现的数学含义
- [[sel4-2009]] —— seL4 — 第一个被数学证明"代码和规范完全一致"的操作系统内核
- [[stainless-2017]] —— Stainless — 让编译器替你证明 Scala 函数真的满足规约
- [[tamarin-2012]] —— Tamarin — 让计算机自己证 Signal、TLS 1.3 这种带 DH 的协议是不是真安全
- [[the-os-1968]] —— THE 1968 — Dijkstra 用分层 + 信号量造出第一个可证明的 OS
- [[tla-yu-tlc-1999]] —— TLC — 让 TLA+ 规范可以一键机检的模型检查器
- [[vamp-verisoft-2006]] —— VAMP — 把一颗有流水线、乱序、浮点和 cache 的处理器从门电路证到指令集
- [[vcc-2009]] —— VCC — 给并发 C 加注解，让 SMT 自动证它对
- [[vellvm]] —— Vellvm — 在 Coq 里给 LLVM IR 写一份机器证明的语义
- [[verisoft-2008]] —— Verisoft — 把整台计算机从晶体管到邮件客户端全部用数学证完
- [[vst-2014]] —— VST — 把 C 程序的数学证明一路带到机器码
- [[why3-2013]] —— Why3 — 写一次程序规范，多个证明器一起来证
- [[z3-2008]] —— Z3 2008 — 把 SMT 工程化到工业默认

