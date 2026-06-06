---
title: DreamFusion — 用 2D 扩散模型当老师，把 NeRF 教成 3D
来源: 'Poole, Jain, Barron, Mildenhall, "DreamFusion: Text-to-3D using 2D Diffusion", ICLR 2023'
日期: 2026-05-31
子分类: 模型与训练
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

DreamFusion 解决了一句话能说清的难题：**给一句文本，自动生出一个可以从任意角度看的 3D 模型**。它的取巧之处在于：**没用任何 3D 训练数据**。

日常类比：你想雕一座狗的雕像，但只看过狗的照片。怎么办？你拿一团泥，每次随便从一个角度看一眼，比对脑中"狗的照片"该长什么样，捏一下，再换角度看，再捏一下。捏几个小时后，从任何角度看都像狗，那它就是狗。

DreamFusion 把"脑中的照片"换成 **预训练 2D 扩散模型**（论文里用的是 Imagen），把"泥"换成 **NeRF**（神经辐射场，一种可微的 3D 表示）。捏的方法叫 **Score Distillation Sampling (SDS)**——本论文最大的贡献。

## 为什么重要

- **绕过了 3D 数据稀缺**：网上有几十亿张图但 3D 模型寥寥几百万。DreamFusion 直接复用 2D 模型已经学到的世界知识。
- **奠定了 text-to-3D 范式**：之后两年的 Magic3D / ProlificDreamer / MVDream / Zero-1-to-3 全是 SDS 的变体或修补。
- **SDS 本身是一个通用工具**：现在不止用来做 3D，还用来做 4D、avatar、纹理生成、物理仿真初值。
- **它是一篇"先有现象、再补理论"的范文**：作者一开始观察到 SDS 能 work，但严格的概率解释（VSD、distributional view）是后续两年别人补完的。

## 核心要点

### SDS 是什么——一句话版

> **冻结 diffusion 模型，把它的去噪误差当成梯度，反传给 NeRF 参数**。

展开三步：

1. **采样视角**：随机选一个相机位置，把 NeRF 渲染成一张 2D 图 `x = g(θ, view)`，θ 是 NeRF 参数。
2. **加噪 + 让 diffusion 去噪**：给 `x` 加高斯噪声得到 `x_t`，让冻结的 diffusion 模型预测噪声 `ε̂(x_t, t, prompt)`。
3. **回传梯度**：误差 `(ε̂ − ε)` 经过链式法则一路传回 θ。

公式（不用强记，看懂就好）：

```
∇θ L_SDS = E[ w(t) · (ε̂(x_t, t, y) − ε) · ∂x/∂θ ]
```

直觉：diffusion 告诉 NeRF "这张图里这块像素该往哪挪才更像 prompt 描述的东西"，NeRF 顺着改自己的参数，让下次渲染更接近那个方向。

把这件事说得更口语：每一步 diffusion 都在回答一个问题——"如果当前这张图是真实图被加噪后的样子，那真实的它该长什么样？"差值 `(ε̂ − ε)` 就是它给出的"修正方向"。SDS 把这个修正方向当成 NeRF 应该往哪改的指南针。

### 为什么不直接用 diffusion loss

最自然的想法是：把 NeRF 渲出的图当输入，直接最小化 diffusion 的 ELBO。**不行**——diffusion loss 涉及二阶项（雅可比），算不动。SDS 是作者推出的一个**一阶近似**：把那个二阶项扔掉，只保留 score 方向。神奇的是，扔掉之后还能 work（虽然代价是后面要讲的伪影）。

### 为什么 CFG 要拉到 100

CFG（classifier-free guidance）一般用 7.5。DreamFusion 用 **100**。原因：SDS 信号很弱、很噪，不放大就推不动 NeRF。代价：图像被 push 到分布尾巴，颜色过饱和、缺细节、像油画。这是后续工作（ProlificDreamer 的 VSD）主要修的点。

## 实践案例

### 案例 1：典型的 SDS 训练循环（伪代码）

```python
nerf = NeRF()                   # 随机初始化
diffusion = load_pretrained()   # 冻结
diffusion.requires_grad_(False)

for step in range(10000):
    view = sample_random_view()
    img = nerf.render(view)            # 64x64
    t = sample_timestep()
    noise = randn_like(img)
    noisy = add_noise(img, noise, t)
    pred = diffusion(noisy, t, prompt)
    grad = (pred - noise)              # SDS 核心：直接拿这个当梯度
    img.backward(grad)                 # 不走 loss，直接 inject 梯度
    optimizer.step()
```

注意第二行——**diffusion 的参数永不更新**。被更新的只有 NeRF 的几百万参数。

### 案例 2：Janus 问题为什么会出现

输入 prompt: `"a DSLR photo of a peacock"`。生成结果：孔雀**前后都有头**，像两面神 Janus。

根因：2D diffusion 是 view-agnostic 的——你给它任意视角，它都觉得"画一只孔雀正面"是最像 prompt 的事。所以 SDS 在每个角度都把那个角度推向"孔雀正面"，结果 3D 物体每个面都长出脸。

DreamFusion 论文用了一个粗糙的修补：在 prompt 里加 "front view of" / "side view of" / "back view of"。半解决，没根除。MVDream 后来真正解决，方法是把 diffusion 本身 fine-tune 成多视角一致。

观察一个细节：Janus 的本质不是 NeRF 的错，而是 prior 本身就没"3D 一致性"这个先验。SDS 是个忠实的搬运工——你给它什么 prior，它就把那个 prior 的偏见原封不动塞进 3D 里。这也是为什么"换更好的 2D 模型"对 Janus 帮助不大，必须改 prior 本身。

