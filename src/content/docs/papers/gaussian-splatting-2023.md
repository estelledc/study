---
title: "3D Gaussian Splatting for Real-Time Radiance Field Rendering"
来源: https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/
日期: 2026-06-13
分类: 图形学
子分类: 渲染与图形
provenance: pipeline-v3
---

# 3D Gaussian Splatting 学习笔记

## 什么是辐射场（Radiance Field）？

想象你走进一间屋子，闭上眼睛，用耳朵听回声来判断房间的布局。辐射场就是让计算机做类似的事——只不过它用的是"光"而不是"声音"。

辐射场是一个数学描述：对于空间中的每一个点，它记录了你从那个位置往任何方向看时，会看到什么颜色。NeRF（2020 年那篇著名论文）用神经网络来学习这个描述。但 NeRF 有个大问题：训练慢、渲染慢，基本不可能实时运行。

3D Gaussian Splatting（简称 3DGS）在 2023 年 SIGGRAPH 上发表了它的答案：**用一堆 3D 高斯球来直接表示场景，而不是用神经网络。**

## 核心类比：用彩色棉花糖建世界

把 3D 空间想象成一块巨大的豆腐。NeRF 的方法是在豆腐里面塞了一个微型计算器——每当你想知道某个位置什么颜色，就去算一下。

3DGS 的做法是在豆腐里塞**彩色棉花糖**（3D 高斯分布）。每个棉花糖有自己的位置、大小、形状（椭圆）、颜色和透明度。渲染时，你从相机角度看去，只需要看看哪些棉花糖挡在你的视线前面，把它们"拍扁"到屏幕上，混合颜色就行。

关键区别：

- NeRF = 每次都实时计算颜色（慢）
- 3DGS = 提前放好棉花糖，渲染时直接拍扁混合（快）

"Splatting"（拍扁）这个词很形象——把 3D 的椭球高斯拍扁成 2D 的椭圆，投射到屏幕上，像墨水泼在纸上一样扩散。

## 三个核心创新

### 1. 用 3D 高斯表示场景

每个 3D 高斯由以下参数定义：

```python
class Gaussian3D:
    """一个三维高斯分布的直观表示"""

    # 中心位置 (x, y, z)
    position: np.ndarray      # shape=(3,)

    # 透明度（0=完全透明，1=完全不透明）
    opacity: float            # range=[0, 1]

    # 颜色和形状：颜色用球谐函数（Spherical Harmonics）表示
    # 球谐函数就像一个"方向调色板"——从高斯中心往不同方向看，颜色可以不同
    sh_coefficients: np.ndarray  # shape=(num_bases * 3,)

    # 缩放（各向异性）
    scale: np.ndarray         # shape=(3,)  每个轴独立缩放

    # 旋转（四元数）
    rotation: np.ndarray      # shape=(4,)  四元数表示
```

初始化时，这些高斯的位置来自 SfM（Structure from Motion）算法产生的稀疏点云——也就是相机标定阶段已经找到的 3D 特征点。你可以把这些点理解成"场景中已经探测到的坐标碎片"。

### 2. 迭代式优化与密度控制

高斯不是一开始就摆好不动的。训练过程中有一个 interleaved（交替）的优化循环：

```
训练步骤：
  1. 从当前高斯集合渲染一张假图像
  2. 跟真实照片比较，算出误差（L1 loss + SSIM）
  3. 反向传播，更新高斯的参数（位置、颜色、透明度等）
  4. 密度控制（density control）：
     a. 复制（clone）：梯度大的区域，把一个高斯分裂成两个
     b. 剪枝（prune）：透明度太低的高斯，直接删掉
     c. 重置（reset）：某些高斯透明度重置，避免冗余
  5. 重复 30000 次
```

密度控制是 3DGS 的精髓。想象你在用马赛克拼图：

- 某些区域（比如一面白墙）很简单，少几个大方块就够了
- 某些区域（比如树叶的纹理）很复杂，需要很多小方块

3DGS 自动做这件事——它不知道哪里该密哪里该疏，而是在训练过程中**自我发现**：如果某个地方渲染出来的颜色和真实照片差距大，说明那里的描述不够精细，就复制更多高斯；如果某个高斯几乎透明、对画面没贡献，就删掉。

### 3. 高效的可见性感知渲染（Splatting）

这是"实时"的关键。传统 NeRF 渲染需要对视线穿过的空间中**无数个点**采样，每个点都过一遍神经网络。

3DGS 的渲染流程：

```
渲染一帧的流程：
  1. 把每个 3D 高斯投影到 2D 屏幕——变成 2D 椭圆
  2. 按深度排序（从远到近）
  3. 对每个椭圆，计算它在屏幕上覆盖的像素
  4. 从远到近依次混合颜色（alpha blending）
  5. 输出最终像素颜色
```

