---
title: "NeRF — 用神经网络'装'下一个三维场景"
来源: https://arxiv.org/abs/2003.08934
日期: 2026-06-13
分类: 机器学习
子分类: cv
provenance: pipeline-v3
---

## 一、日常类比：3D 打印机 vs 全息投影

想象你手里有一个透明盒子，里面放着一个真实的房间模型。

**传统 3D 重建方法**（比如点云、网格）就像是把这个房间用 3D 打印机"打印"出来——你能看到模型的外壳，但外壳里面是空的。你只能从打印机给定的几个角度看到它。

**NeRF 的做法完全不同**：它不是打印外壳，而是训练一个"全息投影机器"——这个机器藏在一个神经网络里面。你告诉它这个房间的几张照片，它就开始学习"从房间里的任何一个点往任何一个方向看，应该看到什么颜色和多深的颜色"。

学完后，你只需要输入一个新的视角（比如你走到房间左边），神经网络就能计算出"从这个新位置看过去，每个像素应该是什么颜色"，然后生成一张全新的照片。

关键点：**NeRF 学到的是整个房间的'光线分布规律'，不是房间的'形状'。** 这是它和传统方法最根本的区别。

## 二、背景：为什么 NeRF 重要？

在 NeRF 之前，"从几张 2D 照片重建 3D 场景并生成新视角"这个任务已经研究了二十年。主流方法叫 **SfM（Structure from Motion）**：

1. 从多张照片中找到相同的特征点
2. 计算相机的位置
3. 用三角测量算出 3D 点云
4. 用表面重建生成网格

但有个致命问题：**它只能重建"看得见的表面"**。如果你拍一栋房子，它没法知道房子里面有什么——因为它根本没有尝试去"理解"空间。

NeRF 在 2020 年 ECCV 上发表（口头报告），提出了一个完全不同的思路：**不用显式的 3D 表示（点云/网格），而是用神经网络直接编码场景的几何和外观。** 结果一举拿下当时的最佳新视角合成效果。

## 三、核心概念

### 3.1 核心问题：光线如何传播？

在计算机图形学中，你看到的每张图像都可以被理解为：从你的眼睛（相机）出发，沿着每条视线（ray）穿过场景，累积沿途的颜色和透明度。

```
眼睛 → [场景中的第1个点] → [第2个点] → [第3个点] → ... → 远处
          颜色 c1              颜色 c2         颜色 c3
          透明度 α1            透明度 α2       透明度 α3
```

这条线上像素的最终颜色 = 沿途所有点的颜色和透明度的加权和。这就是 **体积渲染（Volume Rendering）** 公式：

```
C(r) = Σ Ti · σ(xi) · c(xi, d) · Δti
      i=1..N

其中:
  r  = 一条射线（从相机出发）
  xi = 射线上的采样点
  σ  = 体积密度（这个点"有多不透明"）
  c  = 颜色（从这个点朝相机方向看去是什么颜色）
  Ti = 前面所有点"没被挡住"的累积概率
```

NeRF 的核心洞察：**用神经网络来预测 σ(xi) 和 c(xi, d)，而不是手动指定。**

### 3.2 输入：5D 坐标

传统 3D 表示用 (x, y, z) 坐标来描述空间中的一个点。NeRF 更进一步——它还关心**你从哪个方向看这个点**。

这是因为同一个物理点，从不同角度看可能呈现不同颜色（比如一面有光泽的墙，侧面看和正面看颜色不同）。所以 NeRF 的输入是 **5D 坐标**：

```
(x, y, z, θ, φ)

其中:
  (x, y, z) = 空间位置
  (θ, φ)    = 观察方向（球面坐标的角度）
```

### 3.3 输出：密度 + 颜色

NeRF 的神经网络输出两个东西：

1. **体积密度 σ（sigma）**：一个标量，表示这个位置是否"有东西"。σ=0 表示完全透明（空的空间），σ 很大表示不透明（物体表面或内部）。
2. **颜色 c = (R, G, B)**：一个三维向量，表示从这个点沿特定方向看过去的颜色。

