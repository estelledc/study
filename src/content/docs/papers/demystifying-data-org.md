---
title: Demystifying Data Organization — 给训练数据排队的四条原则
来源: 'Yalun Dai et al., "Demystifying Data Organization for Enhanced LLM Training", ACL 2026'
日期: 2026-05-29
分类: 机器学习
难度: 中级
---

## 是什么

Demystifying Data Organization 研究的是：**大模型训练时，不只要挑哪些数据，还要决定这些数据按什么顺序喂给模型**。日常类比：同样一摞练习册，你可以随机做、从易到难做、穿插复习做，最后的掌握程度可能完全不同。

这篇论文的起点很务实：很多数据集已经给每条样本算过质量、难度、教育价值等分数。过去这些分数常被用来“选数据”，选完就丢掉；作者想把这些分数继续拿来“排队”。

所以它不是重新发明数据清洗，而是问：既然每条样本已经有分数，能不能用几乎不增加成本的方式，把训练顺序排得更稳、更有效？

## 为什么重要

不理解数据组织，下面这些事很难解释：

- 为什么同一批训练数据、同一个模型、同样训练步数，只改顺序也会影响最终效果。
- 为什么简单的“从易到难”课程学习在一次或少数几轮训练里可能让模型忘掉早期基础样本。
- 为什么训练末尾喂高质量或高难度样本，常常比训练开头喂它们更影响最终表现。
- 为什么严格排序会让一个 mini-batch 里的样本太像，梯度缺少变化，反而不利于泛化。

## 核心要点

1. **分数不是只能用来筛选**。类比：考试卷子按难度分级后，不只是决定做哪些题，还能决定先做、穿插做、最后冲刺做哪些题。论文把已有样本分数复用于排序，避免额外打分成本。

2. **训练顺序有四条原则**。类比：健身计划要热身、复习基础动作、动作难度平滑增加，还要避免每天只练同一块肌肉。论文叫 Boundary Sharpening、Cyclic Scheduling、Curriculum Continuity、Local Diversity。

3. **原则会落成具体排队算法，再组合成 STR / SAW**。类比：原则是训练理念，算法是课表模板。Cyclic → **FO（Folding Ordering，折叠排序）**；Continuity → **ZIG（Zig-zag Ordering，锯齿排序）**；Local Diversity → **JIT（Jittering Ordering，局部抖动）**。**STR** 像楼梯（全局向上时用 FO 回看基础），**SAW** 像锯齿（用 ZIG 让过渡更连续），两者最后都可再套 JIT。

## 实践案例

### 案例 1：把“选数据”和“排数据”分开

```python
samples = [("a", 0.2), ("b", 0.9), ("c", 0.5), ("d", 0.7)]
selected = [x for x in samples if x[1] >= 0.5]
ordered = sorted(selected, key=lambda x: x[1])
print(ordered)  # c -> d -> b
```

**逐部分解释**：

- `selected` 是数据选择：样本数量变少，只保留分数够高的。
- `ordered` 是数据组织：样本集合不再变化，只改变训练时看到的顺序。
- 论文的核心就是把同一组分数同时用于选择和组织，而不是选完就浪费掉。

### 案例 2：Cyclic Scheduling 为什么不是单调从易到难

```python
sorted_ids = list(range(12))  # 0 最简单，11 最难
layers = 3
cycles = [sorted_ids[i::layers] for i in range(layers)]
schedule = [x for cycle in cycles for x in cycle]
print(schedule)  # 0,3,6,9,1,4,7,10,2,5,8,11
```

**逐部分解释**：

- `sorted_ids[i::layers]` 把从易到难的队列按步长切开。
- 每个 cycle 都覆盖从低分到高分的一段光谱，模型会周期性看到基础样本。
- 这就是 **FO（Folding Ordering）**：Cyclic Scheduling 的具体实现，比纯课程学习更像“边学新题，边复习旧题”。真实训练里调度的是样本/token 索引，这里用整数列表只为看清折叠形状。

### 案例 3：Local Diversity 给严格排序加一点抖动

```python
import random

scores = list(range(20))
window = 5
ordered = []
for i in range(0, len(scores), window):
    bucket = scores[i:i + window]
    random.shuffle(bucket)
    ordered.extend(bucket)
print(ordered)
```

**逐部分解释**：

