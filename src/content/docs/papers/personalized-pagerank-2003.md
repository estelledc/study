---
title: Personalized PageRank — 给每个人一份属于自己的网页排名
来源: 'Jeh & Widom, "Scaling Personalized Web Search", WWW 2003'
日期: 2026-05-31
分类: 信息检索
难度: 中级
---

## 是什么

Personalized PageRank（**PPR**）是把 1998 年的 PageRank 算法**从『一份全网评分』变成『每人一份偏好评分』**的扩展。日常类比：原版 PageRank 像一份全国畅销书榜，所有人看到的排名一样；PPR 则像一个老朋友看了你常翻的书后，给你单独列的推荐——**起点不同，结果不同**。

数学上只改一处：原始公式

```
PR = (1 - c) · M · PR  +  c · v
```

里那个 `v`（teleport 向量），原版 PageRank 设成 `[1/N, 1/N, ...]` 均匀分布；PPR 让它**偏向你关心的几个页面**。但麻烦在于：N 亿用户就要算 N 亿份 PPR 向量，朴素做法死路一条。

Jeh & Widom 2003 这篇文章解决的就是 **怎么算得起**。

## 为什么重要

不理解 PPR，下面这些事都没法解释：

- 今天的推荐系统在用户-商品图上做召回，背后跑的常是带重启的随机游走（PPR / RWR）而不是原版 PageRank
- Pinterest Pixie 是明确的大规模 RWR/PPR 召回；Twitter Who-To-Follow 等则多用 circle-of-trust + SALSA 一类近亲随机游走
- 图神经网络（GNN：在邻居之间传消息的模型）里，APPNP（ICLR 2019）的核心传播算子就是 PPR 矩阵——某种意义上 2003 这篇为 2019 的图模型写好了数学
- 蛋白质相互作用网络里找疾病基因、知识图谱里做实体扩展，套路都是『从你关心的种子节点出发跑 PPR』

补充一句边界：Haveliwala 2002 的 Topic-Sensitive PageRank 已做『按主题偏置』；本文贡献是 hub 分解，让任意稀疏偏好在网页图上算得起。

## 核心要点

PPR 的工程难题有三层，每层 Jeh-Widom 给一个工具：

1. **线性定理**：如果用户 A 的偏好向量是 `0.5·v1 + 0.5·v2`，那么 A 的 PPR 结果就是 `0.5·PPR(v1) + 0.5·PPR(v2)`。**线性输入产生线性输出**。
   - 类比：调奶茶。先准备好『纯奶茶基底』和『纯果茶基底』，下单时按比例兑——不必为每个口味重新煮。

2. **Hub 分解**：选若干 hub 页面（比如全网 PageRank 最高的 1000 个），离线把每个 hub 的 PPR 向量算好。任何用户的偏好都可以拆成 `hub 部分 + 个性化修正`。
   - 类比：地铁线路图。先记主干道几个大换乘站之间怎么走，再加一段『从换乘站到你家』的小路即可。

3. **Hub Skeleton + 部分向量**：hub 之间互相影响那部分（skeleton）只存一份小表；每个 hub 到全网的影响（部分向量）做压缩共享。**存储再降一个量级**。

三步合起来：把『每用户一份 PPR』从不可能算的 `O(用户数 × 迭代次数 × 网页数)`，压到『预算 + 线性组合』。

## 实践案例

### 案例 1：从随机游走的角度看 PPR

随机游走视角下，PPR(v) 等价于：

- 从 v 指定的起点出发走链接
- 每一步以概率 c（约 0.15）**跳回 v 的起点**（不是跳到任意页面）
- 走到收敛时，每个页面被访问的概率分布就是 PPR(v)

差别就在『跳回去的地方』：原版 PageRank 跳回均匀随机一个页面，PPR 跳回**你的起点集合**。一个小改动，就让结果『以你为中心』。

### 案例 2：推荐系统怎么用 PPR

把『用户 — 商品』关系画成一张二部图：

```
用户 A —— 商品 X
        \— 商品 Y
用户 B —— 商品 Y
        \— 商品 Z
```

- 给用户 A 推荐时，把起点向量设成 `[A=1, 其他=0]`
- 跑 PPR 收敛
- 商品节点上得到的概率分布 = A 的个性化召回打分

线性定理在这里救命：当 A 同时喜欢两个种子（比如已购商品 X 和搜索词 Q），系统不必重跑——预先算好 X 和 Q 的 PPR，按权重相加即可。

### 案例 3：GNN 里的 PPR 影子

先把 GNN 想成『每个节点听邻居说话』的传话模型；传太多层，大家声音会糊成一片（over-smoothing，过平滑）。APPNP 不堆很多层卷积，而是用一次 PPR 式传播把起点特征散开：

```
H = (1 - α) · A_hat · H  +  α · X
```

对照 PPR：

```
PR = (1 - c) · M · PR  +  c · v
```

**结构一模一样**（`X`/`v` 是重启回到的『起点』，`α`/`c` 是跳回概率）。参数更少、深度可控、更不容易过平滑——这是 PPR 数学在 2019 年的回响。

