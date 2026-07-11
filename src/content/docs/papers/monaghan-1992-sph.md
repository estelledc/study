---
title: SPH — 把流体拆成一群带核的粒子
来源: Monaghan, "Smoothed Particle Hydrodynamics", Annual Review of Astronomy and Astrophysics, 1992
日期: 2026-05-31
分类: 计算机图形学
难度: 中级
---

## 是什么

SPH（Smoothed Particle Hydrodynamics，**光滑粒子流体动力学**）不用网格描述流体——它把整片流体**拆成一群粒子**，每个粒子带质量、位置、速度、密度。每个粒子周围套一个柔和的"光圈"（核函数），任意一点的物理量就是覆盖到那一点的粒子按光圈强度加权求和。

日常类比：网格法（Stam 1999 那种）像棋盘——固定方格子，水从格子里流过去；SPH 像一群水滴本身——你跟着每滴水跑，水滴重叠的地方密度就大。

Monaghan 1992 这篇 60+ 页的综述把零散十几年的 SPH 工作（恒星塌缩、激波、粘性流）拧成一整套**能落地的方法手册**，至今仍是入门必读。

## 为什么重要

不理解 SPH，下面这些事都没法解释：

- 为什么《冰雪奇缘》的雪、影视里的爆炸碎块、游戏里的水花飞溅——网格法做不顺，SPH 系（含其后裔 MPM/FLIP）能做
- 为什么 Houdini 里 Particle Fluid 节点和 FLIP Solver 节点同时存在——前者就是 SPH 后裔
- 为什么 NVIDIA PhysX FleX、Unity Obi Fluid、Houdini Particle Fluid 都要在 GPU 上跑邻居搜索——粒子法（SPH 及其近亲）单步主要开销就是这一步
- 为什么这套方法 1977 年是为模拟星系合并发明的，30 年后却成了游戏液体的主流路线之一

## 核心要点

SPH 的全部数学可以浓缩成一条**核近似公式**：

```
A(x) ≈ Σ_j  m_j · (A_j / ρ_j) · W(x - x_j, h)
```

逐部分解释：

- `A` 是任何场量（密度、压力、速度、温度都行）
- `j` 遍历附近粒子；`m_j` 是粒子 j 的质量，`ρ_j` 是它的密度
- `W` 是**核函数**（高斯、三次样条最常用）——一个中心高、远处衰减到 0 的钟形函数
- `h` 叫**平滑长度**——核的有效半径，类比 KDE 里的带宽

这条公式有三个不平凡的衍生：

1. **密度本身可以写成同样的求和**：`ρ(x) = Σ m_j W(x - x_j, h)`。粒子重叠多 → 密度高，自然成立。
2. **梯度只需对核函数求导**：`∇A(x) ≈ Σ m_j (A_j / ρ_j) ∇W`。所有空间导数都从 W 来，**不需要差分网格**。
3. **动量方程**写成对粒子对的求和：`dv_i/dt = -Σ m_j (P_i/ρ_i² + P_j/ρ_j² + Π_ij) ∇W_ij + g`。`Π` 是**人工粘性**，专门压住激波附近的振荡。

整体框架叫 **Lagrangian**——你跟着每个流体粒子走；和 Stam 1999 的 **Eulerian**（流体经过固定网格）正相反。

## 实践案例

### 案例 1：水花飞溅为什么 SPH 天然适合

网格法跟踪自由表面要多养一个 level set 函数，水花断裂时还要做拓扑修复。SPH 不需要：**粒子飞出来就是水花本身**，断裂、合并、飞散都自动发生——粒子之间的距离自己就是拓扑。

### 案例 2：邻居搜索是性能瓶颈

每个粒子的求和只对**距离 < 2h** 的邻居生效（核之外权重为 0）。但暴力 O(N²) 不可接受。工程上分两步：

