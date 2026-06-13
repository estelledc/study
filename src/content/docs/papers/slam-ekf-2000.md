---
title: "An Efficient Extended Kalman Filter for SLAM — 用一张纸记住机器人走哪、周围有什么"
来源: 'https://ieeexplore.ieee.org/document/892133'
日期: 2026-06-13
分类: 机器学习
子分类: robotics
provenance: pipeline-v3
---

## 是什么

这篇论文（Thrun, Burgard & Fox, ICRA 2001）讲的是 **EKF-SLAM**——用**扩展卡尔曼滤波（EKF）**同时完成两件事：**机器人在哪**（定位）和**周围环境长什么样**（建图）。

日常类比：想象你在一个完全黑暗的大房子里走。你每走一步，脚底的感觉告诉你"我大概往前走了 0.8 米"（但脚底会骗人，可能是 0.7 或 0.9）。突然你的手摸到一面墙——墙的位置是固定的，这帮你校正了刚才的步数估计。再往前走，你又摸到一个柱子。过了一圈后，你脑子里有了一张**你自己位置 + 所有墙和柱子位置**的地图，而且每样东西旁边你都标记了"我觉得它在这儿，但不确定，误差大概是 X"。

EKF-SAM 就是把这个"脑子里的地图"用数学公式自动化。

## 为什么重要

不理解 EKF-SLAM，下面这些事都没法解释：

- 为什么扫地机器人、自动驾驶车、火星车都能"边跑边画图"
- 为什么 2000 年以前的机器人只能"在已知环境里走"，之后终于能"在未知环境里边探边画地图"
- 为什么 3DGS、NeRF 这些后起之秀在"重建静态场景"上很强，但**不需要知道机器人自己在哪里**——EKF-SLAM 解决的恰恰是"我在哪"这个问题
- 为什么后来很多更高级的 SLAM（如 ORB-SLAM、VIO）依然保留 EKF 的思想内核，只是换了"滤波器"的形式

## 核心概念

### 概念 1：卡尔曼滤波——"信自己，但信邻居更多"

卡尔曼滤波（KF）解决的是一个朴素问题：你有两个"噪声的估计"，怎么把它们合在一起得到更好的估计？

比如下面这个例子——你在走廊里走，轮速计说前进了 1 米，激光雷达测前方墙距离是 5 米。两个读数都有噪声，怎么融合？

```python
# 假设：轮速计估计你前进了 1.0 米，噪声（方差）是 0.1
# 假设：激光雷达预测墙应该在 5.0 米处，但实际读到 5.1 米

# --- 卡尔曼滤波的"更新步" ---

# 1. 计算"卡尔曼增益"K——决定信谁多一点
# K = 预测方差 / (预测方差 + 测量方差)
预测方差 = 0.09          # 你自己步数的不确定性
测量方差 = 0.04          # 激光雷达的不确定性
K = 预测方差 / (预测方差 + 测量方差)  # K ≈ 0.69

# 2. 融合：新估计 = 旧估计 + K × (实际测量 - 预测测量)
旧估计 = 1.0
残差 = 5.1 - 5.0          # 测量和预测差了 0.1 米
新估计 = 旧估计 + K * 残差  # 1.0 + 0.69 * 0.1 ≈ 1.069

# 3. 缩小方差——融合后更确信了
新方差 = (1 - K) * 预测方差  # ≈ 0.028（原来 0.09 缩小了 3 倍）

print(f"估计前进了: {新估计:.3f} 米 (不确定度从 0.09 降到 {新方差:.3f})")
```

核心直觉：**K 就是"天平"**——如果你自己的估计很准（方差小），K 就小，信别人多一点；如果激光雷达很准（测量方差小），K 就大，信自己多一点。

### 概念 2：扩展卡尔曼滤波（EKF）——"把非线性变线性"

现实世界不是线性的。机器人转弯时，"前进 1 米"不是简单的 x += 1，而是：

```
x_new = x_old + cos(角度) * 距离
y_new = y_old + sin(角度) * 距离
```

cos 和 sin 是**非线性函数**，标准 KF 处理不了。**EKF 的做法是在当前估计值附近"近似成直线"**——这叫一阶泰勒展开。

