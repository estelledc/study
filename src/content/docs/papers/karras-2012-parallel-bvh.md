---
title: Karras 2012 — 让每个 BVH 内部节点独立算自己（O(N) 全并行 GPU 构建）
来源: Tero Karras, "Maximizing Parallelism in the Construction of BVHs, Octrees, and k-d Trees", High-Performance Graphics (HPG) 2012
日期: 2026-05-31
分类: 图形学
难度: 高级
---

## 是什么

[[wald-2007-sah-bvh]] 把 BVH 构建从分钟级砍到秒级，但它是 CPU 算法——每次切分要扫一遍 prims 再递归，本质串行（顶层一次只能切一刀）。到 2012 年，GPU 已能扛上千线程并行做光追遍历，可构建那一步还得回 CPU 跑几十毫秒——动态场景每帧重建始终卡在这。

Karras 这篇 5 页论文给了一个看起来违反直觉的做法：**别再"自顶向下选切点 + 递归 partition"了，先把所有 primitives 按 Morton code（Z-order 曲线编号）排好序，再让每个内部节点用自己的下标和邻居的 Morton 前缀，独立算出自己代表的区间和切点**。整棵树的 N-1 个内部节点可以同时跑在 N-1 个 GPU 线程上，没有任何父子依赖。构建复杂度仍是 O(N)（受排序主导），但常数被压到能在毫秒级搭一棵百万节点的树。

日常类比：传统建树像分蛋糕——你先切一刀分两半，等切完再各自递归切；下一层不能在上一层之前动手。Karras 说："先把客人按身高排成一排，每个『切刀位置 i 』看一眼自己左右邻居的身高差，就知道自己负责哪段、要切在哪里"——所有切刀同时落下。

## 为什么重要

不理解这一篇，下面这些事都讲不通：

- 为什么 NVIDIA OptiX 6+ / RTX 硬件加速的 GPU BVH builder 默认走 LBVH 路线，不沿用 [[wald-2007-sah-bvh]] 的 binning
- 为什么 2012 年之后游戏引擎敢做"每帧全场景重建 BVH"——动态破坏、布料、流体粒子的实时光追前提
- 为什么 Embree 的 GPU 后端、Apple Metal RT、AMD Radeon Rays 的 GPU 路径都几乎是这篇的复刻
- 为什么 Morton code（1966 年的 IBM 专利）一个老古董突然在 2012 年成了 GPU 并行的关键钥匙

这是把『树形数据结构构建』从『天然串行』翻成『天然并行』的关键一脚——核心贡献不是性能数字，而是**思路重构**。

## 核心要点

整篇论文的灵魂是四步流水线：

1. **算 Morton code**：每个 primitive 的 bbox 质心归一到 [0,1]^3，再把三个浮点坐标的二进制位交错（interleave）成一个 30 位整数。Morton code 的关键性质是**字典序排出来的点列就是 Z 字形扫过空间**——空间相邻的 prims 编号也接近。

2. **基数排序**：把 N 个 Morton code 用 GPU radix sort 排序，O(N)。排完之后 prims 在数组里的下标顺序就隐含了一棵树的叶子顺序。

3. **并行建拓扑（核心创新）**：N-1 个内部节点，每个分配一个 GPU 线程。线程 i 通过比较 Morton[i] 与 Morton[i-1]、Morton[i+1] 的最长公共前缀（LCP），独立算出：自己代表的 prim 区间 [first, last]、自己的切分点 split、左右子节点是叶还是内部节点。**没有共享状态、没有递归、没有原子操作**——纯函数式 kernel。

4. **自底向上算 bbox**：拓扑搭好后还差 bbox。每个叶节点起一个线程往上爬，到父节点用 atomicCAS 抢一个计数器，第一个到的退出，第二个到的合并左右子 bbox 再继续往上。整棵树的 bbox 算法是 O(N) work、O(log N) span。

整体复杂度 O(N) work、O(log N) span，几乎是并行算法理论下界。

## 实践案例

### 案例 1：百万三角面动态场景，每帧 1-2ms 重建

Karras 在 GTX 480（2010 年的卡）上跑 Stanford Bunny（69k 面）、Fairy（174k 面）、Soda Hall（150 万面）：

