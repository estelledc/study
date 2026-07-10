---
title: Frank — 让 effect handler 写得就像普通函数
来源: 'Lindley, McBride & McLaughlin, "Do Be Do Be Do", JFP 2017 (arXiv 1611.09259)'
日期: 2026-05-30
分类: 编程语言
难度: 高级
---

## 是什么

Frank 是一门**严格函数式语言**，它把"处理副作用"这件事的语法做了极简：handler 不再是一种新关键字，**它就是函数本身**。日常类比：原本你点外卖要去专门的"外卖窗口"，Frank 把窗口拆了——任何柜台都能接外卖单，连不接外卖的柜台也只是"什么单都不接的特例"。

具体一点。传统 effect 语言有两个语法：`fun` 写普通函数，`handle ... with ...` 写 handler。Frank 只有一种语法叫 **operator**。一个 operator 可以**列出它打算解释哪些命令**（如 `get / put / abort`），不列就是普通函数。

```ml
state : {S -> <State S>X -> X}
state s <get -> k>     = state s (k s)
state _ <put s' -> k>  = state s' (k unit)
state s x              = x
```

读完这 4 行：`state` 是个函数，**也是** State 的 handler，因为它额外配了几条 `<...>` 模式分支。函数和 handler 在 Frank 里是同一种东西。

`{S -> <State S>X -> X}` 这个签名要拆着读：花括号是"这是个 operator"；尖括号 `<State S>` 写在第二个参数前面，意思是"这个参数运行时**需要**用到 State 这种能力"。当你调用 `state` 时，Frank 类型检查器会顺着调用链把 State 的能力 push 进去——你**不必**在源代码每一层都手写"我用了 State"。

## 为什么重要

不理解 Frank，下面这些事都没法解释：

- 为什么 OCaml 5 的 effect handler 能让"异步"看起来像同步代码——它和 Frank 同属 algebraic effect handler 一脉（思想相近，语法并不照搬）
- 为什么 algebraic effect 比 monad transformer 更可组合——Frank 的 multihandler 直接告诉你答案
- 为什么有的系统签名里要写长长的 effect 行（如 Koka 的 effect row），而 Frank 源码里很少手写——它用 ambient ability 把能力从外向内灌
- 为什么"effect 系统的工业化"被认为是 2020 年代 PL 的关键路标

## 核心要点

Frank 的设计齿轮有 **三个**：

1. **operator = 函数 + handler 的统一**：一个 operator 写 `<cmd -> k>` 的分支就在解释命令，不写就是普通函数。多写几个分支就能**同时解释多种命令**——叫 multihandler。类比：一个柜员既能办存款又能办挂失，不必拆两个窗口。

2. **双向类型检查（bidirectional）**：类型信息不是从代码"挤出来"，而是从外向内"灌进去"。需要 `Int` 时就 push `Int` 进去检查。类比：拼图先看槽位形状，再去找符合的块，不是反过来。

3. **ambient ability 向内传播**：当前作用域"自带哪些 effect 能力"是一个隐式集合——像房间里已经通了电，进来的电器不用每次重报"我要用电"。谁调你你就自带谁的能力；源代码里很少手写 effect 变量。

老式 Plotkin-Pretnar handler 常在签名里累加 effect 变量 `ε`；Koka 一类语言则显式写 effect row。Frank 反过来——签名主要写"我需要哪些"，能力从外层"灌"进来，读起来短得多。

## 实践案例

### 案例 1：State + Abort 一个 multihandler 同时处理

```ml
runST : {S -> <State S, Abort>X -> Maybe X}
runST s <get -> k>      = runST s (k s)
runST s <put s' -> k>   = runST s' (k unit)
runST _ <abort -> _>    = nothing
runST _ x               = just x
```

**逐部分解释**：

- 类型签名说 `runST` 接收一个状态种子 `s` 和一段计算，**那段计算的能力盒子里有 State 和 Abort 两种 effect**
- `<get -> k>` 的 `k` 是命令被打断时**剩下要做的事**（continuation）
- 4 条分支分别解释：读状态 / 写状态 / 中止 / 正常返回
- 没有 monad transformer 的 `lift`，没有效应栈次序，State 和 Abort 是平铺的
- 同一个 handler 可以拦"任意子集"——你给它一段只用 State 的程序，Abort 分支永远不会触发，签名也兼容

### 案例 2：非确定性——同一个 continuation resume 多次

```ml
allResults : {<Choose>X -> List X}
allResults <choose -> k> = append (allResults (k true))
                                  (allResults (k false))
allResults x             = [x]
```

`k` 是被命令打断时的"剩下要做的事"。普通异常 handler 只能扔掉 `k`；effect handler 可以**调它任意次**。这里调两次（`true` 一次、`false` 一次），效果是把所有可能分支都跑一遍——这就是非确定性的由来。

### 案例 3：pipe 把生产者消费者 zip 起来

```ml
pipe : {<Send X>Unit -> <Receive X>Y -> Y}
pipe <send x -> s>  <receive -> r>  = pipe (s unit) (r x)
pipe _              y               = y
```

一个 multihandler 同时拦两端：左边喊 `send`，右边喊 `receive`，handler 把消息从左 continuation 转给右 continuation。**这是协程**——但你看不到 yield、async、generator 任何关键字。

