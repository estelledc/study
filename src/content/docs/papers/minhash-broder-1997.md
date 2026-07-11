---
title: MinHash — 用最小哈希值估算两个集合的重叠度
来源: 'Broder, "On the Resemblance and Containment of Documents", SEQUENCES 1997'
日期: 2026-05-31
分类: 信息检索
难度: 中级
---

## 是什么

MinHash 是一套**把一个集合压成一串小整数指纹、再让两份指纹的相同位数恰好等于两个集合 Jaccard 相似度**的方法。

日常类比：你有两本厚词典，想知道它们用词重叠多少。一种笨办法是逐词比对——慢得没法用。MinHash 的做法是：把所有可能的英文单词随机洗牌一次，每本词典记下"在这个洗牌顺序里排第一的那个词"。**两本词典记下的"第一名"相同的概率，正好就是它们交集大小除以并集大小**。重复 200 次不同的洗牌，统计相同次数 / 200，就是相似度的估计。

经典场景：AltaVista 1996 年索引了 3000 万网页，里面海量重复（同一新闻被各站转载、加广告就当新页）。要在 PB 级数据里找出"内容近乎相同"的网页，朴素做法 O(n^2) 直接死。MinHash 把每篇网页压成 200 字节的签名，n^2 比对降到极小常数。

## 为什么重要

不理解 MinHash，下面这些事都没法解释：

- 为什么 Google / Bing 索引"看着很大"但其实有效页面没那么多——重复早被 MinHash 类工具去掉了
- 为什么向量数据库出现之前，工业界已经在做"亿级集合相似度"——MinHash 是预热
- 为什么很多推荐系统的候选召回用"behavior set 的 Jaccard"——背后就是 MinHash 签名 + LSH 分桶
- 为什么基因组、代码克隆、抄袭检测这些**看上去毫不相关**的领域用同一套思想——它们的本体都是"两个集合像不像"

## 核心要点

MinHash 的设计可以拆成 **三步**：

1. **把 document 变集合（shingling）**：把一篇文档切成连续 k 个词组成的小片段（叫 k-shingle 或 k-gram），所有 shingle 装进一个集合。k 通常取 4~10。两篇文档的"相似度"就定义成两个 shingle 集合的 Jaccard：交集除以并集。

2. **MinHash 引理（核心定理）**：对全集 U 上一个随机均匀置换 π，**`Pr[min π(A) = min π(B)] = |A∩B| / |A∪B|`**。直觉：min 决定权落在 A∪B 的某个元素上，这个元素同时属于 A 和 B 的概率就是交集占并集的比例。

3. **n 个哈希模拟 n 个置换**：实际工程用 n 个独立哈希函数 h_1..h_n 代替"真随机置换"。对每个 h_i，存集合里所有元素经过 h_i 后的最小值——这 n 个最小值就是这个集合长度 n 的 **签名**。两个签名第 i 位相等的概率 = Jaccard，所以"相同位数 / n"就是 Jaccard 的无偏估计，误差 O(1/√n)。

签名长度 n 和原始 document 大小无关——10 万词的文档和 100 词的文档都压成同样长的签名。这一步把"集合 vs 集合"的比较降级成"长度 n 的小整数向量 vs 向量"，可以批比较、可以分桶、可以分布式存。

## 实践案例

### 案例 1：两个文档的 Jaccard 估计

文档 A："the quick brown fox"，3-shingle 集合 = {"the quick brown", "quick brown fox"}
文档 B："the quick brown dog"，3-shingle 集合 = {"the quick brown", "quick brown dog"}

真实 Jaccard = 1 / 3（交集 1 个，并集 3 个）。

用 200 个独立哈希计算签名：

```python
import hashlib
def minhash(shingles, n=200):
    sigs = []
    for i in range(n):
        sigs.append(min(int(hashlib.md5(f"{i}_{s}".encode()).hexdigest(), 16)
                        for s in shingles))
    return sigs
def jaccard_est(s1, s2):
    return sum(a == b for a, b in zip(s1, s2)) / len(s1)
```

