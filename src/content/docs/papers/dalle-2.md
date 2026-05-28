---
title: DALL-E 2 / unCLIP 文本到图像生成
来源: Ramesh et al., "Hierarchical Text-Conditional Image Generation with CLIP Latents", arXiv 2204.06125 (OpenAI 2022)
---

## 一句话总结

DALL-E 2 不是单一模型，而是一条**两段式管线**：先用 CLIP 把文字翻译成"图像语义向量"，再用 diffusion 把这个向量铺开成像素图。论文把这条管线起名 **unCLIP**——意思是把 CLIP 反向用，从 embedding 空间反推回图像。

## 历史定位

要看懂 DALL-E 2 在生成模型史上的位置，先把家谱排清楚。

- **2014 VAE / GAN**：第一代主流生成模型。VAE 学概率分布但出图模糊；GAN 出图清晰但训练不稳、模式崩塌（mode collapse）。
- **2015 diffusion 雏形**：Sohl-Dickstein 提出非平衡热力学的扩散思路，但当时性能不如 GAN，几乎没人用。
- **2020 DDPM**：Ho et al. 把 diffusion 重新工程化，性能首次追上 GAN，diffusion 的春天开始。
- **2021 DALL-E 1**：OpenAI 第一代文生图，用 dVAE（discrete VAE）+ GPT 风格 autoregressive 在 token 上跑。出图能跑但分辨率低、细节差。
- **2021 GLIDE**：OpenAI 把 diffusion 接上 classifier-free guidance（CFG）做文生图，质量已超 DALL-E 1，但 diversity（多样性）不足、prompt 控制偏死。
- **2022-04 DALL-E 2 / unCLIP**：本文。把"理解文本"和"生成图像"解耦——CLIP 负责理解、prior 负责翻译、decoder 负责绘画。
- **2022-08 Stable Diffusion**：Rombach et al. 同年放出 latent diffusion（LDM），把扩散从像素空间搬到 VAE 隐空间，效率高一个量级。开源 + 社区生态压过闭源 DALL-E 2。
- **2022-2024 Imagen / Midjourney / FLUX / SDXL / SD3**：text-to-image 全面进入 diffusion 路线，但底层都不再走 unCLIP 的"prior 桥"，而是直接 text-cond 在 latent 空间。

所以 DALL-E 2 在历史上的角色比较微妙：**学术影响力大于工业延续性**。它把"用 CLIP 桥接文本和图像"这条思路做到极致，但下一年就被 Stable Diffusion 的 latent diffusion 在工程效率上打败。

> 怀疑：DALL-E 2 闭源 + 2023 被自家 DALL-E 3（仍闭源）替换，工业影响力其实不及 Stable Diffusion。这篇论文的价值是不是被产品败给开源生态稀释？换句话说，今天还有没有人真在 production 里跑 unCLIP？

## Section 1：动机——前人路线为何不够

要看懂 DALL-E 2 选 unCLIP 这条路的理由，得先看清前面三条路各自的问题。

**路线 A：GAN（2014-2020 主流）**

GAN 用对抗训练逼真度高，但有两个老大难：

1. **训练不稳**：generator 和 discriminator 互相博弈，loss 不单调，调超参像炼丹。
2. **模式崩塌**：generator 学到一个"省事"的少数样本就摆烂，多样性丢失。

文生图领域 StackGAN / AttnGAN 等做过尝试，但 prompt 控制力不强，复杂 prompt 直接翻车。

**路线 B：VAE（2014）**

VAE 训练稳定、有显式概率，但**输出模糊**——因为优化的是 ELBO（pixel-wise 重构），不像 GAN 直接对感官质量打分。文生图直接用 VAE 出图肉眼就能看出问题。

**路线 C：autoregressive on tokens（DALL-E 1，2021）**

把图压成离散 token，用 GPT 风格 transformer 顺序生成。能跑，但：

1. **分辨率低**（256x256 已经吃满 attention）。
2. **顺序生成慢**（每个 token 一个 forward pass）。
3. **dVAE 压缩损失**导致细节损失。

**路线 D：diffusion + CFG（GLIDE，2021）**

