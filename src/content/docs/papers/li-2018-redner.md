---
title: redner — 让光线追踪能反向传播过几何边缘
来源: Li, Aittala, Durand, Lehtinen, "Differentiable Monte Carlo Ray Tracing through Edge Sampling", SIGGRAPH Asia 2018
日期: 2026-05-31
分类: 计算机图形学
难度: 高级
---

## 是什么

redner 是 2018 年 MIT 的 Tzu-Mao Li 等人做的**可微路径追踪器**——你给它一张照片，它能反向告诉你「场景里那个椅子腿应该往左移 0.3mm，颜色再红一点」，**自动算出梯度**让你用 SGD 调形状、材质、光源。

日常类比：普通渲染器是「输入场景 → 输出图片」的单向相机。redner 是一台**会反向推**的相机：你给它一张目标图，它能算出「为了让我拍出这张图，场景里每一个三角形该怎么动」。

最关键的一行：**它是第一个能正确反向传播过几何遮挡边缘的 Monte Carlo 渲染器**（Monte Carlo = 用随机采样估积分，像用随机问卷估全校平均分）。

## 为什么重要

不理解 redner 解决的问题，下面这些事会让你困惑：

- 为什么 PyTorch 直接搭一个光线追踪器、求梯度，结果**梯度永远是 0**——明明场景在动
- 为什么 NeRF（2020）用体积渲染而不是表面渲染——它**绕开**了 redner 死磕的那个问题
- 为什么「从一张照片反推 3D 场景」（inverse rendering）在 2018 之前一直做不准
- 为什么材质识别 / 光源估计 / 形状重建在 redner 之后突然能用 SGD 端到端训了

前后还有 rasterization 近似路线：OpenDR（2014）更早；Soft Rasterizer（2019）更晚。它们梯度**不准但能跑**。redner 第一次把「**物理正确的可微**」做出来。

## 核心要点

### 一句话核心问题

**几何遮挡（visibility）会让像素颜色对场景参数产生"阶跃式"变化**——梯度处处为 0，但**在边界上是 ∞**。Monte Carlo 采样直接求这种积分的方差是无穷大，**完全没法反向传播**。

### 用日常场景理解

想象你拿手电筒照墙，墙上有个圆盘投出的影子。问：「如果圆盘往右移 1mm，影子里某个点 P 的亮度怎么变？」

- 如果 P 一直在影子里 → 亮度不变，梯度 = 0
- 如果 P 一直在影子外 → 亮度不变，梯度 = 0
- **如果 P 正好在影子边缘**——亮度从 0 跳到 1，梯度 = ∞

整张图的总梯度，**全部来自那条细如发丝的边界线**。普通 Monte Carlo 在面积上随机撒点，撒到边界的概率是 0，所以**永远抓不到梯度**。

### redner 的三个发明

1. **边缘采样（edge sampling）**：不再只在面积上撒点，而是**显式枚举三角形的轮廓边**（silhouette = 正面/背面交界，像剪影外轮廓），在边上专门采样。数学上借用 Reynolds transport theorem（流体里「区域边界移动时积分怎么变」的公式）——把面积积分的导数拆成「内部光滑部分 + 边界部分」。

2. **次级边可见性测试**：镜头直接看到的边好枚举，但**间接光照里**也有遮挡——比如墙上反射出影子。redner 用**层次结构 + 重要性采样**处理这种间接边。

3. **embree + autodiff 集成**：用 Intel embree 做光线求交，外面套上 PyTorch 反向传播，让整个 pipeline **既快又能 grad**。

## 实践案例

### 案例 1：从一张照片反推材质

输入：一张茶壶照片 + 已知茶壶 3D 网格；未知：表面漫反射颜色。

```python
# 示意伪代码（真实 API 见 pyredner：pyredner.Material / pyredner.render）
material = Material(diffuse=[0.5, 0.5, 0.5], requires_grad=True)
for step in range(200):
    rendered = render(scene, material)          # 1. 正向渲染
    loss = ((rendered - target_photo) ** 2).mean()  # 2. 和目标图比
    loss.backward()                             # 3. 反传——边缘采样在这里发力
    optimizer.step()                            # 4. 更新材质参数
```

200 步后漫反射颜色收敛。**没有边缘采样，第 3 行在遮挡边缘处梯度会废掉**。

### 案例 2：从照片反推几何形状

更难——形状变了，**遮挡也变**。逐步流程：

1. 输入单视图照片 + 初始 mesh（拓扑已知，顶点可动）
2. 每步用 redner 渲染当前 mesh
3. 算与目标图的 MSE，`loss.backward()` 时边缘采样给顶点坐标梯度
4. SGD 小步更新顶点 → 拟合出 3D 形状

这是论文 Figure 14 的实验，**初代用 SGD 反推几何**的工作之一。

