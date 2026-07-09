---
title: XPBD — 让 PBD 的软硬程度不再跟帧率绑死
来源: 'Macklin, Müller, Chentanez, "XPBD: Position-Based Simulation of Compliant Constrained Dynamics", MIG 2016'
日期: 2026-07-09
分类: 图形学
难度: 中级
---

## 是什么

XPBD（Extended Position-Based Dynamics）是 [[mueller-2007-pbd]] 的一个小改造：仍然直接修正粒子位置，但把"约束有多硬"改成一个明确的物理参数 **compliance（合规性）**。

日常类比：PBD 像你用手把歪掉的晾衣绳拉回原位。你拉几次，绳子就硬几分；XPBD 像给绳子换成一根标了弹性系数的弹簧，拉一次还是十次，弹簧本身的软硬不会变。

它解决的是实时物理里一个很烦的问题：同一块布，迭代次数从 20 加到 80 后，PBD 会突然变硬；帧率变高、时间步变小后，也会变硬。XPBD 的目标是让材质参数不被这些求解器设置偷偷改掉。

技术上一句话：XPBD 在每个约束里保存一个累计 Lagrange multiplier，并用 `alpha / dt^2` 形式把 compliance 放进约束更新公式，从而让刚度对时间步和迭代次数更稳定。

## 为什么重要

不理解 XPBD，下面这些事都没法解释：

- 为什么 [[mueller-2007-pbd]] 的"stiffness = 0.5"不是一个真正的材料参数，换帧率就要重调
- 为什么 Houdini Vellum、Flex 这类实时仿真系统能把布料、气球、软体放进同一套求解器
- 为什么游戏物理经常说"视觉稳定"不等于"参数可复用"：PBD 稳，但资产难复用
- 为什么 haptic feedback、breakable joint 需要 constraint force，而老 PBD 几乎没有清晰的力概念

## 核心要点

1. **compliance 是"软得动的程度"**。类比：钢尺 compliance 很小，橡皮筋 compliance 很大。XPBD 不直接调"修正比例 k"，而是调 compliance，也就是刚度的倒数。

2. **累计乘子让约束记住自己已经用过多少力**。类比：你不是每次都忘记上一秒拉了几下绳子，而是在小本子上记总账。这个总账就是每个约束多存的一个标量 `lambda`。

3. **`alpha / dt^2` 把帧率影响吸收进公式**。类比：跑步机速度变了，你不是重新买鞋，而是按速度调整步频。XPBD 把时间步放进 compliance 缩放里，避免同一材质随 dt 改性格。

三点合起来，XPBD 仍然保留 PBD 的简单和稳定，但把"软硬"从"迭代副作用"提升成可以解释、可以复用的参数。

## 实践案例

### 案例 1：距离约束从 PBD 改成 XPBD

PBD 的距离约束核心像这样：

```python
C = length(x1 - x2) - rest_length
dlambda = -C / (w1 + w2)
x1 += w1 * grad1 * dlambda
x2 += w2 * grad2 * dlambda
```

XPBD 只是在分子、分母里多放 compliance 和累计 `lambda`：

```python
alpha_tilde = compliance / (dt * dt)
C = length(x1 - x2) - rest_length
dlambda = (-C - alpha_tilde * lambda_old) / (w1 + w2 + alpha_tilde)
lambda_old += dlambda
x1 += w1 * grad1 * dlambda
x2 += w2 * grad2 * dlambda
```

逐部分解释：

- `compliance = 0` 时，约束无限硬，退化成 PBD 里 `k = 1` 的硬约束
- `alpha_tilde` 越大，修正越小，约束越软
- `lambda_old` 是这条约束本帧累计的"用力账本"，每帧开始通常清零

### 案例 2：同一块布，迭代次数从 20 加到 160

普通 PBD 的直觉代码通常是：

```python
for _ in range(iterations):
    for c in cloth_constraints:
        project_pbd(c, stiffness=0.01)
```

问题：`iterations` 从 20 变成 160，布会越来越硬、越来越像铁皮，因为每轮都再拉一次。

XPBD 的写法把材质软硬挪到 compliance：

```python
for c in cloth_constraints:
    c.lambda_value = 0.0
for _ in range(iterations):
    for c in cloth_constraints:
        solve_xpbd(c, compliance=cloth_compliance, dt=dt)
```

逐部分解释：

- 增加迭代次数主要提高收敛，不应该偷偷改变材质
- 论文的 64×64 布料例子里，PBD 随迭代增加明显变硬，XPBD 的形态基本不变
- 论文报告 XPBD 每轮额外开销很小，布料例子里通常不到总时间的 2%

### 案例 3：气球同时有体积、拉伸、弯曲约束

一个软气球可以这样建模：

```python
constraints = [
    volume_constraint(compliance=1e-8),
    stretch_constraints(compliance=1e-6),
    bending_constraints(compliance=1e-4),
]
```

逐部分解释：

