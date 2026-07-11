---
title: HOL Light — 不到 500 行 OCaml 写出能证开普勒猜想的证明助手
来源: 'Harrison, "HOL Light: An Overview", TPHOLs 2009'
日期: 2026-05-30
分类: 编程语言 / 形式化方法
难度: 高级
---

## 是什么

**HOL Light** 是 John Harrison 90 年代末用 **OCaml** 重写的一个**交互式定理证明器**——你写一句数学定理，它逐步逼着你给出能让计算机检查的证明，最后机器告诉你"对"或"差一步"。

日常类比：像一个**严苛到极点的数学老师**——你说"这一步显然"，它说"不行，请把'显然'拆成 5 步规则"。每一步都得是它知道的那十几条原始规则之一，否则不收。

它最反常识的地方是 **trusted kernel < 500 行 OCaml 代码**——也就是说，整个"计算机替我检查证明"的可信底座，加起来比一篇论文还短。再复杂的证明（哪怕几百万步），最终也只调用这 500 行里的十几个函数。

## 为什么重要

如果你不理解 HOL Light，下面这些事都没法解释：

- 为什么 Hales 证开普勒猜想（"球怎么堆最密"）耗了 20 年人类争议，最后用 HOL Light **机器检查通过**才被数学界完全接受
- 为什么 Intel 的 Itanium 浮点除法、平方根、sin/cos 在出货前都被 HOL Light 验过——**因为 1994 年 Pentium FDIV bug 让 Intel 赔了 4.75 亿美元**
- 为什么"信任 500 行代码"比"信任 50 万行代码"在数学上是天壤之别——可信底座小到一个人能在一个下午全读完
- 为什么写定理证明器的人都迷恋 ML 家族（OCaml / Standard ML / F#）——**LCF 风格 + HM 类型系统天生就是为它设计的**

## 核心要点

HOL Light 的设计可以拆成 **三个支柱**：

1. **LCF 风格的可信内核**：定理是一个 OCaml **抽象类型** `thm`。外部代码**拿不到** `thm` 的构造函数，**只能**调用内核里的十几个原始规则函数（如 `MP`、`REFL`、`TRANS`）来生成新的 `thm`。这就保证：**任何能造出来的 thm，必然是从公理一步步合法推出的**。类比：保险箱的钥匙只有 12 把基础形状，再花哨的开锁动作也得用这 12 把。

2. **OCaml 当元语言**：用户写的所有"自动化"（战术、决策过程、SAT/SMT 调用等）都是普通 OCaml 程序。它们最终只能产出 `thm`——而 `thm` 只能被内核构造——所以**自动化代码再花哨也不可能造假定理**。这是 HM 类型系统（[[hindley-milner]]）和"抽象类型 + 模块封装"在数学软件里的杀手级应用。

3. **战术（tactic）反向证明**：你不是从公理正向推到结论，而是从结论开始，告诉系统"这个目标可以拆成两个子目标"，系统帮你管理子目标栈。当所有子目标变成"已知公理或之前证过的定理"，整个证明就完成。这种交互方式叫 **goal-directed proof**，源自 Edinburgh LCF（Milner 1972）。

## 实践案例

### 案例 1：trusted kernel 到底长什么样

HOL Light 的内核公开规则大约是这些（OCaml 函数签名简化）：

```ocaml
val REFL : term -> thm                 (* |- t = t *)
val TRANS : thm -> thm -> thm          (* |- a=b, |- b=c  ==>  |- a=c *)
val MK_COMB : thm * thm -> thm         (* 函数应用的相等性传播 *)
val ABS : term -> thm -> thm           (* lambda 抽象 *)
val BETA : term -> thm                 (* (\x.t) x = t *)
val ASSUME : term -> thm               (* p |- p *)
val MP : thm -> thm -> thm             (* |- p==>q, |- p  ==>  |- q *)
(* ... 总共 10 余条 ... *)
```

