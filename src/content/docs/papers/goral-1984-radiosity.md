---
title: Goral 1984 Radiosity — 把建筑工程的辐射热传导算法搬进图形学
来源: Cindy M. Goral, Kenneth E. Torrance, Donald P. Greenberg, Bennett Battaile, "Modeling the Interaction of Light Between Diffuse Surfaces", SIGGRAPH 1984
日期: 2026-05-31
分类: 图形学
难度: 进阶
---

## 是什么

**Radiosity**(辐射度)是一套算"房间里每块表面到底有多亮"的办法。

日常类比:想象你站在咖啡厅里,白墙被窗外阳光照到,墙又把光反射到天花板,天花板再反射到你桌面上的咖啡杯。这种**光在表面之间反复弹**的现象,就是 radiosity 要解的问题。

它的做法很违反直觉 ——**不追光线,直接解一个大型线性方程组**:

```
B_i = E_i + rho_i * sum(F_ij * B_j)
```

读法:第 i 个表面发出的总光 B_i = 自己发光 E_i + 反射率 rho_i × 从所有 j 表面射过来的光的加权和。

n 个表面就 n 个方程,联立解,得出每块表面有多亮。

**视点无关**是最大特点:解完一次,相机怎么转都直接读结果,**不用重算**。这是它和同期 ray tracing 最根本的差异。

## 为什么重要

不理解 radiosity,下面这些事讲不通:

- 为什么 1980 年 Whitted 的 ray tracing 能渲染**玻璃球反射镜面光**,但**白墙照亮房间**这种漫反射间接光却拿不下
- 为什么 Cornell box(那个红墙蓝墙的标准测试场景)长那个样 —— 它就是 1984 年这篇论文的副产物
- 为什么现代游戏引擎里有**烘焙光照**(lightmap baking)这一步 —— 思想直接继承自 radiosity
- 1980s 图形学有**两条平行线**:ray tracing 走镜面/折射,radiosity 走漫反射间接光。1986 Kajiya 用 rendering equation 统一两者

## 核心要点

### 1. 关键洞见 — 把图形学问题翻译成热工程

1950s 起,**建筑工程和航天器热控**早就有一套成熟数学工具,叫 **radiative heat transfer**(辐射热传导),专门算"加热器把热量辐射到墙上,墙再辐射到天花板"这种问题。

Goral 团队在 Cornell,跟建筑系隔几栋楼。他们发现:

- 工程师算的"热"和图形学算的"漫反射光"**方程结构完全一样**
- 把"温度"换成"亮度",把"热反射率"换成"光反射率",直接搬过来就能用

这就是论文的主贡献 —— **领域翻译**。算法不是新发明,但**把它带进图形学是新的**。

### 2. Form factor — 论文里最难的几何量

`F_ij` 叫 form factor(形状因子):**表面 i 发出的能量,有多少比例落到表面 j**。

它是**纯几何量** —— 跟材质、光强都无关,只看两块表面**怎么互相看见、互相挡住**。

类比:你举着一个手电筒朝天花板照,天花板上有一块面积。**手电筒光锥落在那块面积里的比例**就是 form factor。

```
F_ij = (1 / A_i) * 双重积分(cos_i * cos_j / (pi * r^2) * V_ij dA_i dA_j)
```

不用记公式,记三件事:

- 它**只跟几何有关**
- 它**算起来很贵**(双重积分加可见性判定 V_ij)
- n 块表面就有 **n 平方个 form factor** —— 这是后续算法瓶颈

### 3. 解线性方程组

把所有 n 个 `B_i = E_i + rho_i * sum(F_ij * B_j)` 拼成矩阵形式:

```
(I - rho * F) * B = E
```

直接用高斯消元 O(n^3),论文里 n 不大(几十到几百块表面)还能跑。后来 Cohen 1988 改成 progressive 迭代,边解边显示。

## 实践案例

### 案例 1 — Cornell Box 怎么来的

