---
title: Marching Cubes 1987 — 把体数据切成立方体查表生成三角网格
来源: 'William E. Lorensen, Harvey E. Cline, "Marching Cubes: A High Resolution 3D Surface Construction Algorithm", SIGGRAPH 1987'
日期: 2026-05-31
子分类: 渲染与图形
分类: 图形学
难度: 中级
---

## 是什么

**Marching Cubes** 是一个把"三维标量场"翻译成"三角网格"的算法。

日常类比：你有一块切片面包（CT 扫描就是一摞二维切片堆起来的三维数据），每一点有个密度值。你想把"骨头的外表面"提取成一张网，让 3D 显示器能画。Marching Cubes 的办法是：**把整块面包切成一个个小立方体，每个立方体的 8 个角根据"是骨头里还是骨头外"分成两类，于是有 2^8 = 256 种排列。每种排列对应固定几片三角形——查表就行**。

输入：一个 3D 体素阵列（比如 CT 的 512×512×300 个 Hounsfield Unit 值）+ 一个阈值（比如骨头是 600 HU）。
输出：一张三角网格（triangle soup），每个三角形顶点都恰好在"密度 = 600"的等值面上。

## 为什么重要

不理解 Marching Cubes，下面这些事都没法解释：

- 为什么医院的 3D 重建片子（CT/MRI 出的骨骼模型）能一秒出图——核心引擎就是它
- 为什么 Minecraft 的"平滑地形" mod、No Mans Sky 的星球生成、Astroneer 的地形挖掘都用同一套算法
- 为什么 NeRF / DeepSDF / 3D Gaussian Splatting 这些 2020 年代的隐式 3D 重建，最后一步往往还是 Marching Cubes ——它是"隐式表示 → 显式三角网格"的标准出口
- 为什么 1987 年的 SIGGRAPH 论文今天 Google Scholar 引用还在涨（已超过 2.7 万次）

## 核心要点

### 1. 256 个 case 是怎么来的

每个立方体有 8 个角（顶点）。每个角根据"标量值是否大于阈值"分成两类——0 或 1。八个 0/1 拼起来 = 8 比特 = 256 种排列。每种排列等值面穿过立方体的方式都不同，但**每种都是固定的几何**——可以事先画好、存成表。

### 2. 256 → 15 的对称压缩

256 case 里很多是等价的：

- **互补对称**（inside ↔ outside 翻转）：把 0 和 1 互换，等值面拓扑不变
- **旋转对称**（立方体的 24 种旋转）：转一下角度同一个 case

合并下来只剩 **15 个基本 case**。论文配图里那张 15 case 的图是图形学教材的经典插图。

### 3. 顶点不在角上而在棱上

如果三角形顶点直接放在立方体的角上，得到的网格会很"棱角分明"，不像真实曲面。论文的关键工程细节：**三角形顶点放在立方体的棱上**，通过线性插值找等值面穿过棱的具体位置。

举例：一条棱两端值是 400 和 800，阈值 600，那么顶点放在棱的中点；如果是 500 和 700，顶点偏向 700 那一端 1/2 处。

```
顶点位置 = p1 + (阈值 - v1) / (v2 - v1) × (p2 - p1)
```

这一步把"立方体精度"提升到"亚体素精度"，是网格平滑的关键。

### 4. 复杂度 O(N) 且天然并行

- 总立方体数 = (W-1) × (H-1) × (D-1)，每个处理是 O(1) 查表 + 最多 5 个三角形
- 立方体之间**完全独立**——可以无锁并行、可以 GPU compute shader 一次扫完
- 工业实现里 GPU 版本能在毫秒级处理百万体素

## 实践案例

### 案例 1 — CT 三维重建

医院给你做 CT，原始数据是几百张二维切片。放射科医生按 F3 一秒出三维骨骼图——这是 VTK / 3D Slicer 调用 Marching Cubes 的结果：

- 输入：512×512×300 体素，每个一个 Hounsfield Unit
- 阈值：600 HU（骨头）
- 输出：约 10 万到 100 万个三角形的网格
- 后处理：网格简化（Quadric Edge Collapse）→ OpenGL 渲染

### 案例 2 — Minecraft 平滑地形

Vanilla Minecraft 是体素方块的世界。但如果你把每个方块的"地形密度值"用 Perlin noise 算出来，再用 Marching Cubes 提取等值面，就得到 No Mans Sky 那种平滑山脉：

- 每个方块的"密度"由 3D Perlin noise 决定
- 阈值 0.0 就是地表
- Marching Cubes 把这个连续场转成可走可挖的三角网格

### 案例 3 — NeRF mesh 提取

2020 年代 NeRF 输出的是隐式神经场。要把它接到 Unity / Blender 必须转成网格——`mcubes.marching_cubes(density_grid, threshold)` 就是 Python 一行代码：

- NeRF 在 256³ 网格上采样 density
- Marching Cubes 提取等值面
- 得到的网格送传统渲染管线

## 踩过的坑

1. **拓扑歧义** —— 6 个 case 有两种合理的三角化（鞍点情况）。如果相邻立方体选不一样的版本，网格会出现裂缝。论文原版没解决，1991 Nielson-Hamann 用 asymptotic decider 修，1994 Chernyaev 给出修正后的 33-case 表。生产代码（VTK）默认开 asymptotic decider。

2. **尖锐特征丢失** —— 因为顶点在棱上线性插值，立方体内部的"角"和"边"会被平滑掉。CAD 模型的方块角会变成圆角。要保留尖锐特征用 Dual Contouring（2002）替代。

