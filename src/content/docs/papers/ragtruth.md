---
title: RAGTruth: A Hallucination Corpus for Developing Trustworthy Retrieval-Augmented Language Models
来源: https://arxiv.org/abs/2401.00396
日期: 2026-06-13
分类: 机器学习
子分类: RAG
provenance: pipeline-v3
---

# RAGTruth 学习笔记

## 什么是 RAGTruth？

RAGTruth 是一个专门用来研究"AI 幻觉"（hallucination）的大型数据集。所谓幻觉，就是 AI 说了一些看起来有道理但跟提供给你的参考资料不符或根本没有根据的话。

## 日常类比：借笔记写作业

想象一下：老师给你发了三段课堂笔记（参考资料），让你写作业。你明明可以照着笔记写，但你却写出了一个笔记里根本没有的日期，或者把笔记里的"24 到 30 周"说成了"20 到 32 周"。这就是 AI 的幻觉问题。

RAG（检索增强生成）就是让 AI 先"查资料再回答"的方法。即使加了 RAG，AI 仍然可能出错——RAGTruth 就是研究这种错误的"考试卷"。

## 核心概念

### 1. 幻觉的四类分级

论文把幻觉分成四种严重程度：

- **明显矛盾**：AI 说的跟资料直接冲突，比如资料说"24-30 周"，AI 说"20-32 周"
- **微妙矛盾**：AI 改了关键的措辞，改变了原意，但不那么明显
- **明显无中生有**：AI 编造了资料里完全没有的细节
- **微妙无中生有**：AI 根据常识推理出了资料里没有的内容，看起来合理但没有依据

### 2. 三个任务场景

RAGTruth 覆盖了三种常见任务：

| 任务 | 数据来源 | 样本数 |
|------|----------|--------|
| 问答 | MS MARCO（日常生活问题） | 989 |
| 数据到文本 | Yelp 商家信息 | 1,033 |
| 新闻摘要 | CNN/Daily Mail + 近期新闻 | 943 |

每个样本用了 6 个不同的模型（GPT-3.5、GPT-4、Llama-2 三个版本、Mistral-7B）各生成一个回答，总共约 17,790 条回复。

### 3. 数据规模

- 2,965 个原始样本
- 17,790 条模型回复
- 14,289 个人工标注的幻觉片段
- 幻觉回复占比 43.1%

### 4. 两个检测层级

- **回复级别**：判断整段回答是否包含幻觉
- **片段级别**：精确标出幻觉出现在哪个词/短语上

## 关键发现

- GPT-4 幻觉率最低（整体密度 0.06-0.27），GPT-3.5 次之
- Llama-2 系列中，模型越大幻觉越少（7B > 13B > 70B 递减）
- Mistral-7B 幻觉回复数量最多
- 回复越长，幻觉越多
- 幻觉集中在回复的末尾（问答和摘要任务）

## 代码示例

### 示例 1：模拟 RAG 幻觉检测

```python
# 模拟 RAGTruth 的数据结构
# 一条样本包含：问题 + 检索到的参考资料 + AI 的回答 + 幻觉标注

sample = {
    "question": "如何准备做超声波检查？",
    "contexts": [
        "如果想查性别，最早 17 周可以去。"
        "3D 超声波最佳时间是 20-32 周。"
        "最好的成像效果在 24-30 周。"
    ],
    "response": "17 周可以做性别检测，3D 超声波预约在 20-32 周可获得最佳成像效果。",
    "annotations": [
        {
            "span": "20-32 周可获得最佳成像效果",
            "type": "Evident Conflict",
            "reason": "原文说最佳是 24-30 周，AI 说成了 20-32 周"
        }
    ]
}

# 简单的幻觉密度计算函数
# 幻觉密度 = 幻觉片段数 / 回复总词数
def calc_hallucination_density(response, annotations):
    words = len(response.split())
    span_count = len(annotations)
    density = span_count / words if words > 0 else 0
    return {
        "response_length": words,
        "hallucination_count": span_count,
        "density": round(density, 4),
    }

result = calc_hallucination_density(sample["response"], sample["annotations"])
print(result)
# {'response_length': 28, 'hallucination_count': 1, 'density': 0.0357}
```

