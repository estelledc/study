---
title: "Amaryllis — 在硬币掷出的每条岔路上证明程序正确"
来源: 'Janine Lohse, Tim Rohde et al., "First Steps Towards Probabilistic Iris: Harmonizing Independence, Conditioning, and Dynamic Heap Allocation", arXiv:2605.13765, 2026'
日期: 2026-06-13
分类: 形式化方法
子分类: 形式化验证
难度: 高级
provenance: pipeline-v3
---

## 是什么

Amaryllis 是走向 Probabilistic Iris 的第一块基石：一个在 Iris 分离逻辑框架上构建的通用概率程序逻辑，第一次同时支持概率分布上的独立推理、条件化（conditioning）和动态堆分配。

与以往概率逻辑的最大区别：Amaryllis 把 Iris 的资源代数"按硬币结果分页"——每页（每个随机分支）内部仍遵守经典的分离逻辑规则（指针不交），但不同页之间的堆可以长得完全不同。这意味着你可以证明"不管掷出什么硬币，函数返回的这两个指针在各自页里存的是独立公平硬币"。

日常类比：你在管理一家连锁便利店，每个门店的货架布局可以随总部掷硬币而变（今天多开一个冷藏柜，明天没有）。老式的"全国库存台账"要求不管哪个随机分支，A 区货架与 B 区货架永远不能重叠——一旦某个分支里两者恰好用了相邻编号，整本账就对不上。Amaryllis 换了一本按随机分支分页的台账：每一页里 A、B 的货架仍然两两不交；不同页之间编号可以不同。这样既能说"这两个货位上的商品是独立硬币决定的"，又能在"有时多分配一个货位"的程序里证明动态 malloc 的规格。

Amaryllis 区分两种"指向"断言：`L ↦ V`（确定性 points-to，按结果索引）和 `L ↝ μ`（概率 points-to，拥有值的分布）。前者不拥有分布所有权——这是与 frame 相容的关键设计——后者等价于 `∃V. L ↦ V * V ~ μ`。

论文全部结果已在 Rocq（原 Coq）中机械化，约 5 万行证明，提供 Iris 风格的 proof mode。

GPL 的 Hoare 三元组形如 `{P} e {V. Q(V)}`：这里 `e` 的语义是从输入状态分布到输出联合分布的映射；`P`、`Q` 是分布级断言（不是单个确定性状态）；`V` 是代表返回值的随机变量。这与经典 Hoare Logic 的关键区别：前置和后置描述的是"一堆可能状态的分布"，而不是"某一个确定状态"。一句话总结：经典 Hoare Logic 问"这个状态经过程序后变成什么状态"，Amaryllis 问"这个分布经过程序后变成什么分布"。

## 为什么重要

不理解 Amaryllis，很难解释：

- 为什么 Lilac / PSL 等通用概率逻辑（GPL）只能做不可变状态——frame 会"记住太多随机信息"，动态分配一出现，语义就崩
- 为什么 `ref (flip 0.5)` 这种"掷硬币决定分配几个堆块"的程序，在旧概率逻辑里证不出后置"两个指针各存独立公平硬币"
- 分离逻辑的 frame-preserving update、authoritative RA、wp 模态在概率语义下要改成什么才 sound——Iris 的资源代数不能直接搬到概率分布上
- 近年来概率分离逻辑的两条线（SPL 专用 vs GPL 通用）为何互不兼容——以及谁来统一

概率分离逻辑领域近年来分裂成两条路线：SPL（专用概率逻辑，如 Eris、Coneris）建在 Iris 上，支持并发、高阶 ghost state，但原生断言是误差积分/期望代价；GPL（通用概率逻辑，如 Lilac、Bluebell）用 `*` 表示独立、模态表示条件化，推理模块化，但不支持动态堆。两者各取所长、互不兼得。Amaryllis 第一次把 GPL 的分布推理能力搬上了 Iris 的动态堆。

## 核心要点

