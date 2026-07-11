---
title: PageRank — 用随机游走给整个网络的页面打分
来源: 'Page, Brin, Motwani, Winograd, "The PageRank Citation Ranking: Bringing Order to the Web", Stanford Tech Report, 1998'
日期: 2026-05-31
分类: 信息检索
难度: 入门
---

## 是什么

PageRank 是一套**给网页打重要性分**的算法。日常类比：想象一个无聊的人在网上点链接玩——随机打开一个页面，再随机点一条链接走，又点一条……这样无限走下去。他在某个页面停留的概率，就是这个页面的"重要性"。

核心一句话：**一个页面有多重要，取决于有多少重要的页面指向它**（递归定义）。

1998 年 Stanford 两个博士生 Larry Page 和 Sergey Brin（合写还有 Motwani、Winograd）发表了这篇约 17 页的技术报告。同年他们成立了 Google。

## 为什么重要

不理解 PageRank，下面这些事都没法解释：

- 1998 年之前，搜索引擎（AltaVista / Yahoo / Lycos）都靠**关键词出现次数**排序，被刷词的垃圾页面灌满；PageRank 把"被多少人引用"变成排序信号，搜索质量明显提升
- 今天推荐系统的"图冷启动"（用户-商品二部图打分）用的是 PageRank 的变种 Personalized PageRank
- 学术论文的影响因子、Eigenfactor、社交网络大 V 排名、生物蛋白网络的关键节点……都是 PageRank 思想的搬运
- GNN（图神经网络）里"节点表示 = 邻居表示加权和"的递归式，与 PageRank 同源
- Google 早期搜索质量跃升的核心信号之一，就是这篇报告里的链接权威度思想

## 核心要点

PageRank 公式（简化版）：

```
PR(A) = (1 - d) + d × Σ ( PR(Ti) / C(Ti) )
```

读法：**A 的分数 = 一个底分 + 所有指向 A 的页面 Ti 把自己的分数平分给出链后传给 A 的总和**。

- `d` 叫**阻尼因子**（damping factor），通常取 0.85
- `C(Ti)` 是 Ti 的出链数——Ti 的票分给它的所有出链，每条出链分到 `PR(Ti) / C(Ti)`
- `1 - d` 是"随机跳走"的部分（下面解释为什么需要）

三个关键概念：

1. **随机游走 Random Surfer**：把整个 Web 想成一张图，节点是页面，边是超链接。一个虚拟用户随机点链接走，他在每个页面的稳态访问概率就是 PageRank 分数。

2. **阻尼因子 d**：现实里没人会一直点链接——会累、会换标签页打开新页面。`d = 0.85` 意思是 85% 的概率点链接，15% 的概率随机跳到任意一个新页面。这一项有两个作用：避免卡死链页面（dangling node），避免小圈子互链刷分（spider trap）。

3. **Power Iteration**：从均匀分数开始（每页 `1/N`），反复套公式迭代，约 50-100 次后分数稳定下来——这是数学上的不动点。整个迭代只是矩阵-向量乘，1998 年的硬件就能跑。

## 实践案例

### 案例 1：4 个页面手算一轮

四个页面 A、B、C、D，链接：A→B/C，B→C，C→A，D→C。设 `d=0.85`，初始每页 `0.25`（论文简化公式，底分是 `1-d=0.15`）：

```
PR(A) = 0.15 + 0.85 × (PR(C)/1)                         ≈ 0.36
PR(B) = 0.15 + 0.85 × (PR(A)/2)                         ≈ 0.26
PR(C) = 0.15 + 0.85 × (PR(A)/2 + PR(B)/1 + PR(D)/1)     ≈ 0.69
PR(D) = 0.15 + 0.85 × (0)                               = 0.15
```

读法：C 被三人指向所以最高；D 无人指向，只剩底分。再迭代几十次会收敛到稳定排序。

### 案例 2：同一张图的可运行 Python

列 `j` 表示"从 j 出发"，行 `i` 表示"到达 i"。按案例 1：A 出链 2 条各 0.5，B/C/D 各 1 条：

```python
import numpy as np
# 顺序 [A, B, C, D]；M[i,j] = j 分给 i 的出链份额
M = np.array([
    [0,   0, 1, 0],    # →A：只有 C
    [0.5, 0, 0, 0],    # →B：A 的一半
    [0.5, 1, 0, 1],    # →C：A 一半 + B + D
    [0,   0, 0, 0],    # →D：无人指向
], dtype=float)
N, d, r = 4, 0.85, np.ones(4) / 4
for _ in range(50):
    r = (1 - d) / N + d * (M @ r)
print(r)  # C 最高，D 最低
```

正文公式是原报告的 `(1-d)+dΣ`；这里用归一化版 `(1-d)/N + d·Mr`（总和为 1）。两者差常数倍，NetworkX 等现代库都用后者。

### 案例 3：为什么阻尼因子救命

两个页面 X、Y 互指、无人外链。若 `d=1`：分数只在两人之间倒腾，像封闭小圈子把全图分吸干。加上 `1-d` 后每步漏 15% 随机跳走，小圈子吸不走全部质量，全图才收敛到稳定分布——这就是阻尼的工程意义。

## 踩过的坑

1. **Dangling Node 死链页面**：PDF、图片页面没有出链，迭代时它的分数无法传出，整张图的总分会逐渐泄漏。解决：把死链页面假装成"指向所有页面"，分数均分给所有节点。