论文配套图:一个**红墙 + 蓝墙 + 三面灰墙**的立方体房间,顶部一块发光面板。1984 原版为了解析算 form factor,**盒内没有遮挡物**;后来常见的"红绿墙 + 盒内色块"是后续演示变体。

这个场景**没什么艺术追求** —— 它是为了**验证算法**:

- 红墙 / 蓝墙会把颜色"染"到灰墙与地板 —— 漫反射间接光的色彩传递(color bleeding)
- ray tracing 1980 算不出这种染色,因为它的 ambient term 是常数
- radiosity 能 —— 红墙的 B_红 算出来后,灰墙看见红墙,通过 form factor 把红色带过来

**color bleeding** 就是 radiosity 给图形学留的一张名片。今天每个游戏引擎的烘焙光照都有这个效果。

### 案例 2 — 视点无关意味着什么

Ray tracing 流程:**给相机位置 → 从每个像素射光线 → 算每条光线打到哪 → 算颜色**。换个相机位置全部重来。

Radiosity 流程:**解方程 → 得到每块表面的亮度 B_i → 用任何标准光栅化把场景画出来**。换相机**只重画**,不重解。

类比:ray tracing 像你**每次拍照都要重新打光**,radiosity 像**先把房间布光完,然后随便拍**。

代价:布光阶段要等很久(那个 n 平方个 form factor),但拍照阶段非常便宜。**适合静态场景多角度浏览**(建筑可视化、博物馆漫游),**不适合动态场景**(光源一动全部重算)。

### 案例 3 — 现代 light probe 系统继承的思想

Unity / Unreal 里的 light probe(光照探针):

- 在场景里**稀疏放点位**,每个点位预先采样四周的辐射场
- 运行时角色走到某点附近,**插值这些点位的辐射度**得到环境光
- 离线烘焙阶段,**用类似 radiosity 的办法解全局光照**(现代多用 path tracing 替代,但思想一致)

精神继承:**离线把光照算清楚 + 运行时只查表**。这正是 1984 年这篇论文的灵魂。

## 踩过的坑

1. **只能漫反射** — 论文假设所有表面都是 Lambertian(朝所有方向均匀反射)。镜面、玻璃、金属光泽都不能处理。1986 年 Immel 和 Kajiya 才扩展到带方向性的反射。

2. **Form factor 太贵** — n 平方个二维积分,n=1000 时 100 万次积分。1985 年 Cohen-Greenberg 提出 **hemicube** 用 z-buffer 硬件加速,才让 radiosity 工程化。

3. **网格依赖严重** — 表面要先切成小 patch。切粗了**阴影边缘出现锯齿**(mach band 效应),切细了 form factor 矩阵爆炸。adaptive subdivision 是后续重点研究方向。

4. **动态场景废掉** — 任何一个光源或物体一移动,n 平方个 form factor 全部失效需重算。这是 radiosity 在 90 年代被 path tracing 逐渐取代的根本原因。

## 适用 vs 不适用场景

**适用**:

- 静态场景的**漫反射全局光照**(建筑可视化、博物馆 / 美术馆漫游)
- 离线**烘焙光照贴图**(现代游戏 lightmap baking 流水线)
- 需要**多视角浏览同一场景**(VR walkthrough)

**不适用**:

- 实时动态场景(场景一动全部重算)
- 镜面反射、折射、焦散(caustics)
- 高频细节材质(各向异性、毛发、皮肤)
- 户外大场景(n 太大,form factor 矩阵存不下)

## 历史小故事(可跳过)

- **1950s** 工程学:辐射热传导在建筑、航天器热控早已成熟,标准教材
- **1980** Whitted 提出递归 ray tracing,处理完镜面和折射,漫反射间接光用一个常数 ambient term 凑数
- **1984** Cornell 的 Goral / Torrance / Greenberg / Battaile 团队把 radiosity 从热工程搬进图形学,SIGGRAPH 论文配 Cornell Box
- **1985** Cohen-Greenberg 提出 hemicube,把 form factor 计算用 z-buffer 硬件加速到工程可用
- **1986** Kajiya 提出 rendering equation,把 ray tracing 和 radiosity 统一成同一个积分方程的不同近似 —— 图形学有了统一理论
- **1988** Cohen 提出 progressive radiosity,边迭代边显示,用户不用等到全部解完
- **2000s** Monte Carlo path tracing(Veach 1997 博士论文集大成)主流化,radiosity 作为独立算法逐渐淡出
- **现代** light probe / lightmap baking / Precomputed Radiance Transfer 都是 radiosity 精神的延续

