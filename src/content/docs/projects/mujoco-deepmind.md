---
title: MuJoCo 学习笔记 —— 从零理解物理仿真引擎
来源: https://github.com/google-deepmind/mujoco
日期: 2026-06-13
分类: 机器学习
子分类: 机器人与 VLA
provenance: pipeline-v3
---

# MuJoCo 学习笔记 —— 从零理解物理仿真引擎

## 什么是 MuJoCo？

MuJoCo 的全称是 **Mu**lti-**Jo**int dynamics with **Co**ntact（多关节接触动力学）。你可以把它想象成一个"虚拟物理实验室"——你在里面搭建一个由关节连接的机械结构（比如机械臂、人形机器人），然后告诉计算机："帮我把它的运动算出来"。计算机就会模拟重力、碰撞、摩擦力等一切物理效果，告诉你每个瞬间这些部件会在哪里、以什么速度运动。

它由 Google DeepMind 维护，是目前机器人和强化学习领域最主流的物理仿真引擎之一。

## 核心概念

### 类比：搭积木 + 按播放键

想象你在搭一套乐高：

1. **模型定义**（mjModel）= 你搭好的乐高结构。它描述了有什么零件、怎么连接、有多重。这个模型一旦搭好就不变了。
2. **仿真数据**（mjData）= 每一帧的状态。包括每个零件此刻的位置、速度、受力情况。这个数据在仿真过程中不断变化。
3. **仿真步骤**（mj_step）= 按下"播放键"，计算下一帧的状态。

MuJoCo 的核心思想就是：**模型和数据分离**。同一个模型可以对应无数个不同的数据状态，这让你能同时跑很多条仿真（比如并行训练 1000 个不同的机器人策略）。

### 关键术语速查

| 术语 | 类比 | 说明 |
|------|------|------|
| Body | 一块积木 | 有质量、有惯性，但不直接显示形状 |
| Geom | 积木的外观 | 碰撞体和渲染体，附着在 Body 上 |
| Joint | 积木之间的连接件 | 决定两块积木能怎么动（旋转/滑动/自由浮动） |
| Tendon | 绳子 | 连接不同部位，模拟肌腱或传动带 |
| Actuator | 马达 | 给关节施加力的装置 |
| mjModel | 乐高说明书 | 静态的模型描述 |
| mjData | 当前状态 | 运行时变化的动态数据 |

## MJCF 建模语言

MuJoCo 使用一种叫 **MJCF** 的 XML 格式来描述场景。它的设计哲学是"默认值尽量智能"——你只需要写真正需要定制的部分，其余的用默认值。

一个最简单的 MuJoCo 场景包含：

- `<worldbody>`：世界坐标系下的所有物体
- `<geom>`：几何体（平面、球体、盒子等）
- `<body>`：刚体
- `<joint>`：关节
- `<light>`：光源

## 代码示例

### 示例一：用 Python 跑一个最简单的仿真

这是最基础的用法——加载一个模型文件，然后让它自由下落。

```python
import mujoco
import time

# 1. 加载模型（从 XML 或 MJCF 文件）
model = mujoco.MjModel.from_xml_path("hello.xml")
data = mujoco.MjData(model)

# 2. 运行仿真 10 秒
while data.time < 10:
    mujoco.mj_step(model, data)  # 推进一个时间步
    print(f"时间: {data.time:.2f}s, 盒子高度: {data.xpos[1, 2]:.3f}")

# 3. 清理资源
mujoco.mj_deleteData(data)
```

对应的 `hello.xml` 场景文件：

```xml
<mujoco>
  <worldbody>
    <!-- 光源 -->
    <light diffuse="0.5 0.5 0.5" pos="0 0 3" dir="0 0 -1"/>
    <!-- 地面（平面） -->
    <geom type="plane" size="1 1 0.1" rgba="0.9 0 0 1"/>
    <!-- 一个自由浮动的盒子 -->
    <body pos="0 0 1">
      <joint type="free"/>  <!-- free = 6自由度（3平移 + 3旋转） -->
      <geom type="box" size="0.1 0.2 0.3" rgba="0 0.9 0 1"/>
    </body>
  </worldbody>
</mujoco>
```

运行后你会看到绿色的盒子从高度 1 的位置自由落体，碰到红色地面后弹起。

### 示例二：用代码程序化创建模型并施加控制力

