---
title: Grade Inflation in Generative Models
来源: https://arxiv.org/abs/2501.00664
日期: 2026-06-13
分类: 其他
子分类: 模型评估
provenance: pipeline-v3
---

# Grade Inflation in Generative Models

> 论文：Phuc Nguyen, Miao Li, Alexandra Morgan, Rima Arnaout, Ramy Arnaout
> 发表于 2025 年 1 月（arXiv:2501.00664v3）

## 一、从「打分水涨船高」说起

你参加了一场考试。满分 100 分，标准答案很严格。

第一种情况：一位老师给每位考生都打了 95 分以上——哪怕答案明显不完整。这叫「分数膨胀」（grade inflation）。分数看起来很高，但你无法区分谁真正优秀。

第二种情况：另一位老师按真实水平打分，有人 95 分，有人 60 分，分数分布拉开了差距。这才是有分辨力的评分。

这篇论文说的就是这个道理——只不过场景换成了「评估生成模型生成的数据质量」。

生成模型（比如 GAN、扩散模型、CTGAN）会造出「假数据」。我们怎么知道这些假数据好不好？常用方法是拿假数据和真实数据做对比，算一个「相似度分数」。作者发现：**很多常用的相似度分数天生就「手软」**——它们给出的分数总是偏高，把不够好的模型也评出了高分。这就是「分数膨胀」。

## 二、核心概念

### 2.1 问题设定：比较两个二维分布

假设你有一组真实数据（real data），横轴是特征 A，纵轴是特征 B。同时你有一个生成模型，它也产出了一组数据（synthetic data），同样的两个特征。

现在要回答一个问题：**生成的数据和真实数据有多像？**

常见做法是把二维空间切成一个个小格子（binning），统计每个格子里有多少个点，然后比较两组分布的差异。

### 2.2 两大类评分方法

论文提出了一个关键分类：

**Equipoint 分数（等点分数）**：每个数据点权重相同。不管这个点落在数据密集区还是稀疏区，它对总分的贡献是一样的。

常见的 equipoint 分数包括：
- 相关系数分数（Correlation Score）
- Jaccard 分数（Jaccard Score）
- 地球移动距离分数（Earth-Mover's Score）
- KL 散度分数（Kullback-Leibler Score）

**Equidensity 分数（等密分数）**：根据数据点的局部密度来加权。密集区域的点对分数影响更大，稀疏区域影响更小。

论文提出的 **Eden Score** 就是第一个 equidensity 分数。

### 2.3 为什么 equipoint 分数会膨胀？

直觉理解：

想象真实数据集中在左上角一个小区域。生成模型也大致覆盖了那个区域，但同时在右下角随机撒了很多噪声点。

如果用 equipoint 分数，每个点平等计数。生成模型的噪声点虽然毫无意义，但它们也算「点」，也会贡献分数。结果就是——分数被这些无意义的点「撑高」了。

equidensity 分数则不同：密集区的点权重高，稀疏区的点权重低。那些随机噪声点在稀疏区，权重很低，不会显著拉高总分。

## 三、四个有问题的分数

### 3.1 相关系数分数（Correlation Score）

原理：把两个分布各自映射到一组特征向量上，然后计算这两个向量的相关系数。

问题：每个数据点平等参与向量构建，噪声点也会被计入。

