---
title: Wald 2007 — 把 SAH BVH 构建从分钟级砍到秒级的 binned 近似法
来源: 'Ingo Wald, "On Fast Construction of SAH-based Bounding Volume Hierarchies", IEEE Symposium on Interactive Ray Tracing 2007'
日期: 2026-05-31
分类: 图形学
难度: 中级
---

## 是什么

[[goldsmith-1987-bvh]] 给了光线追踪一棵会自己长的树（BVH）。**SAH**（表面积启发）是「怎么切这棵树更省遍历」的打分规则；**AABB** 是轴对齐盒子，像快递纸箱。1987 年的增量构建偏慢，到 2007 年百万三角面场景搭树要很多秒——动态场景每帧重建几乎不可能。

Wald 这篇 6 页论文的提速法：**别扫所有候选切法，把图元按质心（盒子中心点）投进约 16 个抽屉（bin），只在抽屉边界处切**。相对 Goldsmith 式慢构建，整体可到 O(N log N)；相对当时精确 full-sweep SAH，主要是常数级约 **10×** 加速，渲染质量多数场景接近。

日常类比：100 万张扑克要切成两摞。精确做法试每个缝；Wald 先粗分成 16 摞，只试「切在哪两摞之间」——略损精度，快一个数量级，切出来几乎一样好。

一句话记：**用分桶近似 SAH，换来能每帧重建的构建速度。**

## 为什么重要

不理解这一篇，下面这些事都讲不通：

- 为什么 Intel Embree、pbrt、NVIDIA OptiX 默认 BVH builder 长期跑 binned SAH
- 为什么 2007 年后「动态场景实时光追」突然变得可能——每帧重建有了时间预算
- 为什么 RTX Cores 硬件加速的是遍历，构建常仍在 CPU 用这类算法秒级搞定
- 为什么 Arnold、RenderMan、Cycles 启动「准备场景」阶段常见 binned SAH

这是把 [[goldsmith-1987-bvh]] 的 SAH 从理论指标搬上工程实战的关键一脚。

没有它，后面的实时重建叙事会缺一块拼图。

## 核心要点

整篇灵魂是三步替换（每步都像「先分桶再算账」）：

1. **质心 binning**：算每个图元盒子的中心点，沿最长轴等宽切 K 个抽屉（论文甜点 K=16）。每个图元落入唯一一格——像按身高分进 16 列队伍。

2. **两遍前缀扫描**：从左累加人数与盒子并集，再从右扫一遍。任意切点的左右表面积都能 O(1) 取出——像超市扫码枪先扫一遍再回头对账。

3. **K-1 个候选选最优**：代价约 `SA(left)/SA(parent)×N_left + SA(right)/SA(parent)×N_right`，挑最小。空侧（某一边 0 个图元）直接丢掉。每节点主导 O(N)，整树约 O(N log N)；内层循环短、数据规整，对 SIMD（一次算多格盒子）友好。

## 实践案例

### 案例 1：论文 Table 1 的数量级

同一张表里还有 Fairy（174K）、Dragon 等；单线程数量级可记成：

```
# 对照论文 Table 1（秒；单线程）
Blade 1.5M:   sweep≈10.2s  binned≈1.09s
Conference:   sweep≈1.32s  binned≈139ms
Thai 10M:     binned≈7.4s
render vs sweep: 约 91%–100%（个别可差近一成）
```

**逐部分解释**：加速来自候选从 O(N) 降到 O(K)；质量仍接近，是因为按质心分侧，且每个 bin 跟踪真实包围盒并集——左右表面积不是「假设图元刚好填满抽屉」。千万级也能从「分钟级心理预期」拉回可交互区间。

### 案例 2：核心伪代码（跟做）

```
BuildNode(prims):
    if |prims| <= leaf_threshold: return Leaf(prims)
    cb = union(centroid(p) for p in prims)   # 质心包围盒
    if cb.hi ≈ cb.lo: return Leaf(prims)     # 避免除零
    axis = longest_axis(cb); bins = [empty]*K
    for p in prims:
        i = floor(K * (1-ε) * (c[axis]-lo)/(hi-lo))
        bins[i].count += 1; bins[i].bbox.union(p.bbox)
    L, R = prefix_scan(bins), prefix_scan(bins.rev())
    # 空侧（count=0）直接 skip，勿除零
    best = argmin_i SAH(L[i-1], R[i])
    left, right = partition(prims, best)
    return Node(BuildNode(left), BuildNode(right))
```

**逐部分解释**：`(1-ε)` 把贴右边界的点压进最后一格；`L[i-1]`/`R[i]` 是左右累计人数与盒子并集，表面积 O(1) 取出后只评 K-1 刀；`partition` 像 quicksort。论文默认全程 binning；Embree 常对大节点 binning、很小节点退回 full-sweep。跟做先固定 K=16、leaf_threshold=4。

