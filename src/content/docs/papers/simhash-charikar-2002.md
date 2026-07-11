---
title: SimHash — 用随机超平面把余弦相似度变成汉明距离
来源: 'Charikar, "Similarity Estimation Techniques from Rounding Algorithms", STOC 2002'
日期: 2026-05-31
分类: 信息检索
难度: 中级
---

## 是什么

SimHash 是一套**把高维实数向量压成短二进制指纹、并保证两份指纹的相同位数恰好编码原向量夹角**的方法。

日常类比：你站在地面上看两根插在地上的钢筋，要判断它们指向是否接近。一个偷懒的办法——随便拉一面墙过原点，看两根钢筋是不是落在墙的同一侧。一面墙不够准（可能两根都偏却都落同侧），但拉 64 面随机方向的墙、记下"两根是否同侧"的 64 个比特，**两根钢筋夹角越小、同侧的次数越多**。最后只要数 64 比特里有多少位相同，就能反推出夹角。

经典场景：Google 2007 年要在 80 亿网页里找近重复（同新闻多站转载、加广告、改标题就当新页）。每页提取词袋向量后用 SimHash 压成 64 位指纹，存全表 64 GB 量级；查询新页时找"汉明距离 ≤ 3"的指纹就是近重复。这套机制把"网页 vs 网页"O(n²) 余弦比对降级成"64 位整数 vs 整数"的位运算。

## 为什么重要

不理解 SimHash，下面这些事都没法解释：

- 为什么 Google 索引"看着特别大"但去重背后只用 64 比特——SimHash 把每页压到 8 字节
- 为什么 [[minhash-broder-1997]] 对集合管用、对稠密向量却不行——MinHash 估 Jaccard，SimHash 估 cosine，不能混用
- 为什么 LSH 框架在向量数据库出现之前就能跑亿级——SimHash 是 [[lsh-indyk-1998]] 在 cosine 距离下的明星实例
- 为什么"随机投影"这个看似廉价的操作能保证精度——背后是 Goemans-Williamson MAX-CUT 舍入算法的几何概率定理

## 核心要点

SimHash 的设计可以拆成 **三步**：

1. **随机超平面引理（核心定理）**：在 d 维空间里随机选一个均匀方向 r（每维独立从高斯分布抽），定义 h_r(u) = sign(r·u)——u 在 r 的正侧给 1，负侧给 0。则 **`Pr[h_r(u) = h_r(v)] = 1 - θ(u,v)/π`**，其中 θ 是 u 和 v 的夹角。直觉：r 等概落在 u 和 v 张成的二维平面里任意方向，只有当 r 落进两者夹角内才把它们分到不同侧——这部分占比恰好 θ/π。

2. **f 个超平面拼指纹**：选 f 个独立随机方向 r_1..r_f，对向量 u 算 f 比特 (h_{r_1}(u), ..., h_{r_f}(u))。两个向量指纹的 **汉明距离** 期望 = f × θ/π。f 通常取 64；汉明距离 0 表示几乎共线，f/2 表示正交。

3. **工程实现的捷径**：实践中没人真的存 f 个 d 维方向。Manku 2007 在 Google 的实现里——对文档的每个 token w（带权重 wt(w)），算一次 f 比特哈希 h(w)；维护一个长度 f 的累加器 V，h(w) 第 i 位是 1 就 V[i] += wt(w)，否则 V[i] -= wt(w)；最后每位取 sign(V[i]) 就是指纹。**完全不构造超平面，只用普通哈希**。

指纹长度 f 与原向量维度 d 无关——10 万维 TF-IDF 向量和 100 维 embedding 都压成同样 64 比特。这一步把"高维稠密向量 vs 向量"的余弦比对降级成"f 位整数 vs 整数"的 popcount，可以批比较、可以分桶、可以分布式存。

## 实践案例

### 案例 1：两个短句的 SimHash 指纹

句子 A = "the quick brown fox"，句子 B = "the quick brown dog"，f = 8。

```python
import hashlib
def simhash(tokens, f=8):
    V = [0] * f
    for w in tokens:
        h = int(hashlib.md5(w.encode()).hexdigest(), 16)
        for i in range(f):
            V[i] += 1 if (h >> i) & 1 else -1
    return ''.join('1' if v > 0 else '0' for v in V)
```

跑出来 A 和 B 的 8 位指纹大约只在 1~2 位不同——它们三个 token 重合，词袋向量夹角小，SimHash 自然就近。把 f 扩到 64 在长文本上稳定性好得多。

