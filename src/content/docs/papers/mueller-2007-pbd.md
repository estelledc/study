---
title: Position Based Dynamics — 跳过力，直接挪位置
来源: 'Müller, Heidelberger, Hennix, Ratcliff, "Position Based Dynamics", J. Visual Communication and Image Representation, 2007'
日期: 2026-05-31
子分类: 渲染与图形
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

**Position Based Dynamics（PBD）** 是一套做物理仿真的方法。它不算力、不算加速度，**直接对每个粒子的位置做约束修正**。

日常类比：传统物理模拟像推购物车——你施一个力，车有加速度，加速度积分得速度，速度积分得位置。一路链式传导。PBD 像直接伸手把车搬到该在的地方，再用一根绳子限制"最远走多远"。约束就是绳子。

简单几行代码就能跑出布料下落、绳索摆动、软体碰撞的视觉效果。

## 为什么重要

传统方法（显式欧拉积分）有个老毛病：**时间步 dt 稍大就爆炸**。一根弹簧调硬一点，模拟立刻飞出屏幕。游戏开发者只好把 dt 调到 1/240 秒，CPU 吃不消。

PBD 把这个问题从根上换掉：

- **无条件稳定**：再大的 dt 都不会爆炸。约束只是"把粒子拉回合法位置"，没有指数发散
- **直观可控**：长度、碰撞、附着这些诉求都是位置层面的，约束直接表达，不用反推弹性系数
- **实时**：60fps 跑布料 + 头发 + 软体没问题
- **统一框架**：刚体、流体（PBF）、软体（XPBD）都是同一套循环，换约束就行

游戏布料、头发、软体几乎全用 PBD 或它的扩展 XPBD。NVIDIA Flex、Houdini Vellum 是两个最有名的工业实现。

## 核心要点

PBD 一帧的循环是 **5 步**：

1. **预测**：用上一帧速度和外力（重力）预测下一帧位置
   `x_predicted = x + dt · v + dt² · f_external / m`

2. **生成约束**：检测碰撞，加上结构约束（弹簧、距离、体积、弯曲等）

3. **迭代投影**：对每个约束 `C(x) = 0` 或 `C(x) ≥ 0`，沿梯度方向把 `x` 推到满足约束的最近点。所有约束循环 N 次（典型 N=4~10）

4. **更新速度**：`v = (x_new - x_old) / dt`——速度是位置变化"反推"出来的，不是积分出来的

5. **写回**：`x = x_new`

第 3 步是 PBD 的灵魂。"投影"在数学上就是"找满足约束、且离当前点最近的位置"。

## 实践案例

### 案例 1：距离约束（最简单的弹簧）

两个粒子 p1, p2，要保持原长 L。约束写成：

```
C(p1, p2) = |p1 - p2| - L = 0
```

投影一次的伪代码：

```python
def project_distance(p1, p2, w1, w2, rest_length):
    delta = p1 - p2
    current = length(delta)
    correction = (current - rest_length) / current * delta
    p1 -= w1 / (w1 + w2) * correction
    p2 += w2 / (w1 + w2) * correction
```

`w = 1/m` 是反质量。固定点 w=0，永远不动。这 4 行代码就是布料里的每根线。

### 案例 2：碰撞约束（不等式）

粒子不能穿地板：

```
C(p) = (p - p_floor) · n_up ≥ 0
```

如果穿了，沿法线方向推回来即可。地板用平面、球用球心、网格用三角形，思路都一样——**先检测违规，再沿法线投影**。

### 案例 3：布料

把布料离散成一张三角网格：

- 每个顶点是一个粒子
- 每条边加一个**距离约束**（保持长度）
- 每对相邻三角形加一个**弯曲约束**（保持夹角）

加上重力，跑 PBD 循环。一张布"啪"地搭到障碍物上，视觉上完全像真的。这是过去 20 年所有游戏布料的工作原理。

### 案例 4：体积约束（保持四面体不被压扁）

把软体（如肌肉、果冻）离散成四面体网格，每个四面体加一个体积约束：

```
C(p1,p2,p3,p4) = (1/6)·((p2-p1) × (p3-p1)) · (p4-p1) − V_rest = 0
```

外力把它压扁，下一帧投影会把四个顶点推回原体积。这就是 NVIDIA Flex 处理软体的核心。

## 踩过的坑

