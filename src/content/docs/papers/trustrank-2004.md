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

- 为什么 2005 年后主流搜索引擎能更好扛住 SEO 刷分——TrustRank 这类"种子信誉"是公开文献里的关键骨架之一
- 为什么 GNN 半监督节点分类（Kipf-Welling 2017）几行就能跑——和"少量标注 + 图传播"是同一族思想
- 为什么微博反水军、邮件反垃圾、广告反作弊都爱用"信任种子 + 图传播"——这套范式从 TrustRank 立住
- 为什么信用评分冷启动、推荐冷启动可以"一小撮已知靠谱用户带动一大群新人"——同一思想搬运

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

跟 PageRank 的差异**只有一处**：PageRank 的 d 是均匀向量；TrustRank 的 d 只在可信种子上非零——民主投票变成推荐人制。

三个关键操作：

1. **挑种子（SelectSeed）**：用 inverse PageRank（把图反向跑一遍）选出最能传到远处的 hub。类比：先找"认识人最多的介绍人"。
2. **请人工 oracle**：人只评几百个候选，剔除 spam，留下 good 集合 S。贵，但远比标几十亿便宜。
3. **传播 + 收敛**：把 d 喂进 power iteration，约 20 轮；分高≈可信，分低≈ spam 候选。

## 实践案例

### 案例 1：三页小图看信任怎么衰减

页面 A→B→C，C→B；种子 = {A}，α = 0.85，d = [1, 0, 0]。

**逐步迭代**（只看前两轮，数字约到两位）：

1. 第 0 轮：t = d → A=1.00，B=0，C=0
2. 第 1 轮：A 把信任全给 B；再加种子兜底 (1-α)·d → A≈0.15，B≈0.85，C≈0
3. 第 2 轮：B 把信任传给 C → A≈0.15，B≈0.13，C≈0.72

离种子越远，信任越淡；种子自己每轮都靠 (1-α) 补血。这就是**信任随距离衰减**。

### 案例 2：原论文 AltaVista 实验（按论文口径）

1. **建图**：AltaVista 2003-08 抓取的数十亿页面，聚成约 **3100 万 site**（按主机名归并）再算
2. **选种子**：inverse PageRank 筛候选 → 人工评约 1250 个 → 留下 **178** 个 good seeds
3. **传播**：α=0.85，迭代约 20 轮
4. **对比**：PageRank 高分桶里 spam 仍可见；TrustRank 高分桶 spam 比例明显更低

意义：百级人工标注 + 图传播，就能给千万级站点排信誉。

### 案例 3：Python 伪代码

```python
import numpy as np

M = build_transition_matrix(links)  # 列归一；dangling 列回流到种子
N = M.shape[0]
d = np.zeros(N)
seeds = oracle_select_good_seeds()  # 如论文的 178 个
d[seeds] = 1.0 / len(seeds)

t = d.copy()
for _ in range(20):
    t = 0.85 * (M @ t) + 0.15 * d

spam = np.where(t < t.mean() * 0.1)[0]  # 阈值按分布定，非魔法常数
```

**逐部分解释**：`d` 必须归一化成概率；`0.85` 是衰减、`0.15` 是种子补血；阈值用分位数/均值倍数，别写死。

## 踩过的坑

1. **种子选择偏差**：种子全是科技站，厨艺/地方新闻会系统性偏低——inverse PageRank 只能部分缓解。
2. **Oracle 单点故障**：漏判一个 spam 当种子，整片子图被污染——要双人复核。
3. **Trust-aware spam**：买高分页外链，一跳就骗到信任——2006 Anti-TrustRank（从 spam 种子传 distrust）是补丁。
4. **dangling 漏分**：无出链页要把死链回流到种子，否则信任蒸发。
5. **α 无理论最优**：0.85 沿袭 PageRank；0.7–0.9 结果差一截，要在自家图上调。

## 适用 vs 不适用场景

**适用**：

- 反 spam / 反作弊：有百级可信种子、图规模到千万边仍可迭代 ~20 轮
- 半监督节点分类：少量标注 + 只靠结构传播
- 信用/推荐冷启动：从已知靠谱用户扩到新人

**不适用**：

- 节点有丰富内容特征 → 用 GNN，别只用 TrustRank
- 完全无监督 → 必须有种子；改用社区发现等
- 要两点相似度而非相对种子信誉 → SimRank / Personalized PageRank
- 现代搜索最终排序：TrustRank 只是众多特征之一

## 历史小故事（可跳过）

- **2003-2004**：link farm 产业化，"buy viagra" 前 10 常被垃圾站占满。
- **2004 VLDB**：Gyöngyi 在 Garcia-Molina 指导下完成；Pedersen 提供 AltaVista 数据。
- **2005 后**：业界反 spam 大量借鉴"种子信誉"思路；Google Penguin（2012）公开承认 link 信誉信号。
- **2017**：GCN 半监督设定把 Label Propagation / PageRank-style 方法当 baseline——同族思想重生。

## 学到什么

1. **同一公式 + 不同初始向量 = 不同算法**：d 从均匀变种子指示，抗攻击能力大变。
2. **半监督的力量**：人工只看几百个，剩下靠图推——早期"少标注大规模"原型。
3. **信任 vs 投票**：链接当信任传递，比当民主投票更抗刷。
4. **攻防会迭代**：TrustRank → Trust-aware spam → Anti-TrustRank → 再被绕过。

## 延伸阅读

- 论文 PDF：[Combating Web Spam with TrustRank](https://www.vldb.org/conf/2004/RS15P3.PDF)（VLDB 2004）
- Krishnan & Raj 2006 Anti-TrustRank — 从 spam 种子传 distrust
- Castillo & Davison 2010 [Adversarial Web Search](https://chato.cl/papers/castillo_davison_2010_adversarial_web_search.pdf)
- [[pagerank-1998]] —— 直接前身，复用 power iteration
- [[hits-1999]] —— 同期 Hub/Authority 拆分

## 关联

- [[pagerank-1998]] —— 数学骨架同源，差异只在 d 向量
- [[hits-1999]] —— Kleinberg HITS，同期 Web 图算法
- [[mapreduce]] —— 大规模跑迭代图算法的分布式底座
- [[bigtable]] —— 存 Web 图和分数的存储
- [[lambdarank-2006]] —— 后来学习排序把信誉当分之一特征

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[lambdarank-2006]] —— LambdaRank — 跳过定义损失函数，直接把梯度写出来
- [[ranknet-2005]] —— RankNet — 让搜索引擎学会比较两个结果谁更好
- [[szegedy-adversarial-2013]] —— Szegedy 对抗样本 — 图片只改一点点，模型却会彻底看错