- LBVH 构建（包含 Morton + 排序 + 拓扑 + bbox）：Soda Hall 约 9 ms
- 同等规模 Lauterbach 2009 LBVH（前一代）：约 30 ms，**3x 加速**
- 同等规模 CPU binned SAH（[[wald-2007-sah-bvh]]）：约 1100 ms，**100x 加速**

构建快到能塞进每帧渲染预算，是 RTX 时代『动态场景实时光追』的工程基石。

### 案例 2：拓扑算法的核心两行

整篇最关键的代码不到 10 行，简化版（线程 i 求自己的区间）：

```
d = sign(LCP(i, i+1) - LCP(i, i-1))  // 决定区间往哪边扩
lcp_min = LCP(i, i-d)                // 最小公共前缀
l = 0; t = 2
while LCP(i, i + t*d) > lcp_min: t *= 2
// 二分搜确切边界...
```

`LCP(i, j)` 是 Morton[i] 和 Morton[j] 的最长公共二进制前缀。这两步指数搜 + 二分搜各 O(log N)，把『我是哪个区间的内部节点』变成纯查询。**没人告诉你你是谁，你自己看一眼周围的编号就知道**——这是论文最巧妙的一笔。

### 案例 3：OptiX 与 Embree GPU 路径

NVIDIA OptiX 6+ 的 `OPTIX_BUILD_FLAG_PREFER_FAST_BUILD` 路径走的就是这套 LBVH（再加 RTX 硬件 traversal 加速）。Intel Embree 4.x 的 GPU 后端（SYCL）几乎一比一复刻 Karras 算法。AMD Radeon Rays 的 BVH builder 同样是这套，只是把 Morton code 升到 60 位以提升精度。

差异主要在『后处理』：OptiX 会跑一遍 treelet restructuring（[[meister-2018-trbvh]] 思路）把 LBVH 的渲染质量补到接近 SAH；Radeon Rays 走另一种 collapse 策略。但**第一阶段拓扑都是 Karras**。

### 案例 4：和 [[wald-2007-sah-bvh]] 的对比表

| 维度 | Wald 2007 binned SAH | Karras 2012 LBVH |
|---|---|---|
| 平台 | CPU + SIMD | GPU + SIMT |
| 构建复杂度 | O(N log N) work, 串行 span | O(N) work, O(log N) span |
| 渲染质量 | 接近最优 SAH | 比 SAH 慢 10-30%（需 treelet 修） |
| 适合场景 | 中等规模 + 渲染质量优先 | 巨大场景 / 动态 + 构建速度优先 |
| 工程地位 | Embree CPU 默认 | OptiX / Radeon Rays GPU 默认 |

两条路线在 2026 年仍并行存在，互不替代。

## 踩过的坑

1. **Morton code 30 位精度上限**：30 位编码空间被 2^10 × 2^10 × 2^10 网格切死，超大场景 + 极小细节会有质心碰撞，导致两个不同 prim 的 Morton 完全一样——`LCP = 30` 的『无穷』情况要特判，否则二分死循环。

2. **渲染质量比 SAH 差**：Morton code 只看空间局部性，不看 SAH 的"尽量切平衡 + 尽量切小表面积"。Karras 论文里渲染速度比 binned SAH 慢 10-30%，所以工业上几乎都要叠 [[meister-2018-trbvh]] 之类的 treelet 重构修补。

3. **bbox 自底向上的 atomicCAS 是隐藏热点**：第二个到达父节点的线程才合并 bbox，但浅层节点的 atomic 竞争极激烈。优化做法是把树分成『叶端 / 中段 / 根端』，根端单独用 reduction kernel。

4. **二分搜边界的 `int` 溢出**：`t *= 2` 走到极端会越过数组末端，要 clamp 到 [0, N-1]，否则在 N 接近 2^30 的场景里崩。

5. **和 LBVH 1.0（Lauterbach 2009）混淆**：Lauterbach 2009 也叫 LBVH，但拓扑构建仍是『一层一层并行 partition』，每层之间要同步——不是真并行。Karras 2012 是把『层间依赖』也消掉，所以叫 `maximizing parallelism`。

