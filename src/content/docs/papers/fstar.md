---
title: F* — 把依赖类型、SMT 自动化、副作用追踪揉到一门语言里
来源: 'Swamy et al., "Dependent Types and Multi-Monadic Effects in F*", POPL 2016'
日期: 2026-05-30
分类: 编程语言
难度: 高级
---

## 是什么

F*（读作 F-Star）是一门**让你写代码的同时把代码的"数学性质"也证明了**的语言。日常类比：像合同律师写合同——每签一处条款都附一份"为什么这条不会被钻空子"的法律意见书，但 80% 的意见书是律师助理（SMT solver）自动起草的。

你写：

```fstar
val divide: x:int -> y:int{y <> 0} -> int
let divide x y = x / y
```

`y:int{y <> 0}` 是**精化类型（refinement type）**——只接受非零整数。任何调用 `divide x 0` 的地方，**编译就过不去**，因为 SMT solver 证明不了 `0 <> 0`。

F* 把三件事拼到一门语言里：依赖类型（像 Coq/Agda）、自动 SMT 求解（像 Liquid Types）、按类别追踪副作用（state/exn/IO 各自走不同 monad）。HACL*/EverCrypt 加密库就是用它写的。

## 为什么重要

不理解 F*，下面这些事很难解释：

- 为什么 Firefox 的 NSS 加密库、Linux Kernel 的 WireGuard 敢直接用 F* 提取的 C 代码——它们都做过形式化证明
- 为什么 Coq/Lean 写证明那么累，但 F* 写起来更像写 OCaml——SMT 把 80% 琐碎证明自动化了
- 为什么"refinement type"和"dependent type"不是一回事——前者只能写一阶逻辑断言，后者能让类型依赖具体值
- 为什么"副作用"在类型系统里要分种类——纯函数和带 IO 的函数能用同样的逻辑推理吗？答案是不行

## 核心要点

F* 的三大支柱：

1. **依赖类型 + Refinement**：类型可以含具体值（`vec n` = 长度为 n 的向量）；类型也可以加逻辑断言（`x:int{x > 0}`）。类比：报关单上不只写"集装箱"，还写"集装箱里 ≥ 100 件 ≤ 200 件衣服"。

2. **Dijkstra Monad（多 monad 副作用）**：每种副作用配一个 monad，每个 monad 自带"weakest precondition 计算器"。状态 monad 算"想达到这个后置条件，调用前堆里得是什么样"；异常 monad 算"会不会抛"。类比：医院按科室分诊——内科 monad、外科 monad，各自有自己的检查清单。

3. **SMT 自动化 + tactic 兜底**：编译时把所有验证条件（VC）抽出来，扔给 Z3。Z3 解不出来，才人工写 tactic。类比：法院 80% 简单案件让 AI 助理处理，复杂的留给法官。

三者合起来叫**"pay-as-you-go"验证**——不写 spec 就当普通 ML 用，写多少 spec 就证多少。

## 实践案例

### 案例 1：编译期防除以零

```fstar
val safe_div: x:int -> y:int{y <> 0} -> int
let safe_div x y = x / y

let test1 = safe_div 10 2   // OK
let test2 = safe_div 10 0   // 编译报错：cannot prove 0 <> 0

let from_user (input: int) =
  if input <> 0 then safe_div 100 input  // OK：if 分支里 SMT 知道 input <> 0
  else 0
```

**逐部分解释**：

- `y:int{y <> 0}` 是 refinement type，读作"y 是个 int 且非零"
- 调用方传值时，F* 把"实参满足 `<> 0`"作为验证条件交给 Z3
- 第二行 `safe_div 10 0`，Z3 一看 `0 <> 0` 就 false → 编译期失败
- `from_user` 里 SMT 沿着 if 分支推：进 then 分支说明 `input <> 0`，验证通过
- 没有运行时开销——类型擦除后就是普通 `x / y`

### 案例 2：状态 monad 与不变量