### 案例 3：和 NeRF 的关系

NeRF（Mildenhall 2020）是另一条路：**避开**表面渲染，用体积渲染（每条光线沿路积分密度）。

- redner：表面渲染 + 显式处理遮挡边
- NeRF：体积渲染（连续函数），**没有遮挡边**这个问题

NeRF 拿掉了 visibility discontinuity 难题，代价是**每个场景都要从头训练一个网络**。redner 是显式几何 + 物理材质，**支持编辑**。两条路并存——表面派（redner / Mitsuba 3）做 inverse rendering，体积派（NeRF / 3DGS）做 novel view synthesis。

## 踩过的坑

1. **边缘枚举非常贵**：每个三角形要测是否 silhouette edge，百万面级场景仍然慢；后续 Mitsuba 3（2022）用更好算法。
2. **次级边采样方差大**：间接遮挡需要很多采样点，调参不当**梯度噪声大、训练不收敛**。
3. **不能处理透明/折射的 visibility**：假设硬表面遮挡；玻璃、烟雾、毛发需后续 reparameterization（2020）等工作。
4. **必须有正确的 3D mesh 起点**：只优化已知拓扑的顶点；开洞、加把手等拓扑变化超出能力。

## 适用 vs 不适用场景

**适用**：
- 已知 3D 几何 + 反推材质 / 光源 / 纹理
- 已知拓扑 + 反推顶点位置（小幅变形）
- 物理正确性要求高的逆问题（科研 / VFX）
- 想保留**可编辑显式几何**的下游应用

**不适用**：
- 拓扑未知 + 大变形 → 用 NeRF / 3D Gaussian Splatting
- 实时渲染 → redner 是离线的，单帧秒级
- 软遮挡（透明 / 烟雾）→ 用后续 differentiable volumetric 方法
- 端到端从图像生成场景（无几何先验）→ 用 diffusion + 3D 重建

## 历史小故事（可跳过）

- **2014**：OpenDR——第一个可微渲染器，rasterization + 局部线性近似，**梯度不准**
- **2018**：**redner**——第一个 Monte Carlo + 物理正确的可微渲染器
- **2019**：Soft Rasterizer——把 rasterization 软化以避开离散性，速度快但仍是近似
- **2020**：NeRF 绕开 surface visibility；Loubet 的 reparameterization 更通用地处理 discontinuity
- **2022**：Mitsuba 3——工业级可微渲染框架，吸收 redner / Loubet 思想
- **2023**：3D Gaussian Splatting——速度上量级提升

redner 是这条线的**理论奠基**：之后所有 surface-based 可微渲染都在它的边缘采样框架上扩展。

## 学到什么

1. **不连续函数的"期望梯度"不等于"梯度的期望"**——visibility / argmax / step 上，普通 autodiff 会**静默给 0**，不是报错
2. **边界积分**是通用工具——把面积积分的微分拆成「内部光滑 + 边界跳跃」，在边界上单独采样
3. **物理正确 vs 近似可微**要权衡——redner 选前者（慢但准）；Soft Rasterizer 选后者
4. **可微渲染开辟了"用 SGD 优化 3D 场景"的新范式**，是 NeRF / 3DGS 革命的前奏
5. **pipeline「能跑但 SGD 不收敛」时，先查离散决策点**——很多架构进步本质是「把硬决策软化」；复杂遮挡下近似误差会收敛到错答案，边缘采样才靠谱

## 延伸阅读

- 论文 PDF：[Differentiable Monte Carlo Ray Tracing through Edge Sampling](https://people.csail.mit.edu/tzumao/diffrt/diffrt.pdf)（17 页，前 6 页可读）
- 作者主页 + 代码：[Tzu-Mao Li / redner](https://github.com/BachiLi/redner)（PyTorch / TF 都支持）
- 综述：Tzu-Mao Li 博士论文 [Differentiable Visual Computing](https://people.csail.mit.edu/tzumao/phdthesis/)（2019）
- 后续：[Mitsuba 3 文档](https://mitsuba.readthedocs.io/)（工业级实现）

## 关联

- [[3d-gaussian-splatting]] —— 同样追求"可微 3D"，但走 volume + 高斯路线，绕开 visibility 难题
- [[pytorch]] —— redner 的 autodiff 后端
- [[jax]] —— 后来 Mitsuba 3 也支持 JAX 后端，思路一脉相承
- [[attention]] —— attention 把 argmax 软化成 softmax，是同一类"软化离散"思路的语言模型版本

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[3d-gaussian-splatting]] —— 3D Gaussian Splatting — 用一堆 3D 模糊光斑重建场景
- [[attention]] —— Attention Is All You Need
- [[jax]] —— JAX — Google 函数式数值计算
- [[pytorch]] —— PyTorch — 深度学习主流框架