外部代码（包括用户写的几万行战术）**没有别的方法**造出 `thm`。这就是 LCF 哲学：**自动化随便写，可信底座保持小且静止**。

### 案例 2：写一个简单证明长什么样

证 `1 + 1 = 2`：

```ocaml
let one_plus_one = prove
  (`1 + 1 = 2`,
   ARITH_TAC);;
```

`prove` 接收两个东西：要证的目标 + 一个**战术**。`ARITH_TAC` 是用户层写的"自动算术过程"，内部做了一堆决策、归约、调用，**最终**调用了内核规则若干次，吐出一个合法的 `thm`。你看到的"自动"全是上层戏法，底座没动。

### 案例 3：Flyspeck —— 一个数学难题的机器验证

Hales 1998 用 250 页论文 + 3GB 代码声称证了开普勒猜想（"球最密堆积是面心立方"）。**评审委员会 5 年没读完，最后说"99% 信"**。Hales 决定让计算机检查——14 年后（2014）由几十人用 HOL Light（部分 Isabelle/HOL）完成全部机器验证。

意义：**人类无法独立审完的证明，机器替我们审了**。这是 HOL Light 最响亮的一仗。

### 案例 4：Intel 浮点验证

Pentium FDIV bug（1994）后，Intel 投入大量资源把 Itanium 的浮点核心（除法、平方根、sin/cos/exp/log）全部用 HOL Light 形式化验证——Harrison 本人就在 Intel。今天你电脑算 sin(0.5) 得到的位级正确性，背后是这套证明在兜底。

### 案例 5：交互证明的"对话"长什么样

```
# g `!n. n + 0 = n`;;       (* 设新目标：所有 n，n + 0 = n *)
val it : goalstack = 1 subgoal (1 total)
`!n. n + 0 = n`

# e (INDUCT_TAC);;            (* 战术：对 n 做归纳 *)
val it : goalstack = 2 subgoals (2 total)
`SUC n + 0 = SUC n`             (* 归纳步 *)
`0 + 0 = 0`                     (* 基例 *)

# e (ASM_REWRITE_TAC[ADD]);;  (* 用加法定义改写 *)
# e (REWRITE_TAC[ADD]);;
No subgoals
```

整个过程像下棋——你出战术，系统报子目标，循环到没有子目标为止。每一步**都被内核记账**，不能造假。

## 踩过的坑

1. **"500 行内核"不是说全部代码 500 行**——HOL Light 整个仓库十几万行。500 行是**可信底座**，剩下的是"不被信任但很有用"的战术、库、自动化。区分这两者是 LCF 哲学的关键。

2. **战术写起来枯燥**：交互证明不像写代码，更像玩"规则推箱子"。新手常被 `MESON_TAC []` 失败、子目标爆炸、变量名冲突劝退。学习曲线极陡。

3. **HOL ≠ Coq ≠ Lean**：HOL Light 用**经典逻辑 + Church 简单类型论**（不带依赖类型）。证明力比 Coq/Lean 弱，但自动化更顺。要证"长度为 n 的向量"这种依赖类型场景，HOL Light 笨重，要换 Coq/Lean。

4. **OCaml top-level 既是优点也是坑**：用户在 REPL 里写战术、试想法。但 REPL 里能定义任何 OCaml 函数，**只要不绕过 thm 抽象类型就安全**。新手会试图破解抽象类型——99% 撞墙在 OCaml 模块系统上。

## 适用 vs 不适用场景

**适用**：
- 浮点硬件 / 算术算法的位级正确性证明（Intel / AMD 真在用）
- 数学定理的机器化（Flyspeck / 素数定理 / 平面几何）
- 需要可信底座极小、能审查的高保障场景
- 想用经典逻辑 + 高阶函数 + 不要依赖类型麻烦的工作流

