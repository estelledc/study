---
title: Sorkine 2004 — 用拉普拉斯坐标编辑网格，拽把手不丢细节
来源: Olga Sorkine, Daniel Cohen-Or, Yaron Lipman, Marc Alexa, Christian Rossl, Hans-Peter Seidel, "Laplacian Surface Editing", Symposium on Geometry Processing 2004
日期: 2026-05-31
子分类: 渲染与图形
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

Sorkine 2004 提出一种**网格变形方法**：你在一个 3D 模型上钉几个把手（handle），随便拖一个，整个模型**像橡皮一样跟着弯**，但表面的小凸起、皱褶、纹理细节**一根都不丢**。

它用的"骨架"叫 **Laplacian coordinates（拉普拉斯坐标）**：把每个顶点 v_i 用它和邻居的差值来记录：

```
delta_i = v_i - sum_j w_ij · v_j
```

这条公式不记录"v_i 在哪儿"，只记录"v_i 比邻居中心**偏出去多少、往哪个方向偏**"——这就是局部细节。编辑时让所有 delta_i 尽量保持原值，再加上"把手要去哪儿"的约束，**解一次稀疏线性方程**就出结果。

日常类比：你抓住绳子的两端，捏弯它。绳上每两节之间的相对方向（弯了多少度）尽量不变，但整条绳子可以画出任意 S 形。Laplacian 编辑就是把这个直觉数学化推到三角网格上。

## 为什么重要

2004 年之前，在网格上做"拖把手变形"主要靠两类方法：

- **自由变形（Free-Form Deformation）**：把模型嵌进一个外壳格子，扭格子带动模型。问题：局部细节会跟着拉伸糊掉
- **多分辨率方法（Multi-Resolution）**：先把模型简化，编辑粗版，再把细节往回贴。问题：层级构造慢、层级之间细节贴回常出 artifact

Sorkine 直接绕过"层级"，**用一个矩阵**把"细节"和"形状"绑在一起：拉普拉斯算子 L 同时记录两者。这个洞见让后面 20 年的几何处理几乎所有"形状变形 / 形状重建 / 形状描述"工作共享一套底层数学。

直接后继：

- **Poisson Mesh Editing（Yu 2004，同年同会议）**：思路类似，但用梯度场代替 delta 坐标
- **ARAP（As-Rigid-As-Possible，Sorkine-Alexa 2007）**：把"局部线性变换"换成"局部刚性旋转"，迭代解，效果更稳
- **Bounded Biharmonic Weights（Jacobson 2011）**：把 L 升级到 L²（biharmonic），用来定义平滑的骨骼绑定权重

工业落地：今天 **Houdini 的 Edit/Deform SOP**、**Blender 的 Laplacian Deform modifier**、**Maya 的几何工具**，本质都是这套 2004 数学的产品化。

## 核心要点

整个方法可以拆成 **三步**。

### 1. 把每个顶点改写成"和邻居的差值"

给一个三角网格，每个顶点 v_i 有一圈邻居 N(i)。拉普拉斯坐标定义为：

```
delta_i = v_i - sum_{j in N(i)} w_ij · v_j
```

权重 w_ij 用 **cotangent 权**（cot α + cot β）/ 2A，这是 Pinkall-Polthier 1993 标准化下来的几何离散，能近似连续的 Laplace-Beltrami 算子。

直觉：delta_i 是 3D 向量，**方向**指向"v_i 比邻居平均高 / 凹的那一侧"，**长度**正比于局部曲率。所以一片皱褶会有一组朝向各异、长度参差的 delta；一片平坦区域 delta 几乎为零。

把所有顶点写成矩阵：`L · V = Delta`，L 是 n×n 稀疏矩阵（每行只在邻居处非零），V 是 n×3 顶点坐标。

### 2. 编辑 = 解一个最小二乘方程

用户拖了某几个顶点（把手集合 C，目标位置 U）。我们想要新的顶点位置 V′，满足：

- 细节守恒：`L · V′` 尽量等于原来的 Delta
- 把手到位：V′ 在 C 上等于 U

写成最小二乘：

```
min || L · V′ - Delta ||² + || I_C · V′ - U ||²
```

这是一个稀疏线性系统。L 矩阵在编辑过程中**不变**，所以 Cholesky 分解一次，之后每次拖把手只解回代——交互式实时。

### 3. 关键 trick：让 delta 跟着旋转

直接用上面的方法有个**致命问题**：delta_i 是定义在原坐标系里的方向向量。如果你把把手转 90°，delta 还指原方向，结果整张脸的细节都被"撕"出来。

Sorkine 的精妙之处：**让每个顶点配一个隐式变换 T_i（旋转 + 各向同性缩放），并让 T_i 自己也线性依赖于 V′**。这样最终的方程仍是线性的：

```
min || L · V′ - T(V′) · Delta ||² + || I_C · V′ - U ||²
```

T_i 是 4 自由度（小角度旋转 3 + 均匀缩放 1）的线性近似。整个系统 O(n) 稀疏度，求解器一秒级。

## 实践案例

### 案例 1：拖一只兔子的耳朵

经典 Stanford Bunny 模型，钉住身体不动，拖耳朵尖：

- 没用 T：耳朵跟着走了，但耳根处的褶皱"撕开"，形成尖刺
- 用 T：耳朵自然转过去，毛皮纹理整张面跟着旋转，看起来像有骨骼

### 案例 2：和 ARAP 的关系