投影公式的核心是高斯的协方差矩阵变换。3D 高斯的协方差是一个 3x3 矩阵 `C`，包含了缩放（scale）和旋转（rotation）信息。投影到 2D 时：

```python
import torch

def project_3d_gaussian_to_2d(mean_3d, covariance_3d, camera_params):
    """
    将 3D 高斯投影到 2D 屏幕空间

    参数:
      mean_3d:         高斯中心在 3D 世界坐标 (3,)
      covariance_3d:   3D 协方差矩阵 (3, 3)
      camera_params:   相机内外参，包含投影矩阵 W 和视图变换 V

    返回:
      mu_2d:     2D 投影中心
      cov_2d:    2D 投影协方差（决定椭圆的形状和方向）
    """
    # 1. 把 3D 中心变换到相机坐标系
    mean_cam = camera_params.V @ mean_3d  # V 是视图变换矩阵

    # 2. 用雅可比矩阵 J 做线性近似，把 3D 协方差投影到 2D
    #    雅可比 = 投影函数对 3D 坐标的导数
    J = compute_jacobian(camera_params, mean_cam)  # (2, 3)

    # 3. 2D 协方差 = J @ 3D协方差 @ J^T
    #    这就是"椭球拍扁成椭圆"的数学公式
    cov_2d = J @ covariance_3d @ J.T  # (2, 2)

    # 4. 加上一个小的正则化项，防止数值不稳定
    cov_2d += 0.3 * torch.eye(2, device=cov_2d.device)

    return mean_2d, cov_2d


def render_gaussians_to_image(gaussians, camera_params, image_width, image_height):
    """
    将所有 3D 高斯渲染成一张 RGB 图像

    参数:
      gaussians:     场景中的所有高斯列表
      camera_params: 当前相机参数
      image_width:   图像宽度
      image_height:  图像高度

    返回:
      image: 渲染出的 RGB 图像 (H, W, 3)
    """
    # 1. 把所有高斯投影到 2D
    projected = []
    for g in gaussians:
        mu_2d, cov_2d = project_3d_gaussian_to_2d(g.position, g.covariance, camera_params)
        projected.append({
            'mean': mu_2d,
            'cov': cov_2d,
            'opacity': g.opacity,
            'color': evaluate_sh_color(g.sh_coefficients, g.direction),
            'cov3d': g.covariance,
        })

    # 2. 按深度排序（从远到近）—— 这是 alpha blending 的要求
    projected.sort(key=lambda g: g['depth'], reverse=True)

    # 3. 初始化输出图像
    image = torch.zeros((image_height, image_width, 3), device='cuda')
    alpha_accum = torch.zeros((image_height, image_width), device='cuda')

    # 4. 对每个高斯，"拍扁"到屏幕上并混合颜色
    for g in projected:
        # 计算这个高斯覆盖的屏幕区域（bounding box）
        bbox = compute_bounding_box(g['mean'], g['cov'])

        # 只处理边界框内的像素
        for y in range(bbox.y1, bbox.y2):
            for x in range(bbox.x1, bbox.x2):
                if not in_image_bounds(x, y, image_width, image_height):
                    continue

                # 计算这个像素相对于高斯中心的 2D 距离
                dist = mahalanobis_distance(
                    (x, y), g['mean'], g['cov']
                )

                # 高斯核函数——距离越远，透明度贡献越低
                gaussian_val = torch.exp(-0.5 * dist)

                # Alpha blending: 新颜色 = 旧颜色 * (1-新透明度) + 新高斯颜色 * 新透明度
                contribution = g['opacity'] * gaussian_val
                new_alpha = alpha_accum[y, x] + contribution * (1 - alpha_accum[y, x])

                if new_alpha > 0.999:
                    break  # 已经完全不透光了，停止混合

                color = g['color']
                image[y, x] = (
                    image[y, x] * (alpha_accum[y, x] / new_alpha * (1 - contribution))
                    + color * contribution * (1 - alpha_accum[y, x] / new_alpha)
                )
                alpha_accum[y, x] = new_alpha

    return image
```

## 为什么 3DGS 这么快？

对比来看：

| | NeRF | 3D Gaussian Splatting |
|---|---|---|
| 场景表示 | 神经网络（MLP） | 显式高斯点集 |
| 训练时间 | 几小时 | 几分钟到几十分钟 |
| 渲染速度 | 每秒几帧 | 实时（100+ fps @ 1080p） |
| 显存占用 | 几 GB（网络权重小） | 几十 GB（存储每个高斯） |
| 本质 | 隐式函数 | 显式几何 |

