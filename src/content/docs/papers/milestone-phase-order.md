---
title: MileStone — 让编译器按能耗预算自己排优化顺序
来源: 'Amirhossein Sadr and Mehran Alidoost Nia, "MileStone: A Multi-Objective Compiler Phase Ordering Framework for Graph-based IR-Level Optimization", arXiv 2026'
日期: 2026-05-25
分类: 编译器
难度: 中级
---

## 是什么

MileStone 是一个**帮编译器自动选择优化 pass 顺序**的框架。日常类比：你要做一桌菜，不只是问“最快怎么做”，还要同时顾着煤气费、厨房空间和上菜时间；MileStone 就像一个会学习的厨房排程员。

在编译器里，pass 是一小步优化，比如内联函数、展开循环、删除没用代码。问题是：同一批 pass，顺序一换，最后程序的运行时间、体积、耗电量都可能变。

这篇论文把“排优化顺序”当成一个多目标问题：在能耗预算内，同时尽量降低执行时间和代码大小。它用 GNN 预测程序图的表现，再用 RL agent 探索 pass 顺序。

它的名字 MileStone 可以理解成“每一步优化都留下里程碑数据”：这次 pass 顺序、程序图、测到的速度和能耗都会进入数据库，下次模型就少走一点弯路。

## 为什么重要

不理解 MileStone，下面这些事就很难解释：

- 为什么 `-O3` 不是万能答案：它只是一套固定菜单，不会为每个程序重新权衡速度、体积和能耗。
- 为什么嵌入式设备不能只追求最快：省 0.2 秒如果多耗很多电，电池设备可能反而亏。
- 为什么编译优化像搜索问题：pass 之间会互相影响，先后顺序决定后面的优化机会还在不在。
- 为什么机器学习适合插进编译器：程序能变成图，优化序列能变成决策过程，模型可以从历史实验里学经验。
- 为什么“同一个程序换平台”会变复杂：CPU、缓存和功耗模型一变，原来最好的 pass 顺序可能不再最好。

## 核心要点

1. **程序先变成图**：MileStone 从 LLVM IR 抽出 CDFG（Control/Data Flow Graph，控制流+数据流图）：节点像路口，边像“控制会走到哪”和“数据从哪来”。这样图神经网络（GNN）看到的不是一串文本，而是程序内部的结构。

2. **预测器先估分**：GNNPP（GNN Performance Predictor，图神经网络性能预测器）先估代码大小、执行时间和能耗。类比：厨师还没真做菜，先根据菜单和厨房条件估计要多久、花多少燃气。

3. **强化学习再试顺序**：RLMOE（RL Multi-Objective Explorer，多目标强化学习探索器）把“下一步用哪个优化指令”当成动作，把能耗预算是否满足、速度和体积如何当成最终奖励。它不穷举所有 pass 序列，而是边试边学。

这三点合起来，MileStone 的重点不是“发明一个新 pass”，而是给已有 pass 找更适合当前约束的排列方法；探索结果还会写进 RLDBG（RL Database Generator，自更新实验库）供下一轮复用。

## 实践案例

### 案例 1：为什么固定 `-O3` 不够

```bash
clang -O3 kernel.c -o kernel
```

**逐部分解释**：

- `-O3` 是编译器工程师预先排好的 pass 序列。
- 它通常偏向“跑得快”，但不一定满足“能耗不能超过 2J”。
- MileStone 想替换的不是某一个 pass，而是“永远用固定菜单”的习惯。
- 如果程序是矩阵乘法、图算法、排序内核，最佳顺序也可能不同。

### 案例 2：把多目标问题写成约束

```text
target_energy = 2.0J
score = 0.5 * code_size + 0.5 * exec_time
goal = minimize(score) while energy <= target_energy
```

**逐部分解释**：

- `target_energy` 是用户给的电量上限。
- `score` 把代码大小和执行时间合成一个要最小化的目标。
- 真正难点是：某个 pass 可能让程序更快，却让代码更大或更耗电。
- 论文里的 `μ`（mu）是多目标标量化权重：调大更在意体积，调小更在意速度。

### 案例 3：RL agent 怎么选择下一步

```python
state = graph_embedding + program_metadata + energy_target
action = choose_next_directive(state)
reward = -size - time - abs(energy_target - predicted_energy)
```

**逐部分解释**：