不需要 XML 文件，完全用 Python 代码搭建模型，并给关节施加力矩让它动起来。

```python
import mujoco
import numpy as np

# 1. 用 mjSpec 程序化创建模型
spec = mujoco.MjSpec()
spec.model_name = "pendulum"

# 添加地面
spec.worldbody.add_geom(
    type="plane", size=[0.5, 0.5, 0.1], rgba=[0.8, 0.8, 0.8, 1]
)

# 添加摆锤系统：固定轴 + 旋转杆 + 末端质量
world_body = spec.worldbody
arm = world_body.add_body(
    pos=[0, 0, 1], name="arm_root"
)
arm.add_joint(
    type="hinge",
    axis=[0, 1, 0],       # 绕 Y 轴旋转
    name="shoulder",
    pos=[0, 0, -0.5]      # 关节相对 arm_root 的位置
)
tip = arm.add_body(pos=[0, 0, -0.5], name="tip")
tip.add_geom(
    type="sphere", radius=0.05, rgba=[1, 0, 0, 1], name="bob"
)

# 编译模型
model = spec.compile()
data = mujoco.MjData(model)

# 2. 给关节施加控制力矩，让摆锤摆动
for i in range(500):
    # 给 shoulder 关节施加力矩（PD 控制思路）
    qpos = data.qpos[0]           # 当前角度
    qvel = data.qvel[0]           # 当前角速度
    torque = -5.0 * qvel - 2.0 * np.sin(qpos)  # 简单阻尼控制
    data.ctrl[0] = torque

    mujoco.mj_step(model, data)

    if i % 50 == 0:
        print(f"步数: {i}, 角度: {np.degrees(qpos):.1f}°, 角速度: {qvel:.2f}")

# 3. 清理
mujoco.mj_deleteData(data)
```

这个例子展示了 MuJoCo 的一个重要能力：**你可以直接操控仿真中的力**。这在机器人控制训练中非常关键——你的 AI 策略就是通过输出控制信号（ctrl）来影响物理世界的。

### 示例三（进阶）：批量并行仿真

MuJoCo 的一个强大特性是：同一个 mjModel 可以被多个 mjData 共享，这意味着你可以轻松并行跑大量仿真。

```python
import mujoco
import numpy as np

# 编译模型（只需一次）
spec = mujoco.MjSpec()
spec.worldbody.add_geom(type="plane", size=[1, 1, 0.1])
body = spec.worldbody.add_body(pos=[0, 0, 1])
body.add_joint(type="free", name="root")
body.add_geom(type="sphere", radius=0.1, rgba=[0, 0.8, 0, 1])
model = spec.compile()

# 创建 4 个独立的数据实例（共享同一个模型）
num_envs = 4
datas = [mujoco.MjData(model) for _ in range(num_envs)]

# 给每个环境不同的初始位置
for i, d in enumerate(datas):
    d.qpos[0] = float(i) * 0.5  # X 方向错开

# 并行步进
for step in range(100):
    for d in datas:
        mujoco.mj_step(model, d)
    print(f"Step {step}: 4个环境的X坐标 = {[d.qpos[0] for d in datas]}")

# 清理
for d in datas:
    mujoco.mj_deleteData(d)
mujoco.mj_deleteModel(model)
```

这种"一模型多数据"的模式正是强化学习中大规模并行训练的基石。

## 为什么 MuJoCo 这么快？

两个关键设计：

1. **零内存分配**：初始化完成后，所有内存预先分配好。仿真过程中不再调用 malloc/free，避免了性能杀手。
2. **约束岛并行**：MuJoCo 会自动发现哪些物体之间没有接触，把它们分成独立的"约束岛"，不同岛的计算可以并行执行。

## 常见应用场景

- **机器人强化学习**：DeepMind 的许多著名论文（如 DMC 系列）都用 MuJoCo 做仿真环境
- **控制器设计**：验证 PID、MPC 等控制算法的效果
- **生物力学研究**：模拟人体肌肉骨骼系统的运动
- **图形学与动画**：生成逼真的物理驱动动画

## 延伸学习

- 官方文档：<https://mujoco.readthedocs.io/>
- Python 教程 Colab：<https://colab.research.google.com/github/google-deepmind/mujoco/blob/main/python/tutorial.ipynb>
- MJX（GPU 加速版）：<https://mujoco.readthedocs.io/en/stable/mjx.html>
- 安装：`pip install mujoco`
