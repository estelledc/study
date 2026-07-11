---
title: Plenoxels — 不要神经网络也能渲染辐射场
来源: 'Fridovich-Keil, Yu, Tancik, Chen, Recht, Kanazawa, "Plenoxels: Radiance Fields without Neural Networks", CVPR 2022'
日期: 2026-05-31
分类: 计算机图形 / 三维重建
难度: 中级
---

## 是什么

Plenoxels（**ple**noptic vox**els**）是一种**完全不用神经网络**也能拟合 [[nerf-2020]] 同等质量辐射场的方法。日常类比：NeRF 把整个场景"背"进一个 MLP 的权重里；Plenoxels 反过来，把场景直接铺成一个三维网格，每个格子里硬塞几个数字（密度 + 一组方向相关的颜色系数）。没有神经网络，没有反向传播过 MLP，只有一堆体素和几个稀疏矩阵优化。

输入还是一沓带相机位姿的照片。输出是一个**稀疏 3D 体素网格**，每个非空格子存：
- 1 个密度 σ
- 27 个或 48 个**球谐系数**（spherical harmonics, SH），表示"从任意方向看这点的颜色"

光线打进去，沿途三线性插值取出 (σ, SH)，把 SH 套上观察方向算出 RGB，再做 NeRF 同款的体渲染积分。整套流程**没有一次矩阵乘法是非线性激活**，能直接用普通梯度下降优化体素值本身。

训练时间从 NeRF 的 12 小时压到 **11 分钟**，质量在 NeRF synthetic / LLFF / Tanks and Temples 三个标准数据集上和 NeRF 持平，部分场景反而更好。

## 为什么重要

不理解 Plenoxels，下面这些事都没法解释：

- 为什么 2022 年开始大家突然不再相信"NeRF 的清晰度来自神经网络"——它来自体表达 + 可微体渲染，MLP 是可替换的
- 为什么 [[3d-gaussian-splatting]] 敢在 2023 年完全抛掉神经网络只留几百万光斑——Plenoxels 已经先证明这条路通了
- 为什么"显式表达"（explicit representation）这个词在 2022 年之后突然变成图形学高频词——Plenoxels 是这个范式转换的一个分水岭
- 为什么 [[mueller-2022-instant-ngp]] 也走"小 MLP + 显式 hash grid"而不是大 MLP——同期独立得到了类似结论：把负担从权重移到结构

## 核心要点

Plenoxels 这条路能跑通靠 **三件事**：

1. **稀疏体素网格当容器**：把场景包成一个 256³ 或 512³ 的网格，初始化时几乎全空，只在表面附近保留体素。每个体素存 (σ, SH 系数)。空体素不占内存也不参与计算。整个场景大概 50-150 MB——比 NeRF 的 5 MB 大但比 mesh + 高分辨率纹理小。

2. **球谐系数代替 view-dependent MLP**：NeRF 用 MLP 后半段处理"颜色随观察方向变化"。Plenoxels 把这个职责交给 SH——一组在球面上正交的基函数，前 9 项（degree 2）就能表达大部分镜面反光，前 16 项（degree 3）足够表达高光金属。每个体素的红绿蓝三个通道各存 9 或 16 个 SH 系数，运行时给定方向 (θ, φ) 直接算 RGB = Σ k_l · Y_l(θ, φ)，全是线性。

3. **直接优化体素值本身**：参数就是网格里所有体素的 (σ, SH)。loss 还是渲染颜色和真实像素的 L2 差。梯度下降直接更新这些数字，没有"权重到输出"的链式法则——光线穿过几个体素，梯度就直接落在那几个体素上。配合**总变差正则**（TV regularization，鼓励相邻体素值接近）抑制噪声，配合**粗到细**（先在 256³ 拟合再细分到 512³）加速收敛。

三步加起来：用 **CUDA 写好的稀疏自定义 kernel** 训练 11 分钟。

## 实践案例

### 案例 1：球谐函数到底是什么

球谐函数 Y_l^m(θ, φ) 是定义在球面上的一组**正交基**，类比：傅立叶级数是直线上的 sin/cos 基；球谐函数是球面上的 sin/cos 基。任何"球面上的颜色函数"（你站在一点，向四周看，每个方向看到不同颜色）都能展开成 Y_l^m 的线性组合。

具体形式：

```
Y_0^0   = 0.282                     ← 常数项（漫反射颜色）
Y_1^-1  = 0.488 · y/r               ← 一阶（线性方向变化）
Y_1^0   = 0.488 · z/r
Y_1^1   = 0.488 · x/r
Y_2^-2  = 1.092 · xy/r²             ← 二阶（开始能表达光斑）
... 一共 9 项到二阶，16 项到三阶
```

每个体素存 27 个数（RGB × 9 项二阶 SH）就能表达"从这个体素出发任何方向的颜色"。给定观察方向 d = (x, y, z)，运行时只需做一次点积：

```python
def color_at(voxel, direction):
    Y = sh_basis(direction)        # 9 维向量
    return voxel.sh @ Y            # 27 系数 reshape 成 (3, 9) 再点积，得 RGB
```

