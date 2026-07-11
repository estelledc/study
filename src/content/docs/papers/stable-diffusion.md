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

空间边长压到 1/8（面积约 1/64），训练和推理都便宜一个数量级——这是为什么 2022 年起你家 RTX 3060 能跑文生图，而之前只有大实验室能跑。

## 为什么重要

不理解 Stable Diffusion，下面这些事都没法解释：

- 为什么 2022 年 8 月后 Civitai / Automatic1111 / 大量开源文生图 App 突然爆发——它们直接吃 SD 权重
- 为什么 [[dalle-2]] 早 4 个月发布、效果更好，但今天提到"AI 画图"大家想到的是 SD 而不是 DALL-E——**因为 DALL-E 闭源**（Midjourney 同期走红，但是自研闭源，不是 SD）
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

普通人不写代码，要的是"调滑条"。以 Automatic1111 为例，逐步操作：

1. 启动 webui → 浏览器打开本地地址
2. 在 Prompt 框写 `a cat in space, oil painting`，Negative 写 `blurry, low quality`
3. 把 CFG scale 调到约 7.5、选一个 sampler、固定 seed（方便复现）
4. 点 Generate → 几秒出图

ComfyUI（2023）则是节点图：把 SD + LoRA + ControlNet 串成流水线。两个 UI 星数合计超 25 万——**真正用户群是 webui 用户，不是写代码的研究者**。

### 案例 3：DreamBooth 让你训练"自己专属的 SD"

你有 5 张猫照片，想画"你家猫在月球上"。最小入口（概念示意）：

```bash
# 5 张图放进 ./cat，稀有词 sks 当"名字标签"
accelerate launch train_dreambooth.py \
  --pretrained_model_name_or_path=runwayml/stable-diffusion-v1-5 \
  --instance_data_dir=./cat --instance_prompt="a photo of sks cat" \
  --max_train_steps=400
```

**逐部分解释**：`sks` 是几乎不出现在训练集里的稀有词，用来绑定你家猫；训完后 prompt 写 `sks cat on the moon` 就会出你家猫。前提是 **SD 权重开源 + 显存够低**——这两条都是 LDM 提供的。

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

1. **降维比堆参数更聪明**——LDM 的核心不是"训更大模型"，而是"先压到 latent 再训"；视频 / 3D / 音频同理
2. **开源生态 > 单点最优**——[[dalle-2]] 效果更好但闭源；SD 中等但开源，三年后**开源完胜**
3. **CFG 是廉价杠杆**：采样时同时跑有/无 prompt 再做差分，零结构成本，成了扩散模型标配
4. **VAE 编码再 diffuse 才是 LDM 的 trick**：像素约 26 万格压到 latent 约 1.6 万维，训练/推理再便宜一个数量级——选好压缩空间是工程艺术
5. **采样步数是工程旋钮**：DDIM / DPM-Solver 把千步压到 20–50 步，同一权重换采样器就能数量级加速

## 延伸阅读

- 视频教程：[Computerphile — Stable Diffusion](https://www.youtube.com/watch?v=1CIpzeNxIhU)（10 分钟讲清 latent diffusion）
- 自己跑：[Hugging Face Diffusers 教程](https://huggingface.co/docs/diffusers/index)（10 行代码上手）
- 论文 PDF：[arxiv.org/abs/2112.10752](https://arxiv.org/abs/2112.10752)（11 页，重点看 Figure 3 架构图）
- [[ddpm]] —— SD 的"父亲"，理解 latent diffusion 前先理解 pixel diffusion
- [[clip]] —— SD 的文本编码器，prompt 是怎么变成向量的
- [[dalle-2]] —— SD 的同代闭源对手，对比看"开源 vs 闭源"的不同终局
- [[dit]] —— 证明 U-Net 不是必需，最终影响了 SD 3 / FLUX

## 关联

- [[ddpm]] —— 提供扩散过程的数学骨架，SD 原样搬到 latent 空间
- [[clip]] —— 文本编码器，把 prompt 变成 cross-attention 的 K/V
- [[dalle-2]] —— 同期闭源对手，闭源败给开源生态的活样本
- [[dit]] —— U-Net 的下一代替代品，SD 3 / FLUX 用它
- [[lora]] —— 在冻结 SD 上贴低秩适配器，社区 fine-tune 的默认姿势
- [[classifier-free-guidance-2022]] —— CFG 公式来源，webui 里那个 scale 滑条的理论依据
- [[ddim-2020]] —— 把千步采样压到几十步，SD 推理能快起来的关键一环

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

