---
title: DiT — Diffusion Transformer
来源: 'Peebles & Xie, "Scalable Diffusion Models with Transformers", ICCV 2023'
日期: 2026-05-29
子分类: 生成模型
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

DiT（**Diffusion Transformer**）把 [[ddpm]] 里默认的 U-Net 画家**换成了** [[attention]] Transformer——证明扩散模型也能享受"模型越大、画得越好"的红利。

日常类比：

- DDPM 用 CNN 当画家（U-Net）——擅长抓局部细节，但画板加大就开始喘
- DiT 让 Transformer 当画家——参数越多画得越好，画板加多大都行

一句话：把生图模型的发动机从 U-Net 换成 Transformer，让生图也能享受"砸算力换性能"的待遇。

## 为什么重要

不理解 DiT，下面这些事都没法解释：

- 为什么 Stable Diffusion 3 / Sora / FLUX.1 现在**全部用 DiT 架构**——U-Net 已经退役
- 为什么扩散模型也能像 [[gpt-3]] 一样砸算力出奇迹——这条 scaling laws 路是 DiT 在生图领域打通的
- 为什么 OpenAI 敢做高清长视频（Sora）——U-Net 不好扩到长序列，DiT 才行
- 为什么 [[vit]] 之后所有视觉新架构都"先切 patch 再喂 Transformer"——DiT 把这套范式从判别扩到了生成

## 核心要点

DiT 的核心改造可以拆成 **三步**：

1. **切 patch 当 token**：跟 [[vit]] 一样，把图（实际是 VAE 压缩后的 latent）切成不重叠的小方块，每块当一个 Transformer token。32×32 的 latent 切成 2×2 的 patch，就是 256 个 token——Transformer 现在面对的是序列，不是二维网格。

2. **AdaLN-Zero 注入条件**：扩散模型每一步去噪都要知道"现在是第几步"和"要画什么类"。DiT 把这两个信号通过 MLP 投影成 LayerNorm 的 scale (γ) 和 shift (β)，调节每一层的归一化行为。**Zero** 的意思：每个 block 输出处加一个门控系数 α，初始化为 0——模型一开始等价于"什么都不做"，深网瞬间稳。

3. **多尺寸扫 scaling law**：S / B / L / XL 四档模型 × patch size 2/4/8 三档 = 12 个变体。把 FID 对 Gflops 画图，是一条**没看到拐点**的下降曲线——往里砸算力还没碰到天花板。

## 实践案例

### 案例 1：ImageNet 256×256 拿下 SOTA

| 模型 | 参数 | FID（越低越好） |
|------|------|-----------------|
| ADM（U-Net 代表） | 554M | 4.59 |
| LDM-4（U-Net + latent） | 400M | 3.60 |
| **DiT-XL/2** | **675M** | **2.27** |

DiT-XL/2 第一次让"Transformer 在生图任务赢卷积"被白纸黑字写下来。这一篇论文也直接把后续工业界的 backbone 选择拉向 Transformer。

### 案例 2：Sora 直接用 DiT 做视频

OpenAI 2024-02 的 Sora 把 DiT 的 patchify 从 2D 扩展到 3D（时空 patches）：

- 每个 patch 是 P_t × P × P 的小立方体（时间 × 空间 × 空间）
- DiT block **不变**，只是 token 数量多了
- Sora 一作 William Peebles 就是 DiT 一作

为什么不用 U-Net？U-Net 的卷积没法优雅扩到长视频序列；attention 全局可达，可以。

### 案例 3：Stable Diffusion 3 用 MMDiT

SD3（2024-03）提出 **MMDiT**（multimodal DiT）：文本 token 走一路 Transformer、图像 token 走另一路 Transformer，两路在每个 block 互相 cross-modulate。

比 SD1/SD2 那种"U-Net + cross-attention"的旧路线提升明显——背后还是 DiT 给的 scaling 红利。

## 踩过的坑

1. **AdaLN-Zero 不是想象中那么便宜**：每个 block 需要一个 condition → (γ, β, α) 的 MLP，hidden dim 拉到 1152 时参数开销不小。论文说"adaLN 比 cross-attention 便宜"主要是 Gflops 上便宜，不是参数量上。

2. **推理慢**：DDPM 50-1000 步 × 大 Transformer 单次前向 + classifier-free guidance 每步还要跑两次。比 GAN 一次出图慢 50-1000 倍。生产环境必须用 DPM-Solver 把步数压到 10。

3. **训练贵**：DiT-XL/2 训到论文报告的 7M iter 用了几百 GPU 小时。能跑通代码不等于能复现 SOTA——普通研究者门槛极高。

4. **小数据集劣势**：U-Net 的局部归纳偏置在 < 10K 图的小数据集仍然有用。DiT 数据少容易过拟合，没有大数据撑着拼不过 U-Net。

5. **依赖 VAE 质量**：DiT 在 latent 空间训，复用 LDM 的 VAE。在医疗影像、卫星图等领域 VAE 编码不准，DiT 上限就被压住了。

## 适用 vs 不适用场景

**适用**：

- 大数据集生图 / 生视频（ImageNet / LAION / Sora 训练数据规模）
- 需要"砸算力换性能"的工业产线（SD3 / FLUX / Sora）
- 多模态融合（MMDiT 把文本 + 图像 token 拼接，cross-modulate）

**不适用**：

- < 10K 张图的小数据集——U-Net 仍然占优
- 需要极低推理延迟的场景（实时游戏、AR）——DDPM 50 步太慢
- 没有预训练 VAE 的稀有领域——VAE 编码不准会拖死整个 pipeline

## 历史小故事（可跳过）