- 体积 compliance 小，表示空气很难被压缩，气球整体不容易瘪
- 拉伸 compliance 稍大，表示外皮可以被拉长一点
- 弯曲 compliance 更大，表示外皮可以皱、可以折

这正是 XPBD 的价值：不同约束可以各自调软硬。你可以为了体积保持多跑几轮迭代，而不让表面拉伸也跟着变硬。

## 踩过的坑

1. **把 compliance 当 stiffness 用**：compliance 是刚度倒数，数值越大越软；新人常把方向调反。

2. **忘记每帧重置 `lambda`**：论文里的 `lambda` 是当前时间步内累计；跨帧复用属于 warm start，需要专门设计，不是无脑保留。

3. **以为 XPBD 收敛更快**：它主要修参数语义，不保证同样迭代数下比 PBD 更快收敛；硬约束仍然需要足够迭代。

4. **把碰撞也设成软 compliance**：多数实时系统里接触约束仍用零 compliance，否则物体会肉眼可见地互相穿进去。

## 适用 vs 不适用场景

**适用**：

- 游戏、VR、交互工具里的布料、绳索、软体、气球
- 需要把资产参数从一个场景复用到另一个场景的实时仿真
- 需要估计约束力的效果：断裂、触觉反馈、拉力驱动的材质变化
- 已经有 PBD 求解器，希望用最小改动升级参数语义

**不适用**：

- 工程级应力分析、结构安全计算 → 用 FEM / 隐式连续介质求解器
- 需要严格能量守恒的科学仿真 → PBD/XPBD 都是近似迭代法
- 极硬接触摩擦、大规模刚体堆叠 → 仍需专门的刚体约束求解器
- 低迭代数还想得到完全刚性结果 → XPBD 不会免费消除未收敛误差

## 历史小故事（可跳过）

- **1998 年**：[[baraff-witkin-1998-cloth]] 用隐式 Euler + CG 让布料敢走大时间步，但实现和线性系统成本都不轻。
- **2007 年**：Müller 等提出 [[mueller-2007-pbd]]，把很多实时仿真改成"位置投影"，简单、稳定、好上手。
- **2013 年**：Macklin 和 Müller 用 [[macklin-2014-position-based-fluids]] 把流体也塞进 PBD 框架，统一求解器路线更清晰。
- **2016 年**：Macklin、Müller、Chentanez 提出 XPBD，专门修 PBD 的时间步和迭代次数刚度耦合。
- **2018 年以后**：Houdini Vellum 等工业工具把 XPBD 风格参数产品化，艺术家可以直接调 stretch、bend、pressure。

## 学到什么

1. **稳定只是第一步，参数语义才决定能不能生产复用**：PBD 很稳，但 XPBD 让"这块材料有多软"变成更可靠的资产参数。
2. **多存一个标量可以换来一整套解释**：每条约束多存 `lambda`，就得到累计约束力、时间步无关调参、断裂判断这些能力。
3. **图形学常常在物理精确和工程可控之间取中间点**：XPBD 不等于完整隐式 FEM，但它足够快、足够稳、足够好调。
4. **好扩展不是推翻旧系统，而是保留主循环只替换关键公式**：XPBD 的工程魅力就在于 PBD 求解器只需小改。

## 延伸阅读

- 论文 PDF：[XPBD: Position-Based Simulation of Compliant Constrained Dynamics](https://matthias-research.github.io/pages/publications/XPBD.pdf)（短论文，先读 Introduction、Algorithm 1、Eq. 18）
- 母方法：[[mueller-2007-pbd]] —— XPBD 直接修复的对象，先理解预测、投影、反推速度
- 流体扩展：[[macklin-2014-position-based-fluids]] —— 同一作者把密度约束放进 PBD
- 布料隐式路线：[[baraff-witkin-1998-cloth]] —— 对照理解"解线性系统"和"位置投影"两条路
- 课程视频：[Ten Minute Physics](https://matthiasmueller.info/tenMinutePhysics/) —— 作者本人用小 demo 讲 PBD/XPBD 直觉
- 工业工具：Houdini Vellum 文档 —— XPBD 思想在影视布料、绳索、软体里的产品化入口

## 关联

- [[mueller-2007-pbd]] —— XPBD 是 PBD 的参数语义修正版，保留主循环但替换约束公式
- [[macklin-2014-position-based-fluids]] —— 同属 Macklin 的统一粒子物理路线，PBF 修流体，XPBD 修软硬参数
- [[baraff-witkin-1998-cloth]] —— 隐式布料经典，XPBD 可看作更轻量的实时替代路线
- [[sulsky-1994-mpm]] —— 另一类大变形材料方法，MPM 追求连续介质历史，XPBD 追求实时约束可控
- [[hu-2018-mls-mpm]] —— 现代物理仿真的另一支：把 MPM 做到更快、更易写、更可微
- [[vr-1988]] —— 领域无关但思想相似：给状态加"版本/总账"，让系统在变化中保持一致语义

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
