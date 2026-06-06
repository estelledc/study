---
title: MPM — 让粒子背着自己的历史，借网格算一遍力
来源: Sulsky, Chen, Schreyer, "A Particle Method for History-Dependent Materials", Computer Methods in Applied Mechanics and Engineering, 1994
日期: 2026-05-31
子分类: 渲染与图形
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

Material Point Method（**MPM**）是一种把材料拆成**一群粒子 + 一张临时网格**两套表达的仿真方法。粒子负责"我是谁"（质量、速度、应力、变形历史），网格负责"我怎么动"（解牛顿第二定律）。每一步把粒子状态摊到网格上算一遍力，再把结果抄回粒子，网格就扔掉重铺。

日常类比：一群蚂蚁（粒子）背着各自的小本子（应力/历史）在地上爬。每过一刻，地面临时铺一张方格纸（网格），蚂蚁把速度抄到最近格子上，纸上算一遍 F=ma 得到新速度，蚂蚁再抄回小本子，纸撕掉。下一刻重新铺一张干净的。

这套"粒子记历史 + 网格算力学"的混合表达，是后来雪、沙、泥、果冻、橡皮泥这些**大变形材料**能在电影里飞起来的根本原因。

## 为什么重要

不理解 MPM，下面这些事都没法解释：

- 为什么 Disney《冰雪奇缘》(2013) 的雪会一坨坨堆起来又被踩散——纯网格法做不到，纯有限元会把网格扭爆
- 为什么 Houdini 里 FLIP / MPM / Vellum 节点几乎是大变形仿真的工业默认
- 为什么 Taichi / DiffTaichi 能让本科生在一个周末跑出一段橡皮泥仿真——MLS-MPM 把这套搬进了几百行 Python
- 为什么岩土工程里算边坡滑塌、混凝土破坏，用的也是同一套数学

一句话：**MPM 是"网格法处理不了大变形、有限元处理不了拓扑变化"这个老问题的混合解**。

## 核心要点

MPM 的一个时间步可以拆成 **四步循环**：

1. **P2G（particle to grid）**：每个粒子把自己的质量、动量按形函数权重撒到周围 8 个（3D）或 4 个（2D）网格点。类比：蚂蚁把"我有多重、往哪走"抄到最近几张格子上。

2. **网格上解动量方程**：在网格点上算力（弹性力 / 重力 / 接触力）→ 加速度 → 速度更新。这一步形式上和有限元几乎一模一样。

3. **G2P（grid to particle）**：把网格点更新后的速度插回粒子，更新粒子的位置和"变形梯度"（一个 3×3 矩阵，记着这块材料从初始构形被拉/压/剪了多少）。

4. **扔网格**：背景网格用完即弃，下一步**重新铺一张干净的**。

整个循环里，**只有粒子是持久的**，网格是临时脚手架。这就是为什么任意大变形都不会让网格扭成麻花——它根本没机会变形。

## 实践案例

### 案例 1：为什么《冰雪奇缘》用 MPM 而不是有限元

Disney 团队（Stomakhin et al, SIGGRAPH 2013）做雪时面对两难：

- **纯网格法**（如 Stable Fluids）：拓扑变化容易，但雪的"我被压实过、有塑性历史"跟不住——网格点不属于哪一块雪
- **纯有限元**：弹塑性本构很成熟，但脚踩进雪里、雪块碎裂这些**网格连通性变化**的事，会让 FEM 网格瞬间扭爆

MPM 把两边好处缝起来：粒子带塑性历史（每个雪粒子记着"我已经被压实到 0.7 倍体积了"），网格只用来一步计算就扔，所以**踩、推、铲、撒**都自然支持。

### 案例 2：和 Stable Fluids 的分工

- Stam 1999 [[stam-1999-stable-fluids]] 解的是**流体**——纯欧拉网格 + 半 Lagrangian advection，没有"材料历史"概念
- Sulsky 1994 解的是**有历史的固体/粘塑性体**——必须把历史绑在粒子上跟着走
- 两者都是 SIGGRAPH 时代的物理仿真奠基，但分管不同物质类别

### 案例 3：Taichi / MLS-MPM 让门槛塌方

Yuanming Hu 2018 提出 **MLS-MPM**（移动最小二乘 MPM），用一种数学技巧把 P2G/G2P 简化、加速 2 倍。配合他做的 Taichi 语言：

```python
# 伪代码：一个粒子的更新（极简）
for p in particles:
    affine = stress + mass * C  # C 是 affine 速度场
    for offset in 3x3 grid neighbors:
        grid_v[base + offset] += weight * (mass * v + affine @ dpos)
# 网格解动量
# G2P 反向插值更新 p.v 和 p.x
```

几百行 Python 就能跑出一段果冻颤抖。这是 1994 年的论文给 2026 年的本科生留的礼物。

### 案例 4：可微仿真把 MPM 拉进 ML

DiffMPM / ChainQueen / DiffTaichi 把整套 MPM 写成可微（每一步是可导的张量运算），于是可以用梯度下降反推**初始条件**或**材料参数**：给一段目标动画，反求"这块橡皮泥的弹性系数应该是多少"。这是 2018 年之后机器人控制和材料反演领域的一条新支线。

## 关键事实

- **粒子持久、网格临时**——这是 MPM 区别于纯有限元（网格随物体）和纯 Eulerian（网格固定、物质流过）的关键
- **变形梯度 F**——每个粒子带的 3×3 矩阵，记初始构形到当前的形变；本构方程从 F 计算应力
- **形函数选择**——线性 / quadratic B-spline / cubic B-spline，决定每个粒子影响多少网格邻居（8 / 27 / 64）
- **PIC / FLIP / APIC**——三种 G2P 策略，能量耗散 vs 噪声 vs 两者兼修

