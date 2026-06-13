---
title: GraphSAGE 2017 — 给没见过的节点也能算嵌入
来源: Hamilton, Ying, Leskovec, "Inductive Representation Learning on Large Graphs", NeurIPS 2017
日期: 2026-06-01
子分类: graph-neural-networks
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

GraphSAGE（**SA**mple and aggre**G**at**E**）是一种**让图神经网络能在新节点上直接工作**的方法。日常类比：你换工作进了一家新公司，不用全公司重新选举一遍 CEO，只要你看几眼周围同事干啥、把信息合并起来，就大致知道自己是哪个团队的人。

技术上区分两个词：

- **转导式**（transductive）：训练时图就长成那样，加一个新节点必须把模型重训一遍。GCN、DeepWalk、node2vec 都是这种。
- **归纳式**（inductive）：训练的是"怎么聚合邻居"这条规则。新节点来了，规则照跑，不用回炉。GraphSAGE 是把图嵌入推到归纳式的代表作。

斯坦福 SNAP 实验室 Hamilton 等三位作者把它写进 NeurIPS 2017，第二年 Pinterest 直接拿这套思路做了 PinSage，跑在 30 亿节点 180 亿边的图上——这是 GNN 第一次在生产规模真正落地。

## 为什么重要

不理解 GraphSAGE，下面这些事都没法解释：

- 为什么工业界大图（社交、电商、推荐）几乎都用"采样聚合"范式，而不是 GCN 的整图卷积
- 为什么 PyTorch Geometric / DGL 的核心 API 就叫 `NeighborSampler` + `SAGEConv`
- 为什么"用户冷启动"在 GNN 里有解——只要新用户有特征，前向跑一遍就有嵌入
- 为什么 GraphRAG 谈"扩展到大语料"时也借了 GraphSAGE 的子图采样思想

GCN 给了思想，GraphSAGE 给了**工程上能跑的版本**。

## 核心要点

GraphSAGE 一层做三件事：**采样邻居 → 聚合邻居 → 拼自己 + 变换**。

1. **采样**：对节点 v，第 1 跳从邻居里采 S1 个，第 2 跳每个再采 S2 个（论文典型值 S1=25, S2=10）。固定数量是关键——否则度大的节点（大 V）会让计算量爆炸。

2. **聚合**：把采到的邻居特征合成一个向量。论文给了三种聚合器：
   - **MEAN**：直接取平均，最简单，效果已经不错
   - **LSTM**：把邻居当序列喂给 LSTM。但邻居本来无序，论文靠"训练时随机打乱顺序"近似置换不变性——这是工程妥协
   - **POOL**：每个邻居各过一个小 MLP，然后逐元素 max-pool

3. **拼接 + 变换**：把"自己上一层的特征"和"聚合后的邻居特征"拼起来，过一道线性 + 非线性。公式约等于：

   ```
   h_v^(k) = σ( W^(k) · CONCAT( h_v^(k-1), AGG_k({h_u^(k-1) : u ∈ N_sample(v)}) ) )
   ```

K 层堆起来，每个节点最终看到的是 K 跳内的子图信息。

## 实践案例

### 案例 1：归纳式到底好在哪——Reddit 数据集

Reddit 实验：23 万帖子（节点）、1100 万评论关系（边）、目标分类到 50 个 subreddit。

- **转导式做法**：训练时所有 23 万节点都得在图里。明天 Reddit 涨了 1 万新帖子，整个模型重训
- **GraphSAGE 做法**：训练时只用一部分节点（论文里训练集 / 测试集按时间切，测试集是后来才出现的帖子），测试时新帖子直接前向跑就有嵌入

效果：归纳式 F1 = 0.95+，比当时的转导式基线还高。

### 案例 2：PinSage——把 30 亿节点喂进 GNN

Pinterest 2018 的 PinSage 是 GraphSAGE 第一次在生产规模上证明可行：

- 节点：30 亿 Pin（图片）+ 板块
- 边：180 亿"Pin 出现在哪个板块"
- 关键工程：用 random walk 算邻居重要性（不是均匀采样），MapReduce 离线计算嵌入

PinSage 上线后 Pinterest 推荐 CTR 提升 30%。这之后所有大厂的图推荐架构基本都长成这样：**采样器 + 聚合器 + 训练框架**。

### 案例 3：用 PyTorch Geometric 30 行复现

```python
import torch
from torch_geometric.nn import SAGEConv
from torch_geometric.loader import NeighborLoader

class SAGE(torch.nn.Module):
    def __init__(self, in_dim, hidden, out_dim):
        super().__init__()
        self.conv1 = SAGEConv(in_dim, hidden, aggr='mean')
        self.conv2 = SAGEConv(hidden, out_dim, aggr='mean')

    def forward(self, x, edge_index):
        x = self.conv1(x, edge_index).relu()
        x = self.conv2(x, edge_index)
        return x

loader = NeighborLoader(data, num_neighbors=[25, 10], batch_size=1024)
```