### 案例 3：分辨率的选择

Imagen 的 base 是 64×64。DreamFusion 选择只在 64×64 渲染 NeRF 并算 SDS。原因：
- 在 base 分辨率，diffusion 预测最准
- 高分辨率会让 SDS 信号更稀疏、更难收敛
- super-resolution 阶段是 cascaded 的，SDS 在那里效果差

代价：最终 3D 资产分辨率很低。Magic3D 用两阶段（先低分辨率 NeRF + 再高分辨率 mesh）解决。

## 踩过的坑

1. **NeRF 初始化的随机性极敏感**：种子换一下，可能这次出狗下次出怪物。原因：SDS 是 mode-seeking，初值决定了你"卡"在哪个 mode。
2. **CFG 100 不是普适常数**：换 backbone（如 Stable Diffusion）需要重调；太低不收敛、太高更卡通。
3. **timestep 调度有讲究**：训练初期偏向高 t（粗结构），后期偏向低 t（细节）。论文用了 annealing，但很多复现实现忽略了这点。
4. **"梯度 inject"不是常规反传**：很多人第一次实现时按 `loss = (pred-noise).pow(2).mean()` 写，结果梯度多了一个雅可比项，效果反而变差。要直接 `img.backward(grad)`。
5. **batch size 假平均**：很多复现把多视角的 SDS 梯度做平均，看起来正常，但实际上让 NeRF "全局取折衷"，更容易出 Janus。论文用的是单视角逐步更新。
6. **NeRF 几何坍缩**：训练中段经常出现"半透明云团"——NeRF 把所有密度堆成一坨雾状混合色。常见 fix：加 sparsity / orientation 正则；后续工作改用 SDF 表示就少很多。

## 适用 vs 不适用场景

**适用**：
- 文本→单物体 3D 生成（玩具、家具、动物等紧凑物体）
- 没有 3D 数据但有强 2D 先验的领域（医疗影像、风格化资产）
- 当作其他系统的初值（先 SDS 跑出粗 mesh，再传统优化精修）

**不适用**：
- 复杂场景 / 多物体（mode collapse 严重）
- 需要 photorealism 或精细纹理（CFG 高 + 64² 限制）
- 需要快速生成（每个 asset 几小时 GPU 时间）→ 用 LRM / Instant3D 等前馈模型
- 需要多样性 / 一对多 → 用 ProlificDreamer 的 VSD

## 历史小故事（可跳过）

- **2020**：NeRF 横空出世，证明"用 MLP 表示 3D"可行。
- **2021**：CLIP-Mesh / Dream Fields 用 CLIP 当先验做 text-to-3D，质量很差但思路对了。
- **2022 春**：Imagen / Stable Diffusion 把 2D diffusion 推到 photorealism。
- **2022 9 月**：Poole 等人提交 DreamFusion，用 SDS + Imagen + NeRF 一举跨过质量门槛。
- **2023 年内**：Magic3D / Fantasia3D / ProlificDreamer / MVDream 接连出现，全部建立在 SDS 之上。
- **2024**：3D Gaussian Splatting 替代 NeRF 当表示，SDS 套到 3DGS 上速度又快一个量级。

## 学到什么

1. **"用预训练模型当 loss 函数"是 2020s 的范式**——SDS 是其中最干净的一个例子。原文的 score-matching 视角本质上是把 diffusion 解释成 KL divergence 的梯度。
2. **数据稀缺可以靠模态转换绕开**：3D 数据少，但 2D 数据巨多，2D→3D 的桥就值钱。
3. **理论可以滞后**：SDS 在 DreamFusion 里是"经验上 work"，严格的概率解释（看作 variational inference 的一个粗糙近似）是 ProlificDreamer 补完的。先有 hack，再有理论，是 ML 常见路径。
4. **缺陷会催生子领域**：Janus、过饱和、低分辨率每一个都成了一个细分研究方向。一篇好论文不止留下方法，还要留下未解之谜。

## 延伸阅读

- 论文 PDF：[arXiv:2209.14988](https://arxiv.org/abs/2209.14988)
- 项目页（含视频 demo）：[dreamfusion3d.github.io](https://dreamfusion3d.github.io/)
- 开源复现：[threestudio](https://github.com/threestudio-project/threestudio) — 把 DreamFusion / Magic3D / ProlificDreamer 都收进同一框架
- VSD 的概率解释：ProlificDreamer 论文 [arXiv:2305.16213](https://arxiv.org/abs/2305.16213)
- 视频精读：Yannic Kilcher [DreamFusion 解读](https://www.youtube.com/watch?v=fSYGu3H3lRA)

## 关联

- [[nerf-2020]] —— DreamFusion 用的 3D 表示，提供可微渲染
- [[imagen-2022]] —— 2D 先验来源；后续工作多换 Stable Diffusion
- [[stable-diffusion]] —— 开源 backbone，让 SDS 系列得以普及
- [[3d-gaussian-splatting]] —— 替代 NeRF 的新 3D 表示，SDS 套上去后速度大涨

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[3d-gaussian-splatting]] —— 3D Gaussian Splatting — 用一堆 3D 模糊光斑重建场景
- [[imagen-2022]] —— Imagen — 文生图真正的引擎是语言模型
- [[magic3d-2023]] —— Magic3D — 把 DreamFusion 的 NeRF 拆成"先粗后精"两阶段
- [[nerf-2020]] —— NeRF — 用一个 MLP 把整个场景"背"下来

