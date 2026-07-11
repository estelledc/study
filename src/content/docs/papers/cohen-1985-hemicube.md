---
title: Cohen-Greenberg 1985 Hemicube — 把渲染硬件挪去算辐射度积分
来源: 'Michael F. Cohen, Donald P. Greenberg, "The Hemi-cube: A Radiosity Solution for Complex Environments", SIGGRAPH 1985'
日期: 2026-05-31
分类: 图形学
难度: 进阶
---

## 是什么

**Hemicube**(半立方体)是一种**用图形硬件的 z-buffer 来算 form factor**的办法。

日常类比:你想知道一盏灯照到墙上的多少能量会被反射到沙发上。硬算这个比例要做双重积分,慢得离谱。Cohen 说,**把一台相机放在墙的中心,对房间拍 5 张照片**(顶 + 4 侧)。数一数照片里"沙发占了几个像素",再查一张预先算好的表加权求和——就得到答案。

这台相机就是 hemicube。

它解决了 [[goral-1984-radiosity]] 留下的最大工程瓶颈:n 个表面有 n 平方个 form factor,每个都要算双重积分加可见性判定,n=1000 时已经跑不动。Hemicube 把这件事**外包给 z-buffer 硬件**——而 z-buffer 1985 年已经是 SGI、Evans & Sutherland 工作站的标配,本来是为了实时渲染设计的。

**这是历史上把图形硬件当通用计算单元用的最早范例之一**,比 GPGPU 这个词诞生早 20 年。

## 为什么重要

不理解 hemicube,下面这些事讲不通:

- 为什么 radiosity 在 1985-1995 突然从学术玩具变成建筑可视化的工业标配——是 hemicube 把它工程化了
- 为什么"把渲染硬件挪去做几何积分计算"这个思路在今天的 lightmap baking、shadow mapping、虚拟纹理里到处都是——源头在这
- 为什么 Cohen 这个名字后来 1988 还出现在 progressive radiosity 论文里——他把 hemicube 嵌入迭代框架,边算边显示
- 为什么图形学和通用并行计算在 2000 年代会合流——1985 年这篇论文已经埋下种子

## 核心要点

### 1. 关键洞见 — 渲染硬件 ≠ 只能渲染

1985 年的 SGI 工作站有 z-buffer 硬件。它本来的用途是:输入一堆三角形,输出一张图,深度测试自动解决遮挡。

Cohen 看到了**另一种用法**:把它当成"几何积分加速器"。

- 输入还是三角形(场景里其他所有 patch)
- 输出不是图,而是**每个像素被哪个 patch 覆盖**
- z-buffer 自动解决可见性 V_ij(被挡住的像素自然不会写到缓冲)

这一步的本质,是把"算 form factor"翻译成"用 z-buffer 渲染一次场景"。**问题不变,工具换了**。

### 2. 为什么是 hemicube 不是半球

理论上每个 patch 看出去的是一个**半球**(180° 立体角)。在半球上做投影积分最自然——这叫 Nusselt 类比(1928 年的工程结论):**form factor 等于光在该 patch 上方半球的投影面积比例**。

但 1985 年的硬件**只能投影到平面**(光栅化只懂三角形和平面)。Cohen 的妥协:**用 5 个平面去近似半球**——顶面 1 个,侧面 4 个,组成一个半立方体。

5 个面而不是 6 个:patch 自己处于半立方体底部,只关心朝上的半球。

每个面分辨率比如 50×50 像素,5 个面合计 12500 像素——每个像素是一份"采样"。

### 3. Delta form factor 表(关键工程优化)

每个像素对 form factor 的贡献只跟**它在 hemicube 上的几何位置**有关,跟场景内容无关。所以可以**预先算好一张表**:

```
顶面像素 (x, y):  Δ_F = (1 / π) · 1 / (x² + y² + 1)² · ΔA
侧面像素 (x, z):  Δ_F = (1 / π) · z / (x² + z² + 1)² · ΔA
```

不用记公式,记三件事:

- 表只算一次,所有 patch 复用
- 算 F_ij 的步骤变成"扫一遍像素,只要这个像素属于 patch j 就加上对应 Δ_F"
- 加法和查表——**完全是流水线友好的硬件操作**

### 4. 复杂度对比

| 阶段 | 原始 Goral 1984 | Cohen 1985 hemicube |
|------|----------------|---------------------|
| 单个 form factor | 双重积分 + 显式可见性 | 一次硬件渲染 + 像素扫描 |
| n 个 patch 总开销 | n^2 次双重积分 | n 次 hemicube,每次扫像素 |
| 实测 n 上限 | 几百 | 一万以上 |

工程化的标志:radiosity 从此能跑真实的房间(不只是 Cornell box)。

## 实践案例

### 案例 1 — Cornell 渲染的复杂场景

论文配图:一个开放式办公区,几十张桌椅、隔板、灯具,patch 总数大概 8000。

Goral 1984 的解析积分版根本跑不出来。hemicube 版在 SGI 工作站上跑了几个小时,得到了带 color bleeding 的全局漫反射光照。**第一次让人看到 radiosity 不是只能算 5 个立方体的方法**。

### 案例 2 — 现代 shadow mapping 的近亲

今天游戏引擎里的 shadow mapping 是这样做的:

- 从光源视角渲染场景一次,得到深度图
- 主渲染时每个像素查这张深度图,判断自己是否被挡住

精神上和 hemicube 一模一样:**把硬件渲染当成空间查询的回答**。Cohen 1985 是这个思路最早一次写在 SIGGRAPH 论文上。

### 案例 3 — Lightmap baking 流水线

Unity / Unreal 里的烘焙光照:

- 离线阶段对每个 lightmap texel 算环境光照
- 内部用类似 hemicube 的"立方体采样"或现代 path tracing
- 结果存成纹理贴图,运行时直接读

只是把硬件从 1985 的 z-buffer 换成了 2025 的 RT core,**思路完全继承**。

## 踩过的坑

1. **走样问题** — hemicube 分辨率有限,小 patch 在远处可能不占满一个像素就被舍入掉。论文用更高分辨率部分缓解,但永远不可能完全解决。后续工作(jittered hemicube、stochastic ray casting)针对这点。

2. **分辨率折中** — 像素少则不准,像素多则慢。论文实测 50×50 到 100×100 的侧面分辨率最实用。

3. **仍是 O(n) 次硬件渲染** — 比 Goral 的 O(n²) 好很多,但 n 极大时硬件吞吐仍是瓶颈。后续 progressive radiosity (Cohen 1988) 用"先算贡献最大的几个 patch"减轻这点。

4. **继承 radiosity 全部局限** — 仍然只能漫反射、静态场景、网格依赖。hemicube 解决的是工程瓶颈,不是理论局限。

## 适用 vs 不适用场景

**适用**:

- 1985-1995 年代 radiosity 工程化的标准技术
- 任何"用图形硬件加速几何积分"的场景(精神延续)
- 教学:解释 GPGPU 思路的起源

**不适用**:

- 镜面反射、折射、焦散——和 Goral 一样,只能漫反射
- 现代 path tracing 流水线——已用 RT core / Monte Carlo 取代
- 极小 patch 的精确积分——走样问题难解

## 历史小故事(可跳过)

- **1928** Nusselt 在工程热传导里证明 form factor 等于半球投影面积比例(Nusselt 类比),为 hemicube 数学基础
- **1984** Goral 把 radiosity 从工程学搬进图形学,但 form factor 算法不实用
- **1985** Cohen-Greenberg 提出 hemicube,本文。Cornell PCG 配 SGI 工作站,几小时算出复杂办公场景
- **1986** Kajiya rendering equation 统一 ray tracing 和 radiosity,但 hemicube 仍是漫反射部分的主力
- **1988** Cohen 提出 progressive radiosity,hemicube 嵌入迭代框架,边算边显示
- **1990s** 建筑可视化、博物馆漫游产业大量采用 radiosity + hemicube
- **2000s** GPGPU 兴起,Mark Harris 等人正式提出"把 GPU 当通用计算"——hemicube 的思路被理论化、推广化
- **2010s** 现代 GPU compute shader、CUDA 把这个想法做到极致

## 学到什么

1. **专用硬件 ≠ 只能做专用任务** —— 看出 z-buffer 解决的"可见性"问题和 form factor 计算结构同构,是关键洞见
2. **预计算表是几何积分的好朋友** —— delta form factor 表只算一次,所有 patch 复用,本质是把"计算"换成"查表"
3. **工程瓶颈推动算法革新** —— Goral 的理论 1984 完成,但要等 hemicube 的工程突破才能产业化
4. **分辨率折中是数值方法的永恒主题** —— hemicube 的像素数选择和 Monte Carlo 的样本数选择本质同构
5. **思想会跨年代复用** —— 1985 的 hemicube → 2000s GPGPU → 现代 RT core,核心思路一脉相承

## 延伸阅读

- 论文 PDF:[Cohen & Greenberg 1985 — The Hemi-cube](https://dl.acm.org/doi/10.1145/325165.325171)
- Cornell PCG 历史页:[The Hemicube Algorithm](https://www.graphics.cornell.edu/online/research.html)
- 教科书:Cohen & Wallace, "Radiosity and Realistic Image Synthesis", 1993,第 4 章 hemicube 详解
- [[goral-1984-radiosity]] —— 前身论文,定义了 form factor 是什么
- [[kajiya-1986-rendering-equation]] —— 次年统一理论
- [[whitted-1980]] —— 同期 ray tracing,走另一条路线

## 关联

- [[goral-1984-radiosity]] —— hemicube 解决了它留下的工程瓶颈
- [[whitted-1980]] —— 同期 ray tracing,radiosity 视为对照面
- [[kajiya-1986-rendering-equation]] —— 把 radiosity 和 ray tracing 统一成积分方程的两种近似
- [[gpu-microbenchmarking-2010]] —— GPGPU 时代,hemicube 思路的工业化延伸
- [[gpu-cache-coherence-2013]] —— 现代 GPU 通用计算的硬件基础
- [[disney-brdf-2012]] —— 现代 BRDF 模型,扩展了 radiosity/hemicube 的漫反射假设

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[hanrahan-1991-hierarchical-radiosity]] —— Hanrahan 1991 Hierarchical Radiosity — 让 radiosity 从 O(n²) 跌到 O(n)
- [[marching-cubes-1987]] —— Marching Cubes 1987 — 把体数据切成立方体查表生成三角网格
