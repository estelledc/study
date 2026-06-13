---
title: "Hindley-Milner — 编译器自己猜出所有变量的类型"
来源: 'Luis Damas & Robin Milner, "Principal Type-schemes for Functional Programs", POPL 1982'
日期: 2026-06-13
分类: 编程语言
子分类: 类型与 PL 理论
难度: 中级
provenance: pipeline-v3
---

## 是什么

Hindley-Milner（HM）是一套**让编译器自己读代码、猜出每个表达式是什么类型**的数学方法。日常类比：像一个推理小说侦探——他不会问嫌疑人"你是谁"，他从证据自己推。

你写：

```ocaml
let add = fun x -> x + 1
```

你**没标类型**。HM 编译器读完这一行，自己得出："`add` 必然是 `int -> int`（接收一个整数，返回一个整数）"。

这个"自动推类型"的能力，是 OCaml / Haskell / Rust / TypeScript 这些语言敢说"静态类型但少手写注解"的核心引擎。1982 年 Damas 和 Milner 把完整的推导算法（Algorithm W）写在了一篇仅 6 页的 POPL 论文里——此后 40 年，所有带类型推导的函数式语言都是它的徒孙。

## 为什么重要

不理解 HM，下面这些事都没法解释：

- 为什么 OCaml / Haskell 写得像 Python（不标类型）但运行时**不会突然 `undefined is not a function`**——HM 在编译期就推完了所有类型
- 为什么 TypeScript 有时能推出复杂泛型、有时又"推不动"——TS 用的是 HM 的近亲但做了工程妥协
- 为什么 Rust 报错信息有时候在第 17 行，但你最后发现根因是第 5 行——HM 推到中途才碰矛盾，矛盾点和根因点常不在同一行
- 为什么 1969 年的纯数学定理 60 年后还在影响你每天写的代码——基础理论的生命周期远超任何框架

## 核心要点

HM 推类型的过程可以拆成**三步**：

1. **贴占位符**：读到不知道类型的东西，先贴一张"占位卡片"——叫做类型变量（type variable），记作 `α`、`β`。类比：拼图里看到一个孔，不知道哪块填进去，先放一张白卡占位。代码里遇到 `fun x -> ...`，x 的类型就是 `α`。

2. **收集证据 + 解方程**：从代码用法里收集线索。比如读到 `x + 1`，已知 `+` 接收两个 `int` 返回一个 `int`，所以 `x` 和 `1` 必须是 `int`。这一步在算法里叫**统一**（unification，Robinson 1965 年发明）。类比：你在纸上列出一堆"A 必须等于 B"的等式，然后逐个消元——`α = int`、`β = string`——直到所有类型变量都被确定。

    统一有一个关键保护叫 **occurs check**：如果推到 `α = α -> β`（一个类型包含它自己），直接拒绝。没有这个检查的话，可以把永不终止的 `(λx. x x)(λx. x x)` 错误地标上类型。

3. **泛化（让函数对多种类型通用）**：`let id = fun x -> x` 对任何类型都成立。HM 不会让它"凝固"成 `int -> int`，而是保留 `∀α. α -> α`（"对任意类型 α，接收 α 返回 α"）。下次有人用 `id 3` 就把 `α` 代成 `int`，有人用 `id "hello"` 就把 `α` 代成 `string`。这一步叫 **let-polymorphism**——只有 `let` 绑定的变量才能多态，`fun` 的参数不能。这个不对称设计是为了保证推导算法一定终止（全 System F 的类型推导是不可判定的）。

三步加起来叫 **算法 W**（Algorithm W）。它有两个数学保证：**soundness**（推导出的类型不会在运行时出错）和 **completeness**（如果存在类型注解能让程序通过检查，算法 W 一定能找到——而且是"最一般"的那个）。

## 实践案例

### 案例 1：编译器在你看不见的地方推什么

OCaml 里你写：

```ocaml
let pair = fun a b -> (a, b)
```

编译器推出 `pair` 的类型是：

```
val pair : 'a -> 'b -> 'a * 'b
```

**逐部分解释**：

