---
title: 微调表示偏移与多模态大模型控制
来源: https://arxiv.org/abs/2501.03012
日期: 2026-06-13
分类: 机器学习
子分类: 多模态
provenance: pipeline-v3
---

# 微调表示偏移与多模态大模型控制

## 一、从日常类比开始：搬家后的记忆

想象你有一个朋友，他学的是通用英语——什么都能聊一点，但什么都不精。后来他去了一家旅行社工作，每天只跟旅游景点打交道。半年之后，你再问他"人"这个词是什么意思，他的反应可能跟以前不一样了——脑子里蹦出来的可能是"游客""导游""景点"这些词，而不是"家人""朋友""同事"。

这就是这篇论文要研究的核心问题：**当一个多模态大模型（MLLM）经过微调之后，它大脑里存储的概念到底发生了什么变化？**

多模态大模型（比如 LLaVA）能看图说话。它内部有一个"视觉编码器"负责看懂图片，还有一个"语言模型"负责组织语言。这两个部分之间有一个"连接器"把它们缝合在一起。当我们用特定数据（比如专门教它描述颜色或地点）去微调它的时候，它的内部表示——也就是那些看不见的隐藏状态——会发生偏移。

这篇论文的贡献可以概括为三件事：

1. 提出了一套方法，能把模型内部的隐藏状态映射到人类可理解的"概念"上
2. 计算出"偏移向量"，精确描述微调前后每个概念的变化方向
3. 利用这些偏移向量，在不重新训练模型的情况下，直接"操控"模型的输出行为

## 二、核心概念拆解

### 2.1 什么是"概念"？

在深度学习中，模型处理信息时会经过很多层。每一层的输出叫做"隐藏状态"（hidden state），本质上是一个很长的数字向量。论文认为，这些向量里面编码了各种"语义概念"——比如"红色""街道""开心""男性"等等。

怎么从一堆数字里找到这些概念呢？论文的做法是这样的：

- 拿一批图片输入模型，提取某一层的所有隐藏状态，组成一个矩阵 Z
- 对这个矩阵做分解（论文用的是 K-Means 聚类），把相似的隐藏状态归为一组
- 每一组的中心点就是一个"概念向量"

打个比方：你有一堆水果照片，模型看完之后内部会产生很多不同的激活模式。你把相似的模式聚在一起，其中一组的中心可能就代表"苹果"这个概念，另一组代表"香蕉"。

### 2.2 什么是"表示偏移"？

还是回到旅行社朋友的例子。他原来的"人"概念对应一组向量 u_old，工作半年后变成了 u_new。两者之间的差值就是偏移：

    偏移量 = u_new - u_old

论文把这个差值称为"概念偏移向量"（concept shift vector），记作 Delta。有了这个向量，你甚至不需要知道微调后的模型长什么样——只需要在原模型的对应概念向量上加上这个偏移向量，就能近似得到微调后的概念。

公式很简单：

    u_shifted = u_original + alpha * Delta

这里的 alpha 是一个可调系数，控制偏移的强度。当 alpha=1 时，偏移量最大；alpha 越小，偏移越温和。

### 2.3 什么是"模型操控"（Steering）？

这是整篇论文最实用的部分。既然我们知道微调会让概念往哪个方向偏移，那我们能不能**不重新训练模型**，直接在原模型上做同样的偏移操作，来达到类似微调的效果？

答案是：可以。

论文展示了两种操控方式：

- **粗粒度操控**：整体改变模型的输出倾向，比如让模型更多回答"是"或"否"
- **细粒度操控**：针对具体概念做调整，比如把"男医生"改成"女医生"，或者把有性别偏见的描述改成中性描述

关键优势在于：整个过程不需要修改模型参数，也不需要重新训练，只是在推理时临时往隐藏状态里加一个向量。计算开销极小。

## 三、代码示例

### 示例一：提取概念并计算偏移向量

下面这个伪代码演示了如何从一个原始模型和一个微调后的模型中提取概念，并计算偏移向量：

