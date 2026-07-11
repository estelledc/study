---
title: Goldsmith-Salmon 1987 — 让计算机自己给场景搭层次包围盒
来源: Goldsmith & Salmon, "Automatic Creation of Object Hierarchies for Ray Tracing", IEEE CG&A 1987
日期: 2026-05-31
分类: 图形学
难度: 中级
---

## 是什么

这篇 1987 年的论文回答一个非常具体的工程问题：**渲染一张光线追踪图，计算机要怎么知道光线该跟哪些物体做相交测试？**

日常类比：你在一个堆满纸箱的仓库里找一根掉下来的针。最笨的办法是把每个箱子都翻一遍。聪明一点的办法是先给箱子分组、套大箱、套更大的箱，找针时**先看大箱有没有可能装着针，没有就整组跳过**。这种"箱套箱"的结构叫 **BVH**（Bounding Volume Hierarchy，包围盒层次）。

1987 年之前，BVH 都是**建模师手工搭**的——这场景里桌子、椅子、台灯，谁该套在谁底下，人来想。Goldsmith 和 Salmon 第一次写出"让计算机自己搭"的算法，并且给出了**怎么判断一个层次搭得好不好**的数学指标——也就是后来改写整个图形学的 **Surface Area Heuristic（SAH，表面积启发式）**。

## 为什么重要

不理解这篇论文，下面这些都讲不清：

- 为什么 NVIDIA 的 RTX 显卡能实时光追——硬件 RT Core 跑的就是 BVH 遍历
- 为什么 Blender / Unreal Lumen / PBRT / Embree / OptiX 用的"BVH 构建质量"几乎都按 SAH 打分
- 为什么"光线追踪很慢"在 1987 年是真的，2024 年是假的——慢在 1980 年代是因为没 BVH，加了 BVH 之后渲染时间从 O(N) 跌到 O(log N)
- 为什么硬件团队（RTX Cores）要把 BVH 遍历刻进芯片——它是路径追踪绕不过去的瓶颈

这篇论文相当于现代 GPU 光追的"第一块奠基石"。它的孙辈论文（Wald 2007、Karras 2012、Stich 2009）都还在引它。

## 核心要点

Goldsmith-Salmon 的关键洞察可以拆三步：

1. **几何概率**：如果包围盒 A 完全包在 B 里，那么"随便射一根光线穿过 B 时也穿过 A"的概率，正比于它们的表面积之比 `SA(A) / SA(B)`。这是 19 世纪积分几何里的经典结果（常追溯到 Crofton 公式一类结论），1987 年第一次被系统搬到光线追踪的层次构建里。

2. **代价模型**：BVH 节点的期望遍历代价 = 每个孩子的"被光线击中概率" × "进入孩子后的子代价"，求和。写成公式：

   ```
   Cost(node) = Σ (SA(child_i) / SA(parent)) × Cost(child_i)
   ```

   这就是 SAH。它把"哪个层次更省"从直觉变成可以**算分数**的事。

3. **增量插入构建**：把场景里的物体一个一个往树上插，每次选"插哪里使总 SAH 代价增加最少"的位置。一个 N 物体场景就这样自动长成一棵 BVH，无需建模师参与。

整篇论文的灵魂就这三步：**几何概率 → 代价函数 → 贪心搜索**。

## 实践案例

### 案例 1：SAH 怎么打分

假设一个边长 1m 的大盒子（体积 1m³，表面积 6m²）里，两个边长 0.1m 的小盒子（每个体积 0.001m³，表面积 0.06m²）分别藏在两个对角。

- 大盒子表面积 = 6 m²
- 每个小盒子表面积 = 0.06 m²
- 光线穿大盒子时也穿到某个小盒子的概率 ≈ 0.06 / 6 = 1%

也就是说，光线 99% 的情况下进了大盒子但**两个小盒子都没碰**。这种层次很省——大部分光线测一次外盒就跳过。

