---
title: TrustRank — 用一小撮可信种子把整张 Web 的信誉算出来
来源: 'Gyöngyi, Garcia-Molina, Pedersen, "Combating Web Spam with TrustRank", VLDB 2004'
日期: 2026-05-31
分类: 信息检索
难度: 入门
---

## 是什么

TrustRank 是一套**用极少量人工标注 + 图上传播**给整张 Web 打信誉分的算法。日常类比：你刚搬到陌生城市谁都不认识，但有人告诉你 5 个老居民是公认靠谱的——你跟他们打交道，再通过他们认识别人，慢慢一圈圈把"靠谱程度"扩散出去。陌生人离这 5 个种子越远（中间过越多人），信任就越淡。

核心一句话：**信任从可信种子顺着链接往外传，每传一跳衰减一点；信任分低的页面大概率是 spam**。

2004 年 Stanford 的 Gyöngyi、Garcia-Molina 和 Yahoo 的 Pedersen 在 VLDB 提出，专治 2003-2004 年大爆发的 link farm（链接农场）攻击。

## 为什么重要

不理解 TrustRank，下面这些事都没法解释：

- 为什么 Google 在 2005 年之后能扛住 SEO 行业每年砸数百亿美元的刷分攻击——TrustRank 是骨架
- 为什么 GNN 的半监督节点分类（Kipf-Welling 2017）几行代码就能跑——它和 TrustRank 数学骨架同构
- 为什么微博反水军、邮件反垃圾、广告反作弊都用同一套"信任种子 + 图传播"——这套范式从 TrustRank 立住
- 为什么蚂蚁芝麻信用、区块链 PoS 验证人加权、推荐系统冷启动可以"一小撮人决定一大群人"——同一思想搬运

## 核心要点

TrustRank 公式（和 PageRank 几乎一样）：

```
t = α · M · t + (1 - α) · d
```

读法：**新一轮信任分 = 邻居传过来的信任（衰减 α）+ 种子向量给的底分（剩下 1-α）**。

- `t`：每个页面的信任分向量
- `M`：归一化的链接转移矩阵（和 PageRank 同一个 M）
- `d`：种子指示向量——可信种子位置写 `1/|S|`，其余写 0
- `α`：信任衰减系数，论文取 0.85

跟 PageRank 的差异**只有一处**：PageRank 的 d 是均匀向量（每页都一样），TrustRank 的 d 只在可信种子上非零。这一处差异让算法行为完全变了——民主投票变成推荐人制。

三个关键操作：

1. **挑种子（SelectSeed）**：用 inverse PageRank（把图反向跑一遍 PageRank）选出 L 个最能传到远处的 hub 页面。直觉：这些页面出链多、能影响最大子图。

2. **请人工 oracle**：人挨个看这 L 个种子，剔除 spam，留下 good 的作为可信种子集合 S。这一步贵——但只看几百个，不是几十亿。

3. **传播 + 收敛**：把 d 喂进 power iteration，迭代约 20 轮收敛。信任分高的页面 = 可信，低的 = spam 候选。

## 实践案例

### 案例 1：4 个页面演示信任如何衰减

设可信种子 = {A}，页面 A → B → C → D，α = 0.85，初始 d = [1, 0, 0, 0]。

迭代几轮后大致：

```
PR(A) = 0.15 + 0.85 × 1 = 1.0  (种子自己一直得到 1-α 的兜底)
PR(B) = 0.85 × 1.0 = 0.85
PR(C) = 0.85 × 0.85 = 0.72
PR(D) = 0.85 × 0.72 = 0.61
```

每跳衰减 0.85——离种子 4 跳，信任只剩 60%。这就是**信任随距离衰减**的核心。

### 案例 2：原论文的 AltaVista 实验

- 数据：2003 年 31 亿页面 Web crawl
- 选种子：从 PageRank top 1000 hosts 选 1250 个候选，人工评 178 个 good seeds
- 结果：PageRank top buckets 里 spam 比例约 13.5%，TrustRank top buckets 降到约 0%
- 意义：178 个种子 + 20 轮迭代，覆盖 31 亿页面的 95% 信任评估

### 案例 3：Python 伪代码

```python
import numpy as np

# 跟 PageRank 几乎一样，唯一区别是 d 不再均匀
M = build_transition_matrix(links)
N = M.shape[0]

# 种子指示向量（人工标的可信页面）
d = np.zeros(N)
seed_indices = oracle_select_good_seeds()  # 返回 178 个 index
d[seed_indices] = 1.0 / len(seed_indices)

t = d.copy()
alpha = 0.85
for _ in range(20):
    t = alpha * (M @ t) + (1 - alpha) * d

# t 低的页面 → spam 候选
spam_candidates = np.where(t < threshold)[0]
```

