---
title: Push-Pull FRP — Functional Reactive Programming 实用化
来源: Elliott, "Push-pull functional reactive programming", Haskell 2009
日期: 2026-05-29
分类: 编程语言
难度: 中级
---

## 是什么

Push-Pull FRP（**函数式反应式编程的实用化版本**）是一套**把"事件流"和"信号"分开处理**的方法。日常类比：报警系统是 push（出事立刻响），温度计是 pull（你要的时候再读）—— FRP 让两种语义共存。

- **事件（Event）**：离散的、来一次处理一次（鼠标点击、键盘按下）→ 用 push（来了立刻通知所有订阅者）
- **信号（Behavior）**：连续的、任意时刻都有值（鼠标位置、当前时间）→ 用 pull（要的时候再算）

Conal Elliott 把这两种本质不同的东西用**两套类型**分别建模，再提供算子让它们互转。

## 为什么重要

不理解 push-pull，下面这些事都没法解释：

- 为什么 RxJS 的 `Observable` 经常需要 `shareReplay` "缓存最后一个值"——因为 RxJS 全是 push，没有原生 pull 语义
- 为什么 SolidJS 的 `createSignal` 比 React 的 `useState` 性能好——signal 是 pull，需要时再算，effect 是 push 触发
- 为什么 Conal Elliott 1997 年发明 FRP（FRAN）后又自己推翻——pure pull 太慢
- 为什么响应式 UI 框架的"重新渲染"问题永远存在——push 和 pull 边界划在哪很难定

Conal Elliott 是 FRP 之父，这篇论文是他用 12 年时间反思 + 修复自己 1997 年作品的结果。后续 Reactive Banana / Reflex-FRP / Sodium 都是它的直接继承者，RxJS / SolidJS / Svelte 5 也间接受影响。

## 核心要点

Push-Pull FRP 的设计可以拆成 **三件事**：

1. **两种类型**：`Event a`（离散，push）vs `Behavior a`（连续，pull）。类比：门铃 vs 墙上温度计——门铃响一次处理一次，温度计随时可读。前者语义上是 `[(时间, 值)]` 列表，后者是 `时间 -> 值` 函数；类型分开后运行时才能走不同 codepath。

2. **两个操作**：`Sample`（拿当前 Behavior 的值）+ `React`（订阅 Event 触发回调）。类比：你抬头看一眼温度计（pull）vs 门铃响了你去开门（push）。

3. **互转算子**：`stepper` 把事件流转成"分段常数信号"（事件来时跳变、之间保持）；`snapshot` 在事件触发瞬间采样信号。类比：步进开关记住上次拨到哪一档；拍照快门按下那一刻记下当前读数。

性能关键：纯 pull 每帧重算所有 signal，像每秒把整栋楼温度计全读一遍；push-pull 只在输入变化时重算，论文强调的是少浪费重算、反应延迟接近瞬时，而不是给出固定倍速数字。

## 实践案例

### 案例 1：鼠标点击 + 鼠标位置

最经典的 push-pull 场景：

```haskell
mouseMove :: Event (Int, Int)        -- 鼠标移动事件，push
mouseClick :: Event ()                -- 鼠标点击事件，push

mousePos :: Behavior (Int, Int)       -- 鼠标位置信号，pull
mousePos = stepper (0, 0) mouseMove

clickPositions :: Event ((Int, Int), ())
clickPositions = snapshot mousePos mouseClick
```

读法："每次点击时，拍一下当前鼠标位置"。

- `mousePos` 是 pull——鼠标不动时**不重算**
- `mouseClick` 是 push——点击时立刻触发
- `snapshot` 是混合——event 触发时去 pull signal

### 案例 2：与 RxJS 对比

```js
// RxJS 全是 push（Observable）
const mousePos$ = mouseMove$.pipe(
  startWith({x: 0, y: 0}),
  shareReplay(1)
)
const clickPositions$ = click$.pipe(withLatestFrom(mousePos$))
```

逐部分解释：`mouseMove$` 是 push 事件流；`shareReplay(1)` 把"最后一个位置"缓存起来，假装成 Behavior；`withLatestFrom` 近似论文的 `snapshot`（点击时带上当前坐标）。代价是每个订阅者都要持有缓存，长跑易泄漏。Push-Pull 的 Behavior 在数学上就是 `时间 -> 值`，不靠缓存伪装连续。

### 案例 3：与 SolidJS 对比

```js
const [count, setCount] = createSignal(0)   // signal：pull
createEffect(() => console.log(count()))     // effect：push 触发
```

逐部分解释：`createSignal` 接近 Behavior——读 `count()` 才取值（pull）；`setCount` 改变后，依赖它的 `createEffect` 被通知（push）。Solid **显式区分**两侧；React 更像单一 state + 统一 re-render，边界没画在类型上。

## 踩过的坑

1. **Time-leak（时间泄漏）**：早期 Reactive 库实现 `accumE`（事件累积器）时，把整个事件历史存在内存里。跑 1 小时鼠标移动 → 100,000 个事件挂着不释放 → OOM。修复：用弱引用 + 增量结构 `Reactive a`（lazy 段链表）。

