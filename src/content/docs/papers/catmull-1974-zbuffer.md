---
title: Catmull 1974 Z-buffer — 用一张深度图解决谁挡谁的问题
来源: Catmull, "A Subdivision Algorithm for Computer Display of Curved Surfaces", PhD Thesis, University of Utah, 1974
日期: 2026-05-31
分类: 图形学
难度: 入门
---

## 是什么

Z-buffer（深度缓冲）是一种**逐像素决定"前面挡住后面"的算法**。日常类比：你给屏幕上每个像素配一支铅笔和一张小纸条。每画一笔都先看纸条上写的"上次画的东西离镜头多近"，新笔画只有比上次更近才覆盖颜色，并把自己的距离写到纸条上。一帧画完，每个像素留下的就是离镜头最近的那一笔。

Edwin Catmull 1974 年在犹他大学的博士论文里第一次系统提出这套办法。论文标题虽然是"曲面细分显示"，但里面顺手发明了两个东西：**Z-buffer**（深度缓冲）和 **texture mapping**（纹理映射）。两个一起把"3D 物体怎么在 2D 屏幕上画对"这件事降到了暴力级别——不需要解析几何，靠像素硬比深度。

这就是今天 OpenGL、Vulkan、Metal、DirectX 默认深度测试的祖宗，每张游戏画面背后都开着一块 Z-buffer。

## 为什么重要

不知道 Z-buffer 这件事，下面这些都解释不通：

- 为什么现代 GPU 要专门留一大块显存叫"depth buffer"，而且尺寸和颜色缓冲一样大
- 为什么 OpenGL 要 `glEnable(GL_DEPTH_TEST)` 才能画对 3D，不开就出现"远处物体压在近处之上"
- 为什么 Catmull 后来能创办 Pixar、2019 年拿图灵奖——Z-buffer 是他奠基性的多项发明里最普及的一个
- 为什么 1990 年代之前的 SGI 工作站卖那么贵——硬件 Z-buffer 当时是奢侈品，PC 显卡到 1996 年 Voodoo 才普及
- 为什么 GPU 的"render output unit (ROP)"模块是固定功能硬件——它做的就是 Z-buffer 比较和颜色混合，每秒几百亿次，软件做不动
- 为什么所有现代后处理特效（景深、SSAO、屏幕空间反射）都拿 depth buffer 当输入——它顺手就把每像素几何信息记下来了

## 核心要点

Z-buffer 的算法可以拆成三步：

1. **初始化**：每帧开始把 depth buffer 全部填成"最远"（通常 z = 1.0 或 +∞）。颜色 buffer 填背景色。

2. **每个三角形光栅化**：把三角形拆成像素级的"片元"（fragment）。每个片元算出自己的 (x, y, z)。

3. **逐片元深度测试**：读 depth buffer 在 (x, y) 上的旧 z；如果新片元 z **更近**，就覆盖颜色 buffer 并把新 z 写回 depth buffer；否则丢弃。

复杂度：时间 O(N)，N 是片元总数；空间 O(像素数)。它的杀手特性是**和场景拓扑无关**——再奇怪的环交叉、自相交、互穿物体都只是逐像素比 z 而已。

## 实践案例

### 案例 1：OpenGL 里你看不见的几行

```c
glEnable(GL_DEPTH_TEST);
glDepthFunc(GL_LESS);
glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
// 画三角形
```

短短四行就启用了 Catmull 1974 的全部思想。`GL_LESS` 是默认比较函数（新 z 更小才通过），`glClear` 那一步就是上面说的"初始化为最远"。**整个 GPU 渲染管线最末端的"raster ops"阶段**，就是硬件版的 Z-buffer 比较。

### 案例 2：经典 bug — 不开深度测试

新人写第一个 OpenGL 立方体常忘了 `glEnable(GL_DEPTH_TEST)`，结果立方体某些面颠倒——**后画的覆盖先画的**，与"谁离镜头近"无关。这就退化成了 1970 年代的"画家算法"。开了深度测试立刻正常。在 WebGL / three.js 里也一样，调试 3D 怪现象第一步就是看深度测试有没有开。

```js
// three.js 里故意关掉深度测试，会看到后画的面盖住前面的面
material.depthTest = false
renderer.render(scene, camera)

// 修复：让每个片元先和 depth buffer 比较
material.depthTest = true
renderer.render(scene, camera)
```

逐部分解释：

- `depthTest = false` 时，渲染顺序比几何远近更重要，所以画面会"穿帮"
- `depthTest = true` 时，GPU 才会为每个像素检查谁更靠近相机
- 如果 3D 物体前后关系异常，先查这一项比先改模型顶点更有效

