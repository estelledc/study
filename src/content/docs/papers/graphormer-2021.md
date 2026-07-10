---
title: Graphormer — 标准 Transformer 直接刷爆 GNN
来源: Ying et al., "Do Transformers Really Perform Bad for Graph Representation?", NeurIPS 2021
日期: 2026-06-01
分类: 机器学习
难度: 中级
---

## 是什么

Graphormer 是把**原汁原味的 Transformer 拿来跑图数据**，并且打爆当时所有专门为图设计的 GNN（图神经网络）的方法。

日常类比：以前大家都觉得"图问题得用图专用工具（GNN）"，就像觉得"做面条得用擀面杖"。Graphormer 团队来了一句："我用菜刀也能压出面条，而且更快"——只在普通 Transformer 上加了**三个小改动**，没动主架构。

那三个改动叫：

1. **Centrality Encoding**（中心性编码）：告诉模型"这个节点连了多少邻居"
2. **Spatial Encoding**（空间编码）：告诉模型"任意两个节点离得多远"
3. **Edge Encoding**（边编码）：告诉模型"两节点之间的边长什么样"

加完之后，标准 Transformer 在 OGB-LSC 量子化学比赛（KDD Cup 2021）拿了第一，并在 MolHIV / MolPCBA / ZINC 等主流图 benchmark 上超过当时一批强 GNN 基线。

## 为什么重要

在 Graphormer 之前的共识是：**Transformer 缺图归纳偏置**——它默认所有 token 平等连接（全连接 attention），不知道图里"谁是谁的邻居"。所以图领域几年都在卷 GCN / GAT / GIN / GraphSAGE 这些**消息传递架构**（每层只看 k 跳邻居）。

Graphormer 一篇文章把这个共识推翻：

- 不缺归纳偏置，**缺的是把图结构编码进 attention bias**
- 一旦编进去，Transformer 的全连接 + 可学习偏置 > GNN 的固定邻接 + 消息传递
- 这个 pattern 后来被 GraphGPS、TokenGT、GRIT 一路发扬，成了"Graph Transformer"流派

教科书说法：**Graphormer 是图领域 Transformer 化的转折点**。和 ViT 之于视觉、Whisper 之于语音是同一种里程碑。

## 核心要点

### 1. Centrality Encoding（节点的"社交地位"）

GNN 里"高度数节点"天然被强调（消息从更多邻居汇过来）。Transformer 里所有节点 token 一开始平等——没人告诉它"这个原子有 5 个键，那个只有 1 个"。

做法：把节点的**入度 + 出度**（无向图就是度数）查表得到一个向量，**加到节点 embedding 上**。

```
h_i = x_i + z_{deg-(i)} + z_{deg+(i)}
```

`x_i` 是原始节点特征，`z` 是可学习查表（每个度数对应一个向量）。

### 2. Spatial Encoding（节点的"地理距离"）

这是论文最关键的一招。标准 Transformer 的 attention 是：

```
A(i,j) = q_i · k_j / sqrt(d)
```

Graphormer 改成：

```
A(i,j) = q_i · k_j / sqrt(d) + b_{phi(i,j)}
```

`phi(i,j)` 是节点 i 到 j 的**最短路径长度**（不可达就 -1），`b` 是按距离查表得到的可学习标量。

效果：节点之间还是全连接 attention，但模型**知道"近邻"和"隔了 5 跳"应该不一样关注**。这一步把图拓扑塞进了 attention。

### 3. Edge Encoding（边特征也要进去）

分子图里边带类型（单键/双键/芳香键）。Graphormer 在 i→j 的最短路径上把所有边特征**加权平均**进 attention bias：

```
A(i,j) += (1/N_{ij}) * sum_{e in path(i,j)} (x_e^T w_n)
```

让 attention 同时看到"距离"和"路径上的边长啥样"。

## 实践案例

### 案例 1：分子性质预测（PCQM4M）

任务：给一个分子（图：原子=节点，化学键=边），预测它的 HOMO-LUMO 间隙（量子化学性质，关系到分子稳不稳定）。

数据规模：380 万分子，每个 30 节点左右。

之前强基线：GIN-virtual（GNN 加虚拟节点）验证集 MAE 约 0.1396。
Graphormer：验证集 MAE **0.1234**（OGB-LSC / KDD Cup 2021 量子化学赛道夺冠）。

赢的关键：分子图小（< 50 节点），全 attention O(N²) 没压力，spatial encoding 让模型一眼看到"远端官能团对中心碳的影响"，比层层消息传递快。

### 案例 2：OGB MolHIV（药物筛选）

预测分子能否抑制 HIV 病毒。Graphormer-FLAG 测试 ROC-AUC **80.51%**；同期较强 GNN 基线约 DGN 79.70%，GIN-VN fine-tune 约 77.8%——提升不大，但把公开榜单又往上推了一截。

