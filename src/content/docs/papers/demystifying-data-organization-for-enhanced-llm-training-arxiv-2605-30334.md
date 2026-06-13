---
title: Demystifying Data Organization for Enhanced LLM Training
来源: https://arxiv.org/abs/2605.30334
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

# Demystifying Data Organization for Enhanced LLM Training

## 一句话总结

这篇论文研究了 LLM 训练时的一个简单但被忽视的问题：**数据已经评分了，但应该按什么顺序喂给模型？**

## 从日常类比开始

想象你要背单词。手头有一张 10000 个单词的清单，每个单词旁边都标了难度分数（1-5 分）。

传统做法有两种：
- **随机顺序**：闭眼翻到哪页背哪页
- **从易到难排序**：先背 1 分的，再背 2 分的，最后背 5 分的

这篇论文说：等等，还有别的排法，而且可能更好。他们提出了 4 个"排序原则"和 2 种具体的排序方法。

## 核心概念：四个排序原则

### 1. 边界锐化（Boundary Sharpening）

**类比**：考试时先做简单题建立信心，最后做难题挑战极限。或者反过来——先做难题"唤醒"大脑，再做简单题巩固信心。

**论文解释**：控制训练开始和结束时数据分数的分布。比如在训练开始时主要放高分数据（高质量），结束时放低分数据，或者反过来。

**为什么重要**：训练初期的数据对模型的第一印象影响很大。边界锐化就是让你能"导演"这个印象。

### 2. 周期调度（Cyclic Scheduling）

**类比**：复习功课。学完新东西后，每隔几天回头复习一下旧的。不是只看最新的，而是循环往复。

**论文解释**：在单次训练中，周期性地把不同分数段的数据穿插进来。不是"背完所有简单词再背难的"，而是"每背 10 个简单词，穿插 2 个难的"。

**为什么重要**：纯从易到难的排序可能导致模型忘记早期学的内容（灾难性遗忘）。周期调度让模型不断回看不同难度。

### 3. 课程连续性（Curriculum Continuity）

**类比**：上体育课。你不能从散步直接跳到百米冲刺，需要逐渐加速。如果难度跳得太猛，模型会" shock"（优化器震荡）。

**论文解释**：避免数据分数出现突然的大幅跳跃，让训练过程平稳过渡。

**为什么重要**：优化器（模型学习时的"引擎"）喜欢循序渐进的信号。突然的难度跳跃会让它迷失方向。

### 4. 局部多样性（Local Diversity）

**类比**：看 Netflix 不会连续看 10 集同样的剧。每次推荐的内容应该有变化——不同的主题、不同的风格。

**论文解释**：在局部窗口（比如一个小批次的数据）内，保持数据的异质性，不要全是高分或低分。

**为什么重要**：多样性让模型学到更广泛的特征。一直吃"同一道菜"，营养不均衡。

## 两种新方法：STR 和 SAW

论文在四大原则基础上，提出了两种排序方法：

| 方法 | 全称 | 核心思想 |
|------|------|----------|
| **STR** | Stair Ordering（阶梯排序） | 把数据分层，在每层的"过渡区"用折叠排序，其余部分用阶梯式递进 |
| **SAW** | Saw Ordering（锯齿排序） | 和 STR 类似，但在过渡区用之字形排序，形成锯齿状的数据流 |

**直观理解**：

- STR 像上楼梯：一步一步往上走，但在每层之间有个小折返
- SAW 像锯子的齿：锯齿状来回摆动，整体趋势是单向的

两种方法都保留了"从易到难"的大趋势，同时在局部加入波动来增加多样性。

## 代码示例

### 示例 1：基本的数据排序流程

假设你已经有一组带分数的数据（比如每个样本有个 `average_test_score` 字段），想对它排序：

```python
import json

# 1. 加载带分数的数据
# 假设每个样本格式：{"text": "Hello world", "average_test_score": 3.7}
data = []
with open("scored_data.jsonl", "r") as f:
    for line in f:
        data.append(json.loads(line))

# 2. 按分数排序（最简单的 baseline）
data_sorted = sorted(data, key=lambda x: x["average_test_score"])

# 3. 写回 JSONL
with open("ordered_data.jsonl", "w") as f:
    for item in data_sorted:
        f.write(json.dumps(item) + "\n")
```

这是论文中的 `sorting` 基线方法——单纯从低分到高分排序。

### 示例 2：实现折叠排序（Folding Ordering）

折叠排序是 STR 和 SAW 的基础。想象把数据排成一行，然后从中间"折叠"回来：

```python
import numpy as np

def folding_order(data, num_layers=5):
    """
    折叠排序：
    1. 先把数据按分数从低到高排序
    2. 然后分成 num_layers 层
    3. 奇数层正向，偶数层反向，依次连接
    """
    data_sorted = sorted(data, key=lambda x: x["average_test_score"])
    n = len(data_sorted)
    layer_size = n // num_layers

    ordered = []
    for i in range(num_layers):
        start = i * layer_size
        end = start + layer_size if i < num_layers - 1 else n

        layer = data_sorted[start:end]
        # 偶数层正向，奇数层反向（形成折叠效果）
        if i % 2 == 0:
            ordered.extend(layer)
        else:
            ordered.extend(reversed(layer))

    return ordered

# 使用
ordered_data = folding_order(data, num_layers=5)
```

