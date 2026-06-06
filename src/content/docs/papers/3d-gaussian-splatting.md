---
title: 3D Gaussian Splatting — 用一堆 3D 模糊光斑重建场景
来源: 'Kerbl, Kopanas, Leimkühler & Drettakis, "3D Gaussian Splatting for Real-Time Radiance Field Rendering", SIGGRAPH 2023'
日期: 2026-05-29
子分类: 计算机图形 / 三维重建
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

3D Gaussian Splatting（**3DGS**）是一种**用几百万个"3D 模糊光斑"拼出一个真实场景**的方法。日常类比：像在三维空间里喷一群彩色烟雾团，每个团有自己的位置、形状、颜色和浓度，叠在一起从任何角度看都像真的。

你给它**一组同一场景拍的照片**（几十到几百张），3DGS 会把每张照片对比"如果用这堆光斑拍这个角度会长什么样"，然后**用梯度下降同时调整每个光斑的位置、形状、颜色**，直到所有照片都对得上。

最后这堆光斑就是场景的"3D 拷贝"——从任意新视角去渲染，1080p 每秒 100 帧以上，看起来和原场景视频几乎一样。

## 为什么重要

不理解 3DGS，下面这些事都没法解释：

- 为什么 2024 年起 Apple Vision Pro 的"空间场景"、Polycam 和 Luma AI 的 3D capture App 突然变得又快又像真的
- 为什么 NeRF（2020 年神作）热度被超越——3DGS 训练快 10 倍、渲染快 1000 倍，质量还更好
- 为什么仿真公司开始用 3DGS"重建路口"做闭环测试——比纯仿真真实，比录视频灵活
- 为什么"光斑"这种听起来粗糙的表示，反而比一个 100M 参数的神经网络更精细

## 核心要点

3DGS 把场景搞定的过程可以拆成 **三步**：

1. **每个光斑是一张可学习的小卡片**：每个 3D Gaussian 存 59 个浮点数（位置 3 + 形状 4+3 + 颜色 SH 48 + 透明度 1）。类比：拼图里一张彩色透明胶片，记下放哪儿、转多少、什么颜色、多透明。

2. **GPU 并行投影 + 透明叠加**：渲染时不是从相机射光线（NeRF 的方式），而是反过来——**把每个光斑投影到屏幕**，按深度从前到后做透明度混合（α-blending）。屏幕分成 16×16 的小方格并行算，几百万光斑也能 100+ FPS。

3. **训练中自动加点 / 删点**：从 COLMAP 标定时副产的几十万稀疏点开始，每 100 步看哪些光斑"还没拟合好"（屏幕梯度大）→ 复制或分裂成更小的；哪些光斑"几乎透明"（α<0.005）→ 直接删掉。点数从 100k 自适应长到 1-5M 再剪回来。

三步加起来叫 **adaptive Gaussian splatting**，2023 年 SIGGRAPH **Best Paper**。

## 实践案例

### 案例 1：每个 Gaussian 长什么样

数学上一个 3D Gaussian 是这个连续函数：

```
G(x) = exp( -½ (x - μ)ᵀ Σ⁻¹ (x - μ) )
```

`μ` 是中心位置（3 个 float），`Σ` 是 3×3 协方差矩阵描述形状（球还是椭球还是扁饼）。

**逐部分解释**：

- 关键工程问题：**Σ 必须半正定**（不然不是合法的高斯），但梯度下降不会自动维持
- 解法：把 Σ 写成 `Σ = R S Sᵀ Rᵀ`，R 由 4 个 quaternion 算出（旋转），S 是 3 个 scale（尺度）
- 这样梯度怎么乱推，构造出的 Σ 永远合法——这一招让训练根本能跑

### 案例 2：渲染一帧的流程

```python
# 简化版，真实代码在 gaussian_renderer/__init__.py
for tile in screen.split_into_16x16_tiles():
    gaussians = gaussians_overlapping(tile)
    gaussians.sort_by_depth()
    color = bg_color
    for g in gaussians:
        alpha = g.opacity * gaussian_2d_value_at(g, tile.pixel)
        color = color + (1 - color.a) * alpha * g.view_dependent_color()
    tile.write(color)
```

**逐部分解释**：

- 16×16 tile 是为了 GPU 并行：每个 tile 是独立 warp，互不干涉
- 按深度排序后做"前到后"α-blending，对应物理上"近的物体先挡光"
- 颜色是 view-dependent 的（用球谐 SH 表示）——同一个光斑从不同角度看颜色可以不一样，反光面就靠这个
- 整个过程**只是几次 GPU kernel 调用**——不像 NeRF 要对每条 ray 跑 192 次 MLP。所以 1080p @ 100+ FPS

### 案例 3：训练中点数怎么自适应

```python
# 每 100 iter 跑一次（scene/gaussian_model.py 的 densify_and_prune）
for g in gaussians:
    if screen_grad(g) > 0.0002:
        if g.scale < 0.01 * scene_extent:
            clone(g)        # 小 Gaussian 复制一份
        else:
            split(g, N=2)   # 大 Gaussian 分裂成 2 个更小的
    if g.opacity < 0.005:
        remove(g)           # 看不见的删了
```

