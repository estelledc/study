---
title: 'MLE-bench — 用 Kaggle 任务衡量机器学习工程 agent'
description: '用 MLE-bench 理解 ML 工程 agent 为什么不能只靠单元测试和代码 benchmark 来评估。'
来源: 'Chan et al., arXiv:2410.07095'
日期: 2026-07-14
分类: AI Agent / MLE Benchmark
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2410.07095v6
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2410.07095
  source_version: arXiv:2410.07095v6
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v6
---

## 是什么

MLE-bench: Evaluating Machine Learning Agents on Machine Learning Engineering 是一套评估机器学习工程 agent 的 benchmark。它不让 agent 只修一个小函数，而是把 Kaggle 竞赛改造成端到端 ML 工程任务：读数据、理解指标、写训练脚本、跑实验、提交结果。

类比：[[swe-bench]] 像让工程师修线上 bug，MLE-bench 更像让工程师参加一场小型建模比赛。前者看代码修改是否通过测试，后者看你能不能把数据、特征、模型、训练预算和实验记录组织成一个可提交方案。

本卡只基于 arXiv v6 元数据和论文静态阅读整理，没有下载 Kaggle 数据、没有运行 AIDE scaffold，也没有复现论文分数。所有实验数字都按论文表述理解，可信状态保持 `UNVERIFIED`。

## 问题是什么

软件工程 benchmark 已经能用单元测试判断很多任务是否完成，但 ML 工程不一样。一个模型方案即使代码能跑，也可能数据泄漏、指标选错、训练不收敛、提交格式不对，或者只是偶然碰到一个高分 seed。

MLE-bench 的核心问题是：当 agent 从“写代码”进入“做实验”时，我们怎么评价它是不是真的会做机器学习工程，而不是只会生成一段看起来合理的 notebook。

这也是上一轮 study 论文卡的缺口：我们补了不少 agent / tool use 经典卡，但对“agent 作为实验工程师”的评价还不够。MLE-bench 正好把目标从修 bug 扩到完整 ML workflow。

## 为什么重要

- 它把 agent evaluation 从代码正确性推进到实验工程能力。
- 它使用 75 个 Kaggle 竞赛任务，让 benchmark 接近真实数据科学工作。
- 它能暴露“会写脚本但不会实验”的 agent：数据处理、资源分配和指标理解都可能失败。
- 它给 [[openhands]]、[[swe-agent]] 这类 coding agent 之外的研究线提供了新靶场。
- 它提醒我们：ML 工程的结果不是一次 `pytest`，而是一串有成本、有噪声、有 leaderboard 的实验。

## 核心方法

| 组件 | 作用 | 我怎么读 |
|---|---|---|
| Kaggle 任务集合 | 从公开竞赛中抽 75 个 ML 工程任务 | 保留真实数据和指标复杂度 |
| 人类基线 | 用 Kaggle leaderboard 建立 medal 参照 | 把 agent 分数映射成 bronze / silver / gold 直觉 |
| agent scaffold | 让模型通过代码、文件和实验循环解题 | 测的是模型加工具链，不是裸模型问答 |
| resource scaling | 比较更多尝试、更多时间和更多算力是否提升 | 评估 agent 能否把资源转化为分数 |

这套设计的关键不是“有 75 个任务”这个数量，而是它把每个任务包装成一个真实 workflow：agent 要读说明、决定特征工程、写训练代码、跑评估、迭代方案。失败也不一定是语法错，可能是科研工程里的策略错。

## 论文地形

1. 引言提出 ML engineering 作为 agent 新评测对象。
2. Benchmark 构造说明如何从 Kaggle 任务转成可执行环境。
3. Baseline 章节比较 frontier model 与 open-source scaffold 的表现。
4. Scaling 章节看更多尝试和资源是否带来 medal rate 提升。
5. Error analysis 讨论 agent 在数据、建模、调参、执行上的失败类型。

读这篇时不要只盯最高分。更有价值的是看它如何把“机器学习工程”拆成可复查任务，以及它承认哪些部分仍然昂贵、噪声大、难以自动判定。

## 手工 toy 复现

我用一个极小 Kaggle-like 任务手推 MLE-bench 的评价逻辑：

| 步骤 | toy 任务动作 | MLE-bench 对应能力 |
|---|---|---|
| 读说明 | 预测房价，指标是 RMSE | 读懂目标和提交格式 |
| 处理数据 | 缺失值填充，类别特征 one-hot | 数据清洗和特征工程 |
| 训练模型 | 先跑 Linear Regression，再跑 RandomForest | baseline + 迭代 |
| 验证 | 本地切 validation set，避免只看 train 分数 | 实验设计 |
| 提交 | 生成 `submission.csv` | 任务协议执行 |

如果 agent 只写出一个能运行的训练脚本，但没有验证集、没有处理类别特征、提交列名还错了，在软件工程 benchmark 里可能看起来“代码完成”，但在 MLE-bench 里就是低质量方案。

这个 toy 只验证 benchmark 直觉，不代表我跑过论文环境。真正升级为 `VERIFIED` 需要下载任务、执行 agent scaffold，并把日志写入 review evidence。

## 评测读法

论文报告 best-performing setup 是 o1-preview with AIDE scaffolding，至少达到 Kaggle bronze medal 级别的比例为 16.9%。我把这个数字理解成“frontier agent 已经能在少数真实 ML 任务上做出有效方案”，而不是“ML 工程师已经被替代”。

原因很简单：Kaggle medal 只覆盖某类竞赛任务，真实 ML 工程还包含数据权限、线上反馈、合规约束、业务目标变动、监控和回滚。MLE-bench 是一块很好的试金石，但不是完整职业画像。

## 踩过的坑

1. **不要把 Kaggle medal rate 当成产品成功率**：竞赛指标清晰，真实业务指标经常变动。
2. **不要忽略 scaffold**：结果来自模型 + 工具 + 运行预算，不能全归功于裸 LLM。
3. **不要只看提交分**：实验记录、数据泄漏和资源成本同样重要。
4. **不要把一次运行当稳定能力**：ML 训练有随机性，agent 也会受 seed 和时间预算影响。
5. **不要把 ML 工程降级成代码生成**：数据理解和实验策略才是本篇想测的主角。

## 与当前工作的连接

今天就能用：评估 coding agent 时，除了看 `pytest`，也要设计“读数据、跑实验、解释指标”的小任务，避免只训练出会修样例测试的工具。

下个月可以用：如果要做 AI-first bugfix 或自动实验平台，MLE-bench 提醒我们保留完整 trajectory：命令、失败、重试、指标变化和最终提交都要能回放。

不要照搬：不要把 Kaggle 任务直接当实习项目目标。真实工作里的数据、权限、成本和交付标准更复杂，需要单独建验收。

## 学到什么

- ML 工程 agent 的评估必须包含数据和实验闭环。
- Benchmark 的难点不只是任务数量，而是能否保留真实工作流中的不确定性。
- `bronze medal` 是一个很好懂的能力单位，但不能替代业务验收。
- 对 study 来说，这篇补上了 [[swe-bench]] 之外的 agent 工程评估分支。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2410.07095>
- 本卡使用版本：<https://arxiv.org/abs/2410.07095v6>
- [[swe-bench]]：软件工程 bugfix 任务的主 benchmark。
- [[openhands]]：面向软件工程 agent 的开源平台。
- [[swe-agent]]：SWE-bench 早期代表 agent scaffold。
- [[agentless]]：更轻量的 SWE 修复路线。

## 关联

- [[swe-bench]]
- [[swe-bench-cl]]
- [[openhands]]
- [[swe-agent]]
- [[agentless]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