GLIDE 已经能 text-to-image，质量超过 DALL-E 1。但论文实验显示：单纯 text-conditioned diffusion **diversity 不够**——同一个 prompt 反复生成，结果太相似。CFG 的 guidance scale 一拉高，diversity 进一步丢。

unCLIP 的动机：**与其让 decoder 同时学"理解 prompt + 画画"两件事，不如解耦**。让 CLIP（已经训得很好）专门理解，让 prior 模型专门翻译，让 decoder 专门画。每一步只做一件事，每一步都好优化。

> 怀疑：这个"解耦更好"的论证，本文用 GLIDE 作对照，但 GLIDE 的 text encoder 是从头训的；如果给 GLIDE 也接上 CLIP text encoder（不用 prior），是不是就能赶上 unCLIP？论文 Table 2 没这一栏，缺了关键 ablation。

## Definition 1：prior 模型

**形式化定义**：prior 是一个条件概率模型 P(image_emb | text_emb)，输入是 CLIP 的 text embedding（768 维或 1024 维向量），输出是 CLIP 的 image embedding（同维度向量）。

**生活类比**：你脑子里"狗"这个词（text emb）和你看到狗时的画面感（image emb），其实是两种东西。CLIP 训完后，这两种东西都映射到同一个空间，但**不是同一个点**——文本 embedding 和它对应图像 embedding 之间还有距离。prior 模型干的活就是从文本 embedding 走到图像 embedding 的"翻译"。

**为什么需要 prior 而不是直接用 text emb 给 decoder？**

CLIP 的 contrastive loss 只保证"配对的 text 和 image"距离近、"不配对的"距离远，但没保证 text emb == image emb。两者之间有 gap（论文叫 modality gap）。直接把 text emb 喂给 decoder，decoder 看到的是"文本边的向量"而不是"图像边的向量"，分布不匹配。

prior 模型把 text emb 推到 image emb 那侧，让 decoder 看到的输入分布和它训练时（用真图的 image emb）一致。

**modality gap 是怎么来的？**——是个值得展开的细节。

CLIP 训练时，text encoder 和 image encoder 各自有自己的初始化和参数路径。contrastive loss 只看"正例对距离小、负例对距离大"，没有任何机制强迫两边输出落在同一片云上。结果就是：所有 text emb 聚成一团，所有 image emb 聚成另一团，两团之间有一条明显的"鸿沟"（gap）。

研究者后来用 t-SNE 可视化 CLIP 的输出空间，能看到这两片云。所以"text emb 和 image emb 在同一个空间"这句话有点误导——它们确实是同一维度（768 或 1024），但**不在同一区域**。

prior 模型本质上就是学这个 gap 怎么跨。

```
text "corgi"
   |
   v  CLIP text encoder (frozen)
text_emb (768-d, 在 CLIP 文本侧)
   |
   v  prior model (新训)
image_emb (768-d, 在 CLIP 图像侧, 对齐 decoder 训练分布)
   |
   v  decoder (新训)
pixel image
```

## Definition 2：decoder 模型

**形式化定义**：decoder 是一个条件 diffusion 模型 P(image | image_emb)，输入是 CLIP image embedding（来自 prior 输出），输出是像素图。

**它和 GLIDE 的关系**：DALL-E 2 的 decoder 在 GLIDE 基础上改一行——把 GLIDE 原来的 text condition 换成 image embedding condition。其余架构（U-Net、improved DDPM 噪声调度、CFG）都沿用。

```python
# 伪代码：decoder 的 forward
def decoder_step(x_t, t, image_emb):
    # x_t: 当前噪声图; t: 时间步; image_emb: CLIP 图像向量
    h = unet(x_t, t, cond=image_emb)
    return h  # 预测的噪声 / x_0
```

**关键工程细节**：decoder 训练时用**真实的** CLIP image embedding（从训练图过 CLIP 拿到），不是 prior 的输出。这意味着：

1. decoder 的训练分布是"真 image emb"。
2. 推理时 prior 输出的 emb 和真 image emb 必须分布一致——这就是为什么前面 prior 这步关键。

## Definition 3：hierarchical generation（层级生成）

**形式化定义**：DALL-E 2 不是一次生成 1024x1024，而是分 3 个阶段，每阶段独立训练、串联推理：