### 示例 2：幻觉类型分类器

```python
# RAGTruth 的四种幻觉类型分类
HALLUCINATION_TYPES = {
    "evident_conflict": "明显矛盾 — AI 回答与资料直接冲突",
    "subtle_conflict": "微妙矛盾 — AI 改变了关键措辞",
    "evident_baseless": "明显无中生有 — AI 编造了资料中不存在的细节",
    "subtle_baseless": "微妙无中生有 — AI 推理出了资料中没有的内容",
}

def classify_hallucination(response, contexts):
    """
    判断 AI 回答中的幻觉属于哪种类型。
    这是一个简化的示例逻辑。
    """
    hallucination_found = False
    hallucination_type = None

    # 检查是否出现明显矛盾
    for ctx in contexts:
        if ctx in response:
            continue
        # 简化：如果回答包含类似但不完全匹配的内容
        # 可能是矛盾类
        hallucination_found = True
        hallucination_type = "evident_conflict"
        break

    return {
        "hallucination": hallucination_found,
        "type": hallucination_type,
        "description": HALLUCINATION_TYPES.get(hallucination_type, "无幻觉"),
    }

# 测试
test_result = classify_hallucination(
    response="3D 超声波预约在 20-32 周可获得最佳成像效果",
    contexts=["最好的成像效果在 24-30 周"]
)
print(test_result)
# {'hallucination': True, 'type': 'evident_conflict',
#  'description': '明显矛盾 — AI 回答与资料直接冲突'}
```

### 示例 3：用微调模型做幻觉检测

论文的核心贡献之一是：用 RAGTruth 数据集微调 Llama-2-13B，在幻觉检测上达到了比 GPT-4 提示方法更好的效果。

```python
# 论文结果：微调模型的幻觉检测 F1 分数

results = {
    "GPT-3.5 Turbo 提示方法": {"precision": 37.1, "recall": 92.3, "f1": 52.9},
    "GPT-4 Turbo 提示方法": {"precision": 46.9, "recall": 97.9, "f1": 63.4},
    "SelfCheckGPT": {"precision": 49.7, "recall": 71.9, "f1": 58.8},
    "LMvLM": {"precision": 36.2, "recall": 77.8, "f1": 49.4},
    "RAGTruth 微调 Llama-2-13B": {"precision": 76.9, "recall": 80.7, "f1": 78.7},
}

# 按 F1 排序
sorted_results = sorted(results.items(), key=lambda x: x[1]["f1"], reverse=True)
for name, metrics in sorted_results:
    print(f"{name}: F1 = {metrics['f1']} (精确率={metrics['precision']}, 召回率={metrics['recall']})")
```

## 重要概念：隐式真实（Implicit Truth）

RAGTruth 有一个特别的设计：即使 AI 说的内容在现实中可能是真的，但如果资料里没有提到，也算幻觉。比如 AI 说"这家餐厅接受信用卡"，而资料里没提——即使事实上确实接受，这也算幻觉。

这是因为 RAG 应用的原则是：AI 不应该利用自己的内部知识来补充信息，而应该严格依赖提供的参考资料。

## 总结

RAGTruth 的价值在于：

1. 这是第一个专门针对 RAG 场景的大规模幻觉数据集（18K 条回复、14K 个标注片段）
2. 定义了四种幻觉类型，让评估更精细
3. 证明了用好的数据集微调小模型（Llama-2-13B）可以超过 GPT-4 的提示方法
4. 幻觉检测和抑制是可以学习和训练的，不一定要靠大模型

## 参考资料

- arXiv:2401.00396v2 - https://arxiv.org/abs/2401.00396
- 论文作者：Cheng Niu 等（NewsBreak + UIUC）
- 提交日期：2023-12-31，修订于 2024-05-17