- `graph_embedding` 来自 GNN，压缩了程序图的结构信息。
- `action` 表示给当前节点或阶段选一个优化指令。
- `reward` 越接近 0 越好，因为大小、时间和能耗偏差都被当成惩罚。
- 中间步骤奖励为 0，最后才结算，像下完整盘棋后再看输赢。

## 踩过的坑

1. **把 phase ordering 理解成“选 pass”**：真正难的是顺序，因为前一个 pass 会改变后一个 pass 能看到的程序形状。

2. **以为 GNN 直接输出最终 pass 序列**：论文里 GNNPP主要做性能预测，具体探索仍由 RL 模块完成。

3. **只看 45% 执行时间下降**：这个数字成立在“相同能耗预算”语境下，离开约束就容易误读。

4. **把 Pareto 最优当成一个答案**：多目标优化通常给一组折中方案，用户还要按速度、体积、能耗偏好选点。

## 适用 vs 不适用场景

**适用**：

- 需要在执行时间、代码大小、能耗之间做权衡的编译优化。
- LLVM / GCC 这类 pass 化、可插拔的编译器基础设施。
- 有足够 benchmark 和 profiling 数据，可以训练性能预测器的团队。
- 嵌入式、边缘设备、数据中心节能等有明确资源预算的场景。

**不适用**：

- 只想快速本地编译一次的小项目，训练和探索成本可能大于收益。
- 没有稳定测量环境的场景，能耗和时间标签噪声太大会误导模型。
- 编译器 pass 不能自由组合的工具链，搜索空间太小就发挥不出优势。
- 必须证明优化语义正确的场景；MileStone关注性能搜索，不替代验证。
- 需要解释每个优化选择的审计场景；RL 策略未必能给出人类可读理由。

## 历史小故事（可跳过）

- **2004 年**：LLVM 论文把 IR 和 pass 基础设施讲清楚，让“组合优化 pass”变得更工程化。
- **2007 年**：研究者开始系统评估启发式 phase order 搜索，说明穷举空间太大。
- **2017 年**：MiCOMP 用机器学习缓解 phase ordering，展示“从历史序列学经验”可行。
- **2020-2022 年**：IR2Vec、CORL、POSET-RL 等方法把程序表示和强化学习带进 pass 序列选择。
- **2026 年**：MileStone 把图表示、GNN 预测、多目标 RL 和自更新数据库放到同一个框架里。

## 学到什么

1. **编译优化不是单目标竞速**：真实部署常常要同时看速度、体积和能耗。

2. **程序图是 ML 进入编译器的桥**：CDFG 把控制流和数据流显式化，让模型能读到结构。

3. **预测器和探索器分工很关键**：GNNPP 负责便宜估分，RLMOE 负责在巨大顺序空间里做决策。

4. **结果要按约束读**：论文最有价值的结论不是“永远快 45%”，而是在同能耗预算下找到更好的折中点。

5. **自更新数据很重要**：RLDBG（自更新实验库）把探索结果继续变成训练材料，让下一轮预测和搜索更便宜。

## 延伸阅读

- 论文 PDF：[MileStone arXiv 2605.23435](https://arxiv.org/pdf/2605.23435)（本文来源）
- C. Lattner and V. Adve, "LLVM: a compilation framework for lifelong program analysis & transformation", CGO 2004.
- Amir H. Ashouri et al., "MiCOMP: Mitigating the Compiler Phase-Ordering Problem Using Optimization Sub-Sequences and Machine Learning", TACO 2017.
- Shalini Jain et al., "POSET-RL: Phase ordering for Optimizing Size and Execution Time using Reinforcement Learning", ISPASS 2022.
- Chris Cummins et al., "ProGraML: A Graph-based Program Representation for Data Flow Analysis and Compiler Optimizations", ICML 2021.
- [[llvm]] —— 理解 pass、IR 和优化管线的入口
- [[passnet-graph-compiler]] —— 同样把编译优化和图学习联系起来

## 关联

- [[llvm]] —— MileStone 的图生成和 pass 搜索都依赖 LLVM 这类模块化编译器。
- [[ssa]] —— LLVM IR 常用 SSA 形式，方便表达数据依赖和优化机会。
- [[chaitin-graph-coloring]] —— 都把编译问题转成图上的决策问题。
- [[graphsage-2017]] —— GNN 的邻居聚合直觉能帮助理解 CDFG 表示。
- [[passnet-graph-compiler]] —— 也是用图神经网络辅助编译器决策。
- [[xla-compiler]] —— 另一个把计算图和底层优化连接起来的编译系统。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
