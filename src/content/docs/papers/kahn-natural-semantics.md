---
title: Kahn 自然语义 — 用一棵推理树说清楚程序求值
来源: 'Gilles Kahn, "Natural Semantics", STACS 1987'
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

自然语义（**Natural Semantics**，又叫 big-step 操作语义）是一套**用一棵推理树告诉你『程序整体跑完会得到什么值』**的数学形式。日常类比：像数学课的"代数化简过程"——你不写每一步小动作，而是把"原式 = ... = ... = 最终结果"整棵推导挂出来给老师看。

它的核心句式只有一种：

```
⟨e, ρ⟩  ⇓  v
```

读作"表达式 e 在环境 ρ（变量到值的映射）下整体求值得到 v"。每条语法规则配一组**前提 → 结论**的推理规则，整门语言的语义就是「全部这种规则组成的系统」。

写解释器、写 Coq 形式化、写《Standard ML 定义》这本书，背后用的都是它。

## 为什么重要

不理解自然语义，下面这些事都没法解释：

- 为什么 Coq / Isabelle 教材里满篇都是 `e ⇓ v` 这种箭头——它就是自然语义的标准记号
- 为什么《Definition of Standard ML》（Milner 1990）一整本书几乎只在写规则，不写算法
- 为什么"big-step"和"small-step"老被并列出现——前者是 Kahn 1987，后者是 [[plotkin-sos]] 1981
- 为什么解释器（interpreter）和形式化证明能直接对应：推理树 = 函数调用栈

## 核心要点

自然语义的全部门道可以拆成 **三步**：

1. **判断（judgment）**：先决定要描述什么关系。最常见是 `⟨e, ρ⟩ ⇓ v`——三元组：表达式、环境、结果值。类比：法庭笔录格式"被告 / 证物 / 判决"。

2. **推理规则（inference rule）**：每条语法构造写一条横线规则。横线上面是前提，下面是结论。比如加法：「若 e₁ ⇓ n₁ 且 e₂ ⇓ n₂，则 e₁ + e₂ ⇓ n₁ + n₂」。类比：连锁推理"已知 A、已知 B → 得 C"。

3. **推理树（derivation tree）**：把规则串起来，得到一棵从『公理』（数字字面量直接 ⇓ 自己）到『最终结论』的树。这棵树**就是**程序的语义。存在一棵有限推理树 = 该判断成立（通常对应程序终止并得到正常值）；若不存在有限推导，则该判断不成立——常见原因是不终止，也可能是 stuck/错误形态写不进当前判断。

三步合起来：**判断 + 规则 + 树**。对象语言可以有变量与绑定；元语言本身是声明式关系，不靠命令式循环或可变全局状态来定义含义。

## 实践案例

### 案例 1：给迷你算术语言写自然语义

语言只有三种东西：数字、加法、let 绑定。

```
e ::= n  |  x  |  e + e  |  let x = e in e
```

四条推理规则就够了：

```
─────────────  (Num)         ─────────────  (Var)
n, ρ ⇓ n                     x, ρ ⇓ ρ(x)

e₁, ρ ⇓ n₁    e₂, ρ ⇓ n₂            e₁, ρ ⇓ v    e₂, ρ[x↦v] ⇓ v'
─────────────────────── (Add)        ─────────────────────────────── (Let)
e₁ + e₂, ρ ⇓ n₁ + n₂                let x = e₁ in e₂, ρ ⇓ v'
```

**逐部分解释**：横线上面是已经成立的前提，下面是新得到的结论；`ρ[x↦v]` 表示"在原环境 ρ 上新增 x = v 的绑定"。整个语言的含义就是这四条规则的集合。

### 案例 2：用推理树跑一个表达式

跑 `let x = 1 + 2 in x + x` 在空环境 ρ₀ 下：

```
                              1, ρ ⇓ 1   2, ρ ⇓ 2
                              ──────────────── (Add)
                                1 + 2, ρ ⇓ 3            x, ρ' ⇓ 3   x, ρ' ⇓ 3
                                                        ──────────────────── (Add)
                                                          x + x, ρ' ⇓ 6
                              ────────────────────────────────────────────── (Let)
                              let x = 1+2 in x+x, ρ₀ ⇓ 6
```

其中 ρ' = ρ₀[x↦3]。这棵树**完整地等于**一个 Python 递归 `eval(expr, env)` 的调用栈——叶子是字面量，根是最终值。

### 案例 3：在 Coq 里写自然语义并证明定理

把规则直接搬进 Coq：

```coq
Inductive eval : env -> expr -> nat -> Prop :=
  | E_Num : forall ρ n, eval ρ (Num n) n
  | E_Var : forall ρ x v, lookup ρ x = Some v -> eval ρ (Var x) v
  | E_Add : forall ρ e1 e2 n1 n2,
      eval ρ e1 n1 -> eval ρ e2 n2 ->
      eval ρ (Add e1 e2) (n1 + n2).
```

**逐部分解释**：

- `eval` 是一个三参数 `Prop`（命题），不是函数——它表达"这三者构成有效推理"，不直接计算
- 三条构造子 `E_Num / E_Var / E_Add` 分别对应三条推理规则，每个箭头 `->` 是横线上面的前提
- 用 `induction` 战术对推理树归纳，可以证"加法交换""求值确定性"等定理

Software Foundations、Concrete Semantics 两本教材都按这套写——上千页证明全靠这个 5 行模板撑起来。

## 踩过的坑

1. **big-step 描述不了死循环**：`while true do skip` 永远找不到一棵有限推理树，所以无法证明"此程序确实不终止"——要做活性分析或证非终止，必须切回 [[plotkin-sos]] 的 small-step。