### 案例 2：Google 的网页去重（Manku 2007）

Google 2007 把 SimHash 上线到 web crawl：

- 每页提取所有 token + 权重（IDF），算 64 位指纹
- 80 亿页 × 8 字节 = 64 GB，全内存放得下
- 阈值"汉明距离 ≤ 3"判定近重复

挑战：找"距离 ≤ 3"的对，朴素查询要枚举 C(64,3) ≈ 41664 个变体。Manku 用 **table permutation**：把 64 位切成 4 块 16 位，每块作 key 建排序表；查询 q 时，4 张表只要 q 的某一块**完全相等**且总距离 ≤ 3，就一定能在某张表里相邻找到。这把每次查询从 O(n) 扫降到几次 16 位前缀匹配。

### 案例 3：Charikar 论文的另一面——舍入算法即 LSH

论文标题里的"rounding algorithms"指的是组合优化里那些把 LP/SDP 松弛解"舍入"成整数解的技巧。Charikar 的核心观察：

- Goemans-Williamson 1995 解 MAX-CUT 的随机超平面舍入 → 给出 cosine 的 LSH（即 SimHash）
- 集合覆盖的 LP 舍入 → 给出 Earth Mover Distance 的 LSH
- ...每个有舍入算法的优化问题，都可能藏一个 LSH 家族

这是论文最深的洞察：**LSH 不是一堆零散的 hack，而是和舍入算法一一对应的统一框架**。SimHash 只是这个框架最容易落地的一个实例。

### 案例 4：LLM 训练数据去重

GPT-3 / LLaMA / Falcon 这一代模型预训练前都会跑大规模文档去重。Common Crawl 一个月就是几百 TB，[[minhash-broder-1997]] + LSH 是主流；但当文档已经 embedding 化（比如用句向量去重），夹角是 cosine，**SimHash 就比 MinHash 对**。RedPajama 和 Falcon 数据流水线里都能看到 SimHash 步骤——目的不是省存储，是防止同一段话出现几千次让模型过拟合。

## 踩过的坑

1. **token 权重决定上限**：所有词等权重的 SimHash 几乎只能区分长度差异；用 IDF / TF-IDF 给"the/of"打低权才有判别力。Manku 2007 论文用了不少篇幅讲 feature engineering——理论再漂亮，特征崩了一切归零。

2. **f 太小方差爆**：f=16 时夹角 30° 估出来可能是 20° 也可能是 45°。Google 默认 64，研究里见过 128。

3. **SimHash 估的是 cosine，不是 Jaccard 也不是欧氏**：稀疏 0/1 集合用 SimHash 会损失很多信号，应该用 [[minhash-broder-1997]]。混用是新手最常见的错。

4. **near-duplicate 阈值难调**：汉明距离 3 在 64 比特里对应"约 95% 余弦相似"，听起来很高但日常网页中误判不少。Manku 把阈值之外又加了一层**精确字面比对**做二次过滤。

5. **方向 r 不是真高斯**：论文用 ±1 随机向量近似（更快），偏差小到忽略。但有人偷懒用同一个 hash 不同 seed，seed 之间高度相关，估计失真——和 MinHash 同款坑。

6. **不能增量更新**：文档变 1 个 token 要重算指纹。流式场景需要变体（rolling SimHash）。

## 适用 vs 不适用场景

**适用**：
- 余弦相似度 / 高维实向量比对——网页去重、抄袭检测、推荐召回的 embedding 阶段
- 需要把"任意维度向量"压成"固定长度小指纹"以便分布式存
- 阈值是"几乎相同"的去重场景（汉明 ≤ 几）——精度足够、空间极省

**不适用**：
- 集合 Jaccard 相似度 → 用 MinHash（[[minhash-broder-1997]]）
- 欧氏距离最近邻 → 用 p-stable LSH 或现代 ANN（HNSW / FAISS）
- 真精确余弦（必须算到小数点后 4 位）→ 直接算内积
- 维度极低（d < 50）→ 直接全量比对反而快
- 需要按距离排序的 top-k 检索 → SimHash 只擅长"在不在阈值内"，要排序得二次精算

## 历史小故事（可跳过）

