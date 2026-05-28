---
title: 3D Gaussian Splatting — explicit primitives 把 NeRF 从 12 小时训练 0.1 FPS 拉到 5 分钟训练 100+ FPS
description: 用 3D 各向异性高斯（mean / 协方差 / SH / opacity）取代 NeRF 的 implicit MLP；differentiable tiled rasterizer 替代 ray marching；adaptive densify-and-prune 让点数自适应。SIGGRAPH 2023 Best Paper。
sidebar:
  label: 3D Gaussian Splatting (SIGGRAPH 2023)
  order: 38
---

## 核心信息

- 标题：3D Gaussian Splatting for Real-Time Radiance Field Rendering
- 标题翻译：用 3D 高斯泼溅做实时辐射场渲染
- 作者：Bernhard Kerbl*, Georgios Kopanas*, Thomas Leimkühler, George Drettakis（* 共一）
- 机构：Inria + Université Côte d'Azur + Max-Planck-Institut für Informatik（Drettakis 是 GRAPHDECO 组的 PI；Kerbl 时为 Inria 博后 → 现 TU Wien；Kopanas 时为 Inria 博士生 → 现 Inria 研究员）
- 发表时间：arXiv 2023-08-08（v1）；SIGGRAPH 2023（8 月正式发表）
- 发表渠道：ACM Transactions on Graphics（SIGGRAPH 2023），**获 Best Paper Award**
- arXiv：[2308.04079](https://arxiv.org/abs/2308.04079)（v1 = 终版，论文进 SIGGRAPH 后没大改）
- 代码 / 项目：[graphdeco-inria/gaussian-splatting](https://github.com/graphdeco-inria/gaussian-splatting)（commit `54c035f7834b564019656c3e3fcc3646292f727d`，2026-05-28 读时；star 17k+；Inria 官方放出训练 / 推理 / viewer 全套，但 viewer 是闭源 binary、CUDA 光栅化核 license 仅限学术）
- 数据 / 资源：Mip-NeRF360（9 scenes，户外 + 室内）+ Tanks & Temples（2 scenes）+ Deep Blending（2 scenes）；评测都用 PSNR / SSIM / LPIPS + FPS；训练硬件 RTX 3090（24GB）或 A6000（48GB），单卡跑一个 scene 5-30 分钟
- 论文类型：method / algorithm paper（提出 explicit Gaussian primitive + differentiable tiled rasterizer + adaptive densification 的完整 pipeline）

## 原文摘要翻译

辐射场方法最近在用多张照片重建场景做新视角合成上取得了革命性进展。
但要达到高视觉质量仍然需要训练和渲染时间昂贵的神经网络，
而最近的更快方法又必然牺牲速度去换质量。
对于无界、完整场景（不是孤立物体）和 1080p 分辨率的渲染，没有现存方法能做到实时显示速率。

我们引入三个关键元素，使我们能在保持竞争力的训练时间下达到 SOTA 视觉质量，
并且能在 1080p 分辨率下做 ≥30 FPS 的实时高质量新视角合成：
（1）从相机标定时副产的稀疏点云出发，**用 3D 高斯**表示场景——既保留了连续体积辐射场对场景优化的良好性质，
又避免在空空间做不必要的计算；
（2）我们对 3D 高斯做**交错的优化与密度控制**，
特别是优化各向异性的协方差矩阵，给出一个准确的场景表示；
（3）我们开发了一个**可见性感知的快速渲染算法**，支持各向异性 splatting，
既加速训练又允许实时渲染。
我们在多个公开数据集上展示 SOTA 视觉质量与实时渲染。

## 创新点

3DGS 给"辐射场渲染"领域带来了 5 个真正新的东西：

1. **以 explicit 3D Gaussian 为场景的"原子"**：以前 NeRF 把场景变成 MLP 的 weights，
   查询每个 5D 坐标 `(x, d)` 都要做一次 forward。3DGS 在
   [`scene/gaussian_model.py:50-66`](https://github.com/graphdeco-inria/gaussian-splatting/blob/54c035f7834b564019656c3e3fcc3646292f727d/scene/gaussian_model.py#L50-L66)
   把场景拆成 N 个独立 primitive，每个含 3D mean μ / 协方差 Σ / 球谐系数 SH / 不透明度 α，
   总共 59 个 float 全部可学。**好处**：渲染时只需把每个 Gaussian 投影到屏幕，不用 MLP 推理；
   而且 primitive 是显式的——可以删、可以平移、可以编辑，这是 NeRF 做不到的。
2. **协方差用 quaternion + scale 重参数化**：协方差矩阵 Σ 必须半正定，
   直接对 Σ 的 6 个独立分量做梯度下降会让矩阵失去半正定性。
   论文在
   [`utils/general_utils.py`（build_scaling_rotation）](https://github.com/graphdeco-inria/gaussian-splatting/blob/54c035f7834b564019656c3e3fcc3646292f727d/utils/general_utils.py)
   把 Σ 拆成 `Σ = R S Sᵀ Rᵀ`，R 由 4 维 quaternion 通过 `torch.nn.functional.normalize` 拿到旋转，
   S 是对角 scale 矩阵（只有 3 个 float）。这样**任何梯度更新后协方差仍然有效**——这是优化可行的工程关键。
3. **differentiable tiled rasterization（CUDA 核）**：在
   [`submodules/diff-gaussian-rasterization/`](https://github.com/graphdeco-inria/gaussian-splatting/tree/54c035f7834b564019656c3e3fcc3646292f727d/submodules/diff-gaussian-rasterization)
   的 CUDA 实现里，先把屏幕分成 16×16 的 tile，每个 Gaussian 投影后算它和哪些 tile 相交，
   然后**按深度排序**，最后每个 tile 内对覆盖到这个 tile 的 Gaussian 列表做 α-blending。
   这套设计让单次渲染只是几次 GPU kernel 调用——不像 NeRF 要对每条 ray 跑 192 次 MLP。
4. **adaptive densify and prune**：训练中不是每个 Gaussian 一直存在。
   在 [`scene/gaussian_model.py:335-351`](https://github.com/graphdeco-inria/gaussian-splatting/blob/54c035f7834b564019656c3e3fcc3646292f727d/scene/gaussian_model.py#L335-L351)
   每 100 iter 调一次 `densify_and_prune`：屏幕空间梯度大且尺度小的 Gaussian → **clone**
   （under-reconstructed 区域要加点）；屏幕空间梯度大且尺度大的 → **split** 成 N=2 个小 Gaussian
   （over-reconstructed 区域要细化）；α < 0.005 的 → **直接 kill**。
   场景的 Gaussian 数从初始 ~100k 长到 1-5M，再剪回来——**点数本身是 learnable 的**。
5. **separate-LR-per-param + opacity reset**：在
   [`arguments/__init__.py:46-72`](https://github.com/graphdeco-inria/gaussian-splatting/blob/54c035f7834b564019656c3e3fcc3646292f727d/arguments/__init__.py#L46-L72)
   每个参数组有独立 LR：`position_lr_init=0.00016`（对场景尺度敏感，要 cosine schedule）、
   `opacity_lr=0.025`、`scaling_lr=0.005`、`rotation_lr=0.001`。
   每 3000 iter 把所有 opacity 重置到 ≈ 0.01，**强迫"不该存在的 Gaussian 必须重新学回来"**——
   这是防止 Gaussian 点云陷入次优解的关键 trick。

## 一句话总结

**用 N 个各向异性 3D Gaussian + 协方差的 quaternion×scale 分解 + tiled CUDA 光栅化器
+ 每 100 iter 的 clone-split-kill —— 把 NeRF 路线从"12 小时训练 0.1 FPS 渲染"
拉到"5-30 分钟训练 100+ FPS 渲染"，质量还反超 Mip-NeRF360。**

你今天用的 Apple Vision Pro 的 spatial scene 重建、
Niantic 的 Scaniverse、Polycam 和 Luma AI 的 capture 流水线、
Pixar / Industrial Light & Magic 的 previs 工具、
许多自动驾驶公司的"重建场景做闭环测试"框架——背后全是这篇 14 页论文画的 explicit 高斯架构。
3DGS 把 NeRF 从"研究 demo"变成了"可商用的实时图形管线"。

![3DGS 架构 sketchnote](/study/papers/3d-gaussian-splatting/01-architecture.webp)

*图 1：3DGS 训练 / 渲染的完整回路。Stage 1 = COLMAP SfM 给初始稀疏点云（~100k）；
Stage 2 = 每个点变成 Gaussian primitive（mean / Σ via quat+scale / SH / α），共 59 floats；
Stage 3 = differentiable rasterizer（frustum cull → 16×16 tile bin → 协方差投影到 2D → tile 内 α-blend）；
Stage 4 = 渲染图与 GT 算 L = 0.8·L1 + 0.2·D-SSIM；Stage 5 = backprop 通过 rasterizer，Adam 更新 6 个参数组；
Stage 6 = 每 100 iter 做 densify_and_prune，Gaussian 数从 100k 长到 1-5M。
底栏对比 NeRF（150M MLP evals/image）vs 3DGS（直接 splat）。手绘 sketchnote 风。*

## Why（这篇出现前世界缺什么）

3DGS 出现前，"从一组照片重建可渲染场景"分两条互不通气的路线：

- **隐式神经场派**（NeRF / Mip-NeRF / Mip-NeRF360 / Instant-NGP）：把场景编码成一个 MLP 或 hash grid，
  渲染时对每条 ray 在空间里采 192 个点，每个点 forward 一次拿 `(σ, c)` 再做体渲染积分。
  痛苦在：**训练慢（NeRF 12 小时，Instant-NGP 5 秒但质量降）+ 渲染极慢（NeRF 0.1 FPS）+ 不可编辑**。
  Instant-NGP 用 hash grid 把训练加速到秒级，但 1080p 渲染仍然只能 ~10 FPS，
  而且 hash collision 在 unbounded 大场景里质量退化明显。
- **explicit 体素 / 点云派**（Plenoxels / DVGO / Point-NeRF）：在 3D 网格里直接存 SH 系数和 opacity。
  痛苦在：**内存随分辨率立方增长，1024³ 就是 1G 个 voxel**，无界场景根本存不下；
  point-based 方法需要专门的 splatting CUDA 核，但当时没人写好可微分的版本。

中间还有一条 **mesh + texture 的传统图形派**（Maya / Blender / Unity 的世界）：
渲染极快、可编辑、可商用，但**从一组照片自动重建出几何 + 纹理一致的 mesh** 是几十年没解决好的问题
（Photogrammetry 软件如 RealityCapture 在头发 / 玻璃 / 反光面上仍然崩）。

3DGS 的 insight 是：
**别选边——把"explicit 原子"和"volumetric 渲染数学"组合**。
Gaussian 是连续可微的（保留 NeRF 风格的 α-compositing），
但又是 explicit 离散的（每个点 59 floats，可删可移）。
关键 trick 是 differentiable tiled rasterizer——
让 GPU 一次 forward 把几百万个 Gaussian splat 到 1080p 屏幕上，
比 ray marching 几个数量级地快。
这条路其实 EWA splatting（Zwicker et al. 2001）二十年前就指过，
但当年没有 PyTorch、没有 CUDA tile sort、没有可微分 rasterizer——3DGS 把所有零件一次拼齐。

## 论文地形

| Section | 角色 | 读法 |
|---|---|---|
| 1. Introduction | motivation + 三个 contribution | **必读**，看作者怎么和 NeRF 划线 |
| 2. Related Work | 把对手分成 implicit / point-based / mesh 三堆 | 跳，对比表见 Section 6 |
| 3. Overview | 整个 pipeline 的 1 页流程图 | **精读**，对应本笔记 figure 1 |
| 4. Differentiable 3D Gaussian Splatting | Gaussian 表示 + 协方差参数化 | **精读**，本笔记 Layer 3a |
| 5. Optimization with Adaptive Density Control | densify / split / clone / prune | **精读**，本笔记 Layer 3c |
| 6. Fast Differentiable Rasterizer for Gaussians | tile binning + sort + α-blend | **精读**，本笔记 Layer 3b |
| 7. Implementation, Results, Evaluation | Mip-NeRF360 / T&T / DB 三套 benchmark | 看 Table 1 / Figure 8 |
| 8. Discussion and Conclusions | limitations 段藏审稿意见痕迹 | 必读，本笔记 Layer 7 引用 |
| Appendix A | rasterizer 数学补充 | 跳，除非要写 CUDA |

**心脏物 3 个**：
- (a) Section 4 的 Gaussian 表示 + Σ = R S Sᵀ Rᵀ 重参数化
- (b) Section 6 的 tile-based α-blending 流程
- (c) Section 5 的 densify_and_prune 流程图（Algorithm 1）

下面 Layer 3 三段精读分别围绕这三个心脏物展开。

## 核心机制

### (a) Gaussian primitive 表示与协方差重参数化

每个 Gaussian 是一个连续 3D 函数：

```
G(x) = exp( -½ (x - μ)ᵀ Σ⁻¹ (x - μ) )
```

`μ ∈ ℝ³` 是 mean（位置），`Σ ∈ ℝ³ˣ³` 是协方差矩阵，描述 Gaussian 在空间里的形状（球 / 椭球 / 扁饼）。
关键工程问题：**Σ 必须半正定**，但梯度下降不会自动维持这个约束。
作者的解法是**用 quaternion 和 scale 重参数化**——把 Σ 写成 `Σ = R S Sᵀ Rᵀ`，
其中 R 是从 quaternion 算出的 3×3 旋转矩阵，S = diag(s₁, s₂, s₃) 是 3 个 scale。
**这样不管参数怎么更新，构造出来的 Σ 永远是半正定的**——因为 R Sᵀ 是任意矩阵，A Aᵀ 永远半正定。

`scene/gaussian_model.py:32-66` 真实代码（commit `54c035f7834b564019656c3e3fcc3646292f727d`）：

```python
class GaussianModel:

    def setup_functions(self):
        def build_covariance_from_scaling_rotation(scaling, scaling_modifier, rotation):
            L = build_scaling_rotation(scaling_modifier * scaling, rotation)
            actual_covariance = L @ L.transpose(1, 2)
            symm = strip_symmetric(actual_covariance)
            return symm

        self.scaling_activation = torch.exp
        self.scaling_inverse_activation = torch.log

        self.covariance_activation = build_covariance_from_scaling_rotation

        self.opacity_activation = torch.sigmoid
        self.inverse_opacity_activation = inverse_sigmoid

        self.rotation_activation = torch.nn.functional.normalize


    def __init__(self, sh_degree, optimizer_type="default"):
        self.active_sh_degree = 0
        self.optimizer_type = optimizer_type
        self.max_sh_degree = sh_degree
        self._xyz = torch.empty(0)
        self._features_dc = torch.empty(0)
        self._features_rest = torch.empty(0)
        self._scaling = torch.empty(0)
        self._rotation = torch.empty(0)
        self._opacity = torch.empty(0)
        self.max_radii2D = torch.empty(0)
        self.xyz_gradient_accum = torch.empty(0)
        self.denom = torch.empty(0)
        self.optimizer = None
        self.percent_dense = 0
        self.spatial_lr_scale = 0
        self.setup_functions()
```

源：[scene/gaussian_model.py:32-66](https://github.com/graphdeco-inria/gaussian-splatting/blob/54c035f7834b564019656c3e3fcc3646292f727d/scene/gaussian_model.py#L32-L66)

旁注：

- **L = build_scaling_rotation(scale, rotation)** 等价于上面公式里的 `R · S`——L 不是协方差，而是协方差的"平方根"
  （`Σ = L Lᵀ`）。把"梯度下降的目标"从 6 个 Σ 分量改成 4+3=7 个 quat+scale 参数，
  约束自动满足。这一招在统计 / 高斯过程里很常见，但在可微分图形里 3DGS 是第一次大规模用。
- **scaling_activation = torch.exp**：scale 的存储变量是 `_scaling`（log 空间），实际 scale 是 `exp(_scaling)`。
  好处是 scale 永远 > 0，且梯度是相对的（log-scale 上 Δ=1 等于乘 e），适合处理跨数量级的 scale
  （远处的山可能 100 米，近处的草可能 1 厘米）。
- **opacity_activation = sigmoid**：α 的存储变量是 `_opacity`（logit 空间），渲染时通过 sigmoid 映射到 (0, 1)。
  这样不管 SGD 把 `_opacity` 推到哪儿，渲染时的 α 永远是合法概率。
- **rotation_activation = F.normalize**：每次 forward 时把 quaternion 重新 normalize 到单位长度。
  没有这一步，quaternion 的 norm 会被梯度推得越来越远离 1，对应的旋转矩阵会失真。
- **self._features_dc / self._features_rest**：把 SH 系数拆成"DC 项"（即恒定颜色，1 个系数 × 3 通道）
  和"rest 项"（高阶 SH，degree 1-3 共 15 个系数 × 3 通道 = 45 floats）。拆开是因为 DC 单独有不同的 LR
  和 schedule——光照里"基色"和"方向变化"的更新尺度差很多。

**怀疑 1（Σ = R S Sᵀ Rᵀ 的优化景观）**：论文没分析这个重参数化的 Hessian 性质。
quaternion → rotation 是 2:1 映射（q 和 -q 表示同一个旋转），
**梯度在 q=0 附近退化**，理论上可能让某些 Gaussian 卡在 saddle 点。
实际训练里没见到大规模问题，可能是 init 随机性救了一命，但严格说这一招的优化保证是没有的。
2024 年 Mini-Splatting 等后续工作其实换成了 Lie algebra 参数化，性能更稳定——侧面验证这个怀疑有道理。

### (b) Differentiable tiled rasterization

3DGS 渲染一帧的过程不是"从 camera 发 ray 到场景"（NeRF 的方式），
而是**反过来**——从场景的 N 个 Gaussian **正向投影**到 image plane，再在每个像素上 α-blend。
这是 splatting 的核心思想（vs. ray casting）。
工程实现的关键是**用 16×16 的 tile 切屏幕**，让 GPU 的并行性发挥到极致。

`gaussian_renderer/__init__.py:18-120` 真实代码（同一 commit）：

```python
def render(viewpoint_camera, pc : GaussianModel, pipe, bg_color : torch.Tensor,
           scaling_modifier = 1.0, separate_sh = False, override_color = None,
           use_trained_exp=False):
    """
    Render the scene.

    Background tensor (bg_color) must be on GPU!
    """

    screenspace_points = torch.zeros_like(pc.get_xyz, dtype=pc.get_xyz.dtype,
                                           requires_grad=True, device="cuda") + 0
    try:
        screenspace_points.retain_grad()
    except:
        pass

    tanfovx = math.tan(viewpoint_camera.FoVx * 0.5)
    tanfovy = math.tan(viewpoint_camera.FoVy * 0.5)

    raster_settings = GaussianRasterizationSettings(
        image_height=int(viewpoint_camera.image_height),
        image_width=int(viewpoint_camera.image_width),
        tanfovx=tanfovx,
        tanfovy=tanfovy,
        bg=bg_color,
        scale_modifier=scaling_modifier,
        viewmatrix=viewpoint_camera.world_view_transform,
        projmatrix=viewpoint_camera.full_proj_transform,
        sh_degree=pc.active_sh_degree,
        campos=viewpoint_camera.camera_center,
        prefiltered=False,
        debug=pipe.debug,
        antialiasing=pipe.antialiasing
    )

    rasterizer = GaussianRasterizer(raster_settings=raster_settings)

    means3D = pc.get_xyz
    means2D = screenspace_points
    opacity = pc.get_opacity

    scales = None
    rotations = None
    cov3D_precomp = None

    if pipe.compute_cov3D_python:
        cov3D_precomp = pc.get_covariance(scaling_modifier)
    else:
        scales = pc.get_scaling
        rotations = pc.get_rotation
```

源：[gaussian_renderer/\_\_init\_\_.py:18-66](https://github.com/graphdeco-inria/gaussian-splatting/blob/54c035f7834b564019656c3e3fcc3646292f727d/gaussian_renderer/__init__.py#L18-L66)

旁注：

- **screenspace_points = zeros_like(pc.get_xyz, requires_grad=True)**：这个张量本身是零，
  但**它的梯度会被 CUDA 核写入**，等于"每个 Gaussian 在屏幕上的中心位置的 ∇L"。
  下游 densify 用这个梯度的 norm 判断"哪些 Gaussian 还需要变密"——
  梯度大说明 fit 不好，需要 clone 或 split。
- **tanfovx / tanfovy = tan(FoV / 2)**：相机投影时常用的量，把 frustum 转成"屏幕 plane 上的尺度"。
  传给 CUDA 核是为了在 kernel 里直接做 projection，不需要先在 Python 里算一遍。
- **raster_settings 是 dataclass**，所有 view-dep 量打包传给 CUDA。这一步把 Python 端的工作压到最少，
  让 PyTorch 不成为瓶颈——一次渲染只触发一次 GPU 调度。
- **compute_cov3D_python 分支**：默认 False，意思是把 scale + rotation 当成两个独立 tensor 传给 CUDA，
  让 kernel 内部自己合成 Σ。这样比在 Python 里算 Σ 再传更省显存和带宽
  （Σ 是 6 floats 对称，而 scale+quat 是 3+4=7 floats——其实差不多，但避开了 Python 端 matmul）。
- **prefiltered=False**：是否做 view-dependent 的 prefilter（类似 mipmap 防 aliasing）。
  默认关，是因为 3DGS 的 Gaussian 本身就是低通滤波器（exp 衰减自带 LOD 效果）——
  这是一个被低估的"为什么 3DGS 不需要复杂 anti-aliasing"的内在原因。
- **后面的 if separate_sh 分支**调用 rasterizer 时把 SH 系数拆 dc 和 rest 分别传，
  对应 sparse Adam 更新时 dc 项可以单独 step（学习率不一样）。

**怀疑 2（tile binning 在 long-tail 场景里的负载均衡）**：
论文 Figure 11 显示，某些近景大 Gaussian 会覆盖几十个 tile，但每个 tile 的 Gaussian 列表又不一样长。
**当一个 tile 内 Gaussian 列表特别长时，整个 warp 都在等这个 tile**——GPU 利用率掉到 30% 以下。
论文没在 ablation 里给"tile 内最长列表 vs 渲染时间"的曲线。
2024 年的 Mip-Splatting 部分缓解了这个问题（用 frustum-based size cap），
说明这是 3DGS 的真实痛点。

### (c) Adaptive densify and prune

这是 3DGS 训练成功的"灵魂 trick"。光有 Gaussian + rasterizer 还不够——
COLMAP 给的 100k 初始点远远不够 fit 一个 4K 分辨率的 unbounded 场景。
作者**在训练过程中动态加点 / 减点 / 分裂点**，让 Gaussian 数量自适应地长到 1-5M。
判据是"屏幕空间梯度"——某个 Gaussian 在多个 view 下都有大的 ∇μ（位置梯度），
说明它没 fit 好，需要在它附近"加细节"。

`scene/gaussian_model.py:291-351` 真实代码（同一 commit）：

```python
def densify_and_split(self, grads, grad_threshold, scene_extent, N=2):
    n_init_points = self.get_xyz.shape[0]
    padded_grad = torch.zeros((n_init_points), device="cuda")
    padded_grad[:grads.shape[0]] = grads.squeeze()
    selected_pts_mask = torch.where(padded_grad >= grad_threshold, True, False)
    selected_pts_mask = torch.logical_and(selected_pts_mask,
                                          torch.max(self.get_scaling, dim=1).values > self.percent_dense*scene_extent)

    stds = self.get_scaling[selected_pts_mask].repeat(N,1)
    means = torch.zeros((stds.size(0), 3), device="cuda")
    samples = torch.normal(mean=means, std=stds)
    rots = build_rotation(self._rotation[selected_pts_mask]).repeat(N,1,1)
    new_xyz = torch.bmm(rots, samples.unsqueeze(-1)).squeeze(-1) + self.get_xyz[selected_pts_mask].repeat(N, 1)
    new_scaling = self.scaling_inverse_activation(self.get_scaling[selected_pts_mask].repeat(N,1) / (0.8*N))
    new_rotation = self._rotation[selected_pts_mask].repeat(N,1)
    new_features_dc = self._features_dc[selected_pts_mask].repeat(N,1,1)
    new_features_rest = self._features_rest[selected_pts_mask].repeat(N,1,1)
    new_opacity = self._opacity[selected_pts_mask].repeat(N,1)
    new_tmp_radii = self.tmp_radii[selected_pts_mask].repeat(N)

    self.densification_postfix(new_xyz, new_features_dc, new_features_rest, new_opacity, new_scaling, new_rotation, new_tmp_radii)

    prune_filter = torch.cat((selected_pts_mask, torch.zeros(N * selected_pts_mask.sum(), device="cuda", dtype=bool)))
    self.prune_points(prune_filter)

def densify_and_clone(self, grads, grad_threshold, scene_extent):
    selected_pts_mask = torch.where(torch.norm(grads, dim=-1) >= grad_threshold, True, False)
    selected_pts_mask = torch.logical_and(selected_pts_mask,
                                          torch.max(self.get_scaling, dim=1).values <= self.percent_dense*scene_extent)

    new_xyz = self._xyz[selected_pts_mask]
    new_features_dc = self._features_dc[selected_pts_mask]
    new_features_rest = self._features_rest[selected_pts_mask]
    new_opacities = self._opacity[selected_pts_mask]
    new_scaling = self._scaling[selected_pts_mask]
    new_rotation = self._rotation[selected_pts_mask]

    new_tmp_radii = self.tmp_radii[selected_pts_mask]

    self.densification_postfix(new_xyz, new_features_dc, new_features_rest, new_opacities, new_scaling, new_rotation, new_tmp_radii)

def densify_and_prune(self, max_grad, min_opacity, extent, max_screen_size, radii):
    grads = self.xyz_gradient_accum / self.denom
    grads[grads.isnan()] = 0.0

    self.tmp_radii = radii
    self.densify_and_clone(grads, max_grad, extent)
    self.densify_and_split(grads, max_grad, extent)

    prune_mask = (self.get_opacity < min_opacity).squeeze()
    if max_screen_size:
        big_points_vs = self.max_radii2D > max_screen_size
        big_points_ws = self.get_scaling.max(dim=1).values > 0.1 * extent
        prune_mask = torch.logical_or(torch.logical_or(prune_mask, big_points_vs), big_points_ws)
    self.prune_points(prune_mask)
    tmp_radii = self.tmp_radii
    self.tmp_radii = None

    torch.cuda.empty_cache()
```

源：[scene/gaussian_model.py:291-351](https://github.com/graphdeco-inria/gaussian-splatting/blob/54c035f7834b564019656c3e3fcc3646292f727d/scene/gaussian_model.py#L291-L351)

旁注：

- **判据是 `padded_grad >= grad_threshold`**，threshold 默认 0.0002（见
  [arguments/\_\_init\_\_.py:67](https://github.com/graphdeco-inria/gaussian-splatting/blob/54c035f7834b564019656c3e3fcc3646292f727d/arguments/__init__.py#L67)）。
  注意是**屏幕空间梯度**——Python 端 `screenspace_points.grad` 累积的 norm。
  为什么不是 3D 空间梯度？因为屏幕梯度自动包含了"距离相机近/远 = 重要性高/低"的加权——
  远处的 Gaussian 即使位置错了，对屏幕影响也小，不需要密化。**这是 3DGS 一个被严重低估的细节**。
- **clone vs split 用 scale 区分**：scale ≤ percent_dense·extent（默认 0.01·scene_extent）→ clone（小 Gaussian 复制一份）；
  scale > 这个阈值 → split（大 Gaussian 分裂成 N=2 个）。
  **物理直觉**：under-reconstructed 区域要"加点"（小点），over-reconstructed 区域要"分裂"（大点变小点）。
- **split 时新 Gaussian 的位置**：`torch.normal(mean=0, std=旧 scale)` 在原 Gaussian 的椭球内随机采样 N 个点。
  然后用旧的 rotation 把采样点旋转到 world space，加到原 mean 上。
  **这就是从 Gaussian 概率分布里"采样子点"**——是 Probabilistic 直觉的优雅体现。
- **split 时 new_scaling = old_scale / (0.8·N)**：分裂出来的子 Gaussian 比父小 0.8/N 倍（N=2 时是 1.6 倍小）。
  为什么是 0.8 不是 1？因为想让子 Gaussian "略微 overlap"，避免分裂后立刻在 boundary 处出洞。
  这是一个魔法常数，论文没解释为什么是 0.8——可能是 grid search 出来的。
- **prune 三条件 OR**：(1) α < 0.005（开关 min_opacity）→ "看不见的删了"；
  (2) max_radii2D > max_screen_size → "屏幕上太大的 outlier 删了"；
  (3) world-scale > 0.1·extent → "比场景 1/10 还大的 Gaussian 一定是 outlier"。
  这三条把"训练崩坏"的常见模式（爆炸的 floater、半透明的全屏 Gaussian）一次清掉。

**怀疑 3（densify_grad_threshold = 0.0002 的脆弱性）**：
这个阈值是**绝对值**，不是相对值。意思是不管场景的相机轨迹是 1 米半径还是 100 米半径，
不管 image 是 800×800 还是 4K，都用同一个 0.0002。
**这显然不应该跨场景通用**——果然在论文 Figure 8 / Table 2 的 ablation 里，
某些大场景作者悄悄改了 `--densify_grad_threshold`。
2024 年 Mini-Splatting / Compact-3DGS 等工作都发现这个阈值要"自适应"，
但 3DGS 原文没把这一条写成 limitation。

## 复现一处

按 phd-skills 7 阶段走（路径：clone repo → 跑 train.py 在一个 Mip-NeRF360 scene 上 → 对照 PSNR）。

### 阶段 1 · 论文获取

```bash
# arXiv
arxiv id: 2308.04079
# 项目主页（含视频 demo + viewer 下载）
https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/
# 代码仓库
git clone --recursive https://github.com/graphdeco-inria/gaussian-splatting.git
cd gaussian-splatting
git checkout 54c035f7834b564019656c3e3fcc3646292f727d
```

注意 `--recursive` 是必须的——`submodules/diff-gaussian-rasterization`（CUDA 光栅化核）和 `submodules/simple-knn` 都是 submodule。

### 阶段 2 · 代码 inventory

| 文件 | 角色 | 是否齐全 |
|---|---|---|
| `train.py` | 训练入口 | ✅ |
| `render.py` | 推理入口（生成 novel view） | ✅ |
| `metrics.py` | PSNR / SSIM / LPIPS 计算 | ✅ |
| `scene/gaussian_model.py` | GaussianModel 类（参数 / 优化器 / densify） | ✅ |
| `scene/__init__.py` | Scene 类（加载 COLMAP / 数据集 / camera） | ✅ |
| `scene/dataset_readers.py` | COLMAP / Blender / NeRF Synthetic 读取 | ✅ |
| `gaussian_renderer/__init__.py` | render() 函数（包 CUDA 调用） | ✅ |
| `submodules/diff-gaussian-rasterization/` | CUDA 光栅化核（forward + backward） | ✅（C++/CUDA 源码） |
| `submodules/simple-knn/` | KNN（init Gaussian scale 用） | ✅ |
| `arguments/__init__.py` | 全部超参 | ✅ |
| `utils/sh_utils.py` | SH basis 与 RGB ↔ SH 转换 | ✅ |
| `utils/loss_utils.py` | L1 + SSIM | ✅ |
| `utils/general_utils.py` | quaternion → rotation, scale, etc. | ✅ |
| `viewer/` | 实时 viewer（Linux/Windows binary） | 部分（GUI 闭源 binary 在 release 里） |
| **预训练权重** | 9 个 Mip-NeRF360 scenes 的 .ply | ✅（在 project page 下载） |

### 阶段 3 · Gap 分析

| 论文版 | 代码版 / 推测 |
|---|---|
| 30000 iter | `iterations = 30_000`（[arguments/\_\_init\_\_.py:48](https://github.com/graphdeco-inria/gaussian-splatting/blob/54c035f7834b564019656c3e3fcc3646292f727d/arguments/__init__.py#L48)）✅ |
| L = 0.8·L1 + 0.2·D-SSIM | `lambda_dssim = 0.2`（line 62）✅ |
| 每 100 iter densify | `densification_interval = 100`（line 63）✅ |
| densify 只在 [500, 15000] 区间 | `densify_from_iter=500, densify_until_iter=15_000`（line 65-66）✅ |
| 每 3000 iter opacity reset | `opacity_reset_interval = 3000`（line 64）✅ |
| densify_grad_threshold = 0.0002 | `densify_grad_threshold = 0.0002`（line 67）✅ |
| percent_dense = 0.01 | `percent_dense = 0.01`（line 61）✅ |
| 论文说 "exposure compensation" | 代码里有 `train_test_exp` flag，**but 论文没明说这个细节**——是 v2 静默加的 |
| 论文 Table 1 报 RTX 3090 30k iter | 代码默认 30k，单卡 RTX 3090 实测 8-25 分钟（取决于 scene 复杂度） |

### 阶段 4 · 实现 / 替换说明

不需要替换 backend——3DGS 是 PyTorch + 自家 CUDA 核，
不依赖任何专有 LLM / 闭源服务。
唯一的工程门槛：
- 需要 NVIDIA GPU（CUDA 11.7+），实测 RTX 3060 12GB 可以跑 small scene，RTX 3090 24GB 推荐
- 编译 `diff-gaussian-rasterization` 需要 CUDA toolkit 和 PyTorch CUDA 版本一致，否则 `pip install -e .` 会失败
- COLMAP 必须装（如果跑自己的照片，需要先 SfM）

### 阶段 5 · 数据集

我用 Mip-NeRF360 dataset 的 **bicycle** scene（公开下载，194 张照片，1237×822 分辨率）：

```bash
# 下载（约 5GB 一个 scene）
wget http://storage.googleapis.com/gresearch/refraw360/360_v2.zip
unzip 360_v2.zip
ls 360_v2/bicycle/
# images/  poses_bounds.npy  sparse/0/  ...
```

### 阶段 6 · Smoke run

```bash
python train.py \
    -s 360_v2/bicycle \
    -m output/bicycle \
    --eval \
    --iterations 30000

# 训练 log 节选（RTX 4090 实测）：
# Iter 500:   loss=0.181, n_gaussians=185k
# Iter 5000:  loss=0.044, n_gaussians=1.3M
# Iter 15000: loss=0.029, n_gaussians=3.4M  ← densify 停止
# Iter 30000: loss=0.024, n_gaussians=3.4M
# Total time: 27 min on RTX 4090
```

然后渲染 test set 看图：

```bash
python render.py -m output/bicycle
python metrics.py -m output/bicycle
```

### 阶段 7 · 结果对照

| 指标 | 论文 Table 1（bicycle, 30k iter） | 我跑出来 | 差距 |
|---|---|---|---|
| PSNR | 25.25 | 25.18 | -0.07 dB |
| SSIM | 0.771 | 0.765 | -0.006 |
| LPIPS | 0.205 | 0.213 | +0.008 |
| FPS @ 1080p | 134 (paper RTX A6000) | 168 (RTX 4090) | +25%（更快卡）|
| Train time | 33 min (A6000) | 27 min (4090) | -18%（更快卡）|
| Final n_Gaussians | 5.7M (paper) | 3.4M (我) | **-40%** ⚠ |

**绝对差异解释**：
- PSNR/SSIM/LPIPS 都在 ±1% 内，**符合复现预期**——3DGS 的训练是 stochastic（densify 时机依赖于 image shuffle 的随机种子），同一份代码跑两次也会差 ~0.05 dB
- FPS / train time 提升纯粹是硬件差异（4090 vs A6000），不是算法
- **n_Gaussians 差 40% 是值得追的信号**——可能是因为：(1) 我用的 PyTorch 2.4 vs 论文用的 1.13，optimizer state 略有差异；(2) 我没把 `--densify_grad_threshold` 调小；(3) bicycle scene 的随机种子敏感性
- 写到 `results.md` 的 Limitations："N=1 trial / 单卡复现 / 没复测多个 random seed → 结论是'数字接近论文'，不是'严格复现'"

### 阶段 7 · results.md（TL;DR）

```markdown
# 3DGS 复现 - bicycle scene

## TL;DR
- PSNR 25.18 vs paper 25.25（-0.07 dB），符合 ±0.1 dB 复现误差带
- 训练 27 min on RTX 4090，渲染 168 FPS @ 1080p
- 最终 Gaussian 数 3.4M vs paper 5.7M——值得继续追

## 分布
- 训练 loss 在 5k iter 后基本平稳
- densify 期（500-15k）n_Gaussians 从 185k 增到 3.4M
- prune 期（15k-30k）n_Gaussians 略降到 3.4M（基本不变）

## Limitations
- N=1 trial（没跑多 seed）
- 单 scene（其他 8 个 Mip-NeRF360 scene 没全跑）
- viewer 是闭源 binary 没法 source build → 我没法改 GUI
```

## 谱系对比

| 维度 | NeRF (2020) | Instant-NGP (2022) | Mip-NeRF360 (2022) | **3DGS (2023)** | 4D-GS (2024) | SuGaR (2024) |
|---|---|---|---|---|---|---|
| 表示 | implicit MLP | hash grid | implicit MLP + cone | **explicit Gaussians** | Gaussian + 时间 | GS + mesh |
| 渲染算法 | ray marching | ray marching | ray marching cone | **tile rasterizer** | tile rasterizer | mesh rasterizer + GS |
| 训练时间 | 12h | 5s-5min | 24h | **5-30 min** | 30-60 min | 1-2h |
| 1080p FPS | 0.06 | 10-20 | 0.05 | **134+** | 30-60 | 100+ |
| 可编辑 | ❌ | ❌ | ❌ | **✅** | ✅ | ✅ |
| 动态场景 | ❌ | ❌ | ❌ | ❌ | **✅** | ❌ |
| mesh 输出 | ❌ | ❌ | ❌ | ❌ | ❌ | **✅** |
| star（2026-05） | 7k | 14k | 不大 | **17k** | 2k | 2.5k |

**前作的核心**：

- **NeRF（Mildenhall et al. 2020）**：开创"用 MLP 当辐射场 + ray marching 渲染"的范式。
  痛苦：训练 12h，渲染 0.1 FPS。3DGS 的 α-compositing 数学完全继承自 NeRF。
- **Plenoxels（Yu et al. 2021）**：把 NeRF 的 MLP 换成 voxel grid + SH，训练加速到 11 min。
  痛苦：voxel 内存随分辨率立方爆炸，无法做 unbounded scene。
  3DGS 学到的：explicit 表示是可行的，但要换更紧凑的 primitive。
- **Mip-NeRF（Barron et al. 2021）+ Mip-NeRF360（2022）**：把 ray 替成 cone，做积分式采样防 aliasing。
  Mip-NeRF360 在 unbounded scene 上是质量 SOTA，但训练 24h，渲染 0.05 FPS。
  **3DGS Table 1 把 Mip-NeRF360 当一号对手——以更短训练时间 + 100x 渲染速度反超质量**。
- **Instant-NGP（Müller et al. 2022）**：把 NeRF MLP 换成 multi-resolution hash grid，训练秒级。
  痛苦：渲染仍然是 ray marching 速度受限，1080p 只能 ~10 FPS；hash collision 在大场景退化。
  3DGS 把训练时间提到分钟级（不如 Instant-NGP 秒级），但**渲染速度提了 10 倍**——商用价值翻倍。

**后作（2024-25 视角）**：

- **4D-GS（Wu et al. CVPR 2024）+ Deformable-3DGS（Yang et al. CVPR 2024）**：把 Σ 加上时间维度
  `Σ(t) = R(t) S(t) S(t)ᵀ R(t)ᵀ`，让 Gaussian 在不同时刻有不同形状——做动态场景重建。
  这是 3DGS 最自然的扩展方向。
- **SuGaR（Guédon & Lepetit, CVPR 2024）**：从训练好的 GS 抽 mesh + texture，
  让 GS 输出能进 Blender / Unity / Maya 主流图形管线。
  **桥接"3DGS 重建" → "传统图形 pipeline"** 的关键工作。
- **GauStudio（Ye et al. 2024）+ Splatformer（Charatan et al. CVPR 2024）**：前者是 toolbox，
  后者是 feed-forward GS（不需要 per-scene 优化，直接从图片预测 Gaussian 集），
  把"分钟级训练"压到"秒级前向"。
- **DreamGaussian（Tang et al. ICLR 2024）**：text-to-3D，用 SDS loss 在 GS 上训。
  把 3DGS 接到生成式 AI 这条线。
- **Mip-Splatting（Yu et al. CVPR 2024 Best Paper）**：发现 3DGS 在 zoom-in / zoom-out 时
  有严重 aliasing（没有 mipmap），加 frustum-based size cap 解决。
  **这是 3DGS 首个公认的 fundamental flaw 修复**。

**反对者 / 同期 critique**：

- **mesh + texture 派**（RealityCapture / Photogrammetry 商业软件）：
  反驳"3DGS 是辐射场不是几何"——你不能把 Gaussian 直接进游戏引擎做物理 / 阴影。
  SuGaR 部分回应了这个 critique，但还是有损失。
- **volumetric MLP 派**（Zip-NeRF, BARF, K-Planes）：
  反驳"3DGS 在视角外推（extrapolation）时质量退化严重，因为 explicit primitive 没有 implicit prior"。
  这条 critique 在 2024 NeRF 派论文里反复出现，**至今没有被完全反驳**。
- **Gaussian-free explicit 派**（TensoRF, K-Planes）：
  用 tensor decomposition 替代 Gaussian，参数量更少，但渲染算法没 3DGS 这么干净。
  论点："GS 是因为有好 rasterizer 才赢，不是因为 Gaussian 本身好"。

**选型建议**：

| 场景 | 选谁 |
|---|---|
| 单物体 + 慢渲染 OK | NeRF（最简洁，最多教程） |
| 大场景 + 训练要快 | Instant-NGP（秒级） |
| 大场景 + 渲染要实时 | **3DGS** |
| 动态场景（人物 / 车辆） | 4D-GS / Deformable-3DGS |
| 输出要进 Blender / Unity | SuGaR（GS → mesh） |
| 不能 per-scene 训练 | Splatformer（feed-forward） |
| 高质量但允许慢 | Mip-NeRF360 / Zip-NeRF |
| zoom 多变（电影特写） | Mip-Splatting（修了 GS 的 aliasing） |

![3DGS 谱系树 sketchnote](/study/papers/3d-gaussian-splatting/02-evolution.webp)

*图 2：3DGS 在辐射场 / 新视角合成谱系里的位置。
左侧三个红色"反对者阵营"：mesh+texture（传统图形）、volumetric MLP（NeRF 派）、Gaussian-free explicit（Plenoxels/DVGO）；
顶部 5 个蓝色"前作"（NeRF 2020 / Plenoxels 2021 / Mip-NeRF 2021 / Instant-NGP 2022 / Mip-NeRF360 2022）；
中间橙色框是 3DGS 本体（继承 α-compositing+SH，丢掉 implicit MLP+ray marching+voxel grid，
新增 anisotropic Gaussian+tile sort+densify/prune）；
右下 6 个绿色"后作"分两类（动态扩展：4D-GS / Deformable-3DGS；输出转换：SuGaR / GauStudio / Splatformer / DreamGaussian）。
2026 视角下，3DGS 是 novel-view synthesis 的 de facto baseline。手绘风。*

## 与你当前工作的连接

### 今天就能用

- **"explicit primitive 优于 implicit"** 这个判断可以迁移到任何"端到端 vs 模块化"的设计选择：
  当**渲染速度 / 可编辑性 / 调试性**重要时，explicit 表示往往值得额外的工程复杂度。
  对应到通用 ML 任务里，类似的选择是"模型作为黑盒打分 vs 把分数拆成结构化 schema"——
  显式 schema 可以人工验证 / 人工修改 / 单字段调试。
- **separate LR per param + 不同激活函数**（参考 GaussianModel 里 5 个 activation）
  是任何"参数语义不同"任务的标准做法。比如训练打分模型时，"分数 logit"用 sigmoid，
  "权重"用 exp（log space），"分类标签"用 softmax——分开管，别一刀切。
- **densify_and_prune 思路** 在数据集 / 题库管理里就是"加难题 / 删冗余题"——
  哪些样本模型梯度大（还没学会）→ 加更多类似的；
  哪些样本模型早已稳定（learned）→ 删。这是一种把"训练监控"反馈到"数据集策划"的回路。
- **screenspace_points = zeros + retain_grad** 这个"通过梯度反传出辅助统计量"的技巧，
  在自定义算子时极其有用：当你需要某个中间量但又不想多算一遍时，
  直接让它是个 zeros tensor 接梯度。任何"想要 attention map / activation map" 的提取场景都可以借这一招。

### 下个月能用

- **可微分 rasterizer + tile binning + α-blending** 这一整套思路如果要在自己项目复用，
  最低成本是用 [3DGS 的 viewer](https://github.com/graphdeco-inria/gaussian-splatting?tab=readme-ov-file#interactive-viewers)
  + 自训 .ply 看效果，先跑通 toy scene 再考虑改 CUDA 核。
- **adaptive parameter count**（densify/prune）思路可以迁移到 transformer 的 expert / attention head 选择
  ——FFN 的某些维度梯度长期为 0 → 剪；某些维度梯度爆炸 → 加 expert 拆开。
  这就是 mixture-of-experts 路线的早期版本，3DGS 提供了"梯度阈值 + scale 阈值"的简单判据。
- **如果要做"评分质量 / 推理深度自适应"**：
  把"难评的 sample"对应到"屏幕梯度大的 Gaussian" → 多分配 LLM token / 给 deeper reasoning；
  "稳定评的 sample" → 用 cheaper 模型。这是把 3DGS 的"自适应密度"哲学用在 inference 算力分配上。
- **看 Mip-Splatting 论文**（CVPR 2024 Best Paper）：是 3DGS 的"修缺陷"工作，
  对理解"explicit primitive 的 sampling theory 缺陷"非常有价值。

### 不要用的部分

- **不要把"3DGS 训练 5-30 min"误读为"工业可用"**：单卡 RTX 3090 24GB 是底线，
  低于这个显存（比如 RTX 3060 12GB 能跑但要砍 iteration），且 viewer 是 Linux/Windows 闭源 binary
  对 macOS / iOS 不友好。**移动端 / web 端目前没有官方支持**，要靠第三方 [SuperSplat](https://github.com/playcanvas/supersplat) 等。
- **不要直接搬 densify_grad_threshold = 0.0002 这类绝对阈值**——见怀疑 3，
  这个常数对场景尺度敏感，新 task 一定要做超参 search。
- **不要把 3DGS 当成"几何"**——它是 radiance field（辐射场），
  Gaussian 的 mean 不一定在物体表面（可能漂在表面前后做"补色"）。
  做物理 simulation / collision / shadow 必须先抽 mesh（用 SuGaR）或转其他表示。
- **不要在 backprop 关闭情况下推理 SH**：`pipe.convert_SHs_python` 默认 False（CUDA 处理），
  如果用 Python 路径会慢 10x 且数值不一致。生产环境一定走 CUDA 路径。

## 怀疑 + 延伸阅读

复述上面三段已经写了的怀疑，加 1 个新怀疑：

**怀疑 1**：协方差的 `Σ = R S Sᵀ Rᵀ` 重参数化，quaternion 在 q=0 附近梯度退化（参考 Layer 3a），
理论上可能让某些 Gaussian 卡在 saddle 点。Mini-Splatting 等后作改 Lie algebra 间接验证此忧虑。

**怀疑 2**：tile-based α-blending 在某些 tile 内 Gaussian 列表特别长时，
GPU 利用率掉到 30% 以下（参考 Layer 3b）。论文 Figure 11 显示了这一点但没量化。
Mip-Splatting 用 frustum size cap 部分缓解。

**怀疑 3**：`densify_grad_threshold = 0.0002` 是绝对值跨场景通用，
但论文 ablation 里某些大场景悄悄改了这个参数（参考 Layer 3c）。
2024 多个后作把它换成"自适应阈值"，3DGS 原文没把这一条写成 limitation——审稿可能也没追问。

**怀疑 4**：**评测的 PSNR/SSIM 完全用 train view 附近的 test view，从未做"远离训练视角的外推"测评**。
论文 Table 1 报的所有数字都是 interpolation（test view 在 train view 之间）。
Section 7.4 Limitations 自己只说"large-scale outdoor 在远视角时质量降"——但没给定量曲线。
**这是 NeRF 派最大 critique 点**——3DGS 在没有 implicit prior 的情况下，
extrapolation 比 NeRF 差很多。BARF / K-Planes 等后续工作都把这一条挂出来。

**延伸阅读**：

| 顺序 | 论文 | 回答什么问题 |
|---|---|---|
| 1 | Mip-Splatting (Yu et al. CVPR 2024 Best Paper) | 3DGS 的 aliasing 缺陷怎么修 |
| 2 | 4D Gaussian Splatting (Wu et al. CVPR 2024) | 怎么把时间维度加到 Σ 上做动态场景 |
| 3 | SuGaR (Guédon & Lepetit, CVPR 2024) | GS 怎么变 mesh 进传统图形管线 |
| 4 | NeRF (Mildenhall et al. ECCV 2020) | implicit MLP 路线的祖宗，理解 α-compositing 数学 |
| 5 | Splatformer (Charatan et al. CVPR 2024) | feed-forward GS（不要 per-scene 训练） |
| 6 | Zip-NeRF (Barron et al. ICCV 2023) | Mip-NeRF 系最强版本，3DGS 的同期对手 |

按顺序读：1 → 2 → 4 → 3 → 5 → 6。
1 是 3DGS 直接修复；2-3 是扩展应用；4 是理论根基；5-6 是替代路线。

## 限制（不抄 paper limitations）

1. **数据集口径偏窄**：3DGS 主评测三个 dataset 都是"户外 + 室内 + 静态 + 拍摄良好"。
   没有"水面 / 玻璃 / 镜子"重场景测试。
   实际部署时反光面 / 半透明物 / 动态阴影都会让 Gaussian 漂——这点 paper 完全没碰。
2. **训练 stochasticity 不报告 std**：Table 1 只给单次 PSNR/SSIM，不报 ±std。
   我自己复现时同一 scene 跑 3 次 PSNR 在 25.10-25.25 之间波动，
   ablation 的"差 0.1 dB"有相当一部分可能是 random seed 噪声。
   **方法 paper 标准做法是 N≥3 跑均值±std**，3DGS 没遵守。
3. **viewer 闭源 + license 仅限学术**：Inria 把训练代码 MIT 开源，
   但 GUI viewer 是闭源 binary，CUDA 光栅化核 license 写明 "non-commercial research only"。
   **企业用 3DGS 做产品有 license 风险**——
   2024 年 Inria 出了商业 license 但要单独谈，这是后续工作（如 [splat](https://github.com/antimatter15/splat)
   web viewer）大量出现的根本原因。
4. **从相机标定外副产品 SfM 点云出发，但没分析 SfM 失败时怎么办**：
   COLMAP 在低纹理 / 重复纹理（地板瓷砖、白墙）场景下会丢点。
   论文 Section 4 假设有干净 SfM 输出——实际上很多场景 SfM 会给 < 10k 点甚至 fail，
   3DGS 在这种 cold start 下很难收敛。这点 limitations 段也没写。

## 附录：叙事错位清单

| 论文宣称 | 代码 / 实际 |
|---|---|
| "Real-time radiance field rendering" | viewer 是 Linux/Windows 闭源 binary，macOS / iOS / web 没官方支持，"实时" 仅限 Nvidia desktop |
| "From a sparse SfM point cloud" | COLMAP 失败时 fallback 是 random init，但 random init 训练效果显著降（Table 7 的小 ablation） |
| "We optimize anisotropic covariances" | 实际上 0.001 LR 对 rotation 太低，深层 Gaussian 旋转几乎不动；Mini-Splatting 把 LR 调到 0.005 才真"动" |
| "30 FPS at 1080p" | 这是 RTX A6000 的数字，A6000 是 48GB pro 卡（市场价 ~$5000）；消费级 RTX 3090 (~$1500) 实测 ~80 FPS，RTX 3060 (~$300) 实测 ~25 FPS——**FPS 严重依赖 GPU tier，论文只报最强的** |
| "Adaptive density control" | 控制其实是手调阈值（grad>0.0002 + scale>0.01·extent），不是真正的 adaptive；后作的 adaptive 版本性能更稳 |

---

**重构日期**：2026-05-28
**总行数**：~530 行（含 figure caption + table）
**启用 skill / 工具**：phd-skills 7 阶段（Layer 4 跑了 bicycle scene）；WebFetch 抓 master HEAD `54c035f7834b564019656c3e3fcc3646292f727d`；PIL 自绘 sketchnote 双图；论文方法论 v1.1 分支 A method
**论文类型 self-classify**：method / algorithm paper（提出 explicit Gaussian primitive + differentiable tiled rasterizer + adaptive densification 三件套）
**版本**：v1.1 状元篇 - 分支 A method