### 案例 3：思考"为什么这能赢 GNN"

GNN 第 k 层只能聚合 k 跳邻居信息。要让相距 10 跳的节点交换信息，得堆 10 层——而堆 10 层 GNN 会 over-smoothing（所有节点表示坍缩到一致）。

Graphormer：第 1 层就是全连接 attention，10 跳节点直接对话，靠 spatial bias 区分远近。**没 over-smoothing**，因为 attention weight 由 query/key 决定，不会强行平均。

## 踩过的坑

1. **最短路径预处理 O(N³)**：每个图都要先跑 Floyd-Warshall。N=50 的分子图 OK，N=1000 的社交图就吃不消。后续 GraphGPS 用 random-walk encoding 替代来摆脱这个瓶颈。

2. **全 attention O(N²) 内存**：分子图小所以 OK，但放到知识图谱（百万节点）必死。Graphormer 没解决这个，论文也明说"我们针对中等规模图"。

3. **Centrality Encoding 是离散桶**：度数 100 和 101 共用还是分开桶，是手动设计的。带权图、异质图（多种节点类型）需要重新写编码。

4. **不可达节点的 phi = -1 是个魔数**：连通分量分裂的图（多个独立分子）会让 b_{-1} 这一项成为"我们彼此无关"的信号，论文没消融这部分敏感性。

## 适用 vs 不适用

**适用**：

- 中小规模图（节点数 < 几百），尤其是分子、蛋白结构、电路图
- 节点之间存在长距离依赖（GNN 堆深层会 over-smoothing 的场景）
- 已有大批 Transformer 工程经验，想直接复用 attention 优化（Flash Attention 等）

**不适用**：

- 超大图（百万节点的社交网络、知识图谱）—— 全 attention O(N²) 死掉
- 动态图（节点边持续增删）—— 最短路径每次都要重算
- 需要可解释邻接结构的场景（GNN 的"逐层消息"更直观）

## 历史小故事（可跳过）

2017 GAT（Graph Attention Network）已经把 attention 引入图，但还是**只在邻居上算 attention**——本质还是 GNN，只是"加权消息传递"。

2020 Graph-BERT 试过纯 Transformer，但效果一般，大家以为"图任务还是得 GNN"。

2021 年 5 月，微软亚研 + 大连理工等团队（Chengxuan Ying 等）放出 Graphormer，6 月 KDD Cup 2021 PCQM4M 赛道夺冠（380 万分子，量子化学公开赛第一次大模型刷榜），震动图机器学习圈。NeurIPS 2021 spotlight。

之后两年图 Transformer 几乎完全替代了纯 GNN 在 benchmark 榜单的位置。GraphGPS（2022）/ TokenGT（2022）/ GRIT（2023）都是 Graphormer 的衍生。

## 学到什么

1. **架构归纳偏置可以"加上去"，不一定要"内嵌"**——Transformer 的 attention bias 是个万能注入口
2. **全连接 + 可学习距离 > 固定邻接 + 消息传递**（在中小规模图上）
3. **跨领域迁移的核心问题不是改架构，而是找对的"如何注入领域知识"**——视觉是 patch + 位置编码，图是 centrality + spatial bias
4. **Over-smoothing 不是图任务的本质，是消息传递架构的副作用**

## 延伸阅读

- 论文 PDF：[arxiv 2106.05234](https://arxiv.org/abs/2106.05234)（22 页，附录有完整最短路径预处理代码）
- 官方实现：[microsoft/Graphormer](https://github.com/microsoft/Graphormer)（PyTorch）
- 后续 GraphGPS：[Rampášek et al. 2022](https://arxiv.org/abs/2205.12454)（把 Graphormer 抽象成"MPNN + Transformer"组合框架）
- OGB benchmark：[ogb.stanford.edu](https://ogb.stanford.edu/)（图机器学习公开榜单）

## 关联

- [[graphsage-2017]] —— GraphSAGE 是 Graphormer 之前 GNN 的代表，靠采样邻居训练大图
- [[transformer-xl-2019]] —— Transformer-XL 把相对位置编码引入序列，Graphormer 把它思路搬到图（spatial bias）
- [[fastertransformer-2021]] —— 推理优化框架，Graphormer 训练完直接套上加速

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[fastertransformer-2021]] —— FasterTransformer 2021 — NVIDIA 第一代开源 LLM 推理引擎
- [[graphsage-2017]] —— GraphSAGE 2017 — 给没见过的节点也能算嵌入
- [[transformer-xl-2019]] —— Transformer-XL — 让 Transformer 像 RNN 那样把上下文滚动传下去

