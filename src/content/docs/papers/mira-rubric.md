---
title: MIRA Rubric — 给混合训练数据先定评分尺再筛选
来源: 'Wang et al., "MIRA: Mid-training Rubric Anchoring for Source-Aware Data Selection", arXiv 2026'
日期: 2026-05-29
分类: machine-learning
难度: 中级
---

## 是什么

MIRA 是一套给大模型 **mid-training 数据做筛选** 的方法。日常类比：不是先用同一把尺量所有食材，而是先问“蔬菜、肉、调料分别该看什么”，再按各自的标准挑。

mid-training 可以理解成预训练和最后微调之间的“补课阶段”：模型已经会很多通用知识，但还要补代码、推理、长上下文、工具调用这些能力。

MIRA 的核心想法是：混在一起的数据格式差异太大，不能只给一个“好不好”的总分。它先为每类数据发现评分维度，再训练便宜的学生评分器，把这套维度跑到全量语料上。

论文里的任务可以说成一句话：给一大锅 mid-training 候选数据，在 token 预算变少时，挑出最值得训练的那一半。

这个任务难在“值得”不是统一概念。数学推理样本要看推理链，agent 轨迹要看工具调用和纠错，长文档要看结构与信息密度。

## 为什么重要

不理解 MIRA，下面这些事很难解释：

- 为什么同样是“高质量数据”，代码问答、工具调用轨迹、长技术文档要看不同缺陷
- 为什么只用困惑度筛数据，可能把长轨迹或结构化样本误伤掉
- 为什么随机抽样有时很强，因为它保住了来源多样性，不会只留下某一种数据
- 为什么“少用一半 token 还能接近全量训练”，关键不是魔法，而是选对了中间训练材料

## 核心要点

1. **先分组，再定尺**：MIRA 先按内容 embedding 把 21 个数据源分成 5 个能力组。类比：老师先把作文、数学题、实验报告分开批改，而不是一张评分表打天下。

2. **让 teacher 自己说评分维度**：第一阶段不预设 rubric，而是让 frontier judge 对样本自由提出 15 个质量维度。类比：先看一批作业，归纳“这类作业到底常见什么好坏点”。

3. **把贵判断蒸馏成便宜评分器**：teacher 负责小样本发现和打标，student 负责全量跑分。类比：专家制定评分表并示范批改，助教学会后批完整个年级。

论文实验把这三步落在代码方向 mid-training 上：21 个来源、5 个来源组、约 2M 条 teacher-scored 记录用于蒸馏，再把 student scorer 跑到千万级记录。

最后不是简单取最高分，而是有三种保留粒度：全局阈值、组内阈值、来源内阈值。主结果里表现最好的是 MIRA-Group，也就是在能力组内部竞争。

## 实践案例

### 案例 1：先按数据来源分组

```python
# 论文：21 个来源；这里只写 3 个名字示意
sources = load_all_sources()  # 实际 21 个
embeddings = embed(sample_records_by_source(sources))
groups = cluster_by_mean_embedding(embeddings, k=5)
```

**逐部分解释**：

- `load_all_sources`：拿到全部来源列表；示意里只提数学/代码/agent 几类
- `embed`：把样本文本变成向量（一串数字坐标），方便比“内容像不像”
- `cluster_by_mean_embedding(..., k=5)`：把相似来源收成 5 个能力组，后面每组自带评分尺

### 案例 2：从自由评价里抽出 anchor rubric

```python
judgments = teacher.free_judge(records, dimensions=15)  # frontier 大模型当老师
points = parse_dimension_reason_pairs(judgments)
anchors = nearest_to_centroid(kmeans(embed(points), k=15))
```

**逐部分解释**：

- `free_judge`：老师自己起维度名，比如“工具调用格式”“推理完整性”
- `parse_dimension_reason_pairs`：只抽出“维度名 + 原因”，不把整段评语照搬
- `nearest_to_centroid`：每个聚类选最中心的判断点，当作稳定评分锚点

### 案例 3：可靠性 mask 怎么避免坏分数污染总分

```python
scores = student.score(record, anchors)          # 0–10 分
mask = mae_by_source_dim < 1.0                   # MAE=师生平均绝对误差
final_score = trimmed_mean(scores[mask])         # 去掉极端后再平均
```

**逐部分解释**：

- `student.score`：便宜学生评分器对 15 个锚点打分并给理由
- `mae_by_source_dim < 1.0`：师生分差太大的“来源×维度”格子直接屏蔽，不进总分
- `trimmed_mean`：对剩下维度做去极值平均，避免一个坏维度拖偏