## 学到什么

1. **领域翻译比新发明更难** —— 从工程学借数学工具进图形学,关键是看出"两个领域问题结构同构"
2. **视点无关 vs 视点相关**是图形学一个根本分野 —— radiosity 走前者,ray tracing 走后者
3. **离线预计算 + 运行时查表**这个套路从 1984 用到今天的游戏引擎,本质没变
4. **算法瓶颈推动后续研究** —— form factor 太贵 → hemicube;网格依赖 → adaptive meshing;动态场景废 → path tracing 上位
5. **简化假设是双刃剑** —— 漫反射假设让方程变线性、能解,但也限定了它的能力边界

## 延伸阅读

- 论文 PDF:[Goral et al. 1984 — Modeling the Interaction of Light Between Diffuse Surfaces](https://www.cs.rpi.edu/~cutler/classes/advancedgraphics/S10/papers/goral.pdf)
- Cornell Box 历史页:[Cornell Program of Computer Graphics — The Cornell Box](https://www.graphics.cornell.edu/online/box/history.html)
- 教科书:[Cohen & Wallace, "Radiosity and Realistic Image Synthesis", 1993](https://www.cs.cornell.edu/courses/cs6630/2012sp/notes/) —— radiosity 时代的标准参考
- [[whitted-1980]] —— 同期 ray tracing 论文,radiosity 的对照面
- [[kajiya-1986-rendering-equation]] —— 把两条路线统一的积分方程
- [[veach-1995-mis]] —— Monte Carlo 时代的代表作,radiosity 的接班人

## 关联

- [[whitted-1980]] —— ray tracing 处理镜面 / 折射,radiosity 处理漫反射,1980s 两条平行线
- [[kajiya-1986-rendering-equation]] —— 用一个积分方程把两者统一,radiosity 是其漫反射近似
- [[disney-brdf-2012]] —— 现代 BRDF 模型,radiosity 时代只有 Lambertian
- [[ward-1992]] —— 各向异性反射模型,扩展了 radiosity 漫反射假设的局限
- [[veach-1995-mis]] —— Monte Carlo 多重重要性采样,path tracing 时代取代 radiosity 的关键
- [[lafortune-1993-bdpt]] —— 双向 path tracing,把光线从光源和相机两端同时撒,radiosity 视点无关思想的另一种实现

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bentley-1975-kdtree]] —— k-d 树 — 多维空间里的二叉搜索树
- [[catmull-1974-zbuffer]] —— Catmull 1974 Z-buffer — 用一张深度图解决谁挡谁的问题
- [[cohen-1985-hemicube]] —— Cohen-Greenberg 1985 Hemicube — 把渲染硬件挪去算辐射度积分
- [[curless-levoy-1996-tsdf]] —— Curless-Levoy TSDF — 把多次扫描融成一个干净的 3D 模型
- [[hanrahan-1991-hierarchical-radiosity]] —— Hanrahan 1991 Hierarchical Radiosity — 让 radiosity 从 O(n²) 跌到 O(n)
- [[loop-1987-subdivision]] —— Loop 1987 — 三角形网格的递归光滑细分
- [[marching-cubes-1987]] —— Marching Cubes 1987 — 把体数据切成立方体查表生成三角网格
- [[meagher-1982-octree]] —— Meagher 1982 八叉树 — 把立方体一分为八，递归地装下一整个 3D 世界
- [[taubin-1995-mesh-smoothing]] —— Taubin 1995 — 把网格平滑当成低通滤波