### 3.4 位置编码（Positional Encoding）—— 让神经网络"看清细节"

这是 NeRF 最巧妙的设计之一。

标准神经网络有一个问题：它对高频细节（比如细小的纹理、锐利的边缘）学习非常慢。想象你用一条非常柔软的橡皮筋去贴合一个棱角分明的物体——它只会贴着大轮廓，看不到棱角。

NeRF 的做法：**不把原始的 (x, y, z) 直接喂给神经网络，而是先做一个"傅里叶变换"**——把每个坐标值映射到更高维的空间，用一系列不同频率的正弦波来表示。

```
γ(p) = (sin(2^0 π p), cos(2^0 π p), sin(2^1 π p), cos(2^1 π p), ..., sin(2^{L-1} π p), cos(2^{L-1} π p))
```

假设 L=10（10 对正弦波），原本 3 维的坐标就被映射成了 60 维。这样神经网络就能"看到"非常精细的空间细节。

类比：就像给你的神经网络配了一副**从低倍到 1024 倍都能看的显微镜**——低倍看大轮廓，高倍看细节。

### 3.5 训练过程：只给图片，不教 3D

NeRF 的训练非常简洁：你只需要给一组已知相机姿态的照片，**不需要任何 3D 标注、不需要点云、不需要深度图**。

训练目标很简单：**让生成的新视角图像，和真实拍摄的同视角图像越接近越好。** 用 MSE（均方误差）损失。

这个过程就像教一个孩子"看几张照片后能画出从其他角度看到的场景"——你不需要告诉他"左边墙面离你两米"，只需要看他画得像不像。

### 3.6 分层采样（Hierarchical Sampling）

NeRF 不是均匀地在射线上采样点。它先粗采样一批点，看看哪些地方"可能有东西"（密度高），然后在这些地方附近再做精细采样。

类比：先快速扫描一份文档找到可能有答案的段落（粗采样），然后再仔细阅读那些段落找答案（精采样）。

## 四、网络结构

NeRF 使用一个全连接神经网络（MLP），结构如下：

```
输入: 5D 坐标 (x, y, z, θ, φ)
         ↓
   位置编码 (60维 → 66维)
         ↓
   ┌──────────────────────┐
   │  8 层全连接网络       │
   │  256 个神经元/层      │
   │  ReLU 激活           │
   │  跳过连接 (skip)     │
   └──────────────────────┘
         ↓
   ┌──────────┐  ┌──────────┐
   │  密度 σ  │  │  颜色 c  │
   │ (1 维)   │  │ (3 维)   │
   └──────────┘  └──────────┘
         │           │
         │  tanh     │
         ↓           ↓
  (不透明度)    (R, G, B)
```

注意：**密度分支在倒数第二层之后有一个 skip connection**——原始坐标直接连到输出层。这是为了保证网络能学到"空间的大致结构"，不至于被位置编码的高频细节带偏。

颜色分支则接一个 tanh 激活函数，把输出限制在 [-1, 1] 范围（再线性缩放到 [0, 1]）。

## 五、代码示例

### 示例 1：核心体积渲染函数（PyTorch）

这是 NeRF 最核心的算法——给定一条射线上的采样点和网络输出，合成一个像素的颜色。

