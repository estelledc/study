---
title: Classifier-Free Guidance — 让扩散模型自己听懂条件
来源: Ho & Salimans, "Classifier-Free Diffusion Guidance", arXiv 2207.12598 (NeurIPS 2021 DGMs Workshop)
日期: 2026-06-01
分类: 机器学习
难度: 中级
---

## 是什么

Classifier-Free Guidance（**CFG**）是扩散模型里一个**控制"条件强度"的旋钮**。日常类比：你跟朋友点咖啡说"要美式"，他可以泡得清淡一点（弱条件），也可以泡得超浓——把"美式风味"放大三倍（强条件）。CFG 就是给扩散模型加了一个"放大镜"，让你拨一个数字（叫 guidance scale `w`）就能决定生成结果**多听话**。

它的特别之处在于**不需要单独训练一个分类器**。前作 classifier guidance 要训一个能识别"这张噪声图是什么"的分类器，再用它的梯度去拽采样轨迹；CFG 把这一切折叠回扩散模型本身——同一个网络既学条件版又学无条件版。

Stable Diffusion / Imagen / DALL-E 2 / Sora 全都默认开 CFG。你在 SD WebUI 里调的 "CFG Scale = 7"，背后就是这篇论文的 `w`。

## 为什么重要

不理解 CFG，下面这些都解释不了：

- 为什么 SD 里 CFG=1 出图模糊、CFG=15 颜色爆掉、只有 7 左右最好看
- 为什么"negative prompt"（负面提示词）能起作用——它是 CFG 公式里 `∅` 的一个工程 hack
- 为什么扩散模型推理要跑**两次** forward 才能出一步——一次给条件，一次给空条件
- 为什么 ControlNet / IP-Adapter / multi-CFG 这些后续控制术全都建立在 CFG 公式上

CFG 把"条件控制"从一个有/无开关变成连续旋钮，是文本到图像爆发的关键工程之一。

## 核心要点

CFG 的全部内容可以用 **三件事** 概括：

1. **训练时随机扔掉条件**：训练扩散模型 ε_θ(x_t, c) 时，每个样本以 10–20% 的概率把条件 `c` 替换成空 token `∅`。同一个网络因此同时学到了 p(x|c) 和 p(x)。**几乎不增加训练成本**，只多了一行 dropout。

2. **采样时做线性外推**：每一步去噪，跑两次网络得到 ε(x_t, c) 和 ε(x_t, ∅)，然后

   ```
   ε̃(x_t, c) = (1 + w) · ε(x_t, c) − w · ε(x_t, ∅)
   ```

   `w=0` 等于无条件；`w=1` 等于普通条件；`w>1` 把"条件 vs 无条件"的差距**放大** w 倍。

3. **score 视角下其实是分布锐化**：上面公式等价于在 score 上加权——朝着 `∇log p(x|c) − ∇log p(x)` 的方向多走 `w` 步。这相当于把后验 p(x|c) 在温度 `1/(1+w)` 上做"锐化"，让模型更坚定地往条件靠。

## 实践案例

### 案例 1：Stable Diffusion 里 CFG Scale 调多少

WebUI 默认 CFG Scale = 7。意思是 `w=6`（SD 用 `1+w` 命名，所以界面上的 7 = 公式里的 6+1）：

- **CFG = 1**（w=0）：模型完全不看 prompt，纯随机出图
- **CFG = 3**：跟着 prompt 但很自由，多样性高
- **CFG = 7**：甜区，prompt 听话且画面自然
- **CFG = 12+**：颜色过饱和、对比度爆掉、出现塑料感和伪影

这条曲线背后是 FID（图像质量）和 IS（条件相关性）的权衡——w 增大 IS 一直涨，FID 会先降后升。

### 案例 2：训练时 dropout 多少最合适

论文在 ImageNet 64×64 上扫了 `p_uncond ∈ {5%, 10%, 20%, 50%}`：

- 5%：无条件分支学得不充分，高 w 时画面崩
- **10–20%**：经验甜区，几乎所有后续工作沿用
- 50%：条件分支退化，普通采样质量都下降

Stable Diffusion 用 10%，Imagen 用 10%，DALL-E 2 用 10–20%。

### 案例 3：negative prompt 是怎么 hack 出来的

把采样公式里的 `∅`（空条件）换成另一个具体提示 `c_neg`：

```
ε̃ = (1+w) · ε(x, c) − w · ε(x, c_neg)
```

效果：让结果**远离** `c_neg` 描述的内容。所以你写 negative prompt = "blurry, low quality, deformed hands"，模型就被推离这些坏样本。这不是论文的原推导，是社区发现的工程招——但它能 work，正是因为 CFG 公式本身就是个线性外推。

### 案例 4：score 视角下的"分布锐化"

把 ε 预测翻译成 score 函数 `s(x_t) = -ε(x_t)/σ_t`。CFG 的采样公式等价于：

```
s̃(x, c) = s(x|c) + w · (s(x|c) − s(x))
        = s(x|c) + w · ∇log p(c|x)
```

第二步用了贝叶斯：p(c|x) ∝ p(x|c)/p(x)，两边取 log 求梯度就得到右边。这等价于从分布 p(x|c) · p(c|x)^w 里采样——`w` 越大越偏向"对条件 c 最像"的样本。这就是为什么 w 大画面会"刻板"：你在分布里只取最尖那一小撮模式。

## 踩过的坑