**不适用**：
- 需要依赖类型（"长度为 n 的列表"）→ 选 [[lean-prover]] / Coq / [[agda-norell]]
- 需要"程序即证明"提取可执行代码 → Coq/Lean 更顺
- 需要 SMT 自动化为主、人工证明少 → 选 [[z3-2008]]、F*
- 需要 first-order + 极强自动归纳 → 选 [[acl2-2000]]
- 想要漂亮的 LaTeX 风格证明文档 → 选 [[isabelle-hol-2002]]（Isar 语言更好读）

## 历史小故事（可跳过）

- **1972 年**：Milner 在 Edinburgh 造 LCF（Logic for Computable Functions）证明助手，发明 ML 当元语言，确立"thm 是抽象类型 + 战术反向证明"两大支柱
- **1988 年**：Mike Gordon 在 Cambridge 把 LCF 思想搬到经典高阶逻辑上，做出 HOL88，专门验硬件
- **1996 年**：Harrison 在 HOL90 基础上**重写出 HOL Light**，目标是"内核小到一个下午能审完"
- **2003 年**：Hales 启动 Flyspeck 项目，把开普勒猜想搬上 HOL Light
- **2009 年**：本论文。Harrison 此时已在 Intel 用 HOL Light 验完 Itanium 浮点
- **2014 年**：Flyspeck 完成机器验证，开普勒猜想成为第一个被机器审过的"人类无法独立审完"的定理

## 学到什么

1. **可信底座越小，整个系统越可信**——HOL Light 用 500 行换来世界级数学难题的机器审核能力
2. **抽象类型 + HM 类型系统**是 LCF 风格的物理基础——没有 ML 家族的类型系统，这套设计哲学落不了地
3. **自动化和可信底座要分开**——自动化随便堆，底座保持静止。这是几乎所有形式化系统的共同结构
4. **理论 → 工具 → 工业落地**：1972 LCF → 1996 HOL Light → 2009 Itanium → 2014 Flyspeck，每一步隔十几年

## 延伸阅读

- 论文 PDF：[Harrison 2009 — HOL Light: An Overview](https://www.cl.cam.ac.uk/~jrh13/papers/hollight.pdf)（TPHOLs 2009；零基础看前几节即可。同作者自验证内核见 [holhol.pdf](https://www.cl.cam.ac.uk/~jrh13/papers/holhol.pdf)）
- 教程：[Harrison — HOL Light Tutorial](https://www.cl.cam.ac.uk/~jrh13/hol-light/tutorial.pdf)
- Flyspeck 项目主页：[github.com/flyspeck/flyspeck](https://github.com/flyspeck/flyspeck)
- [[isabelle-hol-2002]] —— 同样是 HOL 家族但走 Isar 风格的另一支
- [[hindley-milner]] —— OCaml/ML 类型系统的根基，LCF 哲学的物理基础

## 关联

- [[isabelle-hol-2002]] —— 同源 HOL，但更重"可读证明文档"，HOL Light 更重"内核极简"
- [[acl2-2000]] —— first-order 自动归纳路线；HOL Light 是高阶 + 交互路线，对照
- [[z3-2008]] —— SMT 自动求解；HOL Light 调它当后端做"小步自动化"
- [[hindley-milner]] —— OCaml 抽象类型 + 类型推导让 thm 抽象类型成为可能
- [[lean-prover]] —— 现代依赖类型证明助手，HOL Light 的精神后继之一
- [[agda-norell]] —— 依赖类型路线对照
- [[godel-1931]] —— 不完备性定理，HOL Light 工作的逻辑边界

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[awodey-warren-2009]] —— Awodey-Warren — 把『相等的证明』看成两点之间的路径
- [[nuprl-1986]] —— Nuprl — 第一个把 Martin-Löf 类型论搬上屏幕的证明助手
- [[vamp-verisoft-2006]] —— VAMP — 把一颗有流水线、乱序、浮点和 cache 的处理器从门电路证到指令集