- **2020 年**：DDPM（Ho et al.）把扩散模型工程化，性能首次追上 GAN。**默认 backbone 是 U-Net**——卷积下采样 + 跳跃连接 + 卷积上采样
- **2022 年**：Latent Diffusion / Stable Diffusion 把扩散从像素空间搬到 VAE latent 空间，效率高一个量级。**backbone 仍然是 U-Net**
- **2022-12**：Peebles & Xie 把 DiT 论文挂 arXiv。第一次系统地把 U-Net 换成 Transformer，量出 scaling law。当时反响不算很大，"U-Net 凭什么动"是主流声音
- **2024-02**：OpenAI Sora 横空出世。技术报告反复 cite DiT，一作 William Peebles 加入 OpenAI 主导 Sora。DiT 一夜出圈
- **2024-03**：Stability AI 用 MMDiT 发布 Stable Diffusion 3
- **2024-08**：Black Forest Labs（原 SD3 团队）发 FLUX.1，DiT 系，12B 参数，开源文生图 SOTA

DiT 论文从挂 arXiv 到工业全面接受，花了一年半。架构革命从来不是论文当天就生效的。

## 学到什么

1. **归纳偏置是双刃剑**——U-Net 的卷积偏置在数据稀缺时是恩惠，在数据充裕时是枷锁。Transformer 没有强偏置，反而能从大数据里学到更好的表示。这条规律 [[vit]] 在判别证过一次，DiT 在生成又证一次
2. **Zero-init 是稳定深网的通用法宝**——AdaLN-Zero 让每个 block 初始等于 identity。这条思想跟 ResNet 残差、ControlNet zero conv、LoRA 的 B 矩阵零初始化是一条线。**让模型从 do-nothing 起步，比从随机起步稳得多**
3. **scaling law 不是 NLP 专利**——DiT 把这条规律从语言搬到生图，证明它是普适的。后续 Sora、SD3、FLUX 都遵循这条规律砸算力
4. **解耦 backbone 和任务有红利**——LDM 解耦了"diffusion 跟空间"（latent vs pixel），DiT 解耦了"diffusion 跟 backbone"。每解耦一次工程灵活性翻倍
5. **架构革命的工业接受滞后期**：DiT 2022-12 挂 arXiv，到 2024-02 Sora 才让它出圈，工业接受花了 14 个月——架构论文在没有"震撼级 demo"之前很难被信任，这是新架构的常态而非例外。
6. **patchify 是视觉 Transformer 的通用胶水**：ViT 把图分 patch 喂 Transformer 做判别，DiT 复用同一手法做生成；这条工程规律告诉你"哪里要把图变成序列，patchify 都是默认选" 比花式 hybrid 更稳。
7. **Sora 出圈靠论文背书**：Sora 报告反复 cite DiT 而非把架构当黑盒，这种"论文 → 工业 → 出圈" 的反向引用让 academia 与 industry 之间有了一条可验证的传承链。
8. **AdaLN-Zero 是稳定深网的法宝**：每个 block 初始 = identity，从 do-nothing 起步比从随机起步稳得多——这条思想跟 ResNet 残差、ControlNet zero conv、LoRA B 矩阵零初始化是一条线。
9. **MMDiT（SD3）的双流注意力是延伸**：把文本和图像 token 分双流走 attention，再融合——延续 DiT 解耦思路，把"backbone 解耦" 推进到"模态解耦"。
10. **scaling law 跨任务普适**：DiT 把语言里的 scaling law 搬到图像生成，证明它不是 NLP 专利；后续 Sora（视频）、AlphaFold（结构）都遵循同一规律。
11. **理论简洁不等于工程接受**：DiT 在 2022 论文里就量化了 U-Net 不必要，但工业界等到 SD 3 / Sora 2024 才切——纸面证据 vs 工业证据是两条曲线，前者快后者慢。

## 延伸阅读

- 论文 PDF：[Scalable Diffusion Models with Transformers](https://arxiv.org/abs/2212.09748)（arXiv 2212.09748）
- 官方代码：[facebookresearch/DiT](https://github.com/facebookresearch/DiT)（models.py 100 行就能读完核心）
- Sora 技术报告：[Video generation models as world simulators](https://openai.com/index/video-generation-models-as-world-simulators/)（看 DiT 怎么扩到视频）
- [[ddpm]]——理解 DiT 的前提
- [[vit]]——patchify + Transformer 范式的源头
- [[stable-diffusion]]——DiT 的训练框架

## 关联

- [[ddpm]]——DiT 是 DDPM 的 backbone 替换版；不变 noise schedule，只换画家
- [[vit]]——ViT 把 patchify 引入视觉判别，DiT 把同一招带进生成
- [[attention]]——DiT block 的核心是多头自注意力
- [[gpt-3]]——DiT 证明"砸算力"路线在扩散模型也成立，跟 GPT-3 同一条 scaling 思路
- [[stable-diffusion]]——LDM/SD 是 DiT 的训练框架；SD3 才把 U-Net 换成 DiT
- [[clip]]——CLIP 提供文本-图像对齐 embedding，是 SD3 / FLUX 这些文生图 DiT 的输入桥
- [[resnet]]——ResNet 残差 + identity shortcut，跟 AdaLN-Zero 让 block 初始为 identity 同源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[3d-gaussian-splatting]] —— 3D Gaussian Splatting — 用一堆 3D 模糊光斑重建场景
- [[attention]] —— Attention Is All You Need
- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[ddim-2020]] —— DDIM — 把扩散模型 1000 步采样压到 50 步
- [[ddpm]] —— DDPM — Denoising Diffusion Probabilistic Models
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[resnet]] —— ResNet — 残差连接
- [[stable-diffusion]] —— Stable Diffusion — 开源文生图引爆
- [[vit]] —— ViT — Vision Transformer