- `'a` 和 `'b` 是类型变量，意思是"任意类型 a"、"任意类型 b"
- `'a -> 'b -> 'a * 'b` 读作"接收一个 a，再接收一个 b，返回一个 (a, b) 二元组"
- 这种"保留任意 a 和 b"就是**多态**——一份代码服务所有类型。pair 3 "hello" 返回 `(3, "hello")`，pair true 1.5 返回 `(true, 1.5)`
- HM 不把 a 和 b 固化成具体类型，因为 pair 的代码**没用任何特定类型的操作**（没做加法、没取长度），所以没理由限制它

### 案例 2：HM 怎么从证据一步一步推出具体类型

```ocaml
let inc = fun x -> x + 1
```

编译器推理过程：

1. 看到 `fun x -> ...` → 给 x 一个占位 `α`
2. 看到 `x + 1` → 已知 `+` 的类型是 `int -> int -> int`
3. 统一：`α` 必须等于 `int`（因为 `+` 的第一个参数要求 int），`1` 已经是 `int`
4. 表达式返回值类型：`+` 的返回类型是 `int`，所以 `inc` 整体是 `int -> int`
5. 结果：`val inc : int -> int`

整个过程**没问你一个字**。这就是 HM 的力量——编译器像侦探一样从操作符的类型签名反推变量的类型。

### 案例 3：TypeScript 里你能感受到的 HM 影子

```ts
const map = <T, U>(arr: T[], fn: (x: T) => U): U[] => arr.map(fn)
const result = map([1, 2, 3], (n) => n * 2)
//      ^? const result: number[]
```

TypeScript 自动推出 `T = number`、`U = number`、`result: number[]`。这里和 HM 的共通点是：

- `T` 和 `U` 一开始是"占位符"（HM 叫类型变量，TS 叫泛型参数）
- 调用 `map([1, 2, 3], ...)` 时收集到证据：`arr` 是 `number[]`，所以 `T = number`
- `(n) => n * 2` 返回 `number`，所以 `U = number`

**TS 和完整 HM 的关键差异**：TypeScript 没有 let-polymorphism（不区分 `let` 和函数参数的多态权限），也没有泛化（generalization）步骤。它是 HM 的"工程简化版"——牺牲了一些推导能力，换来了和 JS 生态的兼容性。

## 踩过的坑

1. **HM 推不出高阶多态（rank-2/rank-N）**：`fun id -> (id 1, id "hello")` 这要求 `id` 同时被当成 `int -> int` 和 `string -> string`，但 `fun` 参数在 HM 里**不能多态**——只能有一种类型。Haskell 用 `RankNTypes` 扩展才能写。

2. **let 和 fun 的多态规则不对称**：`let x = ...` 里 x 可以多态（`∀α. α -> α`），`fun x -> ...` 里 x **不能**多态。这个不对称叫 "value restriction"，是为了保证算法可判定，但有时会阻挡你想写的代码。

3. **副作用 + 多态 = 类型安全漏洞**：早期 ML 让 `let x = ref None` 多态，可以"先存 int 再当 string 取出"，类型系统失守。现代 OCaml / SML 用 "value restriction" 修了这个洞——有副作用的表达式不允许多态泛化。

4. **错误信息读不懂**：HM 推到中途碰矛盾，会报"int 和 string 不匹配在第 17 行"，但矛盾**根因**可能在第 5 行的某个变量名写错。新人常被误导——看到第 17 行是对的，就反复改那一行，越改越错。经验：报错行往上翻，找最近的类型标注或变量使用。

## 适用 vs 不适用场景

**适用**：

- 函数式语言的类型推导（OCaml / Haskell / Standard ML / Elm / PureScript）——这是 HM 的主场
- 类型注解负担重的场景——HM 能帮你省 80% 的手写注解，只在公开 API 处标注即可
- 中等复杂度的多态泛型——`a -> a`、`a -> b -> (a, b)`、`(a -> b) -> [a] -> [b]` 这种级别 HM 轻松处理

**不适用**：

- 需要 rank-2 / rank-N 多态（把多态函数当参数传）→ 用 Haskell `RankNTypes` / Scala 隐式参数
- 需要带副作用的多态引用 → 必须有 value restriction，或者换用更现代的类型系统（Rust 的 ownership、Koka 的 algebraic effects）
- 需要类型类 / trait / 接口（type class） → HM 原生没有，需扩展（Haskell type class / Rust trait / Scala implicit）
- 完全动态语言（Python / JS 不加类型注解）→ HM 不适用，它是**静态**类型推导，运行时信息用不到

