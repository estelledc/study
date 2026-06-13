---
title: MoVerse: Real-Time Video World Modeling with Panoramic Gaussian Scaffold
来源: https://arxiv.org/abs/2606.13376
日期: 2026-06-13
分类_原始: 计算机视觉
分类: 机器学习
子分类: 视频生成
provenance: pipeline-v3
---

# MoVerse: 用全景高斯脚手架实现实时视频世界建模

## 一、从日常类比开始

想象你站在一个房间的中间，只能看到面前的这面墙——上面挂着一幅画、一盏灯、一扇窗。

现在有人问你："请描述一下你身后和两侧是什么样子。"

你答不上来，因为你没看过那些方向。这就是 MoVerse 这篇论文要解决的核心问题：**只给你一张普通照片，让 AI 脑补出整个 360 度的场景，并且让你能在其中自由走动。**

更夸张的是，它还能生成你走动时的实时视频画面。

## 二、这个问题为什么难？

要理解 MoVerse 的贡献，先看看它面对的三个挑战：

1. **视野缺失**：一张照片只能拍到前方一小块区域，左右、后方、头顶全黑
2. **持久几何**：你不能走到一半，身后的房间消失了
3. **连贯视频**：你移动时，看到的画面必须是流畅的视频，而不是一堆不相关的图片

以前的方法要么能重建 3D 但不能生成逼真视频，要么能生成视频但没有真正的 3D 可控性。MoVerse 把这两者结合起来了。

## 三、MoVerse 的三步架构

MoVerse 的工作流程分为三个阶段，每一步解决一个子问题：

### 第一步：拓扑感知扩散 —— 补全 360 度全景

输入是一张普通照片，输出是一张 360 度全景图。

这里的"拓扑感知"意思是：AI 在补全画面时，会理解物体的空间关系。比如照片里有张桌子，AI 不会在桌子后面画出一堵墙把它挡住，而是合理地延伸桌面和地板。

```python
# 伪代码：全景扩展阶段
def expand_to_panorama(single_image):
    # 1. 提取图像特征
    features = encoder(single_image)

    # 2. 使用拓扑感知扩散模型补全缺失视角
    #    扩散过程会"逐步去噪"，从随机噪声生成合理画面
    panorama = topology_aware_diffusion(
        source_features=features,
        missing_mask=compute_missing_regions(single_image),
        topology_constraints=extract_topology(single_image)
    )

    # 3. 输出重力对齐的 360° 全景图
    return gravity_align(panorama)
```

### 第二步：全景几何感知残差预测 —— 升维到 3D 高斯脚手架

这一步是把 2D 全景图变成 3D 表示。MoVerse 使用的是 **3D Gaussian Splatting**（3D 高斯泼溅）技术。

3D 高斯是什么？你可以把它想象成场景中的一颗颗"云朵"，每朵云有自己的位置、大小、形状、颜色和透明度。渲染时，把这些云投影到相机平面上，叠加起来就是一张逼真的图像。

MoVerse 的创新在于：它不是从零开始训练这些高斯云，而是通过"残差预测"的方式，在全景图的基础上增量添加和调整高斯云。

```python
# 伪代码：3D 高斯脚手架构建
def build_gaussian_scaffold(panorama):
    # 1. 从全景图中预测初始高斯参数
    initial_gaussians = geometry_encoder(panorama)

    # 2. 几何感知残差预测：根据场景深度线索调整高斯
    #    比如墙面应该是扁平的，物体应该有体积感
    residual = geometry_aware_residual_predictor(
        gaussians=initial_gaussians,
        depth_maps=predict_depth_maps(panorama),
        surface_normals=estimate_normals(panorama)
    )

    # 3. 合并得到最终的高斯脚手架
    final_scaffold = initial_gaussians + residual

    # 4. 输出可直接渲染的空间记忆
    return PersistentGaussianScaffold(final_scaffold)
```

### 第三步：高斯条件化视频渲染器 —— 按你的移动轨迹生成视频

有了 3D 高斯脚手架后，用户指定一条相机运动轨迹（比如向前走 5 米然后左转），渲染器就生成对应的视频帧。

为了让这个过程足够快以支持实时交互，MoVerse 用了**知识蒸馏**：