- **1995 年**：Goemans 和 Williamson 在 STOC 95 发表 MAX-CUT 的 0.878 近似算法，用随机超平面舍入 SDP 解。当时是组合优化里程碑，没人想到它和搜索引擎有关。
- **1998 年**：Indyk-Motwani 在 STOC 98 提出 LSH 通用框架（[[lsh-indyk-1998]]），但只给出 Hamming / l_p 距离的具体哈希家族，cosine 是空白。
- **2002 年**：Charikar 在 STOC 02 把 Goemans-Williamson 的舍入和 LSH 框架拼起来——cosine LSH 出现了，论文题目"Similarity Estimation Techniques from Rounding Algorithms"暗示这是一类方法。
- **2007 年**：Google 的 Manku、Jain、Sarma 在 WWW 07 发"Detecting Near-Duplicates for Web Crawling"，把 SimHash + table permutation 上线 80 亿页规模。这篇工程论文比 Charikar 原论文还出名，很多人甚至以为 SimHash 是 Google 发明的。
- **现在**：SimHash 还活在搜索引擎去重、代码克隆检测（如 Google 内部 source 去重）、LLM 训练数据流水线。它的位置稳定——比它精的 ANN 算法更慢、比它快的算法精度不够。

## 一些可能的疑问

**问：为什么 `Pr[h_r(u) = h_r(v)] = 1 - θ/π`？**

随机方向 r 在二维投影后等价于"圆周上均匀采样一个角度"。u 和 v 把圆周切成两段——夹角 θ 的弧 + 剩下 (π - θ) 的弧（×2，因为还有反向）。r 落进"剩下"那段时 u 和 v 落同侧。这部分占比 (2π - 2θ)/(2π) = 1 - θ/π。

**问：SimHash 比 MinHash 好在哪？**

不是"好"，是适配的距离不同。SimHash 估 cosine，MinHash 估 Jaccard。如果原数据是稀疏 0/1 集合（如词袋），两者都能用，SimHash 在长文档上常更稳；如果原数据已经是 embedding，必须 SimHash。

**问：64 位汉明距离 3 大概对应多大夹角？**

f=64 时距离 3 → 估计 θ/π ≈ 3/64 → θ ≈ 8.4° → cosine ≈ 0.989。所以"距离 ≤ 3"在工程语境下就是"几乎相同"。

**问：和 random projection（Johnson-Lindenstrauss）什么关系？**

JL 把高维实向量降到低维实向量并保持欧氏距离；SimHash 把高维实向量降到低维**二进制**向量并保持 cosine。SimHash = JL 的"取符号"版，丢精度但换位运算的速度，工程上恰好够用。

## 学到什么

1. **几何概率把高维问题降级**：`1 - θ/π` 这个等式漂亮在"随机超平面的夹角分布恰好是均匀的"——是几何概率方法的范本
2. **舍入算法 = LSH 家族**：每个组合优化里的舍入技巧都可能给出一个新的相似度哈希——Charikar 论文真正的贡献是这个统一视角
3. **理论 → 工程 → 替代**：SimHash 2002 论文 → 2007 Google 上线 → 至今没被工程层替代，只是被嵌入向量数据库里和 ANN 算法搭配用。好的小工具命长
4. **指纹的精度由比特数决定，不由数据规模决定**——这是 sketching 思想（[[minhash-broder-1997]] 同款）的又一次胜利

## 延伸阅读

- 论文 PDF：[Charikar 2002 — Similarity Estimation Techniques from Rounding Algorithms](https://www.cs.princeton.edu/courses/archive/spring04/cos598B/bib/CharikarEstim.pdf)
- 工程实战：[Manku, Jain, Sarma 2007 — Detecting Near-Duplicates for Web Crawling](https://www2007.cpsc.ucalgary.ca/papers/paper215.pdf)
- Stanford CS246 课件：[LSH for Cosine（含 SimHash 推导）](http://infolab.stanford.edu/~ullman/mmds/ch3n.pdf)
- [[lsh-indyk-1998]] —— SimHash 所属的通用 LSH 框架
- [[minhash-broder-1997]] —— 同时代的兄弟方法，估 Jaccard 而非 cosine

## 关联

- [[lsh-indyk-1998]] —— LSH 通用框架；SimHash 是它在 cosine 距离上的具体实例
- [[minhash-broder-1997]] —— 解决相似的去重问题但用于集合 Jaccard；SimHash 是 cosine 的对偶
- [[bm25-okapi]] —— 同时代的检索打分函数，但解决"查询与文档相关性"，不是"两份文档是否近重复"
- [[turing-1936]] —— 计算理论的源头；SimHash 体现"用随机性把不可计算的精确比对降级为可计算的估计"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
