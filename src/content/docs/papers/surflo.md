---
title: "Surflo: Consistent 3D Surface Flow Model with Global State"
来源: https://arxiv.org/abs/2606.13644
日期: 2026-06-13
分类: 机器学习
子分类: 3D生成
provenance: pipeline-v3
---

# Surflo: 用"全球状态"做一致性的3D表面重建

## 一、从日常类比说起

想象你在玩拼图。

传统做法：每张照片都画一张"3D草图"，16张照片就画16张草图。这些草图互相重叠、对不齐，最后硬拼在一起，结果表面重复、空洞、碎片化。

Surflo的做法：把所有照片压缩成**一张藏宝图**（全球状态）。不管你看了几张照片，藏宝图只有一张。然后从这张藏宝图上，你可以按需查询：想要几千个点？可以。想要一百万个点？也可以。每次查询都是独立的，但都指向同一张藏宝图。

问题是：独立查询可能导致矛盾——点A认为表面在这，点B认为表面在那。Surflo的解决方案是在最后时刻让相邻的点"商量一下"：通过一个摄影指导信号（photometric guidance），让它们都朝着"最符合原始照片"的方向靠拢。

## 二、核心概念拆解

### 2.1 核心问题：几何是视图不变的

几何有一个本质特性——**无论你从哪个角度看，物体本身不变**。这意味着：16张照片描述的是同一个3D状态，只是从16个不同角度投影而已。原始数据量随照片数量线性增长，但几何信息总量不变。

传统方法的缺陷：

| 方法类型 | 问题 |
|---------|------|
| 逐视图方法（如VGGT） | 输出随视图数量线性增长，点云重叠对不齐 |
| 全局潜方法（如NOVA3R） | 输出分辨率固定（1万点），无法灵活调整 |

Surflo要做的，是**用一个固定大小的全局状态，支持任意分辨率的输出**。

### 2.2 三支柱架构

Surflo有三个关键组件：

**支柱一：编码器 — 从照片到固定大小的全局状态**

- 用冻结的VGGT模型提取特征（VGGT是一个强大的多视角几何理解模型）
- 给每个特征块加上3D位置编码（用傅里叶特征表示空间位置）
- 用Perceiver风格的交叉注意力，把 N×4×Np 个特征块压缩成 K=128 个 latent token
- 同时处理相机信息，得到一个额外的相机 latent
- 最终全局状态 z ∈ R^{129×512}，与输入视图数量 N 无关

**支柱二：解码器 — 基于flow matching的独立点查询**

- 每个查询点 x ∈ R^3 × S^2（3D坐标 + 法向量）被独立处理
- 从噪声分布开始，预测一个速度向量，把点"推"到表面上
- 因为每个点独立解码，输出数量从几千到一百万均可
- 训练目标是最小化 flow matching 损失：预测速度与真实速度之间的L2距离

**支柱三：推理时引导 — 让相邻点"商量"**

- 在ODE积分的最后阶段（t ≥ 0.95），注入一个渲染损失梯度
- 把预测的点集当作高斯球渲染回原始视角，计算与输入图像的差距
- 梯度更新耦合所有点的速度，让相邻点达成一致
- 可选：加入单目深度专家进一步锐化几何

## 三、代码示例

### 示例1：编码器 — 压缩多视角特征

下面这个伪代码展示了Surflo如何把N张输入视图压缩成固定大小的全局状态。

