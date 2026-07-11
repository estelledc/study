---
title: Consistency Models — 把 50 步扩散压成 1 步出图
来源: Song, Dhariwal, Chen, Sutskever, "Consistency Models", ICML 2023
日期: 2026-06-01
分类: 机器学习
难度: 中级
---

## 是什么

Consistency Model（**CM**）是一种**把扩散模型从几十步采样压到 1-2 步**、同时尽量保住画质的训练方法。日常类比：原来扩散模型像一个**慢工细描的画师**，需要描很多笔才出一张画；CM 训练出来的是一个**速写大师**，扫一眼噪声就能先落出一版可用草图。

具体一点。扩散模型生成图像时，从纯噪声 `x_T` 出发，沿一条轨迹一步步去噪，最后到达干净图像 `x_0`。这条轨迹有 50 个甚至 1000 个点。CM 的核心洞察是：**轨迹上每一个点 `x_t` 都对应同一个终点 `x_0`，那我直接学一个函数 `f(x_t, t) = x_0` 不就好了？** 一次调用，到家。

这个能力让"实时图像生成"从理论变成产品——画一笔出一张图，鼠标拖到哪里图就跟到哪里。

## 为什么重要

不理解 CM，下面这些事都没法解释：

- 为什么 2024 年能在网页上**实时**画图（拖鼠标即出图），而 2023 年的扩散模型还在转圈
- 为什么 LCM-LoRA、SDXL Turbo 这类"加速版"模型都在追同一个目标：用一致性、蒸馏或对抗训练把多步扩散压成少数几步
- 为什么 OpenAI 在 2023 年发这篇论文很关键：它把"少步生成"从经验调参推进成清晰的训练目标
- 为什么"扩散蒸馏"成了 2023-2024 年图像生成最热的子领域

## 核心要点

先理解一个数学对象：**概率流 ODE（Probability Flow ODE）**。

扩散模型的前向加噪过程是一个 SDE（随机过程），但 Song 2021 证明它对应一个**确定性** ODE——给定终点的噪声 `x_T`，沿 ODE 倒推**唯一**得到一个 `x_0`。所以"从噪声到图像"在数学上是一条确定的曲线，只是过去要走 50 个数值积分步才能算出来。

CM 的训练目标可以拆成 **三个约束**：

1. **自一致性（self-consistency）**：同一条 ODE 轨迹上的任意两点 `x_t` 和 `x_t2`，喂给 `f` 应当输出同一个值。换句话说，`f(x_t, t) = f(x_t2, t2)`。这就是论文标题的来源。

2. **边界条件（boundary condition）**：在最小噪声层 `t = epsilon`，强制 `f(x_eps, eps) = x_eps`（直接把输入吐出来）。日常类比：定下一根锚点，剩下的曲线围着它长。这一条决定了 `f` 不会退化成"输出常量"的平凡解。

3. **训练信号**：student 网络当前权重和它的 EMA（指数滑动平均）副本互为师徒——student 预测 `x_t` 的去噪结果，老师预测相邻点 `x_t2` 的去噪结果，两者必须一致。这种 self-distillation 思路与 BYOL（自监督表示学习）同构。

CM 提供两种训练路径：

- **Consistency Distillation（CD）**：用一个**预训练**的扩散模型（如 EDM）当老师，老师跑一步 ODE 求解器给出轨迹上的点对 `(x_t, x_t2)`，student 学一致性。
- **Consistency Training（CT）**：**不需要**老师扩散模型，直接从数据加噪生成轨迹近似，student 自训。CT 让 CM 从"加速器"升级成"独立生成模型"。

## 实践案例

### 案例 1：从一张噪声直接生成图

训练完后，推理只需一行：

```python
x_T = torch.randn(B, 3, 64, 64) * sigma_max  # 纯噪声
x_0 = f(x_T, sigma_max)                       # 一步搞定
```

对比原版 EDM 扩散：

```python
x = x_T
for sigma in schedule_50_steps:               # 跑 50 次
    x = denoise(x, sigma)
```

如果原本的采样表要跑 50 次前向，CM 的 1 步版本把模型调用数降到 1 次；真实耗时还会受分辨率、网络大小和后处理影响。

### 案例 2：多步采样换更高画质

1 步质量不够时，CM 支持"加噪 + 单步预测"反复几次：

```python
x = f(x_T, sigma_max)                         # 第 1 次预测
for sigma in [sigma2, sigma3]:                # 多走 2 步
    x_noised = x + torch.randn_like(x) * sigma
    x = f(x_noised, sigma)
```

CIFAR-10 上：1 步 FID 3.55，2 步 FID 2.93——多花一次前向就能逼近 50 步扩散的质量。

### 案例 3：下游 LCM 让 Stable Diffusion 飞起来

CM 原版主要在 CIFAR-10、ImageNet 64x64 这类低分辨率基准上验证。Latent Consistency Model（LCM, 2023）把相近的一致性蒸馏思路搬到 Stable Diffusion 的 latent 空间（常见是 4x64x64），蒸馏出来的模型 **4 步**就能出 512x512 文生图，比原 SD 的 50 步少一个数量级。后续 LCM-LoRA 把这套技术做成插件，但效果仍取决于底模、LoRA 权重和提示词。

### 案例 4：训练损失的实际形态

CM 的核心损失（CD 模式）形如：

