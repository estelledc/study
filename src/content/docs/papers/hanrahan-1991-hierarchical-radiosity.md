---
title: Hanrahan 1991 Hierarchical Radiosity — 让 radiosity 从 O(n²) 跌到 O(n)
来源: Pat Hanrahan, David Salzman, Larry Aupperle, "A Rapid Hierarchical Radiosity Algorithm", SIGGRAPH 1991
日期: 2026-05-31
分类: 图形学
难度: 进阶
---

## 是什么

**Hierarchical Radiosity**（层次化辐射度）是一套**自适应**的 radiosity 加速算法。它的核心动作只有一个——**在计算光交换之前，先按距离把每个面递归切成 quadtree**。

日常类比：你画一幅画，远处的山只用粗笔勾，近处的人脸要细描。两块挨得近的墙必须细看（form factor 变化剧烈），两面相隔很远的墙用一对粗 patch 就够。

经典 radiosity（[[goral-1984-radiosity]] / [[cohen-1985-hemicube]]）有个硬伤：n 个 patch 之间要算 n × n 个 form factor。n=10000 就是 1 亿对，一晚上跑不完。

Hanrahan 团队的回答是：**别一开始就把场景切到底**。先粗切，然后看哪两块之间需要细看就只切那两块。最后总链接数从 O(n²) 降到 **O(n)**。

## 为什么重要

不理解 hierarchical radiosity，下面这些事讲不通：

- 为什么 Goral 1984 的 radiosity 论文实验场景只有几百块 patch——再多就跑不动
- 为什么今天 Unreal Lightmass / Geomerics Enlighten 烘焙光照的算法谱系都指向这一篇
- 为什么图形学和 N-body 物理仿真共享同一个加速思想（multipole / 层次化）
- Hanrahan 后来拿了图灵奖（2019，与 Catmull 共享），这篇是他最被引的渲染论文之一

它把 radiosity 从『最多几千 patch』推到『几十万 patch』，建筑可视化第一次能算整栋楼。

## 核心要点

### 1. 关键洞见 — 远处可以粗看

经典 radiosity 把场景一开始就切成固定 N 个 patch。这做法有个浪费：**两块离得远的 patch，form factor 几乎是个常数**，没必要切那么细。

Hanrahan 用的是 1987 年 Greengard-Rokhlin 在 N-body 物理仿真里提出的 **Fast Multipole Method (FMM)** 思想——把『所有粒子两两交互』按距离分层做：近的精算，远的当一个整体看。

把它搬到图形学就是：**form factor 计算的精度需求随距离变化**，那就让数据结构也随距离变化。

### 2. 算法 — 五个动作

1. **初始化**：场景里每个面（输入的 k 个面）就是一棵 quadtree 的根节点
2. **配对**：对每两个面之间，调用 **oracle**（误差预言函数）估计『就用这一层算 form factor 会差多少』
3. **细分**：如果误差超过阈值，把较大的那块切成 4 个子 quadtree 节点，递归回到第 2 步
4. **建链接**：如果误差可接受，在当前层级建一条 **link**（链接），存这一对的 form factor
5. **求解**：能量沿 link 传递。子 patch 收到的能量向上 **gather** 到父节点；父节点累积值向下 **push** 到子节点。反复迭代直到收敛。

### 3. 为什么是 O(n)

关键不是 patch 数变少（可能更多），而是 **link 数变少**。

- 朴素：n 个 patch，每两两都建一条 link → O(n²)
- 层次化：远处的 patch 在高层就『打包成一对』建 link，近处才下沉细分

总链接数被证明是 **O(n + k²)**（k 是输入面数）。当 n >> k 时，主导项是 O(n)。

### 4. quadtree + oracle 是骨架

`quadtree`：四叉树。把一个矩形 patch 切成 4 块，每块再切 4 块，递归下去。

`oracle`：误差预言函数。最简单的版本是 `disk approximation`——把两块 patch 当成两个圆盘，根据距离/角度估算 form factor 的相对误差。

这两件事合起来就是**自适应多分辨率分析**——和小波（wavelet）在信号处理里干的事是同一种思想。

## 实践案例

### 案例 1 — 一面墙照亮另一面墙

两面 4m × 4m 的白墙，相距 5m，平行。

朴素 radiosity：把每面切成 100 块（1m 一格），共 200 个 patch，要算 200 × 200 = 40000 对 form factor。

层次化做法：

- 第 0 层：两面墙就是两个 root patch。oracle 看一眼，距离远 / 形状规则，**误差容忍**——直接建一条 link 完事
- 链接数：1 条
- form factor 计算：1 次

差距：**40000 倍**。

### 案例 2 — 房间角落

同一个房间里挨在一起的两面墙（夹角 90°）。

- 第 0 层：oracle 一看，挨太近、夹角处 form factor 变化剧烈 → **拒绝**
- 第 1 层：每面切 4 块，对所有交叉对再问 oracle
- 第 2 层：靠近交线的子 patch 再切
- 远离交线的子 patch 在第 1 层就停手了