```python
import math
import numpy as np

# --- EKF 的"预测步"：机器人运动模型 ---
# 机器人当前位置和姿态 (x, y, θ)
pose = np.array([5.0, 3.0, math.pi / 4])  # 在 (5, 3)，朝向 45°

# 轮速计说"前进了 0.8 米，转角 0.1 弧度"
motion = np.array([0.8, 0.1])

# 非线性运动模型
def motion_model(pose, motion):
    x, y, theta = pose
    d, delta_theta = motion
    x_new = x + math.cos(theta) * d
    y_new = y + math.sin(theta) * d
    theta_new = theta + delta_theta
    return np.array([x_new, y_new, theta_new])

# 预测新位置
new_pose = motion_model(pose, motion)
print(f"预测位置: x={new_pose[0]:.2f}, y={new_pose[1]:.2f}, θ={math.degrees(new_pose[2]):.1f}°")

# --- EKF 的关键：雅可比矩阵（近似线性化）---
# J = d(运动模型)/d(状态) —— 在当前点附近，把曲线"拍扁"成平面
def jacobian_motion_model(pose):
    _, _, theta = pose
    return np.array([
        [1, 0, -math.sin(theta) * motion[0]],  # dx/dx, dx/dy, dx/dθ
        [0, 1,  math.cos(theta) * motion[0]],  # dy/dx, dy/dy, dy/dθ
        [0, 0,  1]                              # dθ/dx, dθ/dy, dθ/dθ
    ])

J = jacobian_motion_model(pose)
print(f"雅可比矩阵（运动模型在当前点的线性近似）:\n{J}")
```

### 概念 3：SLAM——"状态向量里同时装机器人和地标"

标准 KF 只跟踪一个状态向量。SLAM 把**机器人位置 + 所有地标位置**全部塞进一个巨大的联合状态向量：

```
x = [机器人_x, 机器人_y, 机器人_θ, 地标1_x, 地标1_y, 地标2_x, 地标2_y, ...]
```

协方差矩阵 C 则记录了**所有变量之间的相关性**——这是 EKF-SLAM 最精妙的地方：

```
         机器人_x    机器人_y    地标1_x    地标1_y
机器人_x   C11        C12        C13        C14
机器人_y   C21        C22        C23        C24
地标1_x   C31        C32        C33        C34
地标1_y   C41        C42        C43        C44
```

- 对角线 Cii：每个变量的**不确定性**（自己对自己的方差）
- 非对角线 Cij：两个变量之间的**相关性**——非常重要！因为当你用同一个地标校正自己位置时，机器人和地标的不确定性是**绑定的**

```python
import numpy as np

# --- EKF-SLAM 的状态向量 ---
# 假设：1 个机器人 + 2 个地标
# 状态 = [robot_x, robot_y, robot_theta, landmark1_x, landmark1_y, landmark2_x, landmark2_y]
n_landmarks = 2
state_dim = 3 + 2 * n_landmarks  # 7

# 初始状态（全部从零开始猜）
state = np.zeros(state_dim)

# 协方差矩阵——对角线表示各变量初始不确定性
# 机器人姿态不确定性最大（轮速计累积误差）
P = np.diag([0.1, 0.1, 0.5, 1.0, 1.0, 1.0, 1.0])

print(f"状态维度: {state_dim}")
print(f"协方差矩阵形状: {P.shape}")
print(f"初始机器人位置不确定性: sqrt({P[0,0]:.2f}) = {np.sqrt(P[0,0]):.2f}")
print(f"初始地标1位置不确定性: sqrt({P[3,3]:.2f}) = {np.sqrt(P[3,3]):.2f}")

# --- EKF-SLAM 的两个核心步骤 ---

# 步骤 1：预测（机器人运动了）
# P_new = J * P * J^T + Q
# J = 运动模型的雅可比，Q = 运动噪声
print("\n--- 预测步 ---")
J_motion = np.array([
    [1, 0, -0.8 * math.sin(math.pi/4)],
    [0, 1,  0.8 * math.cos(math.pi/4)],
    [0, 0,  1]
])
Q = np.diag([0.01, 0.01, 0.05])  # 运动噪声
P = J_motion @ P @ J_motion.T + Q  # 传播不确定性
print(f"预测后机器人位置不确定性: sqrt({P[0,0]:.4f}) = {np.sqrt(P[0,0]):.4f}")

# 步骤 2：更新（看到地标 1）
# 当观测到地标 1 时，只需要更新状态中与地标 1 相关的部分
print("\n--- 更新步：观测到地标 1 ---")
# 观测模型 h()：从状态向量预测"应该看到的地标 1 位置"
def landmark_observation(state, landmark_index):
    """预测第 i 个地标相对于机器人的观测"""
    rx, ry, theta = state[0], state[1], state[2]
    lx, ly = state[landmark_index], state[landmark_index + 1]
    # 在机器人坐标系下，地标应该在的方向和距离
    dx = lx - rx
    dy = ly - ry
    range_d = math.sqrt(dx*dx + dy*dy)
    bearing = math.atan2(dy, dx) - theta
    return np.array([range_d, bearing])

# 假设雷达报告：到地标 1 的距离 3.2 米，方位角 0.5 弧度
z_observed = np.array([3.2, 0.5])
z_predicted = landmark_observation(state, 3)
残差 = z_observed - z_predicted
print(f"残差（测量 - 预测）: {残差}")

# 计算观测雅可比 J_obs，然后做标准 EKF 更新
# K = P * J_obs^T * (J_obs * P * J_obs^T + R)^-1
# state = state + K * 残差
# P = (I - K * J_obs) * P
print("更新后不确定性缩小——这就是卡尔曼滤波的魅力")
```

