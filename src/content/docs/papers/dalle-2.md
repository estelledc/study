---
title: DALL-E 2 — 基于 CLIP + 扩散的图像生成
来源: 'Ramesh et al., "Hierarchical Text-Conditional Image Generation with CLIP Latents", 2022'
日期: 2026-05-29
分类: 生成模型 / 计算机视觉
难度: 中级
---

## 是什么

DALL-E 2 是 OpenAI 2022 年发布的"输入文字描述 → 输出 1024×1024 高清图片"的模型。日常类比：以前画画要先勾轮廓再上色、再加阴影；DALL-E 2 让你说一句"戴墨镜的牛仔猫坐在月球上吃寿司"，AI 直接把图画出来。

输入：

```
"an astronaut riding a horse on Mars"
```

输出：一张 1024×1024 像素的、看起来像真照片的"宇航员在火星骑马"的图。

它不是单一模型，而是一条管线。论文给它起名 **unCLIP**——意思是把 CLIP 反向用：CLIP 原本是把图压成"语义点"用来分类，DALL-E 2 反过来从"语义点"反推回像素图。

## 为什么重要

不理解 DALL-E 2，下面这些事都没法解释：

- 为什么 2022 年突然冒出 Midjourney / Stable Diffusion 这一波"AI 画画"产品，而 DALL-E 2 是引爆它们的第一颗火种
- 为什么后来的图像生成模型都说"基于 CLIP + 扩散"——把 [[clip]] 表征和 [[ddpm]] 扩散拼一起，这个组合是 DALL-E 2 验证的
- 为什么 2022 年 AI 浪潮先有 DALL-E 2、半年后才有 ChatGPT——OpenAI 用图像生成先打了一次预热
- 为什么"创意工作"边界被重新定义——画师、设计师从此要面对一个不会累的对手

## 核心要点

unCLIP 把"理解文本 + 画图"两件事拆成 **三个模块**：

1. **CLIP text encoder（已有，冻结）**：把 prompt"an astronaut on Mars"翻译成一个 768 维向量（叫 text embedding，文本语义点）。
2. **prior 模型（新训）**：把 text embedding 翻译成 image embedding（图像语义点）——CLIP 训完后这两种 embedding 不在同一个区域，中间需要一座桥。
3. **decoder（新训）**：把 image embedding 解码成像素图。这一步是扩散模型——从纯噪声开始，反复"去噪"，每步都参考 image embedding 的指引。

整条管线串起来：

```
prompt → CLIP text encoder → text emb → prior → image emb → decoder → 64×64 图
                                                                        ↓
                              upsampler 1 → 256×256 → upsampler 2 → 1024×1024
```

注意最后两步：DALL-E 2 不是一次出 1024×1024，而是分三段——先画 64×64 的粗稿，再放大到 256×256，最后到 1024×1024。每段是一个独立的扩散模型。

**类比**：画师先打底稿（构图、大色块），再画中稿（细化形状），再画终稿（贴材质、加高光），三步各管一个尺度。

为什么需要 prior 这座"桥"？CLIP 训练时只保证"配对的文本和图距离近"，没保证两边输出落在同一个点上。两类 embedding 像两团云，中间隔着一条沟。直接把 text embedding 喂给 decoder，decoder 看到的输入分布和它训练时看到的（来自真图的 image embedding）不一致，效果差。prior 模型专门学怎么跨这条沟。

## 实践案例

### 案例 1：从 prompt 到图的完整链路

输入：`"an astronaut riding a horse on Mars"`

1. CLIP text encoder 把这句话变成一个 768 维向量（文本语义点）。
2. prior 模型用 64 步扩散，把文本语义点"翻译"成图像语义点（同样 768 维）。
3. decoder 用 ~50 步扩散，从纯噪声画出 64×64 的"宇航员骑马"草图。
4. upsampler 1 用扩散把 64×64 放大到 256×256，补中等尺度细节（马的鬃毛、宇航服褶皱）。
5. upsampler 2 再放大到 1024×1024，补高频细节（毛发反光、火星地表纹理）。

整条管线 5 个模块串联，一次推理要跑数百步神经网络 forward。慢，但可控。

### 案例 2：image variations（图片变体）

给 DALL-E 2 一张图，让它"画一个相似但不一样的版本"：

1. 跳过 prior：输入已是真图，不需要再从文本语义点翻译。
2. 把图过 CLIP image encoder，得到已经在"图像侧"的 image embedding。
3. 喂给 decoder 时换不同的随机噪声起点，多次采样。

