---
title: 渐进类型 — 让动态和静态类型在同一份代码里共存
来源: 'Jeremy G. Siek, Walid Taha, "Gradual Typing for Functional Languages", Scheme Workshop 2006'
日期: 2026-05-29
分类: 编程语言
难度: 中级
---

## 是什么

渐进类型（**Gradual Typing**）是一种**让你想加类型注解就加、不想加就不加**的类型系统设计。日常类比：装修房子时，已经规划好的房间装精装修（静态类型），暂时没想好的房间先放空（动态类型），将来想清楚了再补装。两类房间可以共存在同一栋楼里。

具体到代码：

```ts
function add(x: number, y: number): number { return x + y }  // 全静态
function log(msg) { console.log(msg) }                        // 全动态
add(1, log("hi"))  // 渐进系统在这里插入运行时检查
```

Siek 和 Taha 在 2006 年用一篇 14 页论文给"动态 + 静态混合"画了**第一份能证明正确的形式化蓝图**——后来 TypeScript / Python mypy / Hack / Sorbet / Flow 全是这套思想的工业化落地。

## 为什么重要

不理解渐进类型，下面这些事都没法解释：

- 为什么 TypeScript 写 `any` 不会立刻报错，但传到一个 `(x: number) => x + 1` 里**才**炸——这是 cast 插入在工作
- 为什么 Python 加 mypy 之后**老代码不用重写**也能渐进迁移——dynamic 默认相容
- 为什么 Sorbet 在 Stripe / Hack 在 Facebook 能从 0 注解推到 80% 注解——核心就是 Siek-Taha 的迁移路径
- 为什么很多渐进系统**性能慢**——因为动静交界处必须运行时检查，不是免费的

## 核心要点

整套系统建立在 **三块积木** 上：

1. **动态类型 `?`**：当你不写类型注解，编译器就给你贴个 `?`。它表示"还不知道，先放着"。类比：地图上某块还没探索的迷雾区。

2. **一致性关系 `~`**：取代普通类型系统里的"必须相等"。规则三条：自反（`T ~ T`）、对称（`T ~ S` 则 `S ~ T`）、`?` 与任何类型相容。**关键是不传递**——`int ~ ?` 且 `? ~ string` 但 `int ≁ string`。如果传递就完蛋了，所有类型都会变得相容，静态检查彻底失效。

3. **Cast 插入**：在动静交界处偷偷插入运行时检查。源码里你看不见这些 cast，编译器把代码翻译成内部语言时插上去。一个 `(?)e` 表示"运行时检查 e 是否符合类型 ?"。

加起来三句话：**没标的当 `?` 处理；用一致性而非相等来检查；交界处补 cast**。

## 实践案例

### 案例 1：TypeScript 里的 `any` 就是 `?`

```ts
let x: any = "hello"
let y: number = x  // 不报错！any 与任何类型相容
let z = y * 2      // 运行时这里炸：NaN 或者 "hello2"
```

**逐部分解释**：

- TypeScript 的 `any` 类型对应 Siek-Taha 的 `?`
- 第 2 行赋值看起来违反静态检查，但 `any ~ number`（一致），所以通过
- TypeScript **没插入运行时 cast**（这是它和严格渐进类型的差别），所以错误不会立刻报，而是在 `y * 2` 处变成 `NaN`

### 案例 2：mypy 演示一致性不传递

```python
from typing import Any
def f(x: int) -> int: return x + 1
def g(x: str) -> str: return x.upper()

a: int = 1
b: Any = a       # int ~ Any 通过
c: str = b       # Any ~ str 通过
g(c)             # 类型检查通过，但运行时炸：'int' has no attribute 'upper'
```

如果一致性传递，那 `int ~ str` 会被推导出来，整个类型系统失去意义。Siek-Taha 在论文里**专门强调不传递**就是为了堵这个洞。

### 案例 3：函数类型的 cast 是个包装器

```ml
(* 源码：声明 f 接受 ?，调用方传 number → number *)
let apply (f: ? -> ?) (x: int) = f x

(* 内部翻译加上 cast，运行时变成： *)
let apply (f: ? -> ?) (x: int) =
  let f' = cast<int -> int>(f) in  (* f 被包装：每次调用都检查 *)
  f' x
```

函数 cast **不能立刻检查**——你不能马上判断 f 是不是真接受 int。所以 cast 变成一个 wrapper，每次 f 被调用时检查参数和返回值。这就是为什么渐进类型对函数有性能开销。

## 踩过的坑

1. **一致性不传递容易写反**——很多人第一次写形式化系统会下意识加传递性，结果整个类型系统瞬间退化成"所有类型相容"。原因：`?` 是相容关系的"虫洞"，一旦传递就把所有类型连通。

2. **运行时性能可能很糟**——动静交界多 + 函数高阶 = wrapper 层层叠加。Takikawa 等人 2016 年实测最坏情况 100 倍 slowdown。原因：每次跨界都要构造 / 检查 wrapper，类型擦除语言（TypeScript）省了开销但牺牲了运行时安全。