最终：靠近角落的部分细到第 3-4 层，远离角落的部分停在第 1 层。**精度按需分配**。

### 案例 3 — 现代游戏烘焙的影子

Unreal Engine 的 Lightmass 烘焙器在 2010 年代初仍然用层次化 radiosity 做漫反射光照计算（后来才换成 GPU path tracing）。流程一致：把关卡里所有静态面切成 patch，按 quadtree 自适应细分，烘焙到 lightmap 贴图，运行时直接采样。

## 踩过的坑

1. **oracle 阈值不好选**：过严退化成 O(n²)，过松会出现明显的细分边界（人眼看到 lightmap 上有方块感，叫 mach band）
2. **动态场景失效**：物体一动整棵 quadtree 和所有 link 都要重算——这就是为什么现代游戏靠『烘焙』（假设场景静态）
3. **光泽/镜面材质失败**：层次化基于『远处可以粗看』，光泽材质对方向极敏感，这个假设直接破产。本算法只适用于**全漫反射**
4. **递归深度爆炸**：必须设最大层级 + 最小 patch 面积。否则一个尖角能让算法切到内存爆掉

## 适用 vs 不适用场景

**适用**：

- 静态场景的烘焙光照（建筑可视化、游戏关卡）
- 全漫反射或弱光泽场景
- 需要『视点无关』结果——解一次到处看

**不适用**：

- 动态光源 / 动态几何 → 用 Monte Carlo path tracing / ReSTIR
- 高光泽 / 镜面反射 → 用 ray tracing 系算法（[[whitted-1980]]）
- 输入面数 k 很小且 patch 数 n 也不大时，常数项压不住，朴素法反而更快

## 历史小故事（可跳过）

- **1987**：Greengard 和 Rokhlin 在数学上发表 Fast Multipole Method，把 N-body 物理仿真从 O(n²) 降到 O(n)
- **1989**：Hanrahan 在 Pixar 完成 RenderMan 设计，转去 Princeton 做教授
- **1991**：Hanrahan 带 Salzman、Aupperle 把 FMM 思想搬进 radiosity，发表本文（当时他仍在 Princeton）
- **1994**：Hanrahan 离开 Princeton 加入 Stanford 创建 graphics lab，此后那里走出 Levoy / Pharr / Ng 一脉
- **2019**：Hanrahan 与 Ed Catmull 共享图灵奖，表彰 3D 计算机图形学的奠基贡献

## 学到什么

1. **多分辨率分析能从信号处理跨进图形学**——同一种『按尺度分层』的思想在小波、FMM、hierarchical radiosity 里反复出现
2. **算法复杂度从 O(n²) 到 O(n) 不靠魔法，靠承认『精度需求随距离变化』**
3. **quadtree + 误差 oracle = 自适应数据结构**——这个组合后来在碰撞检测、空间索引、网格简化里到处都是
4. 把『所有人两两关心』降到『大尺度上分组、小尺度上细看』，是物理仿真和图形渲染的共同武器
5. **算法选型先看场景假设是否成立**——本算法假设漫反射 + 静态，假设破产时再快也没用

## 后续工作（让自己有方向）

- 1993 年 Smits-Arvo-Salesin 的 **clustering**：把『一堆 patch 一起当 super-patch』再做层次化——把输入面数 k 的 O(k²) 项也压下去
- 1994 年 Lischinski 的 **discontinuity meshing**：在阴影边界处主动放细分线，配合层次化精度更高
- **Wavelet Radiosity**（Gortler 1993）：把 hierarchical radiosity 用小波基显式重写，理论更整洁
- 现代 **Precomputed Radiance Transfer (PRT)**：把光传输预计算成系数，运行时实时渲染，思想还是层次化

## 延伸阅读

- 论文 PDF：[Hanrahan-Salzman-Aupperle 1991](https://dl.acm.org/doi/10.1145/127719.122740)（10 页，配图清晰）
- 教科书章节：Pharr-Jakob-Humphreys, *Physically Based Rendering* 第 16 章 light transport（讲 radiosity 在现代渲染中的位置）
- 视频讲解：Cem Yuksel, [Introduction to Computer Graphics — Radiosity](https://www.youtube.com/watch?v=l-19V-2-tll)（含 hierarchical 直观演示）
- 历史回顾：[[goral-1984-radiosity]] —— radiosity 进图形学的起点
- 同期对比：[[cohen-1985-hemicube]] —— 用 GPU 硬件加速 form factor，正交于本算法

## 关联

- [[goral-1984-radiosity]] —— radiosity 进图形学，O(n²) 朴素版
- [[cohen-1985-hemicube]] —— form factor 计算的硬件加速，这两条线在 1990s 合流
- [[kajiya-1986-rendering-equation]] —— 把 radiosity 和 ray tracing 统一成一个积分方程
- [[whitted-1980]] —— 镜面反射这条平行线，和 radiosity 互补