直觉：**屏幕梯度大 = 这块还没拟合好**。小光斑就在原地复制（细节加密），大光斑分裂成 2 个更小的（粗变细）。透明的直接删掉。

整个 trick 和数据集中的"加难题 / 删冗余题"思路一致——把训练监控反馈到"参数池策划"上，让点数本身变成可学的对象。

## 踩过的坑

1. **协方差直接学会崩**：直接对 6 个 Σ 分量做梯度下降会让矩阵失去半正定性，渲染出 NaN。必须用 quaternion+scale 重参数化。
2. **不重置 opacity 会陷局部最优**：Gaussian 一旦"生根"位置就难调。论文每 3000 iter 把所有 opacity 重置成 0.01，强迫不该存在的重新学回来——这是核心 trick。
3. **densify_grad_threshold = 0.0002 是绝对值跨场景通用**：不随场景大小调整。Mini-Splatting 等 2024 后作把它换成自适应，原文却没把这一条写成 limitation。
4. **viewer 闭源、CUDA 核 license 仅限学术**：写明 "non-commercial research only"。企业用 3DGS 做产品有 license 风险，2024 年 Inria 出了商业 license 但要单独谈。

## 适用 vs 不适用场景

**适用**：
- 静态场景的实时新视角合成（VR / AR / capture App / 影视 previs）
- 需要"训练完能编辑光斑"的场景（删一个物体、平移一组、换颜色）
- 单卡 RTX 3090+ 的训练 / 渲染环境
- 想学"GPU kernel + 可微分渲染"工程的范本

**不适用**：
- 动态场景（人物、车辆动）→ 用 4D-GS / Deformable-3DGS
- 需要 mesh 几何（进 Blender / Unity 做物理 / 碰撞）→ 用 SuGaR 抽 mesh
- 远离训练视角的外推（视角差很多）→ 没有 implicit prior 的硬伤
- 移动端 / Web 端实时（官方只支持 NVIDIA desktop，第三方有 SuperSplat 等）

## 历史小故事（可跳过）

- **2001 年**：Zwicker 等人提出 EWA splatting，用椭圆点投影做体渲染——方向对，但当年没 PyTorch、没 CUDA tile sort
- **2020 年**：Mildenhall 等人 NeRF 横空出世，"用 MLP 当辐射场"成为新视角合成的范式（训练 12 小时，渲染 0.1 FPS）
- **2022 年**：Müller 等人 Instant-NGP 用 hash grid 把训练加速到 5 秒，但渲染仍 ~10 FPS
- **2023 年 8 月**：Kerbl 等四位 Inria 研究者把 EWA 的 splatting 思想 + NeRF 的 α-blending 数学 + 现代 CUDA tile rasterizer 一次拼齐，3DGS 拿 SIGGRAPH Best Paper
- **2024 年起**：4D-GS / SuGaR / Mip-Splatting / DreamGaussian 一年内涌现，3DGS 成为 novel-view synthesis 事实标准

## 学到什么

- **explicit 表示在工程上往往赢**：当渲染速度 / 可编辑性 / 调试性重要时，explicit（每个原子可见可改）通常值得额外的工程复杂度
- **可微分一切**：把"光栅化"这种传统图形算法做成可微分，就能用梯度下降优化整个 pipeline——是当前"图形 ↔ 学习"融合的核心思路
- **自适应参数量是元能力**：densify-and-prune 思想可以迁移到 mixture-of-experts、dataset curation、model pruning——哪儿梯度大就在哪儿加容量
- **重参数化是工程刚需**：`Σ = R S Sᵀ Rᵀ` 这种"约束自动满足"的技巧，在任何"参数有约束"的优化里都该想到

## 延伸阅读

