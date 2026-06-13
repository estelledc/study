---
title: First Steps Towards Probabilistic Iris (Amaryllis)
来源: 'Janine Lohse, Tim Rohde, Jimmy Xin, Niklas Mück, Iona Kuhn, Derek Dreyer, Deepak Garg, Emanuele D''Osualdo, "First Steps Towards Probabilistic Iris: Harmonizing Independence, Conditioning, and Dynamic Heap Allocation", arXiv:2605.13765, MPI-SWS / CISPA / Konstanz, 2026'
日期: 2026-06-13
子分类: 形式化验证
分类: 形式化方法
provenance: pipeline-v3
---

## 是什么

**Amaryllis** 是走向 **Probabilistic Iris** 的第一块正式基石：一个在 **Iris 分离逻辑框架** 上构建的 **通用概率程序逻辑（GPL, General-Purpose Probabilistic Logic）**，同时支持：

- 对程序状态上的 **概率分布** 做原生断言（而不只是误差界、期望复杂度等「专用性质」）；
- **独立性** 与 **条件化（conditioning）** 的模块化推理；
- **动态堆分配** 与 Iris 风格的 **资源代数（resource algebra）** 所有权。

日常类比：想象你在管理一家 **连锁便利店**，每个门店的货架布局可以随总部掷硬币而变（今天多开一个冷藏柜，明天没有）。老式的「全国库存台账」要求：不管哪个随机分支，**A 区货架编号集合** 与 **B 区货架编号集合** 永远不能重叠——一旦某个分支里 A、B 恰好用了相邻编号，整本账就对不上。Amaryllis 换了一本 **按随机分支分页的台账**：每一页（每个硬币结果）里，A、B 的货架仍然 **两两不交**；不同页之间编号可以不同。这样既能说「这两个货位上的商品是独立硬币决定的」，又能在「有时多分配一个货位」的程序里证明 **动态 malloc** 的规格。

