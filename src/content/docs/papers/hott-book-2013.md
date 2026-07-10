---
title: 'HoTT Book — 把"相等"重定义为路径，再让数学和程序共用同一本教材'
来源: 'The Univalent Foundations Program, "Homotopy Type Theory: Univalent Foundations of Mathematics", IAS Princeton 2013（homotopytypetheory.org/book）'
日期: 2026-05-31
分类: 编程语言 / 形式化方法
难度: 高级
---

## 是什么

**HoTT Book** 是 50 多位数学家、计算机科学家在 IAS Princeton 一起花一年写出来的一本 600 多页的教材，2013 年 6 月发布在网上。它把两件以前完全不挨着的东西**用同一种语言重新写了一遍**：

- 一边是**类型论**（程序员用来写编译器、证明助手的工具，比如 [[martin-lof-itt]]）
- 另一边是**同伦论**（拓扑学家研究"形状能不能连续变形"的工具）

日常类比：以前数学家和程序员各有一本菜谱，菜名互相不认识。HoTT Book 说："其实你们做的菜底层用的是同一套食材，只是切法不同。来，我把两本菜谱合订一本。"

合订之后冒出一条新规则——**Univalence 公理**（同一性公理）：

```
两个类型如果"在结构上等价"，那它们就"相等"
(A ≃ B) ≃ (A = B)
```

听起来是废话，但写到类型论里就是革命——以前数学家为了表达"两个东西本质相同"要绕一大圈（写商类型 / setoid），Univalence 一句话搞定。

## 为什么重要

不理解 HoTT Book，下面这些事都没法解释：

- 为什么 2010 年代后"机器可检的数学地基"突然变成显学——HoTT Book 是这条线的集中宣言（与后来 Lean/mathlib 的 set-truncated 路线并行，不是同一条）
- 为什么 Voevodsky（2002 年菲尔兹奖得主、代数几何顶级人物）在 2009 年起几乎放弃老本行，全身投入造这本书
- 为什么 Cubical Agda、Coq HoTT Library 会出现"Higher Inductive Types"、"Cubical"这些选项——直接承接 HoTT Book；Lean 4 主线则仍走 set-truncated
- 为什么程序员说的"相等"和数学家说的"相等"在 2013 年之后突然有了一个统一的、机器可检的候选定义

## 核心要点

HoTT Book 把三件事缝在一起：

1. **identity type 是空间里的路径**：Martin-Löf 1972 年写下 `Id_A(a, b)`（"a 和 b 在类型 A 里相等"的证明），把它当作多余设计。HoTT 说不——**两个『相等』证明 p, q 之间也可以再有相等证明**，这就和拓扑里"两条路径之间能不能连续变形"对上了（[[awodey-warren-2009]] 把这层语义讲透）。

2. **Univalence 公理**：Voevodsky 提出。意思是"如果两个类型可以一一对应、互为反演，那它们就字面意义上相等"。一条公理，替代以前一堆 quotient / setoid / 等价类的繁琐编码。

3. **Higher Inductive Types (HITs)**：传统归纳类型只能写"点"（`Nat = zero | suc Nat`）。HITs 让你同时写**点**和**路径**：

```agda
data S¹ : Type where
  base : S¹
  loop : base = base
```

这定义出了**圆**。在 HoTT 里圆不是一堆点的集合，而是一个点 + 一条从它出发又回来的路径。

加起来就让"在类型论里直接做拓扑"成为可能——叫做 **synthetic homotopy theory**。书里证明了 π₁(S¹) = ℤ，这是经典代数拓扑结果，但用类型论语法写出来。

## 实践案例

### 案例 1：以前数学家"两个东西相同"要绕一圈

写群同构：以前你要这么说："G 和 H 之间有一个双射 φ，并且 φ 保运算，所以它们『同构』，但**不相等**——我们再人为定义一个等价关系把它们看成同一个。"

Univalence 之后："G 和 H 同构 → G = H。完。"

后续所有"对 G 成立的事，对 H 也成立"自动免费——传输（transport）一行代码搞定。

具体一点：你证明了 ℤ/2ℤ 是循环群有 2 个元素这一性质。换到一个同构的群（比如 `Bool` 的异或群）想用同样性质？传统集合论要重证或显式搬运。Univalence 之后 transport 自动把性质从 ℤ/2ℤ 搬到 Bool。

### 案例 2：圆作为 Higher Inductive Type

```agda
data S¹ : Type where
  base : S¹
  loop : base ≡ base
```

这就是**圆**。注意 `loop` 不是从 base 到另一个点，而是 base 到自己——但这条 loop **不等于** `refl`（什么都不动的那条）。loop 绕一圈，loop ∘ loop 绕两圈，互不相同。这就把"圆周群 ℤ"自动塞进了类型。

### 案例 3：synthetic homotopy theory

书里第八章证明 π₁(S¹) = ℤ：圆的基本群（一切从 base 出发回到 base 的路径，模连续变形）就是整数加群。

经典证明要几页拓扑学；HoTT 版用 univalence + HIT + transport，几行类型论代码完成。Coq HoTT / Cubical Agda 都把这个证明跑通了。

直观对照：

```
经典拓扑                       HoTT 类型论
─────────────────────────────────────────────
圆 S¹（一个连续的曲线）        S¹ : Type（带 base + loop 的 HIT）
基本群 π₁(S¹)                  base = base 的所有路径
路径连接（concatenation）      _∙_（identity 类型上的路径合并）
π₁(S¹) = ℤ（绕几圈）           encode/decode 一对函数 + univalence
```

证明的本质是：把"绕一圈"对应到 +1，把"反向绕一圈"对应到 -1，建立 (base = base) ≃ ℤ，再 univalence 一句话。

## 踩过的坑