反过来，若先套一个几乎和大盒一样大的中盒（表面积 ≈ 5 m²）再塞两个小盒，光线进大盒后还有 ≈ 5/6 ≈ 83% 会误入中盒——多测一层却几乎没剪枝。SAH 会给这种层次打很差的分。

### 案例 2：现代 BVH 构建器怎么用 SAH

Embree（Intel 的工业级光追内核）的默认构建流程：

```
1. 把所有三角形扔进根节点
2. 对每个候选切分轴 (X / Y / Z)：
     - 沿轴扫一遍，把三角形分到 32 个 bin
     - 对每个 bin 边界，算左右子节点的 SAH 代价
3. 选 SAH 最低的那个切分点
4. 递归处理左右子节点
```

这叫 **binned SAH**（Wald 2007）——本质就是把 Goldsmith-Salmon 的 cost function 离散化加速。**评分函数没变**，搜索策略升级了。

### 案例 3：RTX 芯片在干什么

NVIDIA RTX Core 的 BVH 遍历单元做这件事：光线进来 → 用专门硬件做"光线 vs AABB 包围盒"相交测试 → 命中就下沉到孩子，没命中就剪枝。

整个芯片设计假设了 BVH 已经搭得很好。"搭得很好"的标准就是 1987 年定义的 SAH。芯片不参与构建——构建在 CPU 端用 Embree 这类库，按 SAH 打分搜索最优树。

### 案例 4：飞镖直觉

把 BVH 想象成一个套娃盒。光线像一支随机方向的飞镖。

- 飞镖击中外盒 = 必须进里面看
- 击中外盒后还击中里盒的概率 = SA(里) / SA(外)
- 概率越低，越多飞镖能"看一眼外盒就走"，渲染越快

SAH 的整个游戏就是：构造一棵树，让"看一眼就走"的概率尽量高。这就是为什么紧凑、不重叠的子盒比松散、重叠的子盒好——前者让光线更容易一眼判出"不在这里"。

## 踩过的坑

1. **SAH 假设光线方向均匀分布**——真实场景里，相机视锥发出的光线不均匀，环境光里的光线也偏向某些方向。SAH 在主光线和阴影光线上效果好，但在间接光（路径追踪反弹）上偶尔过于乐观。

2. **增量插入对输入顺序敏感**：原始 1987 算法把物体一个个塞进去，先后顺序不同会得到不同的树。后续工作（Wald 2007 top-down）改成"先看全局再切"，更稳定。

3. **SAH 不是唯一选项**：表面积假设光线均匀；如果你做的是地形渲染（光线大多来自上方），用"投影面积启发式"可能更好。SAH 是默认值，不是终点。

4. **SBVH 修正：物体跨边界**：一个长三角形可能横跨两个子节点。原始 BVH 只能"二选一"，浪费空间。Stich 2009 的 SBVH 允许把这种三角形切开放进两边——SAH cost 更低，构建更慢，但适合离线渲染（Blender Cycles 就用 SBVH）。

5. **SAH 是局部贪心，全局未必最优**：每一步都选当前最好的切分，不保证整棵树最省。后续 treelet restructuring（Karras-Aila 2013）做"局部回炉"——把树的小片拆下来重新拼，找到 SAH 更低的子结构。

## 适用 vs 不适用场景

**适用**：
- 任何需要做大量"光线 vs 几何"相交测试的场景：离线渲染器、实时光追、碰撞检测、点云查询
- 静态或缓慢变化的场景——一次构建多次复用
- 三角形数从十万到几亿的规模——BVH 把 O(N) 查询压到 O(log N)

**不适用**：
- 每帧场景大变（粒子流体、布料模拟）——重建 BVH 比查询还贵，得用 LBVH（Karras 2012）这种快速并行构建
- 体积渲染（云、烟）——没"表面"，得用网格或 OpenVDB
- 二维问题——用四叉树/kd-tree 更好
- 极小场景（<100 个物体）——直接暴力遍历更快，BVH 开销不划算

## 历史小故事（可跳过）

