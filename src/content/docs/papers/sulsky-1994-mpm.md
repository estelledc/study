---
title: MPM — 让粒子背着自己的历史，借网格算一遍力
来源: Sulsky, Chen, Schreyer, "A Particle Method for History-Dependent Materials", Computer Methods in Applied Mechanics and Engineering, 1994
日期: 2026-05-31
分类: 计算机图形学
难度: 中级
---

## 是什么

Material Point Method（**MPM**）是一种把材料拆成**一群粒子 + 一张临时网格**两套表达的仿真方法。粒子负责"我是谁"（质量、速度、应力、变形历史），网格负责"我怎么动"（解牛顿第二定律）。每一步把粒子状态摊到网格上算一遍力，再把结果抄回粒子，网格就扔掉重铺。

日常类比：一群蚂蚁（粒子）背着各自的小本子（应力/历史）在地上爬。每过一刻，地面临时铺一张方格纸（网格），蚂蚁把速度抄到最近格子上，纸上算一遍 F=ma 得到新速度，蚂蚁再抄回小本子，纸撕掉。下一刻重新铺一张干净的。

这套"粒子记历史 + 网格算力学"的混合表达，是后来雪、沙、泥、果冻、橡皮泥这些**大变形材料**能在电影里飞起来的根本原因。

## 为什么重要

不理解 MPM，下面这些事都没法解释：

- 为什么 Disney《冰雪奇缘》(2013) 的雪会一坨坨堆起来又被踩散——纯欧拉网格跟不住塑性历史，拉格朗日有限元网格会被踩扭爆
- 为什么 Houdini 里 FLIP / Vellum 很常见，而雪沙泥这类大变形也常走 MPM（原生或插件管线）
- 为什么 Taichi / DiffTaichi 能让本科生在一个周末跑出一段橡皮泥仿真——MLS-MPM 把这套搬进了几百行 Python
- 为什么岩土工程里算边坡滑塌、混凝土破坏，用的也是同一套数学

一句话：**MPM 是"拉格朗日网格易扭爆、欧拉网格难跟材料历史"这个老问题的混合解**。

## 核心要点

MPM 的一个时间步可以拆成 **四步循环**：

1. **P2G（particle to grid）**：每个粒子把自己的质量、动量按**形函数**（决定"影响周围哪几个格子"的权重表）撒到邻居网格点。类比：蚂蚁把"我有多重、往哪走"抄到最近几张格子上。

2. **网格上解动量方程**：在网格点上算力（弹性力 / 重力 / 接触力）→ 加速度 → 速度更新。这一步形式上和有限元几乎一模一样。

3. **G2P（grid to particle）**：把网格点更新后的速度插回粒子，更新位置和**变形梯度 F**（一个 3×3 矩阵小本子，记这块材料被拉/压/剪了多少）。

4. **扔网格**：背景网格用完即弃，下一步**重新铺一张干净的**。只有粒子持久，所以网格根本没机会扭成麻花。

## 实践案例

### 案例 1：一粒雪的四步循环

```text
# 伪代码：一个时间步（2D，线性形函数 → 4 邻居）
P2G:  for p in particles:
          for i in neighbors(p):  # 最多 4 个格点
              grid.m[i] += w * p.m
              grid.mv[i] += w * p.m * p.v
Grid: for i in active_nodes:
          grid.v[i] = grid.mv[i] / grid.m[i] + dt * (f_elastic + g) / grid.m[i]
G2P:  for p in particles:
          p.v = sum_i w * grid.v[i]
          p.F = (I + dt * grad_v) @ p.F   # 更新变形历史
          p.x += dt * p.v
Discard grid; rebuild empty next step
```

**逐部分解释**：`p.F` 就是粒子小本子上的变形记录；网格只借一步算力就扔。踩、推、铲、撒时连通性怎么变都行——网格不跟物体走。

### 案例 2：同一坨材料，纯网格 vs MPM

```text
纯欧拉网格:  格点固定 → 拓扑变化容易，但"我被压实过"跟不住（格点不属于哪块雪）
纯拉格朗日FEM: 本构成熟 → 脚踩进雪、碎裂时网格连通性一变就扭爆
MPM:          粒子带塑性历史；网格一步一扔 → 两边好处缝起来
```

**逐部分解释**：Disney（Stomakhin et al, SIGGRAPH 2013）选 MPM，就是因为雪要同时记住"压实到 0.7 倍体积"又要允许碎裂。**弹塑性本构**（材料怎么弹回去、怎么永久变形）写在粒子上，不写在会扭爆的网格上。

### 案例 3：MLS-MPM 一个粒子的 P2G/G2P

```python
# 伪代码：Hu 2018 MLS-MPM 风格（极简）
for p in particles:
    for offset in neighbors_3x3:
        grid_v[base+offset] += w * (p.m * p.v + affine @ dpos)  # P2G
# 网格上：v += dt * f / m；再 G2P 回写 p.v、p.x、p.C
```

