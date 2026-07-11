---
title: Desbrun 1999 — 把热扩散方程隐式离散到三角网
来源: Mathieu Desbrun, Mark Meyer, Peter Schröder, Alan H. Barr, "Implicit Fairing of Irregular Meshes using Diffusion and Curvature Flow", SIGGRAPH 1999
日期: 2026-05-31
分类: 图形学
难度: 中级
---

## 是什么

Desbrun 1999 把"让 3D 网格变光滑"这件事**重新写成一个偏微分方程**：网格顶点位置随时间扩散，扩散方程长这样：

```
dX/dt = lambda · L · X
```

其中 L 是离散拉普拉斯算子。这就是物理课的**热方程**——一块铁板局部发烫，热量自己往周围扩散，凸出来的尖刺被抹平。

它的两个关键贡献：

- **用隐式时间积分（implicit Euler）解扩散**：解一次稀疏线性方程，等价于走"任意大"的时间步，无条件稳定
- **把 cotangent 权重确立为标准**：`w_ij = (cot α_ij + cot β_ij) / 2A`，这条公式至今是几何处理（Symposium on Geometry Processing）的必背式

日常类比：Taubin 1995 像每秒走一小步去远处，每步都得小心别迈太大；Desbrun 1999 像直接预言"一秒后我会在哪儿"然后一次性挪过去——稳，快，但每步要解一个方程组。

## 为什么重要

在它之前，网格平滑用的是 Taubin 1995 的**显式** λ|μ 双步法。问题是：

- 显式法步长被拉普拉斯矩阵的最大特征值卡住，迈大了就炸
- 噪声大的网格要平滑很多次，慢
- cotangent 权重虽然 Pinkall-Polthier 1993 已提，但没成共识

Desbrun 用隐式法一次性解决"步长受限"，并且把 cotangent 公式系统化推广到曲率流——平滑后整体形状保留远好于等权拉普拉斯。

之后 25 年，**几乎所有三角网几何处理算法都用同一个矩阵**：mesh editing（ARAP）、参数化（LSCM）、形状描述子（Heat Kernel Signature）、谱方法（Laplacian eigenmaps）……都从这里发芽。图神经网络的图拉普拉斯也是远房亲戚（更粗，用组合 Laplacian）。

## 核心要点

### 1. 把平滑写成扩散 PDE

把 x、y、z 三个坐标分别看作定义在网格顶点上的标量场。扩散方程是：

```
∂X/∂t = lambda · L · X
```

L 在连续曲面上是 Laplace-Beltrami 算子；在离散三角网上需要一个对应的矩阵。

### 2. 显式 vs 隐式时间步

把时间离散化为 dt 一步一步走：

- **显式 Euler**：`X^{n+1} = X^n + dt · lambda · L · X^n` —— Taubin 走的就是这条路。dt 必须 < 2 / (lambda · k_max)，否则发散
- **隐式 Euler**：`X^{n+1} = X^n + dt · lambda · L · X^{n+1}` —— 把"未来"的 L·X 放在右边。整理得：

```
(I − dt · lambda · L) · X^{n+1} = X^n
```

每一步要解一个稀疏线性方程组。好处：**对任意大的 dt 都稳定**，一步顶显式法几十步。

### 3. cotangent Laplacian（核心公式）

每条边 (i,j) 的权重等于"它在两个相邻三角形里所对的两个角"的 cotangent 之和，再除以面积归一：

```
w_ij = (cot α_ij + cot β_ij) / (2 · A_i)
```

为什么是 cotangent 而不是别的：因为只有这样，离散 L·X 在三角网细化时**才收敛到连续曲面的 Laplace-Beltrami 算子**。等权拉普拉斯不行——同一几何换一种三角化，结果就漂。

### 4. 曲率流（curvature flow）

更精细的版本：让顶点不沿坐标方向扩散，而是**只沿法向移动**，移动量正比于平均曲率 H：

```
∂X/∂t = −lambda · H · n
```

效果：保留切向几何特征，只压凸压凹。圆球依旧是圆球，立方体的角不会被横向拖动。

### 5. 体积保持

低通滤波天然让形状缩小（Taubin 那一节也提过）。Desbrun 的处理简单粗暴：每步平滑后**整体放缩**回原体积。配合曲率流，最终形状在视觉上几乎不缩。

## 实践案例

### 案例 1：libigl 里的样子

```python
# libigl 风格伪代码
import igl
L = igl.cotmatrix(V, F)              # cotangent Laplacian
M = igl.massmatrix(V, F, igl.MASSMATRIX_TYPE_VORONOI)
# 隐式一步: (M - dt * lambda * L) X = M * X_old
A = M - dt * lam * L
V_new = scipy.sparse.linalg.spsolve(A, M @ V)
```

Cholesky 分解一次可缓存，后续多步重复使用同一个 A。

### 案例 2：参数大致经验

- dt 取 0.001 ~ 0.1 视网格尺度而定
- 1 ~ 5 步足够去掉肉眼可见高频
- 钝角三角形多的网格（cotangent 会变负），先用 remesh 或 intrinsic Delaunay 翻边修正

