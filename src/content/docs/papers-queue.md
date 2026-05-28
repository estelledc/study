---
title: 论文队列
description: 围绕"未来工程师"4 个学科方向精选的 20 篇论文——按季度展开
sidebar:
  order: 4
---

> **20 不是 200**。200 是凑数，凑数学不到判断力。每篇严格按 [8 层方法](/study/papers-method/)
> 走完 Layer 4 复现——复述 200 篇 abstract 不如复现 20 篇 figure。

## 选篇标准（5 条硬门槛）

每篇必须同时满足：

1. **有官方 repo / 第三方实现 / 能手算 toy** —— L4 复现是硬门槛
2. **2026 视角下"为什么仍然该读"理由清楚** —— 奠基 / 当前 SOTA 的"敌人" / 被超越但思路仍活
3. **能找到至少 1 篇前作 + 1 篇后作** —— 单点论文写不出 Layer 5
4. **和你正在做的项目 / 学习实践能连得上** —— L6 不能空着
5. **PDF 篇幅 ≤ 30 页**（综述类除外）

## 进行中

**第 9 篇**：MapReduce (Dean & Ghemawat, OSDI 2004)

---

## 4 季度（约 20 篇慢笔记）

### Season A · AI Agent / LLM 系统（5 / 5 完成 ✅）

| # | 论文 | 关键判断 |
|---|------|---------|
| 1 | [**ReAct: Synergizing Reasoning and Acting**](/study/papers/react/) (Yao et al., NeurIPS 2022) ✅ | "think-act-observe" 循环的祖宗——直接对应 Claude Code agent loop |
| 2 | [**Chain-of-Thought Prompting Elicits Reasoning**](/study/papers/cot/) (Wei et al., NeurIPS 2022) ✅ | reasoning trace 为什么有用——ReAct 的根，emergent ability 的支点 |
| 3 | [**Reflexion: Language Agents with Verbal RL**](/study/papers/reflexion/) (Shinn et al., NeurIPS 2023) ✅ | ReAct 没 retry 的硬伤怎么补——加自我反思层 |
| 4 | [**Toolformer: LLM Can Teach Themselves to Use Tools**](/study/papers/toolformer/) (Schick et al., 2023) ✅ | 工具调用从 prompt 路线到 self-supervised 微调路线的分叉 |
| 5 | [**SWE-bench: Can LLMs Resolve Real GitHub Issues?**](/study/papers/swe-bench/) (Jimenez et al., ICLR 2024) ✅ | 把 agent 思路从 demo 推到真工程任务的基准 |

**这一季回答的问题**：从 ReAct 到 SWE-bench 这 2 年，agent 范式经历了什么取舍？
chain-of-thought / acting / reflection / tools 这 4 件事是怎么从分散的 paper 拼成今天的产品形态的？

---

### Season B · 经典 CS / 系统设计（1 / 5 完成）

| # | 论文 | 关键判断 |
|---|------|---------|
| 6 | [**In Search of an Understandable Consensus Algorithm (Raft)**](/study/papers/raft/) (Ongaro & Ousterhout, USENIX 2014) ✅ | 把"可读性"当成研究贡献——共识协议从 Paxos 的天书走到能教学的版本 |
| 7 | [**The Google File System**](/study/papers/gfs/) (Ghemawat et al., SOSP 2003) ✅ | 大文件 + 顺序读 + 节点频繁失败的工程现实如何反向定义文件系统接口 |
| 8 | **MapReduce: Simplified Data Processing on Large Clusters** (Dean & Ghemawat, OSDI 2004) | "限制表达能力换可扩展性"的范式典范——和 LangGraph 现在做的事是一脉 |
| 9 | **Time, Clocks, and the Ordering of Events** (Lamport, 1978) | 分布式系统的"时间"为什么不是物理时钟——逻辑时钟与因果序的奠基 |
| 10 | **Dynamo: Amazon's Highly Available Key-value Store** (DeCandia et al., SOSP 2007) | NoSQL 的源头——把 CAP 里的 AP 路线推到生产边界 |

**这一季回答的问题**：当代 AI / 应用工程师为什么还要读 70-00 年代的系统论文？
答：你今天在 LangGraph / Temporal / Cloudflare Durable Objects 里遇到的所有"分布式问题"，
源头都在这 5 篇。

---

### Season C · 前端 / 编译器 / 工具链（1 / 5 完成）

| # | 论文 | 关键判断 |
|---|------|---------|
| 11 | [**A Prettier Printer**](/study/papers/wadler-prettier/) (Wadler, 1998) ✅ | esbuild / biome / Prettier 的 IR 思路源头——一个 16 页论文定义了一代 formatter 的设计语言 |
| 12 | **Self-Adjusting Computation** (Acar et al., POPL 2002) | Solid / Svelte 5 runes / Jotai 的祖宗——"细粒度响应式"的理论根 |
| 13 | **Trees that Grow** (Najd & Peyton Jones, JFP 2017) | TypeScript / Babel / SWC 的 AST 设计典范——"扩展点 + 类型安全"如何同时拿到 |
| 14 | **Push-Pull Functional Reactive Programming** (Elliott, ICFP 2009) | RxJS / SolidJS / Effect 的反应式编程理论——push 和 pull 不是二选一 |
| 15 | **Adapton: Composable, Demand-Driven Incremental Computation** (Hammer et al., PLDI 2014) | "增量计算"在编译器与 IDE 工具链的工程实现——rust-analyzer / Salsa 的源头 |