3. **对噪声极敏感** —— CT 噪声直接生成毛刺三角形。生产里要先做 3D 高斯平滑或中值滤波。

4. **三角形数量爆炸** —— 一个 256³ 体素能轻松产生 100 万个三角形，远超实时渲染需要。必须配网格简化算法（Quadric Edge Collapse、Mesh Decimation）。

5. **GE 专利封锁了 18 年** —— 1987 年 GE 申请了美国专利 4,710,876，到 2005 年才到期。中间这段时间开源软件（如老版 VTK）只敢用绕开专利的 Marching Tetrahedra（先把立方体切成四面体），三角形数量更多但合法。

## 适用 vs 不适用场景

**适用**：

- 规则体素网格 + 平滑等值面（医学影像、流体模拟、电子密度）
- 需要标准三角网格输出（喂给 OpenGL / Vulkan / Unity / Blender）
- GPU 实时提取（compute shader 200 行写完）
- 教学和原型（CPU 版核心代码 200 行）

**不适用**：

- 需要保留尖锐特征 → Dual Contouring (Ju et al. 2002)
- 非规则采样数据（四面体网格、点云）→ Marching Tetrahedra 或泊松重建
- 极致精度的等值面（拓扑严格正确）→ 33-case 修正表 + asymptotic decider
- 对网格三角形数量极敏感 → Surface Nets (Gibson 1998) 更平滑、更少三角形

## 历史小故事（可跳过）

- **1973** Wyvill 兄弟提出 implicit surfaces 数学基础
- **1987** Lorensen 和 Cline 在 GE 实验室造了 Marching Cubes，发表于 SIGGRAPH —— 6 页论文
- **1988** GE 拿到美国专利 4,710,876，封锁开源使用 18 年
- **1991** Nielson-Hamann 提出 asymptotic decider 解决拓扑歧义
- **1994** Chernyaev 给出 33-case 修正表
- **1998** VTK 把它做成工业标准（医学可视化默认管线）
- **2002** Ju et al. 提出 Dual Contouring 保留尖锐特征
- **2005** GE 专利到期，Marching Cubes 进入完全自由使用
- **2020s** NeRF / DeepSDF / 3D Gaussian Splatting 把它当作"隐式 → 显式"标准出口

## 学到什么

1. **离散化 + 查表 = 连续问题的工程化** —— 把"任意等值面"约简成"256 个固定 case"，是把无限可能压缩成有限组合的经典套路
2. **对称是表的减负武器** —— 256 → 15 靠的是几何对称性的识别，类似密码学里的 S-box 设计
3. **亚体素精度靠插值** —— 顶点放在棱上而不在角上是质的飞跃，让低分辨率体数据也能出平滑曲面
4. **专利可以扼杀算法 20 年** —— 提醒图形学和系统软件领域的专利风险，今天 H.265 / GPU 架构仍在重演
5. **简单算法的生命力来自三个东西** —— 简单（200 行）+ 通用（任何 scalar field）+ 硬件友好（完美并行）

## 延伸阅读

- 论文 PDF：[Lorensen-Cline 1987 — Marching Cubes (ACM)](https://dl.acm.org/doi/10.1145/37402.37422)
- 教科书：Schroeder, Martin, Lorensen, "The Visualization Toolkit", 第 6 章
- 历史回顾：[Lorensen, "Marching Cubes: A High Resolution 3D Surface Construction Algorithm", IEEE CG&A 30 周年回顾](https://ieeexplore.ieee.org/document/5523065)
- 实践教程：[Sebastian Lague — Coding Adventure: Marching Cubes (YouTube)](https://www.youtube.com/watch?v=M3iI2l0ltbE) 30 分钟从零写一个
- Python 代码：[PyMCubes](https://github.com/pmneila/PyMCubes) 工业级 NumPy 实现

## 关联

- [[whitted-1980]] —— 同期图形学经典；Whitted 走光线追踪路线，Marching Cubes 走显式网格路线
- [[goral-1984-radiosity]] —— 同时代图形学，专注光照而非几何提取
- [[3d-gaussian-splatting]] —— 现代隐式 3D 重建；Gaussians 最后转 mesh 仍可用 Marching Cubes
- [[disney-brdf-2012]] —— 把 Marching Cubes 提取的网格作为输入做物理渲染
- [[cohen-1985-hemicube]] —— 同期图形学硬件化思路；hemicube 用 z-buffer 算积分，Marching Cubes 用查表算几何

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[3d-gaussian-splatting]] —— 3D Gaussian Splatting — 用一堆 3D 模糊光斑重建场景
- [[cohen-1985-hemicube]] —— Cohen-Greenberg 1985 Hemicube — 把渲染硬件挪去算辐射度积分
- [[curless-levoy-1996-tsdf]] —— Curless-Levoy TSDF — 把多次扫描融成一个干净的 3D 模型
- [[desbrun-1999-implicit-fairing]] —— Desbrun 1999 — 把热扩散方程隐式离散到三角网
- [[disney-brdf-2012]] —— Disney Principled BRDF 2012 — 11 个滑块封装 Cook-Torrance 全家桶
- [[goral-1984-radiosity]] —— Goral 1984 Radiosity — 把建筑工程的辐射热传导算法搬进图形学
- [[sorkine-2004-laplacian-editing]] —— Sorkine 2004 — 用拉普拉斯坐标编辑网格，拽把手不丢细节
- [[taubin-1995-mesh-smoothing]] —— Taubin 1995 — 把网格平滑当成低通滤波
- [[whitted-1980]] —— Whitted 1980 — 让光线在场景里递归跑三种次级射线

