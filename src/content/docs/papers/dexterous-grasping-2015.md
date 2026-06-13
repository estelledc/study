---
title: DexNet — Learning to Grasp from Simulation
来源: https://openai.com/research/dex-net
日期: 2026-06-13
分类: 机器学习
子分类: robotics
provenance: pipeline-v3
---

# DexNet: 从仿真中学习灵巧抓取

> 原始论文: "Learning to Grasp with Deep Neural Networks from Simulation"
> 作者: Alex Zeng et al. (UCSB / Stanford / OpenAI)
> 来源: UCSB Grasping Lab + OpenAI Research 合作
> 关联论文: "DexNet 2.0: Learning to Grasp in 3D from Layers of Grasping" (ICRA 2017)

## 一、这个问题是什么？

想象一个刚出生的婴儿。他想伸手拿到桌上的积木，但他不知道手应该以什么角度、什么力度伸过去。他试了很多次——抓空了、推翻了、只碰到了一点点——慢慢地，他的大脑学会了："哦，原来这个角度的手握紧，才能把杯子拿起来。"

现在把这个场景换成机器人。让一个机械手（dexterous hand，像人手的五指灵巧手）从一堆乱七八糟的物体中，精准地抓起某一个特定的物体——比如一个被压在底下的螺丝刀——这在机器人领域叫 **6-DOF 抓取检测**（6 Degree-of-Freedom Grasp Pose Detection）。

"6-DOF" 是什么意思？就是你要同时确定：
1. 抓取点在 x 方向的坐标
2. 抓取点在 y 方向的坐标
3. 抓取点在 z 方向的坐标
4. 抓取时的旋转角度（roll）
5. 抓取时的俯仰角度（pitch）
6. 抓取时的偏航角度（yaw）

6 个自由度，意味着机械手在三维空间中有 **无限多种** 可能的抓取方式。传统方法靠人工设计规则来筛选，效率极低。

DexNet 的核心问题是：**能不能让机器人自己在虚拟世界里"练习"成千上万次抓取，然后把这些经验迁移到现实中？**

答案是：可以。而且他们做到了在密集杂乱场景中 **93% 的抓取成功率**。

## 二、核心概念

### 2.1 什么是"抓取"（Grasp）？

在机器人学中，一个"抓取"不是随便碰一下就算。它必须满足两个条件：

- **力封闭**（Force Closure）：机械手的手指施加的力能把物体"锁"住，不让它滑出来
- **几何可行**（Collision-Free）：手指不会撞到桌子或其他物体

类比：你用两根手指捏起一张纸——两根手指从相反方向施力，纸被"夹"住了，这就是力封闭。如果你只用一根手指去戳纸，纸会掉，这不叫抓取。

```
好的抓取 (Force Closure):          不好的抓取 (No Force Closure):

     ╱│╲                              │
    ╱ │ ╲   手指从两侧施力             │   手指从侧面推
   ╱  ●  ╲   物体被锁定                │   物体会滑走
  ╱       ╲
 ──────────                         ──────────
  桌面                                    桌面
```

### 2.2 抓取质量函数（Grasp Quality Function）

DexNet 的关键创新是定义了一个数学函数，叫 **抓取质量函数** $G(q)$：

$$G(q) = \begin{cases} 1 & \text{如果抓取 q 是成功的} \\ 0 & \text{如果抓取 q 失败了} \end{cases}$$

这个函数告诉机器人在给定抓取姿势 $q$ 下，成功率是多少。

但问题在于：**这个函数无法用公式直接计算**。因为你不知道一个物体表面在哪个角度被抓才会稳——除非你真的去做物理仿真。

所以 DexNet 的做法是：**用神经网络来近似这个函数**。

```
输入: 抓取姿势 q = (x, y, z, roll, pitch, yaw)
                + 物体的 3D 点云数据
                │
                ▼
   ┌─────────────────────────────┐
   │   深度神经网络 (CNN)          │
   │   输入: 多角度渲染的图像      │
   │   输出: 抓取成功概率 0~1     │
   └─────────────────────────────┘
                │
                ▼
  输出: G(q) ≈ 0.87  (这个抓取有 87% 的成功率)
```

### 2.3 仿真到现实的迁移（Sim-to-Real Transfer）

这是整篇论文最核心的想法。

**类比：就像你在 Minecraft 里练飞行，然后在现实中学开飞机**

在 Minecraft（我的世界）里，你可以自由地飞、跳、搭建——没有任何物理限制。但当你真正坐上驾驶舱时，你会发现"哦，现实中的飞机不能直接往上飞"。