这三个案例合起来，就是 MIRA 的主链路：先分清“同类”，再归纳“怎么评”，最后只相信“学生学得可靠”的维度。

它没有试图让一个万能评分器理解所有格式，而是把复杂度拆到来源组、rubric 维度和可靠性 mask 这三层。

## 踩过的坑

1. **把 mid-training 当普通预训练筛选**：会只看困惑度或分布匹配，原因是这些信号可扩展但不懂结构化样本的语义缺陷。

2. **给所有来源套同一个 rubric**：会把工具调用、SQL、代码解释混成一类，原因是格式不同导致“好”的证据本来就不同。

3. **只相信 teacher 直接打全量**：成本会爆炸，原因是 MIRA 处理的是千万级记录，frontier judge 只能用在小样本和标签生成上。

4. **忽略来源保留比例**：全局阈值可能抽干低均值来源，原因是分数分布差异不一定代表能力价值差异。

## 适用 vs 不适用场景

**适用**：

- mid-training 数据来自很多格式：代码文档、问答、推理链、agent 轨迹
- 你有少量预算让强 teacher 发现维度、生成训练标签
- 最终筛选仍要跑到千万级或更大语料上，所以需要 student scorer
- 评估目标是能力组合，而不是单一任务排行榜

**不适用**：

- 数据来源很单一，一张人工 rubric 已经足够稳定
- 只有几千条数据，直接人工审或 teacher 全量打分更简单
- 没有可用 teacher，也没有训练 student scorer 的算力
- 目标是去重、污染检测、版权过滤这类非语义质量问题

## 历史小故事（可跳过）

- **2023 年前后**：大模型训练开始把“预训练之后、SFT 之前”的能力补课阶段单独拿出来讨论。
- **2024-2025 年**：数据筛选方法变多，有困惑度、分布匹配、影响函数、通用质量 scorer 等路线。
- **2025 年**：DataMan 这类通用 rubric scorer 说明“语义质量”有价值，但它仍偏全局评分。
- **2026 年**：MIRA 把问题改成“每类来源自己发现评分尺”，并在代码方向 mid-training 上做系统实验。

## 学到什么

- **数据选择不是只排序**：先定义什么叫“好”，再排序，结果会完全不同。
- **rubric 也可以从数据里发现**：MIRA 不把评分维度当人工常量，而把它当 pipeline 的第一步产物。
- **可解释和可扩展可以拆开做**：teacher 提供语义解释，student 提供全量吞吐。
- **保来源多样性很关键**：MIRA-Group 比 MIRA-Global 更稳，说明能力覆盖比单纯总分更重要。

最重要的实验数字是：MIRA-Group 用 25B token 达到 64.20 macro average，高于 Random 的 63.23 和 DataMan 的 63.01，也略高于 50B raw mixture 的 63.83。

这说明它的贡献不是“训练更多”，而是在相同 25B-token 预算里更会挑；也不是“全局最高分就行”，因为 MIRA-Global 反而只有 61.81。

## 延伸阅读

- 论文 PDF：[MIRA: Mid-training Rubric Anchoring for Source-Aware Data Selection](https://arxiv.org/pdf/2605.30288v1.pdf)
- 相关方法：[DataMan: Data Manager for Pre-training Large Language Models](https://arxiv.org/abs/2502.19363)
- 数据选择基线：[Data Selection for Language Models via Importance Resampling](https://arxiv.org/abs/2302.03169)
- 数据筛选综述背景：[The History and Recent Advances of Data Selection](https://arxiv.org/abs/2402.16827)
- [[deepseek-r1]] —— 也是通过中间训练和强化学习强化推理能力的代表案例

## 关联

- [[chinchilla]] —— 讨论 token 和模型规模的训练预算，MIRA 进一步问 token 该选哪些
- [[codellama-2023]] —— 代码模型需要专门数据配方，MIRA 的实验也落在代码能力上
- [[deepseek-r1]] —— 展示后训练能放大推理能力，MIRA 关注后训练前的数据补课
- [[cot]] —— 推理链质量是 QA 组可能关心的 rubric 维度
- [[chatbot-arena-2024]] —— 都依赖评价信号，但 Arena 评模型，MIRA 评训练数据
- [[dataman-2025]] —— MIRA 对比的通用质量 scorer，代表固定 rubric 路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
