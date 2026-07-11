---
title: Helium — 让类型错误说人话的教学版 Haskell
来源: Heeren, Leijen, van IJzendoorn, "Helium, for Learning Haskell", Haskell Workshop 2003
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

Helium 是一个**为初学者设计的 Haskell 编译器**，唯一的卖点就是：**类型报错说人话**。

日常类比：你刚学英语，老师不会一上来给你扔一本《牛津高阶》。Helium 就是给 Haskell 新手用的"简易词典版"——**砍掉一些高级特性，换来错误消息能读懂**。

```haskell
xs = 1 : 2
```

GHC 2003 报错（不友好）：

```
Couldn't match expected type [a] with actual type Int
```

Helium 报错（友好）：

```
Type error in expression at line 1
  expression : 2
  type       : Int
  expected   : [Int]
  hint       : maybe you meant 1 : [2]  or  [1, 2]
```

差别就是一个新手能不能 5 秒看懂哪里错了。

## 为什么重要

类型错误曾是函数式语言**最大的劝退点**。Haskell / OCaml 报错出名地难懂，初学者第一次见 `expected (a -> b) -> [a] -> [b], got [Int]` 直接就想退课。

Helium 这篇论文是**类型错误 UX 革命的奠基**。它问了一个看似简单的问题：

> 为什么编译器明明知道你错在哪，但报出来的话像加密电报？

并给出三个具体技术答案：**type graph、heuristics、siblings**。后来：

- **Elm** 的友好类型错误，作者 Evan Czaplicki 公开致谢 Helium
- **Rust** 的 `did you mean` 提示就是 sibling 思路的工业版
- **Roc / Gleam** 等新语言一开始就把"友好报错"列为产品核心

不读 Helium，你只能模糊感觉"现代编译器报错变好了"；读了它你才知道**好在哪、靠什么算法做到的**。

## 核心要点

Helium 的友好报错靠**三件事**叠在一起：

1. **type graph（类型图）**：不像传统 [[hindley-milner]] 算法 W 那样从左到右扫，而是把所有类型约束做成一张**图**。约束之间是平等的——错误不再非得归到"扫到的第一条"。

2. **heuristics（启发式根因定位）**：图建好以后，不是随便报一条冲突，而是用启发规则挑**最可能是真正根因**的那条边。规则包括：信任标准库 > 信任用户代码、参数数量错优先报、靠近根的节点优先报。

3. **siblings（兄弟函数表）**：编译器内建一张"容易混淆的对子表"——`map` vs `fmap`、`++` vs `:`、`foldr` vs `foldl`。报错时如果用户用了其中一个但类型对不上，提示"是不是想用兄弟？"

另外加了一个**directives** 机制：库作者可以写"我这个函数被误用时请这样报"，让定制扩散到生态。

代价：Helium **去掉了 type class**（只保留少量内建），换来推导路径短、错误消息线性。这让它**不能跑真实 Haskell 项目**，只用于教学。

## 实践案例

### 案例 1：sibling 提示替你换函数

```haskell
hello = "hi" + " there"
```

GHC 风格：报 `+` 要 `Num`，`String` 不是 `Num`，新手懵。

Helium 风格：

```
hint: try (++) instead of (+) for string concatenation
```

直接告诉你换 `(++)`。这就是 sibling 表的力量——编译器**预先知道哪些函数容易用错**。

### 案例 2：type graph 让报错位置更准

```haskell
f x y = x + y
g = f 1 "two"
```

按 algorithm W 从左到右推：编译器先记住 `f : Int -> Int -> Int`（看 `x + y`），再报"`g` 的第二个参数 `"two"` 不是 Int"。

但**根因**可能是用户**记错了 `f` 的用途**，希望 `f` 处理字符串。type graph 不预设方向，启发式可以选择**报 `f` 的定义和调用之间的冲突**，而非把所有锅给 `"two"`。报错位置准了，新手才能找到真错的地方。

### 案例 3：directives 让库作者教编译器

库作者写一条 directive：

```
when using lookup with a Maybe context,
  report: "lookup returns Maybe, did you forget to pattern match?"
```

