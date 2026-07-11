---
title: Loop 1987 — 三角形网格的递归光滑细分
来源: Charles Loop, "Smooth Subdivision Surfaces Based on Triangles", master thesis, University of Utah, 1987
日期: 2026-05-31
分类: 图形学
难度: 中级
---

## 是什么

Loop 细分（**Loop scheme**）是一套**反复把三角形网格切细，最终收敛成一张光滑曲面**的方法。日常类比：木雕粗坯打磨——你拿到一块棱角分明的木块，每打一遍砂纸，棱角就钝一点，打三五遍之后摸上去就像鹅卵石。

Loop 不像 Catmull-Clark 那样处理四边形网格，它**只吃三角形网格**——这一点让它天然契合：游戏引擎里所有渲染最终都被切成三角形、3D 扫描出来的网格也是三角形、Mesh shader / GPU tessellation 硬件原生处理的也是三角形。

数学角度看，Loop 把规则三角网格上的 **4 次盒样条（quartic box spline）** 推广到了任意拓扑。一次细分把每个三角形切成 4 个小三角形（不是切两半，是切成 4 个），然后按一套固定权重重算所有顶点位置。

## 为什么重要

不知道 Loop 这件事，下面这些解释不通：

- 为什么 Catmull-Clark 是四边形派、Loop 是三角形派——同一个时代两个世界两套算法
- 为什么游戏引擎做 LOD（远处低模、近处高模）能"实时"提升精度——Loop 是其中一种主流方案
- 为什么 OpenSubdiv（Pixar 2012 开源）里两套并存——CC 给电影艺术家、Loop 给游戏管线
- 为什么 DirectX 11 引入硬件 tessellation 时直接选了类似 Loop 的三角分裂模式

## 核心要点

Loop 把一次细分拆成 **两类新点**：

### 1. 边上新点（odd vertex）

每条边中点会生成一个新顶点。它**不是**简单的两端点平均，而是按 3/8 + 3/8 + 1/8 + 1/8 的权重：

```
        v3
        /\
       /  \
      /    \
   v1 ------ v2     新点 e = 3/8*v1 + 3/8*v2 + 1/8*v3 + 1/8*v4
      \    /
       \  /
        \/
        v4
```

也就是边的两个端点各占 3/8，边两侧的两个对顶点各占 1/8。直觉：新点离边重，离对顶点轻，但完全不忽略对顶点——这正是它能光滑的关键。

### 2. 老顶点的新位置（even vertex）

每个原顶点也要被"重算"成一个新位置（不会原地不动）。设这个老顶点的**邻居数**为 n（图论里叫度数 / valence），新位置的公式：

```
v_new = (1 - n*β) * v_old + β * (邻居之和)
```

其中 **β** 是按 n 算出来的权重：

```
β = (1/n) * [ 5/8 − (3/8 + (1/4)*cos(2π/n))² ]
```

公式看着吓人，但记一个常用情形就够：**正则点 n = 6** 时，β = 1/16。也就是新位置 = 5/8 老位置 + 1/16 × 6 个邻居（每个邻居权重 1/16）。

为什么 n = 6 是"正则"？因为平面上等边三角形铺开时，每个顶点恰好接 6 个三角形——这是三角网格的"理想态"。其他度数（3、4、5、7…）叫**奇异点**（extraordinary vertex），它们的处理只能 C¹ 连续。

### 3. 切完之后

一次细分后，每个老三角形 ABC 变成 4 个小三角形：中间一个由三个新边点组成，剩下三个分别在 A、B、C 三个角上。三角形数 ×4，顶点数大约 ×4。

## 为什么会光滑（一句话直觉）

Loop 在他的论文里证明：**不断重复这两条规则**，曲面在正则点处收敛到**盒样条曲面**（一种已知光滑的连续曲面），所以是 **C² 连续**（二阶导数处处连续）。

奇异点处证明用了**特征值分析**——把"细分"看成一个矩阵作用，要求矩阵的最大特征值是 1，第二第三大相等且小于 1，这样反复作用之后曲面会收敛到一个切平面。Loop 的两条权重就是为了凑出这个特征值结构反推出来的。

## 实践案例

### 案例 1：一次细分的三步伪代码

```python
def loop_subdivide(mesh):
    # 1) 每条边插 odd 点：e = 3/8*(v1+v2) + 1/8*(v3+v4)
    odds = {edge: odd_vertex(edge) for edge in mesh.edges}
    # 2) 每个老顶点算 even 点：v' = (1-n*β)*v + β*sum(neighbors)
    evens = {v: even_vertex(v) for v in mesh.verts}
    # 3) 每个三角形 ABC → 四个小三角形
    faces = []
    for a, b, c in mesh.faces:
        ab, bc, ca = odds[edge(a,b)], odds[edge(b,c)], odds[edge(c,a)]
        faces += [(evens[a], ab, ca), (evens[b], bc, ab),
                  (evens[c], ca, bc), (ab, bc, ca)]
    return Mesh(evens, odds, faces)
```

**逐步解释**：先插边点（决定光滑度），再挪老点（避免棱角残留），最后重连拓扑（三角形数 ×4）。OpenSubdiv 的 `Far::TopologyRefiner` 选 Loop scheme 时，做的就是这三步。

### 案例 2：游戏 LOD 怎么用

1. 近距离：跑 2 级 Loop（×16 三角形），表面光滑、看不到棱。
2. 中距离：跑 1 级（×4）。
3. 远距离：用原始低模，省填充率。

