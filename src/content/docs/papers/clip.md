---
title: CLIP — Contrastive Language-Image Pre-training
来源: 'Radford et al., "Learning Transferable Visual Models From Natural Language Supervision", ICML 2021'
日期: 2026-05-29
分类: 多模态 / 计算机视觉
难度: 中级
---

## 是什么

CLIP 是 OpenAI 2021 年训出来的**双塔模型**——一塔吃图、一塔吃文，把它们映射到同一个向量空间。日常类比：让同一组模特拍 4 亿张照片，每张配一段文字描述，模型的目标是「同一对配对的图和文字应该靠得很近，不配对的应该离得很远」。

训完之后神奇的事情发生了：

- 给一张猫的照片，写两行 prompt：`"a photo of a cat"` 和 `"a photo of a dog"`
- CLIP 算余弦相似度，发现猫的 prompt 和图更近
- **没有训练任何分类头**，分类直接靠"图和哪句文字更近"

这种"不用训练就能分类"的能力叫 **zero-shot transfer**，是 CLIP 最颠覆的一招。

## 为什么重要

不理解 CLIP，下面这些事都没法解释：

- 为什么 Stable Diffusion / DALL-E / Midjourney 都拿 CLIP 文本编码器做 prompt → 图条件——它们是"在 CLIP 学到的图文空间里采样"
- 为什么 GPT-4V / Gemini / Claude 视觉部分基本都是 CLIP-style 双塔对齐——把图变成"LLM 可以读的 token"
- 为什么"互联网级数据 + 简单对比损失"能超过精心设计的 ImageNet 监督——4 亿条粗糙 caption 比 1.4M 条精标更有用
- 为什么过去五年所有 multimodal 系统的"视觉接入口"长得都那么像

## 核心要点

CLIP 的训练流程可以拆成 **三步**：

1. **双塔结构**：图像编码器（ResNet 或 [[vit]]）+ 文本编码器（12 层 Transformer），两塔不共享权重；输出都做 L2 归一化，投到同一向量空间。

2. **对比损失（contrastive loss）**：一个 batch 取 N 张图 + N 段配对文字，算 N×N 相似度矩阵——对角线是匹配（要拉近），非对角线是负样本（要推开）。N 越大效果越好，CLIP 用了 N=32768。

3. **推理变成"找最近邻"**：分类时把每个类别名套进 `"a photo of a {label}"`，过文本编码器得到 N 个文本向量；图过图像编码器得到 1 个向量；选最相似的那条 prompt 当预测。

三步加起来叫 **symmetric InfoNCE**——图找文 + 文找图，两边对称。

## 实践案例

### 案例 1：零样本图像分类

拍一只猫的照片，准备一个类别列表：

```python
classes = ["cat", "dog", "bird"]
prompts = [f"a photo of a {c}" for c in classes]
text_features = clip.encode_text(prompts)
image_features = clip.encode_image(cat_photo)
scores = image_features @ text_features.T
predicted = classes[scores.argmax()]   # → "cat"
```

整套流程**不需要任何训练样本**。换一组类别名（比如换成花的品种、车型），分类器立刻就变了——不用重训、不用标注。

### 案例 2：图文检索

搜 `"sunset over ocean"`：

```python
query = clip.encode_text(["sunset over ocean"])
gallery = clip.encode_image(all_photos)
topk = (gallery @ query.T).topk(10)
```

- 把这段文字过文本编码器，得到一个查询向量
- 把图库里所有图过图像编码器，得到 N 个图像向量
- 算余弦相似度排序，返回 top-K

这是图库搜索（Pinterest、Google Images）背后的同款思路。反过来"以图搜文"也成立。

### 案例 3：Stable Diffusion 用 CLIP 文本编码器

输入 `"a cat in space"`：

```python
text = clip_text_encoder("a cat in space")
image = diffusion_model.sample(condition=text)
```

- CLIP text encoder 把这句话编成 embedding
- 扩散模型把这个 embedding 当条件，从纯噪声反推出一张图