```python
import torch
import torch.nn as nn
from einops import rearrange

# 假设输入: N张视图, 每张视图有 4层VGGT特征 + 4个相机token
# VGGT是冻结的, 我们只训练压缩器

class SurfloEncoder(nn.Module):
    def __init__(self, feature_dim=512, num_latents=128,
                 num_layers=4, cam_layers=(4, 11, 17, 23)):
        super().__init__()
        self.num_latents = num_latents

        # 3D位置编码: 用傅里叶特征编码空间坐标
        self.fourier_proj = FourierFeatureProjection(
            input_dim=3, output_dim=feature_dim
        )

        # 从VGGT特征压缩到K个latent token
        # 类似Perceiver IO的交叉注意力机制
        self.latent_queries = nn.Parameter(
            torch.randn(num_latents, feature_dim) * 0.02
        )
        self.camera_latent = nn.Parameter(
            torch.randn(1, feature_dim) * 0.02
        )

        # 交叉注意力 + 自注意力层
        self.compressor = PerceiverCompressor(
            num_latents=num_latents,
            num_cross_attn_layers=4,
            num_self_attn_layers=4,
            dim=feature_dim
        )

    def forward(self, vggt_patch_tokens, vggt_pointmaps, vggt_cam_tokens):
        """
        参数:
          vggt_patch_tokens: [N, 4*Np, D] 多视图VGGT补丁token
          vggt_pointmaps:    [N, Np, 3]  补丁中心的3D坐标
          vggt_cam_tokens:   [N, 4, D]   每视图的相机token

        返回:
          global_state: [129, D] 全局状态 (128个空间token + 1个相机token)
        """
        N = vggt_patch_tokens.shape[0]

        # 步骤1: 给每个补丁token加上3D位置编码
        # 补丁中心的3D坐标 -> 傅里叶特征 -> 加到token上
        fourier_pe = self.fourier_proj(vggt_pointmaps)  # [N, Np, D]
        position_encoded_tokens = vggt_patch_tokens + fourier_pe

        # 步骤2: 交叉注意力压缩
        # 固定的K个查询token "阅读" 所有视图的所有补丁token
        spatial_latents = self.compressor(
            queries=self.latent_queries,           # [K, D]
            keys_values=position_encoded_tokens     # [N * 4*Np, D]
        )  # [K, D]

        # 步骤3: 同样方式压缩相机token
        camera_latent = self.compressor(
            queries=self.camera_latent,             # [1, D]
            keys_values=vggt_cam_tokens.reshape(-1, vggt_cam_tokens.shape[-1])
        )  # [1, D]

        # 步骤4: 拼接成全局状态
        global_state = torch.cat(
            [spatial_latents, camera_latent], dim=0
        )  # [K+1, D] = [129, 512]

        return global_state
```

**关键理解**：无论输入2张还是100张视图，输出永远是 [129, 512]。这就是"全局状态"的威力。

### 示例2：解码器 — 从全局状态生成任意数量的表面点

下面展示flow matching解码器如何把噪声点"推"到表面上。

```python
import torch
import torch.nn as nn
import math

class SurfloDecoder(nn.Module):
    def __init__(self, dim=512, num_layers=12, num_heads=8):
        super().__init__()

        # 时间嵌入: 用正弦函数编码flow的时间步t
        self.time_mlp = SinusoidalTimeEmbedding(dim)

        # AdaLN: 用时间和相机信息调制注意力层
        self.adaln = AdaptiveLayerNorm(dim)

        # 交叉注意力层: 每个点独立查询全局状态
        self.cross_attn_layers = nn.ModuleList([
            CrossAttentionBlock(dim=dim, num_heads=num_heads)
            for _ in range(num_layers)
        ])

        # 最后输出速度向量 (3D坐标 + 3D法向量 = 6维)
        self.velocity_head = nn.Linear(dim, 6)

    def forward(self, query_points, time, global_state):
        """
        参数:
          query_points: [P, 6]  P个查询点, 每个含(3D坐标, 3D法向量)
          time:           [P]   每个点对应的flow时间步 t ∈ [0, 1]
          global_state:   [129, D] 编码器输出的全局状态

        返回:
          velocity: [P, 6] 预测的速度向量, 把噪声点推向表面
        """
        P = query_points.shape[0]

        # 步骤1: 给查询点加3D傅里叶位置编码
        coords = query_points[:, :3]   # [P, 3]
        normals = query_points[:, 3:]  # [P, 3]
        encoded_query = self.fourier_proj(coords) + query_points

        # 步骤2: 时间嵌入 + AdaLN调制
        time_embed = self.time_mlp(time)  # [P, D]
        camera_latent = global_state[-1:]  # [1, D] 相机token
        conditioning = torch.cat([time_embed, camera_latent], dim=1)

        # 步骤3: 逐层交叉注意力
        x = encoded_query  # [P, D] 投影到模型维度
        for i, layer in enumerate(self.cross_attn_layers):
            # 前6层用交叉注意力查询全局状态, 后6层自注意力
            if i < 6:
                x = layer.cross_attn(x, global_state[:-1])
            else:
                x = layer.self_attn(x)

            # AdaLN: 用时间信息调制每一层
            x = self.adaln(x, conditioning)

        # 步骤4: 预测速度
        velocity = self.velocity_head(x)  # [P, 6]
        return velocity

    def integrate(self, global_state, num_points=100_000, num_steps=150):
        """
        推理: 从噪声开始, 用Euler积分沿预测速度推进到表面

        参数:
          num_points:  要生成的表面点数量 (可自由调节!)
          num_steps:   Euler积分步数

        返回:
          surface_points: [P, 6] 表面上的点 (3D坐标 + 法向量)
        """
        P = num_points

        # 步骤1: 从源分布采样噪声点
        # 3D坐标: 从VGGT点云周围的高斯混合分布采样
        # 法向量: 均匀采样单位球面上的方向
        noise_coords = sample_source_coordinates(P)  # [P, 3]
        noise_normals = sample_sphere_directions(P)  # [P, 3]
        query = torch.cat([noise_coords, noise_normals], dim=1)  # [P, 6]

        t = 0.0
        for step in range(num_steps):
            # 线性插值: x_t = (1-t)*x_0 + t*x_1
            query_t = (1 - t) * query + t * query

            # 预测速度
            velocity = self.forward(query_t, torch.full((P,), t), global_state)

            # Euler步进: x_{t+dt} = x_t + dt * velocity
            dt = 1.0 / num_steps
            query_t = query_t + dt * velocity

            t += dt

        return query_t  # [P, 6] 最终表面点
```

