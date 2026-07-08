---
title: COMPOSE — 用引用图和 Mathlib 图预测未来定理
来源: 'David Busbib and Michael Werman, "COMPOSE: Composing Future Theorems from Citations and Formal Structure", arXiv 2026'
日期: 2026-07-08
分类: machine-learning
难度: 中级
---

## 是什么

日常类比：你想猜一位厨师明年会做什么新菜，不能只看他以前的菜单，也要看厨房里已经准备好的食材和工具。

COMPOSE 做的事很像这个猜菜问题：它想根据一篇数学论文，生成一个“未来可能出现的定理式主张”。

这里有两条线索：

- **引用图**：这篇论文引用了谁，哪些旧论文真正影响了它。
- **形式图**：论文里的非形式化定理，能不能对应到 Lean / Mathlib 里的正式定理，以及这些正式定理依赖谁。

一句话说：COMPOSE 是一个双图生成框架，把“学术脉络”与“形式依赖”合在一起，让语言模型别只会写像数学的话，而是更贴近真正可能被证明的数学方向。

## 为什么重要

不理解 COMPOSE，下面这些事会很难解释：

- 为什么只看论文摘要，模型容易写出“主题对但定理错”的未来工作。
- 为什么形式化数学库不只是证明工具，也能告诉模型“哪些结论有依赖基础”。
- 为什么同一个数学概念在论文里和 Lean 里长得完全不同，对齐会成为瓶颈。
- 为什么评估“未来定理生成”不能只看文字相似，还要看能否检索到真实未来论文。

## 核心要点

1. **科学图：看研究往哪里走**。类比：看地图上的道路。COMPOSE 先从 anchor paper 出发，保留最相关的引用论文，再抽取论文中的定理、引理、命题，形成带类型的科学图。

2. **形式图：看数学能不能站住**。类比：看楼房承重墙。系统把论文里的非形式化定理和 Mathlib 的自然语言描述做检索匹配，再沿 Lean 依赖边扩展出局部形式图。

3. **双图融合：让模型同时看方向和约束**。类比：一个人负责市场趋势，一个人负责工程可行性，最后一起给方案。两个 GNN 分别编码科学图和形式图，再用 cross-attention 融合，最后喂给数学语言模型生成未来主张。

## 实践案例

### 案例 1：把一篇论文变成科学图

```python
anchor = "paper A"
citations = pick_relevant_citations(anchor, first_hop=5, second_hop=3)
theorems = extract_statements(citations, kinds=["theorem", "lemma"])
scientific_graph = connect(anchor, citations, theorems)
```

**逐部分解释**：

- `anchor` 是当前论文，也就是要预测未来工作的起点。
- `pick_relevant_citations` 不把参考文献全塞进去，而是挑正文中反复被证明、主结果依赖的引用。
- `extract_statements` 抽取 theorem / lemma / proposition / definition 这类结构化节点。
- `scientific_graph` 同时保留论文之间的引用边，以及论文到定理节点的结构边。

### 案例 2：把非形式化定理接到 Mathlib

```python
paper_claim = "Every finite cyclic group has exponent equal to its order."
match = retrieve_from_frenzymath(paper_claim, top_k=1)
if match.score >= 0.84:
    formal_root = match.mathlib_theorem
    formal_graph = expand_lean_dependencies(formal_root, hops=3)
```

**逐部分解释**：

- `paper_claim` 是论文里的自然语言数学句子。
- `retrieve_from_frenzymath` 查的是 Mathlib 定理的自然语言说明，不是直接让模型写 Lean。
- `0.84` 是论文采用的高置信阈值，低于它就丢弃弱匹配。
- `expand_lean_dependencies` 找出这个正式定理证明中依赖的周边定理。

### 案例 3：生成时别让模型忽略图

```python
science_vec = science_gnn(scientific_graph)
formal_vec = formal_gnn(formal_graph)
fused = cross_attention(science_vec, formal_vec)
claim = math_decoder.generate(anchor_title, graph_context=fused)
```

**逐部分解释**：

