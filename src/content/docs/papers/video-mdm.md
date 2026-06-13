---
title: VideoMDM — 从 2D 监督学 3D 人体运动生成的扩散模型
来源: 'https://arxiv.org/abs/2606.13364'
日期: 2026-06-13
分类: 机器学习
子分类: 动作生成
难度: 中级
provenance: pipeline-v3
---

## 是什么

VideoMDM 是一套基于扩散（diffusion）的框架，它只用**2D 姿态数据**（从单目视频里提取的）就能训练出**3D 人体运动生成模型**，不需要任何 3D 真值标注。日常类比：你有一堆普通人拍的视频，能从里面看出人的关节在 2D 屏幕上的位置，但不知道深度。VideoMDM 的做法是——先用一个已有的"2D 转 3D"猜测工具把 2D 变成粗糙的 3D，然后把这个有噪声的 3D 当" noisy teacher"，让扩散模型去学：每次给它加噪声再慢慢去噪，去完后把结果投影回 2D，跟真实的 2D 关键点对比来校正。通过对比发现，这种 2D 重投影误差在数学上等价于 3D 监督——所以模型虽然只看到 2D 信号，学到的却是一个连贯的 3D 运动空间。

## 背景：为什么这个问题难

传统 3D 人体运动生成（比如 MDM 这篇经典工作）依赖动作捕捉数据——人穿反光点进 mocap 棚录下来的 3D 骨骼运动，精确但昂贵且量少。网上有大量视频却只有 2D 信息。之前的人做法是：**训练时只用 3D 数据学模型，推理时再用一个 separate 的 2D→3D 提升器把 2D 转 3D**。问题在于：训练分布和推理分布不一致，2D→3D 提升器的误差会被扩散模型放大。

VideoMDM 的核心洞察：**如果训练时就只用 2D 监督，让扩散模型自己学"什么样的 3D 运动投影出来合理"，那就不存在分布不匹配的问题了。**

## 核心概念

### 概念 1：Noisy Teacher + 扩散去噪

想象你在玩"猜谜游戏"。老师先用粗糙工具把 2D 视频变成 3D 姿势——这个结果有误差，但不完美。然后老师往这个 3D 姿势上加随机噪声，变得面目全非。学生（扩散模型）的任务是从噪声中恢复出原始 3D 姿势。

关键区别在于**评估方式**：学生恢复后，不是跟 3D 真值比（因为没有真值），而是把恢复结果投影回 2D，跟视频里真实的关键点比。这个 2D 误差信号反向传播，教模型学会"怎样生成的 3D 运动投影后更接近真实"。

```python
# 训练循环伪代码——核心是 2D reprojection loss
for frames in video_dataset:
    # 1. 从视频提取精确 2D 关键点 (e.g. using Whalenpose or VideoPose3D)
    pose_2d = extract_2d_poses(frames)  # shape: (T, J, 2)

    # 2. 用 2D→3D lifter 生成近似 3D 姿势 (noisy teacher)
    pose_3d_noisy = lift_2d_to_3d(pose_2d)  # shape: (T, J, 3)

    # 3. 扩散过程：随机加噪声
    t = rand_step()
    pose_3d_noisy = add_noise(pose_3d_noisy, t)

    # 4. 扩散模型预测噪声
    predicted_noise = noise_model(pose_3d_noisy, t)

    # 5. 关键：去噪后的 3D 结果重投影回 2D，跟真实 2D 对比
    denoised_3d = remove_noise(pose_3d_noisy, predicted_noise)
    reprojected_2d = project_3d_to_2d(denoised_3d)  # 相机参数已知

    # 6. 用 2D 误差做损失——深度加权的重投影 loss
    # 距离相机越远的关节，深度不确定性越大，权重越低
    loss = depth_weighted_mse(reprojected_2d, pose_2d, depth=denoised_3d[:, :, 2])
    loss.backward()
    optimizer.step()
```

### 概念 2：深度加权 2D 重投影损失

为什么不能直接用普通的 2D MSE？因为 2D→3D 提升时，**深度方向的误差远大于 XY 平面的误差**。同一个像素偏移，在远处对应的 3D 位移比在近处大得多。

解决方案：给每个关键点的关键点分配一个权重——**深度越大（越远），权重越低**。论文证明了在 mild 假设下，这个加权 2D 损失的期望值等价于直接 3D 损失。

```python
def depth_weighted_2d_loss(reprojected_2d, gt_2d, depth_z):
    """
    深度加权 2D 重投影损失
    reprojected_2d: (T, J, 2) 模型预测的 3D 重投影回 2D
    gt_2d: (T, J, 2) 从视频中提取的精确 2D 关键点
    depth_z: (T, J) 预测 3D 姿势的深度值
    """
    # 2D 误差
    err_2d = (reprojected_2d - gt_2d) ** 2  # (T, J, 2)

    # 深度权重：深度越大（越远），权重越小
    # 用 1/(z + epsilon) 衰减，epsilon 防止除零
    depth_weight = 1.0 / (depth_z + 1e-4)  # (T, J)
    depth_weight = depth_weight.unsqueeze(-1)  # (T, J, 1)

    # 加权 MSE
    loss = (err_2d * depth_weight).mean()
    return loss
```

