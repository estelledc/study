---
title: Perlin Noise — 让计算机生成的图像不再有"机器味"
来源: Ken Perlin, "An Image Synthesizer", SIGGRAPH 1985
日期: 2026-05-31
子分类: 渲染与图形
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

Perlin noise 是一个**给定空间任意一点 (x,y,z)，吐出一个看起来"自然随机"的数**的函数。日常类比：像一张铺满全宇宙的"电视雪花点"地毯——但相邻像素之间是**平滑**渐变的，不是扎眼的颗粒。

```
noise(0.31, 1.42, 0.05)  →  0.247
noise(0.32, 1.42, 0.05)  →  0.251   ← 邻近点几乎相同
noise(8.10, 1.42, 0.05)  →  -0.483  ← 远处又是另一种花纹
```

这个函数是大理石纹路 / 木头年轮 / 火焰 / 烟雾 / Minecraft 地形 / 阿凡达云海背后的同一根引擎。

## 为什么重要

1985 年之前的计算机图形有一种公认的"塑料感 / 机器味"——所有表面要么纯色、要么贴一张事先画好的图。Ken Perlin 在 MAGI 公司做电影《Tron》（1982）时被这种"太干净"的画面折磨到了——**自然界没有完全平滑的表面**。

他造了 noise 这一个函数，**整个工业的"程序化纹理"分支就此打开**：

- 不用画师再手绘上千张木纹贴图
- 地形可以无限大（Minecraft 世界 60M × 60M 个方块都从这里算）
- 烟雾火焰不用粒子系统逐个模拟
- Ken Perlin 1997 年拿了**奥斯卡技术成就奖**——一个数学函数拿了奥斯卡

## 核心要点

Perlin noise 的算法可以拆成 **四步**：

1. **撒种子**：在整数格点（…,(0,0,0), (1,0,0), (0,1,0)…）上预先放好"伪随机方向向量"。类比：把一张钉子板上每个钉子拴一根细绳，每根绳指向随机方向。

2. **找笼子**：对采样点 P，找到包住它的 8 个角（3D 立方体的 8 顶点）。

3. **算每根绳**：对每个角的"细绳方向" g，算 `dot(g, P - 角坐标)`——这是一个**沿着 g 方向的线性斜坡**，在该角上为 0。

4. **平滑插值**：把 8 个斜坡值用 smoothstep 函数（`3t^2 - 2t^3`）按 x/y/z 三方向加权平均。原版 1985 用 cubic，2002 改进版用 `6t^5 - 15t^4 + 10t^3`（quintic）来让二阶导也连续。

输出：一个范围 [-1, 1]、相邻点平滑、远点独立的"伪随机场"。

### 为什么选"格点 + 梯度"这个结构

直接 `rand(x, y, z)` 不行——同一点必须吐同一个数（确定性），而且相邻点要相似（平滑）。如果在每个采样点直接随机，就是电视雪花，没法用。

Perlin 的构造法妙在：**有限个钉子**（256 个置换表条目）通过哈希就能伪装出**无限大**的随机场。256 在每个维度上循环——3D 空间被切成 256³ 个独立子立方体，肉眼根本看不出周期。这是工程上的精打细算，不是炫技。

## 实践案例

### 案例 1：大理石纹

```
color = colormap(sin(x + 4 * turbulence(p)))
```

逐部分解释：

- `turbulence(p) = sum_k |noise(2^k * p)| / 2^k`——把多个尺度的 noise 叠起来，造出"层层分形"细节
- `sin(x + ...)` 让纹理沿 x 方向有条纹趋势
- `+ 4 * turbulence` 把直条纹"揉皱"成大理石那种弯曲脉络
- `colormap` 把数值映成黑白灰

整段是 **Perlin 1985 论文 9.3 节原版配方**。一行公式，无穷大理石。

### 案例 2：Minecraft 地形

```
height(x, z) = sum_k amplitude_k * noise(frequency_k * (x, z))
```

- 第 0 层：低频（大山脉，freq=0.001，amp=64）
- 第 1 层：中频（丘陵起伏，freq=0.01，amp=16）
- 第 2 层：高频（碎石细节，freq=0.1，amp=2）

加起来就是 Notch 在 2009 年用 Perlin noise 做出的那个无限世界。**世界种子（seed）就是给那张随机方向表换一种打乱方式**。

### 案例 3：火焰

```
density(p, t) = turbulence(p + t * (0, 1, 0))
```

让 turbulence 沿 y 方向以时间 t 偏移——观感就是"烟从下往上飘"。Hollywood 90% 的烟雾 / 爆炸特效底层都这一招。

### 案例 4：木头年轮

```
ring = floor(sqrt(x^2 + y^2) + 0.2 * turbulence(p))
color = lerp(浅黄, 深棕, smoothstep(0, 1, ring - floor(ring)))
```

读法：先以 (0,0,z) 为轴算到该点的距离 → 整数取整就是同心圆 → 用 turbulence 微微扰动让圆不完美。这就是 Perlin 1985 论文 9.4 节的木纹配方，**整个游戏 / 影视行业沿用了 40 年**。