之后任何人误用 `lookup` 不解 `Maybe`，编译器自动给这个领域定制提示。

## 踩过的坑

1. **去 type class 是双刃剑**：Helium 报错好读，但**真实 Haskell 库都用 type class**。Helium 因此停留在教学，从未进生产。后来 GHC 自己学了一些 Helium 思路，逐步反向整合。

2. **启发式不是万能**：当代码错得复杂（多个变量类型互相牵扯），启发式也猜错，把根因报到错误位置——比 algorithm W 还误导。论文坦承这点。

3. **siblings 表要人工维护**：哪些函数算"兄弟"是经验活，加多了乱报，加少了不够用。直到现在 Rust / Elm 的提示库也是手工维护。

4. **directives 写起来繁琐**：只有大库作者会写，开源社区中长尾库基本没用。

## 适用 vs 不适用场景

**适用**：

- 教函数式编程（OCaml / Haskell / Elm 课堂）—— Helium / Elm / Roc 都是这种思路
- 设计任何静态类型语言的报错消息——`siblings` + 启发式可以直接借鉴
- 帮初学者过类型推导这关——比起强行让人读懂 algorithm W，不如改报错

**不适用**：

- 生产用 Haskell 代码（type class 不可少）
- 极复杂多态场景（启发式难定位真正根因）
- 已经熟练的程序员——他们要的是**精确的低层信息**，不是友好提示

## 历史小故事（可跳过）

- **2003 年**：Heeren / Leijen / van IJzendoorn 在 Utrecht 发布 Helium 第一版，发表在 Haskell Workshop。
- **2003 年同期**：另一篇 Heeren-Hage-Swierstra 发表 *Scripting the type inference process*（ICFP 2003），把 Helium 的推导引擎抽出来变成可脚本化框架。
- **2005 年**：Heeren 博士论文 *Top Quality Type Error Messages* 把所有思路合成系统。
- **2012 年**：Evan Czaplicki 写 Elm 时公开说"我们的报错是把 Helium 工业化"。
- **2018 年**：Rust 1.27 起加大量 `did you mean` 提示——sibling 思路的 Rust 版。
- **2024 年**：Roc 把"友好报错"列为语言核心卖点。

20 年后回头看，Helium 是**类型错误 UX 学科**的奠基论文。

## 学到什么

1. **报错是产品的一部分**——类型推导算法只是基建，**给人看的消息**是最终用户接触到的成品
2. **type graph vs sequential**：算法决定"能不能选根因"。从左到右扫永远只能报第一条，图算法才能挑
3. **siblings 是廉价但极有效的启发式**——不需要花哨理论，一张人工维护的容易混淆表能解决 80% 新手错
4. **教学语言 vs 生产语言**：去掉特性换易学度是合理设计选择，但要清楚目标用户

## 延伸阅读

- 论文 PDF：[Heeren, Leijen, van IJzendoorn 2003](https://webspace.science.uu.nl/~swier004/publications/2003-haskellworkshop.pdf)（10 页，例子很多）
- Heeren PhD 论文：[Top Quality Type Error Messages, 2005](https://research.utwente.nl/files/6042166/full.pdf)（系统版）
- Helium 项目主页：[github.com/Helium4Haskell/helium](https://github.com/Helium4Haskell/helium)
- Elm 报错设计博客：[Compiler Errors for Humans](https://elm-lang.org/news/compiler-errors-for-humans)
- [[hindley-milner]] —— Helium 改进的对象就是 HM 的报错
- [[compiler-errors]] —— 编译器报错设计的综述

## 关联

- [[hindley-milner]] —— Helium 改 HM 推导引擎，换更友好的报错路径
- [[compiler-errors]] —— 同主题（让编译报错有用），Helium 是奠基论文之一
- [[bidirectional-typing]] —— 另一种让报错更准的思路：推/查交替
- [[local-type-inference]] —— 局部推导减少跨距报错
- [[gradual-typing]] —— 类型系统对新手友好的另一条路（让动静态共存）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[pottier-merr]] —— Pottier LR(1) Reachability — 让 LR 解析器的错误消息覆盖完整
