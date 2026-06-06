---
title: k-d 树 — 多维空间里的二叉搜索树
来源: Bentley, J. L., "Multidimensional Binary Search Trees Used for Associative Searching", CACM 18(9), 1975
日期: 2026-05-31
子分类: 渲染与图形
分类: 图形学
难度: 初级
provenance: pipeline-v3
---

## 是什么

**k-d 树**（k-dimensional tree）是一种把"多维空间里的点"塞进二叉树里的方法，让你能很快找到"离某个查询点最近的点"。日常类比：

> 在地图上找最近的咖啡店——先一刀把地图劈成南北两半（看你在哪边），再把那一半按东西劈两半（看你在左还是右），再按南北劈⋯ 每切一刀就排除一半候选。

普通二叉搜索树（`BST`，Binary Search Tree）只能处理"一维数据"（一串数字）。k-d 树把这个想法推广到 k 个维度：每往下走一层，**轮换**一个维度做比较。

## 为什么重要

不理解 k-d 树，下面这些事都没法解释：

- 为什么 scikit-learn 的 KNN 在 5 维数据上飞快、在 500 维上慢成狗——这就是"维度诅咒"
- 为什么光线追踪渲染器（Cycles / PBRT 早期版本）能在百万三角形场景里实时找碰撞
- 为什么 1996 年 Jensen 的 photon mapping 算法可行——核心是 k-d 树查光子近邻
- 为什么向量数据库（Pinecone / Milvus）**不**用 k-d 树而用 HNSW——同样因为维度诅咒

k-d 树是 1975 年的论文，今天写 KNN 还在用，是少数 50 年没过时的数据结构之一。

## 核心要点

k-d 树的魔法只有 **三个动作**：

1. **轮换维度切**：每一层只按一个维度切（discriminator）。第 0 层切 x，第 1 层切 y，第 2 层切 z，第 3 层又回到 x⋯ 像切洋葱，每层换一个方向。

2. **像普通二叉搜索树一样插入**：来一个新点，从根开始；这一层的 discriminator 是 x 就比 x 坐标，小走左大走右；下一层换 y，再小走左大走右⋯ 直到叶子。

3. **最近邻查询的剪枝**：查"离 q 最近的点"时，先按规则下到叶子拿一个候选距离 d。然后**回溯**——但只在"分隔超平面到 q 的距离 < d" 时才进对侧子树。这一步剪枝是 k-d 树的灵魂。

## 实践案例

### 案例 1：二维 k-d 树长什么样

假设有 6 个点 `(2,3) (5,4) (9,6) (4,7) (8,1) (7,2)`：

```
                (7,2) [按 x 切]
               /      \
          (5,4) [y]    (9,6) [y]
          /    \         /
       (2,3)  (4,7)   (8,1)
       [x]    [x]     [x]
```

第 1 层（根）按 x 比；第 2 层按 y 比；第 3 层又按 x。看起来怪，但搜索时一刀切掉一半。

### 案例 2：最近邻查询的剪枝

查"离 (9, 2) 最近的点"：

1. 下到叶子 `(8, 1)`，记当前最近距离 d ≈ 1.41
2. 回到 `(9, 6)`，看分隔线（y=6）到查询点距离是 4 > d → **不用进左子树**
3. 回到 `(7, 2)`，看分隔线（x=7）到查询点距离是 2 > d → **不用进左子树**
4. 答案：(8, 1)

整个过程**没看左半边一眼**——这就是剪枝的力量。在 d=2 时大约能剪掉一半节点；但⋯⋯

### 案例 3：维度诅咒长什么样

```python
from sklearn.neighbors import KDTree
import numpy as np

# 低维：飞快
X_low = np.random.rand(10000, 3)
tree = KDTree(X_low)
tree.query(X_low[:1], k=5)  # < 1ms

# 高维：基本退化成线性扫描
X_high = np.random.rand(10000, 100)
tree = KDTree(X_high)
tree.query(X_high[:1], k=5)  # 比 brute force 还慢
```

为什么？高维下"分隔超平面到查询点的距离"几乎总是 < 当前最近距离——剪枝条件几乎永远不成立——回溯把整棵树都遍历了。

## 踩过的坑

1. **维度 > 20 别用 k-d 树**——剪枝失效，退化成 O(n)。改用 HNSW / Annoy / FAISS。

2. **动态数据要小心**：插入久了会失衡，性能塌方。k-d 树没有自带的旋转再平衡（不像 AVL / 红黑），常见做法是定期**整棵重建**。

3. **中位数 vs 中点切**：中位数（median）保证平衡但要排序，构建 O(n log² n)；中点（midpoint）快但碰到数据偏分布退化。原论文用中位数。