## 踩过的坑

1. **PIC vs FLIP 的能量取舍**：原始 PIC 在 G2P 时直接覆盖粒子速度，能量耗散严重（果冻像泥）；FLIP（Brackbill 1986）改成"只传速度增量"，能量保得住但噪声大（果冻像在沸腾）。**APIC**（Jiang 2015）才把两边都修了。

2. **Cell-crossing 抖动**：粒子穿过网格线时，线性形函数会让力突然跳变，材料看起来在抖。**用 quadratic / cubic B-spline 形函数**可以缓解（代价是邻居从 8 个变 27 个或 64 个）。

3. **不天然守恒**：MPM 在动量、能量上**不严格守恒**，工程实践里要小心长时间漂移。学术界对这个有持续改进（Affine MPM、Hamiltonian MPM 等）。

4. **CFL 还是要遵守**：MPM 不像 Stable Fluids 那样"无条件稳定"——时间步太大依然会爆。粗略上 dt 受网格尺寸 / 波速限制。

5. **网格尺寸是隐参数**：网格太粗，细节糊；太密，慢且粒子不够会出现"空格"现象。一般要求**每个网格至少装 2×2×2 个粒子**。

## 适用 vs 不适用场景

**适用**：

- 大变形固体——雪、沙、泥、橡皮泥、布丁、肉
- 弹塑性、粘塑性、相变（融化/冻结）等"有历史"的本构
- 接触、自接触、碎裂这种**拓扑变化**场景
- 工程：边坡滑塌、冲击侵彻、混凝土破坏、岩土

**不适用**：

- 单纯流体（纯液体/烟雾）——Stable Fluids 系或 FLIP 流体更轻
- 极薄壳、布料、绳索——形状各向异性极强，MPM 网格分辨率会浪费
- 严格守恒要求——首选有限元 + 隐式积分
- 实时游戏的精细交互——MPM 计算量较大，工业落地多在离线渲染

## 历史小故事（可跳过）

- **1955**：Harlow 在 Los Alamos 发明 PIC（particle-in-cell），给等离子体和流体用
- **1986**：Brackbill 提出 FLIP，PIC 的能量友好版
- **1994**：Sulsky / Chen / Schreyer 在固体力学界把 PIC/FLIP 改造，加入应力张量和变形历史，定名 **Material Point Method**——这是本文论文
- **1995**：同组后续论文 Sulsky/Zhou/Schreyer 把算法和理论更细化
- **2013**：Stomakhin 等在 SIGGRAPH 做出冰雪奇缘的雪，MPM 在图形学一夜爆红
- **2015**：Jiang 等提出 APIC，修了 PIC/FLIP 的能量/噪声两难
- **2018**：Hu 等提出 MLS-MPM 和 Taichi 语言，把工程实现门槛拉低到本科生

固体力学界小众算法被图形学发掘、然后被可微仿真界二次发掘，是一个跨学科典型案例。

## 学到什么

1. **混合表达比单一表达强**：粒子记身份、网格算力学，各自做擅长的事，合起来比纯网格 / 纯粒子都好
2. **临时数据结构是个被低估的设计模式**：网格"用完即弃"听起来浪费，实际上**根本性地避开了网格扭曲问题**
3. **学科迁移的机会**：1994 年固体力学的论文，1999 年图形学的 Stable Fluids，2013 年才在 Frozen 里合流——好想法跨学科漂流要 20 年
4. **数值方法的工程化**：从 1994 论文到 2018 Taichi，是 24 年逐步把"有 N 个超参要调"压缩到"几行 Python 就能跑"的工业演化路径

## 延伸阅读

- 论文 PDF：[Sulsky, Chen, Schreyer 1994](https://www.sciencedirect.com/science/article/pii/0045782594901120)
- Disney 雪：[Stomakhin et al, A material point method for snow simulation, SIGGRAPH 2013](https://www.math.ucla.edu/~jteran/papers/SSCTS13.pdf)
- 教程视频 + 课件：[The Material Point Method for Simulating Continuum Materials, SIGGRAPH 2016 Course](https://www.math.ucla.edu/~cffjiang/research/mpmcourse/mpmcourse.pdf)
- 现代实现：[Taichi MLS-MPM 88 行版本](https://github.com/yuanming-hu/taichi_mpm)
- [[stam-1999-stable-fluids]] —— 同时代的流体仿真奠基，分管纯流体
- [[kajiya-1986-rendering-equation]] —— 同时代的图形学奠基，分管渲染方程

## 关联

- [[stam-1999-stable-fluids]] —— 流体走纯网格 + 半 Lagrangian；MPM 走粒子 + 网格混合
- [[kajiya-1986-rendering-equation]] —— 渲染方程管"光怎么走"，MPM 管"物质怎么动"
- [[disney-brdf-2012]] —— Disney 工业 pipeline 的另一环；Frozen 同期工作

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[disney-brdf-2012]] —— Disney Principled BRDF 2012 — 11 个滑块封装 Cook-Torrance 全家桶
- [[hu-2018-mls-mpm]] —— MLS-MPM — 把 MPM 重写到"几百行能跑实时"的现代版本
- [[kajiya-1986-rendering-equation]] —— Kajiya 渲染方程 — 把所有渲染算法统一成一个积分方程