```fstar
val incr: r:ref int -> ST unit
  (requires (fun h0 -> True))
  (ensures  (fun h0 _ h1 -> sel h1 r = sel h0 r + 1))
let incr r = r := !r + 1
```

`ST` 是状态 monad；`requires` 是前置条件；`ensures` 描述前后堆的关系（`h0` 调用前堆，`h1` 调用后堆）。F* 自动算 weakest precondition——根据后置条件**反向推**前置条件需要满足什么。让 SMT 验证 `r := !r + 1` 确实让 `r` 在堆里加了 1。这就是 Hoare Logic 但融进了类型系统：你不再写"程序 + 证明"两份，签名里就藏着证明。

### 案例 3：HACL* 验证 curve25519

椭圆曲线 curve25519 有上千个 mod p 算术运算，每一步都要证明三件事：

- **不溢出 64 位字**——每个加法/乘法的中间结果都要在范围内
- **不出现 timing leak**——分支不依赖密钥位（侧信道防御）
- **和数学定义一致**——实现的"乘法"等于教科书定义的乘法

HACL* 用 F* 的 Low* 子集（限制到不需要 GC 的部分）写完，再用 KreMLin 编译器提取出 C 代码，性能逼近手写汇编。结果：Firefox NSS、Linux Kernel WireGuard 直接用了 F* 输出的 C 文件——史上首次"被形式化证明的加密库进入主流操作系统"。

## 踩过的坑

1. **SMT timeout 不是反例**：Z3 解不出来时只说"超时"，不告诉你"反例是 x=-3"。新人陷入"是定理错了还是 Z3 没找到证明"的猜谜，要靠把 spec 拆小、加 hint 提示。

2. **Effect 类型报错很长**：函数标 `ML`（含 IO）传给要求 `Pure` 的位置会编译失败，但报错往往一大段 monad 类型表达式，零基础几乎读不懂——要先理解 `Pure ⊆ ST ⊆ ML` 这条层级链。

3. **Refinement 太紧 → SMT 爆炸**：`x:int{x>0 && x<100 && isPrime x}` 这种 `isPrime` 是递归函数，Z3 展开会几分钟不出结果。工程上要把谓词写简单或拆 lemma。

4. **提取后副作用保护丢失**：F* 编译到 OCaml/F#/C 后，运行时只剩普通代码——依赖类型在编译期就擦除了。如果 spec 写错没证完，提取产物可能崩；要靠源头把证明做扎实。

## 适用 vs 不适用场景

**适用**：

- 安全关键代码（加密、协议、内核驱动）——HACL*/EverCrypt 是教科书案例
- 想要"比 Coq 省力、比 Liquid Types 强大"的中间路线
- 已有 OCaml/F# 工程，想渐进引入证明
- 一阶性质多的代码（算术、状态、协议状态机）

**不适用**：

- 重数学定理（高阶逻辑、归纳法多）→ 用 Coq/Lean，tactic 生态成熟
- 团队完全没人会 SMT 调优 → 学习成本极高
- 性能敏感且不想用 Low* 子集 → F* 默认有 GC
- 需要工业 IDE（VSCode 支持有但不如 Lean 的 InfoView）

## 历史小故事（可跳过）

- **2009 年**：Microsoft Research 启动 F7——带 refinement type 的 F# 方言，专攻协议验证
- **2011-2014 年**：F7 演化为 F*，引入 dependent type，但副作用模型还乱
- **2016 年（本论文，POPL）**：大重写——引入 Dijkstra Monad 统一所有副作用，pay-as-you-go 验证；TLS 1.2 验证作为 demo
- **2017 年**：衍生 Low* 子集（不用 GC，能编译到 C），KreMLin 编译器诞生
- **2020 年后**：HACL*/EverCrypt 加密库被 Firefox NSS、Linux Kernel WireGuard、Microsoft Azure 大规模采用——史上第一次"被形式化证明的加密库进入主流操作系统"

## 学到什么