## 踩过的坑

1. **种子选择偏差**：如果种子全是科技博客，其他领域（厨艺站、地方新闻）信任分会偏低。论文用 inverse PageRank 选 hub 部分缓解，但完全消除不了。

2. **Oracle 单点故障**：人工评估时漏判一个 spam 当种子，整张子图都被污染。论文建议人工双盲、加冗余。

3. **敌方知道种子后精准伪装**：spammer 买几个高分页面 → 让可信种子链接到自己 → 一跳之后信任分很高。这叫 "Trust-aware spam"，2006 年 Krishnan 提出 Anti-TrustRank（反向：从 spam 种子传播 distrust）作为补丁。

4. **dangling page 漏分**：PDF / 图片没有出链，信任传不出去。需要和 PageRank 一样的 dangling 修补——把死链页面假装成"指向所有种子"。

5. **α 的选择没有理论最优**：论文取 0.85 沿袭 PageRank，但实验证明 0.7-0.9 区间结果差异显著，需要在自家数据上调。

## 适用 vs 不适用场景

**适用**：

- 反 spam / 反作弊：信誉从可信节点传播（搜索、推荐、广告反作弊）
- 半监督节点分类：图上有少量标注，剩下靠传播
- 信用评分冷启动：从已知靠谱用户传播到新用户
- 区块链 PoS / 联邦学习：可信节点加权聚合

**不适用**：

- 节点本身有丰富特征 → 用 GNN（TrustRank 只看图结构）
- 完全无监督场景 → TrustRank 必须有种子；纯无监督用 spectral clustering / community detection
- 关心"两点间相似度"而非"相对种子的可信度" → SimRank / Personalized PageRank
- 现代搜索的最终排序：TrustRank 只是几百个特征之一

## 历史小故事（可跳过）

- **2003-2004 年**：link farm 工具产业化，单个 spammer 一天能造几万互链页面。Google 搜"buy viagra"前 10 条全是垃圾站。
- **2004 年 VLDB**：Gyöngyi 在 Garcia-Molina（Stanford 数据库泰斗）指导下做这个题；Pedersen 是 Yahoo 搜索负责人，提供 AltaVista 31 亿页面数据。
- **2005 年后**：Google 内部反 spam 系统据说大量借鉴 TrustRank 思想，但具体算法保密；Penguin Update（2012）公开承认用了 link 信誉信号。
- **2017 年**：Kipf-Welling GCN 论文里"半监督节点分类"的 baseline 一栏赫然写着 LP（Label Propagation）和 PageRank-style 方法——TrustRank 思想以 GNN 形式重生。

## 学到什么

1. **同一公式 + 不同初始向量 = 完全不同算法**：PageRank 和 TrustRank 数学几乎一样，但 d 从均匀变成种子指示，行为完全变。这告诉我们算法设计里"参数化的灵活性"很重要。
2. **半监督的力量**：人工只看几百个，剩下几十亿靠图结构推——这是 2004 年的"少标注大模型"原型。
3. **信任 vs 投票**：PageRank 把链接当投票，TrustRank 把链接当信任传递。看起来一样的数学，假设变了之后抗攻击能力天差地别。
4. **理论 → 工程 → 攻防迭代**：TrustRank 出来 → spammer 用 Trust-aware spam → Anti-TrustRank → 又被绕过……这是反作弊领域永恒的猫鼠游戏。

## 延伸阅读

- 论文 PDF：[Combating Web Spam with TrustRank](https://www.vldb.org/conf/2004/RS15P3.PDF)（VLDB 2004，12 页）
- 反向版：Krishnan & Raj 2006 Anti-TrustRank — 从 spam 种子传 distrust
- 综述：Castillo & Davison 2010 [Adversarial Web Search](https://chato.cl/papers/castillo_davison_2010_adversarial_web_search.pdf)
- [[pagerank-1998]] —— 直接前身，TrustRank 复用 power iteration 框架
- [[hits-1999]] —— 同期对手，Hub/Authority 拆分思想

## 关联

- [[pagerank-1998]] —— 数学骨架同源，差异只在 d 向量
- [[hits-1999]] —— Kleinberg HITS，同期 Web 图算法
- [[mapreduce]] —— 大规模跑 TrustRank 的分布式底座
- [[bigtable]] —— 存 Web 图和信任分的存储

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bigtable]] —— Bigtable — Google 把行级随机读写做到 PB 级的存储
- [[hits-1999]] —— HITS — 给网页同时打两个分：权威页 + 索引页
- [[mapreduce]] —— MapReduce — 用户只写两个函数，框架替你扛千节点
- [[pagerank-1998]] —— PageRank — 用随机游走给整个网络的页面打分

