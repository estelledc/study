---
title: Fair GNN — 公平性感知图神经网络与去偏学习
来源: 'Alchihabi & Guo, "Unbiased GNN Learning via Fairness-Aware Subgraph Diffusion", arXiv:2501.00595, 2024'
日期: 2026-06-13
分类: 机器学习
子分类: 图神经网络
provenance: pipeline-v3
---

## 是什么

图神经网络（GNN）是处理图结构数据的深度学习模型——社交网络、推荐系统、知识图谱都用它。核心操作是消息传递（message passing）：每个节点收集邻居的信息，更新自己的表示。

日常类比：你参加一个聚会，通过和周围的人聊天来了解聚会的整体氛围。但如果你周围坐的都是同一类人（同性别、同年龄），你对聚会的判断就会有偏差。

Fair GNN 要解决的就是这个问题：GNN 的消息传递机制会**放大训练数据中已有的偏见**。比如在社交网络中，如果某个种族的人倾向于互相关注（同质性，homophily），GNN 会把这种结构偏见编码进节点表示，导致对不同群体的预测不公平——同样是合格申请人，少数族裔被推荐的概率远低于多数族裔。

FASD（Fairness-Aware Subgraph Diffusion）是 2024 年底提出的方法，首次把扩散模型（diffusion model）引入公平性图学习。核心思路：从原图采样子图，用随机微分方程（SDE）在前向扩散中注入噪声和对抗性偏见扰动，训练评分模型学习偏见模式，再通过逆向扩散去掉偏见，最后在去偏子图上训练标准 GNN。

## 为什么重要

不理解 Fair GNN，以下问题容易误判：

- 为什么推荐系统对某些用户群体"不推荐"——不是特征没学到，而是图结构本身就携带了社会偏见，GNN 在消息传递中把它放大了
- 为什么仅仅移除敏感属性（如性别、种族）不够——图结构（谁和谁连接）已经隐含了敏感信息，邻居的邻居会把偏见传回来
- 为什么同样精度的模型，对不同群体效果天差地别——统计对全体用户看的 accuracy 会掩盖群体间的巨大差异，必须用公平性指标单独度量
- 为什么 FASD 选扩散模型而不是对抗训练——对抗训练的判别器只能去掉已知偏见，扩散模型通过加噪-去噪学到的偏见分布更全面，能处理数据中自适应存在的复杂偏见模式

## 核心要点

1. **三种偏见来源**：GNN 中的不公平来自三个层面——(a) 同质性偏见（同敏感属性节点倾向互连，消息传递强化偏见），(b) 度/拓扑偏见（高度节点主导传播，若高度节点集中在某些群体则放大群体差异），(c) 消息传递自身放大（即使输入特征完全公平，聚合邻居后也可能增加群体差异）。类比：一个小道消息在熟人圈（同质性群体）里传几轮就变成"共识"，但可能完全是偏见。

2. **两种核心公平性指标**：Statistical Parity（统计平等）= 各群体获得正面预测的比例应该一致；Equal Opportunity（机会平等）= 在真正合格的个体中，各群体被正确识别的比例应该一致。前者只看结果分布，后者要求预测准确率在群体间一致。公式：ΔSP = |P(ŷ=1|s=0) − P(ŷ=1|s=1)|，ΔEO = |P(ŷ=1|y=1,s=0) − P(ŷ=1|y=1,s=1)|。

3. **三种去偏策略**：预处理（训练前修改图结构/特征，如 EDITS 删除同属性边）、训练中（对抗训练让编码器骗过敏感属性判别器，或加公平性正则化项到损失函数）、后处理（调整输出概率使满足公平约束）。FASD 属于预处理类，但用扩散模型生成去偏子图而非简单删边。

4. **FASD 四阶段流水线**：(1) 子图采样——BFS 策略从大图中采局部子图；(2) 公平性感知前向扩散——用 SDE 对子图注入高斯噪声 + 基于敏感属性预测器的对抗性偏见扰动：X_t = μ_t(X₀) + σ_t(X₀)·ε_X − γ_X·∇_X L_sen；(3) 训练两个 GNN 评分模型（一个对节点特征 s_{θ,t}，一个对邻接矩阵 s_{φ,t}）去预测加入的扰动；(4) 逆向扩散去偏——用训练好的评分模型对原子图去噪，得到去偏子图，在上面训练下游 GNN。