- `science_gnn` 负责学“哪些论文和定理在同一条研究线上”。
- `formal_gnn` 负责学“哪些 Mathlib 定理能支撑哪些结论”。
- `cross_attention` 让两边互相看见，不只是简单拼接。
- `graph_context=fused` 是关键：decoder 每步生成时都能回看双图上下文。

## 踩过的坑

1. **把未来生成当普通摘要任务**：摘要只要说像原论文，未来定理还要指向未出现但合理的下一步。

2. **只看引用图会飘**：引用能告诉模型研究方向，但不能保证生成的数学主张有形式依赖支撑。

3. **只看 Mathlib 会窄**：形式库知道什么能证明，却不知道当前学术社区最想往哪里推进。

4. **对齐质量会拖后腿**：如果某个子领域在 Mathlib 覆盖稀疏，错误匹配会把生成拉向不相关的形式定理。

## 适用 vs 不适用场景

**适用**：

- 想研究“AI 能不能预测数学论文的未来贡献”的任务。
- 有大量论文、引用关系、定理抽取结果，并且能接上形式数学库。
- 想比较“纯文本生成”和“结构化图条件生成”的差别。
- 需要把 Lean / Mathlib 依赖图引入机器学习模型。

**不适用**：

- 需要直接产出可由 proof assistant 检查的完整证明。
- 目标领域几乎没有 Mathlib 覆盖，形式图可能变成噪声源。
- 只想做一般科研选题推荐，不要求定理级数学主张。
- 没有可靠的论文全文、引用上下文和定理抽取流程。

## 历史小故事（可跳过）

- **2020 年**：Mathlib 论文系统介绍 Lean 数学库，证明形式库可以社区化扩张。
- **2023 年**：LeanDojo 把 Lean 证明环境、数据和检索增强模型整理成可复现实验平台。
- **2024 年**：FrenzyMath 提供大量 Mathlib 定理的自然语言描述，让“非形式化到非形式化”检索变得实用。
- **2025 年**：FutureGen、ResearchAgent 等系统把“预测科研未来工作”做成生成任务，但大多还停留在文本和引用层。
- **2026 年**：COMPOSE 把 arXiv 引用图和 Mathlib 依赖图放到同一个生成框架里，专门面向未来数学主张。

## 学到什么

- **未来定理不是凭空写出来的**：它必须同时接续研究脉络，并尊重已有数学依赖。
- **图结构补的是“关系”**：文本 embedding 知道句子像不像，图能告诉模型谁引用谁、谁依赖谁。
- **形式化不等于全自动证明**：COMPOSE 用 Lean 依赖来约束生成，但生成结果本身还没有被证明器验证。
- **评估要看落点**：它用 47K 篇未来论文池检索，问生成文本能不能把真实未来论文排到前面。

## 延伸阅读

- 论文主页：[COMPOSE project page](https://david-busbib.github.io/COMPOSE-page/)。
- arXiv PDF：[COMPOSE: Composing Future Theorems from Citations and Formal Structure](https://arxiv.org/pdf/2605.30333v1.pdf)。
- [[lean-prover]] —— 理解 Lean / Mathlib 为什么能提供形式依赖图。
- [[graphsage-2017]] —— GNN 为什么适合把邻居信息揉进节点表示。
- [[attention]] —— cross-attention 如何让科学图和形式图彼此对齐。
- [[theorems-for-free]] —— 另一种“从结构推出定理”的经典思路。

## 关联

- [[lean-prover]] —— COMPOSE 的形式图来自 Lean / Mathlib 生态。
- [[graphsage-2017]] —— 双 GNN 编码器属于图神经网络路线。
- [[attention]] —— 双图融合和 decoder 条件生成都依赖注意力机制。
- [[theorems-for-free]] —— 都在讨论程序或结构本身能约束可成立的结论。
- [[deepseek-r1]] —— 论文实验使用 DeepSeek-Math 系列模型做编码和生成背景。
- [[futuregen-2025]] —— 合理预测会存在的未来工作生成基线笔记。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
