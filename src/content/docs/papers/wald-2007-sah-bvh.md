---
title: Wald 2007 — 把 SAH BVH 构建从分钟级砍到秒级的 binned 近似法
来源: Ingo Wald, "On Fast Construction of SAH-based Bounding Volume Hierarchies", IEEE Symposium on Interactive Ray Tracing 2007
日期: 2026-05-31
子分类: 渲染与图形
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

[[goldsmith-1987-bvh]] 给了光线追踪一棵会自己长的树（BVH），但 1987 年的算法每构造一个节点都要把所有候选切法扫一遍，复杂度 O(N²)。到 2007 年，场景有上百万三角面，光是把这棵树搭出来就要好几分钟——动态场景每帧重建？根本不可能。

Wald 这篇 6 页论文给了一个出乎意料朴素的提速法：**别去算所有候选切法的精确 SAH 代价，把 primitives 按质心位置投到 16 个抽屉（bin）里，只在抽屉边界处考虑切，每节点工作量从 O(N) 候选砍到 O(K=16) 候选**。整体构建从 O(N²) 跌到 O(N log N)。

日常类比：你要把一摞 100 万张扑克按某条规则切成两摞，最优做法是把每个『切在第 i 张和第 i+1 张之间』都试一遍。Wald 的做法是先把扑克按花色粗分成 16 摞，只考虑『切在哪两摞之间』——精度有损，但快了几个数量级，而且最后切得的两摞质量几乎一样好。

## 为什么重要

不理解这一篇，下面这些事都讲不通：

- 为什么 Intel Embree、pbrt-v3/v4、NVIDIA OptiX 默认 BVH builder 都跑这个算法，至今没换
- 为什么 2007 年之后『动态场景实时光追』突然变得可能——每帧重建 BVH 的时间预算来了
- 为什么 NVIDIA RTX Cores 硬件加速的是『遍历』不是『构建』——构建已经被这一篇压到 CPU 几秒搞定
- 为什么所有现代离线渲染器（Arnold、RenderMan、Cycles）启动时『准备场景』那段，跑的就是 binned SAH

这是把 [[goldsmith-1987-bvh]] 的 SAH 从『理论指标』搬上『工程实战』的关键一脚。

## 核心要点

整篇论文的灵魂是三步替换：

1. **质心 binning**：算所有 primitives 的质心 AABB，沿最长轴等宽切 K 个 bin（论文推荐 K=16）。每个 prim 按质心落入唯一一个 bin。

2. **两遍前缀扫描**：从左到右扫一遍 bin，累加 prim 数和 bbox；再从右到左扫一遍。两个扫描各 O(K)，于是任意切点的『左侧总 bbox 表面积』和『右侧总 bbox 表面积』都能 O(1) 取到。

3. **K-1 个候选切点选最优**：对每个 bin 边界算 SAH 代价 `Cost = SA(left)/SA(parent) × N_left + SA(right)/SA(parent) × N_right`，挑代价最小的切。

每节点工作量：扫 primitives 一遍（O(N)）+ 算 K-1 个候选（O(K)），主导项 O(N)。整棵树 log N 层，所以总构建 O(N log N)——而且常数极小，因为内层循环对 SIMD 友好。

## 实践案例

### 案例 1：百万三角面场景，构建时间 10 秒 → 1 秒

Wald 在论文里测了 Conference Room（28 万面）、Sponza（7.6 万面）、Soda Hall（150 万面）。结果：

- Full-sweep SAH（精确）：Soda Hall 构建 12.4 秒
- Binned SAH（K=16）：构建 1.1 秒，**约 11x 加速**
- 渲染时间几乎不变（光线/秒只差 2-3%）

这个『构建快 10x，渲染只差 2%』就是 binning 之所以成为默认的根本原因。

### 案例 2：Embree 源码里的实现

Intel Embree 的 `BVHBuilderBinnedSAH` 几乎是论文伪代码的逐行翻译，但加了三层工程：

- 用 SSE/AVX 一次更新多个 bin 的 bbox（SIMD bin update）
- 用 task scheduler 把『递归构建左右子树』丢进线程池
- 大节点（> 阈值）才 binning，小节点（< 32 prims）退化为 full-sweep

这套组合让现代 CPU 实时光追每帧能重建百万级 BVH。

### 案例 3：和 pbrt-v3 的对照

pbrt-v3 第 4 章 `BVHAccel` 默认 `SplitMethod = SAH`，跑的就是 binned SAH（pbrt 用 K=12）。pbrt 还提供 `Middle` / `EqualCounts` 两个对照：

- `Middle`：按中线切——构建最快、渲染最慢
- `EqualCounts`：左右等数——构建快、渲染中等
- `SAH`（binned）：构建中等、渲染最快

教学用对照非常清晰：binning 是把『精确 SAH』的渲染质量保住、把构建代价拉到能接受的中点。

### 案例 4：伪代码逐行看

整个核心算法不到 30 行。简化版（递归构建一个节点）：

```
BuildNode(prims):
    if |prims| <= leaf_threshold:  return Leaf(prims)
    centroid_bbox = union(centroid(p) for p in prims)
    axis = longest_axis(centroid_bbox)
    bins = [empty] * K
    for p in prims:
        i = floor(K * (centroid(p)[axis] - lo) / (hi - lo))
        bins[i].count += 1
        bins[i].bbox = bins[i].bbox.union(p.bbox)
    L = prefix_scan(bins)        # 左前缀
    R = prefix_scan(bins.rev())  # 右前缀
    best = argmin over i in [1..K-1] of SAH(L[i-1], R[i])
    left_prims, right_prims = partition(prims, best)
    return Node(BuildNode(left_prims), BuildNode(right_prims))
```