1. **推理算力翻倍**：每步要跑两次网络（c 和 ∅）。可以把 batch 拼起来一次 forward 摊平，但显存翻倍跑不掉。LCM / Hyper-SD 这些"少步采样"方案常用蒸馏把 CFG 折叠进单次 forward。

2. **过饱和与 dynamic thresholding**：高 w 下像素值会冲出 [-1, 1]，导致颜色失真。Imagen 用 dynamic thresholding（按分位数动态裁剪）救回来；SD 靠 VAE 解码自然压缩。直接套高 w 不做处理 → 画面塑料感。

3. **`w` 不是越大越好**：FID 在 `w≈3` 附近最低，再大开始升。但视觉上很多人觉得 `w=7` 更"听话"——因为 IS 还在涨。两个指标拉扯，所以才出现"调参玄学"。

4. **不同 sampler 最佳 `w` 不同**：DDIM / Euler / DPM-Solver++ 对 `w` 的响应曲线不一样，换 sampler 要重调 CFG。这是社区一直没统一的实践陷阱。

5. **CFG 不是严格贝叶斯**：它是从隐式分类器 p(c|x) ∝ p(x|c)/p(x) 取梯度，理论上**只在 w=1 时**等于真正的条件采样。w>1 是经验有效但理论上"偏离了真分布"。这也是后续 CADS / autoguidance 等工作想修的地方。

6. **早期步 vs 晚期步用同一个 w**：直觉上去噪早期需要强引导确定大轮廓，晚期需要弱引导保细节。论文用恒定 `w`；后续工作（如 interval guidance）发现只在中间时段用 CFG 效果更好。

## 适用 vs 不适用

**适用**：

- 任何 score-based / 扩散模型的条件生成（图像 / 视频 / 音频 / 3D / 蛋白质）
- 文本条件特别合适——文本没有现成"分类器"可用，CFG 是唯一可行路径
- 想给用户一个"听话程度"旋钮的产品

**不适用**：

- GAN / VAE / autoregressive 模型——它们没有 score，CFG 不直接套用（虽然有类似思想的衍生）
- 端侧 / 实时场景——推理 2× 是硬成本，常用 LCM 蒸馏把 CFG 折叠进单步
- 纯无条件生成——没 c 就没 guidance

## 历史小故事（可跳过）

- **2020**：Ho 等人把扩散模型 (DDPM) 做成 ε-prediction 的实用形式，扩散开始崛起
- **2021 May**：Dhariwal & Nichol 提 classifier guidance，扩散在 ImageNet 首次打过 GAN——但要单独训分类器
- **2021 Dec**：Ho & Salimans 在 NeurIPS 2021 DGMs Workshop 发 CFG 短文，4 页
- **2022 Jul**：扩展版 arXiv 2207.12598 公开，正文 14 页
- **2022 Aug**：Stable Diffusion v1 发布，`cfg_scale=7.5` 写进默认配置，CFG 自此成扩散模型行业标配
- **2023+**：ControlNet / IP-Adapter / negative prompt / multi-CFG 全部建在 CFG 公式之上

## 学到什么

1. **少一个组件就少一类问题**：classifier guidance 要单独训分类器，CFG 把它折叠回主模型——少一个组件、少一类失败模式。这是工程上"内化复杂度"的经典案例。
2. **训练 dropout = 推理多个分支**：训练时随机扔条件，推理时就有两套 ε 可以做线性运算。这种"训练随机化换推理灵活性"是个普适套路。
3. **线性外推的力量**：公式只是一个加权减法，但它解锁了 negative prompt / multi-CFG / regional CFG 等一整片应用。简单原语 + 组合 > 复杂单点。
4. **指标分歧反映目标分歧**：FID 和 IS 在 `w` 上反着走，说明"质量"和"听话"本来就是不同维度。产品默认值（SD=7.5）选的是 IS 偏好。
5. **dropout 不止防过拟**：训练里把条件随机替换成 `∅`，本意是让网络学会无条件分布。这个改动的副产品——多出一个"无条件分支"——才是 CFG 能成立的关键。一行代码、两种用途，是工程上的优雅范例。

## 延伸阅读

- 原论文：[Ho & Salimans 2022 — Classifier-Free Diffusion Guidance](https://arxiv.org/abs/2207.12598)
- 前作：[Dhariwal & Nichol 2021 — Diffusion Models Beat GANs](https://arxiv.org/abs/2105.05233)（classifier guidance）
- Lilian Weng 博客：[What are Diffusion Models?](https://lilianweng.github.io/posts/2021-07-11-diffusion-models/) 里有 CFG 推导
- Sander Dieleman：[Guidance: a cheat code for diffusion models](https://sander.ai/2022/05/26/guidance.html) — 公式直觉很好
- [[stable-diffusion]] —— CFG 最大消费方
- [[ddpm-2020]] —— ε-prediction 训练目标，CFG 直接挂在它上面

## 关联

- [[stable-diffusion]] —— `cfg_scale` 就是这篇的 `w+1`
- [[ddpm-2020]] —— 提供 ε 预测目标，CFG 在其上加 dropout
- [[diffusion-models]] —— 上位概念，CFG 是其控制层
- [[score-based-models]] —— score 视角下 CFG 是线性外推
- [[comfyui]] —— 节点式扩散 GUI，CFG 是每个采样节点必有参数
- [[ddim]] —— 确定性采样器，最常和 CFG 搭配使用
- [[controlnet]] —— 在 CFG 之上再加一层结构条件控制

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