```text
1. 把空间划成边长 = 2h 的 cell（uniform grid 或 spatial hash）
2. 每个粒子只查自己 cell 与相邻 cell（3D = 27 个 cell）
```

这样每步降到近线性。GPU 上每个粒子一个线程，cell 索引用原子操作维护——SPH 在 GPU 上几乎是天然并行。

### 案例 3：从 Monaghan 1992 到游戏引擎的三跳

```text
1992  Monaghan 综述：天体物理用 SPH 体系化
2003  Mueller "Particle-Based Fluid for Interactive Applications"：把 SPH 带进实时
2009  PCISPH（Solenthaler & Pajarola）：迭代修正压力 → 真正不可压
2015  DFSPH（Bender & Koschier）：同时压住散度和密度误差 → 大 dt 也稳
今天   NVIDIA FleX / Houdini / Blender / Obi Fluid 内置变体
```

每一跳都在补一个洞：从"科学计算够用"到"游戏 60 fps 能跑"。

### 案例 4：人工粘性 Π_ij 在做什么

物理粘性（ν∇²v）在粒子近似下不太够压住激波。Monaghan 加一个**只在两粒子靠近时打开**的额外耗散项：

```text
若 (v_i - v_j)·(x_i - x_j) < 0  // 互相靠近
    Π_ij = -α c̄ μ_ij / ρ̄ + β μ_ij² / ρ̄
否则
    Π_ij = 0
```

效果：粒子要"撞上"时凭空生粘性把它们减速，激波那种突然的速度跳变就被磨平、不振荡。`α`、`β` 是经验系数——这是 SPH 充满工程味的一面。

## 踩过的坑

1. **Tensile instability（拉伸抱团）**：粒子在被拉伸的方向上反而互相吸引，结成不该有的小团块。需要加 artificial stress 项把这个伪吸引修正掉。
2. **边界处理无统一最优解**：没有自然的"墙"。常见三招：ghost particle（在墙外镜像放粒子）、frozen particle（边界本身用一层不动的粒子）、boundary force（直接对靠近边界的粒子加一个排斥力）。每招都各有副作用。
3. **WCSPH 压力高频振荡**：标准 SPH 用状态方程 `P = B((ρ/ρ_0)^7 - 1)` 算压力，刚度极高，时间步要很小才稳。PCISPH/IISPH/DFSPH 都是为了治这个病。
4. **守恒律不全精确**：质量严格守恒（粒子数固定 + 每个粒子质量固定），动量近似守恒（受核近似截断影响），能量进一步近似——拿 SPH 做工程 CFD 时这三条都要小心。
5. **粒子分辨率不均匀**：靠近自由表面的粒子邻居少（核被截断），密度估计会偏低，需要核归一化（Shepard filter）等修正。

## 适用 vs 不适用场景

**适用**：

- 水花飞溅、液滴破碎、自由表面剧烈变化（破浪、爆炸碎块、雪崩、泥石流）
- 固液耦合、流固交互（粒子直接与刚体动力学耦合，没有界面跟踪麻烦）
- 实时游戏液体（GPU 上邻居搜索 + 局部求和并行天然友好）
- 天体物理（SPH 的最初战场——星系合并、恒星塌缩）

**不适用**：

- 薄烟雾、火焰、气体（Stam 1999 网格法更轻、视觉效果更好）
- 高精度工程 CFD（飞机翼、汽车风洞 —— 守恒律精度不够，finite-volume 更合适）
- 稳态层流（粒子排布噪声反而带来不该有的扰动）
- 极薄边界层（粒子分辨率难以匹配）

## 历史小故事（可跳过）