- 视频教程：[Two Minute Papers — 3D Gaussian Splatting](https://www.youtube.com/watch?v=HVv_IQKlafQ)（5 分钟动画讲完核心思想）
- 项目主页 + 视频 demo：[graphdeco-inria/gaussian-splatting](https://github.com/graphdeco-inria/gaussian-splatting)（star 17k+，官方训练 / 推理 / viewer 全套）
- 论文 14 页 PDF：[arXiv 2308.04079](https://arxiv.org/abs/2308.04079)（v1 = 终版，进 SIGGRAPH 没大改）
- 修缺陷的姊妹篇：Yu et al. "Mip-Splatting"（CVPR 2024 Best Paper）——把 3DGS 的 zoom 抗锯齿问题修了
- [[ddpm]] —— 同时期的视觉生成代际工作（2D 图像），帮你对比"辐射场 vs 像素"两条线

## 关联

- [[ddpm]] —— 都是 2020-23 视觉生成代际工作，但 DDPM 是 2D 图像生成，3DGS 是 3D 重建
- [[dit]] —— 同期"用 transformer 做生成"路线；3DGS 走"用图形学原语"路线，对照鲜明
- [[stable-diffusion]] —— DreamGaussian (ICLR 2024) 用 SDS loss 把 stable diffusion 嫁到 3DGS 上做 text-to-3D
- [[clip]] —— 多模态接口的语义先验，被 3DGS 后作（DreamGaussian / GaussianDreamer）反复借用
- [[flash-attention]] —— 同样是"重写底层 GPU kernel 换 10 倍速度"的工程经典，思路并行
- [[attention]] —— transformer 路线的"原子操作"；3DGS 的 Gaussian 是图形学的"原子操作"，对仗

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[catmull-clark-1978]] —— Catmull-Clark 1978 — 让任意拓扑网格收敛成光滑曲面
- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[cook-torrance-1982]] —— Cook-Torrance 1982 — 把镜面反射拆成微面元 × 几何遮挡 × Fresnel
- [[ddpm]] —— DDPM — Denoising Diffusion Probabilistic Models
- [[debevec-1998-rendering-with-natural-light]] —— Debevec 1998 — 用真实世界的光照亮 CG 物体
- [[deering-1988-triangle-processor]] —— Deering 1988 Triangle Processor — 现代 GPU 的祖先架构
- [[disney-brdf-2012]] —— Disney Principled BRDF 2012 — 11 个滑块封装 Cook-Torrance 全家桶
- [[dit]] —— DiT — Diffusion Transformer
- [[dreamfusion-2022]] —— DreamFusion — 用 2D 扩散模型当老师，把 NeRF 教成 3D
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[garland-heckbert-1997-qem]] —— QEM — 给三角网格『瘦身』时算每一刀的代价
- [[goldsmith-1987-bvh]] —— Goldsmith-Salmon 1987 — 让计算机自己给场景搭层次包围盒
- [[gortler-1996-lumigraph]] —— Lumigraph — 给 4D 光场加一层粗糙几何，让插值不再鬼影
- [[heckbert-1986-texture-survey]] —— Heckbert 1986 — 把"贴图"这件事讲清楚的第一篇综述
- [[jensen-1996-photon-mapping]] —— Jensen 光子映射 — 先撒光子再查密度的两 pass 全局光照
- [[kajiya-1986-rendering-equation]] —— Kajiya 渲染方程 — 把所有渲染算法统一成一个积分方程
- [[karis-2014-taa]] —— Karis 2014 TAA — 让游戏每帧只采一次也能 4K 不锯齿
- [[karis-2014-ue4-pbr]] —— Karis UE4 PBR — 把电影质感塞进游戏的 33 毫秒
- [[kazhdan-2006-poisson-recon]] —— Poisson Surface Reconstruction — 把点云变成水密网格的全局解法
- [[levoy-hanrahan-1996-light-field]] —— Light Field Rendering — 把场景拍成 4D 数组，新视角靠查表
- [[li-2018-redner]] —— redner — 让光线追踪能反向传播过几何边缘
- [[liu-2020-dlss]] —— DLSS 2.0 — 把 4K 实时渲染的一半工作量交给神经网络
- [[loop-1987-subdivision]] —— Loop 1987 — 三角形网格的递归光滑细分
- [[magic3d-2023]] —— Magic3D — 把 DreamFusion 的 NeRF 拆成"先粗后精"两阶段
- [[marching-cubes-1987]] —— Marching Cubes 1987 — 把体数据切成立方体查表生成三角网格
- [[meagher-1982-octree]] —— Meagher 1982 八叉树 — 把立方体一分为八，递归地装下一整个 3D 世界
- [[mode-connectivity-2018]] —— Mode Connectivity — 神经网络的两个最优解之间有低洼走廊
- [[monaghan-1992-sph]] —— SPH — 把流体拆成一群带核的粒子
- [[mueller-2007-pbd]] —— Position Based Dynamics — 跳过力，直接挪位置
- [[mueller-2022-instant-ngp]] —— Instant-NGP — 把 NeRF 训练从几小时压到 5 秒
- [[nerf-2020]] —— NeRF — 用一个 MLP 把整个场景"背"下来
- [[newcombe-2011-kinectfusion]] —— KinectFusion — 用消费级深度相机实时重建三维世界
- [[nimier-david-2019-mitsuba2]] —— Mitsuba 2 — 一份渲染代码同时编出 CPU / GPU / 可微版
- [[panda3d]] —— Panda3D — Disney/CMU 出品的开源 3D 游戏引擎
- [[park-2019-deepsdf]] —— DeepSDF — 用一个 MLP 把整类 3D 形状的距离场背下来
- [[phong-1975]] —— Phong 1975 — 把光照拆成环境+漫反射+高光三项
- [[plenoxels-2022]] —— Plenoxels — 不要神经网络也能渲染辐射场
- [[raylib]] —— raylib — 极简 C 游戏库，10 行代码跑起带窗口动画
- [[stam-1999-stable-fluids]] —— Stable Fluids — 让流体模拟时间步随便给都不爆
- [[vit]] —— ViT — Vision Transformer
- [[whitted-1980]] —— Whitted 1980 — 让光线在场景里递归跑三种次级射线
- [[williams-1983-mipmap]] —— Williams 1983 mipmap — 提前烤好金字塔，纹理过滤变 O(1)

