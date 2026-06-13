---
title: Tomita GLR — 让 LR 解析器扛得住歧义文法
来源: Masaru Tomita, "An Efficient Augmented-Context-Free Parsing Algorithm", Computational Linguistics 1987（J87-1004，扩自 1985 CMU 博士论文）
日期: 2026-05-30
子分类: 类型与 PL 理论
分类: 编程语言
难度: 中级
provenance: pipeline-v3
---

## 是什么

**GLR**（Generalized LR）是把 1965 年 Knuth 的 LR 解析器**扩成能处理歧义文法**的算法。日常类比：原版 LR 像"沿一条单线轨道走，分岔就脱轨"；GLR 像"地铁分叉时让两班车同时走，到下一站再合并或丢"。

传统 LR 解析表里，每个"状态 + 输入符号"格子最多放**一个动作**（shift 或 reduce）。一旦塞两个就叫"冲突"，编译器报错让你改文法。GLR 直接说："冲突就冲突，**两条路都走，最后哪条能走到终点就要哪条**。"

代价是：栈不再是一根，而是**一张图**——这是 GLR 的标志性数据结构 **Graph-Structured Stack（GSS）**。

## 为什么重要

不理解 GLR，下面这些都没法解释：

- 为什么 **C++** 能被 parser 吃下来——`A<B<C>>` 里 `>>` 到底是右移运算符还是模板嵌套结尾？写死单一 LR 处理不了
- 为什么 **bison** 在 2003 年加了 `%glr-parser` 模式
- 为什么 **tree-sitter**（GitHub / Neovim 都在用）能做"增量、容错"代码高亮——它的 parser 内核是 GLR 改造版
- 为什么自然语言 parser（汉语、日语）能在 1985 年比 CYK / Earley 快很多
- 为什么 **ASF+SDF / Rascal / Stratego** 这类元编程工具链都选 GLR 作 parser 引擎

## 核心要点

### 1. 多动作表（Multi-Action Table）

传统 LR 表里 `(state, token)` 一格一动作；GLR 允许同一格放**多个动作**。比如同一个状态读到 `if` 既能 shift 又能 reduce——两个都试。

### 2. Graph-Structured Stack（GSS）

如果"两个都试"等于"复制整条栈"，n 次冲突就 2^n 条栈，立刻爆掉。Tomita 的洞见：**让分叉的栈共享公共前缀**。栈不再是链表，而是一张 DAG（有向无环图）。

直觉图（左边是栈底）：

```
        ┌── α ── X ──┐
栈底 ── │              ├── 共同后续
        └── β ── Y ──┘
```

α 和 β 是两条不同推导，X 和 Y 之后又汇成同一个状态时，**重新合并成一个节点**。整张图节点数和输入长度成多项式关系，不再爆炸。

### 3. Local Ambiguity Packing（局部歧义打包）

同一段输入被同一非终结符**用不同方式推出**时（比如 `a + b * c` 既能解成 `(a+b)*c` 又能解成 `a+(b*c)`），GLR 不把两棵树都存——把它们的**根节点合并成一个 packed node**，子树不同分支挂在下面。最后输出不是单棵 parse tree，而是 **parse forest**（共享表示，所有合法解析的紧凑形式）。

### 4. 复杂度

- **无歧义 / 接近 LR 的文法**：和原版 LR 一样**线性 O(n)**——这是相对 Earley / CYK 的最大卖点
- **任意歧义 CFG 最坏**：O(n³)，跟 Earley 同级
- 关键：**歧义代价只在歧义区域局部产生**，文法大部分是 LR 的就快

## 实践案例

### 案例 1：C++ 的 `>>` 怎么在 bison GLR 模式下解

```cpp
vector<vector<int>> v;
```

`>>` 词法上是一个 token。LR 表在该处既能：

- **shift** `>>` 当右移运算符（一些上下文确实如此）
- **reduce** 把它当作两个连续的 `>` 关闭模板

bison `%glr-parser` 让两条路同时走，等到后面看到分号 `;` 才确定 "右移在这里说不通"，丢掉那条分支。**消歧延后到有足够上下文时**——这正是人脑读 C++ 的方式。

### 案例 2：tree-sitter 为什么 parse 出错的代码也能高亮

tree-sitter 用 GLR 思路 + 增量更新。当你在 `func(a, b` 后还没敲 `)` 时：

- 传统 LR：直接报错，整棵树作废
- GLR：栈分叉中允许"假设这里有 `)`"和"假设这里继续是参数"两条路并行
- 你按下下一个键，tree-sitter 只重算受影响那一小段——不重新 parse 整个文件

这就是为什么 VSCode / Neovim 编辑大文件不卡。

### 案例 3：自然语言里的歧义

> "I saw the man with the telescope."

`with the telescope` 修饰 `saw`（我用望远镜看）还是 `the man`（拿望远镜的男人）？两种语法都对。GLR 把两棵树都放进 forest，**不挑**——挑选交给上层（语义、概率模型）。Tomita 当年就是为机器翻译这类需求做的算法。

## 踩过的坑

1. **空规则（ε-production）会让 reduce 死循环**：原版算法没处理好，Farshi 1991 / Scott-Johnstone 2006 RNGLR 才补完。自己手写 GLR 时**一定**要查这些后续修订。