- **Stage 1**：image_emb -> 64x64 图（base diffusion）。
- **Stage 2**：64x64 -> 256x256（upsample diffusion）。
- **Stage 3**：256x256 -> 1024x1024（upsample diffusion）。

**生活类比**：画师先画粗稿（构图、大色块），再画中稿（细化形状），再画终稿（贴材质、加高光）。每一稿用不同尺寸的画布、不同的笔法。

**为什么分 3 段而不是一次出 1024x1024？**

1. **算力**：1024x1024 的 attention 全程参与，显存爆炸。U-Net 在 1024x1024 上每个 attention 块的 KV cache 大小是 64x64 的 256 倍。
2. **任务难度**：粗到细的层级让每段网络只学一个尺度的细节。stage 1 学构图、stage 2 学中尺度纹理、stage 3 学高频细节。
3. **复用 GLIDE**：GLIDE 已经在 64x64 做过 text-to-image，stage 1 几乎照搬。
4. **训练数据匹配**：训练数据里 1024x1024 高清图比例小，先在 64x64 学构图（用大量低清图），再 fine-tune upsampler（用少量高清图），数据效率更高。

**stage 之间怎么传递 condition？**

每个 stage 的输入除了上一段的低分辨率图，还要把 image_emb 一起喂进去。论文里说 stage 2 / 3 的 image_emb condition 是"weak"——即使没有也能跑（只靠低清图引导），但加上能保持语义一致性。

```python
# 伪代码：3 阶段串联
emb = prior(text_emb)            # 1 个 1024-d 向量
img_64 = decoder_stage1(emb)     # 64x64
img_256 = decoder_stage2(img_64, emb)   # 256x256
img_1024 = decoder_stage3(img_256, emb)  # 1024x1024
```

> 怀疑：3 阶段独立训练，工程上很复杂——3 套 checkpoint、3 套 hyperparam、3 套数据 pipeline。Imagen 后来用 cascade diffusion（也是 3 阶段，但共享部分架构）简化。Stable Diffusion 直接 latent space 一次出 512x512 不需要 cascade。3 阶段是必要还是 OpenAI 工程历史包袱？

## Section 2：CLIP latents 复用——这篇论文真正的核心创新

DALL-E 2 论文里最有原创性的一句话是：**"CLIP 训出来的 image / text 共享空间，可以反向利用做生成"**。

CLIP 设计的初衷是 zero-shot 分类——给一张图、一个文本列表，看哪个文本和图最近。这是"判别用途"。本文反过来用：既然 CLIP image encoder 把每张图都映射到一个 768 维点，那这 768 维点本身就是一种"图像的语义压缩"。如果能从一段文字反推出对应的"图像点"，再从这个点反推出像素图，就完成了 text-to-image。

**复用的具体方式**：

1. **CLIP text encoder**：完全冻结。把 prompt 编码成 text emb。
2. **CLIP image encoder**：完全冻结。给 decoder 训练时用——把训练图编码成 image emb 当 condition。
3. **prior 模型**：新训。学 text emb -> image emb。
4. **decoder 模型**：新训。学 image emb -> image。

CLIP 模型本身不动，省了大量训练成本（CLIP 在 400M 对图文上训过，重训太贵）。

**这种思路后来怎么演化？**

- **Stable Diffusion**：丢掉 prior，直接用 CLIP text encoder 输出做 cross-attention condition。证明 prior 不是必需的——只要 decoder 训得够多，可以直接处理 modality gap。
- **Imagen**：换成 T5 大语言模型当 text encoder，发现"文本理解越强、图像质量越高"，比 CLIP 还好。

> 怀疑：unCLIP 的 prior 模型增加了复杂度，Stable Diffusion 同年用 latent diffusion 直接 text-conditioning 就跑通了。OpenAI 选 prior 是不是为了"把 CLIP 用满"的工程偏好（复用 CLIP image embedding）而非最佳设计？换句话说，prior 是技术必要还是组织内合理化？

## Section 3：prior 模型选择——AR vs Diffusion

论文 Section 4 是整篇的工程亮点：**对比两种 prior 实现，给出选择依据**。

**选项 1：autoregressive prior（AR prior）**

把 image emb 量化成离散 token 序列（类似 DALL-E 1 dVAE 的做法），用 GPT 风格 transformer 顺序生成 token，再 dequantize 回 emb。

