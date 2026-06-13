---
title: Differentiable Rendering: A Comprehensive Survey
来源: https://arxiv.org/abs/2401.00024
日期: 2026-06-13
分类: 图形学
子分类: 渲染与图形
provenance: pipeline-v3
---

# Differentiable Rendering: A Comprehensive Survey — 学习笔记

## 一、一句话理解

可微分渲染（Differentiable Rendering）让计算机图形学"会学习"——它能把渲染图像与真实图像之间的差距，转化成可以反向传播的梯度信号，从而让计算机自动优化 3D 场景中的未知参数。

## 二、日常类比：给相机倒着调曝光

想象你在玩一款摄影游戏。你面前有一个 3D 场景（有灯光、物体材质、相机位置），你拍了一张照片。现在有人告诉你："这张照片和真实场景的差距是 50 分。"

传统渲染的做法是：你拍一张 → 看到差距 → 手动去调灯光亮度、材质颜色，再拍 → 再调。像盲人摸象，来回试错。

可微分渲染的做法是：你拍一张 → 系统直接告诉你："灯光太暗了 0.3 档，材质反光太强了 0.5 档"——这就是**梯度**。你不需要手动猜，系统帮你算好了方向，你只需要"跟着梯度走"，几步就能调到接近真实。

核心比喻：**传统渲染是正向的"画师"，可微分渲染是带"纠错指南"的画师。**

## 三、核心概念拆解

### 3.1 传统渲染 vs. 可微分渲染

| 维度 | 传统渲染 | 可微分渲染 |
|---|---|---|
| 输入 | 3D 场景参数 | 3D 场景参数（可优化） |
| 输出 | 一张图像 | 一张图像 + 每个参数的梯度 |
| 方向 | 场景 → 图像（前向） | 场景 → 图像 → 梯度（可反向） |
| 关键公式 | I = R(S) | I = R(S)，且 dI/dS 可计算 |

其中 R 是渲染函数，S 是场景参数，I 是输出图像。

### 3.2 为什么"可微"这么重要？

因为**梯度 = 优化的燃料**。有了梯度，你可以用 SGD、Adam 等优化器自动调整任何可学习的参数：

- 3D 几何（模型形状）
- 材质属性（反射率、粗糙度）
- 光照条件（方向、强度、颜色）
- 相机参数（位置、角度）

### 3.3 两种主要方法

**1. 可微光线追踪（Differentiable Ray Tracing）**

把光线追踪过程中的每个步骤（求交、着色、采样）变成可微操作。适合复杂光照、阴影、反射的精确计算。

**2. 可微体渲染（Differentiable Volume Rendering）**

把 3D 空间离散成体素或采样点，沿着相机射线积分颜色和不透明度。NeRF（Neural Radiance Field）就是最著名的代表。

## 四、代码示例

### 示例 1：PyTorch 可微体渲染核心思路

```python
import torch

# 假设我们有一条相机射线，穿过了 N 个体素
# each voxel has: color (RGB), opacity, and depth (z)
N = 100
colors = torch.randn(N, 3, requires_grad=True)  # 待优化的材质颜色
opacities = torch.sigmoid(torch.randn(N, 1, requires_grad=True))  # 不透明度 (0~1)
depths = torch.linspace(0, 10, N, requires_grad=False)  # 深度固定
dt = depths[1] - depths[0]  # 每个体素的厚度

# 前向：体渲染公式 —— 沿射线积分
# C(r) = sum_i T_i * (1 - alpha_i) * c_i
# T_i = product_{j<i} (1 - alpha_j)  表示前面所有体素的透射率
alphas = 1 - torch.exp(-opacities * dt)  # 转化为不透明度
Ts = torch.cumprod(torch.cat([torch.ones(1, 1), 1 - almas[:-1]]), dim=0)  # 累计透射率
T_i = Ts * (1 - alphas)  # 当前体素对射线的贡献

# 合成像素颜色
pixel_color = (T_i * colors).sum(dim=0)

# 假设我们有目标图像（ground truth）
target = torch.tensor([0.5, 0.3, 0.2])
loss = ((pixel_color - target) ** 2).sum()

# 反向传播：梯度自动流向 colors 和 opacities
loss.backward()

# 更新参数
with torch.no_grad():
    colors -= 0.01 * colors.grad
    opacities -= 0.01 * opacities.grad
```

**逐行解释（零基础版）：**
- 第 1 行：导入 PyTorch，这是做深度学习最常用的库
- 第 5-6 行：模拟一条射线穿过 100 个体素，每个体素有颜色（RGB）和不透明度
- 第 14 行：`requires_grad=True` 告诉 PyTorch"我要对这个变量求梯度"
- 第 18-21 行：体渲染公式——想象你透过一层层半透明玻璃看东西，每层玻璃贡献一部分颜色和透明度
- 第 24 行：把目标颜色和当前渲染结果做平方差，得到"损失"（差距有多大）
- 第 27 行：**关键一行**——`backward()` 自动计算每个参数对损失的贡献方向
- 第 30-31 行：按梯度方向更新参数，让差距越来越小