切换由 GPU 按相机距离决定；DirectX 11 / OpenGL 4 的 tessellation shader 用类似的三角分裂模式。

### 案例 3：3D 扫描后处理

1. 点云三角化后表面有阶梯感。
2. 跑 1–2 次 Loop，阶梯变平滑斜面。
3. 检查 n≠6 的奇异点：反光金属件上可能留小平面（只有 C¹），必要时局部加密或换带 crease 的扩展。

## 踩过的坑

1. **Loop 只吃三角网格**：拿到混合 n 边形（含四边形、五边形），必须先三角化再细分。三角化方式不同 → 细分结果不同（不是天然唯一的）。
2. **奇异点只 C¹**：n ≠ 6 的顶点处只能保证一阶光滑，二阶导数会跳。在反射强的渲染下能看到一个小亮斑。游戏里通常无所谓，影视渲染要在意。
3. **没有锐边/折痕**：原始 Loop 假设网格处处光滑。要做"硬边"（比如方块的角不能被磨圆），得用 Hoppe 1994 的扩展（"piecewise smooth"）—— 给边打标签，标了的边在细分时按特殊规则处理。
4. **内存爆炸**：每级 ×4 三角形。3 级 = 64×。要做 LOD 必须懒求值，不能预先全展开。
5. **β 的公式有多个版本**：原版 Loop 1987 的 β 和 Warren 1995 的简化版（β = 3/(8n) for n > 3, β = 3/16 for n = 3）数值上接近但不一样。OpenSubdiv 用 Warren 版。

## 适用 vs 不适用

**适用**：
- 三角网格的光滑化（游戏 / 实时渲染 / GPU tessellation）
- 角色建模、有机形状（人脸、动物、布料）
- 3D 扫描点云后处理

**不适用**：
- 四边形主导的网格 → 用 Catmull-Clark（[[catmull-clark-1978]]）
- 需要精确锐边的硬表面（CAD / 工业件）→ 用 NURBS 或带 crease 的扩展
- 拓扑会变（比如撕裂、合并） → 细分假设拓扑稳定
- 极高精度科学可视化（要 C∞）→ 用解析曲面

## 历史小故事（可跳过）

- **1974 年**：Catmull 在博士论文里提出"递归把曲面切细"的想法，但只对规则四边形可用
- **1978 年**：Catmull-Clark 把它推广到任意拓扑四边形网格 → [[catmull-clark-1978]]
- **1987 年**：Charles Loop 在犹他大学（Tony DeRose 指导）的硕士论文 44 页，把三角形版本搞定
- **1994 年**：Hoppe 等扩展支持锐边、角点（"Piecewise Smooth Surface Reconstruction", SIGGRAPH 94）
- **1996-2000**：Reif、Schweitzer 等用特征值分析正式证明 Loop 在奇异点的连续性
- **2012 年**：Pixar 开源 OpenSubdiv，CC + Loop 双方案同时进入工业级 GPU 实现

四十年后，三角网格细分仍然是 Loop 的形状。

## 学到什么

1. **细分曲面 = 极限过程**：定义不是"曲面方程"，而是"反复施加一条规则，看它收敛到哪"。这是一种全新的几何定义方式
2. **三角 vs 四边形是两个并行宇宙**：CC 和 Loop 同时代发展，互不替代——选哪个看你的网格类型
3. **特征值反推权重**：先想"我希望曲面光滑（一阶/二阶连续）"，再用特征值条件**倒推**出权重公式。这是从需求到算法的经典推理路径
4. **正则 vs 奇异**：连续性在"理想态"和"边缘态"是两种不同的保证。工程上要承认边缘态的妥协

## 延伸阅读

- 论文 PDF：[Loop 1987 master thesis](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/thesis-10.pdf)（44 页，Microsoft Research 镜像）
- Pixar OpenSubdiv 文档：[OpenSubdiv Subdivision Surfaces](https://graphics.pixar.com/opensubdiv/docs/subdivision_surfaces.html)（CC 和 Loop 双讲解）
- 教程视频：[Subdivision Surfaces — Computer Graphics](https://www.youtube.com/results?search_query=loop+subdivision+tutorial)（搜 "loop subdivision tutorial"）
- Hoppe 1994 SIGGRAPH 锐边扩展（让 Loop 能做硬表面）
- [[catmull-clark-1978]] —— 四边形版本（同代姊妹算法）
- [[3d-gaussian-splatting]] —— 现代非细分曲面表示（点云直接渲染）

## 关联

- [[catmull-clark-1978]] —— 同期的四边形细分；CC + Loop 是 Pixar OpenSubdiv 的两大支柱
- [[3d-gaussian-splatting]] —— 现代另一条路：跳过显式曲面，用高斯点直接表示
- [[disney-brdf-2012]] —— 渲染端：Loop 给几何，Disney BRDF 给材质
- [[goral-1984-radiosity]] —— 同时代图形学经典；当年的 SIGGRAPH 黄金年代

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[desbrun-1999-implicit-fairing]] —— Desbrun 1999 — 把热扩散方程隐式离散到三角网
- [[meagher-1982-octree]] —— Meagher 1982 八叉树 — 把立方体一分为八，递归地装下一整个 3D 世界
- [[reyes-1987]] —— Reyes 1987 — 把电影级渲染拆成可流水线处理的小砖块
- [[stam-1999-stable-fluids]] —— Stable Fluids — 让流体模拟时间步随便给都不爆
- [[taubin-1995-mesh-smoothing]] —— Taubin 1995 — 把网格平滑当成低通滤波