论文全部结果已在 **Rocq**（原 Coq）中机械化，并提供 Iris 风格的 proof mode；代码见 [gitlab.mpi-sws.org/FP/amaryllis](https://gitlab.mpi-sws.org/FP/amaryllis)。

## 为什么重要

近几年概率分离逻辑分成两条线，长期 **各取所长、互不兼得**：

| 类型 | 代表 | 强项 | 弱项 |
|------|------|------|------|
| **SPL**（专用概率逻辑） | Eris、ExpIris、Coneris、Clutch-DP | 建在 Iris 上，支持高阶状态、并发、ghost state | 原生断言是误差积分、期望代价等，不直接谈「分布上的独立/条件」 |
| **GPL**（通用概率逻辑） | PSL、Lilac、Bluebell、pcOL | `*` 表示独立，模态表示条件化，推理模块化 | **不支持动态堆**；多数未在证明助手中完整形式化 |

Amaryllis 第一次让 GPL 的三板斧——**独立 = 分离合取**、**条件化模态**、**Frame 规则**——与 **指针堆上的 `ℓ ↦ v`** 共存。不理解它，很难解释：

- 为什么 Lilac 只能做 **不可变** 状态（frame 会「记住太多随机信息」）；
- 为什么「全局要求堆区域不交」会在 `ref (flip())` 这类程序上 **语义上证不出** 两个独立硬币；
- Iris 的 **frame-preserving update**、**authoritative RA**、**wp 模态** 在概率下要改成什么才 sound。

## 核心概念

### 1. GPL 的判断形式

GPL 的 Hoare 三元组形如 `{P} e {V. Q(V)}`：

- `e` 的语义：输入 **状态分布** → 输出 **(状态, 返回值)** 的联合分布；
- `P`、`Q` 是 **分布级断言**，不是单个确定性状态；
- `V` 是代表返回值的 **随机变量**。

例：`{X ~ Ber(1/2)} e {V. V ~ Ber(1/2)}` 表示：若初始时 `X` 是公平硬币，则 `e` 的返回值也是公平硬币（可能还依赖 `X`，此处未要求独立）。

### 2. 独立即分离（Independence as Separation）

PSL 的关键洞见：`P * Q` 不仅说 `P` 和 `Q` 各自成立，还说它们描述的随机量 **独立**，且联合概率是边际概率的乘积。

例：`X ~ Ber(1/2) * Y ~ Ber(1/2)` ⇒ 看到 `(X,Y)=(v,w)` 的概率 = P(X=v)·P(Y=w)。

由此得到熟悉的 **Frame 规则**：证明 `{P} e {V. Q(V)}` 后，可在前置中「挂上」与 `e` 无关的独立资源 `R`，得到 `{P * R} e {V. Q(V) * R}`，无需重证 `e`。

### 3. 条件化模态（Conditioning Modality）

仅有 Frame 不够。若已知 `{⌜ℓ ↦ b⌝} f(ℓ) {⌜ℓ ↦ ¬b⌝}`（对 `b∈{0,1}` 逐分支成立），想推出 `{ℓ ↝ Ber(1/2)} f(ℓ) {ℓ ↝ Ber(1/2)}`，需要把两个分支 **按 1/2 混合**——这是 **outcome locality**。

Lilac 用 **条件化模态** `C_{x←μ} P(x)` 表达：存在分布为 `μ` 的隐变量 `X`，使得对每个 `v∈supp(μ)`，在 **条件分布** `·|_{X=v}` 下 `P(v)` 成立。混合断言 `P ⊕_q Q` 可视为 `C_{b←Ber(q)} ⌜…⌝` 的特例。

Amaryllis 直接沿用这一思路，并证明 **条件化与 wp/update 可交换**（在加强的 frame 意义下）。

### 4. 动态分配的根本障碍

旧 GPL 模型里，`μ ⊨ P * Q` 往往要求：存在 **全局固定** 的不相交位置集合 `L₁,L₂`，使得整个分布上 `P` 只碰 `L₁`、`Q` 只碰 `L₂`。

考虑论文中的程序 `dfl`（概念见下文代码示例）：

- 第一次 `flip` 为 0：堆上先 `ref 0`，再 `ref flip`、`ref flip`，两指针可能是 `(0x0, 0x1)`；
- 第一次 `flip` 为 1：多一次分配，两指针可能是 `(0x1, 0x2)`。

**在任意一次执行里**，两个返回指针都不同；但 **把所有随机结果摊在一起看**，`X` 可能取到的地址集合 `{0x0,0x1}` 与 `Y` 的 `{0x1,0x2}` 在 `0x1` 上 **相交**。旧模型因此 **无法** 证明后置「`X`、`Y` 各持独立公平硬币且堆块分离」——这不是证明技巧问题，是 **语义定义** 的问题。

Bluebell 用 fractional permission 部分缓解，但针对 **静态** 变量 store，且 Frame 带重 side condition，模块化受损。

### 5. Indexed Valuation：按结果分支的分离

Amaryllis 的解法是 **indexed valuation** 风格的概率资源：

- 固定 **随机选择标识** `Rid`，结果空间 `Ω = Rid → Bool`（抽象记录「至今掷了哪些硬币、结果如何」）；
- 概率资源 = `(𝒫, R)`：`𝒫` 是 `Ω` 上的概率空间；`R : Ω → M` 是 **随机资源变量**，在每个结果 `ρ` 上给出底层资源代数 `M` 中的一个元素（例如堆 `h(ρ)`）。

**分离合取** 在 `(𝒫₁,R₁)` 与 `(𝒫₂,R₂)` 上：

- 概率部分用 Lilac 的 **独立积** `𝒫₁ ⊛ 𝒫₂`（编码独立性）；
- 资源部分 **逐结果** 组合：`∀ρ. R₁(ρ) · R₂(ρ)`（例如堆的无交并 `⊎`）。

于是 **不同随机分支可以有不同的堆形状**；在同一分支 `ρ` 内仍要求指针域不交。这正是 `dfl` 所需。

### 6. 两种「指向」断言

Amaryllis 区分：

- **`L ↦ V`**（确定性 points-to）：对每个可能结果 `ρ`，`L(ρ)` 在 `R(ρ)` 拥有的堆中且值为 `V(ρ)`；**不** 断言拥有 `L` 或 `V` 的 **分布**（否则与历史随机选择相关，破坏 frame）。
- **`L ↝ μ`**（概率 points-to）：`∃V. L ↦ V * V ~ μ`，且在每个分支上 `V` 在 `𝒫` 中可测且分布为 `μ`。

分配规则 `{True} ref V {L. L ↦ V}` 对 **随机表达式变量** `V : Ω → Expr` 成立；子表达式 `ref (flip q)` 可先 bind `flip` 再 alloc。

### 7. 概率 Frame-Preserving Update（PFP）

标准 Iris 的 update `P ⇝ Q` 只要求 **frame 不变**。在概率 + 条件化下，有些 frame-preserving update 会 **破坏可测性**（「遗忘」事件，使条件化 `C_{x←μ}` 无意义），从而 **条件化 lift 规则失效**。

Amaryllis 加强为 **PFP update**：除 frame 外，还要保持 **任意可能参与的条件化/加权混合** 仍然合法。关键结论：

- 底层堆上的 mutation、动态 allocation 可提升为 PFP；
- 从分布 **再采样** 是对概率空间分量的 PFP update。

在此之上重新定义 **wp**，并证明 **wp 与 `C` 交换**，Frame 与 **c-lift**（条件化 lift）同时成立。

### 8. Authoritative RA 在概率下的再解释

Iris 用 `Auth(M)`：`• g`（全局权威）+ `◦ a`（局部 fragment），fragment 必须是 authority 的子资源。

Amaryllis 在 `PSpAuth_M` 上复刻这一结构，但 **authority 不再表示「绝对全局分布」**，而是 **相对当前条件分布的全局视图**。原 Bluebell 的 `P * C_{v←μ} Q(v) ⊢ C_{v←μ}(P * Q(v))` 在 naive 编码下 **有反例**（authority 里 `X` 仍是公平硬币，分支里却断言 `X=x` 确定）。

修复引入：

- **`⊠ P` 模态**：可 frame 进条件化的 fragment 包装，**不能** 包装 authority；
- **`c-auth` 规则**：在条件化下把 authority 更新为 `g|_{X=v}`，与分支一致。

### 9. 与 Probabilistic Iris 路线图的关系

Amaryllis 是 **第一步**，不是终局。论文 **刻意限制**：

- 只考虑 **终止** 程序、**离散** 分布、**有限支撑**；
- 暂无 step-indexing、高阶 ghost state、并发/invariant（标准 Iris 全家桶）；
- 机械化约 **5 万行** Rocq。

长期目标 **Probabilistic Iris**：SPL 的表达力（Eris 误差积分、ExpIris 期望代价…）与 GPL 的分布推理 **合一**。

## 实践案例

### 案例 1：`dfl` — 动态分配为何需要 per-outcome 分离

论文 Program (3) 的 ML 风格写法：

```ocaml
(* dfl：第一次 flip 决定是否多分配一个 cell *)
let dfl =
  let _ =
    if flip 0.5 then Some (ref 0) else None
  in
  (ref (flip 0.5), ref (flip 0.5))
```

Amaryllis 中期望证明的三元组（示意）：

```text
{ True }
  dfl
{ (X, Y). X ↝ Ber(1/2) * Y ↝ Ber(1/2) }
```

读法：返回的一对堆指针 `X`、`Y` 在各随机分支内 **不同单元**，且各自存储的值是 **独立** 公平硬币。

用 Python **模拟** 旧模型为何失败（教学用，非论文实现）：全局要求「X 只使用地址集合 Lx、Y 只使用 Ly 且 Lx ∩ Ly = ∅」。

```python
from collections import defaultdict
import random

def run_dfl(rng):
    """返回 (addr_x, addr_y, val_x, val_y)"""
    addrs = []
    if rng.random() < 0.5:
        addrs.append(id(object()))  # ref 0 占位
    a = id(object())
    b = id(object())
    return a, b, rng.random() < 0.5, rng.random() < 0.5

xs, ys = set(), set()
for _ in range(2000):
    rng = random.Random()
    ax, ay, _, _ = run_dfl(rng)
    xs.add(ax)
    ys.add(ay)

# 旧「全局分区」模型：要求所有运行中 X 的地址与 Y 的地址集合不交
print("X 可能地址数:", len(xs))
print("Y 可能地址数:", len(ys))
print("全局交集非空?", bool(xs & ys))  # 通常为 True → 无法分区
```

单次运行里 `ax != ay` 几乎总是成立；但 **跨所有随机结果** 聚合时，地址 ID 池重叠——这正是 indexed valuation 要分开处理的对象。

### 案例 2：独立、条件化与 Frame — 伪 Coq / 逻辑片段

下面用 **接近 Amaryllis proof mode 的伪代码** 展示「先条件化再 frame 独立变量」的推理链（与论文 §2.1–2.6 一致）：

```coq
(* 已有模块 f 的规格：对每个确定性 b，ℓ 存 b 则 f 把 ℓ 翻转为 ¬b *)
Lemma f_spec_det (b : bool) :
  { ⌜ ℓ ↦ b ⌝ } f ℓ { ⌜ ℓ ↦ negb b ⌝ }.

(* 目标：ℓ 初始为公平硬币分布 *)
Goal { ℓ ↝ Ber 0.5 } f ℓ { ℓ ↝ Ber 0.5 }.
Proof.
  (* Step 1: 把概率 points-to 展开 *)
  unfold "↝". intros [V Hv]. exists V. split; [exact Hv | ].
  (* Step 2: ℓ ↝ μ 等价于 C_{b←Ber(0.5)} ⌜ ℓ ↦ b ⌝ 的混合 *)
  assert (Hmix : ℓ ↝ Ber 0.5 ⊣⊢ C_{b ← Ber 0.5} (⌜ ℓ ↦ b ⌝)).
  { apply mix_points_to. }
  rewrite Hmix.
  (* Step 3: c-lift — 对每个分支用 f_spec_det *)
  apply c_lift. intros b.
  apply f_spec_det.
Qed.

(* 若另有独立硬币 Y，Frame 不必重证 f *)
Lemma f_spec_framed :
  { Y ~ Ber 0.5 * ℓ ↝ Ber 0.5 } f ℓ { Y ~ Ber 0.5 * ℓ ↝ Ber 0.5 }.
Proof.
  apply frame. apply f_spec_goal. (* 上面 Goal 的证明 *)
Qed.
```

真实 Rocq 开发中，断言、模态与 `c_lift` / `frame` 的名称来自 Amaryllis 库；此处强调 **推理形状**：**混合分布 → 条件化 → 逐分支用确定性规格 → Frame 挂独立资源**。

### 案例 3：`ref (flip q)` 的组合规则

分配与采样可 **bind** 组合（论文 hoare-bind + alloc）：

```text
{ true }                    flip q           { V. V ~ Ber(q) }
{ V ~ Ber(q) }              ref V            { L. L ↦ V * V ~ Ber(q) }
────────────────────────────────────────────────────────────────────
{ true }                    ref (flip q)     { L. L ↦ V * V ~ Ber(q) }
```

第二行里 `L ↦ V` **不** 拥有 `V` 的分布所有权，因此与上下文 frame 相容；第三行若初始就拥有 `V ~ Ber(q)`，Frame 可把 `V ~ Ber(q)` 带进后置。

## 与相关工作的关系

| 工作 | 与 Amaryllis 的关系 |
|------|---------------------|
| **PSL / Lilac / Bluebell / pcOL** | GPL 前辈；Amaryllis 继承独立=`*` 与 `C` 模态，替换底层分布模型 |
| **Iris / iCAP** | 资源代数、wp、update、Auth；Amaryllis 证明 PFP 版仍 sound |
| **Eris / ExpIris / Coneris** | Iris 上的 SPL；谈误差积分/期望代价，不替代 GPL 的分布断言 |
| **pRHL / coupling** | 另一类概率 relational 推理；Iris 扩展曾用 coupling，Amaryllis 走 GPL 路线 |
| **Infer / 经典分离逻辑** | 确定性堆 `ℓ↦v`；Amaryllis 的 `L↦V` 是其按结果索引的随机泛化 |

## 局限与批判性阅读

1. **范围**：无并发、无高阶 ghost、无 step-indexing——离「完整 Probabilistic Iris」仍有距离。
2. **离散 + 终止**：连续分布、几乎必然终止的 unbounded loop 需另做规则（论文讨论部分规则会失效）。
3. **工程成本**：~50K LOC 机械化，阅读门槛高；零基础应先掌握 Iris 与 Lilac 再深入。
4. **Authority 语义变更**：`⊠` 与 `c-auth` 修复 soundness，但增加了证明义务——与 Bluebell 的 `c-frame-bb` 不可直接照搬。
5. **非堆资源**：理论对任意 ORA 参数化，但论文示例以堆为主；其他 ghost 资源需实例化验证。

## 自测题

1. SPL 与 GPL 在「断言对象」上的根本区别是什么？Amaryllis 属于哪一类？
2. 用一句话说明：为何 `{True} dfl {(X,Y). …}` 在「全局堆分区」模型下语义不成立？
3. `L ↦ V` 与 `L ↝ μ` 在 **所有权** 上差在哪？为何 alloc 规格不能写成只含 `↝`？
4. 标准 frame-preserving update 为何不足以支持 `C`-lift？PFP 多要求了什么？
5. Amaryllis 尚未包含 Iris 的哪三个大型特性？（论文 Non-goals 段）

## 延伸阅读

- arXiv:2605.13765 — 原文 HTML/PDF
- [Amaryllis Rocq 仓库](https://gitlab.mpi-sws.org/FP/amaryllis)
- Lilac（条件概率 + 独立积）— GPL 的直接前驱
- Iris 项目主页 — 分离逻辑框架与 Modal 程序逻辑
- Eris / Coneris — 同框架下的误差界并发扩展，对比 SPL 路线

## 一句话总结

**Amaryllis = 把 Iris 的资源代数「按硬币结果分页」，让独立（`*`）与条件化（`C`）在每一页里仍像经典分离逻辑那样工作，从而第一次在 GPL 里合法谈论 `ref (flip())` 与动态堆上的独立硬币。**
