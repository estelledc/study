---
title: Catmull-Clark 1978 — 让任意拓扑网格收敛成光滑曲面
来源: Catmull & Clark, "Recursively Generated B-Spline Surfaces on Arbitrary Topological Meshes", Computer-Aided Design Vol 10 No 6, 1978
日期: 2026-05-31
分类: 图形学
难度: 中级
---

## 是什么

Catmull-Clark 细分（**CC**）是一套**反复把粗糙多边形网格切细，最终收敛成一张光滑曲面**的方法。日常类比：手工捏陶——你先粗手抓出大致形状（控制网格），然后一遍遍刮磨，每一遍都让棱角钝一点，最后表面就光滑得像水洗过。

数学角度看，它是 **B 样条曲面在任意拓扑上的推广**。1974 年前的 B 样条只接受规则的四边形矩阵网格；遇到角色脸（眼眶、嘴角、耳朵）这种有三角形、五边形、奇怪顶点的网格就投降。CC 把规则去掉了——网格长什么样都行，递归几次就给你一张 **C² 连续**（二阶导数处处连续）的曲面。

这就是今天 Maya、Blender、ZBrush 默认细分模式背后的算法，也是 Pixar 角色建模的工业标准。

## 为什么重要

不知道 CC 这件事，下面这些都解释不通：

- 为什么 Pixar 1997 年那部《Geri’s Game》之后，所有角色动画的脸都"突然变光滑"——CC 第一次工业化用上
- 为什么 OpenSubdiv（Pixar 2012 开源）能让游戏引擎实时跑 CC——它把递归改成了 GPU 并行
- 为什么 Edwin Catmull 拿 2019 年图灵奖——CC 是他 9 项工业级图形发明里最广为人知的一项
- 为什么你在 Blender 按 Ctrl+1/2/3 看到模型变光滑——那个 Subdivision Surface 修改器默认就是 CC

## 核心要点

CC 一次细分把每个面变成 4 个面（n 边形变成 n 个四边形）。三类新点的算法是：

1. **面心点 F**：每个面所有顶点取平均，得到面中心点
2. **边点 E**：每条边的两端点 + 两侧相邻面心点，**四个点平均**
3. **顶点新位置 P′**：旧顶点 P 移动到
   `P′ = (F_avg + 2·R_avg + (n−3)·P) / n`
   其中 n 是 P 的"价数"（连接几条边），F_avg 是相邻所有面心的平均，R_avg 是相邻所有边中点的平均

**直观解释**：每个新点都是周围邻居的"加权平均",所以会被拉向中心、磨掉棱角。重复几次，整个网格越来越接近一张光滑曲面。

**收敛性**：

- 顶点价数 = 4（普通四边形网格内部）→ 极限曲面 **C² 连续**（弯曲变化平滑）
- 顶点价数 ≠ 4（叫"非常规顶点"，extraordinary vertex）→ 只能到 **C¹**（一阶连续，但二阶可能断）
- 这点 C¹ 限制是后来 Stam 1998、DeRose 1998 重点改的方向

### 一次细分到底干了什么（图解版）

假设一个面是六边形（6 个顶点 V1..V6），CC 一次细分把这个面切成 6 个四边形：

- 先算面心 F = (V1+V2+V3+V4+V5+V6) / 6
- 每条边 (Vi, Vi+1) 算边点 Ei = (Vi + Vi+1 + F + F_neighbor) / 4，其中 F_neighbor 是隔壁面的面心
- 每个 Vi 移到新位置 Vi′（用上面顶点公式）
- 新拓扑：F 连到所有 Ei，每个 Vi′ 由两个 Ei 包围 → 切出 6 个四边形

注意一次细分后所有面都是四边形——这是 CC 的一个关键性质：**第一次细分后，网格变成纯四边形结构**，之后每次细分四边形数 ×4，结构稳定。

## 实践案例

### 案例 1：一个立方体被 CC 反复磨成球

Blender 里建一个立方体（8 个顶点、6 个面、12 条边），打开 Subdivision Surface 修改器：