```python
import torch
from sklearn.cluster import KMeans

def extract_concepts(model, images, layer_index, num_concepts=64):
    """从模型的指定层提取隐藏状态并用 K-Means 聚类出概念"""
    # 前向传播获取指定层的隐藏状态
    hidden_states = []
    for img in images:
        outputs = model(img, output_hidden_states=True)
        # 取出指定层的隐藏状态，形状: [batch, seq_len, hidden_dim]
        hs = outputs.hidden_states[layer_index]
        # 取平均池化得到每个样本的表示
        hs_avg = hs.mean(dim=1)  # [batch, hidden_dim]
        hidden_states.append(hs_avg)

    # 拼接所有样本的隐藏状态
    Z = torch.cat(hidden_states, dim=0)  # [num_samples, hidden_dim]

    # 用 K-Means 聚类提取概念
    kmeans = KMeans(n_clusters=num_concepts, random_state=42)
    labels = kmeans.fit_predict(Z.detach().numpy())

    # 每个簇的中心就是概念向量
    concepts = kmeans.cluster_centers_  # [num_concepts, hidden_dim]

    return concepts, labels

# ---- 步骤1：从原始模型和微调模型分别提取概念 ----
original_concepts, _ = extract_concepts(
    model=original_model,
    images=train_images,
    layer_index=29,       # 通常越深的层效果越好
    num_concepts=64
)

finetuned_concepts, _ = extract_concepts(
    model=finetuned_model,
    images=train_images,
    layer_index=29,
    num_concepts=64
)

# ---- 步骤2：将原始概念与微调概念做匹配 ----
# 用余弦相似度一一配对
from sklearn.metrics.pairwise import cosine_similarity

similarity_matrix = cosine_similarity(original_concepts, finetuned_concepts)
# 用最优传输算法做一一匹配（避免多个原始概念匹配到同一个微调概念）
from scipy.optimize import linear_sum_assignment
row_ind, col_ind = linear_sum_assignment(-similarity_matrix)

# ---- 步骤3：计算每个概念的偏移向量 ----
shift_vectors = {}
for orig_idx, finetuned_idx in zip(row_ind, col_ind):
    delta = finetuned_concepts[finetuned_idx] - original_concepts[orig_idx]
    shift_vectors[orig_idx] = delta
```

这段代码做了三件事：先用 K-Means 从原始模型和微调模型中分别提取概念，然后用最优传输算法把两个概念集合一一配对，最后算出每个概念对应的偏移向量。

### 示例二：用偏移向量操控模型输出

拿到偏移向量之后，就可以在推理时直接应用，无需修改模型：

```python
def steer_model(model, images, shift_vectors, layer_index=29, alpha=1.0):
    """在不修改模型参数的情况下，通过偏移向量操控模型输出"""
    outputs = model(images, output_hidden_states=True)

    # 取出目标层的隐藏状态
    hidden_states = list(outputs.hidden_states)
    hs = hidden_states[layer_index].clone()  # [batch, seq_len, hidden_dim]

    # 对每个样本，根据其主要激活的概念施加偏移
    for i in range(hs.shape[0]):
        # 找出这个样本最激活的概念
        concept_activations = torch.matmul(hs[i], torch.tensor(
            list(shift_vectors.values())
        ).T)
        dominant_concept = concept_activations.argmax(dim=0).item()

        # 如果这个概念有对应的偏移向量，就施加偏移
        if dominant_concept in shift_vectors:
            shift = torch.tensor(shift_vectors[dominant_concept])
            hs[i] = hs[i] + alpha * shift.unsqueeze(0)

    # 把修改后的隐藏状态放回模型继续前向传播
    hidden_states[layer_index] = hs
    outputs.hidden_states = tuple(hidden_states)

    # 生成文本（模型会继续用修改后的表示生成回答）
    generated = model.generate(
        **outputs,
        max_new_tokens=50,
        do_sample=False
    )
    return model.batch_decode(generated, skip_special_tokens=True)

# ---- 实际应用：把模型的回答从"Yes"引导到"No" ----
# 首先收集目标类别的偏移向量
yes_answers = collect_answers(model, dataset, answer_type="yes")
no_answers = collect_answers(model, dataset, answer_type="no")

yes_mean = torch.stack(yes_answers).mean(dim=0)
no_mean = torch.stack(no_answers).mean(dim=0)
steering_vector = no_mean - yes_mean  # 从"是"指向"否"的方向

# 推理时施加偏移
results = steer_model(
    model=original_model,
    images=test_images,
    shift_vectors={"yes_to_no": steering_vector},
    layer_index=29,
    alpha=1.0
)
```