### 概念 4：效率优化——"稀疏性就是生命"

这篇论文最核心的贡献标题就写了：**Efficient**。原始 EKF-SLAM 的协方差矩阵是稠密的 O(n²)，n 是地标数量，跑几千个地标就爆炸。

论文提出的优化思路：**相关性衰减**——当机器人在远处时，它和新发现的地标之间的协方差非常小，可以近似为 0。利用这个性质，把协方差矩阵"剪"成稀疏矩阵，复杂度从 O(n²) 降到接近 O(n)。

直觉：你在屋子东头看到的吊灯，跟你走到西头后的位置**几乎不相关**——因为从东头到西头的运动噪声是独立的，不会把东头的误差"传染"到西头的吊灯上。

```
稀疏化后的协方差矩阵长这样：
         机器人   地标1   地标2   地标3   地标4
机器人   ★       ★       .       .       .
地标1    ★       ★       ★       .       .
地标2    .       ★       ★       .       .
地标3    .       .       .       ★       ★
地标4    .       .       .       ★       ★

★ = 可能非零，. = 近似为 0
```

```python
import numpy as np

def sparsify_covariance(P, threshold=1e-3):
    """简单阈值稀疏化——实践中用更聪明的策略（如 Schur complement）"""
    P_sparse = P.copy()
    mask = np.abs(P_sparse) < threshold
    P_sparse[mask] = 0.0
    # 对称化
    P_sparse = (P_sparse + P_sparse.T) / 2
    return P_sparse

# 假设一个 10×10 的稠密协方差矩阵
n = 10
P_dense = np.random.rand(n, n) * 0.5
P_dense = (P_dense + P_dense.T) / 2  # 对称

P_sparse = sparsify_covariance(P_dense)
non_zero_dense = np.count_nonzero(P_dense)
non_zero_sparse = np.count_nonzero(P_sparse)

print(f"稠密矩阵非零元素: {non_zero_dense} / {n*n}")
print(f"稀疏化后非零元素: {non_zero_sparse} / {n*n}")
print(f"稀疏化比例: {(non_zero_sparse / non_zero_dense * 100):.1f}%")
```

## 算法总览

EKF-SLAM 每走一步做三件事：

| 步骤 | 做什么 | 类比 |
|------|--------|------|
| **预测** | 根据运动模型更新机器人位置，协方差"膨胀"（更不确定了） | 你闭眼走了 1 步——知道自己走了但不确定精确在哪 |
| **观测** | 看到已知地标，计算残差，用 EKF 更新更新所有相关状态 | 摸到墙，回头检查"我刚才到底站在哪" |
| **新增地标** | 第一次看到新地标，把它加入状态向量 | "哦，这边还有个柱子！" |

## 局限

- **线性化误差**：EKF 用一阶泰勒近似，如果运动或观测模型很非线性，估计会漂移甚至发散
- **地标关联**：如果不知道"刚才看到的"是不是"之前见过的那个"地标，会出问题——这就是"关联问题"，后来 ORB-SLAM 用特征描述子很好地解决了
- **初始稀疏化是近似**：阈值剪枝可能在极端情况下丢失有用信息

## 一句话总结

**EKF-SLAM 把"我在哪"和"周围有什么"打包进同一个高斯分布里，用卡尔曼滤波的两步（预测 + 更新）不断修正，用稀疏性让计算可行。**

## 延伸阅读

- Thrun 等人后来的论文把 EKF-SLAM 推广到实时机器人——这是现代机器人"边跑边画地图"的起点
- 后续发展：因子图优化（g2o, iSAM）、特征级 SLAM（ORB-SLAM）、直方图 SLAM（Cartographer）都保留了"联合估计"的核心思想，只是放弃了高斯假设
