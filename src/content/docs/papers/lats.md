---
title: 'LATS — 把推理、行动和规划统一进语言 Agent 树搜索'
description: '用 LATS 理解为什么 agent 不一定要线性执行 ReAct 轨迹，也可以在环境反馈下做搜索、反思和回溯。'
来源: 'arXiv:2310.04406'
日期: 2026-07-15
分类: AI Agent / Planning
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2310.04406v3
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-15'
  publication_id: arXiv:2310.04406
  source_version: arXiv:2310.04406v3
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-15'
  review_after: null
  applicable_version: arXiv v3
---

## 是什么

Language Agent Tree Search Unifies Reasoning Acting and Planning in Language Models，简称 LATS，是一篇把 Monte Carlo Tree Search 引入语言 agent 决策过程的论文。

类比：普通 [[react]] agent 像一边走一边想，走错了也常常只能硬着头皮继续；LATS 像下棋时先展开几条候选路线，评估哪条更有希望，再选择行动。

本卡只基于 arXiv v3 和论文静态阅读整理，没有运行 LATS 代码，也没有复现 HumanEval、WebShop、HotPotQA 或 Game of 24 等实验。所有结果保持 `UNVERIFIED`。

## 问题是什么

ReAct 把 reasoning 和 acting 串在一起，但它通常是一条线性轨迹：想一步、做一步、看反馈，再继续。

线性轨迹的问题是：

- 早期错误会污染后续上下文；
- agent 很难系统比较多条候选行动；
- 环境反馈没有被充分用于搜索；
- 失败后的反思常常只在下一次 trial 生效。

LATS 的问题是：能否把语言模型的推理、行动、环境反馈和自我反思放进一个树搜索框架，让 agent 在推理时就能探索和回溯？

## 为什么重要

- 它把 [[tree-of-thoughts-2023]] 的搜索思想推进到可行动的 agent。
- 它把 [[react]] 的环境交互和 MCTS 的 planning 合在一起。
- 它让 self-reflection 不只是失败后总结，而是搜索节点的一部分。
- 它覆盖编程、交互 QA、网页导航和数学等多场景。
- 它说明 agent control flow 不只有 memory，也有 search。

## 核心方法

LATS 把 agent 过程组织成树：

| 步骤 | 作用 | 直觉 |
|---|---|---|
| selection | 选择最值得扩展的节点 | 哪条路看起来最有前途 |
| expansion | 生成候选行动 / 思考 | 多想几种走法 |
| evaluation | 用 value function 评分 | 判断局面好坏 |
| simulation / acting | 与环境交互拿反馈 | 实际试探 |
| reflection | 对失败路径写反思 | 把局部经验回填 |

论文强调 LATS 不是单纯 Tree-of-Thoughts，也不是单纯 ReAct。它把 reasoning、acting、planning 三件事放在同一棵搜索树里。

## 论文地形

1. 引言指出简单 acting process 限制 autonomous agent。
2. 方法部分把 MCTS 和 LM-powered value / reflection 结合。
3. 实验覆盖 programming、interactive QA、web navigation、math。
4. 结果展示 LATS 在多任务上相对 baseline 的提升。
5. 讨论部分分析计算成本、泛化和搜索质量。

读这篇时重点不是背 MCTS 公式，而是理解“agent 为什么需要可回溯控制流”。这和长期记忆是互补关系：memory 解决跨任务经验，search 解决当前任务多路径决策。

## 手工 toy 复现

假设 agent 在 WebShop 里买一个“便宜但评价高的蓝牙耳机”：

| 线性 ReAct | LATS |
|---|---|
| 搜索耳机 → 点第一个结果 → 发现太贵 → 继续乱试 | 搜索耳机后展开多个候选：按价格、评分、品牌筛选 |
| 早期点错页面后上下文变乱 | 错路径可以降权或回溯 |
| 反馈只影响下一步 | 反馈可以更新整棵树的 value |
| 失败后才反思 | 节点内就能记录局部反思 |

这个 toy 不能替代 LATS 实验，只说明 tree search 如何缓解单线行动的早期错误。

## 评测读法

LATS 结果要同时看三类指标：

1. **任务分数**：HumanEval pass@1、WebShop score 等；
2. **搜索成本**：多分支会增加 token 和环境交互；
3. **泛化范围**：编程、网页导航、数学的控制流并不完全相同。

如果只看分数，很容易忽略 LATS 的代价。搜索越充分，越可能更准，但也越贵、越慢。

## 踩过的坑

1. **树搜索不保证正确**：value function 如果错，搜索会系统性偏向坏路径。
2. **环境交互可能昂贵**：真实网页或工具调用不是免费 rollout。
3. **反思可能污染节点**：错误归因会让后续分支被错误引导。
4. **搜索宽度要控预算**：无限展开会把 agent 变成 token 消耗机器。
5. **任务状态要可复制**：如果环境不可回滚，树搜索就很难安全试错。

## 与当前工作的连接

前几轮我们补了 [[webarena]]、[[browsergym]]、[[androidworld]]、[[agentdojo]] 等环境和安全 benchmark。LATS 回到 agent 内部：面对同一个环境，agent 应该如何规划、搜索和回溯。

这对工程 harness 也很有启发。bugfix 流程不是永远单线推进；当 locator、tech-design、verify 失败时，本质上也需要保留分支假设、回填反馈、选择下一条更可能成功的路径。

与 [[memgpt]] / [[memorybank]] 相比，LATS 不是长期记忆方案，而是当前任务内的控制流方案。

## 学到什么

LATS 的核心贡献是把语言 agent 从“线性执行器”推向“搜索式决策器”。它告诉我们：agent 的智能不只在模型里，也在控制流里。

对实际系统来说，LATS 最值得借鉴的不是照搬 MCTS，而是把候选行动、环境反馈、评分和反思显式化。这样失败路径才有机会被比较、降权和复用。

## 延伸阅读

- arXiv: [Language Agent Tree Search Unifies Reasoning Acting and Planning in Language Models](https://arxiv.org/abs/2310.04406)
- code: [LanguageAgentTreeSearch](https://github.com/lapisrocks/LanguageAgentTreeSearch)
- [[tree-of-thoughts-2023]] —— 搜索式推理前置概念
- [[react]] —— LATS 要扩展的线性 acting baseline

## 关联

- [[react]] —— reasoning + acting 的线性控制流
- [[tree-of-thoughts-2023]] —— tree search 的纯推理版本
- [[reflexion]] —— 失败后的语言反思
- [[self-refine-2023]] —— 单输出自反馈迭代
- [[webarena]] —— web navigation 任务环境
- [[memgpt]] —— 另一类 agent 内循环：记忆管理
- [[generative-agents]] —— memory / reflection / planning 的社会模拟版

## 反向链接

<!-- backlinks:start -->
<!-- backlinks:end -->
