---
title: 博弈论语义与 PCF — 把程序解释成两个人轮流下的对话棋
来源: 'Abramsky, Jagadeesan & Malacaria, "Full Abstraction for PCF", Information and Computation 163, 2000'
日期: 2026-05-30
分类: 编程语言
难度: 高级
---

## 是什么

博弈论语义（**game semantics**）把程序解释成 **两个人对话**——程序是一方（叫 **Player**，简写 P），程序运行环境是另一方（叫 **Opponent**，简写 O），两人轮流出招，**问**（Question，Q）和**答**（Answer，A）交替进行。所以每一步动作有四种标签：OQ / PQ / OA / PA，记住这四个字母组合，下面案例都靠它读。

日常类比：像点餐。**Opponent**（顾客）问"你这有什么吃的"（OQ），**Player**（服务员）回"披萨"（PA）。顾客追问"配什么饮料"（OQ），服务员回"可乐"（PA）。一来一回，每一手都"接得上"上一手——这就是一段合法的"博弈过程"。

`Full Abstraction for PCF` 这篇论文用这种"轮流对话"的玩法，给一个简单的小语言 PCF（**P**rogramming language for **C**omputable **F**unctionals，Plotkin 1977 提出，是 typed lambda 演算 + 自然数 + 不动点 + if zero 的最小集）造了一个数学模型：每个类型 = 一种棋的规则；每个程序 = 棋的一种下法（叫 **strategy** 策略）。

PCF 的"完全抽象 (full abstraction) 问题"悬了 17 年没人解，AJM 用这套博弈语义首次给出答案。技术上他们证明了三件事：

- **definability**（可定义性）：每个紧致策略都能在 PCF 里写出对应的项
- **extensional collapse**（外延坍缩）：把策略按"行为相同"商掉后，得到的就是完全抽象模型
- **universality**（万有性）：每个递归策略都对应某个 PCF 项

后面三段会展开这三句话怎么变成具体的对话规则。

## 为什么重要

不理解它，下面这些事都没法解释：

- 为什么 1977 年 Plotkin 提出后，整个 PL 圈花了 17 年都没找到 PCF 的"标准模型"——直到 1993 年才有解
- 为什么 `parallel-or` 这种 PCF 写不出来的函数，会出现在 Scott 连续函数模型里——它怎么"漏进来"的
- 为什么近年 Reactive Programming、Session Types、Process Calculus 都借了博弈语义的概念
- 为什么"程序 = 对话"这种看法和"程序 = 函数"这种看法是两种世界观，对编译器与并发的影响完全不同

## 核心要点

博弈语义解决 PCF full abstraction 的关键有 **三步**：

1. **类型 → 棋局 (arena)**：每个 PCF 类型对应一组合法的"问与答"。比如 `int` 类型的棋只有两手——Opponent 问"什么数？"，Player 答"3"。函数类型 `int → int` 是更复杂的棋——Player 可以反问 Opponent 输入。类比：拼图盒子上印着"哪些块能拼到一起"。

2. **程序 → 策略 (strategy)**：策略是 Player 的一本应招手册——Opponent 这么走，我就那么应。AJM 要求策略 **history-free**：每一手只能看上一手 Opponent 出的招，不能翻历史。类比：象棋选手只看对手刚下的一步，不查棋谱。这看上去会让表达力变弱，但 AJM 用一个"允许复制对话片段"的算子 `!`（来自线性逻辑 Linear Logic）把表达力补回来——具体名字叫 **comonad**，可以理解为"按需重播之前的某段对话"。

3. **限制让模型干净**：还要求 **well-bracketed**（问题与答案像括号一样正确嵌套）+ **alternation**（严格 P/O 交替）。这两条把 `parallel-or`（要同时观察两个参数）和 `call/cc`（破坏括号）等"非 PCF"的元素自动排除掉。

三条加起来：紧致策略恰好就是 PCF 项可以定义出来的全部——这叫 **definability theorem**。再对策略集取 intrinsic preorder 的商，就得到 **fully abstract** 的扩展模型。论文最后还加了一个 **Universality Theorem**：任何递归策略都对应某个 PCF 项，反过来也成立。

换句话说："PCF 项 ↔ 满足三条约束的策略"是双向唯一的——这就是论文要的"语法无关刻画"。

## 实践案例

### 案例 1：最简单的对话——`if zero(x) then 0 else 1`

把这个 PCF 项当成 Player 的策略，Opponent 给 x 的值，Player 输出结果。每个 move 在论文里都有四种 P/O × Q/A 的标签：