完全没有非线性激活。这是 Plenoxels 比 NeRF 快两个数量级的根本原因——查询体素 + 算 SH 是几次乘加，远低于 8 层 MLP 前传。

### 案例 2："先证明 MLP 可替换"为什么是大事

Plenoxels 论文标题就是宣言：**Radiance Fields without Neural Networks**。它做的对照实验非常硬——同样 NeRF synthetic 八物体、同样体渲染公式，把 MLP 替换成"稀疏体素 + SH"；合成场景约训 **128k 步**（先 256³ 再升到 512³），单卡约 **11 分钟**，主表 PSNR 与 JAXNeRF **持平**（约 31.7 vs 31.9，论文表述为 no loss in visual quality）。

这说明此前两年大家以为"NeRF 工作是因为 MLP 学到了某种 3D 先验"是错觉。真正起作用的是：
- 可微体渲染公式（梯度能反传到每个采样点）
- 位置编码 / 网格 这种"高频友好"的容器
- 大量监督光线（一张图就 80 万条）

MLP 只是个**碰巧还行**的容器。换成稀疏网格 + SH，甚至换成 hash grid（[[mueller-2022-instant-ngp]]），换成 Gaussian splat（[[3d-gaussian-splatting]]），都能拿到同等甚至更好的结果。

### 案例 3：稀疏网格怎么省内存

直接开 512³ × (1+27) 个 float32 = 14 GB，不可接受。Plenoxels 的稀疏化策略：

1. **粗网格找占用**：先在 256³ 上训几千步，看哪些体素 σ > 阈值
2. **裁掉空体素**：σ 接近 0 的体素从内存里删掉，记录"哪些位置非空"成一个稀疏数据结构（链式哈希或 octree）
3. **细分剩下的**：把保留的 256³ 体素每个分成 8 个 512³ 体素，子体素从父体素插值初始化
4. **再训再裁**：循环上述过程

最终非空体素一般是 5-15% 总量，实际占用 50-150 MB。这一套"粗到细 + 稀疏化"是图形学经典 octree 的现代版，加在可微优化里第一次大规模落地。

### 案例 4：和 NeRF 的代码量对比

NeRF PyTorch 实现 ~600 行，但运行时主要时间在 MLP 前传，CUDA 内核都是 PyTorch 默认的。

Plenoxels 实现量大约 ~3000 行，其中**1500 行是手写 CUDA**——稀疏体素查询、三线性插值反向、SH 求值、体渲染前向反向。代价是工程量大，回报是训练 11 分钟而不是 12 小时。这种"算法很简单但 kernel 重度优化"的模式后来被 [[mueller-2022-instant-ngp]] 和 [[3d-gaussian-splatting]] 直接继承——后两者的核心论文功劳都有相当部分在 CUDA。

## 踩过的坑

1. **直接梯度下降 σ 容易 NaN**：σ 必须保证非负（否则光学衰减公式爆掉），论文用 σ = max(0, raw_σ) 但梯度在 0 处不连续。配合 TV 正则缓解，但仍偶尔出现"某体素冲到无穷"的训练崩溃，需要梯度裁剪。

2. **SH 二阶不够表达强镜面**：磁砖、抛光金属这类"镜面狭窄高光"用 9 项 SH 拟合不出来——SH 频域太低。原论文承认这点；Plenoctrees 等后续工作用 SH degree 4（25 项）或换成 SG（Spherical Gaussians）。

3. **室外大场景需要不同坐标参数化**：256³ / 512³ 的均匀网格只适合有界对象。室外要么切多个网格（Block-NeRF 思路），要么用反向参数化把无限远映射到球壳（NeRF++ / Mip-NeRF 360 同款技巧）。

4. **质量上限受网格分辨率约束**：1024³ 显存吃不消（哪怕稀疏），所以 Plenoxels 在超精细几何（薄发丝、细纹理）上反而比 NeRF 弱。后来 [[3d-gaussian-splatting]] 用"自适应位置 + 各向异性形状"的光斑跨过这个分辨率墙。

5. **没有 view-dependent MLP 的代价是表达能力天花板低**：NeRF 的 MLP 后半段理论上能拟合任意复杂的 view-dependent 函数；SH 二阶就是个固定基。强反光、菲涅尔效应、半透明折射，Plenoxels 拟不出来。SH 度数往上加就内存爆炸——这是它的硬约束。

6. **复现需要那 1500 行 CUDA**：用纯 PyTorch 重写性能会慢 50 倍，回到 NeRF 的训练时间。这导致它的"显式表达可替换"洞见传播很快，但"训练 11 分钟"的工程优势复用门槛很高。

## 适用 vs 不适用场景

**适用**：

- 中等大小的有界静态场景（单物体、单房间）
- 想验证"NeRF 衍生工作的关键改动到底是网络还是公式"——Plenoxels 是干净的对照
- 需要训练时间敏感的研究迭代——11 分钟一次试错
- 教学：想给学生展示"辐射场不必是神经网络"

**不适用**：

