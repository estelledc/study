---
title: 论文全景索引
description: 20 篇论文按 type / 时代 / Season / 状态 / 主题 多维索引——防止队列扩到 100 时检索困难
sidebar:
  order: 5
  label: 论文全景索引
---

> 这是 [论文推荐队列](/study/papers-queue/) 的**正交补充**。
> 队列按 Season 时间线展开（叙事性），这里按 type / era / topic 多维分类（检索性）。
> 100 篇时仍能快速定位。

## 总览

| 维度 | 分布 |
|---|---|
| 总数（已写） | 20（Season A-D 各 5） |
| 总数（计划） | + Season E 5 篇 = 25 / 长期目标 100 |
| Type 分布（v1.1） | method 11 / empirical 5 / theory 3 / benchmark 1 |
| 时代分布 | 1970s 1 / 1990s 1 / 2000s 6 / 2010s 5 / 2020s 7 |
| 状态分布 | ✅ 状元 2 / ⏳ 重构中 1 / ⬜ 待重构 17 |

## 主表（按主题 cluster + 年份排序）

状态：✅ 状元篇（v1.1 合格）/ ⏳ 重构中 / ⬜ 待重构（v1 默认）/ 🆕 待写

### Cluster 1 · Agent / LLM Systems

| # | 论文 | Type | Era | 状态 |
|---|---|---|---|---|
| A1 | [Chain-of-Thought (Wei 2022)](/study/papers/cot/) | method | 2020s | ⬜ |
| A2 | [ReAct (Yao 2022)](/study/papers/react/) | method | 2020s | ⬜ |
| A3 | [Reflexion (Shinn 2023)](/study/papers/reflexion/) | method | 2020s | ⬜ |
| A4 | [Toolformer (Schick 2023)](/study/papers/toolformer/) | method | 2020s | ⬜ |
| A5 | [SWE-bench (Jimenez 2024)](/study/papers/swe-bench/) | benchmark | 2020s | ⬜ |
| E1 🆕 | SWE-agent (Yang 2024) | method | 2020s | 🆕 计划 |
| E5 🆕 | Anthropic Circuits (Elhage 2021) | theory | 2020s | 🆕 计划 |

### Cluster 2 · Distributed Systems

| # | 论文 | Type | Era | 状态 |
|---|---|---|---|---|
| B1 | [Lamport Time-Clocks (1978)](/study/papers/lamport-1978/) | theory | 1970s | ⬜ |
| B2 | [GFS (Ghemawat 2003)](/study/papers/gfs/) | method | 2000s | ⬜ |
| B3 | [MapReduce (Dean 2004)](/study/papers/mapreduce/) | method | 2000s | ⬜ |
| B4 | [Dynamo (DeCandia 2007)](/study/papers/dynamo/) | method | 2000s | ⬜ |
| B5 | [Raft (Ongaro 2014)](/study/papers/raft/) | method | 2010s | ⬜ |
| E3 🆕 | Spanner (Corbett 2012) | method | 2010s | 🆕 计划 |
| E4 🆕 | Kafka (Kreps 2011) | method | 2010s | 🆕 计划 |

### Cluster 3 · Programming Languages / Reactive

| # | 论文 | Type | Era | 状态 |
|---|---|---|---|---|
| C0 | [A Prettier Printer (Wadler 1998)](/study/papers/wadler-prettier/) | method | 1990s | ⬜ |
| C1 | [Self-Adjusting (Acar 2002)](/study/papers/self-adjusting/) | method | 2000s | ⬜ |
| C2 | [Push-Pull FRP (Elliott 2009)](/study/papers/push-pull-frp/) | theory | 2000s | ⬜ |
| C3 | [Adapton (Hammer 2014)](/study/papers/adapton/) | method | 2010s | ⬜ |
| C4 | [Trees that Grow (Najd 2017)](/study/papers/trees-that-grow/) | theory | 2010s | ⬜ |

### Cluster 4 · Developer Experience Empirical

| # | 论文 | Type | Era | 状态 |
|---|---|---|---|---|
| D1 | [Pair Programming Meta (Hannay 2009)](/study/papers/pair-programming/) | empirical | 2000s | ✅ |
| D2 | [What Makes Great SWE (Li 2015)](/study/papers/great-swe/) | empirical | 2010s | ⏳ |
| D3 | [Compiler Errors (Barik 2017)](/study/papers/compiler-errors/) | empirical | 2010s | ✅ |
| D4 | [Copilot RCT (Peng 2023)](/study/papers/copilot-rct/) | empirical | 2020s | ⬜ |
| D5 | [CI Effects (Ståhl 2014)](/study/papers/ci-effects/) | empirical | 2010s | ⬜ |

### Cluster 5 · Multimodal / Vision（计划，Season E）

| # | 论文 | Type | Era | 状态 |
|---|---|---|---|---|
| E2 🆕 | CLIP (Radford 2021) | method | 2020s | 🆕 计划 |

## 视图 1：按 Type（v1.1 论文类型）

- **method (11)**：ReAct, CoT, Reflexion, Toolformer, Raft, GFS, MapReduce, Dynamo, Self-Adjusting, Adapton, Wadler-Prettier
- **empirical (5)**：Copilot RCT, Great SWE, Compiler Errors, Pair Programming, CI Effects
- **theory (3)**：Lamport, Push-Pull FRP, Trees that Grow
- **benchmark (1)**：SWE-bench

## 视图 2：按时代

- **1970s (1)**：Lamport
- **1990s (1)**：Wadler-Prettier
- **2000s (6)**：GFS, MapReduce, Dynamo, Self-Adjusting, Push-Pull FRP, Pair Programming
- **2010s (5)**：Raft, Adapton, Trees that Grow, Great SWE, Compiler Errors, CI Effects
- **2020s (7)**：ReAct, CoT, Reflexion, Toolformer, SWE-bench, Copilot RCT, CI Effects（注：CI Effects 跨 Ståhl 综述与 2010-2020 多年）

## 视图 3：按状态

### ✅ 状元篇（2 / 20，10%）
- [pair-programming](/study/papers/pair-programming/) — empirical meta-analysis 状元（568 行）
- [compiler-errors](/study/papers/compiler-errors/) — empirical eye-tracking 状元（647 行）

### ⏳ 重构中（1 / 20，5%）
- great-swe（Season D 最后一篇 empirical）

### ⬜ 待重构（17 / 20，85%）
按薄弱度排序：great-swe → ci-effects → copilot-rct → cot → push-pull-frp → gfs → trees-that-grow → adapton → wadler-prettier → lamport-1978 → self-adjusting → dynamo → mapreduce → toolformer → swe-bench → reflexion → raft → react

### 🆕 待写（80 篇规划中）
完整 roadmap 见 [STATUS-PAPERS.md](https://github.com/estelledc/study/blob/main/STATUS-PAPERS.md) 的「后续 Season」段。Season E-T 共 16 季 × 5 篇。

## 路径建议

### 想理解 LLM Agent 演化
按时间线读：CoT → ReAct → Toolformer → Reflexion → SWE-bench → SWE-agent (待写)

### 想入门分布式系统
按"理论 → 实战"读：Lamport → Raft → GFS → MapReduce → Dynamo → Spanner (待写)

### 想理解响应式编程根
按时间线读：Wadler-Prettier → Self-Adjusting → Push-Pull FRP → Adapton → Trees that Grow

### 想用证据决策 SE 实践
按主题挑：PP（合作）→ Great SWE（个人特质）→ Compiler Errors（工具 UX）→ Copilot RCT（AI 编码）→ CI Effects（流程）