```
Opponent: "结果是什么？"     (问输出，这是 OQ)
Player:   "你 x 是几？"       (反问输入，这是 PQ)
Opponent: "是 0"              (回答上面 PQ，这是 OA)
Player:   "那答案是 0"        (回答最初 OQ，这是 PA)
```

四步对话结束。如果 Opponent 第三步答 "是 5"，Player 第四步就答 "1"。**整段对话就是这个程序的语义**——程序不再是函数，而是这套问答规则。注意 well-bracketed：内层 OA 配 PQ，外层 PA 配 OQ，括号正确嵌套。

### 案例 2：parallel-or 为什么"不在棋里"

`parallel-or` 想做的事是：两个布尔参数任一为 `true` 就立刻返回 `true`，不要 sequential 求值。如果硬当成策略：

```
Opponent: "or(p, q) 结果？"        (OQ)
Player:   "p 是几？同时 q 是几？"  ← 想同时问两个参数
```

但 alternation 规定一手只能问一个。**违反交替性**——Player 一手只能在一个 component 里出招（论文 Proposition 2.3 叫 Switching Condition）。所以 game model 自动把它排除。Scott 模型却能装下它——这就是 Scott 模型 sound 但不 fully abstract 的根因。

### 案例 3：call/cc 为什么也不在 PCF 棋里

`call/cc`（Scheme 的 continuation 操作符）允许跳出当前调用栈：

```
function 调用 g 问问题       ← 开括号 (
g 还没答，但调用了 call/cc
后续问题被"跳过"，直接回到之前某个点  ← 中间括号被跨过
```

用括号表示问与答：开括号永远还没合就跳走了——**违反 well-bracketed**。Game model 自动拒绝，所以 PCF + call/cc 需要换一套游戏规则（去掉 well-bracketed 约束，对应 Laird 的 control games）。这种"放松一个约束就匹配一种语言特性"的弹性，是博弈语义后来风靡的关键：

| 放松哪个约束 | 多出来什么语言特性 |
|---|---|
| 去掉 well-bracketed | call/cc、continuation |
| 去掉 innocence / history-free | 局部状态（Idealized Algol） |
| 去掉 alternation | 并发、parallel-or |

## 踩过的坑

1. **把 game semantics 当 game theory**：这不是 Nash 均衡那种"找最优策略"的博弈，是对话游戏（dialogue game），没有 payoff，只关心"Player 能不能合法接住每一手 Opponent"——本质是逻辑学血统（Lorenzen 的对话证明论），不是经济学血统。

2. **把 full abstraction 等同于 soundness**：sound 只要"M=N 模型也相等"；fully abstract 还要反向——"模型相等 ⟹ 上下文无法区分"。Scott 模型 sound 但不 full，因为它含 PCF 写不出的 parallel-or，模型里有"语言看不到的多余东西"。

3. **以为 history-free 策略表达力很弱**：恰恰相反，AJM 用 `!` comonad（Linear Logic 的"重复"运算）让策略可以 backtrack 和 copy，限制 history-free 是为了得到 PCF 的"恰好这么多"——多一点就装下 parallel-or，少一点就漏掉合法 PCF 项。

4. **混淆 AJM 模型和 Hyland-Ong 模型**：两者都 fully abstract 且同期独立完成，但 AJM 走 history-free + linear logic 路线，HO 走 innocent strategy + views 路线。结果一样，证法和后续推广方向差很多——HO 的 views 后来被 Murawski 等人压成正则语言用于 model checking，AJM 路线更易接 Geometry of Interaction。

## 适用 vs 不适用场景

**适用**：
- 给函数式语言找精确的数学语义（PCF / Idealized Algol / FPC）
- 验证程序等价：把两段代码翻译成策略对比，比上下文枚举可靠得多
- 推广到含状态、控制（Idealized Algol、call/cc 语言）——只要相应放松 well-bracketing 等约束
- 与 Linear Logic / Geometry of Interaction / Process Calculi 接轨的语义研究
- Second-Order Idealized Algol 模型检验（Ghica-McCusker 把策略压成正则语言，可机器判定等价）

**不适用**：
- 用语义指导**编译器优化**——博弈语义是观察等价的判定工具，不是中间表示，跑不动
- 教零基础读者"程序怎么执行"——它是 denotational 的抽象数学模型，用来推等价不是用来求值
- 命令式 + 共享内存 + 高并发场景（如 Java、C++）——需要更多扩展（concurrent games），还没成熟
- 工业语言（Haskell、OCaml 完整版）——这些超出 PCF，full abstraction 仍是开放问题
- Finitary PCF 的可判定等价——Loader 1996 已证明不可判定，模型只能给 intensional 描述

