---
title: Stable Diffusion — 开源文生图引爆
来源: 'Rombach et al., "High-Resolution Image Synthesis with Latent Diffusion Models", CVPR 2022'
日期: 2026-05-29
分类: 生成模型
难度: 中级
---

## 是什么

Stable Diffusion（**SD**）是 CompVis 团队（LMU 慕尼黑）2022 年开源的**文生图模型**。它的核心想法只有一句话：

> 不要在像素空间画画，先把图压缩成"小稿"，在小稿上画完再放大。

日常类比：

- [[ddpm]] 这种早期扩散模型像在 **512×512=26 万像素的大画布**上一笔一笔涂——耗时、烧显卡、家用电脑放不下
- Stable Diffusion 像先用 VAE 把画布压成 **64×64=4096 个小格子**（叫 latent），在小格子上涂完，再用 VAE 解码回大图

压缩比 8×8 = 64 倍，算力一下省了 100×。这是为什么 2022 年起你家 RTX 3060 能跑文生图，而之前只有 OpenAI 实验室能跑。

## 为什么重要

不理解 Stable Diffusion，下面这些事都没法解释：

- 为什么 2022 年 8 月之后突然冒出 Midjourney / Civitai / 各种 AI 头像 App——它们底层几乎都是 SD
- 为什么 [[dalle-2]] 早 4 个月发布、效果更好，但今天提到"AI 画图"大家想到的是 SD 而不是 DALL-E——**因为 DALL-E 闭源**
- 为什么 Stability AI 这家公司从 0 估值到 10 亿美元只花了一年——把模型权重免费放出，社区帮你做生态
- 为什么"LoRA / ControlNet / DreamBooth"这些词突然在 2023 年遍地都是——它们都是 SD 的下游插件

一句话：**SD 是第一个"消费级 GPU 能跑、代码权重全开源"的高清文生图模型**。这两个条件同时满足，就引爆了过去三年所有 AI 视觉应用。

## 核心要点

SD 由**三个零件**拼成。理解这三个就理解 SD：

1. **VAE Encoder/Decoder**：负责"压缩稿"和"放大"。Encoder 把 512×512 像素图压成 64×64×4 的 latent；Decoder 反过来。VAE 是预先训好的，跑 SD 时它**冻住不动**。

2. **U-Net 在 latent 空间扩散**：800M 参数的去噪网络，在 64×64 的小稿上学"从纯噪声一步步擦回清晰图"。因为不在像素空间跑，**8GB 显存**就够。

3. **Cross-attention 注入文本**：用户的 prompt（"a cat in space"）先过 [[clip]] 文本编码器变成向量，再通过 cross-attention 当 K/V 喂进 U-Net 的每一层。这是 SD"听懂人话"的接口。

把三个串起来：**用户输入 prompt → CLIP 编码 → 随机噪声 latent → U-Net 去噪 50 步（每步看 prompt）→ VAE 解码 → 输出 512×512 图**。

## 实践案例

### 案例 1：一行 pip 就能跑

Hugging Face 的 `diffusers` 库把上面三个零件封装成一个 pipeline：

```python
from diffusers import StableDiffusionPipeline
import torch

pipe = StableDiffusionPipeline.from_pretrained(
    "runwayml/stable-diffusion-v1-5",
    torch_dtype=torch.float16
).to("cuda")

img = pipe("a cat in space, oil painting").images[0]
img.save("cat.png")
```

第一次跑会下载 ~4GB 权重；之后每张图 ~5 秒（RTX 3060）。**整个 SD 工业级使用门槛就是这十行代码**。

### 案例 2：Web UI 让普通人也能玩

普通人不写代码，但他们要的是"调滑条 + 拖文件"。社区做了两个 UI：

- **Automatic1111 webui**（2022-08 开源）：浏览器里调 prompt / negative prompt / CFG scale / sampler / seed
- **ComfyUI**（2023 开源）：节点图工作流，能把 SD + LoRA + ControlNet + 多次采样 串成复杂 pipeline

这两个 UI 加起来 GitHub 星数超过 25 万。**SD 的真正用户群是 webui 用户，不是写代码的研究者**。

### 案例 3：DreamBooth 让你训练"自己专属的 SD"

你有 5 张你家猫的照片，想让 SD 画出"你家猫在月球上"。流程：

1. 准备 5 张图 + 一个稀有标识词（比如 `sks cat`）
2. 在原 SD 上 fine-tune 几百步（消费级 GPU 30 分钟）
3. 之后 prompt 写 `sks cat on the moon` → 输出图里就是你家猫

这就是 DreamBooth（Google 2022 论文）。它能跑起来的前提是 **SD 权重开源 + 显存够低**——这两条都是 LDM 论文提供的。

## 踩过的坑

1. **VAE 是天花板**：latent 是有损压缩，VAE 还原不出来的细节（小字、人脸高频纹理、几何精确边缘），扩散再怎么去噪也学不出来。这是为什么 SD v1 画字总是糊的；后来 SDXL / SD3 都重训了 VAE。

2. **prompt > 77 token 必断裂**：CLIP 文本编码器硬编码 77 token 最长——长 prompt 直接被截断。SD 3 / FLUX 才换成 T5-XXL 解决（512+ token）。

3. **CFG scale 不是越高越好**：webui 默认 7.5，但调到 15 会出现"色彩饱和度爆炸 + 主体重复"。原因是 classifier-free guidance 公式 `ε = ε_uncond + w·(ε_cond - ε_uncond)` 在 w 太大时会推到训练分布外。