**折叠的效果**：模型先学低分数据（第 0 层正向），然后回看高分数据（第 1 层反向），再回到低分（第 2 层正向）... 形成周期调度。

### 示例 3：实现锯齿排序（SAW）的简化版

SAW 在折叠的基础上，在"过渡区域"加入锯齿波动：

```python
def saw_order(data, num_layers=5, transition_ratio=0.1):
    """
    锯齿排序（SAW）简化版：
    1. 数据按分数排序
    2. 分成 num_layers 层
    3. 每层内部的"过渡区"用锯齿式排列，其余部分保持有序
    """
    data_sorted = sorted(data, key=lambda x: x["average_test_score"])
    n = len(data_sorted)
    layer_size = n // num_layers
    transition_size = int(layer_size * transition_ratio)

    ordered = []
    for i in range(num_layers):
        start = i * layer_size
        end = start + layer_size if i < num_layers - 1 else n
        layer = data_sorted[start:end]

        if len(layer) <= 2 * transition_size:
            # 数据太少，直接翻转
            if i % 2 == 1:
                ordered.extend(reversed(layer))
            else:
                ordered.extend(layer)
            continue

        # 头部（非过渡区）：按原顺序
        ordered.extend(layer[:transition_size])

        # 过渡区：用锯齿式排列
        trans_start = transition_size
        trans_end = len(layer) - transition_size
        trans_region = layer[trans_start:trans_end]
        trans_region_sorted = sorted(trans_region, key=lambda x: x["average_test_score"])

        # 锯齿：从两端交替取元素
        left, right = 0, len(trans_region_sorted) - 1
        zigzag = []
        toggle = True
        while left <= right:
            if toggle:
                zigzag.append(trans_region_sorted[left])
                left += 1
            else:
                zigzag.append(trans_region_sorted[right])
                right -= 1
            toggle = not toggle
        ordered.extend(zigzag)

        # 尾部（非过渡区）：按原顺序
        ordered.extend(layer[trans_end:])

    return ordered

# 使用
saw_data = saw_order(data, num_layers=5, transition_ratio=0.1)
```

**锯齿的效果**：整体仍从低分到高分，但在每层的过渡区加入锯齿波动。既有课程连续性（不会太跳），又有局部多样性（不是单调递增）。

## 完整流程图

```
原始数据（带分数）
       │
       ▼
┌─────────────┐
│ 数据评分     │  ← 这一步论文假设已完成（复用已有分数）
│ (Data Scoring)│
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 数据筛选     │  ← 从大数据中选出一子集（可选）
│ (Selection)  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 数据排序     │  ← 这篇论文的重点！
│ (Ordering)   │  应用 STR / SAW / 折叠 / 之字形等
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 模型训练     │
│ (Training)   │
└──────┬──────┘
       │
       ▼
     更好的模型
```

## 实验发现

论文在多个模型规模和数据集上做了实验，主要发现：

1. **STR 和 SAW 在所有规模上都优于随机排序** — 不是只在大数据集上有用
2. **预训练和 SFT（监督微调）两个阶段都有效** — 排序的重要性贯穿整个训练流程
3. **SAW 通常略优于 STR** — 锯齿的波动比阶梯的过渡能带来更多多样性
4. **四个原则相互之间不冲突** — 可以同时应用，没有明显的 trade-off

## 关键对比：不同排序方法的直观效果

假设有 30 条数据，分数从 1 到 10：

```
随机排序：  [3, 8, 1, 9, 2, 7, 5, 10, 4, 6, ...]  ← 完全无规律
排序基线：  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, ...]   ← 单调递增，缺少多样性
折叠排序：  [1,2,3, 9,8,7, 4,5,6, 10, ...]           ← 折叠回看
SAW：      [1,2,3, 3,4,5, 5,4,6, 6,7,8, 8,7,9, ...] ← 锯齿波动 + 大趋势递增
```

SAW 看起来最"乱"，但仔细看它的整体趋势仍然是递增的——这就是论文的精髓：**大局有序，局部有变**。

## 学习要点总结

- 数据质量重要，**数据顺序同样重要** — 这是论文的核心论点
- 四个原则（边界锐化、周期调度、课程连续性、局部多样性）是通用的排序指导方针
- STR 和 SAW 是具体可执行的排序算法，不是纯理论
- 即使已有数据的评分，只需要改变顺序就能获得性能提升，成本极低
- 排序方法在预训练和微调阶段都适用

## 延伸阅读

- 论文代码仓库：https://github.com/microsoft/data-efficacy/
- 前置工作（DELT）：https://arxiv.org/abs/2506.21545
- 课程学习（Curriculum Learning）经典论文：https://arxiv.org/abs/0906.0530
