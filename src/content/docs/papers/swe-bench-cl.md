---
title: 'SWE-Bench-CL — coding agent 不能只刷静态题'
description: '用 SWE-Bench-CL 理解软件工程 agent 的持续学习、迁移和灾难性遗忘。'
来源: 'Joshi et al., arXiv:2507.00014'
日期: 2026-07-14
分类: AI Agent / Software Engineering
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2507.00014v1
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2507.00014
  source_version: arXiv:2507.00014v1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v1
---

## 是什么

SWE-Bench-CL 是一个面向 **coding agent continual learning** 的 benchmark。它基于 SWE-Bench Verified，把 GitHub issues 按真实时间顺序组织成任务流，用来评估 agent 是否能积累经验、跨任务迁移，并避免灾难性遗忘。

类比：普通 SWE-bench 像期末考试抽题；SWE-Bench-CL 像真实入职一个仓库，今天修 bug，明天改 feature，下周处理回归。你不只要会做一道题，还要越做越懂这个仓库。

论文还提供 LangGraph-based evaluation framework，并加入 FAISS-backed semantic memory module，用来比较 memory-enabled 和 memory-disabled agents。

## 问题是什么

静态 coding benchmark 的默认假设是：每个问题独立出现，agent 做完就结束。但真实软件工程不是这样。一个仓库会持续演进，今天的修复会改变明天的上下文，前一个 issue 的定位经验也可能帮下一个 issue。

SWE-Bench-CL 关心的问题是：agent 能不能把历史任务变成有用经验，而不是每次都像第一次打开仓库。

这也带来反面问题：如果 agent 把旧经验用错，就会发生 catastrophic forgetting 或 negative transfer。持续学习不只是记住更多，还要知道哪些经验还适用。

## 为什么重要

软件工程 agent 的产品价值不在于单次 pass@1，而在于长期维护同一个 repo 时能否越来越快、越来越稳。

SWE-Bench-CL 提出一组 continual learning metrics，包括 average accuracy、forgetting、forward/backward transfer、tool-use efficiency，以及 Composite Continual Learning Score 和 CL-F-beta score。

这些指标把“做对题”拆成了时间维度：新任务做得好不好，旧能力有没有掉，过去经验是否帮助未来任务，未来修复是否反过来暴露过去理解的问题。

## 核心方法

SWE-Bench-CL 的结构可以这样看：

| 层 | 作用 |
|---|---|
| 数据层 | 从 SWE-Bench Verified 取人类验证过的 issue |
| 时间层 | 按仓库自然演进顺序组织任务 |
| 记忆层 | 用 FAISS semantic memory 存储和检索历史经验 |
| 编排层 | 用 LangGraph 组织 agent evaluation flow |
| 指标层 | 评估准确率、遗忘、迁移和工具效率 |

这让 benchmark 从“单点修 bug”变成“持续维护一个仓库”。它和 [[swe-bench]] 的关系不是替代，而是在 SWE-bench 上加时间轴和经验轴。

## 手工 toy 复现

想象一个仓库连续出现三个 issue：

| 时间 | issue | 没有记忆的 agent | 有好记忆的 agent |
|---|---|---|---|
| T1 | 登录测试失败 | 全仓搜索 auth | 记录 token 刷新入口 |
| T2 | OAuth 回调失败 | 再次从头找 | 先查同一认证模块 |
| T3 | 修复后旧登录测试回归 | 忘了 T1 约束 | 检查旧测试是否仍通过 |

SWE-Bench-CL 要测的是这种时间线上的能力：不是 T2 单独能否修好，而是 T1 的经验是否帮助 T2，同时 T2 的修改有没有破坏 T1。

## 踩过的坑

1. **把持续学习理解成简单 RAG**：检索历史只是入口，还要判断历史是否适用于当前版本。
2. **只看平均准确率会漏掉遗忘**：新题都做对但旧能力退化，长期维护仍然不可靠。
3. **仓库时间线很重要**：乱序任务会破坏真实软件演进的因果关系。
4. **记忆也可能负迁移**：相似 issue 不代表同一根因，错误复用会更快地失败。

## 学到什么

SWE-Bench-CL 把 coding agent 评测从“一次性解题”推进到“长期维护”。这和真实工程更接近：一个好 agent 不该只是会打补丁，还应该逐渐形成仓库地图、失败模式和验证习惯。

对 study 的 agent 线来说，它可以接在 [[swe-bench]] 和 [[memgym]] 后面读：SWE-bench 给任务底座，MemGym 讨论 memory 评测，SWE-Bench-CL 把 memory 放回持续软件工程时间线。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2507.00014>
- 代码：<https://github.com/thomasjoshi/agents-never-forget>
- [[swe-bench]]：原始软件工程 benchmark。
- [[memgym]]：agent memory 的统一评测环境。

## 关联

- [[swe-bench]]
- [[swe-agent]]
- [[memgym]]
- [[agentic-context-engineering-2025]]
- [[code-as-agent-harness]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