4. **训练数据不可重现**：LAION-Aesthetics 子集的具体过滤规则不公开，按照原论文你训不出官方那张 checkpoint。

## 适用 vs 不适用场景

**适用**：
- 文生图、图生图（img2img）、inpainting（局部重绘）
- 风格迁移、AI 头像、概念艺术
- 8GB+ 显存的本地推理
- fine-tune 自己的小数据集（DreamBooth / LoRA）

**不适用**：
- 实时生成（< 100ms）→ 用 GAN / SDXL Turbo / LCM
- 长 prompt 复杂语义 → 用 SD 3 / FLUX（换 T5 编码器）
- 高保真文本渲染（招牌字、海报字）→ VAE 瓶颈，改用 Imagen 3 或 FLUX
- 视频 → 用 SVD / Sora / AnimateDiff（基于 SD 但加时间维度）

## 历史小故事（可跳过）

- **2020-06**：[[ddpm]] 论文（Ho et al.）证明扩散模型能生图，但跑在像素空间，A100 ×8 训一周
- **2022-04**：OpenAI 发布 [[dalle-2]]——闭源、API 排队、4 GPU 推理；震惊业界但普通人摸不到
- **2022-08-22**：CompVis + RunwayML + Stability AI 联合放出 Stable Diffusion v1 权重（CreativeML Open RAIL-M 许可）。一夜之间 reddit / twitter 刷屏，下载量爆炸
- **2022-09**：Automatic1111 webui 上线，普通人能用了
- **2023-02**：ControlNet（Zhang et al.）让 SD 能"听姿态 / 边缘 / 深度"，AI 绘画工业化
- **2023-07**：SDXL（2.6B 参数 + 双 CLIP）发布
- **2024-06**：SD 3 用 [[dit]] 替换 U-Net + rectified flow 替换 DDPM 调度
- **2024-08**：原 SD 团队 Rombach + Esser 出走创立 Black Forest Labs，发布 FLUX.1（12B DiT，至今最强开源）

整条线索：**像素扩散太贵 → latent 空间省 64× → 开源 → 社区接管 → 衍生工业生态**。

## 学到什么

1. **降维比堆参数更聪明**——LDM 的核心 insight 不是"训更大模型"，而是"先压缩再训"。这个思路适用于任何高维数据：视频、3D、音频都可以"在 X 的 latent 上跑 diffusion"
2. **frozen 预训练编码器 + 可训轻量 decoder** 是低成本接入大模型的通用模式。SD 用 frozen CLIP / frozen VAE，只训 U-Net；现代 LoRA / Adapter 都是同思路
3. **开源生态 > 单点最优**——[[dalle-2]] 效果其实更好但闭源；SD 中等但开源，三年后回头看，**开源完胜**
4. **理论 → 算法 → 工程 → 生态**，每一步都是放大器。LDM 论文 11 页，但放权重那一刻才真正引爆
5. **CFG 是廉价的杠杆**：classifier-free guidance 不改架构、不加参数，只在采样时同时跑一次有 prompt + 一次无 prompt 然后做差分——这种"零结构成本的引导技巧"成了所有扩散模型的事实标配
6. **U-Net 是过渡架构**：原版 SD 用 U-Net，因为 CV 那一拨人对它最熟；2024 SD 3 / FLUX 切到 DiT 后才发现 U-Net 不是 latent diffusion 的必要条件，工程惯性比技术判断更慢
7. **license 决定生态命运**：CreativeML Open RAIL-M 许可允许商用又限制有害用途，这条法律条款决定了 SD 能被 ComfyUI / WebUI / Civitai 等社区无障碍接力——生态不是技术决定，是合同决定
8. **VAE 编码再 diffuse 才是 LDM 真正的 trick**：原 DDPM 跑像素 512×512=26 万维空间，LDM 先压到 64×64×4=1.6 万维再 diffuse，省 16 倍计算的同时几乎不损质量——选好压缩空间是工程艺术
9. **prompt 是 cross-attention 的 K/V**：文本通过 CLIP 编码后做 cross-attention 注入图像 latent；这种"另一个模态当 attention K/V" 的接入方式后来被多模态 LLM 普遍复用

## 延伸阅读

- 视频教程：[Computerphile — Stable Diffusion](https://www.youtube.com/watch?v=1CIpzeNxIhU)（10 分钟讲清 latent diffusion）
- 自己跑：[Hugging Face Diffusers 教程](https://huggingface.co/docs/diffusers/index)（10 行代码上手）
- 论文 PDF：[arxiv.org/abs/2112.10752](https://arxiv.org/abs/2112.10752)（11 页，重点看 Figure 3 架构图）
- [[ddpm]] —— SD 的"父亲"，理解 latent diffusion 前先理解 pixel diffusion
- [[clip]] —— SD 的文本编码器，prompt 是怎么变成向量的
- [[dalle-2]] —— SD 的同代闭源对手，对比看"开源 vs 闭源"的不同终局
- [[dit]] —— SD 的"反对者"，证明 U-Net 不是必需，最终影响了 SD 3 / FLUX

## 关联

- [[ddpm]] —— 提供扩散过程的数学骨架，SD 原样搬到 latent 空间
- [[clip]] —— 文本编码器，把 prompt 变成 cross-attention 的 K/V
- [[dalle-2]] —— 同期闭源对手，闭源败给开源生态的活样本
- [[dit]] —— U-Net 的下一代替代品，SD 3 / FLUX 用它