```python
import numpy as np
from scipy.stats import pearsonr

def correlation_score(real_hist, synth_hist, bins=20):
    """
    相关系数分数：将二维直方图展平为一维向量，计算 Pearson 相关系数。
    
    real_hist: 真实数据的二维直方图 (bins x bins)
    synth_hist: 生成数据的二维直方图
    
    返回: 相关系数 [-1, 1]，越接近 1 越好
    """
    # 将二维直方图展平为一维
    real_flat = real_hist.flatten().astype(float)
    synth_flat = synth_hist.flatten().astype(float)
    
    # 归一化为概率分布
    real_flat /= real_flat.sum()
    synth_flat /= synth_flat.sum()
    
    # 计算 Pearson 相关系数
    corr, _ = pearsonr(real_flat, synth_flat)
    return corr

# 演示：即使生成数据质量差，分数也可能偏高
np.random.seed(42)
n_real = 1000
n_synth = 1000

# 真实数据：集中在 (0.5, 0.5) 附近的高斯分布
real_data = np.random.randn(n_real, 2) * 0.1 + np.array([0.5, 0.5])

# 生成数据：大部分好，但混入大量均匀分布的噪声
good_synth = np.random.randn(int(n_synth * 0.6), 2) * 0.1 + np.array([0.5, 0.5])
bad_synth = np.random.uniform(0, 1, (int(n_synth * 0.4), 2))
synth_data = np.vstack([good_synth, bad_synth])

# 计算二维直方图
bins = np.linspace(0, 1, 21)
real_hist, _, _ = np.histogram2d(real_data[:, 0], real_data[:, 1], bins=bins)
synth_hist, _, _ = np.histogram2d(synth_data[:, 0], synth_data[:, 1], bins=bins)

score = correlation_score(real_hist, synth_hist)
print(f"相关系数分数（含 40% 噪声的生成数据）: {score:.4f}")
# 输出可能仍然很高（如 0.8+），尽管数据质量并不好
```

### 3.2 Jaccard 分数

原理：把每个格子看作一个元素，计算「有数据的格子集合」的交集除以并集。

问题：只要某个格子里有至少一个点就算「存在」，不考虑点数多少。噪声点也能让空格子变「有数据」，从而增大并集但不会显著增加交集。

```python
def jaccard_score(real_hist, synth_hist):
    """
    Jaccard 分数：基于格子是否有数据的集合相似度。
    
    返回: Jaccard 指数 [0, 1]，越大越相似
    """
    # 将直方图二值化：有数据为 1，无数据为 0
    real_binary = (real_hist > 0).astype(int)
    synth_binary = (synth_hist > 0).astype(int)
    
    intersection = np.logical_and(real_binary, synth_binary).sum()
    union = np.logical_or(real_binary, synth_binary).sum()
    
    return intersection / union if union > 0 else 0

# 演示：噪声点会让很多原本空的格子变成「有数据」
# 这会增大并集，但如果噪声也偶尔落在真实数据区域，
# 交集也会增加，导致分数虚高
score_jaccard = jaccard_score(real_hist, synth_hist)
print(f"Jaccard 分数（含 40% 噪声）: {score_jaccard:.4f}")
```

### 3.3 地球移动距离分数（Earth-Mover's Score）

原理：把一个分布「推」成另一个分布需要的最小工作量。工作越少，分数越高。

问题：每个单位质量的权重相同。稀疏区域的微小扰动对总工作量的影响被低估。

### 3.4 KL 散度分数（Kullback-Leibler Score）

原理：衡量两个概率分布之间的信息损失。

问题：同样平等对待每个 bin 的概率质量，没有考虑空间密度。

## 四、Eden Score：等密度评分的解决方案

Eden Score 的核心思想：给每个格子分配一个权重，权重取决于该格子的密度。高密度格子权重高，低密度格子权重低。