- **老师模型**：双向扩散模型，质量高但速度慢
- **学生模型**：因果自回归模型，速度够快用于实时流

老师教学生，学生继承了老师的渲染质量，但可以用更快的速度运行。

```python
# 伪代码：视频渲染阶段
def render_video(scaffold, camera_trajectory):
    # 1. 沿轨迹采样关键帧相机位姿
    frames = []
    for pose in sample_trajectory(camera_trajectory, num_frames=60):
        # 2. 从高斯脚手架渲染基础视图
        base_render = gaussian_rasterize(scaffold, pose)

        # 3. 学生模型（因果自回归）生成高质量视频帧
        #    因果意味着只看过去的帧，不偷看未来
        video_frame = causal_student_renderer(
            base_render=base_render,
            previous_frames=frames[-3:],  # 依赖前3帧保持连贯
            camera_pose=pose
        )
        frames.append(video_frame)

    return concat_frames(frames)
```

## 四、关键技术概念详解

### 4.1 3D Gaussian Splatting（3D 高斯泼溅）

这是 MoVerse 的"空间记忆"载体。每个 3D 高斯由以下参数定义：

- **位置** (x, y, z)：高斯云的中心点
- **缩放** (scale_x, scale_y, scale_z)：高斯云的形状
- **旋转** (quaternion)：高斯云的朝向
- **不透明度** (opacity)：有多透明
- **球谐函数系数** (SH coefficients)：决定颜色随视角的变化

渲染时，将所有高斯投影到 2D 平面，按深度排序，然后从近到远累加颜色。这就是"Splatting"（泼溅）的由来。

### 4.2 拓扑感知扩散（Topology-Aware Diffusion）

扩散模型的基本思想是从纯噪声中逐步生成图像。MoVerse 的改进是加入"拓扑约束"：

- 地面应该连续，不应该突然断裂
- 物体的边缘应该平滑过渡
- 透视关系应该一致

这些约束确保补全出的全景图在物理上是合理的。

### 4.3 知识蒸馏（Knowledge Distillation）

| 特性 | 老师模型（双向扩散） | 学生模型（因果自回归） |
|------|---------------------|------------------------|
| 推理方向 | 前后向都可以 | 只能从前向后 |
| 质量 | 更高 | 略低但接近 |
| 速度 | 慢（需要多步迭代） | 快（单步或少数几步） |
| 用途 | 训练阶段 | 实时推理阶段 |

## 五、性能表现

MoVerse 在单张 NVIDIA RTX 4090 GPU 上实现了 **8 FPS** 的实时场景漫游。

这个数字怎么理解？

- 传统 3D 重建 + 渲染管线通常需要离线计算数小时
- 纯视频生成模型（如 Sora、Runway）无法做到交互式相机控制
- 8 FPS 虽然不够流畅（正常视频是 30-60 FPS），但对于"交互式探索"来说已经可用——你移动相机，等不到半秒就能看到新画面

## 六、MoVerse 的意义

这篇论文的价值在于它打通了一条之前没人走过的路：

1. **单图入，视频出**：不需要深度相机、激光雷达或多张照片，只要一张普通图片
2. **3D 可控 + 视频质量**：既有 3D 表示的精确可控性，又有生成模型的逼真画质
3. **实时交互**：8 FPS 意味着可以在消费级硬件上运行

这为游戏开发、虚拟现实、机器人仿真等领域提供了一种新的场景创建方式。

## 七、思考与局限

MoVerse 目前还有一些局限性值得留意：

- 8 FPS 对于流畅体验仍有差距，需要更强的硬件或更高效的算法
- 单张输入的限制意味着补全的部分本质上是"猜测"，不一定反映真实场景
- 复杂动态场景（如人群流动的水立方）可能超出当前静态 3D 高斯的表达能力

## 八、总结

MoVerse 的核心思路可以概括为一句话：**先用 AI 想象力补全全景，再把全景变成 3D 空间，最后在这个空间里按你的脚步生成视频。**

它把世界建模（World Modeling）这件事，从"需要大量数据和专业设备"变成了"一张照片就够了"。

---

*本文基于 arXiv:2606.13376 撰写，作者：Yang Zhou, Ziheng Wang, Yuqin Lu, Haofeng Liu, Jun Liang, Shengfeng He, Jing Li。发表于 2026 年 6 月 11 日。*
