---
title: ALIGN — 用 18 亿条脏图文对训练，证明数据规模能压住噪声
来源: 'Jia et al., "Scaling Up Visual and Vision-Language Representation Learning With Noisy Text Supervision", ICML 2021'
日期: 2026-05-31
子分类: 模型与训练
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

ALIGN 是 Google 2021 年公开的多模态预训练模型。它做的事和 OpenAI 同年的 [[clip]] 几乎一样：把图片和文字编码到同一个向量空间，使得"狗的图"和"狗"这个词最终落在相近的位置。

差别在材料。CLIP 用 4 亿对经过清洗的图文；ALIGN 直接从 web 抓 **18 亿条 alt-text**（HTML `<img>` 标签里 `alt="..."` 那段描述），几乎不洗。

日常类比：CLIP 像精挑细选 4 万本好书读；ALIGN 像把全镇图书馆 18 万本（含传单广告、错印本）一股脑读完。论文要证明的命题是：**当书的总量足够大时，多读杂书比少读好书赢**。

## 为什么重要

不理解 ALIGN，你看不懂下面几件事：

- 为什么 2022 年后大模型预训练都说"数据 quantity > quality"——这话最早就是 ALIGN 用实验给出的依据
- 为什么 Stable Diffusion / DALL-E 这类生成模型敢用 LAION 这种十亿级脏数据集
- 为什么大公司能用搜索引擎抓的数据训出 SOTA 模型，学界跟不上——不是算法差距，是数据规模差距
- 为什么"双编码器 + 对比损失"成了多模态领域最标准的起手式

## 核心要点

ALIGN 的方法可以拆成 **三件事**：

1. **数据**：从网页 alt-text 抓 18 亿对图文，只做最低限度过滤（去 NSFW、去太短文本）。类比：捞鱼时不挑大小，整网拖上来再说。

2. **架构**：双编码器（dual-encoder）。一塔是图像编码器（EfficientNet），另一塔是文本编码器（BERT）。两塔不交互，各自把输入压成一个 1024 维向量。类比：两个翻译员分别把中英文翻成同一种"中介语"。

3. **损失函数**：对比损失（contrastive loss / InfoNCE）。一个 batch 内，让配对的图文向量靠近、不配对的远离。类比：连连看——同一张图配的 alt-text 是它的"伴儿"，其他全部是干扰项。

三件事加起来，规模拉到 18 亿对，跑出当时 SOTA：

- ImageNet zero-shot 分类 76.4%（比同期 CLIP 的 76.2% 略高）
- Flickr30K 图文检索 R@1 95.3%（CLIP 88.0%）
- COCO 图文检索 R@1 77.0%（CLIP 58.4%）
- 训练用 1024 个 TPUv3 核，跑了 1 个月

## 实践案例

### 案例 1：零样本图像分类

要给一张新图打标签，传统做法要先准备成千张训练图。ALIGN 不用：

```python
# 伪代码
labels = ["dog", "cat", "car", "tree"]
text_vecs = [text_encoder(f"a photo of a {l}") for l in labels]
img_vec = image_encoder(new_image)
predicted_label = labels[argmax([cos(img_vec, t) for t in text_vecs])]
```

**逐部分解释**：

- 把每个候选标签塞模板 `"a photo of a {label}"`，编码成向量
- 新图编码成向量
- 算余弦相似度，最近的那个标签就是预测结果
- 整个过程**没用一张训练图**——这就是 zero-shot

### 案例 2：以图搜图

```python
gallery_vecs = [image_encoder(img) for img in gallery]  # 离线建索引
query_vec = image_encoder(user_uploaded_image)
top_k = sorted(gallery, key=lambda i: -cos(query_vec, gallery_vecs[i]))[:10]
```

把图库每张图都编码成向量存好；用户传一张图，编码后找最相似的。淘宝拍立淘、Pinterest 的视觉搜索都是这个思路。

### 案例 3：跨模态混合查询

```python
# "找一张像这张图但更红的"
query_vec = image_encoder(user_image) + 0.5 * text_encoder("more red")
results = nearest_neighbors(query_vec, gallery_vecs)
```

向量加法在共享空间里有意义——这是 ALIGN 这类对齐表征最神奇的副产品。论文里展示了"图 + 文字微调向量"做检索的例子，效果比纯文本或纯图像查询都好。

## 踩过的坑

1. **噪声 ≠ 随机**：alt-text 虽脏但仍由人写，与图像有弱语义对齐。如果是任意拉两条文本配图，规模再大也学不出来——前提条件是数据本身有信号。

2. **规模收益递减**：实验显示数据从 1 亿到 10 亿提升明显，10 亿到 18 亿就开始平缓，再往上吃不动。"无脑加数据"也有上限。

3. **双编码器没有 cross-attention**：检索时图文独立编码再点积，无法做需要细粒度交互的任务（比如视觉问答、需要看图片局部细节的描述）。后续 FILIP / CoCa 都是为了补这个洞。

