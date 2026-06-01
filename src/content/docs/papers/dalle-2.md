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

给 DALL-E 2 一张图，让它"画一个相似但不一样的版本"。做法：跳过 prior，直接把这张图过 CLIP image encoder 得到 image embedding，再喂 decoder 时用不同的随机噪声起点。

结果：主题相同、构图相似、细节有差异——像同一个画师按一个想法画了两次。

### 案例 3：outpainting / inpainting

- **outpainting**：给一张图，让 AI 往外扩展画布。比如给一张"窗边的猫"，往外扩出整个房间。
- **inpainting**：圈出图里一块，让 AI 重画。比如把照片里的电线杆涂掉，AI 补上后面的天空。

这两个用法靠 decoder 的局部条件能力——把"已知区域"当固定噪声、"未知区域"当待去噪区域，扩散自然填补。

## 踩过的坑

1. **图里的字常乱**：让 DALL-E 2 画"a sign that says HELLO"，输出常是"HEILO"或乱码。原因：CLIP text encoder 学的是"语义"不是"字形"，image embedding 里没有字符级信息。
2. **解剖学错误**：手指 6 根、肢体扭曲、关节方向反——训练数据里这些细节占比小，模型没学透。
3. **偏见复制**：prompt"a CEO"默认出白人男性，"a nurse"默认出女性。训练数据里的统计偏见原样传给生成。
4. **prompt 工程门槛**：加一句"high quality, detailed, 4k, photorealistic"和不加，输出质量差很多。新手写"画一只猫"出图差，老手写"a fluffy orange tabby cat sitting on a windowsill, soft afternoon lighting, photorealistic, 4k"出图好——同一个模型，prompt 决定上限。
5. **空间关系搞不清**："红色立方体在蓝色球的上面"经常方位反、颜色串。原因：CLIP 训练时主要学物体类别和材质，对方位介词不敏感，这个局限原样传到 unCLIP 输出。
6. **数字常错**："5 个苹果"经常画成 4 个或 6 个。生成模型对"数到 5"这种离散计数能力天生差，因为像素空间是连续的，"再多画一个"没有明确信号。

## 历史小故事（可跳过）

- **2021-01**：DALL-E 1 发布。基于 [[gpt-3]] 风格的自回归 transformer，把图压成离散 token 顺序生成。能跑但分辨率低、细节差。
- **2022-04**：DALL-E 2 发布。把"理解"和"绘画"解耦，画质比 DALL-E 1 跨代提升，第一次让大众看到"AI 画画"的潜力。同期 Stable Diffusion 也在路上。
- **2022-08**：Stable Diffusion 开源放出。Rombach 等人用 latent diffusion，把扩散从像素空间搬到 VAE 隐空间，效率高一个量级。开源 + 社区生态压过闭源 DALL-E 2。
- **2023**：DALL-E 3 + Midjourney v5 发布。DALL-E 3 主打"prompt 跟随能力"——和 ChatGPT 集成，让 LLM 帮你改 prompt；DALL-E 2 同年弃用。
- **2024**：Sora 发布（OpenAI 视频生成），FLUX.1 在图像端继续推进。生成模型从静态图扩展到视频。

回头看，DALL-E 2 是"承上启下"的位置：

- **承上**是 GLIDE 的扩散 + 文本条件思路；
- **启下**是把 CLIP 拉进生成主战场。

它的"prior + decoder"两段式没存活下来，但"用 CLIP 做语义桥"的思想被后续模型反复化用。

## 学到什么