### 案例 3：pbrt 三种切法对照

```
# pbrt BVHAccel：同一场景换切法
accel = BVHAccel(prims, splitMethod=SAH)       # 默认 binned，常用 K=12
# splitMethod=Middle      → 中线切：构建最快、渲染最慢
# splitMethod=EqualCounts → 左右等数：中间派
# splitMethod=SAH         → 构建中等、渲染通常最好
```

**逐部分解释**：三档说明 binning 是「保住 SAH 渲染质量、把构建拉到可接受」的中点。改 `SplitMethod` 跑同一场景，看构建秒数和光线/秒怎么对调，比只读公式更直观。

## 踩过的坑

1. **K 太小质量掉、太大不划算**：K=4 往往明显变差；K=16 是论文甜点；再加大构建变贵、渲染收益很小。
2. **质心贴边界要防浮点**：用 `(1-ε)` 或等价处理，否则同图元跨机器落入不同 bin，结果不可复现。
3. **partition 是隐藏热点**：选完切点后重排 ID；多核下 naive `partition` 易抢 cache，工程上常预分配左右索引缓冲。
4. **和 SBVH / GPU 路线别混**：SBVH 在 binning 上允许把跨边界三角面切开，渲染可再快约 10–20%，构建更贵；GPU 主流常走 LBVH（把空间编成 Morton 码再排序），和 CPU binned SAH 是互补路线，不要互相替代着抄。

## 适用 vs 不适用场景

**适用**：

- 百万级图元静态场景的 BVH 预构建（离线渲染器启动）
- 数十万级动态场景每帧重建（Embree 类 CPU 实时光追）
- 要保 SAH 质量且构建预算在秒级以内
- 教学：示范「近似换工程可行性」

**不适用**：

- GPU 构建优先：LBVH / HLBVH 等 Morton 路线更贴 SIMT
- 极小场景（几千图元）：full-sweep 常数更小，可能更快
- 追极致渲染：可开 SBVH，多花构建换约 10–20% 遍历
- 每帧拓扑剧变且要极致重建吞吐：常选更粗的快速构建

## 历史小故事（可跳过）

- **1987 年**：Goldsmith-Salmon 提出 SAH 与增量 BVH，场景小时尚可。
- **1990 年**：MacDonald-Booth 把 SAH 系统用到 kd-tree 等加速结构。
- **2006–2007 年**：Wald-Boulos-Shirley 等把 SAH BVH 推向动态场景，构建时间成新瓶颈。
- **2007 年**：本文（署名 SCI Utah / Intel）把 kd-tree 上已有的 binning 思路落到 BVH，约 6 页 IEEE RT。
- **2009 / 2012 年**：Stich SBVH 加 spatial split；Karras LBVH 走 GPU 并行，与 binning 互补。

## 学到什么

1. **近似换工程可行性**：精确扫切点太贵时，离散成 K 桶往往够用
2. **分桶 + 前缀扫描**是通用手法：外排序、quickselect、kd-tree 构建都能见到
3. **常数项决定胜负**：同属近线性时，SIMD/cache 友好的内层循环更能落地
4. **默认值即影响力**：Embree / pbrt / OptiX 长期默认 binned SAH，说明工程甜点找对了

好的加速结构论文，往往不是发明全新数学，而是把已有启发函数压到「每帧重建也付得起」。

## 延伸阅读

- 论文 PDF：[Wald 2007 fastbuild](https://www.sci.utah.edu/~wald/Publications/2007/FastBuild/download/fastbuild.pdf)（约 6 页，Table 1 最值得先看）
- Embree：[github.com/RenderKit/embree](https://github.com/RenderKit/embree) 中 binned SAH builder
- pbrt-v4：`BVHAccel` 与 `SplitMethod` 对照阅读
- Stich 2009 SBVH：在 binning 上加 spatial split
- Karras 2012 LBVH：GPU 全并行构建的互补路线
- [[goldsmith-1987-bvh]] —— SAH/BVH 概念起点

## 关联

- [[goldsmith-1987-bvh]] —— SAH 与 BVH 起点，本文是其后工程化加速
- [[kajiya-1986-rendering-equation]] —— 路径追踪数学根，BVH 是其加速结构
- [[whitted-1980]] —— 递归光线追踪；早期常用规则网格
- [[cook-1984-distributed-ray-tracing]] —— 从单根光线推广到分布采样
- [[karras-2012-parallel-bvh]] —— GPU 上 O(N) 并行构建的互补路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[karras-2012-parallel-bvh]] —— Karras 2012 — 让每个 BVH 内部节点独立算自己（O(N) 全并行 GPU 构建）
