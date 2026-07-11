---
title: Distributed Ray Tracing — 把所有"模糊"效果统一成随机采样
来源: Cook, Porter, Carpenter, "Distributed Ray Tracing", SIGGRAPH 1984
日期: 2026-05-31
分类: 图形学
难度: 中级
---

## 是什么

Distributed Ray Tracing（**DRT**）是一套**让每像素打很多根带随机扰动的射线、然后求平均**的渲染方法。日常类比：拍夜景，相机长曝光时间，传感器收集了一个时间段内所有光子求平均，于是运动的人就糊了。DRT 在算法里模拟同一件事——对时间、镜头位置、光源位置都做"长曝光式"的采样。

之前的 Whitted ray tracing（1980）每像素只打一根射线，得到的画面像玻璃和塑料：**镜子是完美镜子、阴影是刀切边、不会动也没有景深**。DRT 在 1984 年用 4 页论文证明：**这些"模糊感"全部是同一道数学题——多重积分——只要在不同维度上随机采样就能一并解决**。

## 为什么重要

不理解 DRT，下面这些事都没法解释：

- 为什么 Pixar / RenderMan / Arnold 这些电影渲染器都叫"Monte Carlo renderer"——它们的祖先就是这 4 页
- 为什么调"景深"参数会让渲染时间从 1 分钟涨到 30 分钟——你在让积分维度从 2 升到 4
- 为什么离线渲染图有"颗粒噪声"，加大 spp（samples per pixel）就能擦掉——这是采样收敛
- 为什么实时 RTX / 光追游戏到 2020 年才能糊弄出软阴影——要等硬件能算够多采样

## 核心要点

DRT 的洞见可以拆成 **三步**：

1. **每个效果都是积分**：
   - 运动模糊 = 对快门打开的时间段积分
   - 景深 = 对镜头光圈面积积分
   - 软阴影 = 对面光源面积积分
   - Glossy 反射 = 对反射方向附近一个锥形立体角积分
   - 半透明折射 = 对折射方向一个锥形立体角积分

2. **一根射线就是该积分的一个样本**：以前 Whitted 每像素一根射线 = 用一个点近似整个积分，结果当然是"硬边"。

3. **Monte Carlo 采样**：每像素打 N 根射线，每根在所有维度上都被随机扰动一次（不同的时刻、不同的镜头落点、不同的光源采样点、不同的反射方向）。最后求平均，逼近积分真值。

三步加起来叫 **Distributed Ray Tracing**——"distributed" 指**把样本分布在多个积分维度上**，不是分布式计算。

## 实践案例

### 案例 1：景深（Depth of Field）怎么实现

实拍相机：光圈大 → 焦平面外的东西糊掉。数学本质：每个传感器像素接收的光来自整个光圈面积上不同入射方向的光线。

DRT 的做法：

```
for 每像素 p:
  for k in 1..N:
    在镜头光圈面积上随机采一个点 lens_k
    从 lens_k 出发、经过 p 在焦平面上对应的点，算出射线方向
    沿这根射线追踪场景
  像素颜色 = N 根射线结果的平均
```

焦平面上的物体所有 N 根射线汇聚到同一点 → 不糊。焦平面外的物体 N 根射线打到不同点 → 颜色平均出来就是糊。**这就是今天 PBRT / Mitsuba / Arnold 实现 DOF 的标准做法。**

### 案例 2：软阴影怎么得到

点光源 → 阴影是非黑即白的硬边。现实里没有点光源，灯泡有体积，所以阴影边缘有半影（penumbra）。

DRT 的做法：把光源当成一个面（如球面、矩形面），打 shadow ray 时**在光源面上随机采样**，N 根 shadow ray 中部分被遮挡、部分没被遮挡，平均后得到 0..1 的灰度——**这就是半影**。

### 案例 3：运动模糊

每根射线带一个随机时间戳 `t_k ∈ [shutter_open, shutter_close]`。场景里运动的物体在不同 `t_k` 处于不同位置 → N 根射线打到不同位置 → 平均后得到拉丝糊。

**在游戏/实时图形里**这通常用后处理（post-process motion blur）伪造，因为打不起 N 根射线。**离线电影渲染**则用 DRT 的真采样，逐像素几十到几千根射线。

### 案例 4：Glossy（亚光）反射

完美镜子反射方向是确定的一根射线。亚光金属（拉丝铝、磨砂不锈钢）的反射方向是一个**锥**——以理想反射方向为轴，越偏越暗。

DRT 做法：每根射线打到亚光面后，**在反射锥立体角内随机采一个方向**作为次级射线方向。N 根射线得到 N 个不同的反射方向，平均后呈现"模糊倒影"。锥越宽 → 越像磨砂；锥越窄 → 越像镜子。**今天 Disney BRDF / GGX 等微表面模型本质都是给这个锥指定一个概率分布。**

## 踩过的坑

1. **"Distributed" 不是 distributed computing**：1984 这个词指"分布在多个积分维度上的采样"，跟分布式系统毫无关系。中文译作 **分布式光线追踪** 容易让人误会。

2. **DRT 不是 path tracing**：DRT 仍然按 Whitted 的方式从眼睛递归追踪，每次反射/折射**仍只走一根次级射线**（只是方向带随机扰动）。Kajiya 1986 的 path tracing 才把"全局光照中漫反射弹射"也变成 Monte Carlo 采样。**DRT 是第一步、Kajiya 是第二步**。

3. **样本不够就有颗粒噪声**：N=16 时画面布满"沙粒"，N=256 才平滑，N=1024 出片质量。看上去渲染时间和画面质量是线性换——这就是后续 30 年所有降方差工作（importance sampling、MIS、bidirectional path tracing、Metropolis Light Transport）的起点。