结果：主题相同、构图相似、细节有差异——像同一个画师按一个想法画了两次。

### 案例 3：outpainting / inpainting

不改模型权重，只改推理时的掩码：

1. **outpainting**：给"窗边的猫"，把画布外扩，已知像素锁住、外扩区当待去噪区。
2. **inpainting**：圈掉电线杆，圈内当待去噪、圈外当固定条件。
3. 扩散每一步只更新未知区域的噪声估计，已知区域保持原像素——自然填补。

## 踩过的坑

1. **图里的字常乱**：画"a sign that says HELLO"常出"HEILO"；CLIP 学语义不学字形。
2. **解剖学错误**：六指、关节反——训练数据里细肢体占比小，模型没学透。
3. **偏见复制**：prompt"a CEO"默认白人男性；训练统计偏见原样传到生成。
4. **空间与计数不稳**："红方块在蓝球上面"常方位反；"5 个苹果"常画成 4 或 6。

## 适用 vs 不适用

**适用**：

- 想理解"CLIP 条件 + 扩散解码"这条 2022 文生图主线，再去读 Stable Diffusion / Imagen
- 需要 image variations、局部重绘这类"同一语义点多次采样"的产品能力
- 教学或论文复现：用 diffusers 的 UnCLIPPipeline 走通 prior → decoder 管线

**不适用**：

- 要本地 fine-tune / LoRA / ControlNet——官方权重不开，生态在开源 SD 一侧
- 要低延迟批量出图——级联三段扩散推理步数多，成本高于 latent diffusion
- 要可靠文字渲染或精确空间关系——CLIP 语义桥本身不擅长字形与方位

## 历史小故事（可跳过）

- **2021-01**：DALL-E 1 发布。基于 [[gpt-3]] 风格自回归 transformer，分辨率低、细节差。
- **2022-04**：DALL-E 2 发布。理解与绘画解耦，画质跨代提升；同期 Stable Diffusion 在路上。
- **2022-08**：Stable Diffusion 开源。latent diffusion 把扩散搬进 VAE 隐空间，开源生态压过闭源 DALL-E 2。
- **2023**：DALL-E 3 发布，主打 prompt 跟随并与 ChatGPT 集成；产品重心转向 DALL-E 3，DALL-E 2 API 仍可用。
- **2024**：Sora、FLUX.1 等把生成从静态图推进到视频与新一代开源图像模型。

回头看：承上是 GLIDE 的扩散条件思路，启下是把 CLIP 拉进生成主战场；prior + decoder 两段式后来被端到端替代，但"CLIP 语义桥"思想被反复化用。

## 学到什么

1. **CLIP 可反向生成**：image embedding 空间本身有生成价值，这是 unCLIP 的核心洞察。
2. **解耦 vs 端到端**：DALL-E 2 拆成 prior + decoder；SD 用一段 cross-attention，工业上更省。
3. **生态重于参数量**：闭源、不可 fine-tune 的大模型，会被开源可定制的较小模型压过。
4. **modality gap 需要桥**：text/image embedding 相邻不同域，prior 就是跨沟的翻译器。

自测：为什么 image variations 跳过 prior？因为输入已是真图，CLIP image embedding 已在图像侧，无需再翻译。

## 延伸阅读

- 论文 PDF：Ramesh et al., "Hierarchical Text-Conditional Image Generation with CLIP Latents"，2022（arXiv:2204.06125）
- 复现代码：lucidrains/DALLE2-pytorch（社区复现，效果和官方有差距）
- 一行跑：huggingface/diffusers 的 UnCLIPPipeline，可直接体验 unCLIP 流程
- 对比阅读：先 [[clip]]，再本篇，再 [[stable-diffusion]]（看 latent diffusion 如何简化）

## 关联

- [[clip]] —— unCLIP 的 CLIP 来源；对比损失与共享 embedding 是读本篇的前提
- [[stable-diffusion]] —— 同期竞品（2022-08 开源），用 latent diffusion 在工业上压过 DALL-E 2
- [[ddpm]] —— decoder / upsampler 所用的扩散去噪骨架
- [[parti-2022]] —— 同期自回归文生图路线，可对照"翻译式"生成

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[ddpm]] —— DDPM — Denoising Diffusion Probabilistic Models
- [[dit]] —— DiT — Diffusion Transformer
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[parti-2022]] —— Parti — 把文生图当作翻译，用自回归 Transformer 一像素接一像素地写
- [[stable-diffusion]] —— Stable Diffusion — 开源文生图引爆