### 概念 3：3D 运动正则化器迁移到 2D 设定

只有 2D 损失还不够——模型可能学到"投影对了但物理上不合理的运动"（比如关节瞬移、速度突变）。所以论文把标准 3D 运动生成中的两个正则化器也搬了过来：

1. **速度一致性**：相邻帧之间位移不能突变
2. **过参数表示对齐**：用额外的骨骼约束（关节长度不变等）约束生成结果

```python
def motion_regularizers(pose_3d):
    """
    把 3D 运动正则化器应用到 VideoMDM 的生成结果上
    pose_3d: (T, J, 3) 生成的 3D 骨骼姿势序列
    """
    # --- 1. 速度一致性：相邻帧位移平滑 ---
    velocity = pose_3d[1:] - pose_3d[:-1]  # (T-1, J, 3)
    accel = velocity[1:] - velocity[:-1]   # (T-2, J, 3)
    velocity_loss = accel ** 2  # 惩罚加速度突变 = 运动不平滑

    # --- 2. 骨骼长度不变性：同一段骨骼相邻关节距离应恒定 ---
    # bone_pairs 是预定义的骨骼连接，如 [(hip, knee), (knee, ankle)]
    bone_lengths = []
    bone_lengths_target = []
    for parent_j, child_j in bone_pairs:
        length = torch.norm(
            pose_3d[:, parent_j] - pose_3d[:, child_j],
            dim=-1  # (T,)
        )
        bone_lengths.append(length)
        if len(bone_lengths) > 1:
            # 同一段骨骼在不同帧长度应一致
            diff = torch.diff(length)  # (T-1,)
            bone_lengths_target.append(diff ** 2)

    bone_loss = sum(bone_lengths_target)

    # 总正则化损失
    reg_loss = velocity_loss.mean() + bone_loss.mean()
    return reg_loss
```

### 概念 4： learns a coherent 3D motion manifold

这和"推理时才 lift 2D→3D"的方法有本质区别。VideoMDM 在训练阶段就让扩散模型接触真实视频的 2D 数据，学会的是"真实 3D 运动的统计规律"。生成时，模型从纯噪声开始去噪，输出的 3D 姿势天然落在 3D 运动流形上——即使推理时没有 lift 器的参与。

类比：前者像"翻译后校对"（翻译一个模型，校对一个模型，误差叠加）；后者像"直接用目标语言思考"（训练时就只接触目标语言的素材）。

## 结果

- 在 **HumanML3D** 数据集上，FID 0.88（对比全 3D 监督 MDM 的 0.54），几乎缩小了差距
- 在真实视频数据集 **Fit3D** 和 **NBA** 上，生成的运动在人类偏好评估中表现强劲

## 踩过的坑

1. **2D→3D lifter 的误差是系统性偏差**：不是随机噪声，某些角度天生难 lift（比如正面看时左右手臂重叠），会导致模型学到有偏的运动先验
2. **相机参数必须已知或可估计**：重投影需要相机内参和位姿，单目视频里这些信息通常缺失
3. **深度权重公式敏感**：1/(z+eps) 的 epsilon 取值影响很大，太小则远距离关节梯度爆炸，太大则近处关节得不到有效监督
4. **文本到运动的 conditioning 需要重新适配**：VideoMDM 基于 MDM 架构，但 MDM 的 text encoder 是为 3D 数据训练的，搬到 2D 监督下可能需要微调

## 学到什么

1. **2D 监督可以等价替代 3D 监督**——在合理假设下，深度加权重投影损失的期望等于 3D 损失
2. **扩散模型+运动先验** 这个范式正在扩展到更多数据稀缺场景
3. **训练分布和推理分布一致性** 是这类方法的核心设计原则
4. **正则化器可以跨监督设定迁移**——物理约束（关节长度、速度平滑）与监督信号来源无关

## 延伸阅读

- 论文首页：[https://arxiv.org/abs/2606.13364](https://arxiv.org/abs/2606.13364)
- 项目页面：[https://videomdm.github.io/](https://videomdm.github.io/)
- 代码仓库：[GitHub - Amir-Mann/VideoMDM_release](https://github.com/Amir-Mann/VideoMDM_release)
- [[mdm-human-motion]] —— Human Motion Diffusion Model，VideoMDM 的架构基础
- [[velocity-steering]] —— 扩散模型的运动控制方法，跟 VideoMDM 的正则化思路互补

## 关联

- [[mdm-human-motion]] —— MDM 是 VideoMDM 的架构起点
- [[whalenpose]] —— 精确 2D 姿态提取器，VideoMDM 的 2D pose 来源
- [[video-pose-3d]] —— 2D→3D 姿态提升的经典方法，VideoMDM 的 noisy teacher 组件
- [[velocity-steering]] —— 扩散模型的运动控制；跟 VideoMDM 的速度正则化呼应