1. **独立即分离**：在概率分离逻辑里，`P * Q` 不仅是"P 和 Q 各自成立"，更重要的是"P 和 Q 描述的随机量相互独立"，联合概率是边际概率的乘积。类比：两枚硬币各掷一次 vs 共用一枚硬币掷两次——前者是 `X ~ Ber(1/2) * Y ~ Ber(1/2)`（独立），后者需要额外说"X = Y"（依赖）。这个洞见来自 PSL，Amaryllis 继承它并推广到动态堆：在 indexed valuation 下，分离合取要求概率部分独立（独立积 ⊛）、资源部分逐结果组合（堆无交并 ⊎）。

2. **按随机结果分页的堆（indexed valuation）**：Amaryllis 的核心创新——每个随机结果（硬币掷出的一张表）都有自己的一页堆。同一页内指针不交（经典分离逻辑不变），不同页之间堆形状可以完全不同。类比：就像多线程程序每个线程有自己的栈，但 Amaryllis 把"线程"换成了"随机结果"。这直接解决了 dfl 程序的困境：单次执行里两个指针总是不交的，只是跨结果聚合时地址池重叠。

3. **概率 frame-preserving update（PFP）**：仅有 Frame 规则不够——若已知"对每个确定的 b，f 把堆值 b 翻转成 !b"，要推到"初始值是公平硬币时，f 保持这种分布"，需要按硬币结果混合（c-lift）。但标准 Iris 的 update 在混合后会破坏可测性（"遗忘"事件，使条件化无意义）。Amaryllis 加强为 PFP update：除 frame 不变外，还要保证任何可能参与的条件化/加权混合仍然合法。在此之上重新定义的 wp 与条件化 `C` 可交换——这是 c-lift 和 Frame 同时成立的前提。

## 实践案例

### 案例 1：dfl — 动态分配为何需要 per-outcome 分离

论文程序 dfl 的 ML 风格写法：

```ocaml
let dfl =
  let _ = if flip 0.5 then Some (ref 0) else None in
  (ref (flip 0.5), ref (flip 0.5))
```

第一次 flip 为 0：先 ref 0，再 ref flip、ref flip，两指针可能是 (0x0, 0x1)。
第一次 flip 为 1：多一次分配，两指针可能是 (0x1, 0x2)。

在任意一次执行里，两个返回指针都不同。但把所有随机结果摊在一起看，X 的地址集合 {0x0,0x1} 与 Y 的 {0x1,0x2} 在 0x1 上相交。旧 GPL 模型要求全局固定的不相交位置集合，因此无法证明后置"X、Y 各持独立公平硬币且堆块分离"。Amaryllis 的 per-outcome 分离专门解决这个问题——同一分支内保证不交即可，不要求跨分支。

### 案例 2：条件化 + Frame 的推理链

用 Amaryllis proof mode 伪代码展示推理形状（与论文 Section 2 一致）：

```coq
(* 已知：对每个确定性 b，f 把 ℓ 的内容翻转 *)
Lemma f_spec_det (b : bool) :
  { ⌜ ℓ ↦ b ⌝ } f ℓ { ⌜ ℓ ↦ negb b ⌝ }.

(* 目标：ℓ 初始为公平硬币分布 *)
Goal { ℓ ↝ Ber 0.5 } f ℓ { ℓ ↝ Ber 0.5 }.
Proof.
  (* 概率 points-to 展开为条件化混合 *)
  apply mix_points_to.  (* ℓ ↝ μ ≡ C_{b←μ} ⌜ ℓ ↦ b ⌝ *)
  apply c_lift. intros b.
  apply f_spec_det.    (* 逐分支用确定性规格 *)
Qed.

(* 若有独立硬币 Y，Frame 不必重证 f *)
Lemma f_spec_framed :
  { Y ~ Ber 0.5 * ℓ ↝ Ber 0.5 }
    f ℓ
  { Y ~ Ber 0.5 * ℓ ↝ Ber 0.5 }.
Proof. apply frame. apply f_spec_goal. Qed.
```

推理形状：混合分布 → 条件化 → 逐分支用确定性规格 → Frame 挂独立资源。

### 案例 3：ref (flip q) 的组合规则

