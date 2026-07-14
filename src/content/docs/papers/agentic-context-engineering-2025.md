---
title: 'Agentic Context Engineering — 把上下文当成会进化的 playbook'
description: 'ACE 将上下文视为可演化 playbook，用生成、反思和整理缓解 context collapse。'
来源: 'Zhang et al., arXiv:2510.04618'
日期: 2026-07-14
分类: AI Agent / Context Engineering
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2510.04618v1
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-14'
  publication_id: arXiv:2510.04618
  source_version: arXiv:2510.04618v1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-14'
  review_after: null
  applicable_version: arXiv v1
---

## 是什么

Agentic Context Engineering（ACE）讨论的不是微调模型，而是让 agent 的上下文自己变好。它把 context 看成一份会积累经验的 playbook：执行任务后，根据反馈生成策略、反思失败、整理成可复用条目，再放回未来上下文。

类比：普通 prompt 像一次性便签，写完就扔；ACE 像团队作战手册，每次事故复盘都追加一条“下次遇到这种情况先检查什么”。

论文把问题命名为 context adaptation：通过修改 instructions、strategies、evidence 来提升模型，而不是改权重。

## 问题是什么

很多长期 agent 的上下文维护像“越压越短的会议纪要”：每轮都总结一次，确实省 token，但也会把真正有用的前提、边界和失败证据删掉。

ACE 关心的问题是：上下文能不能像工程资产一样迭代，而不是像聊天记录一样堆积。它要保存的不是所有原始文本，而是能指导未来行动的策略单元。

所以它把记忆问题改写成治理问题：什么经验值得进入 playbook，怎么防止过期策略污染后续任务，怎么让执行反馈自然地推动上下文演化。

## 为什么重要

长期 agent 最容易碰到两种上下文病：

1. **brevity bias**：摘要越写越短，把真正有用的 domain insight 丢掉。
2. **context collapse**：反复重写之后，细节被磨平，最后只剩抽象口号。

ACE 的目标是避免这两种退化。它用结构化、增量式更新来保存经验，而不是每轮把所有内容压成一段新摘要。

论文报告 ACE 在 agent benchmark 上相对强 baseline 有 +10.6% 左右收益，在 finance 场景有 +8.6% 左右收益；在 AppWorld 上还能接近或超过更大生产 agent 的部分 split 表现。

## 核心方法

ACE 可以拆成三步：

| 步骤 | 作用 |
|---|---|
| generation | 从执行轨迹或反馈里提取候选策略 |
| reflection | 判断这条策略为什么有效、什么时候会误导 |
| curation | 把策略整理、去重、放进结构化上下文 |

重点不在“记得更多”，而在“记得更可用”。如果 memory 只是堆原始聊天记录，agent 下次仍要从噪声里重新找答案；ACE 想把经验预处理成可直接执行的策略。

## 手工 toy 复现

假设 agent 反复做网页表单自动化，第一次失败原因是：提交前没有等待 toast 消失。

普通摘要可能写成：“注意等待页面稳定。”这句话太泛，下一次不一定有用。

ACE 风格的 playbook 条目更像：

| 字段 | 内容 |
|---|---|
| trigger | 表单提交后出现 toast 或 loading overlay |
| action | 等待 overlay detached，再点击下一个按钮 |
| evidence | 上次直接点击导致按钮被遮挡 |
| boundary | 如果 overlay 超过 10s 未消失，改为报错而不是死等 |

这个 toy 说明 ACE 为什么强调结构化增量：它保留了触发条件、动作、证据和边界，而不是只留下“要小心”。

## 踩过的坑

1. **上下文不是越短越好**：短摘要省 token，但可能丢掉关键条件。
2. **记忆不是日志仓库**：直接塞原始轨迹会把检索压力留给模型。
3. **策略需要边界**：没有边界的经验会变成过拟合提示词，在新任务里误导 agent。

## 学到什么

ACE 把 context engineering 从“写 prompt”推进到“维护可演化运行时资产”。这和 [[react]] 的循环关系很紧：ReAct 产生轨迹，ACE 把轨迹里的经验变成下一轮上下文。

对 study 来说，这篇是 memory / skill / harness 线的桥：skill 偏静态过程知识，ACE 偏从执行反馈中持续更新的动态过程知识。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2510.04618>
- [[react]]：产生可被 ACE 消化的行动轨迹。
- [[reflexion]]：把失败反思写回后续尝试的早期代表。
- [[toolformer]]：工具使用能力的训练路线。

## 关联

- [[react]]
- [[reflexion]]
- [[toolformer]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