## 踩过的坑

1. **以为是 monad transformer 的语法糖**——Frank 的 multihandler 不是 stack，effect 之间没有先后；想当然用 `lift` 心智模型会立刻撞墙。
2. **想在签名里手写 effect 变量**——源代码大多数地方写空集即可，能力靠类型检查器从调用点向内 push；硬写反而和 ambient 机制冲突。
3. **把 effect handler 等同于异常 handler**——异常 handler 只能 `rethrow / swallow`，effect handler 可以 resume 0 次（abort）、1 次（state）、多次（非确定性）。
4. **直接照搬到 OCaml 5**——OCaml 5 的 effect 借鉴了 Frank 思想但语法不同（`Effect.Deep.try_with` 这种），multihandler 也没原样复刻。

## 适用 vs 不适用场景

**适用**：
- 同时处理多种副作用的研究语言（Eff / Koka / Idris-Eff / Frank 自己）
- 研究 effect 系统的形式语义、推理 / 重写规则
- 写需要"中断后多次恢复"的 DSL（解析回溯、非确定性、概率程序）
- 给 OCaml 5 / Multicore OCaml 写示例和讲解时拿 Frank 当参照

**不适用**：
- 工业项目当前主力代码——Frank 本身是研究原型，工程链路弱
- 团队没有 PL 背景：双向类型检查 + ambient ability 学习曲线陡
- 需要工业级 effect 处理：直接用 OCaml 5 / Koka，或者 [[effect]] 这种 TS 库

## 历史小故事（可跳过）

- **1991**：Moggi 用 monad 给副作用建模，催生 Haskell 的 do-notation。
- **2003**：Plotkin & Power 提出 algebraic effects，把"副作用"还原成"代数运算"。
- **2009**：Plotkin & Pretnar 给 algebraic effects 配上 handler，可表达更广。
- **2012**：Bauer & Pretnar 的 Eff 语言把 handler 工业化，但仍是 `handle ... with ...`。
- **2016 / 2017**：Frank 把 handler 与函数抽象合并，arXiv 1611.09259 → JFP 2017。
- **2022**：OCaml 5 正式发布 effect handler，思想脉络从 Plotkin → Pretnar → Frank 一路延续。

## 学到什么

1. **handler 和函数本质相同**——只是有没有解释命令的差别，把它们合一是 Frank 的关键洞见。
2. **bidirectional + ambient = 不再写 effect 变量**——类型系统替你管能力集合。
3. **continuation 不是黑魔法**——effect handler 把 continuation 当一等值传给 handler，决定 resume 几次。
4. **PL 创新常常是减语法**——少一个 `handle` 关键字，整个体系就轻盈。

## 延伸阅读

- 论文 PDF：[Do Be Do Be Do](https://arxiv.org/abs/1611.09259)（约 50 页 JFP 长文，例子密度极高）
- Sam Lindley 主页代码：[github.com/frank-lang/frank](https://github.com/frank-lang/frank)（参考实现）
- 视频：Conor McBride —— "Frank: a strict effect-typed FP language"（YouTube 上有 SPLS 录像）
- 配套对照：[[effect-handlers]] —— Plotkin-Pretnar 原始 algebraic effect 论文
- 入门讲义：Pretnar "An introduction to algebraic effects and handlers"（2015）
- OCaml 5 effect 上手：官方文档 "Effect Handlers" 章节，可对照本文案例 1 实操
- Eff 语言交互教程：[www.eff-lang.org](https://www.eff-lang.org)，Frank 的精神原型

## 关联

回到这条主线，可以按"语义—类型—工程"三方向延伸阅读。语义方向延伸到 [[plotkin-sos]] 与 [[reynolds-definitional-interpreters]]；类型方向继续 [[hindley-milner]]；工程方向看 [[effect-handlers]] 与 OCaml 5 实战。

下面这些 wikilink 标的话题在仓库里都已写过笔记，可以串成"effect 系统全景"路径阅读：

- [[effect-handlers]] —— 代数效应原始论文，Frank 的直接父辈
- [[ci-effects]] —— 早期 algebraic effect 在 Idris 上的实现
- [[coeffect-petricek]] —— 与 effect 对偶：追踪"需要哪些上下文"
- [[hindley-milner]] —— Frank 的双向类型在 HM 之上更进一步
- [[plotkin-sos]] —— Frank 用小步语义证明 soundness 的方法论来源
- [[lambda-calculus]] —— Frank 的求值核心仍是 λ-演算项
- [[reynolds-definitional-interpreters]] —— "用一种语言定义另一种"，handler 就是定义解释器

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ci-effects]] —— CI Effects — 持续集成不是免费午餐，价值看实现细节
- [[coeffect-petricek]] —— Coeffects — 让类型系统追踪「需要多少上下文」
- [[effect]] —— Effect — 给 TypeScript 装上"会跟踪错误和依赖"的副作用引擎
- [[effect-handlers]] —— 代数效应（Algebraic Effects）
- [[granule]] —— Granule — 让类型系统同时数次数、看安全级、追副作用
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[plotkin-sos]] —— Plotkin SOS — 用规则讲清楚程序"走一步"是什么
- [[reynolds-definitional-interpreters]] —— Reynolds Definitional Interpreters — 用一种语言去定义另一种语言

