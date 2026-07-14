---
title: 'MemGym — 给长程 agent memory 做一间健身房'
description: '用 MemGym 区分聊天记忆、执行记忆和可迁移的 agent 经验。'
来源: 'Xu et al., arXiv:2605.20833'
日期: 2026-07-14
分类: AI Agent / Memory
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2605.20833v1
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2605.20833
  source_version: arXiv:2605.20833v1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v1
---

## 是什么

MemGym 是一个面向 **长程 LLM agent memory** 的 benchmark。它不只测模型能不能记住用户偏好，而是测 agent 在长时间执行任务时，能不能形成、压缩、检索并复用有用记忆。

类比：聊天记忆像记住朋友喜欢喝冰美式；MemGym 关心的是一个实习生做了三周项目后，能不能把踩坑、代码结构、工具限制和成功路径沉淀成下次能用的经验。

论文把多个 agent gym 和自建 memory-grounded pipeline 统一到一个 memory-reasoning interface 下，并覆盖 tool-use dialogue、deep research、coding 和 computer use 等场景。

## 问题是什么

很多 memory benchmark 停留在多轮聊天：问你我叫什么、喜欢什么、昨天说过什么。这类任务能测 retention，但不一定能测 agent 做事时的动态记忆。

真实 agent memory 更难：它要在任务过程中决定哪些观察值得留下，如何压缩不丢关键条件，什么时候检索，检索后又如何不污染当前推理。

MemGym 的核心问题是：记忆系统能不能在 coding、web navigation、deep research 这些真实执行环境里帮 agent，而不是只在聊天问答里拿高分。

## 为什么重要

MemGym 的一个关键贡献是 memory-isolated scores。它试图把 memory performance 从 reasoning、retrieval 和 tool-use ability 里拆出来，让不同记忆策略可以更公平地比较。

这点很重要，因为一个 agent 做错任务，可能是不会推理，也可能是没检索到记忆，也可能是记忆压缩质量差。没有隔离分数，就容易把所有失败都归因给模型或工具。

它和 [[reflexion]]、[[voyager]] 的关系是：Reflexion 和 Voyager 都强调经验回写；MemGym 更像给这些经验回写系统提供一套统一训练场和评测口径。

## 核心方法

MemGym 覆盖五个 evaluation tracks，并归到四类 agentic regimes：

| Regime | Track / 场景 |
|---|---|
| tool-use dialogue | tau2-bench |
| deep research search | MEMGYM-DR |
| coding | SWE-Gym 和 MEMGYM-CODEQA |
| computer use | WebArena-Infinity |

论文还为 MEMGYM-CODEQA 和 MEMGYM-DR 构建了 length-controllable 的合成 pipeline，并在各阶段做 ablation verification。

为了让 coding 环境评测更容易跑，论文训练了 MemRM：一个 Qwen3-1.7B + QLoRA 的轻量 reward model，用来快速评分 compression quality，替代完整 Docker rollout 的高成本读取。

## 手工 toy 复现

假设 agent 要连续修 3 个同仓库 bug：

| 任务 | 新观察 | 好记忆应该留下什么 |
|---|---|---|
| bug 1 | 登录失败来自 `AuthService` 的 token 过期 | token 刷新入口和测试命令 |
| bug 2 | 类似错误出现在移动端适配层 | “先查 AuthService，再查 adapter” 的排查路线 |
| bug 3 | 失败日志不同但根因仍是 token 刷新 | 复用路线，同时避免把旧日志当新事实 |

MemGym 要测的不是 agent 是否死记每段日志，而是它能否把“可迁移经验”压缩出来，并在新任务里正确检索。

## 踩过的坑

1. **记忆越多不等于越好**：未经筛选的历史会制造噪声，甚至把过期结论带进新任务。
2. **聊天记忆不能代表执行记忆**：用户偏好和任务轨迹的结构完全不同。
3. **只测最终成功会混淆原因**：成功可能来自模型强推理，不一定来自 memory。
4. **压缩质量本身要评估**：如果摘要漏掉约束，检索再准也会带来错误行动。

## 学到什么

MemGym 把 agent memory 从“能不能记住信息”推进到“能不能形成可迁移执行经验”。这对长期 study / harness 项目很贴近：我们真正需要的不是聊天记录堆积，而是能在下一轮任务中减少重复踩坑的结构化记忆。

对工程实现来说，memory 系统至少要拆成三步看：写入时筛选、保存时压缩、使用时校验。任何一步偷懒，都会把 memory 从资产变成污染源。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2605.20833>
- [[reflexion]]：用语言反思替代权重更新。
- [[voyager]]：在长程环境里积累 skill library。
- [[swe-bench-cl]]：软件工程任务流里的持续学习评测。

## 关联

- [[reflexion]]
- [[voyager]]
- [[swe-agent]]
- [[swe-bench]]
- [[agentic-context-engineering-2025]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