- 大方向仍然是低分到高分，因为每个 bucket 的位置没变。
- bucket 内部被打乱，让同一个 mini-batch 不至于全是几乎一样的样本。
- 这就是 **JIT（Jittering Ordering）**：Local Diversity 的实现——保留课程趋势，同时恢复局部多样性。

## 踩过的坑

1. **把数据组织误解成数据筛选**：筛选改变“吃什么”，组织改变“先吃什么后吃什么”，两者解决的问题不同。

2. **以为从易到难一定最好**：LLM 常常只训练一轮或少数几轮，后半程长期只看高分样本会让早期基础知识被遗忘。

3. **只看平均分不看训练过程**：FO（折叠循环）和 ZIG（奇数轮反转的锯齿）差别常体现在梯度是否突然尖峰，最终平均分掩盖不了优化稳定性问题。

4. **忽略分数质量**：这些方法依赖预先算好的样本分数，如果分数和任务目标不相关，排得再巧也可能只是整齐地犯错。

## 适用 vs 不适用场景

**适用**：

- 已经有样本级质量、难度、教育价值、可学习性分数的大模型训练数据。
- 训练预算固定，希望不重算分数、不改模型结构，只靠顺序拿到稳定收益。
- 一轮或少数几轮训练，样本出现时机真的会影响学习轨迹。
- 需要比较随机顺序、课程学习、折叠复习、局部打乱等策略的实验。

**不适用**：

- 没有可靠样本分数，或者分数和最终任务目标关系很弱。
- 数据会在线不断进入，无法提前得到完整排序。
- 训练会反复洗牌很多轮，单次顺序的影响被多轮随机性冲淡。
- 主要瓶颈是模型容量、标注错误或评测污染，而不是数据呈现顺序。

## 历史小故事（可跳过）

- **2009 年**：Bengio 等人提出 Curriculum Learning，把“先易后难”变成机器学习里的正式思路。
- **2022 年**：Chinchilla 重新强调模型大小和训练 token 数要配平，数据效率变得更值钱。
- **2024 年**：FineWeb-Edu、QuRatedPajama 这类数据集开始给网页样本提供更细的质量或教育价值分数。
- **2025 年**：DELT 等方法开始把折叠式复习引入数据顺序，提示“只排序一次”不够。
- **2026 年**：这篇论文把边界、循环、连续性、局部多样性整理成四条原则，并实现 STR / SAW。

## 学到什么

1. **数据分数可以复用两次**：第一次用来选数据，第二次用来排训练顺序。
2. **训练开头和结尾不是对称的**：预训练里末尾高分更关键，SFT 里开头和结尾都喂高分更稳。
3. **复习和连续性要一起看**：周期性复习能减少遗忘，但如果跳变太猛，就会冲击优化器。
4. **一点局部随机性是好事**：JIT（局部抖动）的价值在于别让每个 batch 都太单调，它像给整齐队伍保留呼吸空间。

## 延伸阅读

- 论文 PDF：[Demystifying Data Organization for Enhanced LLM Training](https://arxiv.org/pdf/2605.30334v1.pdf)（原文，重点看四条原则和 Table 5）
- 项目代码：[microsoft/data-efficacy](https://github.com/microsoft/data-efficacy)（作者给出的实现入口）
- [[chinchilla]] —— 理解为什么训练 token 和模型规模配平后，数据效率变得更关键
- [[scaling-laws]] —— 看懂论文用 scaling law 外推大模型 loss 的背景
- [[llama]] —— 论文用 Llama 系列作为大规模训练时代的参照对象之一
- [[attention]] —— 训练数据顺序改变的是模型学习轨迹，底层模型仍是 Transformer 类架构

## 关联

- [[chinchilla]] —— 说明“多大模型配多少数据”这条主线，数据组织是在同一预算下继续榨效率。
- [[scaling-laws]] —— 论文用缩放规律预测更大模型上的 loss 改善。
- [[llama]] —— Llama 系列代表现代少轮大规模预训练范式，顺序影响因此更突出。
- [[attention]] —— 大多数实验模型仍基于 Transformer，数据组织是在训练流程层面动手。
- [[dpo]] —— 都属于“不改基础模型结构，而改训练信号或训练流程”的效率路线。
- [[deepseek-r1]] —— 推理模型很依赖高质量训练数据，这篇提供了如何安排数据出现时机的视角。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