**逐部分解释**：`affine` / `C` 是局部速度场的线性近似，用来少耗散、少噪声。几百行 Python 就能跑果冻——这是 1994 论文留给 2026 本科生的礼物。DiffMPM / ChainQueen 再把整步写成可微张量，就能反推材料参数。

## 关键事实

- **粒子持久、网格临时**——区别于纯有限元（网格随物体）和纯 Eulerian（网格固定、物质流过）
- **变形梯度 F**——粒子上的 3×3 矩阵；本构从 F 算应力
- **形函数**——线性 / quadratic / cubic B-spline，邻居数约 8 / 27 / 64（3D）
- **PIC / FLIP / APIC**——三种 G2P：耗散大 / 噪声大 / 两者兼修

## 踩过的坑

1. **PIC vs FLIP**：原始 PIC 直接覆盖粒子速度，果冻像泥；FLIP 只传增量，能量保住但像在沸腾。**APIC**（Jiang 2015）两边都修了。
2. **Cell-crossing 抖动**：粒子穿网格线时线性形函数让力跳变——改用 quadratic / cubic B-spline（邻居变多）。
3. **不天然守恒**：动量/能量不严格守恒，长跑要防漂移（Affine / Hamiltonian MPM 等在改进）。
4. **CFL 仍要守**：粗略 `dt < dx / c`（c 为波速）；每格至少 **2×2×2** 粒子，太稀会"空格"。

## 适用 vs 不适用场景

**适用**：

- 大变形固体——雪、沙、泥、橡皮泥、布丁；弹塑性/粘塑性/相变
- 接触、自接触、碎裂等拓扑变化；工程边坡、冲击、混凝土破坏
- 离线电影特效；示意级实时可用粗网格（精细 60fps 通常不够）

**不适用**：

- 单纯流体/烟雾——Stable Fluids 或 FLIP 流体更轻
- 极薄壳、布料、绳索——各向异性太强，网格分辨率浪费
- 严格守恒或实时精细交互——优先有限元隐式，或别的专用解算器

## 历史小故事（可跳过）

- **1955**：Harlow 在 Los Alamos 发明 PIC，给等离子体和流体用
- **1986**：Brackbill 提出 FLIP，PIC 的能量友好版
- **1994**：Sulsky / Chen / Schreyer 把 PIC/FLIP 改造成带应力与变形历史的 **Material Point Method**
- **2013**：Stomakhin 等做出《冰雪奇缘》的雪，MPM 在图形学爆红
- **2015–2018**：Jiang 提出 APIC；Hu 提出 MLS-MPM + Taichi，门槛降到本科生

## 学到什么

1. **混合表达比单一表达强**：粒子记身份、网格算力学，各自做擅长的事
2. **临时数据结构是被低估的模式**：网格"用完即弃"根本性避开扭曲
3. **学科迁移要很久**：1994 固体力学 → 2013 Frozen → 2018 可微仿真，好想法跨学科漂流约 20 年
4. **数值方法的工程化**：从论文超参到"几行 Python 能跑"是 24 年压缩路径

## 延伸阅读

- 论文 PDF：[Sulsky, Chen, Schreyer 1994](https://www.sciencedirect.com/science/article/pii/0045782594901120)
- Disney 雪：[Stomakhin et al, SIGGRAPH 2013](https://www.math.ucla.edu/~jteran/papers/SSCTS13.pdf)
- 教程课件：[SIGGRAPH 2016 MPM Course](https://www.math.ucla.edu/~cffjiang/research/mpmcourse/mpmcourse.pdf)
- 现代实现：[Taichi MLS-MPM 88 行](https://github.com/yuanming-hu/taichi_mpm)
- [[stam-1999-stable-fluids]] —— 同时代流体奠基，分管纯流体
- [[hu-2018-mls-mpm]] —— MLS-MPM 把工程门槛拉低

## 关联

- [[stam-1999-stable-fluids]] —— 流体走纯网格 + 半 Lagrangian；MPM 走粒子 + 网格混合
- [[hu-2018-mls-mpm]] —— 把经典 MPM 重写成可实时示意的现代版本
- [[kajiya-1986-rendering-equation]] —— 渲染管"光怎么走"，MPM 管"物质怎么动"
- [[disney-brdf-2012]] —— Disney 工业 pipeline 另一环；与 Frozen 同期生态
- [[macklin-2014-position-based-fluids]] —— 另一路粒子流体；对照 MPM 的历史依赖固体侧
- [[monaghan-1992-sph]] —— SPH 纯粒子无网格，对照 MPM 的"借网格算力"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[disney-brdf-2012]] —— Disney Principled BRDF 2012 — 11 个滑块封装 Cook-Torrance 全家桶
- [[hu-2018-mls-mpm]] —— MLS-MPM — 把 MPM 重写到"几百行能跑实时"的现代版本
- [[kajiya-1986-rendering-equation]] —— Kajiya 渲染方程 — 把所有渲染算法统一成一个积分方程