**关键理解**：`num_points` 可以自由设置。要快速预览？设8K。要精细渲染？设128K。全局状态不变，解码成本只跟输出点数成正比。

## 四、Surflo的独特之处

1. **视图数量无关**：输入2张或32张图，全局状态大小不变，同一模型直接用。

2. **分辨率无关**：从全局状态解码8K点到128K点，模型不变，只是多跑几遍解码器。

3. **端到端训练**：编码器（冻结VGGT）+ 压缩器 + 解码器联合训练，端到端优化。

4. **推理时引导**：不修改训练目标，而是在推理时用渲染损失梯度"矫正"相邻点，兼顾灵活性和一致性。

## 五、性能亮点

- 在8个3D重建基准上，Surflo匹配或超越了feed-forward基线
- 比基于优化的方法（如Gaussian Wrapping）快一个数量级
- 是唯一同时具备"全局潜变量"和"任意分辨率解码"能力的feed-forward方法
- 仅用16张未标定视角的照片就能重建出干净的mesh

## 六、延伸思考

Surflo的核心洞察可以用一句话概括：**如果几何是视图不变的，那中间表示就应该是全局的，而不是逐视图的。**

这个思想其实可以推广到很多领域。比如：
- 语音识别：一段话的语义是全局的，不应该逐帧独立处理
- 时间序列预测：整个序列的趋势是全局的，不应该逐时间点独立预测
- 代码理解：整个函数的意图是全局的，不应该逐行独立分析

Surflo在3D重建这个具体问题上验证了这个思想的威力，而"全局状态 + 独立查询"的架构模式，可能成为更多任务的通用范式。

## 七、关键术语表

| 术语 | 含义 |
|------|------|
| Flow Matching | 一种生成模型方法，学习将噪声分布"流动"到目标分布的速度场 |
| ODE Integration | 常微分方程积分，这里用于沿预测速度推进查询点 |
| Chamfer Distance | 衡量两组点云之间相似度的指标，越小越相似 |
| Perceiver Compressor | 一种用交叉注意力将大量token压缩为少量latent的技术 |
| Fourier Feature Encoding | 用正弦/余弦函数将坐标映射到高维空间，让网络能学习高频函数 |
| Gaussian Splatting | 一种用可微分渲染的3D表示方法，Surflo用它做渲染引导 |
| AdaLN | Adaptive Layer Normalization，用额外条件信息调制归一化层 |
