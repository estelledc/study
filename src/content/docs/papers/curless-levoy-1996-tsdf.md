---
title: Curless-Levoy TSDF — 把多次扫描融成一个干净的 3D 模型
来源: Curless & Levoy, "A Volumetric Method for Building Complex Models from Range Images", SIGGRAPH 1996
日期: 2026-05-31
分类: 计算机图形
难度: 中级
---

## 是什么

TSDF（Truncated Signed Distance Function，**截断有符号距离场**）是一种**把好几次 3D 扫描数据揉成一个完整模型**的方法。日常类比：你拿手机绕着一只兔子摆设拍 30 张深度照片，每张都只看到一面，还都有点抖、有点噪。TSDF 是一个把这 30 份"半边兔子"融成一只**完整、平滑、干净**的兔子的标准做法。

具体怎么做：

1. 在空间里铺一张**三维网格**（想象一个装满小立方体的鞋盒，每个小立方体叫一个 voxel）
2. 每个 voxel 记两个数：`d`（到最近表面的距离，**带符号**——表面外为正、表面内为负）和 `w`（这次估计的可信度）
3. 来一次新扫描，就更新所有 voxel 的 `d` 和 `w`，用**加权平均**
4. 全部扫描融完，**表面就是 d = 0 的等值面**（用 Marching Cubes 抽出来就是网格）

这就是 Curless 和 Levoy 1996 在 SIGGRAPH 上发的那篇 8 页论文做的事。Stanford Bunny 数据库就是它跑出来的。

## 为什么重要

这篇论文是现代 3D 扫描和重建的**直接祖宗**：

- **KinectFusion (2011)**：第一个能用 Kinect 实时建 3D 模型的系统，核心数据结构就是 TSDF（搬到 GPU 上）
- **VoxelHashing / ElasticFusion / BundleFusion**：消费级 3D 重建的开山之作，全是 TSDF 的变种
- **工业 3D 扫描**：苹果 LiDAR、文物扫描、医学体成像，融合多视角深度图都走这条路
- **机器人 SLAM 的稠密地图**：很多 dense SLAM 用 TSDF 建环境模型
- **Stanford Bunny / Dragon / Buddha**：这些被全世界图形学论文用来对比效果的"标准模型"，正是这篇论文跑出来的——所以你看到的几乎每篇渲染、几何论文背后都站着 TSDF

不理解 TSDF，下面这些事都没法解释：

- 为什么 Kinect / iPhone LiDAR 能边扫边出 3D 模型
- 为什么 NeRF / 3D Gaussian Splatting 兴起前，3D 重建标准答案 30 年没换
- 为什么"距离场"在图形学里被反复提起（碰撞检测、字体渲染、SDF 建模都用它）

## 核心要点

### 三个关键设计

1. **有符号距离（Signed Distance）**：voxel 存"到表面有多远"，**表面外为正、表面内为负、表面上为零**。类比：海拔——海平面是 0，山上是正、海底是负。这样"表面"就是一条平整的等值线，比"占用 / 不占用"那种 0/1 表示平滑得多。

2. **截断（Truncated）**：voxel 只记表面**附近 ±μ** 范围内的距离，超出就不存。原因有两个：
   - **省内存**：远离表面的 voxel 不需要精确，存了也没用
   - **避免干扰**：背面的表面如果还往远处放距离值，会和正面的表面"打架"。截断让每片表面只影响自己附近一层 voxel

3. **加权平均融合**：来一次新扫描，对每个被这次看到的 voxel 做：
   ```
   D_new = (W_old · D_old + w · d) / (W_old + w)
   W_new = W_old + w
   ```
   - `d` 是这次扫描估计的距离值
   - `w` 是这次的可信度（**正对相机、距离近、不在边缘**的点权重高）
   - 这是一个**在线的加权平均**——每来一帧都更新，不需要存所有原始数据

### 为什么这套设计赢了