## 踩过的坑

1. **不是『每个用户重训一份 PageRank』**：线性性是核心，没有它整个系统跑不起来。新手第一反应常常是『我给每个人迭代一遍』，立刻被 N 个用户压垮。

2. **teleport 集合不必是单点**：可以是用户感兴趣的若干主题节点的分布。把它当『偏好向量』而不是『单一起点』来想，才能用上线性。

3. **Hub 选择是启发式**：作者按全局 PageRank 排序选 hub，并不保证对每个用户都最优。后续 Bahmani 2010 等工作研究了动态 hub 选取。

4. **千亿边大图依然吃力**：部分向量虽压缩，存储仍随图规模线性增长。Pinterest Pixie 的做法是放弃精确 PPR，改用蒙特卡洛采样 + 在线 random walk，权衡精度换可扩展。

5. **动态图下离线预算会过期**：边一直在增加（社交网络每秒新关注），离线 hub 向量隔几小时就需要更新，这就需要增量 PPR 算法。

## 适用 vs 不适用场景

**适用**：

- 节点数百万到十亿级、每个用户偏好向量稀疏的图
- 推荐系统召回（用户-商品图、社交图、知识图谱）
- GNN 传播层替代多层卷积（APPNP / PPRGo）
- 找『从种子节点出发的局部重要性』而非全局重要性

**不适用**：

- 极小图（节点数 < 1000）—— 直接幂迭代更简单
- 节点对之间的相似度计算 —— 用 SimRank（Jeh-Widom 同组前作）更对口
- 高度动态的图 —— 需配合增量算法
- 节点数千亿、边数万亿 —— 改用 Pixie 那种采样近似

## 历史小故事

- **1998**：Page 和 Brin 在 Stanford 写下 PageRank，论文脚注一句『teleport 向量可以非均匀』为 PPR 埋下伏笔。
- **2002**：Glen Jeh 和导师 Jennifer Widom 在 KDD 发表 SimRank（基于随机游走的节点相似度）。
- **2002**：Haveliwala 提出 Topic-Sensitive PageRank（按主题预计算偏置向量）；个性化有了，但还不是任意用户偏好的可扩展分解。
- **2003**：Jeh & Widom 写出本文，用 hub / skeleton / partial vectors 系统解决『任意稀疏偏好的 PPR 怎么算得起』。Glen Jeh 当时是 Widom 的博士生。
- **2013–2017**：Twitter WTF、Pinterest Pixie 等工业系统在十亿级图上落地随机游走召回（Pixie 明确是 RWR/PPR；WTF 更偏 SALSA 近亲），扩展了这篇分解思路的工程边界。
- **2019**：Klicpera 等人提出 APPNP，把 PPR 矩阵直接做成 GNN 传播算子——一篇 2003 信息检索论文，重新点亮深度学习时代。

## 学到什么

1. **线性算子的威力**：一个抽象数学性质（重启分布的线性），让一个看似不可能的工程问题（N 亿用户 × M 网页）变成『预算 + 线性组合』。
2. **稀疏结构是工程救星**：PPR 之所以可分解可压缩，根本在于用户偏好向量稀疏、hub 集中度高——把数据本身的结构压榨到底。
3. **学术和工业的代际接力**：2003 的图算法在 2019 长成 GNN 的脊梁。理论好不好用，往往要等 15 年才看得清。
4. **同一种数学多次复用**：PPR、Random Walk with Restart、APPNP 传播层、SimRank——本质都是『带重启的随机游走 + 线性算子』，换个壳就是新论文。

## 延伸阅读

- 论文 PDF：[Jeh & Widom 2003 — Scaling Personalized Web Search](http://ilpubs.stanford.edu:8090/596/)（10 页，建议先读 Section 2-3）
- 入门读物：[Personalized PageRank — Wikipedia](https://en.wikipedia.org/wiki/PageRank#Personalized_PageRank)（先建立直觉，再回论文 Section 2-3）
- 工业落地：[Pinterest Pixie — Random Walk on a Real-Time Graph (2017)](https://medium.com/pinterest-engineering/an-update-on-pixie-pinterests-recommendation-system-6f273f737e1b)
- GNN 桥梁：[APPNP — Predict then Propagate (Klicpera et al., ICLR 2019)](https://arxiv.org/abs/1810.05997)
- 增量 PPR：[Bahmani, Chowdhury, Goel — Fast Incremental and Personalized PageRank (2010)](https://arxiv.org/abs/1006.2880)

## 关联

- [[pagerank-1998]] —— 原版 PageRank，PPR 的直系前作
- [[graphrag]] —— 图上做检索，思想同源
- [[chaitin-graph-coloring]] —— 同样靠图结构求解的工程问题

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[lambdarank-2006]] —— LambdaRank — 跳过定义损失函数，直接把梯度写出来
- [[ranknet-2005]] —— RankNet — 让搜索引擎学会比较两个结果谁更好
- [[slim-2011]] —— SLIM — 让数据自己学一张稀疏的"看了又看"权重表