3DGS 用**空间换时间**——把场景信息直接存成高斯参数（每个高斯约 80 字节），渲染时不需要任何网络推理，纯数学计算就可以完成投影和混合。

但代价是显存。NeRF 的神经网络只有几 MB 到几 GB，而 3DGS 在高质量渲染时可能有**百万到千万级高斯**，占用几十 GB 显存。这也是 3DGS 目前最大的局限——它更适合完整场景（unbounded scenes），不适合超大开放世界。

## 训练流程全貌

```python
# 伪代码：一个完整的 3DGS 训练循环

def train_gaussian_splatting(scene_images, camera_poses):
    """
    3D Gaussian Splatting 训练主循环
    """
    # Phase 1: 从 SfM 点云初始化高斯
    sfm_points = load_sfm_points()  # 从 COLMAP 加载稀疏点云
    gaussians = []
    for point in sfm_points:
        g = Gaussian3D(
            position=point.xyz,
            opacity=0.1,           # 初始透明度很低，让优化来调整
            scale=uniform_random(), # 随机初始大小
            rotation=identity_quat(),
            sh_coefficients=zero(),
        )
        gaussians.append(g)

    # Phase 2: 迭代优化
    for iteration in range(30000):
        # 2a. 随机采样一张训练图像
        gt_image, camera = sample_training_view(scene_images, camera_poses)

        # 2b. 渲染当前高斯集合得到的假图像
        rendered_image = render_gaussians_to_image(gaussians, camera)

        # 2c. 计算损失
        l1_loss = torch.abs(rendered_image - gt_image).mean()
        ssim_loss = 1 - ssim(rendered_image, gt_image)
        total_loss = l1_loss + 0.2 * ssim_loss

        # 2d. 反向传播，更新高斯参数
        total_loss.backward()

        # 2e. 梯度下降更新（使用 Adam）
        gaussians.optimizer_step()

        # 2f. 密度控制（每 100 次迭代做一次）
        if iteration % 100 == 0 and iteration > 500:
            densify_and_prune(gaussians, threshold=0.0002)

        # 2g. 定期重置过高的透明度
        if iteration % 3000 == 0:
            reset_opacitys(gaussians)

        # 2h. 逐渐降低位置的学习率（学习率衰减）
        gaussians.position_lr = decay_lr(iteration)

    return gaussians


def densify_and_prune(gaussians, threshold=0.0002):
    """
    密度控制：分裂、复制、剪枝高斯

    这个函数是 3DGS 质量的关键——它让高斯在需要的地方变多、
    在没用的地方变少。
    """
    for g in gaussians:
        grad_norm = g.position_gradient_norm

        if grad_norm > threshold:
            # 梯度大 = 这个位置的渲染误差大 = 需要更精细的描述
            # 策略1：复制（clone）—— 创建一个新的高斯在旁边
            new_gaussian = clone(gaussian=g, offset=random_small_vector())
            gaussians.append(new_gaussian)

        elif g.opacity < 0.005:
            # 透明度极低 = 几乎看不见 = 删掉省显存
            gaussians.remove(g)

    # 限制总数，防止无限增长
    if len(gaussians) > MAX_GAUSSIANS:
        remove_lowest_importance(gaussians, MAX_GAUSSIANS)
```

## 关键概念总结

- **3D 高斯**：场景的基本构成单元，由位置、协方差（形状）、颜色、透明度定义。本质是一个"有体积的彩色云团"。

- **各向异性协方差**：高斯不是球形，而是椭球形。可以拉成薄片（贴合墙面）、拉长成柱（贴合电线）。这让少量高斯就能精确描述复杂几何。

- **球谐函数（SH）**：用傅里叶变换的思路来表示方向相关的光照和颜色。SH 阶数为 3 时，能表达非常精细的颜色变化。

- **Alpha blending**：从远到近依次混合透明色。像画画时先用淡色铺底，再在上面一层层叠加更浓的颜色。

- **密度控制**：训练过程中的"自适应分辨率"机制，自动决定哪里该密、哪里该疏。

## 后续发展

3DGS 发表后，大量工作在其基础上改进：

- **Hierarchical 3DGS**：分层结构，支持超大场景
- **Mip Splatting**：添加抗锯齿，解决远处闪烁
- **Depth Regularized GS**：用深度图辅助，减少空洞
- **Taming 3DGS**：训练加速 2.7 倍

## 参考资料

- 原始论文：Kerbl et al., "3D Gaussian Splatting for Real-Time Radiance Field Rendering", SIGGRAPH 2023
- 项目页面：https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/
- 代码仓库：https://github.com/graphdeco-inria/gaussian-splatting
