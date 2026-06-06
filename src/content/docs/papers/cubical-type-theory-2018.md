---
title: Cubical Type Theory — 让 Univalence 公理真的能算出结果
来源: 'Cohen, Coquand, Huber, Mörtberg, "Cubical Type Theory: A Constructive Interpretation of the Univalence Axiom", TYPES 2015 post-proceedings 2018（arXiv:1611.02108）'
日期: 2026-05-31
子分类: 形式化验证
分类: 形式化方法
难度: 高级
provenance: pipeline-v3
---

## 是什么

Cubical Type Theory（**CCHM**，按四位作者首字母）是一套**让 Voevodsky 的 univalence 公理从『假设它成立』变成『编译器真的能算出来』**的类型论。

日常类比：以前你在证明助手里写 `axiom univalence : ...`，相当于法官说"这条规则我们假设成立"——程序里用到它的地方全都**卡在那里不动**，因为没人告诉机器这条规则**怎么算**。CCHM 这篇论文做的事是：**给 univalence 写出执行细则**，让机器真的能按规则一步步推下去，得到具体的数字、具体的类型。

技术上它做了一件特别的事：**把"区间"`[0, 1]` 直接搬进类型论里**——一个叫 `I` 的东西，有两个端点 `i0` 和 `i1`，再加上 `~i`（翻转）、`i ∧ j`、`i ∨ j`（De Morgan 代数）。然后**路径就是从 `I` 到类型 A 的函数**。

```
PathP (i. A) a b  ≈  λ i : I. ...   // i0 处取 a，i1 处取 b
```

这一改写，[[awodey-warren-2009]] 里『相等是路径』的隐喻**从图像变成了真正的语法**。

## 为什么重要

不理解这篇论文，下面这些事都没法解释：

- 为什么 **Cubical Agda**（2019 进入 Agda 主线）能写 `transport (ua e) x` 然后真的算出结果，而普通 Coq/Agda 只能停在 `axiom univalence` 卡住
- 为什么 **redtt** / **cooltt**（CMU RedPRL Lab）整套实验都建立在这套规则上
- 为什么 [[hott-book-2013]] 里所有"假设 univalence 成立"的章节，2018 年之后都可以**实际跑起来**
- 为什么形式化数学社区从 2018 年起开始大规模把同伦理论搬进 Cubical Agda（Brunerie 计算 π₄(S³)、Mörtberg 和团队推 synthetic homotopy theory）

简单说：**这是 univalence 从『理论存在』变成『机器可执行』的那一步**。

## 核心要点

CCHM 的关键原语有 **5 件**：

1. **区间 `I`**：不是普通类型，是 *pretype*。它有端点 `i0`、`i1`，操作 `~i`（翻）、`i ∧ j`、`i ∨ j`（取 min/max）。日常类比：把"路径从 0 走到 1"变成可以写在程序里的变量。

2. **Path 类型 `PathP (i. A) a b`**：从 `I` 到 `A` 的函数，端点固定为 `a` 和 `b`。`refl = λ i. a` 就是"原地不动的路径"。**等于关系直接被路径替换**。

3. **Composition `comp`**：把一个"立方体的部分面"沿路径**传输**到另一面。它替代了原来 Martin-Löf 里的 J、subst、transport——一个原语统一了所有"沿等式搬运"的操作。

4. **Glue 类型**：核心黑魔法。给定等价 `e : A ≃ B`，Glue 把 `e` 转成路径 `ua e : Path Type A B`。**这就是 univalence 的执行规则**——它不再是公理，是 Glue 的规约规则。

5. **Higher Inductive Types（HITs）**：构造子可以是路径。圆 `S¹` 有 `base : S¹` 和 `loop : Path base base`。商类型、悬挂、截断现在都能直接写。

把这 5 件加起来，`canonicity` 重新成立——闭合的 `Nat` 项一定能算到具体数字，不会卡。

## 实践案例

### 案例 1：用 ua 把 Bool ≃ Bool 变成路径

Cubical Agda 里：

```agda
notEquiv : Bool ≃ Bool       -- not 是双射，构成等价
notPath  : Bool ≡ Bool       -- ua notEquiv 把它变成"相等"
notPath = ua notEquiv

flipBool : Bool → Bool        -- 沿这条路径搬运 true
flipBool b = transport notPath b
-- 检查器算出: flipBool true = false  ← 真的算出来了
```

普通 Agda 加 `postulate univalence` 这一行**永远 stuck**——transport 卡住。CCHM 让它跑通。

### 案例 2：圆 S¹ 直接写

```agda
data S¹ : Type where
  base : S¹
  loop : base ≡ base    -- ← 构造子是一条路径，这是 HIT
```

绕一圈得到 `loop`，绕两圈得到 `loop · loop`。基本群 `π₁(S¹) ≡ ℤ` 这个经典结果**可以在类型检查器里算**（Licata-Brunerie-Mörtberg 一系列工作）。

### 案例 3：商类型 ℤ = ℕ × ℕ / ~

整数 = 自然数对模等价。CCHM 之前要写 setoid，到处带 quotient 证明。CCHM 之后用 HIT 一行：

```agda
data ℤ : Type where
  pair : ℕ → ℕ → ℤ
  rel  : (a b c d : ℕ) → a + d ≡ c + b → pair a b ≡ pair c d
```