DexNet 的做法正好相反：
1. 先在**仿真环境**中生成大量虚拟物体（用 CAD 模型）
2. 在仿真中测试每一种可能的抓取姿势，标记哪些能成功
3. 用这些数据训练一个神经网络
4. 把训练好的网络部署到**真实机器人**上

关键挑战：仿真和现实之间有差距（simulation gap）。仿真里的物体是完美光滑的，现实中的物体有纹理、有反光、有微小变形。DexNet 通过以下方式缩小这个差距：
- 在仿真中加入噪声和随机扰动
- 使用真实的深度传感器数据（如 Kinect）来校准
- 在训练数据中混合仿真数据和少量真实数据

### 2.4 抓取数据集（Grasp Dataset）

DexNet 生成了一个巨大的数据集，包含数百万个抓取样本。每个样本的结构如下：

```
抓取样本 (Grasp Sample):
  ├── 物体 ID: "cup_model_v3"
  ├── 抓取姿势 q:
  │     ├── position: (0.15, -0.03, 0.08) 米
  │     └── rotation: (roll=0°, pitch=90°, yaw=45°)
  ├── 标签 label: 1  (1=成功, 0=失败)
  └── 渲染图像: 从 6 个不同角度拍摄的模拟深度图
```

### 2.5 6-DOF 抓取空间

传统的抓取检测只考虑 2D 或 3D 的抓取（比如"从上往下夹"），而 DexNet 考虑的是完整的 **6 自由度抓取空间**：

```
抓取姿势的空间表示:

  位置 (3 DOF):
    x: 左右方向 (米)
    y: 前后方向 (米)
    z: 上下方向 (米)

  姿态 (3 DOF):
    α (roll):  绕 x 轴旋转
    β (pitch): 绕 y 轴旋转
    γ (yaw):   绕 z 轴旋转

  总共有多少个可能的抓取姿势？
  假设每个维度采样 100 个点：
    100 × 100 × 100 × 100 × 100 × 100 = 10^12 (一万亿) 种可能!
```

一万亿种可能，不可能全部测试。所以 DexNet 用两个策略：
1. **随机采样**：随机生成大量抓取姿势，在仿真中标记好坏
2. **CNN 分类**：训练网络快速判断新抓取姿势的好坏

## 三、DexNet 的完整流程

```
┌─────────────────────────────────────────────────────────┐
│                    DexNet 工作流程                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  第1步: 准备阶段                                         │
│  ├── 加载 1,000+ 个物体的 CAD 模型 (.obj 文件)           │
│  └── 定义机械手的 3D 模型 (如 Shadow Hand)               │
│                                                         │
│  第2步: 仿真数据生成                                     │
│  ├── 对每个物体，随机生成 N 个抓取姿势 (如 N=100,000)     │
│  ├── 在仿真器中"执行"每个抓取 (Bullet / Drake)           │
│  ├── 记录结果: 成功 or 失败                              │
│  └── 从多个角度渲染深度图像 → 作为 CNN 的输入             │
│                                                         │
│  第3步: 训练 CNN                                         │
│  ├── 输入: 多视角深度图像                                │
│  ├── 输出: 抓取成功概率                                   │
│  ├── 损失函数: 二元交叉熵 (Binary Cross-Entropy)         │
│  └── 训练集: 仿真生成的标注数据                           │
│                                                         │
│  第4步: 部署到真实机器人                                  │
│  ├── 用 Kinect 扫描现实中的物体 → 点云                   │
│  ├── 用训练好的 CNN 评估候选抓取姿势                      │
│  └── 选择得分最高的抓取姿势执行                           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## 四、代码示例

### 示例1：生成随机抓取姿势并模拟

这是一个简化的抓取姿势生成和仿真评估流程：

```python
import numpy as np
from dataclasses import dataclass
from typing import List, Tuple


@dataclass
class GraspPose:
    """
    一个抓取姿势: 6 个自由度

    类比: 这就像给机械手一个"指令"——
    去 (x,y,z) 这个位置，以 (roll,pitch,yaw) 这个角度握紧。
    """
    position: Tuple[float, float, float]  # (x, y, z) 米
    rotation: Tuple[float, float, float]  # (roll, pitch, yaw) 度


@dataclass
class GraspResult:
    """
    仿真评估的结果

    label=1 表示抓取成功（力封闭且无碰撞）
    label=0 表示抓取失败
    """
    pose: GraspPose
    label: int  # 1=成功, 0=失败
    quality_score: float  # 仿真器计算的抓取质量分数