`num_neighbors=[25, 10]` 就是论文的 S1=25, S2=10。`aggr='mean'` 切到 `'max'` 就是 POOL 聚合。

## 踩过的坑

1. **采样数 × 层数会指数爆**：K=2、S1=25、S2=10 已经是单节点 250 邻居。如果想堆到 K=3，S3=10 直接跳到 2500，显存撑不住。论文不建议堆超过 2 层。

2. **LSTM 聚合器违反置换不变性**：邻居本来是无序集合，LSTM 靠顺序读。论文靠"每次随机打乱"近似回置换不变，理论上不优雅但实测效果还行——这是要被 Graph Attention（GAT 2018）继续改进的地方。

3. **均匀采样不抗噪**：Twitter 里机器人粉丝、电商里刷单用户，均匀采样会让噪声等比例进来。后续 GraphSAINT、ClusterGCN、PinSage 都改成了重要性采样或子图聚合。

4. **归纳式不等于零样本**：新节点必须有特征（如用户的画像、商品的描述）。如果新节点完全无特征，GraphSAGE 没东西聚合，回退到冷启动问题。

## 适用 vs 不适用场景

**适用**：

- 大图（>10M 节点）、节点频繁新增的场景——社交、电商、推荐
- 节点本身有特征向量的图（用户画像、商品 embedding、文本 embedding）
- 需要在线推理新节点嵌入的场景

**不适用**：

- 小图、节点固定（<10 万节点）——直接用 GCN 整图卷积更简单
- 节点完全无特征、只有结构信息——回退到 DeepWalk / node2vec
- 需要捕获长距离依赖（K > 3 跳）——采样爆炸，考虑 Graph Transformer

## 历史小故事（可跳过）

- **2014–2016**：DeepWalk、node2vec、LINE 一系列"图嵌入"方法兴起，但都是转导式
- **2017 ICLR**：Kipf & Welling 发 GCN，图神经网络真正起飞，但仍是转导式
- **2017 NeurIPS**：Hamilton 等人发 GraphSAGE，把"训练聚合规则而非节点嵌入"立成范式
- **2018**：PinSage 论文证明这套能在 30 亿节点上跑——GNN 进入工业界
- **2019+**：PyTorch Geometric、DGL 把 GraphSAGE 做成默认 API

## 学到什么

1. **采样是大图的入场券**——整图算法在工业规模会被显存打死，固定数量采样是唯一可扩的工程选择
2. **训练规则、不训练参数**——归纳式的本质是把"每个节点的嵌入"换成"怎么算嵌入的函数"
3. **聚合器的选择是工程问题**：MEAN 简单够用、POOL 表达力强一点、LSTM 有理论问题但实测能跑
4. **学术到生产 1 年内打通**：2017 NeurIPS → 2018 PinSage 上线，这种速度在 GNN 之外少见

## 延伸阅读

- 论文 PDF：[Inductive Representation Learning on Large Graphs](https://arxiv.org/abs/1706.02216)
- 作者讲解视频：[William Hamilton — Graph Representation Learning](https://www.youtube.com/watch?v=YrhBZUtgG4E)
- 教程：[Stanford CS224W — Graph ML](http://web.stanford.edu/class/cs224w/)
- PinSage 工业案例：[Graph Convolutional Neural Networks for Web-Scale Recommender Systems, KDD 2018](https://arxiv.org/abs/1806.01973)

## 关联

- [[gcn-2017]] —— 转导式前辈，GraphSAGE 把它推广到归纳式
- [[graphrag]] —— LLM 时代的图检索，借用了子图采样思想
- [[pytorch]] —— GraphSAGE 的主要实现框架
- [[node2vec-2016]] —— 同期的转导式图嵌入对比
- [[deepwalk-2014]] —— 更早的图嵌入工作，为 GraphSAGE 的对比损失提供了 Skip-gram 思路
- [[adam-2014]] —— GraphSAGE 训练默认用的优化器

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[adam-2014]] —— Adam — 让深度学习自己挑步长的优化器
- [[gcn-2017]] —— GCN 2017 — 把卷积搬到图结构上的最简版本
- [[gin-2019]] —— GIN — 把图神经网络的表达力顶到理论天花板
- [[graphormer-2021]] —— Graphormer — 标准 Transformer 直接刷爆 GNN
- [[graphrag]] —— GraphRAG — 微软的知识图谱 + RAG
- [[pytorch]] —— PyTorch — 深度学习主流框架