商类型成了一等公民。

## 踩过的坑

1. **`I` 不是 Type，不能写 `Type → I`**：interval 是 pretype，新人想把它当普通类型用会被检查器拒绝。它**只在 PathP 等特定位置出现**。

2. **`comp` 语法重**：写起来比 Coq 的 `rewrite` 啰嗦。需要给 partial element、给 cap，新手第一周写 5 行 comp 是正常速度。

3. **De Morgan vs Cartesian 两个流派**：CCHM 用 De Morgan cube（带 `∧`、`∨`、`~`）。Angiuli-Brunerie-Coquand 等人推 Cartesian cube（只有面，没 `∧`）。两套都能做 univalence，互不兼容；选哪套要看工具链。

4. **类型检查变慢**：cubical 比普通 MLTT 慢一截。复杂证明里 `comp` 嵌套深，类型检查器需要跑很多归约。Cubical Agda 团队还在持续优化。

5. **不是『所有』univalence 都自动算**：有些复杂场景仍需 `transport-fillers` / `hcomp` 手写。完全自动化是仍在做的事。

## 适用 vs 不适用场景

**适用**：
- 形式化同伦理论 / 范畴论 → Cubical Agda 是当前最实用工具
- 需要 univalence 真的能算（不是只当 axiom 用）的形式化项目
- 需要 HIT（商类型、截断、悬挂、Eilenberg-MacLane 空间）

**不适用**：
- 只做日常程序验证（哈希表正确性等）→ Coq / Lean 4 更成熟、生态更大
- 想要 `K axiom` / UIP（"相等只有一种"）→ cubical 主动**拒绝** UIP，因为它和 univalence 冲突
- 性能敏感的大规模形式化 → 当前 cubical 慢，复杂工程会等很久

## 历史小故事（可跳过）

- **2009**：[[awodey-warren-2009]] 把"相等就是路径"写成范畴论模型——但只是模型，不能算。
- **2014**：Bezem-Coquand-Huber 在 cubical sets 里给 univalence 做了**模型层**的解释（语义可算，但语法上 univalence 还是 axiom）。
- **2016**：CCHM 把这个语义结构**搬回语法**——加 interval、加 comp、加 Glue。论文挂上 arXiv。
- **2018**：TYPES 2015 post-proceedings 正式发表。
- **2019**：Vezzosi-Mörtberg-Abel 把 cubical 实现为 `Agda --cubical`，进入 Agda 主线。
- **2020-2026**：Brunerie 用 Cubical Agda 算出 π₄(S³) ≡ ℤ/2ℤ（手算多年的同伦群结果）；synthetic homotopy theory 大规模形式化展开。

[[martin-lof-itt]] → [[awodey-warren-2009]] → [[hott-book-2013]] → CCHM 是这条线的**最后一块工程拼图**。

## 学到什么

1. **Univalence 从公理变规约**——这是过去十年类型论最重要的工程进展
2. **interval + composition + Glue** 是把同伦语义『内化』进语法的关键技巧；HIT 是顺带的红利
3. **canonicity 才是真正的工程门槛**：理论上对 vs 闭合项能算到具体值，差一道鸿沟
4. **理论 → 模型 → 语法 → 实现**：2009 → 2014 → 2018 → 2019，每一步隔几年；CCHM 是把模型搬回语法的那一步

## 延伸阅读

- 论文 PDF：[Cubical Type Theory（arXiv 1611.02108）](https://arxiv.org/abs/1611.02108)（57 页，技术密度高）
- 实战教程：[Cubical Agda 官方文档](https://agda.readthedocs.io/en/latest/language/cubical.html)（带可跑的例子）
- 视频：[Anders Mörtberg — Introduction to Cubical Type Theory](https://www.youtube.com/results?search_query=mortberg+cubical+type+theory)（社群多场报告，找 1 小时入门版）
- 库：[agda/cubical 标准库](https://github.com/agda/cubical)（同伦理论形式化的现行主仓库）
- [[hott-book-2013]] —— CCHM 要 constructivize 的对象
- [[awodey-warren-2009]] —— 路径解释的源头

## 关联

- [[awodey-warren-2009]] —— 提供"相等即路径"的范畴论模型，CCHM 把它搬进语法
- [[hott-book-2013]] —— 所有"假设 univalence"的章节，CCHM 之后真的能跑
- [[martin-lof-itt]] —— 底层依赖类型论；CCHM 在它上面加 interval / comp / Glue
- [[agda-norell]] —— Cubical Agda 的宿主语言
- [[calculus-of-constructions]] —— 另一支主流（Coq），目前还没把 univalence 做成可计算
- [[lean-prover]] —— 走另一条路（quotient + funext），不走 cubical

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[awodey-warren-2009]] —— Awodey-Warren — 把『相等的证明』看成两点之间的路径
- [[calculus-of-constructions]] —— Calculus of Constructions — 让程序和数学证明共用一种语言
- [[hott-book-2013]] —— HoTT Book — 把"相等"重定义为路径，再让数学和程序共用同一本教材
- [[lean-prover]] —— Lean 4 — 用 Lean 重写的 Lean，让数学家和程序员共用一种语言
- [[martin-lof-itt]] —— Martin-Löf 直觉主义类型论 — 让"证明"和"程序"变成同一件事

