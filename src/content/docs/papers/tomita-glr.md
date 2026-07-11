---
title: Tomita GLR — 让 LR 解析器扛得住歧义文法
来源: Masaru Tomita, "An Efficient Augmented-Context-Free Parsing Algorithm", Computational Linguistics 1987（J87-1004，扩自 1985 CMU 博士论文）
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

**GLR**（Generalized LR）是把 1965 年 Knuth 的 LR 解析器**扩成能处理歧义文法**的算法。日常类比：原版 LR 像"沿一条单线轨道走，分岔就脱轨"；GLR 像"地铁分叉时让两班车同时走，到下一站再合并或丢"。

传统 LR 解析表里，每个"状态 + 输入符号"格子最多放**一个动作**（shift 或 reduce）。一旦塞两个就叫"冲突"，编译器报错让你改文法。GLR 直接说："冲突就冲突，**两条路都走，最后哪条能走到终点就要哪条**。"

代价是：栈不再是一根，而是**一张图**——标志性数据结构 **Graph-Structured Stack（GSS）**。有了 GSS，冲突不再等于"改文法或放弃"。

## 为什么重要

不理解 GLR，下面这些都没法解释：

- 为什么 **C++** 能被 parser 吃下来——`A<B<C>>` 里 `>>` 到底是右移运算符还是模板嵌套结尾？写死单一 LR 处理不了
- 为什么 **bison** 在 2003 年加了 `%glr-parser` 模式
- 为什么 **tree-sitter**（GitHub / Neovim 都在用）能做"增量、容错"代码高亮——它的 parser 内核是 GLR 改造版
- 为什么自然语言 parser（汉语、日语）能在 1985 年比 CYK / Earley 快很多
- 为什么 **ASF+SDF / Rascal / Stratego** 这类元编程工具链都选 GLR 作 parser 引擎

## 核心要点

### 1. 多动作表（Multi-Action Table）

传统 LR 表里 `(state, token)` 一格一动作；GLR 允许同一格放**多个动作**。类比：十字路口红灯黄灯同时亮——两条路都先开进去。比如读到 `else` 既能 shift 又能 reduce，两个都试。

### 2. Graph-Structured Stack（GSS）

如果"两个都试"等于"复制整条栈"，n 次冲突就 2^n 条栈。Tomita 的洞见：**分叉栈共享公共前缀**，栈变成 DAG。类比：地铁共用干线，只在分岔段多开一列车。

直觉图（左边是栈底）：

```
        ┌── α ── X ──┐
栈底 ── │              ├── 共同后续
        └── β ── Y ──┘
```

α、β 汇成同一状态时**合并成一个节点**；节点数相对输入长度是多项式级，不再指数爆炸。

### 3. Local Ambiguity Packing（局部歧义打包）

同一段输入被同一非终结符用不同方式推出时（如 `a+b*c` 的两种结合），不存两棵完整树，而把根合成 **packed node**（像文件夹里两个版本共用同一封面）。输出是 **parse forest**——所有合法解析的紧凑共享表示。

### 4. 复杂度

- 接近 LR 的文法：**线性 O(n)**（相对 Earley/CYK 的卖点）
- 任意歧义 CFG 最坏：约 **O(n³)**（RNGLR 等修订后）
- 实践：代价主要落在歧义局部，其余仍接近 LR

## 实践案例

### 案例 1：bison `%glr-parser` 怎么延后消歧

C++ 里 `vector<vector<int>> v;` 常被拿来说明「冲突先挂着」：词法可能把 `>>` 合成一个 token，声明语境下又像两个模板结束符。教学上把它当成**延后消歧**示意，不必当成真实 C++ 词法的唯一实现。

可跟做的迷你文法（dangling-else）：

```yacc
%glr-parser
%%
stmt: IF expr THEN stmt           %dprec 1
    | IF expr THEN stmt ELSE stmt %dprec 2
    ;
```