- **1977 年**：Lucy 与 Gingold & Monaghan 同年独立提出 SPH，本来是给天体物理用——星体怎么合并、星系怎么演化。这种问题没有"边界"，粒子方法天然合适。
- **1980 年代**：Monaghan 一个人在 Monash University 把 SPH 推广到激波、粘性流、磁流体——一边写论文一边补理论漏洞。
- **1992 年**：Monaghan 在 Annual Review of Astronomy and Astrophysics 写下这篇 60+ 页综述，把方法拧成手册——这就是后世引用的"那本 SPH 圣经"。
- **2003 年**：Mueller 等人在 SCA 把 SPH 简化、加速，第一次让它在游戏里以交互帧率跑起来。从那以后，图形学开始大量改造 SPH。
- **2009-2015 年**：PCISPH → IISPH → DFSPH，一连串"让 SPH 真正不可压"的工作把它推到工业级。
- **今天**：MPM、PIC/FLIP 这些更晚的混合方法表面上不像 SPH，但骨子里都继承了"用粒子表示物质 + 用某种核或网格做插值"的思路。

## 学到什么

1. **Lagrangian vs Eulerian 是个根本选择**：跟着粒子走 vs 看着固定网格——决定你擅长什么、不擅长什么，没有银弹。
2. **核近似 + 求和**就把空间偏导数从"网格差分"换成"邻居加权"，整套微分算子都能在无网格下表达——这套数学工具在机器学习的 KDE、点云处理里也复用。
3. **科学计算 → 图形学**的迁移路径常常是同一个算法、不同目标函数。SPH 在天体物理是为精度，在游戏里是为视觉合理 + 实时；中间的 PCISPH/DFSPH 都是为了把后者的"够用"做到极致。
4. **方法的成败不在数学优雅，而在工程钩子**：邻居搜索、边界处理、压力收敛——SPH 三十年的演化主要发生在这些"工程脏活"上。
5. **同一个数学骨架可以服务两个完全不同的领域**：星系合并和水花飞溅在拓扑剧变这件事上是同构的——都没有规则的网格，都需要"物质本身就是表示"。这种同构是方法跨领域的根本动力。

## 一句话总结

把流体写成"一群粒子 + 一个核函数"，所有空间导数从"网格差分"变成"邻居加权"——这就把流体仿真从棋盘格里解放了出来，让水花、爆炸、碎片这些拓扑剧变现象都能自然描述。

## 延伸阅读

- 综述论文：[Monaghan 1992 — Smoothed Particle Hydrodynamics, ARA&A](https://www.annualreviews.org/doi/10.1146/annurev.aa.30.090192.002551)
- 入门图形学版：[Mueller et al 2003 — Particle-Based Fluid Simulation for Interactive Applications](https://matthias-research.github.io/pages/publications/sca03.pdf)
- 不可压系列：PCISPH 2009 / IISPH 2014 / DFSPH 2015 三篇（搜 SPH incompressible）
- Bridson 教科书：*Fluid Simulation for Computer Graphics* 第 7 章是粒子法工程化讲解
- 开源代码：[SPlisHSPlasH](https://github.com/InteractiveComputerGraphics/SPlisHSPlasH)（C++，含 PCISPH/IISPH/DFSPH 全套）
- [[stam-1999-stable-fluids]] —— 网格法对照组：同样的 Navier-Stokes，路线完全相反

## 关联

- [[stam-1999-stable-fluids]] —— 流体仿真的另一条路线：Eulerian 网格 + 算子分裂；和 SPH 互补
- [[3d-gaussian-splatting]] —— 同样的"用大量带核的粒子代替网格"思路，从流体迁移到了渲染
- [[kajiya-1986-rendering-equation]] —— 图形学短论文范式：定义清楚 + 算法可跑 + 影响数十年
- [[blinn-1977]] —— 图形学传统：宁可近似也要实时——SPH 在游戏液体里的胜利就是这条原则的延续

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[macklin-2014-position-based-fluids]] —— Position Based Fluids — 把水也塞进 PBD 同一套框架
- [[muller-2007-pbd]] —— Position Based Dynamics — 直接修正位置的实时物理
- [[sulsky-1994-mpm]] —— MPM — 让粒子背着自己的历史，借网格算一遍力