CLIP 自己不会画图，但它**学到的图文空间足够好**，扩散模型只需要在这个空间里做 conditional sampling。没有 CLIP 的对齐空间，文生图至少要再延后两年。

## 踩过的坑

1. **数据偏见**：互联网爬来的图文带文化偏见——`doctor` 关联男性照片显著高于女性，`criminal` 关联深肤色显著高于浅肤色。下游（DALL-E 2、Stable Diffusion）会把偏见放大。没有简单的"训练后修复"，只能从数据源头改。

2. **训练成本巨大**：4 亿对、batch=32768、几千 GPU、几周时间。学术界基本没法独立复现 OpenAI 原版规模——LAION 团队搞 OpenCLIP 用 LAION-400M 复现，仍有 1-2 点 gap。

3. **细粒度任务弱**：区分犬种、鸟种、飞机型号（Boeing 737 vs 747）落后专门训练的模型 10-20 个点。CLIP 学到的是"bag of concepts"，不是"compositional structure"。

4. **Prompt 工程不是免费的**：直接拿 class name 当 prompt（`"cat"`）只有 ~58% ImageNet zero-shot；改成 `"a photo of a cat"` 跳到 ~63%；用 80 个 template ensemble 取平均再涨 3.5 点。所谓 zero-shot 其实在 prompt 设计层面有 ImageNet 的影子。

## 适用 vs 不适用场景

**适用**：
- 零样本图像分类——给一组类别名就能分
- 图文检索——文搜图 / 图搜文
- 多模态系统的"视觉接入口"——LLaVA、GPT-4V、Stable Diffusion 都拿它当视觉编码器
- 中等粒度的视觉理解——自然图像、抽象概念

**不适用**：
- 细粒度任务（犬种 / 鸟种 / 车型）→ 用 SigLIP 或 EVA-CLIP
- 数值推理（"3 只猫" vs "5 只猫"）/ 空间关系（"猫在狗左边"）→ CLIP 不会数也不懂方位
- 长文本理解（text encoder 只支持 76 token）→ 用 Long-CLIP 或直接接 LLM
- 有 OCR 干扰的场景——图里写着 "cat" 字符会被误判成"猫"

## 历史小故事（可跳过）

- **2017-2018**：Transformer 与 [[attention]] 机制问世，NLP 进入"大规模预训练 + 下游迁移"时代
- **2019-2020**：[[bert]] 把这套范式带到极致；同一时期 VirTex / ConVIRT / ICMLM 三篇前置工作开始用 caption 做视觉预训练，但都没 scale 到 web 规模
- **2021-01**：CLIP 论文发布——把 ConVIRT 的对比思路 scale 到 4 亿对，第一次把 zero-shot 做成核心卖点
- **2022**：Stable Diffusion / DALL-E 2 文生图爆发，文本编码器都来自 CLIP
- **2023**：LLaVA / MiniGPT-4 把 CLIP 视觉编码器接到 LLM，多模态 LLM 成为标配
- **2024-2025**：SigLIP / EVA-CLIP / InternVL 优化 CLIP 范式（sigmoid loss / MIM 预训练 / scale 到 6B），但双塔 + 对比的核心结构没变

CLIP 真正的 novelty 不是"对比 image-text"（ConVIRT 已经做了），而是 (a) 4 亿对的数据工程 (b) zero-shot transfer 这套评测范式——它**同时定义了任务和方法**。

## 学到什么

1. **大规模 + 弱监督 > 小规模 + 强监督**——前提是模型容量够大、数据足够多样
2. **对比目标是把任意两个空间拉到一起的通用工具**——视觉-文本可以，文本-代码（CodeBERT）可以，文本-语音（CLAP）也可以
3. **"评估方式"本身可以被发明**——zero-shot transfer 不是预先存在的评测，是 CLIP 同时定义了任务和方法
4. **prompt 是模型可读的接口**——这条直接铺垫了后续 LLM 接到视觉上的所有工作
5. **数据工程被严重低估**——论文用一段话讲清的"500K query 均衡"很可能才是 CLIP 真正的护城河，比 method 本身更难复现