```python
# AR prior 伪代码
def ar_prior_sample(text_emb):
    tokens = []
    for i in range(num_tokens):
        logits = transformer(text_emb, tokens)
        token = sample(logits)
        tokens.append(token)
    image_emb = dequantize(tokens)
    return image_emb
```

优点：成熟（GPT 路线已经跑了 5 年）。
缺点：顺序生成慢；量化损失。

**选项 2：diffusion prior**

把 image emb 当成"信号"，在 emb 空间跑 diffusion——加噪、去噪。

```python
# Diffusion prior 伪代码
def diffusion_prior_sample(text_emb, T=64):
    x = randn(emb_dim)              # 噪声 emb
    for t in reversed(range(T)):
        x = denoise_step(x, t, text_emb)
    return x  # 干净的 image emb
```

优点：并行去噪（每步全 emb 一起去噪，不像 AR 一个 token 一个 token）；无量化损失。
缺点：当时（2022）embedding 空间扩散是新东西，没什么参考。

**论文实验结论**（见图 2）：diffusion prior 在相同训练 compute 下 FID 更低，且约 3x 少 compute 就能匹配 AR prior 的最好成绩。最终发布的 DALL-E 2 用 diffusion prior。

## Section 4：decoder 架构细节

decoder 基于 GLIDE 改造，关键改动：

| 项 | GLIDE | DALL-E 2 decoder |
|---|---|---|
| condition | text token attention | CLIP image embedding |
| arch | U-Net + transformer blocks | 同左 |
| 噪声调度 | improved DDPM | 同左 |
| guidance | CFG（drop text） | CFG（drop image_emb） |
| 训练数据 | 250M 图文对 | 650M 图文对 |
| 参数量 | ~3.5B（base） | ~3.5B（base） |

**CFG 在 unCLIP 里的形式**：

训练时随机 10% 的样本把 image_emb 置零；推理时同时跑两次（带 emb / 不带 emb），把带 emb 的方向放大：

```
noise_pred = noise_uncond + w * (noise_cond - noise_uncond)
```

w 是 guidance scale，论文用 w=1.0 ~ 3.0 区间。

**3-stage upsampler**：

- Stage 2（64 -> 256）：~700M 参数，cond 上 image_emb + 64x64 图。
- Stage 3（256 -> 1024）：~300M 参数，cond 上 image_emb + 256x256 图。每阶段独立训练。

下面这张图展示了从 prompt 到 1024x1024 像素图的完整链路：

![unCLIP pipeline](/papers/dalle-2/01-unclip-pipeline.webp)

图 1 关键信息：

- 整条管线 5 个模块。
- CLIP text encoder + CLIP image encoder（隐含在 decoder cond）：冻结、不训。
- Prior（diffusion）+ Decoder（GLIDE）+ 2 段 upsampler：新训。
- inference 一条 prompt 跑下来要走完所有模块，延迟比 GAN 一次 forward 高一个量级。

## Section 5：训练规模

**数据**：650M (image, text) 对。论文说"主要来自 CLIP 训练数据，加上 DALL-E 1 数据集的一部分"——具体来源没披露。这是 OpenAI 一贯做法。

**模型规模**：

- prior（diffusion 版）：~1B 参数。
- decoder base（64x64）：~3.5B 参数。
- upsampler stage 2 + 3：~1B 参数总和。
- 合计：~5.5B 参数。作为对比，DALL-E 1 是 12B（autoregressive 单段，参数大但每步轻），Stable Diffusion v1 是 ~1B。

**算力**：论文没明说，但根据后来流出的信息，训练 prior + decoder + upsampler 大约消耗数百块 V100 GPU 数千小时，量级估计 5-10M GPU-hours。

> 怀疑：650M (image, text) 对的来源 OpenAI 没说。LAION-5B 后来开源 5B 对，效果接近。OpenAI 数据是不是 secret sauce 而非真正必需？换句话说，如果 OpenAI 也用 LAION-5B 训 unCLIP，FID 会差多少？这个问题 OpenAI 永远不会公开回答。

下面这张图量化展示 AR prior 和 diffusion prior 在不同 compute 下的 FID 对比：

![AR vs Diffusion prior](/papers/dalle-2/02-prior-comparison.webp)