- 1 次细分：变成"圆角立方体"——8 个角变成圆弧
- 2 次细分：肉眼几乎看不到原立方体的棱
- 3 次细分：基本是一个球

数学上能证明，立方体的 CC 极限曲面就是一个**接近球但不等于球**的光滑曲面（因为 CC 是 B 样条推广，不是有理样条，画不出精确球面）。

### 案例 2：Pixar Geri 老爷子的脸

1997 年 Pixar 短片《Geri’s Game》第一次把 CC 全程用于角色建模。建模师只画了一张几百面的"控制网格"——眼眶、嘴角、皱纹靠手动放顶点。渲染时 CC 自动细分到几十万面，再交给 RenderMan 上色。

工作流的革命在于：建模师**只编辑控制网格**（少量、可逆、可动画），渲染层自己处理细分。这套流程后来直接进了 Maya 和 Pixar 内部工具，成为今天角色管线的默认模式。

### 案例 3：实时游戏里怎么用

朴素递归 N 次，面数会膨胀到 4ⁿ 倍——4 次就 256 倍，桌面 GPU 都吃不消。

Stam 1998 给出了一个聪明办法：用矩阵特征值分解，**直接算出极限曲面上任一点的精确坐标**，不必真的递归。OpenSubdiv（Pixar 2012）把这套写成 GPU shader，让游戏引擎可以实时显示 CC 极限曲面。Unreal 5 的 Nanite 也借鉴了类似思路。

### 案例 4：和 NURBS 的分工

电影行业不是只用 CC——汽车设计、产品外观（iPhone 边角）这类要求精确数学曲面的场景，主流仍是 NURBS（非均匀有理 B 样条）。区别：

- **NURBS**：曲面由参数方程精确描述，能表达圆/椭圆等代数曲线，但要求规则网格、编辑成本高
- **CC**：曲面由控制网格 + 极限定义，任意拓扑都能用，编辑成本低，但不能精确表达圆

工业产品（CAD 工作流）走 NURBS；角色 / 有机形态走 CC。两者今天在不同管线共存，没有谁取代谁。

## 踩过的坑

1. **非常规顶点处的眩光断裂**：C¹ 不是 C²，意味着曲面在极端顶点处"弯曲变化率会跳一下"。镜面材质 + 强光打过来时，高光线条会出现肉眼可见的折角。Pixar 真实片场用 DeRose 1998 的 semi-sharp creases 缓解。

2. **想要锐边时被磨平**：CC 默认把所有棱角都圆滑掉。你想保留盒子的硬棱（比如机械零件），需要给那条边打 crease 标签。Blender 的"Mean Crease"参数就是干这个的。

3. **三角形网格转 CC 不友好**：CC 第一次细分会把三角形先转成 3 个四边形。如果你的原始网格都是三角形（很多 3D 扫描结果），第一次细分后顶点价数会异常高，极限曲面在那些点退化得厉害。这种场景应该用 Loop subdivision（也是 1987 年提出的，专为三角形）。

4. **递归层数和文件大小**：每次细分内存 4 倍。生产环境必须 cap 在 2~3 层 + Stam 算法精确求点，纯递归只用于离线高质量渲染。

5. **UV 坐标变形**：CC 细分会把每个顶点拉向邻居均值，**UV 坐标也跟着被平均**。如果你在控制网格上画了贴图，细分后纹理可能在非常规顶点处压缩或拉伸。Maya 提供 "UV interpolation modes" 让你选 "Linear UV" 还是 "Smooth UV"，理解 CC 之前这个开关谁也不知道在干什么。

## 适用 vs 不适用场景

**适用**：

- 角色建模 / 雕刻类工作流（Maya、Blender、ZBrush、Modo 都默认 CC）
- 需要光滑曲面的工业设计（汽车外壳、家电）
- 离线高质量渲染（电影、动画长片）
- 任意四边形为主的网格——CC 在四边形网格上行为最稳定

**不适用**：