### 示例 2：简化版可微光线追踪求交梯度

```python
import torch

# 假设我们有一个球体，参数是：中心位置 (cx, cy, cz) 和半径 r
# 我们想通过可微分渲染，从 2D 图像反推这个球体的 3D 位置
center = torch.tensor([0.0, 0.0, 5.0], requires_grad=True)
radius = torch.tensor([1.0], requires_grad=True)

# 相机射线的原点 (origin) 和方向 (direction)
origin = torch.tensor([0.0, 0.0, 0.0])
direction = torch.tensor([0.0, 0.0, 1.0])  # 沿 z 轴

# 球面求交公式（二次方程）
# |origin + t*direction - center|^2 = r^2
oc = origin - center
a = torch.dot(direction, direction)
b = 2.0 * torch.dot(oc, direction)
c = torch.dot(oc, oc) - radius ** 2
discriminant = b ** 2 - 4 * a * c

if discriminant > 0:
    t = (-b - torch.sqrt(discriminant)) / (2 * a)
    hit_point = origin + t * direction
    # 计算法线（用于着色）
    normal = (hit_point - center) / radius
    # 简单漫反射光照
    light_dir = torch.tensor([1.0, 1.0, -1.0]).norm(p=2)
    diffuse = max(0, torch.dot(normal, light_dir))
    rendered_color = diffuse * torch.tensor([1.0, 0.8, 0.6])
else:
    rendered_color = torch.tensor([0.0, 0.0, 0.0])

# 目标颜色（我们希望渲染出的颜色）
target_color = torch.tensor([0.7, 0.6, 0.4])
loss = ((rendered_color - target_color) ** 2).sum()

# 反向传播
loss.backward()

print(f"球体中心梯度: {center.grad}")
print(f"球体半径梯度: {radius.grad}")
```

**逐行解释（零基础版）：**
- 第 7-8 行：定义了一个球体，位置和半径都是"可学习的参数"
- 第 11-12 行：定义了一条从相机出发的射线
- 第 16-21 行：球面求交的数学——解一个二次方程，找到射线和球体的交点
- 第 27 行：计算表面法线（垂直于表面的方向），这是光照计算的基础
- 第 29-30 行：简易漫反射着色——光线从哪个方向来，表面朝向哪里
- 第 34-35 行：定义目标和损失
- 第 38-40 行：求梯度并打印——系统告诉你"把球心往这个方向挪一点，损失会变小"

## 五、论文主要贡献梳理

根据综述论文的分类，可微分渲染领域主要涵盖三大方向：

### 5.1 通用可微渲染理论

- 定义渲染方程的泛化形式
- 处理不连续情况（如物体进入/离开视野）的梯度
- 统一光线追踪和栅格化的可微形式

### 5.2 蒙特卡洛采样策略

- 可微分路径追踪（Differentiable Path Tracing）
- 方差减少技术（importance sampling, control variates）
- 无偏梯度估计

### 5.3 计算效率优化

- 层级 BVH（Bounding Volume Hierarchy）优化求交
- GPU 并行加速
- 实时可微渲染（用于 VR/AR 等交互场景）

## 六、关键应用场景

### 6.1 逆渲染（Inverse Rendering）

从 2D 图像恢复 3D 场景的材质、光照和几何。应用：照片级真实的 3D 重建、虚拟制作、电影特效。

### 6.2 单目 3D 重建

只用一张照片，就能推断出物体的 3D 形状。应用：手机端 3D 扫描、增强现实。

### 6.3 机器人视觉

机器人通过可微分渲染在仿真环境中训练，再迁移到真实世界。应用：自动驾驶、机械臂操作。

### 6.4 神经渲染（Neural Rendering）

NeRF、3D Gaussian Splatting 等都是可微分渲染的产物。应用：新视角合成（从任意角度观看场景）。

## 七、挑战与开放问题

1. **不连续性问题**：当物体边缘穿过像素时，梯度会突变。如何平滑处理？
2. **计算成本高**：可微光线追踪的内存消耗远超传统渲染。
3. **多模态融合**：如何将深度、法线、语义等其他传感器信息一起优化？
4. **实时性**：当前方法大多离线，实时可微渲染仍待突破。

## 八、个人思考

学习可微分渲染，本质上是在理解"如何让计算机自动解决一个很难的逆向问题"。正向问题（已知 3D → 生成 2D 图像）已经有了成熟的图形学方法。逆向问题（已知 2D → 推断 3D）在传统方法下几乎是不可解的，但引入可微分+优化框架后，就变成了一个"梯度下降"问题。

这背后的思维方式转变很值得注意：**从"手写规则"到"定义损失+自动优化"**，这个范式在 AI 时代正在横扫各个领域。

## 九、延伸阅读推荐

- NeRF 原始论文：Mildenhall et al., "NeRF: Representing Scenes as Neural Radiance Fields for View Synthesis" (2020)
- 3D Gaussian Splatting：Kerbl et al., "3D Gaussian Splatting for Real-Time Radiance Field Rendering" (2023)
- PyTorch3D 库：Facebook Research 的可微渲染工具包