之前的方法（如多边形网格直接融合）要解决"两片网格在哪儿对齐、怎么缝合"这种**拓扑级**的难题。TSDF 把问题搬到**体素网格**：

- 不需要显式找对应点——空间位置自己就是对应
- 加权平均自动平滑掉噪声
- 多视角的"哪儿是表面"会**投票**——大多数扫描说"这里是表面"，零等值面就出现在那

整个过程**没用任何拓扑算法**。这是它优雅的地方。

## 实践案例

### 案例 1：Stanford Bunny 怎么造出来的

Curless 和 Levoy 用激光条纹扫描仪（Cyberware）绕兔子摆件转一圈，拿到约 10 个视角的距离图（range images），每张都只看到一面。

流程：

1. 准备一个覆盖兔子的 voxel 网格（约 500×500×500）
2. 对每张距离图：把每个像素反投影到 3D，更新沿视线方向附近 voxel 的 d 和 w
3. 全部融完，跑 Marching Cubes 在 d = 0 等值面上抽三角网格
4. 得到一只完整的兔子（~70 万三角形）

这只兔子之后被传到全世界，成为图形学领域第一个**公认基准**。

### 案例 2：KinectFusion 把它搬到 GPU 上

2011 年微软研究院做了 KinectFusion：用 Kinect 边走边扫房间，**实时**建 3D 模型。

核心做法和 1996 论文几乎一样，只是：

- voxel 网格放显存，每帧 30Hz 更新
- 用 GPU 并行算每个 voxel 的距离更新
- 相机位姿用 ICP（Iterative Closest Point）实时跟踪

结果：**手持 Kinect 扫房间，几秒内就有一个能旋转看的 3D 模型**。当年这个 demo 震惊业界。它能做到，全靠 TSDF 这种**易于在线更新、易于并行**的体素结构。

### 案例 3：为什么不用 occupancy grid（占用网格）

朴素思路：voxel 只存 0/1，"这里有东西 / 没东西"。问题：

- **表面位置量化到一个 voxel**——精度受 voxel 大小限制
- 表面是 0 → 1 的硬跳变，等值面提取出来全是阶梯
- 多次扫描怎么融？投票多数？还是叠加概率？两边都有问题

TSDF 的"距离"是**连续值**，sub-voxel 精度免费拿到（因为零交叉点可以在 voxel 之间线性插值）。这就是它统治 30 年的根本原因。

## 踩过的坑

1. **截断带 μ 怎么选**：太大，背面表面互相干扰；太小，扫描噪声超过 μ 就被截断丢失信息。论文经验：μ ≈ 几个 voxel 边长，配合扫描噪声水平调。

2. **内存爆炸**：500³ 的 voxel 已经 1.25 亿个。要扫一整个房间或一栋楼，朴素 voxel 网格直接 OOM。后续工作（VoxelHashing, OctoMap）用稀疏数据结构解决——只在表面附近分配 voxel。

3. **相机位姿要先准**：TSDF 假设每帧的相机位姿已知。位姿有偏差，融合出来的表面就模糊（multi-view averaging 把不同位置的表面平均掉了）。所以 KinectFusion 一定要配 ICP 跟踪。

4. **薄结构会消失**：两片表面距离 < 2μ，TSDF 会把它们融成一个。扫一张纸的两面，可能得到一片。这是体素表示的固有缺陷。

5. **Marching Cubes 提取的是网格不是点云**：很多人以为 TSDF 输出是点，其实是体数据，要再跑一步 Marching Cubes 才出三角网格。

## 适用 vs 不适用场景

**适用**：

- 多视角深度图融合（Kinect / RGB-D / LiDAR / 激光扫描）
- 实时 SLAM 的稠密地图（KinectFusion 系）
- 已知相机位姿的离线 3D 重建
- 中等尺度物体（桌面物体、单个房间）
- 需要平滑、闭合表面的场景

**不适用**：