3. **blame（谁该背锅）需要后续工作**——Siek-Taha 2006 只说"会炸"，没说"是谁的错"。Wadler-Findler 2009 才补上 blame 追踪。原因：cast 插入会模糊错误来源，必须给每个 cast 标记一个"责备标签"。

4. **TypeScript 不是真正的渐进类型**——它的 `any` 没有运行时检查，更接近 optional typing。原因：性能 + 兼容老 JS。代价是 `any` 会"污染"，错误推到很远的地方才暴露。

## 适用 vs 不适用场景

**适用**：

- 大型动态类型项目想渐进迁移到静态（Python/JS/Ruby/PHP 加注解）
- 原型阶段不想被类型束缚，但发版前想要静态保障
- 教学场景——先玩动态，等学生理解了再加类型
- 多人协作但团队对类型熟悉度差异大——会的人多写注解，新人先用 `any` 保持流畅

**不适用**：

- 性能极敏感的系统级编程（cast wrapper 开销吃不消）→ 用 Rust / OCaml 的纯静态
- 需要类型驱动重构 / refactor with confidence（`?` 太多会让类型推不远）→ 走纯静态
- 追求强类型安全证明（dependent types / 形式化验证）→ 用 Coq / Agda / Lean

## 历史小故事（可跳过）

- **1990 年代**：Cartwright-Fagan 的 soft typing、Thatte 的 quasi-static typing 已经在尝试动静混合，但都有理论瑕疵（一致性会塌）
- **2006 年**：Siek 和 Taha 在 Scheme Workshop 发表 14 页论文，引入 `?` 和**不传递**的一致性，第一次给出完整形式化和类型安全证明
- **2009 年**：Wadler-Findler 加上 blame 追踪，让运行时错误能定位到"谁该负责"
- **2010s 工业落地**：TypeScript（2012）/ mypy（2012）/ Hack（2014）/ Flow（2014）/ Sorbet（2018）/ Python type hints PEP 484（2014）相继出现，全部基于渐进类型思想

## 学到什么

1. **类型系统可以分级而不是非黑即白**——这是 21 世纪类型理论最重要的实用洞见
2. **不传递的关系比等价关系强大**——只放弃一条数学性质就换来巨大表达力
3. **静态保证有运行时代价**——天下没有免费的午餐，cast 插入位置直接决定性能
4. **理论 → 工业落地 6 年**——比 [[hindley-milner]] 的 13 年还快，因为动态语言生态早就饥渴
5. **设计决策有梯度**——TypeScript 选了 unsound 但快、Typed Racket 选了 sound 但慢，没有银弹

## 延伸阅读

- 视频教程：[Jeremy Siek — What is Gradual Typing?](https://www.youtube.com/watch?v=fJyJu2eIVmA)（作者本人 30 分钟讲清来龙去脉）
- 经典论文 PDF：[Siek-Taha 2006 — Gradual Typing for Functional Languages](https://jsiek.github.io/home/siek06gradual.pdf)（14 页，含完整证明）
- 实测博客：[Takikawa et al. 2016 — Is Sound Gradual Typing Dead?](https://www.cs.tufts.edu/~nr/cs257/archive/sam-tobin-hochstadt/gradual.pdf)（揭示最坏 100x slowdown）
- [[hindley-milner]] —— 渐进类型借鉴了 HM 的 unification，但用一致性替代了等价
- [[bidirectional-typing]] —— 推断和检查双向交替，常和渐进类型结合使用

## 关联

- [[hindley-milner]] —— 纯静态推导祖师；渐进类型是它的"留个口子"版本
- [[bidirectional-typing]] —— 双向类型检查，TypeScript / Hack 实现的关键技术之一
- [[liquid-types]] —— 让程序员告诉编译器"哪些值才合法"，是渐进的"另一极"
- [[refinement-types-1991]] —— 类型细化思想，与渐进类型互补
- [[local-type-inference]] —— 局部类型推断，TypeScript 的核心算法
- [[linear-types]] —— 资源敏感的类型，常需精确类型注解，与渐进的精神相反
- [[mccarthy-lisp]] —— 最早的动态语言，渐进类型让它的后代（Racket / Clojure）能加注解

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bidirectional-typing]] —— 双向类型检查 — 推断和检查两个方向交替前进
- [[helium-type-errors]] —— Helium — 让类型错误说人话的教学版 Haskell
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[linear-types]] —— 线性类型（Linear Types）
- [[liquid-types]] —— Liquid Types — 让编译器自己推导出"哪些值才合法"
- [[local-type-inference]] —— Local Type Inference — 编译器只看相邻节点也能推出类型
- [[mccarthy-lisp]] —— McCarthy LISP 1960
- [[refinement-types-1991]] —— Refinement Types for ML — 让程序员告诉编译器"哪些子集才合法"
- [[row-polymorphism-remy]] —— Row Polymorphism — 让函数不必知道 record 的全部字段
- [[strongtalk]] —— Strongtalk — 可以装可以卸的 Smalltalk 类型系统

