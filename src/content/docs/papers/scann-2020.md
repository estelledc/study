---
title: ScaNN — 让向量量化只精修「客户会看到的那一面」
来源: Guo, Sun, Lindgren, Geng, Simcha, Chern, Kumar, "Accelerating Large-Scale Inference with Anisotropic Vector Quantization", ICML 2020
日期: 2026-05-31
分类: 数据库
难度: 中级
---

## 是什么

ScaNN（Scalable Nearest Neighbors，Google 出品）是一种**带方向感的向量压缩 + 检索系统**。日常类比：

你开了一家鱼摊，每条鱼要拍照存档以便客户线上挑。原来的压缩机不分方向，一律拍扁——客户从正前方看，鱼厚度被糊得很难辨认。ScaNN 反过来想：「我知道客户都站在正前方看，所以**沿客户视线方向**的厚度必须保留得很准；侧面糊一点没人发现。」

技术语言：

- 向量库要做内积相似度搜索（MIPS），查询 `q` 与库里向量 `x` 的相似度是 `⟨q, x⟩`
- 传统 PQ（Product Quantization）压缩 `x` 时，最小化 `‖x − x̂‖²`——所有方向同等惩罚
- ScaNN 把误差拆成两块：**平行分量**（沿 `x` 自己方向）和**正交分量**（垂直 `x`）；给平行分量极大权重，正交分量极小权重
- 结果：相同字节预算下，内积估计精度大幅上升，recall 同样涨

ScaNN 是 ANN-Benchmarks 长期占据 Pareto 前沿的开源系统，被 Google 用在 YouTube 推荐、广告召回等十亿级在线检索场景。

## 为什么重要

不理解 ScaNN，下面这些事都没法解释：

- 为什么 [[product-quantization-2011]] 已经把向量压到 16 字节，还能再往上挤一截 recall——答案是优化目标错了
- 为什么近 5 年向量库（FAISS / Milvus / Vespa）纷纷加「anisotropic」选项——它们在抄 ScaNN
- 为什么同样 16 字节预算下 ScaNN 比 IVF-PQ 召回率高 5–10 个百分点——一个『方向感知 vs 均匀对待』的差距
- 为什么大模型 RAG 时代向量检索还能继续挖空间——损失函数改造比加机器便宜得多

## 核心要点

ScaNN 的洞见可以拆成 **三步**：

1. **观察：MIPS 只在乎一个方向**。查询 `q` 和压缩后的 `x̂` 算内积，误差 `⟨q, x − x̂⟩` 只受 `(x − x̂)` 在 `q` 方向上的投影影响。垂直 `q` 的那部分误差，不进内积。

2. **近似：用 `x` 自己当方向**。真实查询 `q` 未知，但库里的好邻居 `q ≈ x`（对相似的两个向量，它们方向相近）。所以把「误差沿 `q` 方向」近似成「误差沿 `x` 方向」，得到**各向异性损失**：

   ```
   L = w_∥ · ‖e_∥‖² + w_⊥ · ‖e_⊥‖²
   ```

   其中 `e_∥`、`e_⊥` 分别是平行/正交分量，`w_∥ >> w_⊥`（论文里 w_∥/w_⊥ 取 10–100）。

3. **训练：把 PQ 的 k-means 换成加权版**。仍然分段、仍然每段聚 256 类，但聚类目标从「最小化 L2 重建误差」改成「最小化各向异性加权误差」。算法骨架不变，**只换损失函数**。

工程上 ScaNN 还有两层封装：粗筛用 partition tree（K-means 树），精排用原始向量 reorder，中间核心是各向异性 PQ。三层组合让百亿向量在单机毫秒级返回。

## 实践案例

### 案例 1：为什么改损失函数就够

设 `x` 是单位向量，`x̂ = x + e`。内积 `⟨q, x̂⟩ = ⟨q, x⟩ + ⟨q, e⟩`。误差项 `⟨q, e⟩` 只看 `e` 在 `q` 方向上的投影。

逐步拆开：

1. 内积误差 = `e` 在查询方向上的投影，垂直方向不进分
2. 好邻居时 `q ≈ x`，所以「沿 `q`」≈「沿 `x`」→ 只要盯紧 `e_∥`
3. 正交分量 `e_⊥` 完全不进内积——压缩时「白送」给它精度是浪费

ScaNN 把白送的精度抢回来给 `e_∥`，整体内积估计就变准。这是**靠数学发现的免费午餐**，不是靠加参数。

### 案例 2：ANN-Benchmarks 量级对比（示意）

GloVe-100（约 118 万条、每条 100 维词向量；下表为教学量级示意，非某一跑次截图）：

| 系统 | 内存（每条字节） | recall@10 | QPS |
|---|---|---|---|
| FAISS-IVF-PQ | 16 | ~0.85 | ~10k+ |
| HNSW | 400+ | ~0.95 | ~10k+ |
| ScaNN（默认） | 16 | ~0.93 | 更高一档 |
| ScaNN + reorder | 16 + 原向量 | ~0.97 | 略降 |

要点：