## 历史小故事（可跳过）

- **1969 年**：数学家 Roger Hindley 在组合子逻辑里证明每个项存在"最一般类型"（principal type）。纯数学，没有实现，没有人能跑。

- **1978 年**：Robin Milner 在爱丁堡大学造 LCF 定理证明器，需要一种语言写它的元程序（meta-program）。他发明了 ML（Meta Language），顺手写了 Algorithm W——能实际运行的推导算法——但没给出完备性证明。

- **1982 年**：Milner 的博士生 Luis Damas 把两样东西拼到一起——Hindley 1969 的数学框架 + Milner 1978 的工程算法 + 完备性证明。写成 6 页 POPL 论文。Damas 的贡献常被低估——是他把"能跑"和"能证明"合为一体。

- 此后 40 年：Haskell（1990）、OCaml（1996）、F#（2005）、Elm（2012）、PureScript（2013）、Rust 的部分推导（2015）——全部站在这 6 页纸的肩膀上。

## 学到什么

1. **类型可以推出来，不必硬标**——这是程序设计语言过去 60 年最重要的洞见之一。省掉的不只是敲键盘的功夫，更重要的是让代码更简洁、重构更安全——改一处实现，类型推导会自动把影响传播出去，不匹配的地方编译器会替你找到。

2. **占位符 + 收集证据 + 泛化**是推导的三板斧，背后是 Robinson 的"最一般合一"（most general unifier）。理解了这三步，再看任何语言的类型推导都能快速抓住要点。

3. **多态 vs 可判定是一对永恒的矛盾**：能表达的多态越强，类型系统越难自动推导。HM 选了"够用 + 一定能推出来"的中间点——System F 更强大但类型推导不可判定，Monomorphic 一定能推但表达能力太弱。

4. **理论 -> 算法 -> 工程**，每一步隔大约 10 年。1969（数学证明） -> 1978（可运行算法） -> 1982（理论完备） -> 1990s（Haskell/OCaml 工业落地）。好理论不急着落地，但一旦落地就影响深远。

## 延伸阅读