## 历史小故事（可跳过）

- **1977 年**：Plotkin 在 *LCF Considered as a Programming Language* 提出 PCF full abstraction 问题——Scott 连续函数模型 sound 但漏进 parallel-or，怎么造一个干净的？
- **1979–1991**：Berry 的 stable functions、Berry-Curien 的 sequential algorithms、Bucciarelli-Ehrhard 的 strongly stable 都尝试过，都不完全成功——要么仍含非顺序的元素，要么过强含非函数的"oracle"。
- **1993 年 6 月**：Abramsky、Jagadeesan、Malacaria 在邮件列表公布 game semantics 解；同年 9 月 Hyland 与 Ong 独立给出 innocent strategies 版本，Hanno Nickau 也独立得到。三组人 1993 年几乎同时解决了 17 年的难题。
- **1994 年**：AJM extended abstract 在 Sendai 的 TACS 会议宣讲；2000 年 Information and Computation 发表完整版。
- **1996 年**：Loader 证明 Finitary PCF 的观察等价不可判定——说明 intensional 模型（含无限多策略）是必然的，无法压缩。
- **2000s**：博弈语义被推广到 Idealized Algol（Abramsky-McCusker，含状态）、并发 PCF、概率 PCF（Probabilistic PCF）等多种语言扩展。

## 学到什么

1. **程序 = 对话**：除了"程序 = 函数"（Scott 模型）和"程序 = 状态变换"（命令式），博弈语义提供了第三种世界观——程序是 Player 与 Opponent 之间的对话过程，每一手都受类型规则约束
2. **限制即表达力**：不是"约束越少越好"，而是"约束精确卡在 PCF 边界"才能 fully abstract——多一分太多（把 PCF 项排除掉），少一分太少（漏进 parallel-or）
3. **同时独立发现**：1993 年三组人独立解出，说明问题"成熟到该被解决"——技术潮汐到了，前面 17 年的失败积累足够多线索
4. **理论输出工具**：博弈语义之后被推广到 Idealized Algol（含状态）、Erratic PCF（含非确定）、并发等许多场景，成了 PL 语义的通用框架

## 延伸阅读

- 论文 PDF：[Full Abstraction for PCF](https://www.cs.ox.ac.uk/people/samson.abramsky/pcf.pdf)（130 页正文，中后段很硬，前 10 页是好导论）
- Hyland-Ong 同期独立工作：[On Full Abstraction for PCF](https://www.sciencedirect.com/science/article/pii/S0890540100928930)（信息计算 2000，innocent strategies 路线）
- 视频讲座：[Samson Abramsky — Game Semantics](https://www.youtube.com/results?search_query=abramsky+game+semantics)（多场会议主题报告，看 Marktoberdorf 那场最系统）
- 综述：Abramsky & McCusker, *Game Semantics*（1999），把博弈语义讲成 PL 语义教材的章节
- 推广读物：Ghica-McCusker, *The Regular Language Semantics of Second-Order Idealized Algol*（把博弈策略压成正则语言，可以做模型检验）
- [[plotkin-sos]] —— 提出 PCF 问题的 Plotkin 还做过结构化操作语义
- [[scott-strachey-denotational]] —— Scott 模型是 game model 要超越的对象

## 关联

- [[lambda-calculus]] —— PCF 的语法骨架是 simply-typed λ-calculus 加自然数与不动点
- [[plotkin-sos]] —— Plotkin 1977 论文同时提出 PCF 和 SOS，是这套问题的源头
- [[scott-strachey-denotational]] —— 经典指称语义；game semantics 是它的"加强版替代品"
- [[hindley-milner]] —— 都是 PL 理论的里程碑，但 HM 关心类型推导，game 关心运行时等价
- [[linear-types]] —— AJM 模型用 Linear Logic 的 `!` comonad，与线性类型系出同源
- [[kahn-natural-semantics]] —— natural semantics 也用推理过程描述程序，但是树形非对话形
- [[algol-60]] —— Idealized Algol 的扩展是博弈语义最早的下一步推广，加进了赋值与 block 结构
- [[bidirectional-typing]] —— 都用"两个角色交替"的视角描述程序结构，思路精神接近

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
