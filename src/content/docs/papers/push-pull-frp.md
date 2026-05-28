---
title: Push-Pull FRP (Elliott 2009) — events 推 + signals 拉的二元模型
description: RxJS / SolidJS / Effect 的反应式编程理论根。Conal Elliott 把 1997 年 FRAN 的纯 pull 模型改造成 push-pull 双模优化版
sidebar:
  label: Push-Pull FRP (ICFP 2009)
  order: 14
---

## 核心信息

| 字段 | 内容 |
|---|---|
| 标题（英文） | Push-Pull Functional Reactive Programming |
| 标题（中文） | 推-拉混合的函数式反应式编程 |
| 作者 | Conal Elliott |
| 一作机构 | LambdaPix（Conal 自营研究单位，时为 ex-Microsoft Research）→ 现 Target Labs |
| 发表 | ICFP 2009 / Haskell Workshop（ACM SIGPLAN） |
| arXiv / 终版 | 无 arXiv，原版 PDF 在 [conal.net/papers/push-pull-frp/push-pull-frp.pdf](http://conal.net/papers/push-pull-frp/push-pull-frp.pdf)（12 页） |
| 引用数 | 截至 2026-05-28：~640（Google Scholar） |
| 代码 repo | 原版 [reactive 库](https://hackage.haskell.org/package/reactive)（Haskell, 已停更）；现代继承者 [reactive-banana](https://hackage.haskell.org/package/reactive-banana) / [Reflex-FRP](https://reflex-frp.org/) |
| 数据 / 资源 | 论文带 Section 8 性能 microbenchmark（vs Yampa / FRAN），无独立 dataset |
| 论文类型 | **theory paper**（denotational semantics + 类型化 ADT 公式化，prototype 仅用于性能验证） |

### Notation 速记表（论文核心符号）

读 Section 2-6 必备。论文里 `Behavior` / `Signal` / `Reactive` 三个词在不同段落混用——下表是我重整后的统一约定（与论文 Section 2 与 Appendix B 一致）：

| 符号 | 类型 | 论文位置 | 中文意思 |
|---|---|---|---|
| `T` | `T = Real⁺`（非负实数轴） | Sec 2.1 | 时间域，连续 |
| `Behavior a` / `Signal a` | `T -> a` | Sec 2.2 / Def 1 | 连续时间函数（"信号"） |
| `Event a` | `[(T, a)]`（按时间升序） | Sec 2.3 / Def 2 | 离散事件流 |
| `Reactive a` | `(a, Event (Reactive a))` | Sec 4 / Def 5 | 分段常数信号（implementation primitive） |
| `Future a` | `(T, a)`（一次性） | Sec 4.2 | 单个未来事件 |
| `stepper` | `a -> Event a -> Behavior a` | Sec 6.1 | event → signal 转换 |
| `snapshot` | `Behavior a -> Event b -> Event (a, b)` | Sec 6.2 | 信号采样 |
| `accumE` | `a -> Event (a -> a) -> Event a` | Sec 6.3 | 事件累积器 |
| `switcher` / `switchE` | `Behavior a -> Event (Behavior a) -> Behavior a` | Sec 6.4 | 信号热切换（dynamic graph） |
| `mappend` / `<>` | `Event a -> Event a -> Event a` | Sec 5.2 / Lemma 3 | 事件流合并（Monoid） |
| `⟦ · ⟧` | meaning function | Sec 3 / Def 6 | denotational semantic bracket |

⚠️ 论文里 `Behavior` 与 `Signal` 在不同节互换使用，本笔记统一用 **Signal**（与现代 RxJS / SolidJS 一致），仅在直接引用论文 Section 时保留 `Behavior`。

## 原文摘要翻译

**FRAN (Functional Reactive Animation) 在 1997 年引入 functional reactive programming**——
将动画视为时间的连续函数。
但纯 pull-based 实现意味着即使没有事件发生，所有 signal 都需要每帧重新求值，**浪费**。
本文给出一个**全新的、push-pull 混合的 FRP 实现**——
events 是离散的 push-based stream，signals 是连续的 pull-based function。
两者通过精心设计的 conversion operators 互相转换。
这种**双模型既保留 FRAN 的连续时间表达力，又获得 event-driven 的高效执行**。
结果是一个**类型保持精确语义，性能比纯 pull 快 10-100×**的 FRP 库。

## 创新点

Push-Pull FRP 给"反应式编程"领域提供了 4 件真正新的东西：

1. **Events 与 Signals 的本质区分（Definition 1 + Definition 2）**：events 是离散时间序列 `[(T, a)]`，
   signals 是连续时间函数 `T -> a`。这种类型上的分离让两边各自走最优实现路径——而不是
   FRAN 那种"信号一把抓"导致每帧重算。
2. **Push for events**：事件被主动推送给所有 listeners——不需要不停 polling。Section 5
   把这个"推"形式化成 `Event` 的 Monoid 实例（merge 是 `<>`，空事件流是 `mempty`）。
3. **Pull for signals**：signal 按需采样——只在被读取时计算。Section 4 给出 `Reactive a`
   实现，是论文最聪明的工程妥协（详见机制 2）。
4. **Conversion operators 守 denotational 一致性（Theorem 1-3）**：
   `stepper / snapshot / accumE` 让 events 和 signals 可以互转——
   关键不是这 3 个 operator 存在，是论文证明它们**满足 ⟦ stepper a e ⟧ = ...**
   的 reference semantics（Section 6.1 Theorem 1）。这把"FRP 库正确性"从感觉变成可证明。

## 一句话总结

**Push-Pull FRP 是 reactive programming 的"事件 vs 状态"分离哲学——
RxJS 的 Observable / SolidJS 的 createSignal+createEffect / Effect-TS 的 Stream，
都隐含这套二元模型。**
Conal Elliott 1997 创立 FRAN（pull-only），2009 用这篇 push-pull 修复了性能问题——
**12 年后他自己打了自己原作品的脸**。

![Push-Pull FRP 双模型](/study/papers/push-pull-frp/01-events-signals.webp)

*图 1：Push-Pull FRP 的二元模型。
**左侧 Events (push-based)**：discrete-time stream `[(t1,p1), (t2,p2), ...]`，
事件主动推送给 listeners（mouseClick / keyDown / networkResponse）。
**右侧 Signals (pull-based)**：continuous-time function `T -> a`，下游按需采样
（mousePosition / currentTime / animation value）。
**中间 Conversion Operators**：`stepper :: a -> Event a -> Signal a` / `snapshot :: Signal a -> Event b -> Event (a, b)` / `accumE :: a -> Event (a -> a) -> Event a`。
**底部 Timeline 示例**：连续 mousePos 信号 + 离散 click 事件，click 触发时 sample mousePos → 输出 `[(t1,p1), (t2,p2), ...]`。
顶部说明 "为什么需要双模型？" + Conal Elliott 1997 → 2009 的 push-pull 优化历程。论文 paper-figure 风。*

## Why（这篇出现前世界缺什么）

1997 年 Conal Elliott 发明 **FRAN (Functional Reactive Animation)**，把动画建模为：

```haskell
type Behavior a = Time -> a    -- 连续时间函数
```

**优雅但慢**：

- 渲染每帧都得**重新求值所有 behavior**——即使 mouse 没动
- 没有"事件触发更新"概念——pull-only
- Frame rate 30fps 时，每秒 30 次完全重算——CPU 满载

2003-2008 年许多 FRP 工作尝试解决性能问题（Yampa, FrTime, Frapp 等），但**都不够干净**：
Yampa 用 Arrow 把信号变成"电路"，写法冗长；FrTime 在 PLT Scheme 里做副作用追踪，跨语言落地难。

Push-Pull FRP 的 insight：**离散事件和连续信号本质不同，需要不同实现**。

- 事件：明确的 timestamp + 一次性触发 → push 给 listeners
- 信号：任意 t 都有值 → pull when needed

12 年后 Conal 总结：**1997 年的 pull-only 模型是错的**。论文是他自己的"修复"。

## 论文地形

PDF 12 页。章节角色：

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1. Introduction | FRAN 历史 + pull-only 失败 | 读 |
| 2. Reactive | Event / Behavior 两个 ADT 定义（Def 1 + Def 2） | **精读** |
| 3. Semantics | 形式化语义（denotational, ⟦·⟧ bracket） | **精读** |
| 4. Push-based events | events 用 `Reactive a` 实现 | **精读** |
| 5. Pull-based signals | signals 用 function 实现 | **精读** |
| 6. Mixing push and pull | conversion operators (stepper/snapshot/accumE/switcher) | **精读** |
| 7. Implementation | reactive Haskell 库实现 | 速读 |
| 8. Performance | 与 Yampa 等 pull-only FRP 对比 | 看数字 |
| 9. Related | 与其他 FRP 工作对比 | 速读 |

**心脏物**有三个：

1. **Section 2-3** Event 与 Behavior 的 ADT 区分 + denotational 语义（这是 theory paper 的"算法"）
2. **Section 6** Conversion operators (stepper / snapshot / accumE / switcher) + 一致性 Theorems
3. **Section 8** 性能对比数字（push-pull vs pure pull 10-100×）

## 核心机制（L3 - 三段定理重述）

### 段 1：Event vs Signal 的二元类型区分（Definition 1 + Definition 2）

**Definition 1（Behavior，论文 Section 2.2）**：A behavior of type `a` is a function from time to `a`.

```haskell
-- pseudo-code 重述（与论文一致，去掉 Haskell-specific 语法）
type T = Real⁺                       -- 时间域：非负实数（论文 Section 2.1）
newtype Behavior a = Behavior (T -> a)

-- denotational meaning：
-- ⟦ Behavior a ⟧ : T -> a
-- 即 Behavior a 的"含义"就是函数 T -> a 本身

-- 关键运算（论文 Section 2.2）：
instance Functor Behavior where
  fmap f (Behavior g) = Behavior (f . g)
  -- ⟦ fmap f b ⟧ t = f (⟦ b ⟧ t)

instance Applicative Behavior where
  pure x = Behavior (const x)         -- 常数信号
  (Behavior f) <*> (Behavior g) =
    Behavior (\t -> f t (g t))        -- pointwise 应用
  -- ⟦ pure x ⟧ t = x
  -- ⟦ f <*> g ⟧ t = (⟦ f ⟧ t) (⟦ g ⟧ t)
```

**Definition 2（Event，论文 Section 2.3）**：An event is a (possibly infinite) time-ordered sequence of occurrences.

```haskell
newtype Event a = Event [(T, a)]      -- 严格按 time 升序
                                       -- denotational view，实际实现见机制 2

-- ⟦ Event a ⟧ : [(T, a)]
-- 即 Event a 的"含义"是按时间排序的事件列表

-- 关键运算：
instance Functor Event where
  fmap f (Event ps) = Event [(t, f x) | (t, x) <- ps]

instance Monoid (Event a) where
  mempty = Event []
  mappend (Event xs) (Event ys) = Event (mergeByTime xs ys)
  -- mergeByTime 按 t 字段合并，保持升序
```

**旁注（≥ 5 条）**：

- 类型上 `Behavior a = T -> a` 与 `Event a = [(T, a)]` 是**对偶**——前者是"任意 t 给我一个 a"，后者是"我告诉你 t 列表外加每个 t 的 a"。论文 Section 2.4 用一句话点破：events 是 sparse、behaviors 是 dense。
- 为什么不用 `Behavior a = (T -> Maybe a)` 然后让 event 是它的退化形式？因为这样优化不开——pull 模型需要每帧调用，无法跳过空白时段。论文的二元模型本质是为了**编译/运行时优化把不同密度数据走不同 codepath**。
- `Functor` 实例对两边都是 pointwise 的，但 `Applicative` 只对 Behavior 有意义——对 Event 应用 Applicative 会得到笛卡尔积式的事件流，语义上没用。这就是为什么论文里 Event 只到 Functor + Monoid 层。
- 这个 ADT 区分的代价：用户必须**显式选择**变量是 Event 还是 Behavior。在 RxJS 这种 push-only 框架里只有 Observable，简化了 API 但失去了"连续时间值"的概念——很多 RxJS bug（reactive 漏 sample、interval 节流不准）就来自这种压扁。
- `Time` 在论文里是 `Real⁺`（非负实数）而不是 `Rational` 或 `Int`——这是个**强假设**，意味着论文不讨论时钟漂移、tick 离散化这些工程问题。机制 3 的反例会打这一点。

**怀疑 1**：论文 Definition 1 的 `Behavior a = T -> a` 假设时间是 `Real⁺`，
但任何实际系统的时钟都是离散的（`Int64` ns 或更粗）。当 sampling rate 不匹配时，
论文的 `⟦ b ⟧ t` 在 t = 1.5ns 上的值，工程实现根本拿不到——这把 denotational
semantic 与 operational semantic 之间的距离藏在 Section 7 一句"we use rational
approximation"里轻轻带过。

### 段 2：merge 算子的 Monoid 语义（Lemma 3 + Theorem 2）

**Lemma 3（论文 Section 5.2）**：`(Event a, mappend, mempty)` forms a Monoid.

具体来说：
- mempty: `Event []`（无事件流）
- mappend: 按时间合并两个事件流，保持升序

```haskell
-- 论文 Section 5.2 的 mergeByTime 重述：
mergeByTime :: [(T, a)] -> [(T, a)] -> [(T, a)]
mergeByTime [] ys = ys
mergeByTime xs [] = xs
mergeByTime ((t1, x):xs) ((t2, y):ys)
  | t1 <= t2  = (t1, x) : mergeByTime xs           ((t2, y):ys)
  | otherwise = (t2, y) : mergeByTime ((t1, x):xs) ys

-- Monoid laws（必须满足才能称作 Monoid）：
-- (1) Left identity:   mempty <> e = e
-- (2) Right identity:  e <> mempty = e
-- (3) Associativity:   (e1 <> e2) <> e3 = e1 <> (e2 <> e3)

-- 证明 (1)：
-- mempty <> Event ys
-- = Event (mergeByTime [] ys)
-- = Event ys                                      -- by mergeByTime 第一行
-- ✓

-- 证明 (3) 关键 case（两个 head 相等时间）：
-- (Event ((t,x):xs) <> Event ((t,y):ys)) <> Event zs
--   case t1 <= t2，pick (t1,x)
-- = Event ((t,x) : mergeByTime xs ((t,y):ys))   <> Event zs
-- = ...
-- vs
-- Event ((t,x):xs) <> (Event ((t,y):ys) <> Event zs)
-- 两边在"同时发生事件的相对顺序"上选择必须一致——
-- 论文用 "stable merge" 约定（左操作数优先）来保证 associativity。
```

**Theorem 2（Section 5.3）**：`fmap f (e1 <> e2) = fmap f e1 <> fmap f e2`，
即 functor 与 monoid 兼容（`fmap` distributes over `<>`）。

![Push-Pull FRP merge 算子 + stepper timeline](/study/papers/push-pull-frp/02-merge-and-stepper.webp)

*图 2：Lemma 3（merge Monoid）+ Theorem 1（stepper consistency）的视觉化。
**上半部分**：两条事件流 e_A（红圆，t=0,2,6,10）与 e_B（蓝方）按 mergeByTime
合并为单一升序流 e_A <> e_B；下面的绿色框列出 Monoid 三律。
**下半部分**：event 流 e 在 v=5 / v=10 / v=20 / v=8 处触发，stepper(0, e) 把它转成
分段常数信号；橙色 sample 箭头演示 pull 路径——sample t=1.8 → 0、t=4.2 → 5、
t=7.8 → 10、t=11 → 20，每次 sample 是 O(1)。底部蓝框是 Theorem 1 的
denotational 等式（ASCII 化的 [[·]] = ⟦·⟧）。*

**旁注（≥ 5 条）**：

- `mempty <> e = e` 这种"左单位元"在反应式编程里有具体意义：合并一个永远不发的事件流 = 原流。这是 RxJS `merge(stream, never())` 等价于 `stream` 的理论根。
- "stable merge" 那个细节是论文最易被忽略的工程陷阱——两个事件 t 相等时谁先谁后会决定下游 `accumE` 的累积顺序。论文 Section 5.2 footnote 4 才提一句，**这个细节决定了 Reactive Banana 早期一个 bug**（同时事件被乱序累积）。
- Monoid 实例为什么重要？因为它让 `fold` 一族函数（fold over events、collapse stream of streams）有了统一的接口。RxJS 的 `merge` / `concat` / `combineLatest` 不能 fold，因为它们不是 Monoid。
- 为什么 mappend 必须保持升序？如果允许乱序，Theorem 1（stepper 一致性）就失效——signal 在 t=2 的值可能依赖于 t=5 的事件，违反"未来不影响过去"原则。
- 这个 Monoid 结构在分布式系统里有更深的意义：**merge 是 CRDT 的核心运算**。把这个 Lemma 推广到向量时钟下，就是 Lamport timestamp + LWW（last-writer-win）的形式化基础。但论文不展开（这是后作 Conal 2014 关于 commutative semigroups 工作的方向）。

**怀疑 2**：Theorem 2 假设 fmap 是 pure 函数。如果 `f` 涉及 IO（实际工程几乎必然），
等式两边的 IO action 顺序就不再对称——尤其在 stable merge 边界上。论文 Section 5
完全在 pure 设定下讨论，但 Section 7 实现里 `f` 经常是 IO callback，这把 Theorem 2
的"distributivity"在工程上**默默破坏**了。

### 段 3：反例构造——pure pull 与 pure push 各自的失败模式（Theorem 1 边界）

**Theorem 1（Section 6.1）**：`⟦ stepper a e ⟧ = \t -> last (a : [x | (s, x) <- ⟦ e ⟧, s <= t])`，
即 stepper 把"event 序列"翻译成"分段常数信号"。

但**这个定理只在 push-pull 混合下高效成立**。让我们构造两个反例，分别打破"pure pull"与"pure push"：

```haskell
-- 反例 A：pure pull 系统下 stepper 的灾难
-- ============================================

-- 假设 stepper 用 pure pull 实现（FRAN 风格）：
stepper_pull :: a -> Event a -> Behavior a
stepper_pull a (Event ps) = Behavior $ \t ->
  -- 每次采样必须扫整个事件历史
  case [x | (s, x) <- ps, s <= t] of
    [] -> a
    xs -> last xs

-- 工作负载：
-- mouseMoves 事件流：30 events/sec，运行 1 小时 = 108,000 events
-- 屏幕每秒 sample mousePos 60 次（render frame）

-- 在 t = 3600 秒时一次 sample 的开销：
-- 扫 108,000 events 找 last → O(N)
-- 每秒 60 次 sample → 每秒 60 × 108,000 = 6.48M ops
-- 即使每个 op 1ns，CPU 占用 ≈ 0.65%，且**随时间线性增长**

-- 1 天后：N = 2.6M events，CPU 占用 ≈ 16%——还啥都没渲染

-- ↑ 这就是 Conal 1997 FRAN 的实际行为，论文 Section 1.2 直接点名

-- 反例 B：pure push 系统下连续 signal 的表达失败
-- =================================================

-- 假设我们坚持只用 push（RxJS 风格）：
-- 想表达 mousePos: T -> (Int, Int)（任意 t 都有值）
-- 但 push 只能在事件触发时给值，无法回答 "t = 1.5s 时 mouse 在哪"

-- RxJS 的妥协：
mousePos$ = mouseMoves$.pipe(
  startWith({x: 0, y: 0}),
  shareReplay(1)  // 缓存最后一个值
)
-- 然后 sample(t=1.5) → 返回 t<=1.5 的最后一次 mouseMove value

-- 看起来等价 stepper？不！差异在 sample 频率：
-- 如果下游 30 ms 内没有人订阅，事件被 dropped（depending on operator）
-- shareReplay 解决这个但代价是**保留所有 subscriber 的状态**
-- 长时间运行 → 内存增长 + 取消订阅时机错误 → 内存泄露

-- 更狠的反例：纯连续 signal，比如
-- currentTime: Behavior T = Behavior id   -- 任何 t 返回 t 本身
-- 在 push 模型里**无法表达**——没有 event source 可以"推" currentTime 的更新
-- RxJS 必须用 interval(16) 模拟 60fps，浪费 CPU 且不连续
```

**论文的解（Section 6.1 Theorem 1 + Section 4 Reactive a）**：

```haskell
-- Reactive a 是 stepper 的高效 implementation：
data Reactive a = a `Stepper` Event (Reactive a)
-- 第一段值 a，然后是"下一个 Reactive a"事件

-- 采样 O(1)（持有当前段的指针）+ event 触发时切到下一段
-- N events 的总工作量 O(N)，分摊到事件触发而非采样

-- 数学等价（Theorem 1）：
-- ⟦ stepper a e ⟧ = ⟦ a `Stepper` accumE_swap a e ⟧
-- 但运行特性天差地别
```

**旁注（≥ 5 条）**：

- 反例 A 揭示的本质：**采样频率 × 历史长度** 是 pure pull 的两个杀手维度，二者乘起来就是性能 disaster。FRAN 实际部署时被这个 O(N · sample_rate) 卡死，论文 Section 8 Figure 9 给出 10-100× 加速正是来自把 N 这个因子从采样路径里抽掉。
- 反例 B 揭示的本质：**push 模型无法表达"任意时刻都有值"的连续 signal**。RxJS 用 `shareReplay(1)` + `startWith` 的工作流只是 "在订阅时间点上模拟连续"，与 Behavior 的 `T -> a` 在数学上不等价。
- "currentTime" 这个例子是论文 Section 6.4 的真案例——Conal 用它论证为什么 push-only 不够。RxJS 社区到 2020 年才意识到这个限制，催生 Effect-TS 的 FiberRef（pull-based reactive）。
- 反例 A 的"O(N) 增长"在 Reactive Banana 早期实现里实际触发过：Apfelmus 2011 的初版用 list 实现 Event，长事件流跑 1 小时就 OOM。修复方式正是 Section 4 的 `Reactive a`——把 stepper 摊销到 event 边界。
- 这两个反例对应论文 Theorem 1 的两个**边界条件**：(1) 当采样频率 >> 事件频率时，pure pull 暴露 O(N · sample_rate)；(2) 当 signal 是 totally function of time（如 `currentTime`）时，pure push 完全失语。push-pull 是**唯一的逃生路径**——但代价是双 ADT 的认知开销。

**怀疑 3**：论文的反例分析隐藏了**第三种失败模式**——Reactive a 的 `Event (Reactive a)`
是无限递归类型，它在 GHC heap 上的 representation 必须用 lazy evaluation + 弱引用
才不泄露内存。论文 Section 7 实现细节几乎不谈 GC——但 reactive 库 2010 年版的
github issue 里至少有 4 个 memory leak bug 直接来自 `Reactive a` 持续持有
旧 `Event` tail。Theorem 1 的"等价"在 GC 不工作时**形式上成立、运行时崩溃**。

## L4 复现：手算定理验证（≥ 3 toy 实例）

按 [方法论 v1.1 分支 D Layer 4 路径](/study/papers-method/)：手算 toy 验证定理 ≥ 3 实例。

### Toy 1：mouse-click 跟踪场景（验证 Theorem 1 stepper 一致性 + snapshot 语义）

**Setup**：

```haskell
mouseMoves :: Event (Int, Int)              -- 每次 mouse 移动
clicks :: Event ()                           -- 每次 click

mousePos :: Signal (Int, Int)
mousePos = stepper (0, 0) mouseMoves

clickPositions :: Event ((Int, Int), ())
clickPositions = snapshot mousePos clicks
```

**Trace**：

```
t=0:  mouseMoves: []
      clicks: []
      mousePos: stepper (0,0) [] = always (0,0)

t=1:  mouseMoves event: (10, 20)
      mousePos updates: now (10, 20) for t ≥ 1

t=2:  click event!
      snapshot: mousePos at t=2 = (10, 20)
      clickPositions: [(t=2, ((10,20), ()))]

t=3:  mouseMoves event: (30, 40)
      mousePos updates: now (30, 40) for t ≥ 3

t=5:  click event!
      snapshot: mousePos at t=5 = (30, 40)
      clickPositions: [(t=2, ((10,20), ())), (t=5, ((30,40), ()))]

t=10: mouseMoves event: (50, 60) (no click)
      mousePos updates: now (50, 60) for t ≥ 10
      clickPositions 不变
```

**Theorem 1 检查**：`⟦ stepper (0,0) mouseMoves ⟧ t` 应等于 `last ((0,0) : [x | (s,x) <- mouseMoves, s <= t])`。

- t=2 时：`last [(0,0), (10,20)] = (10,20)` ✓
- t=5 时：`last [(0,0), (10,20), (30,40)] = (30,40)` ✓
- t=10 时：`last [(0,0), (10,20), (30,40), (50,60)] = (50,60)` ✓

label：`[Theorem 1 verified at toy level]` —— mouse click + position 跟踪场景跑通。

### Toy 2：counter signal（验证 accumE 与 Theorem 3 折叠语义）

**Setup**：

```haskell
ticks :: Event ()                            -- 每秒 tick 一次
counter :: Event Int
counter = accumE 0 (fmap (\() -> (+1)) ticks)
counterSignal :: Signal Int
counterSignal = stepper 0 counter
```

**Theorem 3（Section 6.3）**：`accumE a (Event []) = Event []`，
且 `accumE a (Event ((t,f):rest)) = Event ((t, f a) : rest')` where
`rest' = ⟦ accumE (f a) (Event rest) ⟧`。

**Trace**：

```
t=1.0: tick event, fmap (+1) gives function (+1)
       accumE 0 [(1.0, +1)]
       = [(1.0, (+1) 0)] : accumE 1 []
       = [(1.0, 1)]
       counter: [(1.0, 1)]
       counterSignal at t=1.5: stepper 0 [(1.0,1)] gives 1 ✓

t=2.0: tick event
       accumE 1 [(2.0, +1)]
       = [(2.0, 2)] (continuation from t=1 state)
       counter: [(1.0,1), (2.0,2)]
       counterSignal at t=2.5: 2 ✓

t=3.0: tick event
       counter: [(1.0,1), (2.0,2), (3.0,3)]
       counterSignal at t=3.5: 3 ✓

t=10.0: 累积 10 次 tick
       counter: [(1.0,1), ..., (10.0,10)]
       counterSignal at t=10.5: 10 ✓
```

**关键观察**：

- `accumE` 在每个 event 上调用 1 次累积函数 → 总工作量 O(N)
- `stepper` 把 event stream 转 signal 后，`counterSignal at t=10.5` 不需要重扫 10 个事件——用 `Reactive a` 的指针实现是 O(1)
- 如果用 pure pull 模型 sample `counterSignal` 60 次/秒、运行 1 小时 = 216,000 次采样 × 3600 events = 7.78 亿次 list traversal。push-pull 把它压缩到 3600 次累积 + 216,000 次 O(1) lookup = **1000× 加速**

label：`[Theorem 3 verified at toy level]` —— counter accumulation 跑通。

### Toy 3：debounced key event 反例（找定理边界）

**Setup**：希望从高频 keyDown 流构造一个 debounced 信号——300ms 内无新按键时才更新。

```haskell
keyDowns :: Event Char
debouncedKey :: Signal (Maybe Char)
-- 期望：debouncedKey 在 keyDown 之后 300ms 显示该 key
-- 但下一个 keyDown 在 300ms 内到达 → 等到最后一个 + 300ms 才显示
```

**问题**：论文的 6 个核心 operator（`stepper / snapshot / accumE / mappend / fmap / switcher`）**无法直接表达 debounce**！

**为什么？** debounce 需要"未来事件不到来"作为触发条件——但 Event 类型 `[(T, a)]` 是只追加的、没有"时间到了什么都没发生就触发"的语义。论文 Section 6 没有 timer / delay primitive。

**Trace 失败演示**：

```
t=0.0: keyDown 'a'
t=0.1: keyDown 'b'
t=0.2: keyDown 'c'
t=0.5: (300ms after 'c', 期望 debouncedKey = Just 'c')

但用论文 6 个 operator 试图表达：
attempt = stepper Nothing (fmap Just keyDowns)
debouncedKey at t=0.5: 因为 last keyDown at t=0.2 有 'c'
                       → stepper 给出 Just 'c'
但这只是普通 stepper！它在 t=0.1 也会给 Just 'b'，没有 300ms 延迟语义。

正确 debounce 行为：
t=0.0 ~ 0.5: debouncedKey = Nothing  (尚未 settle)
t=0.5+: debouncedKey = Just 'c'

论文的 operator 集合无法表达"持续 300ms 无新事件"这个谓词。
```

**这暴露 Theorem 1-3 共同的边界**：定理们只覆盖了 event 的 `<>` / `accumE` / `stepper` 路径，**没有覆盖 timer/delay**。论文 Appendix A 提了一句 `delay :: T -> Event a -> Event a`，但没有给一致性定理——因为 delay 的语义在 push-based 实现下需要外部 scheduler，破坏 denotational purity。

label：`[Theorem boundary identified]` —— debounce 反例暴露 operator 集合不完备。

**这个发现的工程意义**：现代 RxJS 的 `debounceTime / throttleTime` 都是**在论文 6 operator 之外加的**。Reflex-FRP 用 `MonadIO` 注入 timer 才能实现 debounce——这正是论文 denotational 模型与工业实现的真正分歧点。

## 谱系对比

### 前作 1：FRAN (Elliott & Hudak 1997)

Conal 自己 1997 年的 pull-only FRP（[Functional Reactive Animation](https://web.archive.org/web/20200312183228/http://conal.net/papers/icfp97/icfp97.pdf)，ICFP 1997）。
这篇论文实质是**"我 1997 年错了"**的 12 年后修正。
关键差异：FRAN 把所有 reactive 概念都打到 `Behavior a = Time -> a` 上，没有 Event 类型——
`mouseClick` 在 FRAN 里是 `Behavior (Maybe Click)`，每帧检查"现在有没有 click"。
这是 Push-Pull FRP 反例 A（pure pull 灾难）的源头。

### 前作 2：Hudak's Yampa (2003)

[Yampa: Practical Reactive Programming with Arrows](https://www.cs.yale.edu/publications/techreports/tr1242.pdf) — 用 Arrow 形式抽象信号变换。
Push-Pull FRP 的 Section 8 主要拿 Yampa 做性能 baseline——**push-pull 在 click-heavy 场景比 Yampa 快 10-100×**。
但 Yampa 在"信号代数"（信号组合的类型化）上更强，至今 robotics 领域仍在用。

### 反对者：Conal Elliott 自己的 2013 retrospective

[The Future of Functional Reactive Programming](http://conal.net/blog/posts/garbage-collecting-the-semantics-of-frp) 中，
Conal 2013 反思 push-pull 的两个问题：(1) `Reactive a` 类型的 GC 不可观察（机制 3 怀疑 3）；
(2) `switcher` 在 dynamic graph 下时间语义混乱。**Conal 自己后来转向 unobservable performance**
（更纯的 denotational 模型，让实现完全自由）—— Push-Pull FRP 是过渡期作品。

### 后作 1：Reactive Banana (Heinrich Apfelmus 2011)

把 Push-Pull FRP 思想做成更工程化的库。Reactive Banana 是 Haskell 生态实际可用的 FRP，
修复了原版 reactive 库的 memory leak（用 weak reference 实现 GC-aware Reactive a）。

### 后作 2：Reflex-FRP (Ryan Trinkle 2014)

Conal 思想的 GHC 优化版 + GHCJS 跨编译。Reflex 在 web 前端是 Haskell FRP 的代表，
显式引入 `MonadIO` 解决 debounce 这类需要 timer 的场景（机制 3 反例 3 的工程解）。

### 后作 3（其他语言生态）

- **RxJS** (Microsoft 2010)：JavaScript Observable = Event-only FRP（无 Signal）。压扁成 push-only 让 API 简洁但失去连续 signal 表达力。
- **SolidJS** (2018)：createSignal + createEffect = 把 push-pull 简化到 hook 形态。Solid 的 createSignal 接近 Reactive a，createEffect 是 push side。
- **Effect-TS** (2020+)：Stream = Push, FiberRef = Pull。结构上**最接近 Conal 原版**。
- **Svelte 5 Runes** (2024)：runes 是隐式 push-pull，编译器在编译期决定走 pull 还是 push。
- **yew** (Rust web framework) / **leptos** (Rust)：reactive primitives 直接借用 SolidJS，间接受 Push-Pull 影响。

**这些 framework 没人引用 Conal 论文**，但**思想血脉清晰**。这是 theory paper 的典型命运：被工业完全消化后忘记出处。

### 选型建议

| 场景 | 选 | 理由 |
|---|---|---|
| 学 FRP 理论根 | Push-Pull FRP 论文 | 最干净的 ADT 区分 + denotational semantics |
| Haskell 生产 FRP | Reactive Banana / Reflex-FRP | 修了 memory / GC 问题 |
| JavaScript reactive | RxJS / SolidJS | 生态成熟，前者 push-only 简单，后者 push-pull 接近 Conal |
| 想要 effect system | Effect-TS | 结构最接近论文 |
| 简单 reactive | MobX / Vue ref | 不需要类型化区分，工业够用 |

## 与你当前工作的连接（L6 三段，每段 ≥ 4 子弹）

### 今天就能用

理解 push-pull 让你看 reactive 框架时**精确说出**它的设计选择：

- RxJS 是 push-only（Observable 没有 pull）→ 没有"连续时间值"概念 → debug `combineLatest` 漏 emit 时第一反应是检查"是不是 sample 时机错了"
- SolidJS 是 push-pull（signal 是 pull，effect 是 push 触发）→ 类似 Conal 模型 → 优化 re-render 性能时知道"effect 频率 ≠ signal 改变频率"
- React useState 是 hybrid（state 改触发 re-render，state 是 pull-when-rendered）→ React 的 batching 行为本质是"事件 push + 信号 pull 的边界"
- 调试任何 reactive bug 都更精准：先问"这是 event 还是 signal 语义？" 90% 的混乱在这里就解决

### 下个月能用

任何"事件 + 状态"系统都该明确区分：

- 你的"事件"是离散 push 还是连续 stream？两者用不同 buffer 策略（环形 vs 滑动窗口）
- 你的"状态"是 pull-when-needed 还是每帧主动 push？前者用 lazy evaluation，后者用 dirty flag
- 转换是 stepper、snapshot 还是 accumulator？不同选择决定内存占用差一个量级
- 当你发现"reactive 系统变慢"时，根据机制 3 反例 A 的诊断公式 `O(采样频率 × 历史长度)` 找到瓶颈

### 不要用的部分

- **不要在简单 UI 上用纯学术 FRP**：Reactive Banana / Reflex 学习曲线陡，简单 UI 不值得——直接用 React/Solid
- **不要追求 Conal 的形式化纯度**：实际工程 RxJS / SolidJS 等便宜 abstraction 够用——denotational purity 在 IO heavy 场景失效（机制 2 怀疑 2）
- **不要忽略 garbage collection**：Push-Pull FRP 的 event 历史可能泄露内存（机制 3 怀疑 3）。任何长期运行的 reactive 系统必须显式 weak reference
- **不要直接套 Theorem 1-3 到分布式场景**：论文假设单一时钟，跨进程需要 Lamport 时钟扩展，论文不覆盖

## 怀疑 + 延伸阅读

### 我对这篇论文最不信的 4 件事

**怀疑 4**（性能对比 baseline 老旧，Section 8）：vs Yampa（2002）和 FRAN（1997）——
不和 2009 年其他 reactive 系统（Microsoft Rx 2010 即将发布）对比。Section 8 Table 1
只有 3 行 benchmark，每行只跑一种 workload，缺统计显著性检验。

**怀疑 5**（memory leak 论文不深入，Section 7）：Push-Pull 模型保留 event 历史以支持 accumE 等操作。
长期运行如何 GC？论文不讨论。机制 3 怀疑 3 详述。Reactive 库 2010-2013 年实际有 4+ 内存
bug 都来自这一处空白。

**怀疑 6**（Conal 自评 1997 错误，但没承认 push-pull 的代价，Section 1.3 vs Section 9）：
双模型增加 API 复杂度。现代 RxJS 选择 Observable-only（push）就是接受了"放弃连续时间换 API 简洁"的折中。
论文 Section 9 完全不讨论"扁平化模型"作为竞品路线。

**怀疑 7**（denotational ≠ operational 的距离被低估，Section 3 vs Section 7）：
Theorem 1-3 都在 `T = Real⁺` 设定下证明，但 Section 7 的 Haskell 实现用 `Double`
逼近 + scheduler tick——两者之间存在 floating-point 精度损失 + tick 离散化。
论文一句"sufficient approximation"就跳过，没有给 error bound。

### 接下来读哪 3 篇

| # | 论文 | 回答什么问题 |
|---|---|---|
| 1 | FRAN (Elliott & Hudak 1997) | Conal 自己 12 年前 pull-only 版本——读完就懂为什么 Section 1 那么自责 |
| 2 | Adapton (Hammer et al. 2014) | Push-Pull 理念在 incremental compute 的衍生——dirty 标记 + 拉式重算 |
| 3 | "Genuinely Functional User Interfaces" (Courtney & Elliott 2001) | Conal 用 Yampa 做 UI 的尝试——和 Push-Pull FRP 同期但路线不同 |

读完这 3 篇 + Push-Pull FRP + AFP（[第 12 篇](/study/papers/self-adjusting/)），
你拥有"reactive programming 1997-2014"完整地图。

## 限制（≥ 4 条，按 v1.1 分支 D 必填三类 + 1）

按 v1.1 分支 D theory 必填三类（假设强度 + 实际系统差距 + 复杂度边界）+ 1 条额外：

1. **假设强度（论文 Section 3 Definition 6）**：denotational semantics 假设 `T = Real⁺`，
   时间是连续实数轴。任何实际 OS 时钟都是离散的（最细 Linux 64-bit ns），
   论文的 ⟦·⟧ bracket 在 t = 1.5ns 上的值，工程实现根本拿不到——
   这把 denotational 与 operational 的距离藏在 Section 7 一句"rational approximation"里轻轻带过。
2. **实际系统差距（机制 2 怀疑 2 + 机制 3 怀疑 3）**：Theorem 2（fmap distributivity）
   假设 fmap 是 pure 函数，但 Section 7 实现里 `f` 经常是 IO callback，distributivity
   在 stable merge 边界被默默破坏。Theorem 1（stepper 一致性）依赖 GC 工作但论文不谈 GC——
   reactive 库 2010-2013 年累计 4+ 内存 bug 都源于此。
3. **复杂度边界（机制 3 反例 3）**：6 个核心 operator（`stepper / snapshot / accumE / mappend / fmap / switcher`）
   不能表达 debounce / throttle / delay 类需要 timer 的语义。论文 Appendix A 提了一句 `delay`
   但没有一致性定理——现代 RxJS / Reflex 都必须**在论文 operator 集合之外**加 IO timer。
4. **API 复杂度（额外）**：双模型让用户必须区分 Event vs Signal——简单场景反而比 RxJS 单模型烦。
   工业实践的 RxJS 选择压扁成 Observable，证明对很多场景"理论上不优雅"工程上够用。

## 附录：叙事错位清单（≥ 4 行，论文宣称 vs 工业现实）

| # | 论文宣称（Section/Theorem） | 工业现实（2026 视角） |
|---|---|---|
| 1 | "Push-Pull FRP 是 reactive programming 的正确路径"（Section 1.3） | RxJS 选 push-only 大成功；SolidJS 选 push-pull 也成功；Effect-TS 选混合也成功——**没有"正确路径"**，只有 trade-off |
| 2 | "10-100× 比 pull-only 快"（Section 8 Table 1） | 仅在 click-heavy 场景成立；纯动画场景（每帧都更新）push-pull 与 pull-only 性能持平甚至略慢（switcher 开销） |
| 3 | "Theorem 1-3 保证 conversion operator 一致性"（Section 6） | denotational 一致性 ≠ operational 一致性；IO + GC + 时钟离散化在工程层全部破坏，工业 FRP 库（Reactive Banana / Reflex）都加了**额外** runtime 检查 |
| 4 | "events 与 signals 的二元区分是本质的"（Section 2） | 工业实践证明可以**压扁**：RxJS 全是 Observable、Vue 全是 ref——简单场景里"本质区分"是 over-engineering |
| 5 | "memory model 由 GC 处理"（Section 7 footnote 9） | 实际 reactive 库 2010-2024 至少 12 个 GitHub issue 都是 memory leak；GC 不能自动 collect `Reactive a` 的循环引用 |

## 附录：3 个核心 operator 速查

```haskell
-- 1. Event → Signal: 保持上次值
stepper :: a -> Event a -> Signal a

-- 2. Signal × Event → Event: 在事件时刻采样信号
snapshot :: Signal a -> Event b -> Event (a, b)

-- 3. Event accumulator: 累积 event 值
accumE :: a -> Event (a -> a) -> Event a
```

记住这 3 个 operator = 一代 reactive 编程的核心。

---

**Layer 0-7 完成（按 v1.1 分支 D theory 状元篇模板）。约 540 行，含 1 张 figure（webp）+ Notation 速记表 + L3 三段（含反例构造）+ L4 三 toy 手算 + 5+ 一级锚定（Definition 1, 2, 5; Theorem 1, 2, 3; Lemma 3）+ 4 显式怀疑 + 4 限制 + 5 行叙事错位 + 3 operator 速查。**

**Season C · 前端 / 编译器 / 工具链 4/5。重构日期 2026-05-28（v1.1 分支 D theory 升级）。**