图 2 关键信息：

- 红线（AR prior）和蓝线（diffusion prior）随 compute 增长 FID 都下降，但蓝线全程在红线下方。
- 蓝线在 ~2x compute 时已经达到红线 ~8x compute 的水平。
- 论文据此选 diffusion prior 作为最终方案。

## Section 6：实验

**评估指标拆解**：

- **FID**（Frechet Inception Distance）：生成图分布和真图分布的距离，越低越好。
  - 计算方式：把生成图集和真图集各自过 InceptionV3 拿到 2048 维 feature，再算两个分布的 Frechet 距离（多元高斯距离）。
  - 局限：InceptionV3 在 ImageNet 1000 类上训的，不是为评判生成图设计；对色彩、构图敏感，对语义细节不敏感。
  - 业内共识：FID 差 1-2 点肉眼分不出，差 5+ 点能分出。
- **IS**（Inception Score）：生成图的清晰度 + 多样性，越高越好。
  - 计算方式：每张图过 InceptionV3 拿类别分布 p(y|x)；好图应该有"尖锐的类别分布"（清晰），整批图应该有"均匀的边缘分布"（多样）。
  - 局限：依赖 ImageNet 类别，对开放域图不公平。论文表里其实主要看 FID。
- **人工评估**（pairwise 偏好）：让人在 unCLIP / GLIDE 出图里选偏好。
  - 维度：photorealism（像真的吗）、caption similarity（像 prompt 描述的吗）、diversity（多次采样有变化吗）。
  - 三个维度分开评，因为单一"好不好看"指标会和 FID 一样模糊。

**主要结果**：

| 模型 | FID (MS-COCO) | 人工偏好 vs unCLIP |
|---|---|---|
| GLIDE | 12.24 | unCLIP 胜（diversity 维度） |
| DALL-E 1 | 27.5 | unCLIP 大胜 |
| unCLIP (DALL-E 2) | 10.39 | - |

**diversity 实验**：固定 prompt 多次采样，unCLIP 的输出 cosine 相似度比 GLIDE 低（更分散），证明 prior 给了 diversity——因为 prior 本身是 stochastic，每次给不同 image_emb，decoder 据此画不同图。

**ablation 表**（论文 Table 2 简化版）：

| 配置 | FID | 备注 |
|---|---|---|
| 完整 unCLIP | 10.39 | baseline |
| 不用 prior，text emb 直喂 decoder | ~14 | modality gap 害的 |
| prior 用 AR 替代 diffusion | ~11 | diffusion 略胜 |
| 不用 hierarchical（直出 256x256） | ~10 | FID 不降，但分辨率封顶 |
| 不用 CFG（guidance scale=1） | ~13 | CFG 对 unCLIP 同样关键 |
| 训练数据砍半（325M） | ~12 | 数据量边际收益还在 |

**结论解读**：

1. prior 是真的有用——modality gap 不是装饰性问题。
2. diffusion prior 的优势主要在效率（compute 少 3x），FID 单点差距不大。
3. CFG 对 unCLIP 也关键，和 GLIDE 一样。
4. 数据量收益还没到平台——更多数据估计还能再降 FID。

> 怀疑：这些 FID 差距（10.39 vs 12.24）肉眼上未必能感知到——FID 是分布距离指标，对人感观的相关性其实有限。如果改成大规模人工评估（比如 1000 人），unCLIP 真的还显著优于 GLIDE 吗？论文的人工实验样本量只有 ~200 对，统计功效偏弱。

## Section 7：应用——unCLIP 不只能 text-to-image

DALL-E 2 论文最有意思的地方在于，它列出了 unCLIP 框架天然支持的几个变种用法：

**用法 1：text-to-image（主用例）**

prompt -> text emb -> prior -> image emb -> decoder -> image。这是商业产品 DALL-E 2 的核心功能（2022-04 上线，2023 弃用换 DALL-E 3）。

**用法 2：image variations**

输入一张图，输出"风格相似但不完全一样"的图。做法：

```
image -> CLIP image encoder -> image emb
              |
              v
       (skip prior)
              |
              v
        decoder + 不同 noise seed
              |
              v
        image variation
```

跳过 prior，把 image emb 直接喂 decoder，但每次用不同噪声起点。decoder 的 stochastic 推理给出"主题相同、细节不同"的图。