## 踩过的坑

1. **value noise 不是 gradient noise**：value noise 是"在格点放随机数"再插值；Perlin noise 是"在格点放随机方向"再算斜坡。前者更便宜但**显得糊**，后者细节更锋利。常见 tutorial 把两者搞混。

2. **原版 1985 的 cubic 插值有可见瑕疵**：`3t^2 - 2t^3` 一阶导连续但二阶导跳，做法线贴图（normal map）时能看出**带状条纹**。Perlin 自己 2002 年发了 "Improving Noise" 改成 quintic。

3. **octave 数 + persistence 没调好就废**：叠层时每层振幅要乘 persistence（一般 0.5）。设太大→输出爆炸；设太小→看不出细节。新人最常见错误。

4. **维度 d 越高越慢**：3D 要 8 个角，4D 要 16 个角，5D 要 32——指数爆炸。Perlin 自己 2001 年发明 **simplex noise** 用三角形剖分把复杂度降到 O(d^2)，4D 以上必须用它。

## 适用 vs 不适用场景

适用：

- 需要"自然随机但平滑"的纹理（云、火、水、大理石、木纹、皮革）
- 程序化地形 / 行星表面（Minecraft, No Mans Sky）
- 流体 / 烟雾的扰动场
- 任意维度的"连续随机函数"需求

不适用：

- 需要严格周期或精确控制的纹理 → 用显式贴图
- 4D 以上 → 用 simplex noise（同作者 2001）
- 蓝噪声分布（采样、抖动）→ Perlin 是低频偏多的**红噪声**，要蓝噪声请用 Poisson disk
- 极端写实（真实大理石的微观结构）→ 还得加物理仿真

## 历史小故事（可跳过）

- **1982 年**：Ken Perlin 在 MAGI 公司给电影《Tron》做 CGI，受不了画面的"塑料感"。
- **1983 年**：他在 NYU 读博期间写出第一版 noise，给电影《无尽的故事》做天空。
- **1985 年**：SIGGRAPH 论文 "An Image Synthesizer" 公开 noise / turbulence / 大理石木纹配方。
- **1997 年**：Academy of Motion Picture Arts and Sciences 颁给他**技术成就奖（Technical Achievement Award）**——影坛对这套数学的认可。
- **2001-2002 年**：Perlin 自己发了 simplex noise + improving noise，把 1985 版的两个缺陷（高维爆炸、二阶导不连续）都修了。

## 学到什么

1. **"看起来随机"和"真随机"是两种东西**——Perlin noise 完全确定（同输入同输出），但人眼觉得"自然"
2. **平滑 + 多频叠加 = 分形**——单层 noise 没意思，叠几层就有山脉、火焰、云
3. **一个数学函数能开一个工业**——程序化生成（procedural generation）整个分支，从 1985 这 6 页论文开始
4. **第一版常常不完美**：1985 的 cubic 插值 17 年后才被作者本人改成 quintic；好东西也可以慢慢改
5. **3D 而不是 2D 是关键决策**：很多噪声方案当年只做 2D 贴图，Perlin 一开始就 3D。后果——把木头切成两半，新切面纹理自动连续，不需要重新 UV 展开。这种"实体纹理"（solid texture）的设计选择比单点算法更深远

## 延伸阅读

- 论文 PDF：[Perlin 1985 — An Image Synthesizer](https://dl.acm.org/doi/10.1145/325165.325247)（6 页，密度高）
- 改进版：[Perlin 2002 — Improving Noise](https://mrl.cs.nyu.edu/~perlin/paper445.pdf)（quintic 插值 + permutation 表优化）
- 视频教程：[The Coding Train — Perlin Noise](https://www.youtube.com/watch?v=Qf4dIN99e2w)（动画讲解，零基础友好）
- 交互演示：[Inigo Quilez — Value vs Gradient Noise](https://iquilezles.org/articles/morenoise/)（在浏览器里玩参数）

## 关联

- [[catmull-1974-zbuffer]] —— 1974 年 z-buffer 让"任意 3D 物体能渲染"，Perlin 给这些物体表面加了"自然纹理"
- [[phong-1975]] —— Phong 着色让金属和塑料看着真，但表面还是"太干净"，Perlin 接力把"脏"加回去
- [[kajiya-1986-rendering-equation]] —— 一年后 Kajiya 写下渲染方程统一光照；Perlin 解决"表面长什么样"，Kajiya 解决"光怎么传"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[catmull-1974-zbuffer]] —— Catmull 1974 Z-buffer — 用一张深度图解决谁挡谁的问题
- [[cook-1986-stochastic-sampling]] —— Cook 1986 — 用噪声换掉锯齿
- [[kajiya-1986-rendering-equation]] —— Kajiya 渲染方程 — 把所有渲染算法统一成一个积分方程
- [[phong-1975]] —— Phong 1975 — 把光照拆成环境+漫反射+高光三项