采样与分配可 bind 组合（论文 hoare-bind + alloc）：

```
{ true }          flip q         { V. V ~ Ber(q) }
{ V ~ Ber(q) }    ref V          { L. L ↦ V * V ~ Ber(q) }
──────────────────────────────────────────────────────────
{ true }          ref (flip q)   { L. L ↦ V * V ~ Ber(q) }
```

关键：`L ↦ V` 不拥有 V 的分布所有权，因此与上下文 frame 相容——别处持有 `V ~ Ber(q)` 的人不受影响。

## 踩过的坑

1. 旧 GPL 的"全局分区"模型在动态分配上语义证不出独立硬币——不是证明技巧问题，是语义定义本身要求所有可能堆形状共享一套固定地址分区。这个限制来自底层模型的设计，不是"忘了加一条规则"
2. Iris 的 frame-preserving update 搬到概率语义后，会因"遗忘"事件破坏可测性，导致 c-lift 规则失效——Amaryllis 的 PFP update 比标准 update 多一个条件（保持条件化合法性）。初看时容易低估这个差异：标准 update 在确定性逻辑里是 trivial 操作，搬到概率下却要重新证明
3. Authoritative RA 在概率下的 naive 编码有反例——authority 里 X 仍是公平硬币，分支里却断言 X=x 确定，矛盾来自 authority 未随条件化更新。修复需引入 `⊠` 模态和 `c-auth` 规则。这个 bug 的微妙之处在于：确定性逻辑里 authority 就是"全局真相"，概率下"全局真相"是多世界（分布）的——简单搬运会丢信息
4. Bluebell 用 fractional permission 部分缓解了动态分配问题，但针对的是静态变量 store，且 Frame 带重 side condition，模块化受损——Amaryllis 放弃了这条路，走向 indexed valuation。教训：不是所有问题都能用"加点 permission"解决，有时需要换底层模型
5. Amaryllis 的两类 points-to 断言（`L ↦ V` vs `L ↝ μ`）容易混淆——前者不拥有分布，后者拥有。初学时容易试图把 alloc 规格写成 `{True} ref V {L. L ↝ point_mass V}`，这会把 V 的分布所有权"吞"进 `↝`，导致 frame 不可用

## 适用 vs 不适用场景

**适用**：

- 证明动态分配程序里概率变量彼此独立——如 dfl 中两个 `ref (flip 0.5)` 的结果
- 需要在条件化下保持模块化推理——如先对 b 条件化、再 frame 无关的独立硬币
- 用分离逻辑框架做概率程序的端到端形式化验证——Iris 生态的用户
- 需要对程序的随机行为做"独立 vs 依赖"的精确区分——Amaryllis 是少数能直接在断言层面区分这两者的逻辑
- 已有 Iris 经验的团队想扩展到概率验证——Amaryllis 复用 Iris 的 proof mode，学习路径对 Iris 用户友好

**不适用**：

- 连续分布或非终止程序——Amaryllis 目前只支持离散分布、有限支撑、终止程序
- 并发程序——暂无 Iris 的 invariant / ghost state / step-indexing 全家桶
- 只想做简单概率推断不需要形式证明——Amaryllis 是 5 万行 Coq 的工程，适合定理证明场景而非快速原型
- 需要高阶 ghost state 或 invariant 来论证更复杂的程序——这些是 Probabilistic Iris 路线图的后续里程碑，Amaryllis 暂不支持
- 需要 step-indexing 来处理非终止/递归——Amaryllis 只覆盖终止程序，递归程序需要 paper 中讨论的 loop 规则（目前尚未正式给出）

## 历史小故事（可跳过）

这条时间线展示了一个反复出现的模式：理论突破 → 工程化（Iris 框架）→ 特殊化（SPL / GPL 各自发展）→ 再统一。Amaryllis 就是"再统一"这一步。