## 适用 vs 不适用场景

**适用**：

- GPU 上每帧重建 BVH 的动态场景（游戏破坏、粒子、布料、流体）
- 巨型场景（千万到亿级 prims）的初始化构建——CPU SAH 跑不动
- 离线渲染器的『预处理 + GPU 上传』流水线
- 构建时间预算 < 10 ms 的硬实时场景

**不适用**：

- 渲染质量是首要目标的离线渲染：用 [[wald-2007-sah-bvh]] + SBVH 更好
- 极小场景（< 1k prims）：CPU 直跑 full-sweep SAH 常数更小
- 需要确定性结果（每次构建完全一样）：GPU atomicCAS 的合并顺序不固定，bbox 浮点累加结果会有 ULP 级波动
- 不允许 GPU 内存常驻 BVH 的嵌入式平台：LBVH 中间数据结构占用比 CPU SAH 大

## 历史小故事（可跳过）

- **1966 年**：G. M. Morton 在 IBM 写下 Z-order 编码思路，原本用于地理数据库。
- **1990s**：Morton code 被引入数据库索引和稀疏体素，但和图形学还没接上。
- **2009 年**：Lauterbach 等人提出 LBVH（Linear BVH），用 Morton code 排序后『层层并行 partition』——首次把 BVH 构建挪上 GPU，但层间仍要同步。
- **2010 年**：Pantaleoni-Luebke HLBVH 把 LBVH 分成两段，上层 SAH 下层 LBVH，质量改善但拓扑构建仍非全并行。
- **2012 年**：本论文。Karras 在 NVIDIA Research 把『层间依赖』也消掉——任意内部节点只看 Morton 前缀就知道自己是谁。HPG 2012 论文，5 页。
- **2013 年**：Karras-Aila TRBVH 在 LBVH 上加 treelet 重构，把渲染质量补回到接近 SAH。
- **2018 年**：Meister 等系统化 treelet restructuring，OptiX 默认开启。

## 学到什么

1. **从『递归 partition』翻到『独立查询』**：传统树构建天然串行（父决定子的边界），Karras 找到一种『让每个节点自己看周围邻居就知道自己是谁』的表征，把依赖图压平。这是并行算法设计的高阶思路
2. **空间填充曲线的力量**：Morton code 把三维位置压成一维整数且保持空间相邻，等价于免费给你一棵『隐式 kd-tree』。Hilbert 曲线、Z-order 在并行算法里都常吃这碗饭
3. **work-span 模型胜过 big-O**：O(N log N) 串行 vs O(N) work + O(log N) span，理论复杂度差不多但并行度差几个数量级——并行时代选算法不能只看 big-O
4. **质量可以后修，并行度不能后加**：先用 Morton 拿到 GPU 友好的拓扑，再用 treelet 把渲染质量补回——两步分离，比从头追 SAH 全局最优高效得多

## 延伸阅读

- 论文 5 页 PDF：[Karras 2012 PDF](https://research.nvidia.com/publication/2012-06_maximizing-parallelism-construction-bvhs-octrees-and-k-d-trees)（写得清晰，配图直观）
- Tero Karras 博客：[Thinking Parallel Part III](https://developer.nvidia.com/blog/thinking-parallel-part-iii-tree-construction-gpu/)（NVIDIA 官博三连，本人写的实战版）
- 实现参考：[github.com/ToruNiina/lbvh](https://github.com/ToruNiina/lbvh)（CUDA 一比一复刻）
- [[wald-2007-sah-bvh]] —— CPU 路线的对照
- Karras-Aila 2013 TRBVH —— 本算法的渲染质量补丁

## 关联

- [[wald-2007-sah-bvh]] —— CPU binned SAH，平行宇宙路线
- [[goldsmith-1987-bvh]] —— SAH 和 BVH 的概念起点
- [[whitted-1980]] —— 第一篇递归光线追踪
- [[kajiya-1986-rendering-equation]] —— 路径追踪的数学根

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[wald-2007-sah-bvh]] —— Wald 2007 — 把 SAH BVH 构建从分钟级砍到秒级的 binned 近似法