### 案例 3：Z-fighting（深度冲突）

两个三角形几乎重合（比如墙上贴海报），depth buffer 精度有限（通常 24 位定点），它们的 z 值在浮点误差内分不清，每帧随机选一个像素胜出，画面上出现刺眼的闪烁条纹。这是 Z-buffer 算法的内在缺陷。修法三种：

- 把海报往墙外推一点（最常见）
- 用 `glPolygonOffset` 给后画的偏移一个小 z
- 提高近裁剪面 `near`，把宝贵精度让给近处

```c
glEnable(GL_POLYGON_OFFSET_FILL);
glPolygonOffset(-1.0f, -1.0f);
drawPosterOnWall();
glDisable(GL_POLYGON_OFFSET_FILL);
```

逐部分解释：

- `GL_POLYGON_OFFSET_FILL` 告诉 GPU：填充多边形时给深度值加一个小偏移
- `glPolygonOffset` 的两个参数控制偏移大小，让海报稳定赢过墙面
- 这只是工程补丁，根因仍是两个面太接近、depth buffer 精度不够

### 案例 4：用 Z-buffer 做后处理特效

游戏里的"景深模糊"、"屏幕空间环境光遮蔽（SSAO）"、"屏幕空间反射"都不是新算几何，而是**直接读 Z-buffer**：每像素深度差就够推断"这个像素离相机多远、附近有没有遮挡"。Z-buffer 在 2010 年代被重新发现是"几何信息的免费副产品"。

```glsl
float z = texture(depthTexture, uv).r;
float blur = smoothstep(focusNear, focusFar, abs(z - focusDepth));
vec3 color = mix(sharpColor, blurredColor, blur);
```

逐部分解释：

- `depthTexture` 就是一帧渲染时留下的 Z-buffer 拷贝
- `abs(z - focusDepth)` 表示当前像素离焦点平面有多远
- `mix` 按距离混合清晰图和模糊图，这就是景深效果的最小模型

## 踩过的坑

1. **z 不是线性的**：透视投影后 z 在 NDC 空间是 1/z 的非线性映射，**近处精度高、远处精度低**。所以远处物体容易 Z-fighting，相机近裁剪面（near plane）设太小会让所有 z 都挤在一起更糟。

2. **Z-buffer 不处理半透明**：透明物体需要"按深度从远到近排序后混合"，Z-buffer 只能选一个胜者。OpenGL 标准做法是先画不透明用 Z-buffer，再单独按 CPU 排序画透明。

3. **1974 年没人能用**：当时一帧 1024×1024 的 16 位 Z-buffer 要 2 MB 内存——Cray-1 整机才 8 MB。Catmull 论文里只在小分辨率下跑了概念验证，工业化要等 1990 年代显存白菜化。

4. **早期算法竞争者**：画家算法（按面排序）、扫描线算法（逐扫描线维护活跃边表）、BSP 树（预处理空间分割）都比 Z-buffer 省内存，但都败在拓扑限制上——环交叉的三角形画家算法直接无解。

5. **overdraw 浪费**：Z-buffer 一个三角形画到一半才发现被前面挡住，后面的着色全是白干。所以现代引擎做 **early-z**（光栅化前先比深度）和 **hi-z**（分层金字塔深度图加速剔除），还有 z-prepass（先只写深度不写颜色，第二趟才上色）。

## 适用 vs 不适用场景

**适用**：

- 实时渲染主流程（游戏、CAD、可视化）——所有现代 GPU 内置硬件支持
- 任意拓扑、自相交、动态场景——Z-buffer 不在乎几何关系
- 与延迟渲染（deferred shading）配合——G-buffer 的深度通道直接复用
- 阴影贴图（shadow mapping）——从光源视角再渲一张 Z-buffer 当深度图
- 屏幕空间几何信息查询——后处理通道按 z 反推世界坐标

**不适用**：

- 半透明物体（需排序 + 混合，或专用算法如 OIT — order-independent transparency）
- 海量重叠片元（overdraw 多时浪费带宽，要配合 early-z、hi-z 优化）
- 离线高质量渲染（Pixar 自家 RenderMan 早期用 REYES，不是纯 Z-buffer）
- 体渲染（云、雾、烟）——单一深度值无法描述参与介质

## 历史小故事（可跳过）

