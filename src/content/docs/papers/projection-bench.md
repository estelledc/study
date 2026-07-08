---
title: ProjectionBench — 用逐步揭示信息测试科学假说生成
来源: 'Andrew J. Lew, Yuan Cao & Markus J. Buehler, "ProjectionBench: Evaluating Scientific Hypothesis Generation in LLMs Under Progressive Information Disclosure", arXiv 2026'
日期: 2026-05-29
分类: machine-learning
难度: 初级
---

## 是什么

ProjectionBench 是一个**测试大模型能不能像科研新手一样，从很少线索推测实验结果**的 benchmark。日常类比：老师先只告诉你“这道菜想解决什么口味问题”，不告诉配方；你先猜成品味道，老师再一点点公开食材和做法，看你猜得有没有越来越接近真实成品。

它不把“科学发现”简化成背论文、找引用、做选择题，而是问模型：给你一个近期论文的主题和研究问题，你能不能预测这篇论文最后发现了什么。

论文的关键设计是**逐步揭示信息**：第一档只给主题和研究问题；第二档再给零假设；第三档再给实验步骤。模型每一档都要写一句“本研究发现……”，再拿这句话和真实论文结论做语义比较。

所以它测的是两个能力的组合：少信息时的创新性，以及多信息时的有根据推理。

## 为什么重要

不理解 ProjectionBench，下面这些事就很难解释：

- 为什么“会检索论文”不等于“会做科学发现”——检索是在找已有答案，发现是在未知处提出可检验结果。
- 为什么 benchmark 不能只考选择题——科研里常见的问题没有标准选项，答案是一组关系判断。
- 为什么给模型更多上下文不一定线性变好——论文发现零假设带来的提升大，继续加实验步骤的边际收益反而变小。
- 为什么 LLM-as-a-judge 要小心使用——这里用 GPT-5 拆 claim 和打分，也承认同家族 judge 可能偏向 GPT 系模型。
- 为什么 live benchmark 很重要——数据来自最近 6 个月开放论文，目的是降低模型训练时见过答案的风险。

## 核心要点

ProjectionBench 可以拆成三件事：

1. **把科研问题做成“逐步开卷”**。类比：考试不是一次性发完整题干，而是先给标题，再给假设，最后给实验步骤。这样可以分清模型是凭常识猜，还是根据细节推。

2. **把答案拆成原子关系**。类比：一句“这个处理提高强度并改善热稳定性”要拆成两张小卡片：处理影响强度，处理影响热稳定性。拆开后才能算漏了哪张、错了哪张。

3. **用 F1 和 AUC 看整体走势**。类比：不只看一场考试分数，还看从“闭卷”到“开卷”的三场成绩曲线。AUC 就是把三档上下文下的 F1 合起来看。

这三件事让 ProjectionBench 不只是“模型答对了吗”，而是“模型在信息逐渐变多时，推理曲线长什么样”。

## 实践案例

### 案例 1：三档上下文怎么喂给模型

```python
def make_context(topic, question, null_hypothesis=None, method=None):
    text = f"Topic: {topic}\nResearch Question: {question}"
    if null_hypothesis:
        text += f"\nUnverified Hypothesis: {null_hypothesis}"
    if method:
        text += f"\nExperimental Procedure: {method}"
    return text
```

**逐部分解释**：

- 第一行只保留主题和研究问题，这是最低信息档。
- 有 `null_hypothesis` 时，模型知道“实验想推翻什么默认说法”。
- 有 `method` 时，模型能看到实验怎么做，任务更像结构化推理。

这段代码表达了论文最核心的实验操控：不是换问题，而是同一个问题逐步加信息。

### 案例 2：把一句科研结论拆成 claim

```python
result = "KTN-treated fibers increase storage modulus and improve thermal stability"
claims = [
    ("KTN treatment", "increases", "storage modulus"),
    ("KTN treatment", "improves", "thermal stability"),
]
```

**逐部分解释**：

- `result` 是模型或真实论文给出的自然语言答案。
- `claims` 把一句话拆成“自变量、关系、因变量”三元组。
- 如果模型只说强度提高，却漏掉热稳定性，就会丢 recall。

这种拆法比整句相似度更细，因为科研结论经常是几个关系叠在一起。

### 案例 3：为什么用 F1，而不是只数答对

```python
true_positive = 2
false_positive = 1
relevant = 3
precision = true_positive / (true_positive + false_positive)
recall = true_positive / relevant
f1 = 2 * precision * recall / (precision + recall)
```

**逐部分解释**：

- `precision` 问的是：模型说出来的东西里，有多少靠谱。
- `recall` 问的是：真实该说的东西里，模型抓住了多少。
- `f1` 把两者折中，避免“说很多乱猜”或“只说一点点保守答案”占便宜。

ProjectionBench 再把三档上下文的 F1 合成 AUC，观察模型从少信息到多信息的表现曲线。