**逐步**：① 表在 `ELSE` 处 shift/reduce 冲突，两条都进 GSS；② 读完输入后两条都合法则靠 `%dprec` 选；③ 若某分支后面归约失败就丢弃。C++ 模板场景同理：看到 `;` 后「当右移」说不通，留下模板关闭。

### 案例 2：tree-sitter = GLR 歧义 + 增量，容错是另一层

tree-sitter 内核是 **GLR 改造**：文法真有歧义（如 JS 里某段既像表达式又像类型）时，多条栈并行，合法的进 forest。

**逐步**：① 冲突 → GSS 分叉；② 你改文件中部，只重算受影响区间（增量）；③ 缺 `)` 这类**非法**输入靠 ERROR 节点容错——**不是** GLR「假设补上括号」。GLR 管合法歧义；增量与容错是额外工程。

### 案例 3：自然语言歧义进 forest

> "I saw the man with the telescope."

`with the telescope` 修饰 `saw` 还是 `the man`？两种都合法。GLR 两棵都打包进 forest，**不挑**；语义/概率模型再选。Tomita 原为机器翻译做的。

## 踩过的坑

1. **空规则（ε-production）**：原版 reduce 可能死循环；Farshi 1991 / Scott-Johnstone 2006 **RNGLR** 才补完——手写前必查。
2. **GSS 忘合并**：分叉不共享 = 指数级 backtracking，看起来像 GLR、跑起来像灾难。
3. **仍要消歧**：GLR 只推迟决定；bison 用 `%dprec` / `%merge`，否则 forest 里多棵树你还得自己挑。
4. **报错难**：多条栈都活着时难猜用户意图（对照 [[pottier-merr]]）；dangling-else 没写清规则时，GLR 也只是把两棵树都给你。

## 适用 vs 不适用场景

**适用**：

- 文法**真有歧义**且改不动 —— C++、SQL 方言、自然语言
- 需要**增量**重解析（tree-sitter）；无歧义段仍望接近 **O(n)**
- 文法工程平台（SDF、Rascal）——用户加扩展时不想被冲突卡死

**不适用**：

- 已是 LR(1)/LALR —— 默认 yacc/bison 更简单更快
- **报错质量**优先的编译器前端 —— GLR 报错难做
- 只要**一棵**确定树又不想写消歧 —— forest 仍要你挑

## 历史小故事（可跳过）

- **1965**：Knuth LR（[[knuth-lr-1965]]）；**1969**：DeRemer LALR（[[lalr-deremer]]）
- **1985–87**：Tomita CMU 论文 → CL 期刊版（本论文），目标日语 MT
- **1991–92**：Farshi 修 ε；Rekers 在 SDF 工业化 GLR
- **2003 / 2006**：bison `%glr-parser`；Scott-Johnstone **RNGLR** 收尾空规则
- **2018**：tree-sitter 把 GLR 思路做成增量+容错，进入 GitHub / Neovim

## 学到什么

1. **"冲突先全走"**——信息不够时推迟决策，比硬改文法更工程
2. **栈可以是图**：GSS/forest 用共享把指数压成多项式
3. **理论到工具链要几十年**：1985 → 2003 bison → 2018 tree-sitter
4. **接得上 yacc/bison 才易活**：迁移成本往往比纯速度更决定胜负——同一张 LR 表思路，只是冲突改成多走几条路

## 延伸阅读

- 论文 PDF：[Tomita 1987](https://aclanthology.org/J87-1004.pdf)（22 页，例子多）
- Scott & Johnstone 2006：[Right Nulled GLR Parsers](https://doi.org/10.1145/1146809.1146810)（TOPLAS，RNGLR）
- McPeak 2004：[Elkhound / Elsa](https://scottmcpeak.com/elkhound/) —— C++ GLR 实战
- tree-sitter：[增量解析文档](https://tree-sitter.github.io/tree-sitter/) —— GLR 工业形态
- bison 手册 [GLR Parsers](https://www.gnu.org/software/bison/manual/html_node/GLR-Parsers.html)

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