```python
import torch

def render_ray(ray_origin, ray_direction, ray_samples, network, position_encoding):
    """
    沿一条射线做体积渲染。
    
    参数:
      ray_origin:       相机位置 [3]
      ray_direction:    射线方向 [3]
      ray_samples:      射线上的采样点距离 (t_vals) [N]
      network:          训练好的 NeRF 网络
      position_encoding: 位置编码函数 γ(p)
    
    返回:
      color: 这个像素的最终颜色 [3]
    """
    
    # Step 1: 把一维距离 t 变成三维空间点 P = origin + t * direction
    points = ray_origin.unsqueeze(1) + ray_direction.unsqueeze(1) * ray_samples.unsqueeze(2)
    # points 形状: [batch, N_samples, 3]
    
    # Step 2: 计算每个点的观察方向
    directions = ray_direction.unsqueeze(1).expand(-1, ray_samples.shape[1], -1)
    # directions 形状: [batch, N_samples, 3]
    
    # Step 3: 拼成 5D 输入并做位置编码
    inputs_5d = torch.cat([points, directions], dim=-1)  # [batch, N, 6]
    encoded = position_encoding(inputs_5d)               # [batch, N, 6 * 2 * L]
    
    # Step 4: 用神经网络预测密度和颜色
    # network 输入: [batch, N, encoded_dim]
    # 输出: sigma [batch, N, 1], color [batch, N, 3]
    sigma_raw, color = network(encoded)
    
    # Step 5: 把密度转成不透明度 α
    # δ = 相邻采样点之间的距离
    deltas = ray_samples[:, 1:] - ray_samples[:, :-1]
    delta_constant = torch.ones_like(ray_samples[:, :1]) * 1e10  # 最后一个点的 δ 设很大
    deltas = torch.cat([deltas, delta_constant], dim=-1)
    
    alpha = 1.0 - torch.exp(-deltas * torch.relu(sigma_raw).squeeze(-1))
    # alpha 形状: [batch, N_samples]
    
    # Step 6: 计算累积透射率 T
    # T[i] = (1 - alpha[0]) * (1 - alpha[1]) * ... * (1 - alpha[i-1])
    accum = torch.cumprod(1.0 - alpha, dim=1)
    T = torch.cat([torch.ones_like(accum[:, :1]), accum[:, :-1]], dim=-1)
    
    # Step 7: 体积渲染公式: C = Σ T[i] * alpha[i] * color[i]
    weights = T * alpha  # [batch, N_samples]
    color = torch.sum(weights.unsqueeze(-1) * color, dim=1)
    
    return color  # [batch, 3]
```

**逐行解读：**

- `ray_origin + t * direction`：这就是射线的参数方程。想象你站在原点，朝某个方向走，t 表示走了多远。
- `torch.cat([points, directions], dim=-1)`：把空间坐标和观察方向拼成 5D。
- `alpha = 1 - exp(-delta * sigma)`：这是从密度到不透明度的标准转换。σ 越大、走的距离 δ 越长，alpha 越接近 1（越不透明）。
- `cumprod(1 - alpha)`：计算"前面所有点都没挡住"的概率。这类似于：你连续抽 N 次卡，每次有 alpha 概率挡住，T 就是连续 N-1 次都没挡住的概率。
- 最后的求和就是公式 C(r) = Σ Ti · αi · ci。

### 示例 2：完整训练循环（PyTorch）

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

# --- 位置编码 ---
class PositionalEncoding(nn.Module):
    """NeRF 的位置编码：用正弦波把低维坐标映射到高维"""
    
    def __init__(self, N_bins=10):
        super().__init__()
        self.N_bins = N_bins
        # 频率: 2^0, 2^1, ..., 2^{N_bins-1}
        self.basis_freq = torch.FloatTensor([2 ** i for i in range(N_bins)])
    
    def forward(self, x):
        """
        参数:
          x: 输入坐标 [*, D]，D 通常是 3 (xyz) 或 6 (xyz + direction)
        返回:
          编码后的向量 [*, D * 2 * N_bins]
        """
        # 把每个坐标值乘上一系列频率
        # 例如 x[0] = 0.5 → [sin(pi*0.5), cos(pi*0.5), sin(2*pi*0.5), cos(2*pi*0.5), ...]
        x = x.unsqueeze(-1) * self.basis_freq * torch.pi  # [*, D, N_bins]
        x = torch.cat([torch.sin(x), torch.cos(x)], dim=-1)  # [*, D, 2 * N_bins]
        return x.view(x.shape[0], -1)  # [*, D * 2 * N_bins]


