---
title: SpatialClaw — 让 AI 用 Python 代码做空间推理
来源: 'https://arxiv.org/abs/2606.13673'
日期: 2026-06-13
分类: 机器学习
子分类: 空间推理
难度: 中级
provenance: pipeline-v3
---

## 是什么

SpatialClaw 是 NVIDIA Research 提出的一套**无需训练的空间推理 Agent 框架**。核心一句话：

> 让 VLM（视觉语言模型）写 Python 代码来做空间推理，而不是调一堆固定工具。

日常类比：想象你在教一个人解决空间题。

- **旧方法**：给他一把螺丝刀、一把锤子、一把扳手——但每次只能用它做一件规定的事，不能把它们组合起来。
- **SpatialClaw**：给他一台电脑和 Python 环境，告诉他"遇到不会的直接写代码"。他能自由调用工具箱里的函数，检查结果，发现不对就改，一步一步逼近答案。

## 为什么重要

不理解 SpatialClaw，下面这些事都没法解释：

- 为什么 3D 空间推理一直是 VLM 的弱项——不是模型不够大，是交互方式不对
- 为什么之前加一堆感知工具（SAM 3、深度估计等）后提升有限——瓶颈在"怎么调用工具"
- 为什么代码执行比结构化工具调用更灵活——代码是可组合、可检查、可迭代的
- 为什么 NVIDIA 选"用代码做动作接口"而不是继续堆工具——这是架构层面的 rethink

把工具调用当"固定接口"调，永远是"拼乐高"。把工具调用当"编程环境"调，才有涌现。

## 核心概念

### 1. 三种动作接面对比

SpatialClaw 的核心贡献不是"用了代码"，而是系统性地比较了三种接口，发现**代码 + 持久化 Python 内核**是最优解。

**(a) 单次代码执行（Single-pass code）**

Agent 一次写出一整段 Python 代码，执行完就结束。

```python
# 问题：一旦写错，从头来不了
import numpy as np
from perception_tools import segment, estimate_depth

mask = segment(image)
depth = estimate_depth(image)
result = compute_distance(mask, depth)
print(result)
```

只能写一次，无法看到中间结果再修正。

**(b) 结构化工具调用（Structured tool-call）**

Agent 通过固定 JSON 格式调用工具，每次只能调一个。

```json
// 问题：工具之间不能自由组合，输出不能直接当变量用
[
  {"tool": "segment", "input": {"image_id": 1}},
  {"tool": "depth", "input": {"image_id": 1}},
  {"tool": "distance", "input": {"result_a": 0, "result_b": 1}}
]
```

每次调完等返回，不能像写代码那样 `a = f(b)` 自由组合。

**(c) SpatialClaw：代码作为动作接口**

Agent 每次写一个代码单元格，在**持久化的 Python 内核**中执行，能看到所有中间变量。

### 2. Persistent Kernel（持久化内核）

这是 SpatialClaw 最核心的设计。内核在任务开始时就创建好，预加载了：

- 输入帧（图片/视频帧）
- 感知工具（SAM 3 分割、Depth Anything 3 深度估计）
- 科学计算库（NumPy、SciPy）
- 可视化库（Matplotlib）

Agent 每一步写一段代码，内核记住所有变量，下一步可以直接引用上一步的结果。

### 3. 五步推理循环

每个推理任务经历五个阶段：

1. **Planning（规划）**：VLM 理解问题，制定计划
2. **Code generation（生成代码）**：写出当前步的代码
3. **Code execution（执行代码）**：内核执行代码，返回结果
4. **Feedback assembly（组装反馈）**：把代码输出 + 视觉结果汇总
5. **Answer submission（提交答案）**：根据所有信息给出最终答案

如果前几步结果不对，Agent 会回到第 2 步改写代码，而不是重新开始。

## 代码示例

### 示例 1：三步空间推理

这是 SpatialClaw 解决一个典型问题的完整过程。Agent 分三次写代码，每次都能看到上一步的结果。

```python
# === Step 1: 规划阶段 ===
# Agent 先思考：要判断"站在椅子前面对电视时，冰箱在哪个方向"
# 需要：1) 分割出所有物体 2) 重建3D位置 3) 计算相对方向

# === Step 2: 第一次写代码 — 分割 + 3D 重建 ===
import numpy as np
from perception_tools import sam3_segment, depth_anything3
import matplotlib.pyplot as plt

# 分割所有物体
masks = sam3_segment(image)
# 估计深度
depth_map = depth_anything3(image)

# 提取关键物体的3D坐标
objects = {
    "chair": masks["chair"],
    "tv": masks["tv"],
    "fridge": masks["fridge"]
}

# 把2D掩码 + 深度图转成3D坐标
positions = {}
for name, mask in objects.items():
    points = depth_to_3d(mask, depth_map)
    positions[name] = np.mean(points, axis=0)

print("椅子位置:", positions["chair"])
# 输出: [ 2.1,  0.3, -1.5]
print("电视位置:", positions["tv"])
# 输出: [-3.2,  0.5,  2.8]
print("冰箱位置:", positions["fridge"])
# 输出: [ 4.1,  0.2, -2.0]

# 可视化中间结果
plot_3d_positions(positions)  # 在 Jupyter 里显示3D散点图

# === Step 3: 第二次写代码 — 计算相对方向 ===
# 内核记住了 positions 变量，可以直接用

# 定义"站在椅子前面对电视"的视角
chair_pos = positions["chair"]
tv_pos = positions["tv"]

# 看向方向（从椅子指向电视）
look_direction = tv_pos - chair_pos
look_direction = look_direction / np.linalg.norm(look_direction)

# 冰箱相对于椅子的方向
fridge_offset = positions["fridge"] - chair_pos

# 用叉积计算左右关系
# cross_product 的正负决定在看向方向的左侧还是右侧
cross = np.cross(look_direction, fridge_offset)
side = "left" if cross[1] > 0 else "right"

# 用点积计算前后关系
front_back = "front" if np.dot(look_direction, fridge_offset) > 0 else "back"

print(f"冰箱在{side}-{front_back}方向")
# 输出: 冰箱在left-front方向
```