- **1980 年**：Whitted 发明递归光线追踪，渲染一张 512×512 的图要几小时——因为每条光线都要测每个三角形。
- **1980-1986 年**：Rubin、Kay、Kajiya 都试过手写 BVH，但层次怎么搭全靠经验。
- **1987 年**：Goldsmith（Caltech）和 Salmon（Caltech / JPL）发表这篇 7 页论文。两人当时都在做并行计算（hypercube 集群），需要让计算机自动给科学可视化场景搭 BVH——手写不现实。SAH 就是为这个工程需求长出来的。
- **1990 年**：MacDonald 和 Booth 把 SAH 搬到 kd-tree，证明它对空间细分类结构同样有效。
- **2000-2010 年**：Wald、Havran、Stich 等人把 SAH 算法工程化、并行化，让实时 SAH 构建成为可能。
- **2018 年**：NVIDIA RTX 发布——硬件级 BVH 遍历。SAH 正式从论文走进消费级显卡。

40 年里，cost function 一行没变。

## 学到什么

1. **把直觉变成可算的分数，是工程进步的杠杆**——SAH 之前 BVH 靠经验，之后靠数学。这种"先验 → 评分函数"的思维在 ML / 编译器优化里到处都是。
2. **几何概率是图形学的暗线**——表面积、立体角、辐射度，本质都是"光在空间里的概率分布"。SAH 是它最早的工程化产物之一。
3. **算法和硬件可以隔 30 年握手**——1987 年的 cost function，2018 年烧进硅片。
4. **限制是设计的一半**：SAH 假设光线均匀，假设场景静态，假设凸包围盒。每个假设都是一个可被攻击的角度——后续论文几乎都在攻击其中之一。
5. **贪心 + 局部代价模型 = 全栈通用范式**：BVH 这条路（SAH 评分 + 增量贪心）和编译器寄存器分配、查询优化器选 join order、ML 决策树切分（Gini / 信息增益）几乎同构。掌握 SAH 等于拿到这一类问题的钥匙。

## 延伸阅读

- 现代 SAH 工程实现：[Wald 2007 — On fast Construction of SAH-based BVH](https://www.sci.utah.edu/~wald/Publications/2007/ParallelBVHBuild/fastbuild.pdf)（binned SAH，Embree 默认算法）
- GPU 并行构建：[Karras 2012 — Maximizing Parallelism in BVH Construction](https://research.nvidia.com/sites/default/files/pubs/2012-06_Maximizing-Parallelism-in/karras2012hpg_paper.pdf)
- PBRT 教科书第 4 章：[Physically Based Rendering — Primitives and Intersection Acceleration](https://pbr-book.org/4ed/Primitives_and_Intersection_Acceleration)
- Embree 项目主页：[embree.org](https://www.embree.org/)（开源 SAH 构建器）
- [[whitted-1980]] —— 递归光线追踪的开山论文，BVH 要解决的就是它的性能问题
- [[ampere-architecture-2020]] —— RTX 硬件如何遍历 BVH

## 关联

- [[whitted-1980]] —— 光线追踪原始论文，本论文是它的性能续集
- [[3d-gaussian-splatting]] —— 现代实时渲染的另一条路（不用 BVH，但需要类似的空间索引思维）
- [[karp-21]] —— BVH 切分本质是 NP 难（partition 问题），SAH 是其贪心近似
- [[ampere-architecture-2020]] —— GPU 架构演进，RT Core 把 BVH 遍历硬件化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[3d-gaussian-splatting]] —— 3D Gaussian Splatting — 用一堆 3D 模糊光斑重建场景
- [[karp-21]] —— Karp 21 — 21 个 NP-完全问题
- [[karras-2012-parallel-bvh]] —— Karras 2012 — 让每个 BVH 内部节点独立算自己（O(N) 全并行 GPU 构建）
- [[wald-2007-sah-bvh]] —— Wald 2007 — 把 SAH BVH 构建从分钟级砍到秒级的 binned 近似法
- [[whitted-1980]] —— Whitted 1980 — 让光线在场景里递归跑三种次级射线

