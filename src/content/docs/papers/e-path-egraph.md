---
title: E-Path — 把 CFG 优化从单行通道改成候选池
来源: 'Guillermo Garcia, "E-Path: Equality Saturation for Control-Flow Graphs", arXiv 2605.28694, 2026'
日期: 2026-07-08
分类: compilers-pl
难度: 中级
---

## 是什么

E-Path 是一种想把 **e-graph 那套"先保留很多等价写法，再挑最便宜写法"** 搬到控制流图（CFG）上的编译器结构。日常类比：以前你整理路线，只能在地图上擦掉旧路线、画新路线；E-Path 像在地图旁边放一个路线候选夹，旧路线、新路线、绕路方案都先留着，最后按成本挑一条。

传统 equality saturation 很擅长表达式，比如 `a + b` 和 `b + a` 可以放进同一个等价类。但 CFG 里有基本块、跳转、循环、分支，直接塞进表达式树会很别扭。

这篇论文的核心选择是：不要拿单个表达式当 congruence 单位，而是拿 **instruction sequence** 当单位。一个 rewrite 不再"改掉"原 CFG，而是向 E-Path 里加入一条新的等价 E-Sequence。

所以读这篇时先别急着问"它有没有打赢 LLVM pass"。更准确的问题是：如果我们不想在 CFG 上一次次擦写，能不能先造一个容器，把多个控制流版本都安全放进去？

## 为什么重要

不理解 E-Path，下面这些事会说不清：

- 为什么编译器优化常被 pass 顺序影响：前一个 pass 把 IR 改掉后，后一个 pass 只能在改后的世界里继续。
- 为什么 e-graph 在代数表达式上漂亮，到循环和分支时就难受：表达式天然像树，CFG 天然像带回边的路网。
- 为什么 LICM 这种老优化还值得重讲：它暴露了"移动循环不变量时要不要丢掉原版本"这个选择。
- 为什么"非破坏式优化"不只是工程洁癖：保留多个版本后，extractor 才能全局比较成本。

## 核心要点

1. **E-Sequence 是候选路线**：E-Path 里的每个 E-Sequence 是一段从 CFG 抽出来的指令序列。类比：每张路线卡都描述"从哪里走到哪里"，但卡片本身不一定列出每个岔路细节。

2. **rewrite 只增加，不覆盖**：论文把 E-Path 设计成 monotonic set，新优化结果插进去，旧结果还在。类比：做草稿时不涂黑旧方案，而是另开一页。

3. **最后用 cost extraction 决定落地版本**：系统可以给循环体、基本块、序列估成本，再选最小的候选。类比：旅行前先列三条路线，最后按时间、油费、拥堵一起评分。

这三点合起来，E-Path 做的不是"发明一个全新优化"，而是把已有优化换成一种更晚提交、更容易组合的表达方式。

## 实践案例

### 案例 1：传统 CFG 优化会直接改图

```text
loop_header(i):
    c = iconst 42
    one = iconst 1
    next_i = add i, one
    loop_back(next_i)
```

**逐部分解释**：

- `c = iconst 42` 每轮循环都算同一个常量，所以它是 loop-invariant。
- 传统 LICM 会把它搬到循环前的 preheader，然后原循环体就被覆盖。
- 覆盖本身没错，但它意味着后续 pass 看不到"没搬之前"的候选版本。

### 案例 2：E-Path 把搬前搬后都留下

```text
P = {
  S0: [iconst 42, iconst 1, add, loop_back],
  S1: [preheader(iconst 42), iconst 1, add, loop_back]
}
```

**逐部分解释**：

- `S0` 是原始循环序列，`S1` 是 LICM 产生的新序列。
- 两者都在同一个 equivalence set 里，表示它们语义等价。
- 后续 rewrite 可以继续作用在 `S0` 或 `S1` 上，而不是只能沿着一条已经提交的路走。

### 案例 3：extractor 用成本选最终序列

```python
def loop_cost(iterations, body_cost):
    return iterations * body_cost

best = min(candidates, key=lambda s: cost(s))
```

**逐部分解释**：

- `iterations * body_cost` 对应论文里的 symbolic loop cost。
- `candidates` 就是 E-Path 里共存的 E-Sequences。
- 这个例子故意简单：真实编译器还要考虑分支、内存、副作用、代码体积，但核心动作就是"先保留，再选择"。
- 如果 cost model 认为 `iconst 42` 搬出循环更便宜，extractor 就选 `S1`；如果某个目标机器上搬出去反而破坏布局，它也可以保留 `S0`。