注意看：Step 3 直接用了 Step 2 算出的 `positions` 变量——这就是**持久化内核**的威力。代码像写笔记本一样，一步一步积累中间结果。

### 示例 2：多视角空间推理（SVD 分解）

更复杂的场景：多张照片拼出完整空间。Agent 需要跨视角对齐、用线性代数推理。

```python
# === 问题: "壁炉朝北；健身区墙上那幅画朝哪个方向?" ===
# 需要: 多视角3D重建 + SVD分解墙平面

from scipy.spatial import transform
from scipy.linalg import svd

# 合并多视角的3D点云
all_points = {}
for view in views:  # views = [照片A, 照片B, 照片C, ...]
    masks = sam3_segment(view)
    depth = depth_anything3(view)
    points_3d = depth_to_3d_all_masks(masks, depth, view.camera_params)
    all_points.update(points_3d)

# 用 SVD 找出壁炉所在墙面的主平面
firewall_points = all_points["fireplace_wall"]
center = np.mean(firewall_points, axis=0)
centered = firewall_points - center
U, S, Vt = svd(centered)
normal_vector = Vt[0]  # 主成分的法向量 = 墙面法线

# 壁炉朝北 → 法向量就是北方向
north = normal_vector / np.linalg.norm(normal_vector)

# 同理找健身区墙面的法向量
gymwall_points = all_points["gym_wall"]
centered_gym = gymwall_points - np.mean(gymwall_points, axis=0)
U_gym, S_gym, Vt_gym = svd(centered_gym)
gym_normal = Vt_gym[0]

# 画朝向 = 墙面法线的反方向（墙面"面朝"的法线反侧）
painting_facing = -gym_normal

# 把朝向投影到水平面（只看东西南北）
painting_facing[1] = 0  # 忽略垂直方向
painting_facing = painting_facing / np.linalg.norm(painting_facing)

# 用角度判断方向
angle = np.arctan2(painting_facing[2], painting_facing[0])
directions = ["南", "西南", "西", "西北", "北", "东北", "东", "东南"]
heading_idx = int(((angle + np.pi) / (2 * np.pi)) * 8) % 8
print(f"画作朝向: {directions[heading_idx]}")
# 输出: 画作朝向: 东
```

这段代码展示了 SpatialClaw 的几个关键优势：

- 跨步引用：前面算好的 `all_points` 变量直接复用
- 自由组合：SAM 3 分割结果 + SciPy 的 SVD + NumPy 的线性代数，无缝衔接
- 可检查：每步都能 `print` 或 `plot`，Agent 能看到中间状态并修正策略

## 实验结果

在 20 个空间推理基准测试上，SpatialClaw 取得以下结果：

- **平均精度 59.9%**，比上一个最好的空间 Agent（SpaceTools-Toolshed）高出 +11.2 个百分点
- 比"不用任何工具"的基线高出 +6.5 个百分点
- 在 6 个不同的 VLM 骨干模型上都有稳定提升（从 26B 到 397B 参数）
- 提升最大的类别是 4D 动态空间（DSI-Bench +17.6）、多视角（MindCube +15.3）

关键发现：这些增益主要来自**动作接口的设计**，而不是工具本身。即使去掉所有专门的感知工具封装，仅保留代码 + 科学计算库，仍能比无工具基线高出 +2.7 个百分点。

## 核心洞察

SpatialClaw 证明了"代码即接口"这个思想在空间推理场景下的威力，可以总结为三个发现：

1. **可组合性**：代码让 Agent 自由组合感知输出和数学运算，不受固定工具接口的束缚
2. **可检查性**：持久化内核让中间结果成为一等公民，Agent 能看到、能调试、能修正
3. **可迭代性**：一步一步写代码，每一步都能根据前一步的结果调整策略，而不是"一次性写完就等结果"

这本质上是在说：空间推理不应该是"选工具 → 调工具 → 出答案"的流水线，而应该是"写代码 → 看结果 → 改代码 → 再试"的探索过程。前者适合有明确答案的问题，后者适合开放式的空间理解。

## 一句话总结

SpatialClaw 做的事情很简单——给 VLM 一个持久的 Python 环境，让它自己写代码做空间推理。效果却比精心设计的固定工具接口好得多，因为**代码是可编程的、可组合的、可迭代的**。