### 案例 3：和 Taubin 1995 的对比

| 维度 | Taubin 1995 | Desbrun 1999 |
|------|-------------|--------------|
| 时间积分 | 显式 λ\|μ 两步 | 隐式 Euler 一步 |
| 步长 | 受 k_max 限制 | 任意大 |
| 矩阵权重 | 等权 / Fujiwara | cotangent（成为标准） |
| 形状保持 | 频域调 λ\|μ | 曲率流 + 体积 rescale |
| 求解 | 矩阵向量乘 | 解稀疏线性系统 |

二者解决的是**同一个问题**，但 Desbrun 把数值 PDE 工具搬进图形学，奠定了之后所有"谱视角 + 矩阵视角"的几何处理路线。

## 踩过的坑

1. **cotangent 在钝角处变负**：钝角三角形的 cot 是负的，权重可能让矩阵不再 M-matrix，平滑反而把顶点推到错位置。修法：intrinsic Delaunay 翻边、或用 mixed Voronoi area（Meyer 2003 改进版）

2. **依然会收缩**：cotangent 也是低通，体积只能事后 rescale，不能像 Taubin λ|μ 那样在频域里精准保零频。两条路线各有取舍

3. **稀疏求解非小事**：> 10 万顶点时直接 LU 内存爆炸；要用 Cholesky 缓存分解，或共轭梯度 + 预条件子。这是图形学论文常常一笔带过、但工程实现的真正难点

4. **只对三角网定义**：四边形或多边形网格要先三角化，或者用更晚出现的 polyhedral Laplacian（Alexa-Wardetzky 2011）

## 适用 vs 不适用场景

**适用**：

- 3D 扫描后处理（噪声大、想跨大步、对收缩不敏感）
- 几何处理 pipeline 的预处理步骤——光滑后曲率估计才稳
- 任何需要"离散 Laplace-Beltrami 矩阵"的下游算法（参数化 / 形变 / 谱描述子）

**不适用**：

- CAD 工业模型，需要严格保留尖锐特征 → 用 bilateral / L0
- 三角形质量极差的扫描（钝角多）→ 先 remesh
- 实时交互（每步要解线性系统，对万级以上顶点未必跟得上 60fps）

## 历史小故事（可跳过）

- **1968**：Mac Neal 在结构力学有限元文献里第一次写下 cotangent 公式
- **1993**：Pinkall 与 Polthier 把 cotangent 引入计算机图形学的离散微分几何
- **1995**：Taubin 的信号处理视角 + 显式 λ|μ，但用的还是等权
- **1999**：Desbrun + Meyer + Schröder + Barr（CalTech）把隐式时间步 + 曲率流 + cotangent 标准化在一篇 SIGGRAPH 里讲透
- **2003**：同组的 Meyer-Desbrun-Schröder-Barr 进一步给出 Voronoi-area 归一的离散微分算子（曲率、法向、面积）一整套
- **2008 之后**：Heat Kernel Signature、Spectral 形状对应、ARAP、LSCM…… 全都建在 cotangent Laplacian 上

## 学到什么

1. **隐式时间步打破稳定性约束**——这是数值 PDE 的老把戏，搬到图形学就是降维打击
2. **离散算子要对应连续算子**：cotangent 是唯一能让 L·X 收敛到 Laplace-Beltrami 的权重，等权不行
3. **几何处理与数值 PDE 是同一件事**：网格平滑、参数化、形变都是带边界条件的偏微分方程
4. **基础矩阵的力量**：找对一个矩阵（cotangent L），整个领域 25 年的工作都建在它上

## 延伸阅读

- 论文 PDF：[Desbrun 1999 SIGGRAPH](https://multires.caltech.edu/pubs/ImplicitFairing.pdf)
- 现代讲义：[Keenan Crane — Discrete Differential Geometry: An Applied Introduction](https://www.cs.cmu.edu/~kmcrane/Projects/DDG/)
- 工程参考：libigl 的 [igl::cotmatrix](https://libigl.github.io/)
- [[taubin-1995-mesh-smoothing]] —— 显式 λ\|μ 前驱，同一问题不同解法
- [[loop-1987-subdivision]] —— 三角网细分，和平滑互为反向操作
- [[graph-neural-networks]] —— 图拉普拉斯远亲，理论根基相通

## 关联

- [[taubin-1995-mesh-smoothing]] —— 同一问题，显式时间步路线
- [[marching-cubes-1987]] —— 体素抽出的粗糙网格是常见输入
- [[loop-1987-subdivision]] —— 加密网格后常配合一次平滑
- [[graph-neural-networks]] —— 图卷积的频域定义和这里的离散 Laplacian 同根

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[baraff-witkin-1998-cloth]] —— Baraff-Witkin 1998 — 让布料模拟敢走大时间步
- [[sorkine-2004-laplacian-editing]] —— Sorkine 2004 — 用拉普拉斯坐标编辑网格，拽把手不丢细节
- [[taubin-1995-mesh-smoothing]] —— Taubin 1995 — 把网格平滑当成低通滤波