2. **把推理规则当 if/else 会错**：自然语义只说"若前提成立则结论成立"，不说求值顺序。同一表达式可能匹配多条规则；naive 写代码当 if/else 链会丢掉多解情况，要把它当 Prolog 那种**关系**而非函数来想。

3. **环境 ρ 不能用可变 map**：ρ 是数学函数，递归调用时新增绑定要**返回扩展后的 ρ'** 而不是改原 ρ。用 Python dict 直接 `dict[x] = v` 会污染上层调用的 ρ，归纳证明就直接破。

4. **异常 / 控制流塞不进 ⟨e, ρ⟩ ⇓ v**：v 默认是正常值，抛异常的程序写不出来。要扩展成 `⟨e, ρ⟩ ⇓ v | exn` 或单独加 `⟨e, ρ⟩ ⇓ raise(e')` 判断，try/catch 才有语义。

## 适用 vs 不适用场景

**适用**：
- 教学语言 / mini 解释器（求值规则一一对应递归函数）
- Coq / Isabelle / Lean 形式化语义（Inductive 定义直接吃自然语义）
- 类型系统证明 type soundness 的"求值部分"（小语言，关心终止后结果）
- 工业语言定义文档（如 Standard ML 1990）

**不适用**：
- 需要描述非终止行为（死循环 / 反应式系统）→ 用 [[plotkin-sos]] small-step
- 并发 / 交错执行 → small-step 配合 transition system
- 需要 step-by-step 调试器语义（要看每一小步）→ small-step
- 想要纯数学含义而非操作过程 → 用 [[scott-strachey-denotational]] 指称语义

## 历史小故事（可跳过）

- **1981 年**：Gordon Plotkin 在丹麦 Aarhus 大学讲义提出 SOS（Structural Operational Semantics），用 `e → e'` 单步重写定义语义，被誉为"操作语义现代版"。
- **1987 年**：Gilles Kahn 在 STACS 会议正式提出 "Natural Semantics"，配套的 Mini-ML 是一个完整 ML 子集示例。论文里他强调推理树"自然地对应一个高效解释器"，所以叫 natural（自然）。
- **1990 年**：Milner、Tofte、Harper 的《The Definition of Standard ML》整本用自然语义写出了一门工业语言，标志这种风格能做"真实尺寸"的事，不只是玩具。
- **1990s 末**：INRIA 的 Coq 团队把自然语义作为 Inductive 类型的标准教学例子，从此"机械证程序定理"和"自然语义"几乎绑定。
- **2010 年代**：Pierce 的《Software Foundations》、Nipkow 的《Concrete Semantics》两本教材把自然语义定为 Coq / Isabelle 教学的默认范式，影响了整整一代 PL 学生。

## 学到什么

1. **程序的"含义"可以是一棵推理树**——不需要执行模型，只要规则集合，剩下的工作是"找树"
2. **big-step 和 small-step 是观察粒度不同**——前者一条判断直接给出最终值，后者用多步 `→` 归约；教学上常对照着读，但不是字面同一棵树的两种切片
3. **形式化语义的终极胜利就是『写下来 = 跑起来 = 证出来』**：同一份自然语义同时是规范文档、递归解释器、定理证明依据
4. **推理树 = 解释器调用栈**——从 Kahn 1987 到 Coq Software Foundations，这条对应关系一路被反复用，是教学和工程沟通的桥

## 延伸阅读

- 论文 PDF：[Natural Semantics — Kahn 1987](https://hal.inria.fr/inria-00075802/document)（22 页，前 5 页就够看明白思路）
- 教材：[Software Foundations Vol 1 — Imp 章](https://softwarefoundations.cis.upenn.edu/lf-current/Imp.html)（Pierce 等，Coq 自然语义入门）
- 教材：[Concrete Semantics — Nipkow & Klein 2014](http://concrete-semantics.org/)（Isabelle 版，前两章就是 big-step）
- 视频：[Glynn Winskel — Operational Semantics 课程](https://www.cl.cam.ac.uk/~gw104/LCS.pdf)（讲义对比 small/big-step）
- [[plotkin-sos]] —— 自然语义最常被对照的另一种风格

## 关联

- [[plotkin-sos]] —— small-step 操作语义；自然语义把它的多步压成一棵树
- [[scott-strachey-denotational]] —— 指称语义；用数学函数代替推理树，更抽象但更难写解释器
- [[hoare-logic]] —— 程序逻辑；自然语义证 type soundness，Hoare 逻辑证 partial correctness
- [[hindley-milner]] —— HM 类型系统的可靠性证明常配自然语义来写
- [[standard-ml]] —— ML 官方定义就是一份大型自然语义
- [[lambda-calculus]] —— 自然语义最常应用的对象语言
- [[reynolds-definitional-interpreters]] —— 用解释器定义语义的另一支，与自然语义思想互通

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cousot-abstract-interpretation]] —— Cousot 抽象解释 — 给静态分析一套统一数学框架
- [[game-semantics-pcf]] —— 博弈论语义与 PCF — 把程序解释成两个人轮流下的对话棋
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[plotkin-sos]] —— Plotkin SOS — 用规则讲清楚程序"走一步"是什么
- [[pnueli-temporal-1977]] —— Pnueli 时序逻辑 — 给"永远不死锁""请求最终被响应"找一套数学语言
- [[pottier-merr]] —— Pottier LR(1) Reachability — 让 LR 解析器的错误消息覆盖完整
- [[prolog-colmerauer]] —— Prolog 的诞生 — 让逻辑式子直接当程序跑
- [[reynolds-definitional-interpreters]] —— Reynolds Definitional Interpreters — 用一种语言去定义另一种语言
- [[scott-strachey-denotational]] —— Scott-Strachey 指称语义 — 给程序找一个独立于实现的数学含义
- [[standard-ml]] —— Standard ML — 让编译器替你把类型补完