4. **评测看着是 zero-shot，迁移要微调**：论文里 ImageNet zero-shot 76.4% 很漂亮，但迁移到细分领域（比如医学影像）仍要在领域数据上微调，不是即插即用。

## 适用 vs 不适用场景

**适用**：

- 大规模图文检索（电商搜索、Pinterest 推荐、相册自动标注）
- zero-shot 分类（标签集会变、不想每次重训）
- 用文本/图像向量做下游任务的特征提取器

**不适用**：

- 需要细粒度图文交互（VQA / 看图说话）→ 用 CoCa 或带 cross-attention 的模型
- 数据量小的领域（小于百万对）→ 双塔学不到东西，用 ViT + 监督微调更实在
- 需要生成图像 → ALIGN 只做表征，不做生成，去看 Stable Diffusion / DALL-E
- 严格隐私/版权场景 → 18 亿网页抓的数据来源说不清，企业落地要查 license

## 历史小故事（可跳过）

- **2020 年**：OpenAI 发 CLIP（4 亿对、有清洗），首次证明对比式图文预训练能 zero-shot
- **2021 年 1 月**：CLIP 论文公开，整个领域意识到"图文对齐"是下一波重点
- **2021 年 2 月**：Google 发 ALIGN，规模拉到 18 亿（CLIP 的 4.5 倍），且数据几乎不洗
- **2021 年下半年**：FILIP（细粒度对齐）/ BASIC（更大规模）/ LiT（锁住图像塔仅训文本塔）相继出，把这条路推到极限
- **2022 年**：CoCa 把对比损失和生成损失合一，CLIP/ALIGN 路线开始向多任务统一收敛
- **2023 年后**：LAION-5B 等开放十亿级数据集出现，学界终于能复现这条路；多模态大模型（GPT-4V / LLaVA）的视觉编码器多数仍是 CLIP/ALIGN 系

## 学到什么

1. **数据规模可以替代精细清洗**——这是 ALIGN 给后续所有大模型时代下的注脚，"先有量再有质"成了 LLM 时代的默认信条
2. **双编码器 + 对比损失** 是多模态对齐的基础范式，简单但能 scale；后续无数变体都是在这个框架上加东西
3. **共享向量空间**让加减法有语义，跨模态混合查询不再是科幻
4. **"规模换质量"有边界**：噪声数据要本身有信号、规模收益会递减、细粒度任务还得另想办法
5. **简单 + 大** 经常打败 **精巧 + 小**——这条经验在后续 GPT-3 / Chinchilla / LLaMA 反复被验证

## 延伸阅读

- 论文 PDF：[ALIGN arXiv 2102.05918](https://arxiv.org/abs/2102.05918)
- 视频讲解：[Yannic Kilcher — ALIGN paper review](https://www.youtube.com/watch?v=cp6m-OhGTzs)（45 分钟逐段讲，含数据收集流程的细节）
- 博客：[Google AI — ALIGN: Scaling Up Visual and Vision-Language Representation Learning](https://research.google/blog/align-scaling-up-visual-and-vision-language-representation-learning-with-noisy-text-supervision/)
- 开源复现：[OpenCLIP](https://github.com/mlfoundations/open_clip) 提供 CLIP/ALIGN 路线的开源训练代码，能在 LAION 上跑出对齐结果
- [[clip]] —— OpenAI 同期工作，用 4 亿对清洗数据，对照阅读最有收获
- [[filip-2021]] —— ALIGN 的下一站，加细粒度 token 级对齐
- [[stable-diffusion]] —— 用类似规模的 LAION 数据集训文生图，验证了 ALIGN 的数据假设

## 关联

- [[clip]] —— 同期对比式图文预训练，差别在数据规模与清洗程度
- [[filip-2021]] —— 在 ALIGN 双塔基础上加细粒度 token 对齐
- [[resnet]] —— 早期视觉骨干，ALIGN 用更新的 EfficientNet 替代它
- [[stable-diffusion]] —— 把 ALIGN 验证的"大规模脏数据"假设用到生成模型
- [[attention]] —— 双塔内部 BERT 文本编码器的核心机制
- [[scaling-laws]] —— ALIGN 是"scaling 万岁"叙事的早期证据之一
- [[llava]] —— 多模态大模型，视觉编码器仍是 CLIP/ALIGN 系

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[biggan-2018]] —— BigGAN — 把 GAN 暴力放大到 ImageNet 512×512
- [[blip2-2023]] —— BLIP-2 — 用 188M 小桥接器把冻结的视觉模型和大语言模型拼起来
- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[coca-2022]] —— CoCa — 把对比和生成两种多模态训练目标合到一个模型里
- [[filip-2021]] —— FILIP — 把 CLIP 的图文对齐细化到 token 级
- [[llava]] —— LLaVA — 开源多模态对话模型
- [[mixup-2018]] —— mixup — 把两张图按比例叠成一张，标签也一起叠
- [[ntk-2018]] —— NTK — 把无限宽的神经网络变成一个可解的核方法
- [[resnet]] —— ResNet — 残差连接
- [[scaling-laws]] —— Scaling Laws — 神经语言模型的缩放规律