跑下来 jaccard_est 大约在 0.30~0.36 之间——和真值 0.333 接近，误差由 √(p(1-p)/n) 控制。

### 案例 2：AltaVista 的网页去重

Broder 自己在 DEC SRC 把这套做法上线到 AltaVista：

- 每个网页提取所有 8-shingle，签名长度 84
- 84 字节存进倒排表，按签名分组
- 同一组里两两验真（再算一次精确 Jaccard），> 0.95 算重复

3000 万网页里识别出约 400 万近重复页，索引体积砍掉 1/8。这套机制后来被 Charikar 2002 SimHash 在更大规模上替代，但思想完全继承。

### 案例 3：MinHash + LSH 做亚线性查询

签名向量本身仍然要 n 次比较——10^8 个集合两两比是 10^16，签名也救不了。Indyk-Motwani 1998 把 MinHash 套进 LSH：

- 把签名切成 b 段、每段 r 个最小值
- 每段拼起来当 key 哈希进一张表
- 查询时只看"和 query 至少一段完全相同"的候选

只要 r 和 b 选好，任何 Jaccard ≥ 阈值的对都大概率被同段命中。10^8 个集合的近邻查询从线性扫降到亚线性。这就是后来 [[lsh-indyk-1998]] 之所以能跑起来的关键。

### 案例 4：containment（包含度）的小变体

论文还定义了 containment c(A,B) = |A∩B| / |A|——"A 多大比例被 B 覆盖"。这对"我这篇文档是不是抄了别人那篇"特别有用：抄袭者会保留原文的高比例，但加水稀释，Jaccard 会被分母稀释掉，containment 不会。MinHash 签名搭配元素计数也能近似估 containment，常用在抄袭检测和基因子串包含查询。

## 踩过的坑

1. **k 选小 → 短文本误命中；k 选大 → 长文本召回掉**：k=2 在新闻场景几乎所有文档都共享 "the of"；k=15 在长文档之间几乎没共同 shingle。工程上常按"语料平均长度的 √"挑 k。

2. **SHA1 / MD5 不是真正的随机置换**：理论要求 min-wise independent，工程上接受偏差。出过事故：用同一个 hash 不同 seed 偷懒省时间，结果两个 seed 高度相关，估计失真。规避：要么用 universal hash family，要么 seed 之间用密码学随机数生成。

3. **n 至少 100~200**：n=10 时方差太大，Jaccard 0.3 估出来可能是 0.1 也可能是 0.5。实际工程默认 128 或 256。

4. **预处理决定上限**：HTML 标签、停用词、大小写、空白没归一化，两份内容相同但排版不同的页就不像。Broder 论文里花了不少篇幅讲这步——理论再漂亮，预处理崩了一切归零。

5. **MinHash 估的是 Jaccard，不是 cosine 也不是欧氏距离**：稠密 embedding 向量不能直接用 MinHash，要换 SimHash（random hyperplane）或更晚的 ANN 方法。

6. **签名比对快但生成慢**：n=200 时每个 shingle 要走 200 次哈希，长文档生成签名时间不小。常见加速：one-permutation MinHash（一次置换分桶取每桶最小）、densification 处理空桶，把生成时间从 O(n × |S|) 降到 O(n + |S|)。

## 适用 vs 不适用场景

**适用**：
- 集合相似度（Jaccard）——网页去重、抄袭检测、推荐召回、基因 k-mer 比对
- 集合可枚举且元素离散——文档的 shingle、用户的行为 ID、代码 token 序列
- 需要把"任意大小集合"压成"固定长度小指纹"以便分布式存

**不适用**：
- 稠密实数向量的余弦/欧氏相似度 → 用 SimHash 或 ANN
- 真精确值要求（Jaccard 必须算到小数点后 4 位） → 直接算交并集
- 集合很小（< 50 个元素） → MinHash 方差占比太大，朴素比较反而快
- 需要权重 / 频次 → 用加权 MinHash（Broder 1998 续作）
- 流式数据、增量更新 → 朴素 MinHash 每次重算签名；要用支持增量的变体（max-hash + 滑窗等）

