---
title: Continual Pretraining Survey 2026 — 大模型持续学习入门
来源: 'Continual Learning in Large Language Models: Methods, Challenges, and Opportunities, arXiv:2603.12658, 2026'
日期: 2026-07-08
分类: machine-learning
难度: 中级
---

## 是什么

Continual pretraining 指的是：模型已经学完一大批通用语料后，还要不断吃新的领域文本、时间更新或任务数据，让它别停在出厂那一刻。

日常类比：这像一个医生毕业后继续读新指南。只靠医学院课本，他会漏掉新药和新诊疗规范；但如果每次进修都把旧知识冲掉，又会忘记基础诊断。

这篇综述把问题放在 LLM 语境里：持续学习不只是一轮再训练，而是一组围绕“吸收新知识、减少遗忘、评估迁移”的方法集合。

它特别区分了 continual pretraining、continual fine-tuning 和 continual alignment：前者更新底层语言和知识分布，后两者更偏任务行为和偏好约束。

## 为什么重要

不理解 continual pretraining，下面这些现象会很难解释：

- 为什么一个 2024 年训练好的模型不知道 2026 年的新 API、法律条文或医学指南。
- 为什么直接拿新语料继续训，有时会让旧任务准确率明显下降，这就是灾难性遗忘。
- 为什么企业知识库模型不能只靠 RAG，底层模型也要周期性适配行业语言。
- 为什么评估不能只看新任务涨没涨，还要看旧能力、跨域迁移和安全边界有没有掉。

## 核心要点

1. **新知识和旧知识要同时守住**。类比：往书架加新书时，不能把旧书随手扔掉；训练时也要让新语料和旧能力有某种“复习”机制。

2. **方法大致分三类**。rehearsal 像复习旧题，regularization 像给关键参数加保护套，architecture-based 方法像给模型加新抽屉或可插拔模块。

3. **LLM 场景比传统持续学习更难**。模型更大、预训练成本更高、能力更杂，遗忘不只表现为分类错，还会表现为事实过时、风格漂移和指令遵循下降。

4. **评估要看时间维度**。只在一个新数据集上测分数不够，最好按月份、领域或任务序列记录学习曲线和遗忘率。

## 实践案例

### 案例 1：给客服模型补 2026 年产品文档

```python
old_mix = sample("2025_manuals", ratio=0.30)
new_docs = sample("2026_release_notes", ratio=0.70)
batch = tokenize(old_mix + new_docs)
loss = model.continual_pretrain(batch)
```

逐步看：

- `new_docs` 让模型吸收新功能名和新流程。
- `old_mix` 是复习材料，降低旧产品知识被覆盖的风险。
- 比例不是固定真理，要用旧问答集和新问答集一起验证。

### 案例 2：用遗忘率看训练有没有伤旧能力

```python
before = eval_model(model_before, old_tasks)
after = eval_model(model_after, old_tasks)
forgetting = before["avg_score"] - after["avg_score"]
```

逐步看：

- `before` 是继续训练前的旧能力基线。
- `after` 是吸收新语料后的旧任务表现。
- 如果 `forgetting` 太高，说明新知识不是“加上去”，而是在挤掉旧知识。

### 案例 3：把 RAG 和 continual pretraining 分工

```python
if query_needs_exact_latest_policy(question):
    context = retriever.search(policy_index, question)
    answer = generator(question, context)
else:
    answer = model(question)
```

逐步看：

- RAG 适合拿最新、可追溯、常变化的事实。
- continual pretraining 适合让模型更懂领域语言和长期稳定概念。
- 两者不是互斥：RAG 管外部证据，继续预训练管底层表达。

## 踩过的坑

1. **只喂新数据不复习旧数据**：常见结果是新领域词汇变熟，通用推理和旧领域问答一起下滑。

2. **把 fine-tuning 当 pretraining**：少量指令样本能改变回答格式，但不一定能把领域文本分布真正写进底层表示。

3. **只看平均分**：新任务上涨 5 分、旧任务下降 8 分时，平均值可能掩盖实际风险。

4. **数据时间戳混乱**：训练集和测试集如果按时间泄漏，模型看似会预测未来，其实只是提前见过答案。

5. **安全对齐被冲淡**：继续预训练如果只看领域语料，可能让原先的拒答边界、引用习惯和格式约束变松。

## 适用 vs 不适用场景

**适用**：

- 金融、医疗、法律、芯片文档这类术语稳定但知识持续更新的领域。
- 每季度或每半年都有新资料，且希望模型内化领域表达方式。
- 有旧任务回归集、新任务验证集和足够算力做小步迭代。

**不适用**：

- 只需要回答少量最新事实，直接用 RAG 更便宜、更可追溯。
- 数据量很小、质量不稳，继续预训练容易学到噪声。
- 没有旧能力回归集，无法判断模型到底学会了还是忘掉了。

## 历史小故事（可跳过）

- **1990s-2010s**：持续学习主要研究分类模型如何按任务序列学习，并提出灾难性遗忘问题。
- **2017-2020**：Transformer 和大规模预训练兴起，模型先“通读互联网”，再用微调适配任务。
- **2021-2024**：大模型进入行业应用，领域自适应预训练和 continual fine-tuning 变成工程常态。
- **2025-2026**：研究重点转向 LLM 的时间更新、知识迁移、评估基准和对齐保持。

## 学到什么

1. 持续预训练不是“多训几步”这么简单，它是在新旧知识之间做预算分配。

2. 灾难性遗忘要用旧任务回归集量化，不能只靠主观感觉。

3. RAG 和继续预训练解决的是不同层面：一个补外部证据，一个改内部表示。

4. LLM 的持续学习还必须关注安全、格式、引用习惯和指令遵循。

## 延伸阅读

- 综述：[Continual Learning in Large Language Models: Methods, Challenges, and Opportunities](https://arxiv.org/pdf/2603.12658)
- 相关综述：[Continual Learning of Large Language Models: A Comprehensive Survey](https://arxiv.org/abs/2404.16789)
- [[rag]] —— 外部检索如何补最新事实。
- [[lora]] —— 参数高效微调常用于低成本适配。
- [[catastrophic-forgetting]] —— 持续学习最核心的失败模式。

## 关联

- [[rag]] —— 最新事实可以先放在检索层，而不是每次都重训模型。
- [[lora]] —— 小模块更新能降低持续适配成本。
- [[instruction-tuning]] —— 持续预训练之后常需要再校准回答行为。
- [[model-evaluation]] —— 遗忘率、迁移效率和安全回归都要靠评估集说话。
- [[domain-adaptation]] —— 领域文本分布变化是继续预训练的重要动机。
- [[catastrophic-forgetting]] —— 新知识挤掉旧知识时最典型的名字。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
- [[rag]] —— 相关页面会在自动反向链接阶段补齐更多入口。
- [[domain-adaptation]] —— 相关页面会在自动反向链接阶段补齐更多入口。