**这一季回答的问题**：你日常用的"快"工具（esbuild / Vite / rust-analyzer）背后，
快的不是工程优化，是 80-10 年代 PL 研究奠定的算法。

---

### Season D · DX 实证研究（0 / 5 完成）

| # | 论文 | 关键判断 |
|---|------|---------|
| 16 | **The Impact of AI on Developer Productivity (GitHub Copilot RCT)** (Peng et al., 2023) | AI 协作时代第一篇严肃 RCT——"Copilot 让你快了 X%"这种数字方法学上稳吗 |
| 17 | **What Makes a Great Software Engineer?** (Li et al., ICSE 2015) | "工程师素质"用人类学方法访谈 59 个 Microsoft 资深工程师后归纳出的 53 条 |
| 18 | **Do Developers Read Compiler Error Messages?** (Barik et al., ICSE 2017) | 眼动追踪 + 调查：工程师其实不看错误信息——这事直接改变了 Rust / Elm / Svelte 的 error UX |
| 19 | **Empirical Studies of Pair Programming** (Hannay et al., IST 2009) | 18 个 RCT 元分析——pair programming 真的"两倍人力换 1.5 倍质量"吗？ |
| 20 | **The Effects of CI on Software Development** (Ståhl & Bosch, JSS 2014) | CI 这件事的实证基础——你信奉的"快速反馈循环"有多硬的数据 |

**这一季回答的问题**：编程是工程也是人类活动。"AI 让工程师更快"/"pair programming 更好"
这些经验之谈，谁真的做过 RCT？看完这 5 篇你会对"软件开发是不是科学"有更冷静的判断。

---

## 已消化

- [ReAct (Yao et al., NeurIPS 2022)](/study/papers/react/)（2026-05-28）— L4 用 Claude 跑了 1 题完整 trajectory；与 Brittle Foundations 2024 一并读
- [A Prettier Printer (Wadler, 1998)](/study/papers/wadler-prettier/)（2026-05-28）— L4 100 行 Python 复现，width=30 输出与论文逐字一致；S3 季节开篇
- [Chain-of-Thought (Wei et al., NeurIPS 2022)](/study/papers/cot/)（2026-05-28）— L4 跑同一道 GSM8K 风格题在 standard / CoT 两种 prompt 下对照
- [ReAct (Yao et al., 2022)](/study/papers/react/) **重构版**（2026-05-28）— 用 deep-paper-note 15 步结构 + paper-comic 3 张 sketchnote 图（codex imagegen 生成 + webp 压缩）+ phd-skills 7 阶段复现，作为后续 18 篇的"状元篇"模板
- [Reflexion (Shinn et al., NeurIPS 2023)](/study/papers/reflexion/)（2026-05-28）— L4 跑了一题 trial-error-reflect 完整循环，用 sr_0 反思修正 trial 2 答案；含 2 张 figure（架构 + Algorithm 1）
- [Toolformer (Schick et al., 2023)](/study/papers/toolformer/)（2026-05-28）— L4 手算 self-supervised filter（Calculator vs Calendar 反例）；含 2 张 figure（pipeline + 两条路线对比）
- [SWE-bench (Jimenez et al., ICLR 2024)](/study/papers/swe-bench/)（2026-05-28）— L4 读源码确认 F2P/P2P grading 协议；含 2 张 figure（评测流程 + 3-stage 数据 pipeline）。**Season A 完结篇**
- [Raft (Ongaro & Ousterhout, USENIX 2014)](/study/papers/raft/)（2026-05-28）— L4 5 节点 toy 选举/故障/split vote 三场景手算；含 2 张 figure（状态机 + vs Paxos）。**Season B 开篇**
- [GFS (Ghemawat et al., SOSP 2003)](/study/papers/gfs/)（2026-05-28）— L4 read/write/atomic-append 三场景手算；含 2 张 figure（架构 + 不做 vs 才做）

---

## 关于"为什么是这 20 篇，不是别的"

候选偏见：

- **不收纯 survey** — survey 是别人嚼过的二手知识，对培养判断力价值低
- **不收无 repo 的大规模训练论文** — L4 跑不了，进不了队列
- **不收 venue 影响力存疑的论文**（除非作者本人值得追） — workshop / 会议 short paper 慎选
- **优先收"和站点已有项目笔记能交叉引用的"** — Wadler 入选因为 esbuild + biome 笔记都引用过它
- **优先收"前后作清晰的"** — 单点论文写不出 Layer 5
- **AI Agent 季节多收近 2 年的** — 这是动态最快的领域，2024-2026 视角必读
- **经典系统季节优先读 70-00 年代** — 当代系统论文质量参差，但经典论文经过时间筛选

如果你觉得某篇该进或该出，可以提"X 应该进，因为 Y"——
反例能改我的判断。