4. **Stratified > 纯随机**：每像素 N 个样本不是完全乱撒，而是把 [0,1)×[0,1) 切成 √N×√N 网格、每格内随机一点（jittered sampling）。这样空隙更均匀、收敛更快。这是论文里专门强调的工程细节。

## 适用 vs 不适用场景

**适用**：

- 离线渲染（电影、动画、特效）——时间预算大，算得起几百 spp
- 任何需要"模糊感"才真实的效果——景深、动模糊、软阴影、glossy
- 现代生产渲染器（Arnold、RenderMan RIS、V-Ray、Manuka、Disney Hyperion）的核心循环

**不适用**：

- 实时渲染（游戏、VR）——每帧 16ms 打不起几百根射线，只能用后处理伪造或 NN 降噪兜底
- 需要保留硬边的卡通渲染（NPR）——刻意要的就是非真实
- 不带"模糊"维度的简单场景——直接 Whitted 一根射线就够，省 N 倍时间

## 历史小故事（可跳过）

- **1980 年**：Turner Whitted 在贝尔实验室发表递归光线追踪，每像素一根射线，渲出来的"金属球+棋盘"图火遍图形学界。但所有人都看出问题：太硬、太干净、不像电影。
- **1982-1984 年**：Cook、Porter、Carpenter 在 Lucasfilm Computer Graphics Group（即后来 Pixar）做 RenderMan 雏形，碰到同一道墙。他们意识到所有想要的"软"效果都是某种积分。
- **1984 年 SIGGRAPH**：4 页论文，密度极高，连图都简陋。但一年内 Lucasfilm/Pixar 内部就在用。
- **1986 年**：Kajiya 在同一个会场发表 The Rendering Equation，把全局光照也写成积分，path tracing 诞生。**DRT 的思路彻底胜出，成为离线渲染的范式。**

## 学到什么

1. **"模糊"的数学本质是积分**——理解了这一点，所有看似不同的渲染效果（景深、动模糊、阴影、glossy）就坍缩成同一道题
2. **Monte Carlo 是把高维积分变可解的工程钥匙**——维度高到积不动？随机采样、求平均、收敛慢但终归收敛
3. **代价是噪声，方向是降方差**——后续 30 年图形学的大半工作是"怎样用更少样本得到更平滑结果"
4. **4 页论文 + 工业需求**——DRT 不是先理论后落地，是 Pixar 工程师为了拍《Andre & Wally B.》逼出来的；这是图形学最好的范式

## 一句话记忆法

如果只能记一句话——**"每像素打 N 根带随机扰动的射线，每根扰动时间/光圈/光源/反射方向后求平均"**。这一句覆盖了 DRT 90% 的工程含义。

## 跟今天的代码长什么样

任何一个现代离线渲染器（PBRT 教材代码、Mitsuba 3、Blender Cycles）的主循环大致是：

```
for each pixel (x, y):
  color = 0
  for k in 1..spp:
    sample = stratified_jittered(k, spp)   // 5+ 维度随机数
    ray = generate_camera_ray(x, y, sample.lens, sample.time)
    color += integrate(ray, sample)         // 递归追踪 + 各种 BRDF 采样
  pixel(x, y) = color / spp
```

把 `spp`（samples per pixel）开到 16 = 上世纪 80 年代水平，开到 1024 = 现代电影帧。**算法骨架完全是 1984 这 4 页定下来的**。

## 延伸阅读

- 论文 4 页 PDF：[Cook-Porter-Carpenter 1984](https://dl.acm.org/doi/10.1145/964965.808590)（短到能一下午读完）
- 教科书：[PBRT — Physically Based Rendering, From Theory to Implementation](https://pbr-book.org/)（Pharr-Jakob-Humphreys，免费在线，DRT 思想贯穿全书）
- 视频：[Cem Yuksel — Sampling and Reconstruction](https://graphics.cs.utah.edu/courses/cs6620/fall2017/?prj=10)（犹他大学课程，把采样讲透）
- [[whitted-1980]] —— DRT 的直接前身，每像素一根射线
- [[kajiya-1986]] —— 把 DRT 思想推到全局光照，path tracing 诞生

## 关联

- [[whitted-1980]] —— 祖父辈：递归光线追踪开创者，DRT 把它的"硬边"问题解了
- [[kajiya-1986]] —— 兄弟篇：rendering equation + path tracing 把 Monte Carlo 推到全局光照
- [[reyes-1987]] —— 同实验室同期工作：Pixar REYES 微多边形渲染，与 DRT 互补
- [[veach-1997]] —— 后辈：MIS / bidirectional path tracing 等降方差技巧的集大成

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[burgess-2020-turing-rt]] —— Burgess 2020 RTX ON — Turing 把光线追踪做进硅片
- [[catmull-clark-1978]] —— Catmull-Clark 1978 — 让任意拓扑网格收敛成光滑曲面
- [[cook-1986-stochastic-sampling]] —— Cook 1986 — 用噪声换掉锯齿
- [[lafortune-1993-bdpt]] —— Lafortune-Willems 1993 — 从相机和光源同时撒光线再"接龙"
- [[reyes-1987]] —— Reyes 1987 — 把电影级渲染拆成可流水线处理的小砖块
- [[wald-2007-sah-bvh]] —— Wald 2007 — 把 SAH BVH 构建从分钟级砍到秒级的 binned 近似法
- [[appleseed]] —— appleseed — 物理渲染器
- [[luxcorerender]] —— LuxCoreRender — 物理光线追踪
- [[mitsuba3]] —— Mitsuba 3 — 研究向可微渲染器