### 案例 4：一个模型输出如何被判成不同分数

```python
ground_truth = "KTN treatment beats untreated and NaOH treatment"
weak_projection = "NaOH treatment is stronger"
strong_projection = "KTN treatment is slightly better than NaOH"
```

**逐部分解释**：

- `weak_projection` 方向相反，会被当成 misaligned。
- `strong_projection` 抓住了主要方向，但语气和细节可能不完全一致。
- 这类例子说明 benchmark 不是让模型复述论文，而是看它能否预测关键关系。

论文里的材料科学案例显示，GPT-5.4 在低上下文下也能抓住一部分关系，而 Gemini 2.5 Pro 有时会被旧知识锚定。

## 踩过的坑

1. **把它理解成检索 benchmark**：错，因为测试时模型离线回答，目标是预测未知论文结果，不是找到论文原文。

2. **把低上下文高分理解成“模型真会发现科学”**：要谨慎，因为高分只说明它在这些材料科学样本上猜得像真实结果，不等于能独立设计实验。

3. **忽略 judge 偏差**：原因是 GPT-5 同时参与 claim extraction 和 alignment scoring，评 GPT 系模型时可能有风格偏好。

4. **只看平均分不看方差**：原因是 45 篇论文难度差异很大，机械材料样本尤其分散，平均数会遮住个案失败。

## 适用 vs 不适用场景

**适用**：

- 评估模型在科研问题上“少线索预测结果”的能力。
- 比较同一模型在不同上下文量下的推理曲线。
- 为 AI scientist 或 co-scientist 系统做早期筛选。
- 研究 LLM 是否只是复述旧知识，还是能组合知识推新关系。

**不适用**：

- 证明模型已经能独立完成真实科研闭环，因为它没有让模型亲自设计、执行和复现实验。
- 评估所有学科的发现能力，因为论文实验集中在 bioactive materials、mechanical materials、nanomaterials。
- 替代人工同行评审，因为 claim 拆分和语义评分仍依赖 judge 模型。
- 判断某个单独预测是否科学正确，因为 benchmark 主要看批量统计趋势。

## 历史小故事（可跳过）

- **1935 年**：Fisher 把零假设检验变成现代实验推理的重要框架，ProjectionBench 借它组织“要推翻什么”。
- **2023-2025 年**：SciBench、ResearcherBench、DiscoveryBench、DeepScholar-Bench 等 benchmark 陆续出现，但很多偏检索、问答或重任务执行。
- **2026 年**：ProjectionBench 把目标改成“预测近期论文的实验结论”，并用逐步揭示信息来区分创新和推理。
- **同一年**：作者用 45 篇近 6 个月开放论文测试 GPT-5、GPT-5.4、Gemini 2.5 Pro、Gemini 3.1 Pro Preview。
- **结果亮点**：GPT-5.4 总体 AUC 最高，并且在最低信息档还能保持约 0.70 的 F1。

## 学到什么

- **科学发现不是背答案**：真正难的是在答案公开前，提出和真实实验结果方向一致的关系。
- **上下文量本身可以当实验变量**：从题目到假设再到方法，模型表现的变化比单个分数更有信息。
- **好评分要拆小粒度**：整句相似会漏掉“对了一半、错了一半”的情况，原子 claim 更适合科研结果。
- **benchmark 也有边界**：ProjectionBench 很适合测预测趋势，但还不能代表完整自动科研能力。

## 延伸阅读

- 论文 PDF：[ProjectionBench arXiv 2605.30284](https://arxiv.org/pdf/2605.30284v1.pdf)（本文主来源）
- 论文：[A Survey on Hypothesis Generation for Scientific Discovery in the Era of Large Language Models](https://arxiv.org/abs/2504.05496)（系统看 LLM 假说生成）
- [[discoverybench]] —— 同样关注自动科学发现，但更偏数据驱动任务。
- [[researcherbench]] —— 更偏深度研究系统的检索、引用和综合能力。
- [[cot]] —— ProjectionBench 关心模型推理结果，CoT 关心模型如何展开中间推理。
- [[bigbench-2022]] —— 大规模能力评测的早期代表，可以对照 benchmark 设计思路。

## 关联

- [[llm-as-a-judge]] —— ProjectionBench 用 judge 模型拆 claim、判 alignment，是典型应用场景。
- [[discoverybench]] —— 两者都测科学发现，但 ProjectionBench 更轻量、更强调逐步揭示信息。
- [[researcherbench]] —— 一个偏找资料和引用，一个偏预测实验结果。
- [[deepscholar-bench]] —— 都是 live benchmark，但 DeepScholar-Bench 更关注研究综述生成。
- [[cot]] —— 低上下文预测需要隐式推理，CoT 是观察和引导推理过程的常见方法。
- [[chatbot-arena-2024]] —— 一个看用户偏好的模型竞技场，ProjectionBench 则看科学关系预测。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