- **超大场景**（一整座城市）→ 改用稀疏 voxel hashing 或八叉树
- **薄结构、复杂拓扑**（衣物、毛发、纸张）→ 体素分辨率不够
- **未知相机位姿**（论文假设有 ICP 或外部跟踪）→ 先用 SfM 或 SLAM 估
- **新一代隐式表示**（NeRF / 3DGS）已经能用神经网络存几何 + 外观，TSDF 在很多场景被替代
- **纯点云任务**（点云分类、语义分割）→ 不需要融合表面

## 历史小故事（可跳过）

- **1990 年代初**：3D 扫描刚兴起，Stanford 投巨资买激光扫描仪、扫艺术品（Digital Michelangelo Project）。Marc Levoy 是那个项目的负责人之一。
- **1995 年前后**：他们扫米开朗琪罗的《大卫》像，每天产几百 GB 数据，需要可靠的多视角融合算法。当时方法都很 ad-hoc。
- **1996 年**：博士生 Brian Curless 和 Levoy 发了这篇论文，提供工业级稳定的 fusion 方法。同年 Stanford Bunny 数据集发布。
- **2011 年**：微软研究院 Newcombe 等人把 TSDF 搬到 GPU，KinectFusion 横空出世。距 1996 论文 15 年，算法核心几乎没改——这是计算机图形学少见的"经典即答案"案例。
- **2020 年代**：NeRF / 3D Gaussian Splatting 用神经网络隐式表示几何，TSDF 在某些任务被替代，但**深度融合 + 距离场**的核心思想还在。

## 学到什么

1. **换表示就换问题**：把"网格融合"问题搬到"voxel 上的距离平均"，难题从拓扑变成算术。这是图形学反复出现的套路——选对表示，半个问题就没了
2. **截断 + 加权平均**两个朴素技巧叠在一起，统治了一个领域 30 年
3. **理论简单 + 工程友好** 才能持久。TSDF 没有花哨数学，但每个细节都对硬件、内存、并行友好
4. **基准数据集的力量**：Stanford Bunny 让无数图形学论文有了对比基础。一篇做工具的论文，连带做了基础设施

## 延伸阅读

- 论文 PDF：[Curless & Levoy 1996](https://graphics.stanford.edu/papers/volrange/volrange.pdf)（8 页，密度适中，强烈推荐看）
- 工业落地：[KinectFusion 2011](https://www.microsoft.com/en-us/research/publication/kinectfusion-real-time-3d-reconstruction-and-interaction-using-a-moving-depth-camera/) — 把 TSDF 搬到 GPU
- 稀疏化：[VoxelHashing 2013](https://niessnerlab.org/projects/niessner2013hashing.html) — 解决大场景内存问题
- 数据集：[Stanford 3D Scanning Repository](https://graphics.stanford.edu/data/3Dscanrep/) — 兔子 / 龙 / 佛像都在
- [[marching-cubes-1987]] —— TSDF 的"等值面提取"那一步用的就是它
- [[meagher-1982-octree]] —— 八叉树是后续稀疏 TSDF 的基础

## 关联

- [[marching-cubes-1987]] —— Marching Cubes 是 TSDF 抽出表面的标准方法
- [[meagher-1982-octree]] —— 后续大场景 TSDF（OctoMap 系）用八叉树压缩
- [[goral-1984-radiosity]] —— 同样把空间问题搬到离散网格的图形学经典
- [[saito-takahashi-1990-gbuffer]] —— 同期 Stanford 系的几何缓冲表示思想

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[gortler-1996-lumigraph]] —— Lumigraph — 给 4D 光场加一层粗糙几何，让插值不再鬼影
- [[levoy-hanrahan-1996-light-field]] —— Light Field Rendering — 把场景拍成 4D 数组，新视角靠查表
- [[newcombe-2011-kinectfusion]] —— KinectFusion — 用消费级深度相机实时重建三维世界
- [[pointnet]] —— PointNet — 直接吃点云的 3D 神经网络
- [[colmap]] —— COLMAP — 多视图 SfM/MVS 重建