5. **SDE 扩散 vs 传统去偏**：传统方法（如 FairGNN 对抗训练、EDITS 删边）假设偏见形式已知（如同质性过高），针对性修正。FASD 让扩散模型自适应学习数据中偏见的具体分布，不需要假设偏见形式。类比：删边像请人把聚会里"看起来可疑"的人请走；扩散去偏像把整个聚会录音加各种噪声再降噪还原，从中识别出哪些是偏见信号、哪些是有用信息。

6. **实验结论**：在 NBA、Pokec-z、Pokec-n 三个基准上，FASD 在公平性指标上全面领先——Δ_DP 在 NBA 上低至 0.92%（第二好的 Graphair 为 2.56%），Δ_EQ 在 Pokec-n 上低至 0.91%。准确率仅比最高方法 GCA 低 1-3 个百分点，在公平性-准确率权衡上表现最优。

## 实践案例

### 案例 1：用 PyTorch Geometric 实现最简单的 Fair GNN（对抗训练）

```python
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import GCNConv

class FairGNN(nn.Module):
    """
    对抗训练的 Fair GNN：编码器学节点分类，对抗器从嵌入中猜敏感属性。
    编码器要同时做好分类 + 骗过对抗器。
    """
    def __init__(self, in_dim, hidden_dim, out_dim):
        super().__init__()
        self.conv1 = GCNConv(in_dim, hidden_dim)
        self.conv2 = GCNConv(hidden_dim, hidden_dim)

        # 分类头
        self.classifier = nn.Linear(hidden_dim, out_dim)

        # 对抗器：尝试从嵌入预测敏感属性
        self.adversary = nn.Sequential(
            nn.Linear(hidden_dim, 64),
            nn.ReLU(),
            nn.Linear(64, 1)  # 二分类敏感属性（如性别）
        )

    def forward(self, x, edge_index):
        h = F.relu(self.conv1(x, edge_index))
        h = self.conv2(h, edge_index)
        return h

    def classify(self, h):
        return self.classifier(h)

    def predict_sensitive(self, h):
        return torch.sigmoid(self.adversary(h)).squeeze()

# ---- 训练 ----
def train_fair_gnn(model, data, sensitive, epochs=200, lambda_fair=1.0):
    """
    交替训练：
    - 对抗器：学预测敏感属性
    - 编码器：做好分类 + 骗过对抗器（减去对抗损失）
    """
    optimizer_enc = torch.optim.Adam(
        list(model.conv1.parameters()) +
        list(model.conv2.parameters()) +
        list(model.classifier.parameters()),
        lr=0.01
    )
    optimizer_adv = torch.optim.Adam(model.adversary.parameters(), lr=0.01)

    for epoch in range(epochs):
        # 1. 训练对抗器
        h = model(data.x, data.edge_index)
        s_pred = model.predict_sensitive(h)
        adv_loss = F.binary_cross_entropy(s_pred, sensitive.float())

        optimizer_adv.zero_grad()
        adv_loss.backward()
        optimizer_adv.step()

        # 2. 训练编码器（分类 + 公平性）
        h = model(data.x, data.edge_index)
        logits = model.classify(h)
        task_loss = F.cross_entropy(
            logits[data.train_mask], data.y[data.train_mask]
        )
        # 编码器希望对抗器猜不准 → 减去对抗损失
        s_pred = model.predict_sensitive(h)
        fair_loss = -F.binary_cross_entropy(s_pred, sensitive.float())
        total_loss = task_loss + lambda_fair * fair_loss

        optimizer_enc.zero_grad()
        total_loss.backward()
        optimizer_enc.step()

        if epoch % 50 == 0:
            print(f"Epoch {epoch}: task={task_loss:.4f}, adv={adv_loss:.4f}")
```

### 案例 2：计算公平性指标（Statistical Parity 和 Equal Opportunity）

