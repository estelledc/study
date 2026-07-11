---
title: Position Based Dynamics — 直接修正位置的实时物理
来源: 'Matthias Müller, Bruno Heidelberger, Marcus Hennix, John Ratcliff, "Position Based Dynamics", Journal of Visual Communication and Image Representation 2007'
日期: 2026-07-09
分类: 图形学
难度: 中级
---

## 是什么

Position Based Dynamics（PBD）是一种做物理动画的方法：它不先精确计算力和加速度，而是先预测物体会跑到哪里，再把位置直接推回满足约束的地方。

日常类比：传统弹簧模拟像用绳子拉购物车，你要算绳子的力、车的加速度、速度和位置；PBD 更像老师排队，发现两个人站太近，就直接把他们挪开一点。

论文的核心句子可以翻译成：在游戏和实时图形里，稳定、可控、跑得快，常常比物理方程完全精确更重要。

所以 PBD 把布料、软体、碰撞、钉住顶点这些需求都写成"位置应该满足什么条件"，再用迭代投影把违规的位置修正回来。

## 为什么重要

不理解 PBD，下面这些事会很难解释：

- 为什么游戏里的披风、裙摆、绳子可以 60 帧实时跑，却不一定是严格物理仿真
- 为什么传统显式积分遇到很硬的弹簧容易爆炸，而 PBD 往往只是变软或变慢
- 为什么一套粒子加约束的循环，后来能扩展到布料、软体、流体和统一粒子物理
- 为什么图形学论文会反复说"visually plausible"：目标是看起来可信，而不是替代工程仿真

## 核心要点

1. **先猜位置，再修位置**：像先让每个人按自己的速度往前走一步，再由班长把队伍拉直。算法先用速度和外力得到预测位置 `p`，再让约束求解器修改 `p`。

2. **约束就是规则卡片**：距离约束说两点距离必须等于原长，碰撞约束说点必须在表面外侧，弯曲约束说相邻三角形夹角别乱变。每张规则卡只管一小件事，很多卡叠起来就是一块布或一个软体。

3. **迭代投影替代一次精确求解**：像把皱桌布一点点抹平，不指望一下抹完。PBD 用 Gauss-Seidel 风格逐条处理约束，处理完一轮再处理下一轮，迭代次数越多，约束看起来越硬。

## 实践案例

### 案例 1：两个点之间保持固定距离

```python
def project_distance(p1, p2, w1, w2, rest):
    d = p1 - p2
    length_now = norm(d)
    if length_now == 0 or w1 + w2 == 0:
        return p1, p2
    error = length_now - rest
    correction = error * d / length_now
    p1 = p1 - w1 / (w1 + w2) * correction
    p2 = p2 + w2 / (w1 + w2) * correction
    return p1, p2
```

逐部分解释：

- `rest` 是原长，像两点之间绑了一根不可伸长的线
- `w = 1 / mass` 是反质量，`w=0` 表示钉在墙上不动
- `error` 为正说明两点太远，为负说明太近，修正方向沿着两点连线

### 案例 2：一帧 PBD 主循环

```python
def step(particles, constraints, dt):
    for x in particles:
        x.old = x.pos
        x.vel += dt * x.force * x.inv_mass
        x.pred = x.pos + dt * x.vel
    for _ in range(8):
        for c in constraints:
            c.project()
    for x in particles:
        x.vel = (x.pred - x.old) / dt
        x.pos = x.pred
```

逐部分解释：

- 前半段只是预测，不保证结果合法
- `c.project()` 是灵魂：每条约束直接改 `pred` 位置
- 速度最后从位置差反推，所以碰撞和约束修正会自然反馈到下一帧

### 案例 3：布料网格怎么变成约束系统

```python
for edge in cloth.edges:
    constraints.append(Distance(edge.a, edge.b, edge.rest_length))

for pair in cloth.adjacent_triangles:
    constraints.append(Bending(pair.t1, pair.t2, pair.rest_angle))

for pinned in cloth.shoulder_vertices:
    pinned.inv_mass = 0
```

逐部分解释：