1. **"自动化 + 兜底"是验证语言的工程胜利**——SMT 解 80% 的简单条件，剩下 20% 给人工，比 Coq 全人工亲切，比 Liquid Types 全自动可控
2. **副作用要分类型追踪**——纯函数 vs 带 IO 不能混用同一套推理，monad 给了天然分隔
3. **Refinement type 是 dependent type 的"工程化阉割版"**——只放一阶逻辑，让 SMT 能解
4. **形式化证明能落地工业**——HACL* 进 Firefox/Linux 是对"证明只在学术界"这个偏见的反例

## 延伸阅读

- 官方文档与教程：[F* tutorial](https://www.fstar-lang.org/tutorial/)（在线 try-it 环境，从 hello world 到证明排序算法）
- 论文 PDF：[Dependent Types and Multi-Monadic Effects in F* (POPL 2016)](https://www.fstar-lang.org/papers/mumon/)
- 实战项目：[HACL* GitHub](https://github.com/hacl-star/hacl-star)（被 Firefox/Linux 用的加密库）
- [[liquid-types]] —— F* 的"轻量版"亲戚，自动但表达力受限
- [[lean-prover]] —— 同期对手，走"全人工 tactic + 数学库"路线

## 关联

- [[hindley-milner]] —— F* 的类型推导基础，自动推普通类型；F* 在它之上加 refinement
- [[calculus-of-constructions]] —— Coq/Lean 的依赖类型理论根基；F* 是它的工程化变体
- [[martin-lof-itt]] —— 直觉主义类型论；F* 的依赖类型从这里来
- [[hoare-logic]] —— 前置/后置条件的祖师爷；F* 的 `requires`/`ensures` 是它的现代化身
- [[refinement-types-1991]] —— refinement type 的源头（ML 子集），F* 把它推到工业级
- [[idris-brady]] —— 同样想让依赖类型工程化，但走"全人工"路线，没用 SMT
- [[effect-handlers]] —— 代数效应；F* 的 multi-monad 是它的"封闭式"亲戚

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[atzei-eth-attacks-2017]] —— Atzei Ethereum Attacks 2017 — 给智能合约漏洞做三层分类
- [[biere-bmc-1999]] —— Bounded Model Checking — 把硬件验证翻译成一道 SAT 题
- [[boogie-2005]] —— Boogie — 写一次验证后端，多种证明语言复用
- [[clarke-emerson-1981]] —— Clarke-Emerson 1981 — 让机器自己检查并发程序对不对
- [[cryptoverif-2008]] —— CryptoVerif — 让计算机直接证密码协议在真实计算模型下安全
- [[dafny-2010]] —— Dafny — 把"代码该满足的条件"直接写进语法，编译器自动证明
- [[easycrypt-2011]] —— EasyCrypt — 让密码学家的安全证明能被机器自动检查
- [[frama-c-2012]] —— Frama-C — 一个开源平台把 C 程序的多种验证方法拼到一起
- [[hacl-star-2017]] —— HACL* — 用数学证明过的 C 加密代码，跑在你 Firefox 和 Linux 内核里
- [[mcmillan-smv-1993]] —— McMillan SMV 1993 — 把状态空间从 10^6 推到 10^20 的符号模型检测
- [[mitls-2014-triple-handshake]] —— Triple Handshake — TLS 同一把主密钥被复用，黑客就能换人不换锁
- [[stainless-2017]] —— Stainless — 让编译器替你证明 Scala 函数真的满足规约
- [[vcc-2009]] —— VCC — 给并发 C 加注解，让 SMT 自动证它对
- [[verdi-2015]] —— Verdi — 在 Coq 里完整证明 Raft 协议的分布式系统验证框架
- [[verisoft-2008]] —— Verisoft — 把整台计算机从门电路到邮件客户端全部用数学证完
- [[why3-2013]] —— Why3 — 写一次程序规范，多个证明器一起来证
- [[z3-2008]] —— Z3 2008 — 把 SMT 工程化到工业默认