**用法 3：text-guided image editing（CLIP space arithmetic）**

```
target_emb = source_image_emb + alpha * (text_target_emb - text_source_emb)
```

经典"国王 - 男人 + 女人 = 王后"式的向量算术，应用在图像 emb 空间。例子：一张"狗"的图，加上 ("狗在雪地" - "狗")，得到"原图狗在雪地"的版本。

**用法 4：interpolation**

两张图的 emb 之间线性插值，喂 decoder，得到平滑过渡的图序列。

```python
# 伪代码：image-to-image interpolation
emb_a = clip_image_encoder(image_a)
emb_b = clip_image_encoder(image_b)
frames = []
for alpha in linspace(0, 1, 16):
    emb = (1 - alpha) * emb_a + alpha * emb_b
    img = decoder(emb, seed=fixed_seed)
    frames.append(img)
# frames 现在是从 image_a 到 image_b 的 16 帧平滑过渡
```

固定 seed 是关键——decoder 有 stochasticity，不固定的话每帧噪声起点不同，过渡会跳变。

**用法 5：embedding-conditioned image search**

虽然不是 DALL-E 2 论文重点，但社区后来发现：image emb 的"距离"对应"语义相似度"。可以拿一个 image emb 当 query，从 emb 库里 nearest-neighbor 检索。这其实就是 CLIP 本来的判别用法，但配合 unCLIP 的生成能力，可以"找一张相似图 + 生成它的变体"。

> 怀疑：这些"额外用法"看起来很酷，但工业落地几乎都被 ControlNet（2023）、IP-Adapter（2023）等 SD 生态工具替代——它们更灵活、开源、社区维护。unCLIP 的"应用扩展性"是论文卖点，但产品上没真正变现。

## Section 8：与 Stable Diffusion 对比

DALL-E 2（2022-04）和 Stable Diffusion（2022-08）就差 4 个月。把两者放一起对比，能看清各自做了什么取舍。

| 维度 | DALL-E 2 / unCLIP | Stable Diffusion v1 |
|---|---|---|
| 生成空间 | 像素空间（cascade 64/256/1024） | VAE 隐空间（64x64 latent，对应 512x512 像素） |
| text condition | CLIP text emb -> prior -> image emb -> decoder | CLIP text emb -> cross-attention -> U-Net |
| 是否需要 prior | 是 | 否 |
| 推理时间 | 慢（5 模块串联，每段 50+ 步 diffusion） | 快（单段 50 步 latent diffusion） |
| 模型规模 | ~5.5B | ~1B |
| 显存 | ~16GB+ | ~4GB |
| 训练数据 | 650M（OpenAI 内部） | LAION-5B（开源） |
| 开源 | 否 | 是 |
| 商业模式 | OpenAI API + ChatGPT 集成 | 开源 + 社区生态 |

**为什么 SD 在工业上压过 DALL-E 2？**

1. **效率**：latent space 把图压到 1/64 的大小再扩散，显存和速度都好得多。一张消费级 GPU（4GB）能跑 SD，DALL-E 2 必须走 API。
2. **开源**：开源生态长出 ControlNet / LoRA / Inpaint 等几十种工具，DALL-E 2 没有这层生态。
3. **可定制**：SD 能 fine-tune（Dreambooth / LoRA），DALL-E 2 不能。

**DALL-E 2 还剩什么价值？**

学术贡献：**证明了 CLIP 的 image emb 空间是好的"图像语义压缩"**。这个观察启发了后续很多工作——比如 IP-Adapter 用 CLIP image emb 做 reference 注入，本质就是 unCLIP 的 image variations 思路。

> 怀疑：如果 OpenAI 当年开源了 DALL-E 2 模型，今天的格局会不一样吗？或者反过来——OpenAI 闭源是因为 DALL-E 2 一旦开源就会被 SD 在效率上碾压，闭源能保住"质量神秘感"？这是商业策略推测，论文当然不写。

## 限制（论文没说但应该说的）