- 每条边加距离约束，负责"布不要被拉长太多"
- 相邻三角形加弯曲约束，负责"布不要像纸片一样随便折断"
- 被钉住的肩部顶点反质量设为 0，其他约束就推不动它

## 踩过的坑

1. **把 PBD 当精确物理**：PBD 的第一目标是稳定和视觉可信，不是能量、动量、应力都严格正确。

2. **只调 stiffness 不看迭代次数**：论文里刚度效果和 solver 迭代次数耦合，少迭代会让同一个参数看起来更软。

3. **忽略约束顺序**：Gauss-Seidel 是先改先影响后面，距离、碰撞、弯曲的处理顺序会改变结果。

4. **以为无条件稳定等于不会出问题**：时间步太大时通常不爆炸，但可能穿透、过软、抖动或丢失细节。

## 适用 vs 不适用场景

**适用**：

- 游戏里的布料、绳索、头发、软体和小规模破裂效果
- 交互式编辑器里需要拖拽、钉住、碰撞、实时反馈的物理动画
- 希望不同对象共用一套粒子约束求解器的实时图形系统
- 教学 demo：少量代码就能看到"约束投影"的直观效果

**不适用**：

- 需要工程级应力、应变、材料参数可信的仿真
- 需要严格能量守恒或长期轨道稳定的科学计算
- 复杂刚体堆叠、精确摩擦和冲量响应主导的场景
- 时间步、迭代次数频繁变化但又要求同一刚度含义不变的系统

## 历史小故事（可跳过）

- **1995 年**：Provot 用质量-弹簧加变形约束处理布料，已经出现"直接拉回长度"的味道。
- **1998 年**：Baraff 和 Witkin 用隐式积分让布料敢走大时间步，但每步要解线性系统。
- **2001 年**：Jakobsen 在游戏物理文章里推广 Verlet + 约束松弛，让实时角色物理更容易写。
- **2007 年**：Müller 等人把这些经验整理成 Position Based Dynamics，给出统一约束投影框架。
- **2013-2016 年**：Position Based Fluids 和 XPBD 继续扩展这条路线，让流体和步长无关刚度也能纳入同一思路。

## 学到什么

- 图形学里的"物理"经常是服务画面的工程折中：先稳定、再可信、最后才追求精确。
- 把问题改写成位置约束后，碰撞、附着、布料弯曲都能用同一种投影语言表达。
- PBD 的强大来自统一接口：对象不同，主循环不变，只是约束函数不同。
- 代价也很清楚：刚度、迭代次数、时间步和求解顺序会混在一起，需要工程调参。

## 延伸阅读

- 论文 PDF：[Müller 2007 — Position Based Dynamics](https://matthias-research.github.io/pages/publications/posBasedDyn.pdf)
- 教程：[Ten Minute Physics](https://matthiasmueller.info/tenMinutePhysics/)（作者用短视频讲 PBD、布料和软体）
- [[baraff-witkin-1998-cloth]] —— PBD 反思的隐式布料路线，先解线性系统再前进
- [[macklin-2014-position-based-fluids]] —— 把 PBD 思想扩展到流体密度约束
- [[monaghan-1992-sph]] —— 粒子流体路线，理解 PBF 为什么要替换压力求解
- [[stam-1999-stable-fluids]] —— 另一条实时稳定流体路线，适合和 PBD 对照

## 关联

- [[baraff-witkin-1998-cloth]] —— 同样解决布料稳定性，但走隐式积分和线性系统路线
- [[macklin-2014-position-based-fluids]] —— PBD 的后续扩展，把水的密度也写成位置约束
- [[monaghan-1992-sph]] —— PBF 借用 SPH 的邻域和核函数，但改用投影求解
- [[stam-1999-stable-fluids]] —— 都追求实时稳定，只是一个在粒子位置上做文章，一个在网格速度场上做文章
- [[kajiya-1986-rendering-equation]] —— 渲染方程管光怎么传，PBD 管几何怎么动，都是图形学基础抽象
- [[mueller-2007-pbd]] —— 同题旧拼写笔记，本页使用任务要求的 `muller-2007-pbd` slug

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[baraff-witkin-1998-cloth]] —— Baraff-Witkin 1998 — 让布料模拟敢走大时间步