## 延伸阅读

- 论文 PDF：[Radford et al. 2021](https://arxiv.org/abs/2103.00020)（48 页，前 15 页讲方法和数据，后面是大量实验）
- 官方代码：[openai/CLIP](https://github.com/openai/CLIP)（训练代码不公开，只放了推理 + checkpoint）
- 开源复现：[mlfoundations/open_clip](https://github.com/mlfoundations/open_clip)（LAION 数据训练，最接近原版）
- 视频解读：[Yannic Kilcher — CLIP](https://www.youtube.com/watch?v=T9XSU0pKX2E)（论文逐节讲解，1 小时）

## 关联

- [[align-2021]] —— 同样用大规模图文对训练，说明数据规模能压住噪声
- [[dalle-2]] —— 把 CLIP 表征接到扩散生成里，形成文生图路线
- [[stable-diffusion]] —— 依赖文本编码器把 prompt 变成生成条件
- [[llava]] —— 把 CLIP 视觉编码器接到大语言模型上做对话
- [[vit]] —— CLIP 的图像塔常用 Vision Transformer 作为骨架
- [[word2vec]] —— 都是在向量空间里用距离表达语义相近

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[3d-gaussian-splatting]] —— 3D Gaussian Splatting — 用一堆 3D 模糊光斑重建场景
- [[align-2021]] —— ALIGN — 用 18 亿条脏图文对训练，证明数据规模能压住噪声
- [[attention]] —— Attention Is All You Need
- [[autonomous-driving-waymo-2021]] —— Waymo Open Dataset — 自动驾驶感知的共同训练场
- [[blip2-2023]] —— BLIP-2 — 用 188M 小桥接器把冻结的视觉模型和大语言模型拼起来
- [[coca-2022]] —— CoCa — 把对比和生成两种多模态训练目标合到一个模型里
- [[dalle-2]] —— DALL-E 2 — 基于 CLIP + 扩散的图像生成
- [[ddpm]] —— DDPM — Denoising Diffusion Probabilistic Models
- [[dino]] —— DINO — 让视觉模型自己认出物体轮廓
- [[dit]] —— DiT — Diffusion Transformer
- [[e5-2022]] —— E5 — 用海量"自然出现的文本对"训通用 embedding
- [[filip-2021]] —— FILIP — 把 CLIP 的图文对齐细化到 token 级
- [[flamingo-2022]] —— Flamingo — 让冻结的大模型学会看图，几张样例就上手
- [[gemini-1.5-2024]] —— Gemini 1.5 — 百万 token 多模态上下文的工程样板
- [[imagen-2022]] —— Imagen — 文生图真正的引擎是语言模型
- [[llava]] —— LLaVA — 开源多模态对话模型
- [[lomo-modality]] —— LoMo — 把同一句话换成图片也要看懂
- [[mae]] —— MAE — Masked Autoencoders
- [[parti-2022]] —— Parti — 把文生图当作翻译，用自回归 Transformer 一像素接一像素地写
- [[resnet]] —— ResNet — 残差连接
- [[sam]] —— SAM — Segment Anything
- [[stable-diffusion]] —— Stable Diffusion — 开源文生图引爆
- [[transformer]] —— Transformer — 让每个词一次看完整句话
- [[videomla]] —— VideoMLA — 给长视频生成压缩 KV 缓存
- [[vit]] —— ViT — Vision Transformer
- [[whisper-2022]] —— Whisper — 用 68 万小时"野生"音频教会模型听懂全世界
- [[word2vec]] —— Word2Vec — 词向量奠基
- [[immich]] —— Immich — 把家庭照片从别人的云里救回自己机器
- [[milvus]] —— Milvus — 开源向量数据库
- [[opencv]] —— OpenCV — 计算机视觉库