```python
import torch

def compute_fairness_metrics(y_pred, y_true, sensitive):
    """
    计算两种关键公平性指标。值越小越公平。

    y_pred: 预测标签 (0/1)
    y_true: 真实标签 (0/1)
    sensitive: 敏感属性 (0/1, 如性别)

    返回: (delta_sp, delta_eo)
    """
    # 统计平等 ΔSP = |P(ŷ=1|s=0) - P(ŷ=1|s=1)|
    # 各群体被预测为正的比例之差
    pred_rate_s0 = y_pred[sensitive == 0].float().mean()
    pred_rate_s1 = y_pred[sensitive == 1].float().mean()
    delta_sp = abs(pred_rate_s0 - pred_rate_s1).item()

    # 机会平等 ΔEO = |P(ŷ=1|y=1,s=0) - P(ŷ=1|y=1,s=1)|
    # 真正例中各群体的识别率（TPR）之差
    true_positive_s0 = y_true[sensitive == 0] == 1
    true_positive_s1 = y_true[sensitive == 1] == 1

    tpr_s0 = y_pred[sensitive == 0][true_positive_s0].float().mean() \
        if true_positive_s0.sum() > 0 else torch.tensor(0.0)
    tpr_s1 = y_pred[sensitive == 1][true_positive_s1].float().mean() \
        if true_positive_s1.sum() > 0 else torch.tensor(0.0)
    delta_eo = abs(tpr_s0 - tpr_s1).item()

    return delta_sp, delta_eo


# ---- 使用示例 ----
# 假设模型预测结果
y_pred = torch.tensor([1, 1, 0, 0, 1, 0, 1, 1])
y_true = torch.tensor([1, 0, 0, 1, 1, 0, 1, 0])
sensitive = torch.tensor([0, 0, 0, 0, 1, 1, 1, 1])  # 前 4 个是群体 A，后 4 个是群体 B

dsp, deo = compute_fairness_metrics(y_pred, y_true, sensitive)
print(f"Δ_SP (统计平等): {dsp:.4f}")  # 理想：接近 0
print(f"Δ_EO (机会平等): {deo:.4f}")  # 理想：接近 0

# 解读：
# Δ_SP = 0.5 表示群体 A 和 B 的预测正率差 50%——很不公平
# Δ_EO = 0.0 表示两个群体中真正合格的人被识别的概率一样——在这个维度公平
```

### 案例 3：预处理去偏——删除同属性边（EDITS 简化版）

```python
def edits_debias_edge(edge_index, sensitive, threshold=0.5):
    """
    EDITS 简化版：删除两端节点敏感属性相同的边。
    同质性（homophily）是 GNN 偏见放大的主因之一。
    保留跨群体边（heterophily）有助于传播公平信息。
    """
    src, dst = edge_index

    # 哪些边的两端同敏感属性
    same_group = sensitive[src] == sensitive[dst]

    # 依概率保留跨群体边；同群体边按阈值随机删除
    keep_mask = torch.ones(edge_index.shape[1], dtype=torch.bool)
    for i in range(edge_index.shape[1]):
        if same_group[i]:
            # 同属性边有 1-threshold 概率被删除
            if torch.rand(1).item() > threshold:
                keep_mask[i] = False

    fair_edge_index = edge_index[:, keep_mask]
    print(f"原边数: {edge_index.shape[1]}, 去偏后边数: {fair_edge_index.shape[1]}")
    return fair_edge_index
```

## 踩过的坑

1. **只移除敏感属性特征不够**：把性别、种族等列从特征矩阵删掉是直觉做法，但图的拓扑结构（谁连接谁）已经编码了这些信息。GNN 的消息传递会让邻居的邻居间接泄露敏感信息——即使你的特征里没有"性别"，你的朋友构成已经暴露了它。必须同时或单独在图结构层面去偏。

2. **公平性指标之间会冲突**：Statistical Parity 和 Equal Opportunity 的优化方向不同。SP 要求各组正预测率相等，但可能让模型把不合格的人也预测为正（拉高 FPR）来实现。EO 更关注真正合格的个体能否被正确识别。实际使用时要根据场景选择——招聘场景适合 EO（保证合格的人不被漏掉），广告投放可能更适合 SP（保证曝光机会均等）。

3. **去偏过度会损害准确率**：过于激进的去偏（比如删除太多边、对抗权重过大）会让模型损失有用信息。FASD 论文的实验表显示，GCA 准确率最高（NBA 70.43%）但公平性最差（Δ_DP 18.08%）；FASD 公平性最好（Δ_DP 0.92%）但准确率略低（69.22%）。这是一个经典的公平性-准确率权衡（fairness-accuracy trade-off），需要用具体业务场景来决定倾斜方向。

4. **FPR 捷径问题**：最近研究（FairGSE 2025）发现，如果只优化 Δ_SP 或 Δ_EO，模型可能取巧——把所有节点都预测为正，Δ_SP = 0 看起来完美公平，但实际上把所有不合格的人也推荐了（FPR 极高）。需要同时监控 False Positive Rate。

