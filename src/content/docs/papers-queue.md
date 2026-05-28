---
title: 论文队列
description: 围绕"未来工程师"4 个学科方向精选的论文——5 篇试水起步
sidebar:
  order: 4
---

> **5 不是 50**。先做 5 篇质量过硬的（每篇都按 [8 层方法](/study/papers-method/) 走完
> Layer 4 复现），再决定要不要扩到 20 篇。复述 50 篇 abstract 不如复现 5 篇 figure。

## 选篇标准（5 条硬门槛）

每篇必须同时满足：

1. **有官方 repo 或者能手算 toy 例子**——L4 复现是硬门槛，没办法跑数字的论文不进队列
2. **2026 视角下"为什么仍然该读"理由清楚**——可能是奠基 / 可能是当前 SOTA 的"敌人" / 可能是被超越但思路仍活
3. **能找到至少 1 篇前作 + 1 篇后作**——单点论文进不来，必须能展开谱系
4. **和你手上的实际工作能连得上**——L6 不能空着
5. **PDF 篇幅 ≤ 30 页**——超过 30 页的论文（如长 survey）单独处理，不进起步队列

## 进行中

**第 2 篇**：A Prettier Printer (Wadler 1998)（待启动）

---

## 5 篇试水（4 方向覆盖）

| # | 论文 | 方向 | 关键判断 |
|---|---|---|---|
| 1 | [**ReAct: Synergizing Reasoning and Acting in Language Models**](/study/papers/react/) (Yao et al., NeurIPS 2022) ✅ | AI agent | "think-act-observe" 循环的祖宗——直接对应 Claude Code 的 agent loop |
| 2 | **In Search of an Understandable Consensus Algorithm (Raft)** (Ongaro & Ousterhout, USENIX 2014) | 经典 CS / 系统 | 共识协议的"可读性优先"路线——证明 simplicity 也能是研究贡献 |
| 3 | **A Prettier Printer** (Wadler, 1998) | 编译器 / 工具链 | esbuild / biome 笔记里反复引用的 IR 思路源头——闭环 |
| 4 | **The Impact of AI on Developer Productivity: Evidence from GitHub Copilot** (Peng et al., 2023) | DX 实证 | AI 协作时代第一篇严肃 RCT——"未来工程师"叙事的实证基础 |
| 5 | **SWE-bench: Can Language Models Resolve Real-World GitHub Issues?** (Jimenez et al., ICLR 2024) | AI agent 评测 | 把"AI 能做工程师吗"从 demo 变成 benchmark——和 ReAct 配对读 |

### 这 5 篇试水回答的元问题

- AI agent loop 是怎么从论文走到产品的？（1 + 5 形成 demo → benchmark 闭环）
- "可读性"作为研究贡献，能多硬？（2）
- 项目笔记里随手引用的"经典"，到底有多硬？（3 — 验证 esbuild / biome 笔记的源头）
- "Copilot 让你快了 X%" 这种数字，方法学上真的稳吗？（4）

---

## 候选池（试水合格后，从这里扩）

### AI agent / LLM 系统

- **Toolformer: Language Models Can Teach Themselves to Use Tools** (Schick et al., 2023)
- **Voyager: An Open-Ended Embodied Agent with Large Language Models** (Wang et al., 2023)
- **Reflexion: Language Agents with Verbal Reinforcement Learning** (Shinn et al., 2023)
- **Tree of Thoughts: Deliberate Problem Solving with Large Language Models** (Yao et al., 2023)
- **Chain-of-Thought Prompting Elicits Reasoning in Large Language Models** (Wei et al., 2022) — ReAct 前作
- **Constitutional AI: Harmlessness from AI Feedback** (Bai et al., 2022) — Anthropic
- **DSPy: Compiling Declarative Language Model Calls into Self-Improving Pipelines** (Khattab et al., 2023)

### 经典 CS / 系统设计

- **The Google File System** (Ghemawat et al., SOSP 2003)
- **MapReduce: Simplified Data Processing on Large Clusters** (Dean & Ghemawat, OSDI 2004)
- **Time, Clocks, and the Ordering of Events in a Distributed System** (Lamport, 1978)
- **Bigtable: A Distributed Storage System for Structured Data** (Chang et al., OSDI 2006)
- **Dynamo: Amazon's Highly Available Key-value Store** (DeCandia et al., SOSP 2007)
- **The Part-Time Parliament (Paxos)** (Lamport, 1998) — Raft 前作

### 前端 / 编译器 / 工具链

- **Self-Adjusting Computation** (Acar et al., 2008) — Solid / Svelte runes 的祖宗
- **A Catalogue of Optimizing Transformations** (Allen & Cocke, 1972) — 编译器优化经典
- **Adapton: Composable, Demand-Driven Incremental Computation** (Hammer et al., PLDI 2014)
- **Push-Pull Functional Reactive Programming** (Elliott, 2009) — FRP
- **Trees that Grow** (Najd & Peyton Jones, 2017) — 类型化 AST 设计

### DX 实证研究

- **Programmer Productivity Self-Assessment** (Murphy-Hill et al., MSR 2019)
- **What Makes a Great Software Engineer?** (Li et al., ICSE 2015)
- **The Effects of Continuous Integration on Software Development** (Ståhl & Bosch, JSS 2014)
- **Empirical Studies of Pair Programming** (Hannay et al., IST 2009)
- **Do Developers Read Compiler Error Messages?** (Barik et al., ICSE 2017)

---

## 已消化

- [ReAct (Yao et al., NeurIPS 2022)](/study/papers/react/)（2026-05-28）— L4 用 Claude 跑了 1 题完整 trajectory；与 Brittle Foundations 2024 一并读

---

## 关于"为什么是这 5 篇，不是别的"

候选偏见：

- **不收纯 survey** — survey 是别人嚼过的二手知识，对培养判断力价值低
- **不收无 repo 的大规模训练论文** — L4 跑不了，进不了起步队列
- **不收 venue 影响力存疑的论文**（除非作者本人值得追） — workshop / 会议 short paper 慎选
- **优先收"和站点已有项目笔记能交叉引用的"** — Wadler 的 Prettier Printer 入选，因为 esbuild + biome 笔记都引用过它
- **优先收"前后作清晰的"** — 单点论文写不出 Layer 5

如果你觉得某篇该进或该出，可以提"X 应该进，因为 Y"——
反例能改我的判断。