# --- NeRF 网络 ---
class NeRF(nn.Module):
    def __init__(self, D=8, W=256, input_ch=60, input_ch_views=30):
        """
        参数:
          D: 网络层数 (8 层)
          W: 每层神经元数 (256)
          input_ch: 位置编码后输入维度 (3坐标 * 2频率 * 10层 = 60)
          input_ch_views: 方向编码后维度 (3方向 * 2频率 * 10层 = 60...但只有15维用于颜色)
        """
        super().__init__()
        
        # 主网络：从输入到倒数第二层
        self.layers = nn.ModuleList()
        for i in range(D):
            if i == D - 2:
                # 倒数第二层：接 skip connection
                self.layers.append(nn.Linear(input_ch + W, W))
            else:
                self.layers.append(nn.Linear(input_ch if i == 0 else W, W))
        
        # 密度分支：1 维输出
        self.sigma_layer = nn.Linear(W, 1)
        
        # 颜色分支：需要方向信息
        # 输入: 中间层输出(256) + 方向编码(30) = 286
        self.color_layer = nn.Linear(W + input_ch_views, 3)
    
    def forward(self, x_5d, x_views):
        """
        参数:
          x_5d:    位置编码后的 (xyz) [batch, N, 60]
          x_views: 方向编码后的 (θ, φ) [batch, N, 30]
        返回:
          sigma: 密度 [batch, N, 1]
          color: RGB 颜色 [batch, N, 3]
        """
        h = x_5d
        
        for i, layer in enumerate(self.layers):
            h = layer(h)
            h = F.relu(h)
            
            # skip connection: 在第 4 层（D//2）处接回原始输入
            if i == self.D // 2:
                h = torch.cat([h, x_5d], dim=-1)
        
        # 密度
        sigma = self.sigma_layer(h)
        
        # 颜色：需要中间特征 h 和观察方向
        h_views = torch.cat([h, x_views], dim=-1)
        color = torch.tanh(self.color_layer(h_views))  # tanh → [-1, 1]
        
        return sigma, color


# --- 训练循环 ---
def train_nerf():
    """简化的 NeRF 训练循环"""
    
    device = torch.device('cuda')
    
    # 初始化
    encoding = PositionalEncoding(N_bins=10).to(device)
    network = NeRF(D=8, W=256).to(device)
    optimizer = torch.optim.Adam(network.parameters(), lr=5e-4)
    
    # 假设 dataloader 返回随机射线
    # batch 中每条射线: (origin, direction, near, far)
    # near/far 是射线在场景中的近/远裁剪距离
    
    for step in range(100_000):
        origin, direction, near, far = next(dataloader)
        origin = origin.to(device)
        direction = direction.to(device)
        
        # 1. 沿射线采样 N 个点
        t_vals = torch.linspace(0., 1., N_samples).to(device)
        z_samples = near * (1. - t_vals) + far * t_vals
        
        # 2. 编码并前向传播
        points_5d = encoding(torch.cat([origin[..., None, :] + direction[..., None, :] * z_samples[..., None],
                                         direction[..., None, :].expand(-1, -1, N_samples, -1)], dim=-1))
        directions_encoded = encoding(direction[..., None, :].expand(-1, N_samples, -1))
        
        sigma, color = network(points_5d, directions_encoded)
        
        # 3. 体积渲染得到像素颜色
        pixel_color = render_ray_colors(sigma, color, z_samples, deltas)
        
        # 4. 与真实像素颜色计算 MSE 损失
        gt_color = ground_truth_pixel_colors  # [batch, 3]
        loss = F.mse_loss(pixel_color, gt_color)
        
        # 5. 反向传播
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
        if step % 1000 == 0:
            print(f"Step {step}, Loss: {loss.item():.6f}")
    
    return network