## 适用 vs 不适用场景

适用：
- 社交网络中的节点分类任务（如职业推荐），敏感属性（性别、种族）与图结构高度相关
- 推荐系统中需要保证不同用户群体获得公平曝光
- 信用评估、招聘筛选等涉及受保护群体（protected groups）的决策系统
- 知识图谱推理中需要避免对某些实体类型的系统性偏见

不适用：
- 图分类任务（整个图只有一个标签，不存在节点级敏感属性）
- 图中不存在已知敏感属性的场景（无监督公平性目前是开放问题）
- 对实时性要求极高的场景（扩散模型的采样过程计算量大，不如简单删边快）
- 数据量极小（扩散模型需要足够数据学习偏见分布，样本太少学不到有意义的模式）

## 历史小故事（可跳过）

公平性机器学习的研究可以追溯到 2010 年代初期。2012 年，一篇 ProPublica 的调查报道揭露了美国司法系统使用的 COMPAS 再犯预测算法对黑人被告存在系统性偏见——同样特征的黑人被预测为"高再犯风险"的概率远高于白人。这篇报道引发了学术界对算法公平性的大规模关注，催生了 Statistical Parity、Equal Opportunity 等关键指标的形式化。

在图学习领域，公平性问题出现得更晚。2019 年前后研究者才注意到 GNN 的消息传递机制会系统性放大图结构中的偏见。Rahman 等人在 2019 年首次提出"年龄和性别偏见通过社交网络的同质性在图嵌入中被放大"。此后，FairWalk（2019）通过修改随机游走策略做公平图嵌入，FairGNN（Dai & Wang, 2021）引入对抗训练，EDITS（2022）走预处理路线删边，Graphair（2023）用自动数据增强同时改图结构和特征。FASD（2024）首次把扩散模型引入这个领域，代表了从"手工设计去偏规则"到"让模型自适应学习偏见分布"的范式转变。

## 学到什么

1. GNN 的公平性问题不是"数据的锅"或"模型的锅"——是消息传递机制和图结构偏见共同作用的结果。理解这一点比背各种去偏技巧更重要。

2. 扩散模型不只用于图像生成（如 Stable Diffusion）。它在图去偏中的应用说明了一个通用原理：任何需要"去掉某种结构化噪声"的任务都可以考虑扩散模型——加噪模糊偏见，评分模型学习偏见模式，逆向去噪还原本质信息。

3. 没有万能的公平性指标。SP 关心结果分布，EO 关心真正合格的个体被公平对待。选错指标会让"看起来公平"的模型在实际中完全不可用。

4. 公平性研究的难点不在"定义什么是公平"（那是哲学/法律问题），而在"如何在保留有用信息的同时有效去偏"——这是工程/算法问题。FASD 的价值在于提供了一种数据自适应的去偏方案，不需要手动假设偏见的具体形式。

## 延伸阅读

- **FairGNN (Dai & Wang, WSDM 2021)**: "Say No to the Discrimination: Learning Fair Graph Neural Networks with Limited Sensitive Attribute Information" — 对抗训练路径的开创性工作，代码开源在 github.com/EnyanDai/FairGNN
- **EDITS (Dong et al., 2022)**: "EDITS: Modeling and Mitigating Data Bias for Graph Neural Networks" — 预处理去偏的代表作，通过删除同属性边和特征正交化来去偏
- **Fairness-Aware Graph Neural Networks: A Survey (Chen et al., TKDD 2024)**: 全面综述，覆盖预处理/训练中/后处理/混合四类方法，以及图级/邻域级/嵌入级/预测级四层公平性指标
- **Graphair (Ling et al., ICLR 2023)**: 自动数据增强去偏，同时修改图拓扑和节点特征，是 FASD 之前最强的预处理类 baseline

## 关联

- [[graph-neural-networks]]: GNN 基础知识，理解消息传递机制是学习 Fair GNN 的前提
- [[adversarial-training]]: 对抗训练在公平性中的应用，FairGNN 等方法的理论基础
- [[diffusion-models]]: 扩散模型原理，FASD 的核心技术支柱
- [[fairness-ml]]: 机器学习的公平性总览，Statistical Parity / Equal Opportunity 等指标的定义和适用场景

## 反向链接

<!-- 其他笔记中引用本文时，使用 [[fair-gnn]] -->