```python
# x: 真实图像；sigma_i, sigma_{i+1}: 相邻噪声层
x_i  = x + sigma_i * noise
x_i1 = teacher_ode_step(x_i, sigma_i, sigma_{i+1})  # 老师走一步 ODE
loss = LPIPS(student(x_i, sigma_i), student_ema(x_i1, sigma_{i+1}).detach())
```

注意 `detach()`：EMA 老师不接收梯度，否则 student 会和"自己骗自己"。LPIPS（感知距离）比 L2 更接近人眼判断，论文实验里替换 L2 为 LPIPS 后 FID 直接掉一半。

## 踩过的坑

1. **1 步质量不等于 50 步质量**：CM 论文最强的 1-step CIFAR-10 FID 3.55，距离 50-step EDM 的 FID 1.97 仍有差距。要"无损"加速，至少 2-4 步起。

2. **蒸馏依赖老师质量**：CD 路径下，老师 EDM 求解器精度直接决定 student 上限。老师 ODE 轨迹算错了，student 学到错的轨迹一致性。

3. **超参敏感**：噪声调度（sigma_min / sigma_max / discretization 步数 N）、EMA 衰减率、损失类型（L2 vs LPIPS）每一项都影响显著。OpenAI 给了一组配方，照抄就好，自己调容易翻车。

4. **文生图直接套 CM 不行**：原版 CM 是无条件像素生成。要做文生图必须像 LCM 那样改到 latent 空间 + 加 cross-attention 条件，工程量不小。

## 适用 vs 不适用场景

**适用**：

- 实时交互生成（画笔即出图、鼠标拖动跟随）
- 需要在端侧（手机/浏览器）跑扩散模型
- 视频/3D 生成里逐帧扩散太慢的场景
- 已有强扩散老师，想加速推理

**不适用**：

- 追求绝对最高画质（科研刷榜）—— 50 步扩散仍领先
- 老师扩散模型本身效果差 —— student 学不到东西
- 需要精确控制中间步骤（如 ControlNet 多步注入）—— 1 步采样没有"中间"

## 历史小故事（可跳过）

- **2020-2021**：Yang Song 等人用 score matching 把扩散模型重新表述为 SDE / ODE。这给了"轨迹"这个数学对象。
- **2022**：Karras 等人 EDM 论文把扩散训练简化到极致，FID 刷新；副产品是清晰的 ODE 求解器。
- **2023 年 3 月**：Song 把 EDM 当老师，提出"轨迹上每点都映射回起点"的一致性目标，CM 论文上 arXiv。
- **2023 年 10 月**：清华 LCM 把 CM 搬到 SD latent 空间，让消费级显卡 4 步出 512x512 图，社区炸锅。
- **2023 年 11 月**：StabilityAI 发布 SDXL Turbo，用 Adversarial Diffusion Distillation 追求少步出图；它和 CM 属于同一波"把扩散采样压短"的工程路线。

## 学到什么

1. **轨迹一致性是个简单又强大的约束**：不需要判别器（GAN）、不需要复杂目标，只需"同轨迹上的点要输出同结果"
2. **EMA self-distillation 训稳定**：student 当老师的 EMA 副本，避免老师漂移，工程上和 BYOL/MoCo 同构
3. **加速即蒸馏**：把多步推理蒸成单步，是 2023 年生成模型的主旋律——CM 是这一波的开山之作
4. **理论 -> 算法 -> 产品**：score-based diffusion (2020) -> EDM (2022) -> CM (2023) -> LCM/Turbo (2023 末) 一年一跳
5. **数学家的偷懒**：50 步 ODE 数值解和 1 次函数调用相比，一致性损失等价于把"每一步都正确"放松成"轨迹整体起点正确"——少了局部约束，反而能跑得更快

## 延伸阅读

- 论文 PDF：[Consistency Models, ICML 2023](https://arxiv.org/abs/2303.01469)（38 页，前 10 页足够理解核心）
- 官方代码：[openai/consistency_models](https://github.com/openai/consistency_models)（CIFAR-10 / ImageNet 64 训练脚本）
- LCM 论文：[Latent Consistency Models](https://arxiv.org/abs/2310.04378)（CM 在 latent 空间的工业化）
- 解读视频：[Yannic Kilcher — Consistency Models Explained](https://www.youtube.com/watch?v=BEXuhnnSPtY)（45 分钟逐段过论文）
- [[stable-diffusion]] —— LCM 把 CM 搬到 SD latent 空间，CM 是 SD 加速版的根
- [[score-based-generative-modeling]] —— CM 的数学起点，定义了 probability flow ODE

## 关联

- [[stable-diffusion]] —— SD 是 CM 蒸馏的主要对象（通过 LCM）
- [[gan-2014]] —— GAN 也能 1 步生成，但训练不稳；CM 提供了无判别器的替代方案
- [[byol-2020]] —— EMA self-distillation 思想 CM 与 BYOL 同源
- [[knowledge-distillation-2015]] —— CM 是 distillation 在生成模型上的特化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[diffusion-posterior-finite]] —— Diffusion Posterior Samplers Fail — 用有限样本看清扩散后验采样为什么翻车
- [[lamport-time-clocks-1978]] —— Lamport 逻辑时钟 — 分布式系统里先后顺序怎么说清楚
- [[videomla]] —— VideoMLA — 给长视频生成压缩 KV 缓存