- **1974 年**：Catmull 的博士导师是犹他大学 Ivan Sutherland 团队，那年 Catmull 同时发表了三件事——Z-buffer、纹理映射、双线性插值。一篇论文奠基三个工业标准。
- **1976 年**：他离开犹他去纽约理工 NYIT 建动画实验室，团队后来整体被 Lucasfilm 挖走。
- **1980 年代**：SGI（Silicon Graphics）把 Z-buffer 做成专用硬件，工作站售价数十万美元，是好莱坞特效公司和军方仿真器的标配。
- **1986 年**：Lucasfilm 计算机图形部独立成 Pixar，Catmull 任 CTO/总裁直到 2019 退休。
- **1992 年**：OpenGL 1.0 发布，Z-buffer 正式成为跨平台 3D API 的标配组件。
- **1996 年**：3dfx Voodoo 显卡把硬件 Z-buffer 带进 PC，从此 PC 游戏 3D 化的门槛崩塌。
- **2019 年**：Catmull 与 Pat Hanrahan 共获 ACM 图灵奖，引文专门提了 Z-buffer。

## 学到什么

1. **暴力 + 内存换时间**是图形学的反复主题。Z-buffer 不优雅但通用，最终赢过所有"聪明"的算法。
2. **算法早于硬件 20 年**很常见。Catmull 1974 的想法等到 1996 年才进入 PC，并不是算法不好而是内存太贵。
3. **拓扑无关性**是 Z-buffer 真正的胜负手。对硬件友好（每像素独立、可并行）这个特性 1974 年看不出来，但 GPU 时代变成核心优势。
4. **一个博士论文里塞三个工业标准**是 1970 年代图形学黄金期的常态——领域刚开荒，大想法到处是。
5. **简单算法的副产品往往比算法本身更重要**。Z-buffer 后来被发现可以驱动景深、SSAO、屏幕空间反射等一堆特效，这些用法 1974 年根本想不到。

## 与画家算法的对比（一张表）

| 维度 | 画家算法 (1972) | Z-buffer (1974) |
|------|-----------------|-----------------|
| 单位 | 整个面 | 单个像素 |
| 排序 | 必须按深度 | 不需要 |
| 内存 | 仅颜色 buffer | 颜色 + 深度 buffer（×2） |
| 拓扑 | 环交叉/自相交无解 | 全部能处理 |
| 并行 | 难（顺序依赖） | 极易（每像素独立） |
| 命运 | 1990s 退出主流 | 至今所有 GPU 默认 |

这张表浓缩了 50 年图形学硬件演化的方向：**用内存换通用性、换并行度**。

## 延伸阅读

- 论文 PDF：[Catmull 1974 PhD Thesis](https://collections.lib.utah.edu/details?id=1107669)（235 页，第 4 章是 Z-buffer）
- 教程：[LearnOpenGL — Depth Testing](https://learnopengl.com/Advanced-OpenGL/Depth-testing)（中文社区有翻译，配可视化）
- 书：[Real-Time Rendering, 4th](https://www.realtimerendering.com/) 第 23 章讲现代硬件 Z-buffer 实现细节
- 文章：[NVIDIA — Depth Precision Visualized](https://developer.nvidia.com/content/depth-precision-visualized)（讲 z 非线性精度的可视化，理解 Z-fighting 的根源）
- 视频：[Cherno — OpenGL Depth Testing](https://www.youtube.com/watch?v=3sg5vJVeEME)（10 分钟看清 enable/disable 区别）
- [[catmull-clark-1978]] —— Catmull 四年后的另一篇里程碑论文
- [[saito-takahashi-1990-gbuffer]] —— G-buffer，Z-buffer 思想的延伸版（每像素存多通道几何信息）

## 关联

- [[catmull-clark-1978]] —— 同一作者的曲面细分算法，Pixar 角色建模标准
- [[saito-takahashi-1990-gbuffer]] —— G-buffer 把"每像素存一个值"扩展到多通道，延迟渲染的基础
- [[kajiya-1986-rendering-equation]] —— 渲染方程，Z-buffer 解决可见性、它解决光照
- [[meagher-1982-octree]] —— Octree 空间结构，另一类隐藏面消除思路（拓扑预处理）
- [[goral-1984-radiosity]] —— Radiosity 全局光照，与 Z-buffer 同期的图形学早期工作

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[perlin-1985-noise]] —— Perlin Noise — 让计算机生成的图像不再有"机器味"
- [[reyes-1987]] —— Reyes 1987 — 把电影级渲染拆成可流水线处理的小砖块
- [[williams-1983-mipmap]] —— Williams 1983 mipmap — 提前烤好金字塔，纹理过滤变 O(1)