- 同「16 字节预算」档，ScaNN 相对 IVF-PQ 常能多挤出数个 recall 点，主要靠换损失函数
- 加 reorder（拿原向量精排 top-N）后召回可逼近/超过高内存图索引，字节仍更省
- QPS 优势还来自 SIMD 友好的查表实现（asymmetric hashing）；实时曲线见 [ann-benchmarks.com](http://ann-benchmarks.com/)

### 案例 3：写一个最小化的各向异性 k-means（伪代码）

```python
def anisotropic_kmeans(X, K=256, w_par=10.0, w_orth=1.0):
    centroids = X[random_indices(K)]
    for _ in range(20):
        # 分配：每个 x 找最近 centroid（在加权距离下）
        for x in X:
            best, best_loss = None, inf
            for c in centroids:
                e = x - c
                e_par = (e @ x) * x / (x @ x)        # 沿 x 方向那一段
                e_orth = e - e_par
                loss = w_par * (e_par @ e_par) + w_orth * (e_orth @ e_orth)
                if loss < best_loss:
                    best, best_loss = c, loss
            assign(x, best)
        # 更新：每簇新中心用加权最小二乘解
        centroids = solve_weighted_lsq(clusters, w_par, w_orth)
    return centroids
```

骨架和普通 k-means 一样，只是距离函数和中心更新改成加权版。

## 踩过的坑

1. **w_∥ / w_⊥ 比例不是越大越好**：太大会让正交方向完全失控，远查询（`q` 与 `x` 不近）反而崩。论文给经验值，实际要按数据集 sweep。

2. **L2 距离搜索别用各向异性**：各向异性的推导前提是『查询近似落在数据向量方向』，这对内积/cosine 成立，对 L2 不成立。L2 任务还是用普通 PQ。

3. **partition + AH + reorder 三层都不能省**：少一层 recall 掉一截。partition 把搜索空间砍 99%，AH 在剩下的里粗排，reorder 用原向量在 top-N 精排。开源版默认就开这三层。

4. **各向异性 PQ 不能直接热替换 FAISS-IVF-PQ**：码本不同、查表布局不同。要么整体迁 ScaNN，要么自己改 FAISS 训练循环。

## 适用 vs 不适用场景

**适用**：

- 内积/cosine 相似度的大规模 ANN（推荐召回、RAG、广告）
- 内存预算紧（每条 ≤ 64 字节）的十亿级索引
- 需要在 ANN-Benchmarks 那条 Pareto 前沿往里挤的场景

**不适用**：

- L2 距离任务——理论假设不成立
- 小规模（<10 万）数据——直接暴力搜，省去 ANN 全套机器
- 需要频繁增删索引——ScaNN 偏静态，更新成本不低（要重训码本）

## 历史小故事（可跳过）

- **2011 年**：[[product-quantization-2011]] 出炉，把 PQ 推为向量压缩主流。损失是 L2 重建——天经地义但其实是浪费。
- **2014–2018 年**：业界在 PQ 上加了倒排（IVF-PQ）、加了优化（OPQ）、加了图（HNSW + PQ），都是『结构』层面的改进，没人动损失函数。
- **2019 年 8 月**：Guo 等人把论文挂上 arXiv（1908.10396），核心一句话：『改损失函数就行，结构不动』。
- **2020 年 ICML**：正式发表，同时开源 [ScaNN](https://github.com/google-research/google-research/tree/master/scann)，C++ 核心 + Python 接口，立刻冲上 ANN-Benchmarks 第一。
- **之后**：FAISS、Milvus、Vespa 陆续加 anisotropic 选项；学术界（如 RaBitQ 2024）继续在「损失函数 + bit allocation」方向挖。

## 学到什么

1. **优化目标比模型结构更要命**——同样一个 PQ 框架，换个损失就吃掉竞争对手 5–10 个 recall 点
2. **领域知识能简化数学**——「查询近似落在数据方向」这个观察让分解变得显然
3. **加权最小二乘**是个万能武器，把『不同方向不同重要性』直接写进损失
4. **工程组合 vs 理论核心**——partition + AH + reorder 是工程外壳，各向异性 PQ 才是论文的真贡献

## 延伸阅读

- 原论文：[Guo et al. 2020 — Accelerating Large-Scale Inference with Anisotropic Vector Quantization](https://arxiv.org/abs/1908.10396)（30 页，前 10 页够用）
- Google AI Blog 通俗解读：[Announcing ScaNN: Efficient Vector Similarity Search](https://ai.googleblog.com/2020/07/announcing-scann-efficient-vector.html)
- 开源代码：[google-research/scann](https://github.com/google-research/google-research/tree/master/scann)（C++ + Python）
- ANN-Benchmarks 实时榜：[ann-benchmarks.com](http://ann-benchmarks.com/)（看 ScaNN 在不同数据集上的位置）

## 关联

- [[product-quantization-2011]] —— ScaNN 的直接前辈，损失函数是 L2 重建（各向同性）
- [[faiss-2017]] —— 同时代另一大向量库；FAISS-IVF-PQ 是 ScaNN 的主要对手
- [[hnsw-2018]] —— 图索引路线，召回高但内存大；ScaNN 在「内存紧」时优势明显
- [[diskann-2019]] —— 把图索引搬到 SSD；和 ScaNN 是不同方向的『大规模 ANN』方案

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[spann-2021]] —— SPANN — 内存放中心、SSD 放向量的十亿级近邻检索