def generate_random_grasps(
    object_bounds: Tuple[float, float, float],
    n_samples: int = 100_000
) -> List[GraspPose]:
    """
    在物体周围的包围盒内随机生成抓取姿势

    参数:
      object_bounds: 物体的包围盒 (min_x, max_x, min_y, max_y, min_z, max_z)
      n_samples:     要生成的抓取姿势数量

    返回:
      随机生成的抓取姿势列表
    """
    min_x, max_x, min_y, max_y, min_z, max_z = object_bounds
    poses = []

    for _ in range(n_samples):
        # 在包围盒内随机选一个位置
        x = np.random.uniform(min_x, max_x)
        y = np.random.uniform(min_y, max_y)
        z = np.random.uniform(min_z, max_z)

        # 随机选一个朝向 (0° ~ 360°)
        roll = np.random.uniform(0, 360)
        pitch = np.random.uniform(0, 360)
        yaw = np.random.uniform(0, 360)

        poses.append(GraspPose(
            position=(x, y, z),
            rotation=(roll, pitch, yaw)
        ))

    return poses


def simulate_grasp(pose: GraspPose, object_model) -> GraspResult:
    """
    在仿真器中评估一个抓取姿势

    简化版: 实际实现需要用 Bullet/Drake 做物理仿真，
    计算力封闭性和碰撞检测。这里用启发式规则模拟。

    类比: 就像你在虚拟世界里"试抓"——
    系统检查"如果机械手真的这么做，能不能抓住物体"。
    """
    x, y, z = pose.position
    roll, pitch, yaw = pose.rotation

    # 简化模拟: 根据抓取角度和质量打分
    # 实际上这里会调用物理仿真引擎
    quality = compute_grasp_quality(pose, object_model)

    # 力封闭判定: 质量分数 > 阈值才算成功
    threshold = 0.3
    label = 1 if quality > threshold else 0

    return GraspResult(pose=pose, label=label, quality_score=quality)


def compute_grasp_quality(pose: GraspPose, object_model) -> float:
    """
    计算抓取质量的简化函数

    实际实现中，这里会计算:
    - 力封闭矩阵的条件数 (condition number of grasp matrix)
    - 摩擦锥约束 (friction cone constraints)
    - 碰撞检测 (collision detection)

    简化版: 用角度和距离的启发式公式
    """
    roll, pitch, yaw = pose.rotation

    # 理想的抓取角度: 手指应该从物体两侧对称施力
    # pitch ≈ 90° 或 270° 通常是最稳定的
    pitch_penalty = min(abs(pitch - 90), abs(pitch - 270)) / 180.0

    # 抓取位置越靠近物体中心越好
    # (假设物体中心在原点)
    distance = np.sqrt(
        pose.position[0]**2 + pose.position[1]**2 + pose.position[2]**2
    )
    distance_penalty = min(distance / 0.5, 1.0)  # 归一化到 [0, 1]

    # 综合质量分数
    quality = (1.0 - pitch_penalty) * 0.6 + (1.0 - distance_penalty) * 0.4
    return max(0.0, min(1.0, quality))


# ---------- 使用示例 ----------
# 假设有一个杯子的包围盒
cup_bounds = (-0.04, 0.04, -0.03, 0.03, 0.0, 0.12)

# 生成 1000 个随机抓取姿势
random_grasps = generate_random_grasps(cup_bounds, n_samples=1000)
print(f"生成了 {len(random_grasps)} 个随机抓取姿势")

# 在仿真中评估每个抓取
results: List[GraspResult] = []
for grasp in random_grasps:
    result = simulate_grasp(grasp, None)
    results.append(result)

# 统计结果
success_count = sum(1 for r in results if r.label == 1)
total_count = len(results)
success_rate = success_count / total_count * 100

print(f"成功抓取: {success_count}/{total_count} ({success_rate:.1f}%)")

# 找出质量最高的抓取
best_grasp = max(results, key=lambda r: r.quality_score)
print(f"\n最佳抓取姿势:")
print(f"  位置: ({best_grasp.pose.position[0]:.3f}, "
      f"{best_grasp.pose.position[1]:.3f}, "
      f"{best_grasp.pose.position[2]:.3f})")
print(f"  角度: roll={best_grasp.pose.rotation[0]:.1f}°, "
      f"pitch={best_grasp.pose.rotation[1]:.1f}°, "
      f"yaw={best_grasp.pose.rotation[2]:.1f}°")
print(f"  质量分数: {best_grasp.quality_score:.3f}")
```

### 示例2：用 CNN 学习抓取质量预测

这是 DexNet 的核心——用卷积神经网络从图像中学习判断抓取好坏：

```python
import torch
import torch.nn as nn
import torch.optim as optim