2. **GSS 没共享好就指数爆**：实现时栈分叉必须真的合并相同节点；忘合并 = 写了个慢得离谱的 backtracking 解析器。

3. **歧义文法仍需消歧策略**：GLR 不消除歧义，只把决定**推迟**。最终你还是要给优先级、关联性、或者写"两棵树合并成一棵"的合并函数。bison `%glr-parser` 让你写 `%dprec` 和 `%merge`。

4. **报错信息难做**：LR 错误恢复的研究（[[pottier-merr]]）已经够难，GLR 里几条栈都活着时，"哪条才是用户真实意图"基本无解，只能先验把 forest 收敛再报错。

5. **不解决"文法本身有歧义"这件事**：如果你的语言文档里 `if-else` 没规定 dangling-else 倒向哪边，GLR 帮你 parse，但最终选哪棵树还是你自己定。

## 适用 vs 不适用场景

**适用**：

- 文法**真的有歧义**且你不想（或无法）改文法 —— C++、SQL 方言、自然语言
- 需要**容错 / 增量** parsing —— IDE / 编辑器（tree-sitter）
- 元编程语言 / 文法工程平台（SDF、Rascal）—— 用户自己加扩展时不想被冲突烦死
- LR(1) 表生成不出但又想要接近 LR 速度的场景

**不适用**：

- 文法本来就 LR(1) / LALR —— 直接用 yacc/bison 默认模式更简单更快
- 对**报错质量**要求极高的编译器前端 —— GLR 报错难做
- 需要**单一确定 parse tree** 的场景且不愿写消歧 —— GLR 给你 forest，挑还是要挑

## 历史小故事（可跳过）

- **1965**：Knuth 提出 LR 解析（[[knuth-lr-1965]]），但表大、纯 LR(1) 文法稀少
- **1969**：DeRemer 简化出 LALR（[[lalr-deremer]]），yacc 基础
- **1985**：Tomita 在 CMU 博士论文里造 GLR，目标是日语机器翻译
- **1987**：Computational Linguistics 期刊版（本论文）
- **1991**：Farshi 发现 ε-rule 漏洞并修补；同年 Tomita 主编《Generalized LR Parsing》合集
- **1992**：Rekers 在 SDF 里把 GLR 工业化
- **2003**：bison 加入 `%glr-parser` 选项
- **2006**：Scott-Johnstone 的 **RNGLR**（Right-Nulled GLR）从理论上完成空规则的正确处理
- **2018**：Max Brunsfeld 发布 **tree-sitter**，把 GLR 思路改造成增量 + 容错 parser，2020s 成为 GitHub / Neovim 默认语法引擎

## 学到什么

1. **"冲突就冲突，先全走"是一个反直觉但管用的工程思路**——把决策推迟到信息更多时
2. **栈也可以是图**：数据结构形态跟着算法需求走，不要被"栈是数组"卡死
3. **共享是降复杂度的核心**：GSS 节点共享、forest 子树共享，两次都把指数压成多项式
4. **理论 → 工业落地隔了 30 年**：1985 算法 → 2003 bison → 2018 tree-sitter，每一代都修一些理论遗留问题
5. **算法存活靠"接得上现有工具链"**：GLR 赢过 Earley/CYK 不是因为更快，而是因为**LR 部分跟 yacc/bison 一样**，迁移成本低

## 延伸阅读

- 论文 PDF：[Tomita 1987](https://aclanthology.org/J87-1004.pdf)（22 页，例子很多，能读）
- Scott & Johnstone 2006：["Right Nulled GLR Parsers"](https://dotat.at/tmp/gll.pdf) —— GLR 理论收尾
- McPeak 2004：[Elkhound / Elsa](https://scottmcpeak.com/elkhound/) —— C++ GLR parser 实战
- tree-sitter 论文：Brunsfeld 等，["Tree-sitter: An incremental parsing system"](https://tree-sitter.github.io/tree-sitter/) —— GLR 工业最新形态
- bison 手册 [GLR Parsers 章节](https://www.gnu.org/software/bison/manual/html_node/GLR-Parsers.html)

## 关联

- [[knuth-lr-1965]] —— LR 解析的源头，GLR 直接在它上面扩
- [[lalr-deremer]] —— LALR 简化版表，bison/yacc 的默认模式
- [[pottier-merr]] —— LR(1) 错误消息可达性，GLR 报错的难点正是它的反面
- [[compiler-errors]] —— 编译器错误信息的整体设计
- [[algol-60]] —— BNF 文法，GLR 的输入语言形态

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[algol-60]] —— ALGOL 60 — BNF 与块结构
- [[compiler-errors]] —— Compiler Error Messages — 让编译报错有用
- [[earley-parser]] —— Earley Parser — 一个表能解析任何 CFG 的通用解析器
- [[knuth-lr-1965]] —— Knuth LR(k) — 编译器自己读懂语法的算法
- [[lalr-deremer]] —— DeRemer LALR(1) — 把 LR 表压到能用大小
- [[pottier-merr]] —— Pottier LR(1) Reachability — 让 LR 解析器的错误消息覆盖完整
- [[tree-sitter-2018]] —— Tree-sitter — 增量式解析系统