- 论文原文（仅 6 页）：[Damas & Milner, "Principal Type-schemes for Functional Programs", POPL 1982](https://web.cs.wpi.edu/~cs4536/c12/milner-damas_principal_types.pdf)
- 视频教程：[Bartosz Milewski — Hindley-Milner Type Inference](https://www.youtube.com/watch?v=0mCsluv5FXA)（1 小时，有动画，把推导过程一步步演了一遍）
- 自己实现：[Stephen Diehl — Write You a Haskell](https://smunix.github.io/dev.stephendiehl.com/fun/index.html)（用 Haskell 从零写一个迷你 HM 推导器，边写边学）
- [[lambda-calculus]] —— HM 推导的对象就是 λ-演算项，先理解 λ-演算再看 HM 会轻松很多
- [[standard-ml]] —— 第一个用 HM 的工业语言，ML 的"类型推导体验"至今仍是标杆

## 关联

- [[lambda-calculus]] —— 提供"项"的语法，HM 给"项"贴类型，两者加起来才是一门完整的类型化 λ-演算
- [[standard-ml]] —— ML 是 HM 的第一个工业宿主，Standard ML 的定义里类型推导就是标配
- [[mccarthy-lisp]] —— 最早的函数式语言但没类型系统；HM 把"函数式编程 + 静态类型"绑到了一起
- [[bidirectional-typing]] —— HM 的"纯推导"在一些场景太激进，双向类型检查在"推导"和"检查"之间加入了平衡
- [[milner-pi-calculus]] —— Milner 的另一杰作，π-演算和 HM 分别代表了他对"类型"和"并发"两大方向的贡献
- [[theorems-for-free]] —— Wadler 1989：从 HM 推出来的多态类型签名可以"免费"得到语义定理——类型越泛，能做的事越少，越容易推理
- [[gradual-typing]] —— 把 HM 的"全有或全无"类型推导变成"可以渐进标注"——TypeScript / Flow / mypy 都是这个思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[accelerate]] —— Accelerate — HuggingFace 设备/分布式抽象
- [[aes]] —— AES Rijndael 对称分组密码
- [[agda-norell]] —— Agda — 让你写代码的同时把数学也证明了
- [[akamai-2002]] —— Akamai 2002 — 把网站搬到离用户 10 毫秒的地方
- [[algol-60]] —— ALGOL 60 — BNF 与块结构
- [[alpa-2022]] —— Alpa — 把张量/流水/数据并行统一成一道搜索题
- [[art-2013]] —— ART 自适应基数树 — 内存数据库为主索引重新选材
- [[ast-grep]] —— ast-grep — 按语法树搜代码、改代码的命令行工具
- [[awodey-warren-2009]] —— Awodey-Warren — 把『相等的证明』看成两点之间的路径
- [[bidirectional-typing]] —— 双向类型检查 — 推断和检查两个方向交替前进
- [[biome]] —— Biome — JS/TS 工具链一体化（Rust 写的 linter+formatter）
- [[boogie-2005]] —— Boogie — 写一次验证后端，多种证明语言复用
- [[brill-moore-2000]] —— Brill-Moore 2000 — 把拼写纠错的编辑操作从单字符扩成任意子串
- [[cakeml]] —— CakeML — 从源码到机器码每一步都被数学证明的 ML 编译器
- [[calculus-of-constructions]] —— Calculus of Constructions — 让程序和数学证明共用一种语言
- [[call-by-need-1995]] —— Call-by-Need Lambda Calculus — 给惰性求值一套真正的演算
- [[cert-manager]] —— cert-manager — K8s 自动签发与续期 TLS 证书
- [[coeffect-petricek]] —— Coeffects — 让类型系统追踪「需要多少上下文」
- [[cognitive-load-theory]] —— Cognitive Load Theory — 学不会不是不努力，是工作记忆装不下
- [[comfyui]] —— ComfyUI — 节点式扩散模型 GUI
- [[compiler-errors]] —— Compiler Error Messages — 让编译报错有用
- [[cook-levin]] —— Cook-Levin 定理 — NP-完全性的诞生
- [[coqui-tts]] —— Coqui TTS — 多语种 TTS 工具包
- [[cousot-abstract-interpretation]] —— Cousot 抽象解释 — 给静态分析一套统一数学框架
- [[davis-putnam-1960]] —— Davis-Putnam 1960 — 让机器自动判断一堆逻辑式能不能同时成立
- [[dnd-kit]] —— dnd-kit — React 现代拖拽 toolkit
- [[doligez-leroy-concurrent-gc]] —— Doligez-Leroy GC — OCaml 多线程并发垃圾回收
- [[doris]] —— Apache Doris — MySQL 协议 MPP OLAP 数据库
- [[dspy]] —— DSPy — 把 prompt 写成签名，让编译器替你调
- [[effect]] —— Effect — 给 TypeScript 装上"会跟踪错误和依赖"的副作用引擎
- [[effect-handlers]] —— 代数效应（Algebraic Effects）
- [[erlang-otp]] —— Erlang OTP — 容错并发系统设计
- [[fastapi]] —— FastAPI — 用 Python 类型注解写 API
- [[fastify]] —— Fastify — 让 schema 替你写校验和序列化的 Node.js 框架
- [[fielding-rest-2000]] —— Fielding 2000 — 用约束推导法把 Web 的成功讲成了一门方法
- [[frank-effects]] —— Frank — 让 effect handler 写得就像普通函数
- [[frenetic-2011]] —— Frenetic 2011 — 把 OpenFlow 流表换成函数式程序
- [[fstar]] —— F* — 把依赖类型、SMT 自动化、副作用追踪揉到一门语言里
- [[gadt-pjones]] —— GADT — 让构造子告诉编译器"我返回的是更精确的类型"
- [[game-semantics-pcf]] —— 博弈论语义与 PCF — 把程序解释成两个人轮流下的对话棋
- [[godel-1931]] —— Gödel 1931 — 不完备性定理
- [[graalvm-truffle]] —— GraalVM Truffle — 写一棵会自我特化的语法树就能自动得到 JIT
- [[gradual-typing]] —— 渐进类型 — 让动态和静态类型在同一份代码里共存
- [[granule]] —— Granule — 让类型系统同时数次数、看安全级、追副作用
- [[greenplum-db]] —— Greenplum — Postgres 改的 MPP 数仓
- [[helium-type-errors]] —— Helium — 让类型错误说人话的教学版 Haskell
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[hol-light-2009]] —— HOL Light — 不到 500 行 OCaml 写出能证开普勒猜想的证明助手
- [[hotspot-server-compiler]] —— HotSpot Server Compiler — JVM 在运行时把热点 Java 代码翻译成飞快的本地码
- [[hughes-fp-matters]] —— Why FP Matters — 函数式真正赢在能拆能粘
- [[idris-brady]] —— Idris — 让依赖类型从证明助理变成通用编程语言
- [[immix-mark-region]] —— Immix — 把"扫"和"搬"两种垃圾回收揉成一个
- [[isabelle-hol-2002]] —— Isabelle/HOL — 让程序证明像写数学论文一样可读
- [[jax]] —— JAX — Google 函数式数值计算
- [[kahn-natural-semantics]] —— Kahn 自然语义 — 用一棵推理树说清楚程序求值
- [[karp-21]] —— Karp 21 — 21 个 NP-完全问题
- [[keras]] —— Keras 3 — 一份模型代码跑三套后端
- [[kildall-dataflow]] —— Kildall 数据流框架 — 用一套格论统一所有全局编译优化
- [[knuth-taocp]] —— Knuth TAOCP — 计算机程序设计艺术
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[lamport-tla-1994]] —— TLA — 把状态机和时序逻辑捏成一个公式
- [[landin-secd]] —— Landin SECD — 第一台机械求值 lambda 表达式的抽象机器
- [[lean-prover]] —— Lean 4 — 用 Lean 重写的 Lean，让数学家和程序员共用一种语言
- [[libsignal]] —— libsignal — 端到端加密的 Rust 内核
- [[linear-types]] —— 线性类型（Linear Types）
- [[liquid-types]] —— Liquid Types — 让编译器自己推导出"哪些值才合法"
- [[liskov-abstraction-1974]] —— Programming with Abstract Data Types — Liskov & Zilles 1974 抽象数据类型宣言
- [[llvm]] —— LLVM — 模块化编译器框架
- [[local-type-inference]] —— Local Type Inference — 编译器只看相邻节点也能推出类型
- [[martin-lof-itt]] —— Martin-Löf 直觉主义类型论 — 让"证明"和"程序"变成同一件事
- [[mccarthy-lisp]] —— McCarthy LISP 1960
- [[metaml-multi-stage]] —— MetaML — 让你显式地写"先生成代码、再跑代码"
- [[milner-pi-calculus]] —— π-演算 — 让通道名本身能在通道里流动
- [[mlx]] —— MLX — Apple Silicon 统一内存原生 ML 框架
- [[move-language]] —— Move — 资源型智能合约语言
- [[mycroft-strictness]] —— Mycroft 严格性分析 — 编译器替你判定哪些参数能"先算"
- [[nix]] —— Nix — 函数式声明式包管理与可重复构建
- [[nuprl-1986]] —— Nuprl — 第一个把 Martin-Löf 类型论搬上屏幕的证明助手
- [[open-sora]] —— Open-Sora — 把 Sora 黑盒一比一开源的视频生成项目
- [[partial-evaluation-jones]] —— Jones-Gomard-Sestoft 1993 — Partial Evaluation 与自动程序生成
- [[peyton-jones-stg]] —— Peyton Jones STG — 让 Haskell 的 lazy 在普通 CPU 上跑得快
- [[playwright]] —— Playwright — 跨浏览器自动化测试
- [[plotkin-sos]] —— Plotkin SOS — 用规则讲清楚程序"走一步"是什么
- [[pottier-merr]] —— Pottier LR(1) Reachability — 让 LR 解析器的错误消息覆盖完整
- [[program-comprehension-fmri]] —— Program Comprehension fMRI — 程序员读代码时大脑亮的是语言区不是数学区
- [[push-pull-frp]] —— Push-Pull FRP — Functional Reactive Programming 实用化
- [[pypy-tracing-jit]] —— PyPy meta-tracing JIT — 给解释器加一次 JIT，所有用它的语言一起加速
- [[pytorch]] —— PyTorch — 深度学习主流框架
- [[pytorch-lightning]] —— PyTorch Lightning — PyTorch 训练循环抽象
- [[react-server-components]] —— React Server Components — 让组件自己决定在哪台机器跑
- [[refinement-types-1991]] —— Refinement Types for ML — 让程序员告诉编译器"哪些子集才合法"
- [[rest-fielding-2000]] —— REST — Fielding 2000 给 Web API 写下的设计宪法
- [[reynolds-definitional-interpreters]] —— Reynolds Definitional Interpreters — 用一种语言去定义另一种语言
- [[row-polymorphism-remy]] —— Row Polymorphism — 让记录类型可扩展又不丢类型安全
- [[sagiv-shape-analysis]] —— Sagiv 参数化形状分析 — 用三值逻辑证明链表树仍是链表树
- [[salsa-adapton]] —— Salsa / Adapton — 让程序只重算"真的变了"的那一小块
- [[scala-macros]] —— Scala Macros — 让 Scala 在编译期把方法调用替换成任意代码
- [[scott-strachey-denotational]] —— Scott-Strachey 指称语义 — 给程序找一个独立于实现的数学含义
- [[self-adjusting]] —— Self-Adjusting Computation — 输入小幅变化时只重算受影响的那部分
- [[self-pic]] —— Self / PIC — 内联缓存的诞生
- [[sillito-questions]] —— Sillito 44 问题 — 程序员改代码时到底在问什么
- [[simula-67]] —— SIMULA 67 — 面向对象的诞生
- [[smalltalk-80]] —— Smalltalk-80
- [[ssa]] —— SSA — 静态单赋值形式
- [[stainless-2017]] —— Stainless — 让编译器替你证明 Scala 函数真的满足规约
- [[standard-ml]] —— Standard ML — 让编译器替你把类型补完
- [[starlight]] —— Starlight — Astro 文档站点主题
- [[starrocks]] —— StarRocks — MPP 列存数据库
- [[steensgaard-pointer]] —— Steensgaard 指针分析 — 用等价合并把指针分析压到几乎线性
- [[strawberry]] —— Strawberry — 用 Python 类型注解直接生成 GraphQL schema
- [[strongtalk]] —— Strongtalk — 可以装可以卸的 Smalltalk 类型系统
- [[sycl-cpp-2020]] —— SYCL 2020 — 用一份标准 C++ 让 GPU/CPU/加速器一起跑
- [[system-f-reynolds-1974]] —— System F — 让类型也能像参数一样被传递
- [[tanstack-router]] —— TanStack Router — 把 URL 当类型，编译器替你守路由
- [[template-haskell]] —— Template Haskell — 让 Haskell 在编译期把代码当数据玩
- [[temporal-polyfill]] —— temporal-polyfill — 给 JavaScript 装上现代日期时间标准的备胎
- [[theorems-for-free]] —— Theorems for Free — 类型签名直接给定理
- [[tla-yu-tlc-1999]] —— TLC — 让 TLA+ 规范可以一键机检的模型检查器
- [[tofte-talpin-regions]] —— Tofte-Talpin Regions — 让类型系统替你管内存生命周期
- [[torchtune]] —— torchtune — PyTorch 官方 LLM 微调库
- [[tracemonkey]] —— TraceMonkey — 只编"真的走过的那一条路"
- [[trees-that-grow]] —— Trees that Grow — 可扩展的语法树设计
- [[turchin-supercompilation]] —— Turchin Supercompilation — 让编译器把程序模拟一遍再写回去
- [[turing-1936]] —— Turing 1936 可计算性
- [[uniswap-v3]] —— Uniswap V3 — 集中流动性 AMM 核心合约
- [[wadler-prettier]] —— Wadler Prettier — 函数式优雅打印器
- [[wam-warren]] —— WAM — 让 Prolog 跑得像编译型语言的抽象机器
- [[warp]] —— warp — Rust 里把请求处理拼成 Filter 积木的 web 框架
- [[whisper]] —— Whisper — OpenAI 多语言 ASR