4. **删除特别麻烦**：删除非叶节点要在子树里找一个"这一层这个维度的最小点"替换，逻辑比普通二叉搜索树的删除复杂得多。工程上常常打"删除标记"懒处理。

5. **均匀分布假设**：原论文复杂度分析假设数据均匀分布。真实数据（地理坐标 / embedding）几乎都不均匀，最坏情况要靠测量而非证明。

6. **维度选择不一定要轮换**：原论文用"轮换"，但更聪明的做法是每层选**方差最大**的那个维度切——叫 "sliding midpoint" 或 "principal axis"。scikit-learn 的实现会做这个优化，比纯轮换平均快 2-3 倍。

7. **k 不是查询时的 k**：术语很坑——k-d tree 的 k 是**维度数**（点是几维的），但 KNN 里的 k 是**邻居数**（找几个最近的）。两个 k 完全不相关。新人常以为 k-d 树只能查"k 个最近邻"，其实它能查任意个数。

## 适用 vs 不适用场景

**适用**：

- 维度 ≤ 20 的最近邻 / 范围查询（KNN 分类、空间索引、GIS、N-body 模拟）
- 静态数据集（构建一次查很多次）
- 光线追踪场景（k-d tree + SAH 启发式至今仍是 CPU 渲染器主力）
- photon mapping 的密度估计
- k-means 加速（用 k-d 树跳过远离质心的点，叫 filter algorithm）

**不适用**：

- 高维向量检索（embedding、词向量、图像特征）→ 用 HNSW / IVF / LSH
- 频繁插入删除的动态数据 → 用 R 树 / BVH
- 数据极度偏分布（所有点都挤一团）→ 用 Ball Tree 或聚类预处理
- 可微 / 端到端学习场景 → k-d 树不可微，无法接入梯度训练

## 历史小故事（可跳过）

- **1975 年**：Stanford 博士生 Jon Bentley 发表原论文，CACM 18(9)，14 页。当时他 22 岁。
- **1976 年**：Friedman-Bentley-Finkel 把最近邻算法的期望复杂度证完。
- **1977 年**：Bentley-Friedman 把范围搜索复杂度收紧到 O(n^(1-1/k) + r)。
- **1990s 中**：Vlastimil Havran 的博士论文系统梳理 k-d tree 在光线追踪里的全部设计空间，几乎成为标准教材。
- **1996 年**：Henrik Wann Jensen 的 photon mapping 算法把 k-d 树推到渲染主流——每个光子是一个点，渲染时查 k 近邻估光照密度。
- **2000s 后**：Wald-Havran 提出 Surface Area Heuristic (SAH)，让 k-d tree 在 GPU 光追也能跑得动。
- **2010s+**：高维 ANN 场景被 LSH / HNSW / FAISS 取代，k-d 树退守低维——但低维领域它至今没被超越。

## 学到什么

1. **轮换维度切是关键创新**——把一维的二叉搜索树推广到 k 维，不需要新数学，只需要一个"discriminator 索引"记住每层切哪个维度
2. **剪枝条件就是几何**——分隔超平面到查询点的距离 vs 当前最近距离，是中学几何，但放对位置就成了 50 年没过时的算法
3. **维度诅咒来自"高维空间里大多数点都差不多远"**——这是 k-d 树和所有空间索引共同的天花板，是数学限制不是工程问题
4. **50 年的算法还在 sklearn / Cycles 里跑**——好的数据结构寿命比框架长，写一份 KDTree 比追十年 ANN 论文实在

## 延伸阅读

- 视频：[CMU 15-462 Computer Graphics — Spatial Acceleration Structures](https://www.youtube.com/results?search_query=cmu+15-462+kd+tree)（图形学视角，讲 k-d 与 BVH 对比）
- 实现：[scikit-learn KDTree 源码](https://github.com/scikit-learn/scikit-learn/blob/main/sklearn/neighbors/_kd_tree.pyx)（生产级，含中位数切 + 懒删除）
- 论文：[Bentley 1975 原文 PDF](https://dl.acm.org/doi/10.1145/361002.361007)（密度高，但 14 页能读完）
- 论文：[Havran 2000 博士论文](http://www.cgg.cvut.cz/~havran/phdthesis.html)（k-d tree 在光追里的圣经）
- [[bvh-2007]] —— 同代竞争对手，动态场景更优
- [[goral-1984-radiosity]] —— 早期渲染算法，没用空间加速结构所以贵
- [[knuth-taocp]] —— 二叉搜索树的源头，k-d 树的祖父辈

## 关联

- [[knuth-taocp]] —— 普通二叉搜索树是 k-d 树的一维特例
- [[goral-1984-radiosity]] —— 渲染场景需要空间索引
- [[lafortune-1993-bdpt]] —— 光线追踪的加速结构需求
- [[veach-1995-mis]] —— Monte Carlo 渲染同代论文