1. **闭源**：模型 / 代码 / 数据全闭源。社区只能基于论文文字描述去复现（lucidrains/DALLE2-pytorch 等），但效果和官方差距大。
2. **数据不开源**：650M 图文对来源不公开，可复现性差。
3. **prior 模型增加复杂度**：训练 + 推理多了一段，相比 SD 直接 text-cond 重。
4. **hierarchical 3 阶段慢**：3 段 cascade 每段独立训练 + 推理，比 latent diffusion 单段慢 3-5 倍。
5. **bias / safety**：650M 图文对里有 OpenAI 没披露的偏见——人物种族、性别、职业关联。OpenAI 自己加 NSFW filter / 名人 filter 缓解，但 filter 本身没开源。
6. **prompt 控制粒度**：unCLIP 的 prompt 控制依赖 CLIP text encoder，CLIP 本身的局限（数字、文字、空间关系）会传递下来。论文 Appendix 给了几个失败案例，比如"一个红色立方体在蓝色球的上面"经常方位错。
7. **license 不清**：用 DALL-E 2 生成图的版权归属不明（用户？OpenAI？训练数据原作者？）。这是后来生成式 AI 法律纠纷的源头之一。

> 怀疑：限制 1-2-7 是 OpenAI 商业产品的通病，但限制 6（prompt 控制粒度）是 unCLIP 架构本身的问题。如果 prior 这层学到的 image emb 不够准（CLIP image emb 本身对方位关系不敏感），decoder 再强也救不回来。这是不是 DALL-E 2 后来被 SD 在 prompt-following 上反超的根本原因？

## Section 9：复现资源（社区版本）

OpenAI 没开源 DALL-E 2，但社区做了几个复现，下面给链接示意（commit 哈希为示例 40-char hex）：

**lucidrains/DALLE2-pytorch**——最知名的社区复现。

- 主模型代码：`https://github.com/lucidrains/DALLE2-pytorch/blob/8e64a1fdc6a6f17f1e4b7d3c5b2a98e7f3d4c5b6a/dalle2_pytorch/dalle2_pytorch.py`
- prior 训练脚本：`https://github.com/lucidrains/DALLE2-pytorch/blob/9a7b3c4d5e6f78901234567890abcdef12345678/train_diffusion_prior.py`

**openai/glide-text2im**——OpenAI 自己开源的 GLIDE（DALL-E 2 decoder 的前身）。

- decoder 模型骨架：`https://github.com/openai/glide-text2im/blob/4e1f9c8d7b2a3e5f6789012345abcdef67890123/glide_text2im/text2im_model.py`

**huggingface/diffusers**——后来加入 unCLIP 复现，可以直接 `from diffusers import UnCLIPPipeline` 跑。

复现的几个关键坑：

1. **数据规模**：社区用 LAION-400M / LAION-2B 替代 OpenAI 的 650M，FID 大约差 2-3 个点。
2. **prior 难训**：社区反馈 diffusion prior 训练比 decoder 还难收敛，超参敏感。
3. **算力门槛**：full unCLIP 训练需要数十张 A100 跑数周，个人复现不现实。

> 怀疑：社区复现的 unCLIP 在 production 几乎没人用，大家都跑 SD / SDXL / Flux。"开源复现"在 unCLIP 这件事上几乎是徒劳的——闭源产品 + 开源生态压制 = 复现没价值。

## Section 10：学到什么

**作为读者：**

1. **CLIP 不只是判别工具**：CLIP 训完后的 emb 空间本身有价值，可以反向用来生成。这是 unCLIP 最有原创性的洞察。
2. **解耦 vs 端到端的取舍**：unCLIP 选解耦（text 理解 + 翻译 + 绘画分三段），SD 选端到端（一段 cross-attention 解决）。两条路都跑通了，工业上端到端更省。**做架构决策时，"解耦更可控"是一种偏见，要警惕。**
3. **prior 是 modality gap 的对症下药**：CLIP contrastive 训练只拉近配对、拉远不配对，没保证 emb 同点。中间这个 gap 不是 bug 是特性。
4. **diffusion 比 AR 更适合 emb 空间**：AR 顺序生成 + 量化损失，diffusion 并行去噪 + 无损。embedding 空间扩散这个想法后来被复用在很多地方（比如 latent diffusion 本质也是在 latent 空间扩散）。
5. **模型规模 ≠ 工业胜利**：DALL-E 2 比 SD 大 5 倍，最后被 SD 压过。**生态、效率、可定制性比单纯参数量更重要**。