1. **CLIP 不只是判别工具**：CLIP 训完的 image embedding 空间本身有价值，可以反向用来生成。这是 unCLIP 最有原创性的洞察。
2. **解耦 vs 端到端的取舍**：DALL-E 2 选解耦（理解 + 翻译 + 绘画三段），后来 Stable Diffusion 选端到端（一段 cross-attention 解决）。两条路都跑通了，工业上端到端更省。
3. **模型规模不是决胜因素**：DALL-E 2 比 SD 大 5 倍，闭源 + 不能 fine-tune，最后被开源 SD 的生态压过。**生态、效率、可定制性比单纯参数量更重要**。
4. **生成模型的"理解力"来自语言模型**：DALL-E 2 的语义理解全靠 CLIP；后来的 Imagen 用 T5 替代 CLIP，发现"文本理解越强、图像质量越高"。下一代图像模型的瓶颈在文本端，不在像素端。
5. **modality gap 是实证发现**：CLIP 配对训练保证"同对距离近"，但没限定"同空间"——image 与 text embedding 实际落在两片相邻但不相同的区域，这个 gap 是 prior 模型存在的全部理由。
6. **多尺度级联是显存陷阱的逃生口**：64×64 → 256×256 → 1024×1024 三段扩散是工程妥协，不是建模需要；今天 latent diffusion 把这个级联压到一段，但分辨率上限仍由 VAE 解码器决定。
7. **prompt 是新型 IDE 的输入语言**：从 GPT-3 文本补全到 DALL-E 2 图像生成，"自然语言指令" 第一次成为创作工具的主输入，prompt 工程从此变成可观测的产品力。
8. **闭源失利于开源不在算法在生态**：DALL-E 2 不开权重 → 不能 fine-tune → 没有 LoRA / ControlNet → 没有社区魔改 → 输给 Stable Diffusion；这条路径在 2024 LLM 端再演一次（开源 Llama vs 闭源 GPT）。
9. **生成质量的 75% 是数据**：架构创新只解释一部分，剩下大头是"用什么数据训"——LAION-5B 的开源让 SD 能复现 DALL-E 2，反过来证明数据 > 架构在生成模型里成立。
10. **bias in / bias out**：训练数据偏见原样传到生成（CEO=白男 / nurse=女），而且因为输出连续可视化，偏见比判别模型更难掩饰——生成模型的伦理债比传统 ML 更可见。
11. **prior + decoder 没存活，CLIP 桥的思想活了**：unCLIP 的两段式管线被 SD 一段式 cross-attention 替代，但"用 CLIP embedding 做条件" 的思想在 ControlNet / IP-Adapter / Imagen 都被复用——架构会被替代，思想会留下。
12. **upsampler 也是扩散**：很多人以为只有"出图主体" 是扩散，其实 64→256 / 256→1024 两步超分也是扩散，每步都跑几十次 forward；这条让 DALL-E 2 慢出名，也提醒"一次出图" 实际是十几个模型串行的总和。
13. **inpainting 是同一个模型的免费 feature**：扩散过程里"已知像素当固定噪声、未知区域当待去噪" 自然支持局部生成——一个能力等价于多个产品形态，只要把推理流程改一改。
14. **统计计数能力的天然短板**：生成模型对"5 个苹果" 这种离散计数能力差，因为像素空间是连续的，"再多画一个" 没有明确信号——这是 CV 模型架构的固有局限，不是规模能解的问题。

**几个自测问题**：

1. 为什么不能直接把 CLIP text embedding 喂给 decoder？答：CLIP 训练只保证配对距离近，没保证两类 embedding 在同一区域；中间有 modality gap，分布不匹配。
2. 为什么 DALL-E 2 要分 64 → 256 → 1024 三段，而不是一次出 1024？答：高分辨率直接扩散显存爆炸；分段让每段只学一个尺度的细节；训练数据里高清图比例小，先在低清图上学构图更省。
3. image variations 为什么跳过 prior？答：输入已经是真实图，CLIP image encoder 出来的 embedding 已经在"图像侧"，不需要 prior 再翻译一遍。

## 延伸阅读

- 论文 PDF：Ramesh et al., "Hierarchical Text-Conditional Image Generation with CLIP Latents"，2022（arXiv:2204.06125）
- 复现代码：lucidrains/DALLE2-pytorch（社区复现，效果和官方有差距）
- 一行跑：huggingface/diffusers 库里有 UnCLIPPipeline，可以直接体验 unCLIP 流程
- 对比阅读：先读 CLIP 论文（理解 embedding 空间），再读本篇（理解 prior + decoder），再读 Stable Diffusion（理解 latent diffusion 怎么把它简化）

## 关联

- CLIP —— unCLIP 的"CLIP"来源；理解 CLIP 的对比损失和共享 embedding 空间是看本篇的前提
- Stable Diffusion —— 同期竞品（2022-08 开源），用 latent diffusion 在工业上压过 DALL-E 2
- Imagen —— Google 同期作品（2022-05），把 CLIP text encoder 换成 T5，证明文本理解越强图像质量越好
- ControlNet / IP-Adapter —— 2023 年后续应用，沿用"用 CLIP image embedding 做条件"的思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[ddpm]] —— DDPM — Denoising Diffusion Probabilistic Models
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[parti-2022]] —— Parti — 把文生图当作翻译，用自回归 Transformer 一像素接一像素地写
- [[stable-diffusion]] —— Stable Diffusion — 开源文生图引爆