## 历史小故事（可跳过）

- **1996 年**：Broder 在 Digital Equipment Corporation 的 Systems Research Center（DEC SRC）领 AltaVista 的"质量"团队。AltaVista 索引飞涨，但发现 1/8 的页是重复，浪费机器还污染搜索结果。
- **1997 年**：在 SEQUENCES'97 会议发了这篇 6 页论文。同年的 STOC 1998 里 Indyk-Motwani 把它和 LSH 框架接上。
- **1998 年**：Broder 发了加权 MinHash，处理"出现频次"。
- **2002 年**：Charikar 发明 SimHash（random hyperplane），在 Google 网页去重落地，规模超过 MinHash 当年的 AltaVista 一两个量级。
- **现在**：MinHash 还活在推荐系统、基因组学（Mash、sourmash）、代码克隆检测、抄袭检查等所有"集合相似"任务里。大模型预训练数据集去重也会先跑一轮 MinHash + LSH——把"几乎相同"的文档合并，否则训练集里同一段话出现几千次，模型容易过拟合。

## 一些可能的疑问

**问：n 个独立哈希函数怎么生成？**

实际工程通常用 universal hashing：选一个大素数 p，n 个 (a_i, b_i) 随机数，h_i(x) = ((a_i × x + b_i) mod p) mod M。这族函数性质足够接近 min-wise independent，速度快、易并行。

**问：MinHash 估计的方差大概多大？**

n 次独立伯努利试验，方差 = p(1-p)/n。Jaccard 真值 0.5、n=200 时标准差约 0.035，95% 置信区间宽 ±0.07。要更精确就堆 n。

**问：和 Bloom Filter 是什么关系？**

Bloom Filter 回答"x 在不在集合里"（成员查询），MinHash 回答"两个集合像不像"（相似度）。都是 sketching 思想，但解决的问题不同。两者也能组合：先 Bloom 过滤明显不相干的对，再 MinHash 算相似度。

## 学到什么

1. **概率等于面积**：Pr[min π(A) = min π(B)] = |A∩B|/|A∪B| 这个等式漂亮在"采样的随机性恰好把比例算出来"——是概率方法的范本
2. **降维定理**：把"任意大小"压成"固定长度 n"，n 决定精度但和数据规模无关——这种 sketching 思想后来在 HyperLogLog、Count-Min Sketch、Bloom Filter 反复出现
3. **预处理决定上限**：归一化做不好，再聪明的算法也救不回来
4. **理论 → 工程 → 替代**：MinHash 1997 上线 AltaVista，2002 被 SimHash 在更大规模上替代——好理论的命运是被它的下一代理论替代，不是被工程绕开

## 延伸阅读

- 论文 6 页 PDF：[Broder 1997 — On the Resemblance and Containment of Documents](https://www.cs.princeton.edu/courses/archive/spring13/cos598C/broder97resemblance.pdf)
- Stanford CS246 课件：[MinHash + LSH 完整推导（含动画）](http://infolab.stanford.edu/~ullman/mmds/ch3n.pdf)
- 实战：Python 的 [datasketch 库](https://github.com/ekzhu/datasketch)，几十行复现 AltaVista 去重
- [[lsh-indyk-1998]] —— 把 MinHash 装进通用 LSH 框架做亚线性查询

## 关联

- [[lsh-indyk-1998]] —— LSH 通用框架；MinHash 是它在 Jaccard 距离上的具体实例
- [[bm25-okapi]] —— 同一时代的检索打分函数，但解决"查询与文档相关性"，不是"两个文档是否重复"
- [[turing-1936]] —— 计算理论的源头；MinHash 体现"用随机性把不可计算的精确比对降级为可计算的估计"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[simhash-charikar-2002]] —— SimHash — 用随机超平面把余弦相似度变成汉明距离