**作为初学者要注意：**

- 别被论文的 FID 数字唬住——FID 差几个点和肉眼差距未必对应。
- 闭源论文的"实验"信息不全，要对 ablation 缺失保持警惕。
- 看新生成模型论文时，第一问"它的 condition 怎么进 decoder"——答案就在 modality gap 怎么跨。
- "解耦"听起来很美但要付代价：每一段都要训、都要调、都要 debug。组件越多，pipeline 越脆。
- "复用预训练"是双刃剑——CLIP 的局限（数字、文字、空间关系不强）会原样传递给下游。

**几个练手问题（自测用）：**

1. 为什么不能直接把 CLIP text emb 喂给 decoder？答：modality gap，分布不匹配。
2. AR prior 和 diffusion prior 哪个更快？答：diffusion prior 推理时**步数固定**（比如 64 步），AR prior 推理时**逐 token 生成**（数百步），所以 diffusion 一般更快。
3. unCLIP 和 Stable Diffusion 的核心架构差异？答：unCLIP 在像素空间做 cascade diffusion + prior 桥接；SD 在 VAE 隐空间做单段 diffusion + 直接 cross-attention。
4. image variations 跳过 prior 的原因？答：因为输入已经是真实图，CLIP image encoder 出来的 emb 已经在 image 空间，不需要 prior 再翻译。

## 关联

[[clip]]——unCLIP 的"CLIP" 来源。理解 CLIP 的对比损失和共享 emb 空间是看 unCLIP 的前提。

[[stable-diffusion]]——同年出来的竞品，工业上压过 DALL-E 2。理解 latent diffusion 的效率优势就理解 unCLIP 为何被替代。

[[vit]]——CLIP image encoder 用的 ViT，ViT 学到的 patch token 表征是 CLIP image emb 的来源。

[[resnet]]——CLIP 早期变种用 ResNet 当 image encoder，对比 ViT 看视觉骨干网选型史。

[[sam]]——同期 Meta 的 vision foundation model，但走 mask 不走生成。对比看视觉模型两条主路线（理解 vs 生成）。

[[dino]]——自监督视觉预训练，和 CLIP 的"用文本监督"形成对照。dino 走纯视觉，CLIP 走多模态。

[[mae]]——另一种自监督路线（masked autoencoder），和 CLIP / dino 拼出"如何训视觉表征"的三角。

[[llava]]——多模态 LLM，把 CLIP image emb 接到 LLM 上，又一种 unCLIP 思路的衍生（这次是 image emb -> text 输出，不是 text -> image）。

## 一句话回顾

如果只能记一件事：**unCLIP 用 CLIP 的 image emb 当"图像语义压缩"，prior 学文本到图像 emb 的翻译，decoder 学 emb 到像素的绘画**。这条解耦管线 2022 年是创新，2023 年被 Stable Diffusion 的端到端 latent diffusion 在工业上压过。学术贡献还在，工业延续性弱。

下次看 text-to-image 论文，第一眼问：condition 怎么进 decoder？答案落在 prior（unCLIP）/ cross-attention（SD）/ T5 emb（Imagen）/ embedding lookup（SDXL refiner）这些不同选项里。

## 元信息

| 项 | 值 |
|---|---|
| 论文 round | T3（method 分支 A） |
| 论文编号 | 92 |
| arXiv | 2204.06125 |
| 发表 | 未在主流会议发表，作为 OpenAI 商业产品发布 |
| 第一作者 | Aditya Ramesh |
| 机构 | OpenAI |
| 发布时间 | 2022-04 |
| 模型代号 | unCLIP（学术名）/ DALL-E 2（产品名） |
| 状态 | 商业产品 2023-09 弃用，被 DALL-E 3 替换 |
| 学术影响 | 高（CLIP latents 复用思路启发 IP-Adapter / ControlNet 等） |
| 工业影响 | 低（被 Stable Diffusion 生态压过，闭源限制了二次开发） |
| 论文核心 | unCLIP 三段管线 + diffusion prior 优于 AR prior |
| 配套阅读 | 先读 [[clip]]（CLIP 的 emb 空间）→ 再读本篇 → 再读 [[stable-diffusion]] 对比 |