- 2012-2019：Iris 分离逻辑框架逐步成熟，提供资源代数、wp 模态、frame-preserving update 等标准组件，成为程序验证的基础设施
- 2019-2023：PSL → Lilac 这条线建立了 GPL 的核心思想：独立=`*`、条件化=`C` 模态，但只支持不可变状态，动态堆分配是禁区
- 2021-2024：Eris / ExpIris / Coneris 在 Iris 上建了专用概率逻辑（SPL），支持并发和动态堆，但原生断言是误差积分/期望代价，不直接谈"分布上的独立"
- 2024：Bluebell 尝试把 GPL 搬到 Iris 框架，但 store 是静态的，Frame 带重条件——走到半路，未能解决动态分配
- 2026：Amaryllis 补上最后一块拼图——动态堆 + indexed valuation + PFP update，第一次让 GPL 在 Iris 上"落地"。论文作者来自 MPI-SWS、CISPA 和康斯坦茨大学。值得注意的是，全部结果（~5 万行）在 Rocq 中机械化——这意味着每个定理都有机器可检查的证明，不是"纸上可信"而是"机器已验证"

## 学到什么

1. 概率下的资源所有权不能"全局一次性分好"——不同随机分支可能有不同的堆形状，语义需要按结果逐分量计算。"一个程序里可能有多种堆形状"不是 bug，是需要建模的正确行为
2. Frame 规则在概率下要额外保"独立"——`P * Q` 不仅是分治，还是概率独立；Frame 时挂上的资源必须与程序行为独立，否则 soundness 不保
3. 把确定性逻辑的 update 搬到概率语义不是 trivial 的——条件化会引入"遗忘事件"的危险，必须加强到 PFP update。这启示我们：概率推理的困难往往不在"随机"本身，而在随机和逻辑的组合爆炸
4. Amaryllis 是 Probabilistic Iris 的第一步而非终局——它还缺 step-indexing、concurrent invariant、高阶 ghost state（Iris 三大件），后续还需将这些逐步概率化

5. 形式化验证与概率的结合不只是"把 Hoare Logic 加上概率"——它需要重新审视资源的含义（ownership 在分布下还是 ownership 吗？）、Frame 是否保持独立、条件化与 update 是否可交换。每一步都是新的理论问题

## 延伸阅读

- [论文原文](https://arxiv.org/abs/2605.13765) — arXiv:2605.13765，正式发表于 2026
- [Amaryllis Rocq 仓库](https://gitlab.mpi-sws.org/FP/amaryllis) — ~5 万行 Coq 形式化，Iris proof mode 风格
- [[hoare-logic]] — 分离逻辑的前身，Hoare Logic 是程序证明的起点，理解它再看 Iris 会轻松很多
- Lilac（条件概率+独立积）— GPL 的直接前驱，先理解 Lilac 的 `C` 模态再看 Amaryllis 的 indexed valuation
- Iris 项目主页 — 分离逻辑框架与 Modal 程序逻辑，Amaryllis 是 Iris 生态的概率扩展
- Eris / Coneris — 同框架下的误差界并发扩展，代表 SPL 路线；与 Amaryllis（GPL 路线）互补
- [[cousot-abstract-interpretation]] — 抽象解释是另一种程序分析方法，理解它对"什么性质可以自动推导"有启发

## 关联

- [[hoare-logic]] — Hoare Logic 是分离逻辑的起点，Amaryllis 在其概率扩展上构建
- [[linear-types]] — 线性类型和分离逻辑共享"资源不能复制/丢弃"的核心直觉
- [[cousot-abstract-interpretation]] — 抽象解释是程序分析的另一个理论基础，和分离逻辑的思路互补
- [[boogie-2005]] — Boogie 是中间验证语言，和 Iris 类似提供验证后端，对比可理解验证中间层的设计空间
- [[lambda-calculus]] — λ-演算是程序语言理论的共同基础，Amaryllis 的证明对象也是 λ-演算项的概率扩展
- [[system-f-reynolds-1974]] — System F 引入参数多态，Iris/Amaryllis 处理的是另一种"多态"——概率分布的多态
- [[stainless-2017]] — Stainless 用类型系统做 Scala 验证，和 Amaryllis（基于逻辑的验证）走不同路线，对比可理解验证的两大范式

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