这就是『论文级别的伪代码』直接能跑——工程版本无非加 SIMD、加并行、加边界处理。

## 踩过的坑

1. **K 选小了反而退化**：K=4 时切点太粗，渲染代价飙升 30%；K=16 是 Wald 论文实测的甜点；K=64 构建多花 1.5x 时间但渲染只多省 1%，不划算。

2. **质心紧贴 bin 边界时分配不稳**：浮点比较要加 epsilon，否则同一个 prim 在不同机器上落入不同 bin，渲染结果不可复现——Embree 在这里栽过 bug。

3. **partition 那一步是隐藏热点**：选完 split 后要把 prims 分成左右两组。naive 用 `std::partition` 在多核下竞争 cache line，Embree 改成预分配两个 indices 数组分别 push。

4. **和 SBVH 的取舍**：Stich-Friedrich-Dietrich 2009 的 SBVH 在 binning 基础上加 spatial split（允许把跨边界的三角面切两半），渲染再快 10-20%，但构建时间多 30%。多数引擎默认仍用 binned SAH，只在最终渲染前可选打开 SBVH。

5. **GPU 移植不顺**：binning 需要 reduction，GPU 上做 atomic 或 warp-shuffle 都不优雅。GPU 路线主流是 LBVH（Karras 2012）的 Morton code + radix sort——和 binned SAH 几乎是平行宇宙的两条路。

## 适用 vs 不适用场景

**适用**：

- 百万级 primitives 静态场景的 BVH 预构建（离线渲染器启动阶段）
- 中等规模动态场景（数十万 prims）的每帧重建（Embree CPU 实时光追）
- 需要保留 SAH 渲染质量但构建时间预算秒级以内
- 教学：用最朴素的代码示范『近似换工程可行性』

**不适用**：

- GPU 上构建：用 LBVH / HLBVH / TRBVH，Morton code 路线更适合 SIMT
- 极小场景（< 几千 primitives）：直接 full-sweep SAH 常数更小、反而更快
- 追极致渲染速度：上 SBVH，多花 30% 构建换 10-20% 渲染
- 极度动态场景（每帧拓扑全变）：用 LBVH 重建，binning 的 partition 太重

## 历史小故事（可跳过）

- **1987 年**：Goldsmith-Salmon 发明 SAH 和增量贪心构建，O(N²)。当时场景几千面，跑得动。
- **1996 年**：MacDonald-Booth 提出 full-sweep SAH，O(N log² N) 但常数大。
- **2006 年**：Wald-Boulos-Shirley 把 SAH BVH 用到动态场景，发现 build time 是新瓶颈。
- **2007 年**：本论文。Wald 在德国萨尔兰大学的实验室里写下 binning 思路，6 页 IEEE RT 论文。Embree 的前身 Intel ART 当年就把它落地到产品。
- **2009 年**：Stich SBVH 在 binning 上加 spatial split。
- **2012 年**：Karras LBVH 走 GPU 路线，和 binning 互补。

## 学到什么

1. **近似换工程可行性**：精确解 O(N²) 跑不动，近似解 O(N log N) 跑得动而且质量只差 2%。这是工程优化的经典范式
2. **bin/bucket/histogram 思路**：把『连续候选』离散成『K 个桶』，再用前缀扫描 O(1) 查任意切点——这套手法在外排序、quickselect、kd-tree 构建都通用
3. **常数项决定胜负**：log² N 也算『近似线性』，但 binned SAH 的内层循环对 SIMD/cache 友好，常数小到能压过纯理论复杂度
4. **默认值的力量**：Embree / pbrt / OptiX 都把它作为 default builder 长达 18 年——好的默认值就是最好的论文影响力指标

## 延伸阅读

- 论文 6 页 PDF：[Wald 2007 fastbuild.pdf](https://www.sci.utah.edu/~wald/Publications/2007/FastBuild/download/fastbuild.pdf)（密度高但读得动）
- Embree 源码：[github.com/RenderKit/embree](https://github.com/RenderKit/embree) 的 `BVHBuilderBinnedSAH`
- pbrt-v4 第 7 章：`BVHAccel` 实现，对照阅读
- Stich 2009 SBVH 论文：在 binning 上加 spatial split
- Karras 2012 LBVH：GPU 并行构建，互补路线

## 关联

- [[goldsmith-1987-bvh]] —— SAH 和 BVH 概念的起点，本论文是它的 18 年后工程化升级
- [[kajiya-1986-rendering-equation]] —— 路径追踪的数学根，BVH 是它的加速结构
- [[whitted-1980]] —— 第一篇递归光线追踪，BVH 之前用 grid
- [[cook-1984-distributed-ray-tracing]] —— 把光线追踪从『一根光线』推广到『一束光线』

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cook-1984-distributed-ray-tracing]] —— Distributed Ray Tracing — 把所有"模糊"效果统一成随机采样
- [[goldsmith-1987-bvh]] —— Goldsmith-Salmon 1987 — 让计算机自己给场景搭层次包围盒
- [[kajiya-1986-rendering-equation]] —— Kajiya 渲染方程 — 把所有渲染算法统一成一个积分方程
- [[karras-2012-parallel-bvh]] —— Karras 2012 — 让每个 BVH 内部节点独立算自己（O(N) 全并行 GPU 构建）
- [[whitted-1980]] —— Whitted 1980 — 让光线在场景里递归跑三种次级射线