```

### 示例 3：推理——生成新视角

```python
def render_image(network, camera, image_width=400, image_height=400):
    """
    给定一个相机位姿，渲染整张图像。
    
    参数:
      camera: 包含相机外参 (world_to_cam) 和内参 (K) 的对象
      image_width, image_height: 输出图像尺寸
    """
    # 1. 对图像中每个像素，计算对应的射线
    u = torch.arange(image_width).float() - image_width / 2  # 像素 x 坐标
    v = torch.arange(image_height).float() - image_height / 2  # 像素 y 坐标
    UV = torch.meshgrid(u, v, indexing='ij')  # [H, W], [H, W]
    
    # 用相机内参反投影到相机坐标系
    X_cam = (UV[0] - camera.K[0, 2]) / camera.K[0, 0]  # 归一化 x
    Y_cam = (UV[1] - camera.K[1, 2]) / camera.K[1, 1]  # 归一化 y
    Z_cam = torch.ones_like(X_cam)
    
    # 转世界坐标系
    rays_d = torch.stack([X_cam, Y_cam, Z_cam], dim=-1)  # [H, W, 3]
    rays_o = camera.position.expand_as(rays_d)  # 相机在世界空间的位置
    
    # 2. 批量渲染（分块以避免 OOM）
    all_colors = []
    for y_start in range(0, image_height, 64):
        chunk_colors = render_ray(
            rays_o[y_start:y_start+64],
            rays_d[y_start:y_start+64],
            network=network,
            position_encoding=encoding,
            near=camera.near,
            far=camera.far
        )
        all_colors.append(chunk_colors)
    
    full_image = torch.cat(all_colors, dim=0)
    # 缩放到 [0, 1]
    full_image = (full_image + 1) / 2
    
    return full_image  # [H, W, 3], 可以直接保存为 PNG
```

## 六、NeRF 的局限性与后续改进

NeRF 虽然效果出色，但也有明显缺点：

1. **训练慢**：训练一个场景需要数小时甚至几天
2. **渲染慢**：实时渲染几乎不可能
3. **不能直接编辑**：没有显式的 3D 表示，没法把场景里的物体拿走或替换

这些局限催生了大量的后续工作：

| 工作 | 年份 | 核心改进 |
|------|------|----------|
| Instant NGP | 2022 | 用可训练网格 + 哈希编码，训练从小时级降到秒级 |
| 3D Gaussian Splatting | 2023 | 用 3D 高斯球代替神经网络，可实时渲染 |
| Neuralangelo | 2023 | 引入各向异性正则化，能重建高频细节（人脸等） |
| Diet NeRF | 2021 | 减少采样点数量，加速 3 倍 |
| Zip-NeRF | 2022 | 用频率感知的自适应采样，渲染提速 10 倍 |

## 七、学习总结

NeRF 的核心思想可以用一句话概括：**用神经网络直接学习"空间中的光线分布"，而不是学习空间的"形状"。**

它解决了什么问题？
- 从稀疏的 2D 图像恢复连续的 3D 场景
- 生成照片级真实的新视角图像
- 不需要任何 3D 标注数据

它改变了什么？
- 把 3D 表示从"显式"（网格/点云）转向"隐式"（连续函数）
- 开启了"可微渲染"这一研究方向的爆发
- 直接催生了 3D Gaussian Splatting 等新一代方法

## 思考题

1. 为什么 NeRF 的输入需要 5D（xyz + 方向），而不是简单的 3D？这和物理上的什么概念有关？
2. 位置编码为什么用正弦波？不用正弦波、直接喂原始坐标会怎样？
3. 体积渲染公式中，如果所有点的 σ 都为 0（空空间），最终像素颜色会是多少？
4. NeRF 训练只需要图像和相机位姿，这是否意味着它永远不会有"错误的 3D 结构"？为什么？

## 延伸阅读

- 项目页面：https://nerf.ai/（有视频演示，强烈建议观看）
- 代码仓库：https://github.com/bmild/nerf
- 3D Gaussian Splatting 论文：https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/
- Instant NGP：https://github.com/NVlabs/instant-ngp