- 超精细几何 / 强镜面反光 → 用 [[3d-gaussian-splatting]] 或 Mip-NeRF
- 实时渲染交互应用 → 用 [[3d-gaussian-splatting]]
- 室外无界大场景 → 用 Mip-NeRF 360 / Block-NeRF
- 不想写 CUDA 的研究者 → 用 [[mueller-2022-instant-ngp]] 的 tiny-cuda-nn 或 Nerfacto

## 历史小故事（可跳过）

- **2020 年**：[[nerf-2020]] 上线，把 view synthesis 直接拉到照片级质量。但训练 12 小时 / 场景的代价让大家以为"清晰度来自 MLP"
- **2021 年下半年**：Yu 等人做出 PlenOctrees，把训练好的 NeRF 烘焙成八叉树存 SH 系数加速渲染——发现"渲染时根本不需要 MLP"。这是关键中转站
- **2021 年 12 月**：Plenoxels 论文上 arXiv，标题直接挑衅"Radiance Fields without Neural Networks"。社区震动——原来 MLP 全程都不需要
- **2022 年 1 月**：[[mueller-2022-instant-ngp]] 几乎同期上线，独立得出"小 MLP + 显式 hash grid 比纯大 MLP 好"。两篇工作互为映照——一个完全去 MLP，一个最小化 MLP，殊途同归
- **2022 年 6 月**：CVPR 2022 收录，作者团队从 UC Berkeley（Tancik 是 NeRF 共同作者，亲自参与"打破 NeRF 的神话"很有意思）
- **2023 年 8 月**：[[3d-gaussian-splatting]] 出现，把"显式表达"推到极致——连体素网格都不要了，直接几百万 anisotropic 高斯。SIGGRAPH 2023 best paper。Plenoxels 的精神被完整继承

## 学到什么

1. **把"是什么让它工作"和"包装它的容器"分开**：NeRF 的清晰度来自可微体渲染 + 高频友好的位置编码，不来自 MLP。这种"剥洋葱"的能力是研究者的核心技能
2. **显式 vs 隐式表达不是对立的**：Plenoxels 用稀疏体素（显式），NeRF 用 MLP 权重（隐式），两边能拿到同等质量。选哪种取决于你想要训练快还是查询快还是存储小
3. **球谐函数是处理"方向相关"的标配工具**：图形学里反射建模、光照预计算、PRT（precomputed radiance transfer）都用 SH 几十年了；Plenoxels 把它接进可微优化是一次跨界
4. **CUDA kernel 是新的算法**：21 世纪 20 年代图形学 / ML 论文的"创新"经常一半在算法、一半在 kernel。算法和工程已经分不开
5. **挑战常识的最佳方式是给个干净对照**：Plenoxels 没有写一篇综述说"我觉得 MLP 可有可无"，而是直接做实验——同样 loss、同样数据集、质量与 NeRF 持平但快两个数量级。这是研究最有杀伤力的证据形态
6. **三年三步跳**：2020 NeRF（MLP）→ 2022 Plenoxels（去 MLP，体素）→ 2023 3DGS（连体素都不要，高斯光斑）。每一步都是"把容器换得更显式"，质量和速度同时提升

## 延伸阅读

- 论文 PDF：[Plenoxels arXiv](https://arxiv.org/abs/2112.05131)（13 页主文 + 大量补充材料，对照实验充分）
- 项目主页：[alexyu.net/plenoxels](https://alexyu.net/plenoxels/)（带视频对比，看完直观感受 11 分钟训练的质量）
- 代码：[sxyu/svox2](https://github.com/sxyu/svox2)（PyTorch + CUDA，包含全部 1500 行 kernel）
- 前传 PlenOctrees：[arxiv.org/abs/2103.14024](https://arxiv.org/abs/2103.14024)（理解为什么从 NeRF 烘焙开始想到去掉 MLP）
- 球谐函数入门：[Robin Green — Spherical Harmonic Lighting: The Gritty Details](https://3dvar.com/Green2003Spherical.pdf)（图形学里最常被引的 SH 教程）
- [[nerf-2020]] —— Plenoxels 的直接对照对象，理解 NeRF 才能体会 Plenoxels 的"减法"
- [[3d-gaussian-splatting]] —— Plenoxels 思想的进化版，连体素都不要

## 关联

- [[nerf-2020]] —— Plenoxels 是 NeRF 的"减法版"——同样的体渲染公式、去掉 MLP，证明 MLP 不是必需
- [[3d-gaussian-splatting]] —— 3DGS 继承 Plenoxels 的"显式表达 + 可微优化"思路，把容器从体素换成各向异性高斯
- [[mueller-2022-instant-ngp]] —— 同期独立工作，从相反方向（最小化 MLP + 显式 hash grid）得到类似结论
- [[kajiya-1986-rendering-equation]] —— Plenoxels 的体渲染积分依然是 Kajiya 渲染方程在体介质下的离散形式
- [[pytorch]] —— 上层用 PyTorch 实现，但性能瓶颈靠手写 CUDA 内核打通

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[instant-ngp-2022]] —— Instant-NGP — 秒级训练 NeRF 的多分辨率哈希编码