Sorkine 自己 3 年后做了 ARAP（As-Rigid-As-Possible）。ARAP 不再线性近似旋转，而是**显式求每个三角的最优刚性旋转 R_i**（SVD 求），交替迭代：

1. 固定 V′，求每个 R_i（局部）
2. 固定 R_i，解线性系统得 V′（全局）
3. 回到 1，迭代直到收敛

效果比 2004 线性版本更稳，尤其是大变形。但 2004 的精神（细节守恒 + 稀疏求解）一脉相承。

### 案例 3：在 Houdini 里的暴露面

Houdini 的 `Edit SOP` 选项里能直接选 "Laplacian" 软选择模式：你拖一个顶点，周围按拉普拉斯坐标守恒地变形。Blender 的 Laplacian Deform modifier 暴露 "anchors"（锚点）和 "iterations"（迭代次数），就是这套 2004 数学的 GUI 包装。

## 踩过的坑

1. **小角度近似只在小变形里成立**：T_i 是 1 阶泰勒展开，转 30° 还行，转 90° 已经会出现斜切（shear）失真。这是 ARAP 要替代它的根本原因
2. **细节方向 vs 全局方向**：如果不把 delta 跟着 T 转，编辑后细节会"留在原地"——一只羊背对你走，结果毛朝相反方向支起来
3. **各向同性缩放够用吗**：T_i 只允许整体放大/缩小同一倍数。如果模型某区域被拉得"长瘦"，各向同性缩放无法表达，会出现失真
4. **开放边界要加锚点**：网格边缘的顶点邻居不全，L 矩阵秩不够，必须额外钉至少一个非把手点否则系统欠定
5. **大网格求解时长**：Cholesky 分解 O(n^1.5) 起步，10 万顶点已要几秒；2010 年代之后才被 GPU 求解器和层级预条件提速

## 适用 vs 不适用场景

**适用**：

- 角色 / 道具的**软变形**（character posing 早期阶段，蒙皮辅助）
- 需要**保留高频细节**的形状编辑（皮肤褶皱、建筑装饰、文物数字化修复）
- 与传统 Free-Form Deformation 互补：把手少、要细节守恒的场景

**不适用**：

- 大角度刚性变形（弯 90° 以上）→ 用 ARAP
- 实时游戏角色蒙皮（要骨骼 + LBS / DQS） → Laplacian 太重
- 流体 / 布料 / 物理仿真（要时间步、能量守恒） → 用 PBD / FEM
- 拓扑变化（剪开、合并） → Laplacian 假设网格连通图固定

## 历史小故事（可跳过）

- **1993**：Pinkall-Polthier 在离散最小曲面工作里推导出 cotangent 权重，给离散拉普拉斯一个"正确"的几何含义
- **1999**：Desbrun 把它用到隐式平滑（[[desbrun-1999-implicit-fairing]]）
- **2003**：Alexa 在论文 "Differential Coordinates for Local Mesh Morphing and Deformation" 提出用 L·V 当形状描述子
- **2004**：Sorkine 把"形状描述子"升级成"可编辑变量"，加上隐式 T 的关键 trick，定义了 Laplacian Surface Editing
- **2007**：Sorkine + Alexa ARAP，把线性 T 换成迭代 SVD 旋转，工业级稳健
- **2011**：Jacobson 的 Bounded Biharmonic Weights 把 L² 用作绑定权，今天 Houdini / Maya 自动权重的底层

22 年过去，从 1993 cotangent 到 2025 GPU 加速求解器，**底层矩阵从未变过**。

## 学到什么

1. **"差值"比"绝对位置"更适合表达细节**：这是几何处理的核心直觉，和图像里"梯度比像素值更利于编辑"（Poisson Image Editing 同年）异曲同工
2. **把非线性藏进线性系统**：Sorkine 的 T 把"旋转"线性化是教科书级的 trick，让整个方法可解、可交互
3. **稀疏 + 预分解 = 交互式**：L 不变 → Cholesky 一次 → 回代极快。这是几何处理实时化的标准模板
4. **理论到工具的 20 年延迟**：1993 数学 → 2004 算法 → 2007 改进 → 2011 落地骨骼 → 2015 才进入 Blender 主线

## 延伸阅读

- 论文 PDF：[Laplacian Surface Editing](https://igl.ethz.ch/projects/Laplacian-mesh-processing/Laplacian-mesh-editing/laplacian-mesh-editing.pdf)
- Sorkine 课程笔记：[Differential Representations for Mesh Processing (Eurographics 2006)](https://igl.ethz.ch/projects/Laplacian-mesh-processing/diff-coords-eg06.pdf) —— 把整个家族讲清楚
- 后续 ARAP：[As-Rigid-As-Possible Surface Modeling (SGP 2007)](https://igl.ethz.ch/projects/ARAP/arap_web.pdf)

## 关联

- [[desbrun-1999-implicit-fairing]] —— 同一个 cotangent 拉普拉斯，先用于平滑后用于编辑
- [[garland-heckbert-1997-qem]] —— 网格简化里的"误差度量"，和 Laplacian 同属几何处理基础工具
- [[marching-cubes-1987]] —— 网格从哪儿来：体数据 → 三角网，再用 Laplacian 编辑

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[desbrun-1999-implicit-fairing]] —— Desbrun 1999 — 把热扩散方程隐式离散到三角网
- [[garland-heckbert-1997-qem]] —— QEM — 给三角网格『瘦身』时算每一刀的代价
- [[marching-cubes-1987]] —— Marching Cubes 1987 — 把体数据切成立方体查表生成三角网格