```python
def eden_score(real_hist, synth_hist, alpha=1.0):
    """
    Eden Score（等密度分数）：根据格子密度加权比较两个分布。
    
    参数:
        real_hist: 真实数据的二维直方图
        synth_hist: 生成数据的二维直方图
        alpha: 密度权重参数，控制对高密度区域的重视程度
               alpha 越大，越重视高密度区域
    
    返回: Eden 分数 [0, 1]，越大越好
    
    原理:
        每个格子的权重 w(i,j) = density(i,j)^alpha
        其中 density 是该格子的归一化概率质量
        然后计算加权后的分布相似度
        
        这与负阶 Rényi 熵有关：alpha 越大，
        相当于关注分布的「最密集部分」
    """
    # 转换为概率分布
    real_prob = real_hist.astype(float)
    synth_prob = synth_hist.astype(float)
    
    real_prob /= real_prob.sum()
    synth_prob /= synth_prob.sum()
    
    # 计算密度权重：每个格子的概率质量的 alpha 次方
    # 这会给高密度格子更大的权重
    real_weight = real_prob ** alpha
    synth_weight = synth_prob ** alpha
    
    # 归一化权重
    real_weight /= real_weight.sum()
    synth_weight /= synth_weight.sum()
    
    # 计算加权后的 Jensen-Shannon 相似度
    # JS 散度是 KL 散度的对称、有界版本
    m = 0.5 * (real_weight + synth_weight)
    
    # KL(m || real) + KL(m || synth)，注意避免 log(0)
    eps = 1e-10
    js_divergence = (
        np.sum(real_weight * np.log(real_weight / m + eps)) +
        np.sum(synth_weight * np.log(synth_weight / m + eps))
    )
    
    # JS 散度范围 [0, log(2)]，转为 [0, 1] 的相似度
    js_similarity = 1.0 - js_divergence / np.log(2)
    
    return max(0, js_similarity)

# 对比：Eden Score 对噪声更敏感
score_eden = eden_score(real_hist, synth_hist, alpha=2.0)
print(f"Eden Score（alpha=2.0，含 40% 噪声）: {score_eden:.4f}")

# 对比干净数据
clean_synth = np.random.randn(n_synth, 2) * 0.1 + np.array([0.5, 0.5])
clean_hist, _, _ = np.histogram2d(clean_synth[:, 0], clean_synth[:, 1], bins=bins)
score_eden_clean = eden_score(real_hist, clean_hist, alpha=2.0)
print(f"Eden Score（干净数据）: {score_eden_clean:.4f}")

# 可以看到：Eden Score 对干净数据的评分明显高于含噪声数据
# 而前面的相关系数分数可能两者差别不大
```

## 五、论文的关键发现

| 分数类型 | 分数名称 | 是否存在膨胀 | 原因 |
|---------|---------|------------|------|
| Equipoint | 相关系数分数 | 是 | 每个点平等计数 |
| Equipoint | Jaccard 分数 | 是 | 每个格子平等计数 |
| Equipoint | 地球移动距离 | 是 | 每个单位质量权重相同 |
| Equipoint | KL 散度 | 是 | 每个 bin 平等对待 |
| Equidensity | Eden Score | 否 | 按密度加权，稀疏区权重低 |

**核心结论**：任何平等对待所有数据点的评分方法都会出现分数膨胀。要让评分有分辨力，必须让评分方法「重视密集区域」，这正是 equidensity 分数的优势。

## 六、与 Rényi 熵的联系

论文发现 equidensity 分数与负阶 Rényi 熵有数学上的联系。

Rényi 熵是一族广义熵，由参数 alpha 控制：

- alpha 趋近 0：关注分布的「覆盖范围」（有多少格子有数据）
- alpha = 1：标准的香农熵
- alpha 趋近无穷：只关注最大概率的那个格子

当 alpha 为**负数**时，Rényi 熵反过来关注分布的「最稀疏部分」。Eden Score 使用的正是这种负阶 Rényi 熵的思想——通过给高密度区域更高权重，让评分更关注数据的核心结构。

## 七、实践建议

1. 如果你在做生成模型的评估，优先使用 Eden Score 或类似 equidensity 分数，而不是相关系数或 Jaccard 分数。

2. 如果必须用传统分数（比如为了和已有工作对比），要意识到这些分数可能会高估模型质量。

3. 二维分布比较只是评估的第一步。高维数据可以先用 PCA、t-SNE 或 UMAP 降维到二维，再用这些分数检查关键特征对的保留程度。

4. 分数膨胀不是「错误」，而是一种系统性偏差。了解它的存在，就能更理性地解读分数。

## 八、一句话总结

> 用平等对待每个点的尺子去量数据分布，得到的分数总是偏高的；只有让密集区域「说话更大声」，评分才有分辨力。