- 三角形主导的网格 → 用 Loop subdivision
- 需要精确数学曲面（CAD 工程图、NURBS 工作流）→ 用 NURBS 或 T-spline
- 实时硬约束 + 简单几何（手机游戏低面模型）→ 直接用低面网格 + 法线贴图
- 锐边硬约束（机械工程）→ 至少要加 semi-sharp creases，否则会自动圆滑

## 历史小故事（可跳过）

- **1974 年**：Edwin Catmull 在犹他大学拿到博士学位，论文已经包含双三次 B 样条的早期想法。
- **1978 年**：Catmull 入职纽约理工的 Computer Graphics Lab（NYIT CGL），和 Jim Clark（后来 SGI 创始人）合作发表 CC 论文。同年 Daniel Doo 和 Malcolm Sabin 独立发表 Doo-Sabin 细分——也是四边形细分，但顶点规则不同，工业上不如 CC 流行。
- **1986 年**：Catmull 跟着 Lucasfilm 的图形部门被乔布斯买下，独立成立 Pixar。
- **1997 年**：Pixar《Geri’s Game》第一次工业化用 CC。
- **1998 年**：Stam 给出 CC 极限曲面的精确求值方法，CC 进入实时图形管线的视野。
- **2012 年**：Pixar 开源 OpenSubdiv，CC 成为整个行业的免费基础设施。
- **2019 年**：Catmull 因这一系列贡献和其他工作获 ACM 图灵奖。

## 学到什么

1. **拓扑通用 > 数学完美**：CC 牺牲了"任意点都 C²"换来了"任意网格都能用"——这个工程妥协才让它跑出实验室。
2. **递归定义 + 极限语义**：算法本身只描述"再切一次"，曲面是切无穷次的极限。这种"过程定义结果"的思路在很多领域复用（分形、IFS、流形几何）。
3. **平均 = 平滑**：CC 的三类点全是周围邻居的加权平均。这套"反复求邻居均值"的思维，后来被 Laplacian smoothing、Mean curvature flow、Diffusion Models 各自重新发现。
4. **工业落地比理论早 20 年**：Pixar 用 CC 用了 14 年（1978→1997 短片，更早就在内部试），Stam 1998 才给出严格的极限求值理论。理论补全往往跟在工程之后。

## 延伸阅读

- 论文 PDF：[Recursively Generated B-Spline Surfaces (1978)](https://users.aalto.fi/~lehtinj7/CS-C3100/2017/CatmullClark1978.pdf)
- Stam 1998 后续：[Exact Evaluation of Catmull-Clark Subdivision Surfaces at Arbitrary Parameter Values](https://www.dgp.toronto.edu/~stam/reality/Research/pdf/sig98.pdf)
- 工业化升级：[DeRose 1998 — Subdivision Surfaces in Character Animation](https://graphics.pixar.com/library/Geri/paper.pdf)
- 开源实现：[OpenSubdiv (Pixar)](https://graphics.pixar.com/opensubdiv/)
- 视频教程：[Catmull-Clark Subdivision — Bartosz Ciechanowski 风格交互讲解](https://observablehq.com/@esperanc/catmull-clark)

## 关联

- [[3d-gaussian-splatting]] —— 同样以"无显式拓扑表面"驱动渲染，但走的是点云方向，CC 走的是网格方向
- [[kajiya-1986-rendering-equation]] —— CC 给渲染方程提供"光滑表面"的几何输入
- [[cook-1984-distributed-ray-tracing]] —— Pixar 同期工作，CC + 分布式光追共同构成现代电影渲染管线
- [[cook-torrance-1982]] —— 微表面 BRDF 用 CC 提供的法线计算高光

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[baraff-witkin-1998-cloth]] —— Baraff-Witkin 1998 — 让布料模拟敢走大时间步
- [[catmull-1974-zbuffer]] —— Catmull 1974 Z-buffer — 用一张深度图解决谁挡谁的问题
- [[loop-1987-subdivision]] —— Loop 1987 — 三角形网格的递归光滑细分
- [[reyes-1987]] —— Reyes 1987 — 把电影级渲染拆成可流水线处理的小砖块
- [[stam-1999-stable-fluids]] —— Stable Fluids — 让流体模拟时间步随便给都不爆