2. **同时事件的顺序问题**：两个事件 `t` 完全相等时谁先谁后？论文用 "stable merge"（左操作数优先）。Reactive Banana 早期忽略这个细节，导致 `accumE` 累积乱序。

3. **Push-only 表达不了连续 signal**：`currentTime :: Behavior Time = id` —— "任何时刻返回它本身"。RxJS 必须用 `interval(16)` 模拟 60fps，浪费 CPU 且不连续。

4. **debounce 表达不了**：论文 6 个核心算子无法表达"300ms 内无新事件就触发"——因为 Event 类型只追加、没有"超时"语义。现代 Rx 的 `debounceTime` 都是在论文之外加的 IO timer。

## 适用 vs 不适用场景

**适用**：
- 需要严格区分 event vs signal 的反应式系统（动画、交互式 UI、游戏）
- 性能敏感：纯 pull 按帧全量采样（如 60fps 每帧扫一遍依赖图）太贵，又需要连续信号语义
- 想要可证明正确性的反应式库（Reactive Banana / Reflex-FRP）

**不适用**：
- 简单 UI（双类型增加心智负担）→ 直接用 React/Vue 的单 state 模型
- 分布式系统（论文假设单一时钟，跨进程要 Lamport 时钟扩展）
- 重 IO 场景（论文一致性证明在 IO callback 下默默失效）
- 不需要"任意时刻都有值"的应用 → RxJS push-only 够用且 API 更简单

## 历史小故事（可跳过）

- **1997 年**：Conal Elliott + Paul Hudak 在 ICFP 发表 FRAN（Functional Reactive Animation），把动画建模为 `Behavior a = Time -> a`。优雅但慢——每帧重算所有 behavior。
- **2003-2008 年**：Yampa / FrTime / Frapp 等尝试用 Arrow 或副作用追踪解决性能，但都"不够干净"——Yampa 写法冗长，FrTime 跨语言落地难。
- **2009 年**：Conal 自己 12 年后写出 Push-Pull FRP，承认"1997 年的纯 pull 是错的"——这篇论文本质是**作者自己的修正**。
- **2010+ 年**：Microsoft Rx → RxJS 选择 push-only 路线，简化 API 但失去连续 signal 表达力。
- **2018+ 年**：SolidJS 的 `createSignal` 把 push-pull 简化到 hook 形态，重新流行。
- **2024+ 年**：Svelte 5 Runes 用编译器在编译期决定 push 还是 pull——用编译手段绕开"双模型 API 复杂"。

## 学到什么

1. **类型上的区分能引导实现**：Event vs Behavior 不只是命名差异，决定了运行时走 push 还是 pull 路径——这是一种用类型系统"硬编码"性能选择的思路
2. **理论一致性 ≠ 工程一致性**：论文证明了算子的语义一致性，但 IO callback / GC / 时钟离散化在工程层都会破坏它
3. **时间是连续的还是离散的影响所有设计**：论文用 `Real⁺`（连续），但实际 OS 时钟是 ns 离散的——很多 reactive bug 都来自这个鸿沟
4. **作者推翻自己也算贡献**：Conal 1997 → 2009 → 2013 三次反思，每次都在前作基础上修——比"宣称完美"诚实

## 延伸阅读

- 原版论文 PDF（12 页）：[Push-Pull FRP](http://conal.net/papers/push-pull-frp/push-pull-frp.pdf)
- 视频教程：[Conal Elliott - The essence and origins of FRP](https://www.youtube.com/watch?v=j3Q32brCUAI)（讲历史 + 思想）
- 现代 Haskell 实现：[Reflex-FRP](https://reflex-frp.org/) push-pull 的工程版 + GHCJS 跨编译
- [[hindley-milner]] —— FRP 在 Haskell 里写，Behavior / Event 类型推导走 HM 体系
- [[self-adjusting]] —— Adaptive Functional Programming，是 Solid signal / Svelte runes 的祖宗，与 push-pull 有交集

## 关联

- [[lambda-calculus]] —— FRP 在 Haskell 里实现，必然依赖 lambda 求值模型
- [[hindley-milner]] —— Behavior / Event 的类型推导走 HM 体系
- [[self-adjusting]] —— 增量计算的"祖宗"，与 push-pull 共享"按需重算"思想
- [[adapton]] —— 增量计算的工程化简化，Conal 思想的另一支衍生
- [[effect-handlers]] —— Push-Pull 的 IO 副作用问题，代数效应给出更干净的解

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[effect-handlers]] —— 代数效应（Algebraic Effects）
- [[frenetic-2011]] —— Frenetic 2011 — 把 OpenFlow 流表换成函数式程序
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[hughes-fp-matters]] —— Why FP Matters — 函数式真正赢在能拆能粘
- [[islands-architecture]] —— Islands Architecture — 静态页面里只让需要交互的小块加载 JS
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[salsa-adapton]] —— Salsa / Adapton — 让程序只重算"真的变了"的那一小块
- [[self-adjusting]] —— Self-Adjusting Computation — 输入小幅变化时只重算受影响的那部分