class GraspCNN(nn.Module):
    """
    抓取质量预测的卷积神经网络

    类比: 这个网络就像一个"抓取教练"。
    你给它看一张物体的照片（从某个角度看），它告诉你
    "从这个角度抓，成功率大约 85%"。

    网络结构:
      输入: 多视角深度图像 (类似 RGB 但显示的是距离信息)
      输出: 抓取成功概率 (0 ~ 1)
    """

    def __init__(self, num_views=6):
        super().__init__()

        # 每个视角的深度图经过一个共享的 Feature Extractor
        # 共享权重意味着网络学会的是通用的"形状理解能力"
        self.feature_extractor = nn.Sequential(
            # 层1: 从深度图中提取边缘和轮廓
            nn.Conv2d(1, 32, kernel_size=7, stride=2, padding=3),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            # 输出: (32, H/2, W/2)

            # 层2: 提取更高级的几何特征
            nn.Conv2d(32, 64, kernel_size=5, stride=2, padding=2),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            # 输出: (64, H/4, W/4)

            # 层3: 提取局部形状特征
            nn.Conv2d(64, 128, kernel_size=3, stride=2, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            # 输出: (128, H/8, W/8)

            # 层4: 全局特征
            nn.Conv2d(128, 256, kernel_size=3, stride=1, padding=1),
            nn.BatchNorm2d(256),
            nn.ReLU(inplace=True),
            # 输出: (256, H/8, W/8)
        )

        # 多视角特征融合: 把所有视角的特征拼在一起
        # 6 个视角 × 256 通道 = 1536
        self.fusion = nn.Sequential(
            nn.Linear(256 * num_views, 512),
            nn.ReLU(inplace=True),
            nn.Dropout(0.5),
            nn.Linear(512, 128),
            nn.ReLU(inplace=True),
            nn.Linear(128, 1),
            nn.Sigmoid(),  # 输出 0~1 的概率
        )

    def forward(self, depth_images):
        """
        参数:
          depth_images: (batch, num_views, 1, H, W)
                        每个视角一张灰度深度图

        返回:
          抓取成功概率: (batch, 1)
        """
        batch_size, num_views = depth_images.shape[:2]

        # 把 batch 和 views 合并，一起过 feature extractor
        # (batch * num_views, 1, H, W)
        stacked = depth_images.view(-1, 1, *depth_images.shape[2:])
        features = self.feature_extractor(stacked)

        # 全局平均池化: 把每个通道的空间信息压缩成一个数
        # (batch * num_views, 256, h, w) → (batch * num_views, 256)
        features = nn.functional.adaptive_avg_pool2d(
            features, (1, 1)
        ).view(batch_size * num_views, -1)

        # 恢复 view 维度: (batch, num_views * 256)
        features = features.view(batch_size, num_views * 256)

        # 融合多视角特征 → 抓取概率
        probability = self.fusion(features).view(batch_size, 1)
        return probability


def train_grasp_cnn(model, dataloader, epochs=50, lr=1e-3):
    """
    训练抓取 CNN

    类比: 这就是"教"网络的过程。
    你给它看 100 万个抓取的图片+标签，它慢慢学会判断。

    训练流程:
      1. 网络猜一个概率 (比如 0.7)
      2. 和真实标签比较 (比如真实是 1 = 成功)
      3. 计算误差 (Loss = 0.3)
      4. 反向传播，调整网络参数
      5. 重复直到误差足够小
    """
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = model.to(device)

    criterion = nn.BCELoss()  # 二元交叉熵损失
    optimizer = optim.Adam(model.parameters(), lr=lr)

    for epoch in range(epochs):
        total_loss = 0.0
        correct = 0
        total = 0

        for depth_imgs, labels in dataloader:
            depth_imgs = depth_imgs.to(device)
            labels = labels.float().to(device)

            # 前向传播: 网络猜概率
            predictions = model(depth_imgs).squeeze(1)

            # 计算损失
            loss = criterion(predictions, labels)

            # 反向传播
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            # 统计
            total_loss += loss.item()
            predicted_labels = (predictions >= 0.5).float()
            correct += (predicted_labels == labels).sum().item()
            total += labels.size(0)

        accuracy = correct / total * 100
        avg_loss = total_loss / len(dataloader)

        if (epoch + 1) % 10 == 0:
            print(f"Epoch [{epoch+1}/{epochs}] "
                  f"Loss: {avg_loss:.4f}  Accuracy: {accuracy:.1f}%")


def predict_grasp(model, depth_images):
    """
    用训练好的网络预测一个新抓取的 succeed 概率

    类比: 训练完成后，这个网络就成了"抓取教练"。
    你给它看一张新物体的照片，它告诉你怎么抓最好。
    """
    model.eval()
    with torch.no_grad():
        prob = model(depth_images)
        return prob.item()


# ---------- 使用示例 ----------
# 创建模型
num_views = 6
model = GraspCNN(num_views=num_views)
total_params = sum(p.numel() for p in model.parameters())
print(f"网络参数量: {total_params:,}")

# 模拟一批训练数据
batch_size = 32
mock_depth = torch.randn(batch_size, num_views, 1, 128, 128)
mock_labels = torch.randint(0, 2, (batch_size, 1)).float()

# 测试前向传播
output = model(mock_depth)
print(f"预测概率形状: {output.shape}")
print(f"预测概率范围: [{output.min():.3f}, {output.max():.3f}]")
```

## 五、为什么这个方法有效？

### 5.1 数据量是关键

传统方法每次只能评估几百个抓取姿势。DexNet 在仿真中生成了 **数百万个** 抓取样本。数据量大了，神经网络就能学到更精细的模式。

### 5.2 多视角信息互补

从 6 个不同角度拍摄深度图，相当于从不同方向"看"同一个物体。有些角度能看到物体的正面，有些能看到侧面。网络综合这些信息后，判断更加准确。

```
6 个视角的深度图:

  前视图          侧视图          顶视图
  ┌─────┐        ┌─────┐        ┌─────┐
  │  📦  │        │  📦  │        │  📦  │
  │     │        │     │        │     │
  └─────┘        └─────┘        └─────┘
  看到正面       看到侧面       看到顶面
```

### 5.3 Sim-to-Real 为什么能工作？

虽然仿真和现实有差距，但抓取的核心几何关系（物体的形状、手指的位置）在两者之间是相似的。CNN 学到的不是"某个特定物体的抓取"，而是"什么样的几何构型会导致力封闭"——这是一种 **泛化能力**。

## 六、成果与影响

DexNet 系列工作的主要成果：

- **DexNet 1.0** (2015): 首次展示了从仿真数据训练 CNN 来判断抓取质量，在简单场景中达到 90%+ 成功率
- **DexNet 2.0** (2017): 引入分层抓取表示（layers of grasping），在密集杂乱场景中达到 93% 成功率
- **DexNet 3.0** (2018): 扩展到灵巧手（多指手），支持更复杂的抓取任务
- 开源了 **GraspNet** 数据集（2019）：包含 140 万+ 真实场景中的抓取标注，成为该领域的标准基准

## 七、局限性与后续方向

DexNet 虽然成功，但也有局限：

- **依赖 CAD 模型**：需要物体的 3D 模型才能在仿真中生成数据。对于从未见过的物体，效果会下降
- **仿真差距**：仿真中的物理模型（摩擦系数、弹性模量）和现实不完全一致
- **计算成本高**：生成数百万个仿真抓取需要大量算力
- **只考虑静态抓取**：不考虑抓取过程中的动态变化（如物体滑动、手指形变）

后续研究的方向包括：
- 端到端的学习（从原始传感器输入直接输出抓取动作）
- 结合语言指令的语义抓取（"拿起红色的杯子"）
- 在线适应（在现实中实时修正仿真中的偏差）

## 八、关键术语表

| 术语 | 英文 | 简单解释 |
|------|------|----------|
| 6-DOF 抓取 | 6-DoF Grasp | 在三维空间中确定抓取的位置和朝向，共 6 个参数 |
| 力封闭 | Force Closure | 手指施加的力能把物体牢牢锁住的状态 |
| 点云 | Point Cloud | 用大量三维点来表示物体表面的数据 |
| 深度图 | Depth Image | 每个像素存储"离相机多远"的图像 |
| 仿真器 | Simulator | 模拟物理世界的软件（如 Bullet、Drake） |
| 抓取质量函数 | Grasp Quality Function | 评估一个抓取姿势好坏的函数 |
| Sim-to-Real | Sim-to-Real Transfer | 将仿真中学到的知识迁移到现实世界 |
| 灵巧手 | Dexterous Hand | 有多根手指、能像人手一样灵活操作的机械手 |
| 包围盒 | Bounding Box | 包裹物体的最小长方体，用于限定搜索空间 |

## 九、推荐阅读

- **GraspNet-1Billion**: A Large-Scale Benchmark for General Object Grasping (CVPR 2020)
- **RT-1**: Robotics Transformer (Google, 2022) — 用语言指令控制机器人抓取
- **OpenVLA**: An Open-Source Vision-Language-Action Model (Stanford, 2024) — 开源的视觉-语言-动作模型
- **Pi0**: Physical Intelligence 的零样本抓取模型 (2024)