2. **Spider Trap 爬虫陷阱**：一群页面只在内部互链，不指向外部——会把分数吸进去出不来。阻尼因子的随机跳就是为这个设计的。

3. **Link Farm 攻击**：买几千个低分页面，全都指向你想推的目标页。早期 PageRank 顶不住，Google 后来加了 TrustRank（从可信种子传播信任分）和 Penguin Update（识别人造链接图谱）。

4. **个性化向量被忽略**：原始公式里"随机跳"是均匀跳到任意页面。改成偏向某些页面（比如用户书签）就成了 Personalized PageRank——今天推荐系统用的就是这个变种。

5. **大图收敛慢**：万亿级 Web 不能用单机矩阵运算。MapReduce / Pregel / GraphX 都是为大规模 PageRank 设计的分布式系统的祖先。

## 适用 vs 不适用场景

**适用**：

- 给一张有向图的节点打"重要性"分（社交网络大 V、学术论文影响力、网页权威度）
- 推荐系统冷启动（用 Personalized PageRank 在用户-物品图上传播）
- 反欺诈 / 反 spam（Reverse PageRank 找 hub 节点）

**不适用**：

- 节点本身有丰富特征需要利用 → 用 GNN（PageRank 只看图结构，看不到节点内容）
- 关心"两点之间相似度"而非"全局重要性" → 用 SimRank
- 现代搜索的最终排序：PageRank 只是其中一个特征，BM25 + 神经检索 + LTR（Learning to Rank）一起决定结果

## 历史小故事（可跳过）

- **1998 年初**：Page 和 Brin 在 Stanford 写论文，引用了**学术引文分析**——一篇论文被引用次数越多越重要。他们意识到这个思想可以搬到 Web 上。
- **1998 年 9 月**：Google 公司在朋友车库成立。PageRank 是核心算法，但当时论文还没被同行评议。
- **2001 年**：Google 申请专利 US6285999，归 Stanford 所有，Google 独家授权。Stanford 拿这个专利赚了 3.36 亿美元。
- **2005 年后**：SEO 行业开始系统性攻击 PageRank（link farm、private blog network），Google 持续打补丁。
- **2024 年**：纯 PageRank 在搜索排序里只是 200 多个特征之一，但"权威信号"这一层仍由 PageRank 思想支撑。

## 学到什么

1. **递归定义的力量**：A 的分数依赖 B 的分数，B 的分数依赖 A 的分数——看似死循环，但用迭代到不动点（Power Iteration）就能解。这个思想在 GNN、Word2Vec、HITS 都能见到。
2. **结构信号 > 内容信号**：1998 年之前大家拼命提炼"页面内容特征"，PageRank 提醒：**外部如何对待这个节点**也是关键信号，而且更难造假。
3. **数学保证收敛**：阻尼因子让转移矩阵满足强连通+非周期，Perron-Frobenius 定理保证有唯一稳态——理论支撑落地。
4. **短报告撬动大产业**：十几页技术报告 + 可落地工程 + 恰当时机，是理论变产品的经典样本。

## 延伸阅读

- 论文 PDF：[The PageRank Citation Ranking](http://ilpubs.stanford.edu:8090/422/)（Stanford InfoLab 原报告）
- 视频：[3Blue1Brown — But what is a Markov chain?](https://www.youtube.com/watch?v=i3AkTO9HLXo)（PageRank 的数学基础是马尔可夫链）
- 自己实现：[NetworkX pagerank 文档](https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.link_analysis.pagerank_alg.pagerank.html)
- 进阶：Haveliwala 2002 的 [Topic-Sensitive PageRank](https://nlp.stanford.edu/projects/topic-sensitive-pagerank.shtml)
- [[hits-kleinberg]] —— 同期的 HITS 算法，把节点拆 Hub/Authority

## 关联

- [[hits-kleinberg]] —— Kleinberg 同年提出的对手算法，HITS 拆 Hub 和 Authority
- [[mapreduce]] —— Google 后来发明的分布式计算框架，最初目的就是大规模跑 PageRank
- [[bigtable]] —— Google 存 Web 索引的数据库，PageRank 分数也存在里面
- [[gfs]] —— Google File System，Web 爬虫数据的底层存储
- [[graph-neural-networks]] —— GNN 的"邻居聚合"思想与 PageRank 同源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[anh-moffat-2005]] —— Anh-Moffat 2005 — 让倒排表压到接近熵下限还能 SIMD 解码
- [[gbrank-2007]] —— GBRank — 把决策树堆起来学排序，一棵树纠正一处错排
- [[gfs]] —— GFS — 编译器决定不做哪些事
- [[google-1998]] —— Google 1998 — 把整个网络爬下来、压扁、再用一秒查到
- [[hits-1999]] —— HITS — 给网页同时打两个分：权威页 + 索引页
- [[lambdarank-2006]] —— LambdaRank — 跳过定义损失函数，直接把梯度写出来
- [[mapreduce]] —— MapReduce — 用户只写两个函数，框架替你扛千节点
- [[personalized-pagerank-2003]] —— Personalized PageRank — 给每个人一份属于自己的网页排名
- [[ranknet-2005]] —— RankNet — 让搜索引擎学会比较两个结果谁更好
- [[simrank-2002]] —— SimRank — 两个节点相似当且仅当它们的邻居相似
- [[slim-2011]] —— SLIM — 让数据自己学一张稀疏的"看了又看"权重表
- [[trustrank-2004]] —— TrustRank — 用一小撮可信种子把整张 Web 的信誉算出来