这段代码的核心思路是：在推理过程中，从模型的中间层取出隐藏状态，根据样本主要激活的概念查找对应的偏移向量，然后直接加上去。模型后面的层会"以为"这些偏移是自然产生的，从而生成被引导过的输出。

## 四、实验发现

论文在 LLaVA-1.5（一个 7B 参数的多模态模型）上做了大量实验，主要有几个重要发现：

**微调确实改变了概念。** 当用"地点"相关的数据微调模型后，原来表示"人"的概念会融入更多地点相关的词汇，比如"游客""街道""车站"。论文用一个叫 T-Overlap 的指标来量化这种变化——数值越低，说明概念变化越大。

**有两种变化模式。** 有些概念只是微调加强（比如原本就包含"车"的概念，微调后更强调"公交车"），变化较小；有些概念则发生了根本性转变，甚至出现了全新的概念。

**偏移向量可以恢复微调效果。** 这是论文最核心的发现之一：只用原模型加上偏移向量，就能近似还原微调后模型的大部分概念表现。这意味着在某些场景下，你可能根本不需要重新训练模型——只要算好偏移向量就行。

**偏移一致性决定恢复质量。** 如果某个概念在微调时，每个样本的偏移方向都比较一致，那么这个概念就能被很好地恢复。反之，如果样本间的偏移方向很分散，恢复效果就差。

## 五、模型操控的实际应用

### 5.1 答案类型引导

在视觉问答任务中，论文展示了如何引导模型的答案类型：

- 粗粒度：让模型更多地回答"是/否"、"数字"或"其他"
- 细粒度：让"是"变成"否"，让"1"变成"3"，让"白色"变成"黑色"

关键结果是：操控只影响目标答案类型，对其他类型的准确率几乎没有影响。

### 5.2 图像描述风格控制

论文还展示了如何控制图像描述的侧重点。通过施加偏移向量，可以让模型在描述同一张图片时，更多地关注颜色、地点或情感，而不需要重新训练。

### 5.3 性别去偏见

这是一个很有社会意义的例子。模型在描述人物时可能会产生性别偏见（比如把"护士"默认关联为女性）。论文用细粒度偏移向量，把带有性别偏见的概念引导到中性概念上，显著减少了偏见表达。细粒度方法比粗粒度方法效果更好。

### 5.4 安全对齐

论文还展示了如何用偏移向量增强模型的安全性，让模型在面对有害请求时更倾向于拒绝回答，而不是生成危险内容。

## 六、局限性与思考

论文也坦诚了几个限制：

- 概念提取的质量依赖于 K-Means 聚类的效果，而 K-Means 假设概念是球形分布的，这可能不符合真实情况
- 偏移向量只在较深的层效果显著，浅层的效果较差
- 对于某些变化剧烈的概念，偏移向量只能部分恢复，不能完全还原
- 偏移强度的选择（alpha 值）需要人工调参

## 七、总结

这篇论文的核心思想可以用一句话概括：**微调的本质是概念空间的线性平移，而这种平移是可以被测量、被复现、被操控的。**

对初学者来说，最重要的收获是理解了一个关键直觉：模型内部的知识不是混沌的一团，而是可以被拆解成一个个可理解的概念。当我们能精确测量这些概念的变化方向和幅度时，我们就获得了一种不通过训练就能操控模型行为的能力。

这就像是在模型的大脑里画了一张导航地图——你知道从"A 地"到"B 地"该怎么走，甚至可以直接把人"搬"过去，省去一路走的麻烦。

---

*论文发表于 ICCV 2025，代码已开源：https://pegah-kh.github.io/projects/lmm-finetuning-analysis-and-steering/*