## 踩过的坑

1. **把 E-Path 当成普通 e-graph**：普通 e-graph 的等价类主要包表达式节点，E-Path 包的是 CFG 派生的指令序列，粒度不同。

2. **以为 monotonic 就一定省内存**：monotonic 的意思是不覆盖旧候选，候选会增长，所以论文需要 hash consing 和结构去重。

3. **以为 rewrite 自动证明正确**：E-Path 本身不生成语义证明，正确性来自外部已经验证的 rewrite 规则。

4. **忽略 prototype 的边界**：当前实现基于受限 ANF CFG，只支持无环序列和 reducible loops，还没处理 aliasing、memory effects、speculation。

## 适用 vs 不适用场景

**适用**：

- 想研究 CFG-native equality saturation，而不是先把控制流规整成表达式树。
- 想把 LICM、loop unrolling、constant propagation 这类 pass 改写成候选生成规则。
- 想保留多个控制流版本，等全局成本模型最后再做取舍。
- 编译器 IR 足够规整，可以把基本块组织成可匹配的 sequence。

**不适用**：

- 需要立刻替换生产编译器完整优化管线的场景；论文还是 prototype。
- 大量不可规约控制流、异常、指针别名和内存副作用混在一起的 IR。
- 没有可信 rewrite 规则的系统；E-Path 不会替你证明 rewrite 保语义。
- 成本模型很弱的优化；候选留再多，最后也可能选不准。

## 历史小故事（可跳过）

- **1970s-1990s**：CFG 和数据流分析成为优化编译器主干，pass 通常按固定顺序破坏式改 IR。
- **1991 年**：Cytron 等人把 SSA 构造和控制依赖图工程化，CFG + SSA 成为主流优化底座。
- **2009 年**：Tate 等人提出 equality saturation，用 e-graph 同时保存许多表达式等价形态，缓解 phase ordering。
- **2021 年**：egg 把 e-graph 做成实用库，让 equality saturation 从理论味道变成可复用工程工具。
- **2026 年**：E-Path 试着把这个思路直接推到 CFG：不先规整成树，而是在 CFG-native 序列上做 rewrite。

## 学到什么

1. **phase ordering 的另一种解法是延迟承诺**：不要每个 pass 立刻拍板，先把候选放进同一个等价空间。
2. **控制流需要新的 congruence 单位**：表达式节点太小，基本块图又太乱，instruction sequence 是这篇选的折中层。
3. **非破坏式不等于免费**：保留历史版本会带来增长压力，必须靠 hash、dedup 和 fixed point 控制。
4. **原型价值在方向，不在完备性**：这篇最重要的贡献是提出 CFG-native eqsat 的表示路线，而不是宣称已经覆盖完整工业 IR。
5. **读论文要看它选择的抽象层**：E-Path 没把"表达式"或"整张图"当核心，而是选了 sequence，这个选择决定了它能匹配什么、会遇到什么代价。

## 延伸阅读

- 论文 PDF：[E-Path: Equality Saturation for Control-Flow Graphs](https://arxiv.org/pdf/2605.28694v1.pdf)（4 页，先看 running example）
- 经典起点：[Tate et al. 2009 — Equality Saturation](https://dl.acm.org/doi/10.1145/1480881.1480915)（提出把很多等价程序一起保留）
- 工程化工具：[egg: Fast and Extensible E-graphs](https://arxiv.org/pdf/2004.03082)（理解现代 e-graph 生态）
- CFG 背景：[[ssa]] —— E-Path 讨论的 CFG 优化通常站在 SSA/类 SSA IR 上
- 数据流背景：[[kildall-dataflow]] —— 传统 pass 的"沿 CFG 求不动点"思路
- phase ordering 背景：[[lerner-seminal]] —— 优化之间互相创造机会的问题

## 关联

- [[ssa]] —— CFG + SSA 是传统优化编译器的主要工作台
- [[kildall-dataflow]] —— 数据流框架解释传统 CFG pass 怎么传播事实
- [[lerner-seminal]] —— E-Path 想缓解的 phase ordering 与这里高度相关
- [[llvm]] —— LLVM 展示了工业 IR 和 pass pipeline 的现实复杂度
- [[z3-2008]] —— SMT 里的 e-graph 用于 congruence closure，和 equality saturation 同源
- [[cousot-abstract-interpretation]] —— 都是在"保守地表示许多可能状态"和"最后提取可用结论"之间取舍

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