1. **Univalence 在原版 MLTT 里"算不动"**：你写 `transport (univalence f) x`，规则上能用，但**没有计算规则把它化简到底层**。结果就是定理证完了，但跑代码会卡住。这是 HoTT Book 留的一个大坑。Cubical Type Theory（Cohen-Coquand-Huber-Mörtberg 2017）后来用立方结构补上了计算内容——把"路径"这件事变成"在区间 [0,1] 上的函数"，让 univalence 真的能 reduce。

2. **不要把 HoTT 当成"又一个证明助手"**：它的野心是**重写数学的地基**——把以前 ZFC 集合论的位置换成 univalent foundations。Lean / Coq 实现是表象，foundations 才是本质。

3. **"相等就是路径"不是比喻是字面意思**：很多人第一次读以为这只是一种直观说法，其实 HoTT 在语义层把类型 `A` 真的解释成 ∞-groupoid（高阶可逆箭头的塔），`a = b` 真的是从 a 到 b 的箭头集合。

4. **Book 里 univalence 是"公理"不是"定理"**：在原版 MLTT 里你**证不出来**它，只能假设它成立。直到 Cubical Type Theory 才让它变成可计算的定理。

## 适用 vs 不适用场景

**适用**：

- 想给数学搞一个新地基（替代 ZFC）的研究方向
- 在证明助手里形式化高度结构化的数学（同伦群、范畴论、代数拓扑）
- 想避开 quotient / setoid 编码恶心的形式化项目

**不适用**：

- 写普通业务程序——HoTT 公理对运行时性能毫无帮助，开销在编译期形式化
- 想要 univalence 直接"算"出来——目前需要 Cubical 变体（Cubical Agda / cubicaltt）
- 急于产出工业级证明——Lean mathlib 走的是更务实的"set-truncated"路线，没全面拥抱 HoTT

## 历史小故事（可跳过）

- **1972 年**：Martin-Löf 写下 ITT，identity type 看似可有可无
- **1998 年**：Hofmann-Streicher 用 groupoid 做模型，第一次给"identity type 不平凡"找到合法解释
- **2006 年前后**：Voevodsky（菲尔兹奖、代数几何顶尖人物）在 IAS 开始研究类型论，发现 univalence
- **2009 年**：Awodey-Warren 用 Quillen 模型范畴系统化解释（[[awodey-warren-2009]]）
- **2012-2013 年**：IAS 主持 "Univalent Foundations" 工作年，约 50 人合作写书
- **2013 年 6 月**：HoTT Book 在 GitHub + 网站发布，CC BY-SA 协议，PDF 免费
- **2017 年**：Cubical Type Theory 论文（Cohen-Coquand-Huber-Mörtberg）让 univalence 可计算
- **2020 年后**：Cubical Agda / Coq HoTT / Arend 等系统持续追随

## 学到什么

1. **"相等"可以有结构**——`a = b` 不只是一个 yes/no，里面装了从 a 到 b 的"如何相等"信息；同一对 a, b 可以有多种"相等的理由"，理由之间也能再有"相等的理由"
2. **公理可以替代繁琐编码**——univalence 一条把以前数学形式化里几百页的 setoid 麻烦扫掉
3. **数学和程序的边界比想象中模糊**——HoTT 让 ∞-groupoid（高阶范畴论）和 type checker（编译器组件）是同一个东西
4. **协作写大书是可能的**——50 人、一年、GitHub 协作出 600 页教材，这本身就是开源数学的范式样本
5. **"foundation"可以换**——以前数学的地基是 ZFC 集合论；HoTT 给出了一个候选替代，并且这个替代一上来就是机器可检的

## 延伸阅读

- 书本身：[HoTT Book PDF](https://homotopytypetheory.org/book/)（免费 600+ 页）
- 视频入门：[Robert Harper — Homotopy Type Theory 系列讲座](https://www.youtube.com/playlist?list=PLDFB7E0E9F0E5A9F4)
- 入门读物：Egbert Rijke, *Introduction to Homotopy Type Theory*（2022 年笔记，比 HoTT Book 友好）
- Cubical 后续：Cohen, Coquand, Huber, Mörtberg, "Cubical Type Theory: A Constructive Interpretation of the Univalence Axiom" (TYPES 2015 / 2017)
- [[martin-lof-itt]] —— ITT 原始定义，HoTT 的语法基底
- [[awodey-warren-2009]] —— 同伦语义铺路工作

## 关联

- [[martin-lof-itt]] —— 提供 identity type 等语法，HoTT 重新解释其含义
- [[awodey-warren-2009]] —— 把 ITT 装进 Quillen 模型范畴的关键技术铺垫
- [[lean-prover]] —— 现代证明助手，受 HoTT 思想深刻影响（虽然 mathlib 走 set-truncated 路线）
- [[agda-norell]] —— Cubical Agda 是 HoTT 思想的最干净实现
- [[calculus-of-constructions]] —— Coq 内核，Coq HoTT Library 的宿主
- [[nuprl-1986]] —— 走 extensional 路线的对照——把"相等证明唯一"硬塞进系统

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[awodey-warren-2009]] —— Awodey-Warren — 把『相等的证明』看成两点之间的路径
- [[calculus-of-constructions]] —— Calculus of Constructions — 让程序和数学证明共用一种语言
- [[cubical-type-theory-2018]] —— Cubical Type Theory — 让 Univalence 公理真的能算出结果
- [[lean-prover]] —— Lean 4 — 用 Lean 重写的 Lean，让数学家和程序员共用一种语言
- [[martin-lof-itt]] —— Martin-Löf 直觉主义类型论 — 让"证明"和"程序"变成同一件事
- [[nuprl-1986]] —— Nuprl — 第一个把 Martin-Löf 类型论搬上屏幕的证明助手