1. **迭代次数影响"硬度"**：约束循环次数 N 越多，约束越硬。N=1 时弹簧软得像橡皮筋，N=20 时硬得像钢丝。但调 N 实际上在调"刚度"，参数和 dt 强耦合，调起来反直觉

2. **XPBD（2016）解决参数耦合**：Macklin 等人引入拉格朗日乘子，让"刚度"成为独立参数，与 dt 和 N 无关。现代实现（Vellum、Flex 新版）几乎全用 XPBD

3. **能量不守恒**：PBD 是几何投影不是物理积分，能量会缓慢衰减或增长。视觉上看不出来，但做"能量真值的科学仿真"不能用

4. **顺序敏感**：先解距离约束还是先解碰撞约束，结果不一样。Gauss-Seidel 风格的迭代会偏向后解的约束。要更稳定可以用 Jacobi 风格（所有约束并行算修正后再加），但收敛更慢

## 适用 vs 不适用场景

**适用**：
- 游戏布料、绳索、头发、软体、毛发——视觉真实即可
- 实时交互演示（VR、教学）
- 流体的位置层模拟（PBF，烟雾水面够用）
- 大批量粒子（GPU 上 100 万粒子布料没问题）

**不适用**：
- 工程级精度物理（结构应力、空气动力）→ 用有限元 / FVM
- 严格能量守恒的天体仿真 → 用辛积分器
- 极硬约束（刚体接触摩擦）→ 用约束式动力学（如 Featherstone 算法）

## 历史小故事（可跳过）

- **2006 年**：Müller 在 Nvidia 做实时仿真，受当时游戏 ragdoll 和布料启发，把约束求解从"力空间"搬到"位置空间"
- **2007 年**：论文发表在 J. Visual Communication and Image Representation，反响不大，但游戏圈很快上手
- **2014 年**：Macklin 在 NVIDIA 做出 Flex，统一刚体/布料/流体/软体到 PBD 框架，PhysX 集成
- **2016 年**：Macklin、Müller 提出 XPBD，解决刚度与 dt 的耦合，成为新标准
- **2018 年**：Houdini Vellum 上线，影视行业大量布料/软体走 PBD/XPBD
- 现在几乎所有 3A 游戏的布料、头发、软体都是 PBD 系

## 学到什么

1. **换坐标系常常比改算法管用**——把约束求解从力空间搬到位置空间，所有稳定性问题消失
2. **视觉真实 ≠ 物理真实**——游戏不需要严格物理，需要"看上去像"。PBD 把这个区分用足
3. **统一框架的力量**——一套循环加不同约束，覆盖布料/绳索/软体/流体。Flex、Vellum 都是这个思想的工程化
4. **"近似 + 迭代" 是图形学常用解法**——不直接解方程，每帧投影几次让误差收敛。Jacobi/Gauss-Seidel 求解器思想的实时化

## 延伸阅读

- 论文 PDF：[Müller 2007 — Position Based Dynamics](https://matthias-research.github.io/pages/publications/posBasedDyn.pdf)（10 多页，伪代码清晰）
- 教程视频：[Ten Minute Physics — Matthias Müller's YouTube](https://matthiasmueller.info/tenMinutePhysics/)（作者本人 10 分钟讲一个仿真）
- XPBD 论文：[Macklin, Müller, Chentanez 2016](http://mmacklin.com/xpbd.pdf)
- NVIDIA Flex：[Flex Documentation](https://developer.nvidia.com/flex)
- [[3d-gaussian-splatting]] —— 同样是图形学里"换表示带来质变"的例子
- [[kajiya-1986-rendering-equation]] —— 渲染方程，渲染端的同级基础

## 关联

- [[3d-gaussian-splatting]] —— 都属于"换表示带来质变"的图形学经典思路
- [[nerf-2020]] —— 神经渲染，PBD 处理几何/物理，NeRF 处理外观/光线
- [[kajiya-1986-rendering-equation]] —— 渲染方程定义"光怎么传"，PBD 定义"几何怎么动"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[3d-gaussian-splatting]] —— 3D Gaussian Splatting — 用一堆 3D 模糊光斑重建场景
- [[kajiya-1986-rendering-equation]] —— Kajiya 渲染方程 — 把所有渲染算法统一成一个积分方程
- [[macklin-2014-position-based-fluids]] —— Position Based Fluids — 把水也塞进 PBD 同一套框架
- [[nerf-2020]] —— NeRF — 用一个 MLP 把整个场景"背"下来

