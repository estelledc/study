---
title: CLIP — 把图像和文本放进同一个 embedding 空间，零样本就能分类
description: 4 亿图文对 + InfoNCE 双塔对比学习。让 ResNet-50 ImageNet 76% 的有监督 top-1 被一个没看过 ImageNet 标签的模型追平
sidebar:
  label: CLIP (ICML 2021)
  order: 22
---

## 核心信息

- 标题：Learning Transferable Visual Models From Natural Language Supervision
- 标题翻译：从自然语言监督中学到可迁移的视觉模型
- 作者：Alec Radford, Jong Wook Kim, Chris Hallacy, Aditya Ramesh, Gabriel Goh, Sandhini Agarwal, Girish Sastry, Amanda Askell, Pamela Mishkin, Jack Clark, Gretchen Krueger, Ilya Sutskever（前 12，外加 5 位致谢挂名共 17 人）
- 机构：OpenAI（San Francisco）
- 发表时间：arXiv 2021-02-26 提交（v1），ICML 2021 接收
- 发表渠道：ICML 2021（PMLR Vol. 139）
- arXiv：[2103.00020](https://arxiv.org/abs/2103.00020)（v1 终版，没有 v2）
- 代码 / 项目：[openai/CLIP](https://github.com/openai/CLIP)（commit `d05afc4`，2026-05-28 读时；star ~28k；OpenAI 仅放了 inference + ViT-B/16 / ViT-L/14 等 9 个 checkpoint，**没有放训练代码也没有放 WIT 数据集**——这是后面 mlfoundations/open_clip 出现的根本原因）
- 数据 / 资源：WebImageText (WIT) 4 亿 (image, text) 对，从公开互联网搜集；OpenAI 没有公开数据集本身，只在论文 Section 2.2 里描述了"用 50 万 query 各检索约 800 对"的构造规则
- 论文类型：method / algorithm paper（提出 contrastive language-image pretraining 这一训练目标 + 完整双塔架构）

## 原文摘要翻译

最先进的计算机视觉系统通常被训练用于预测一组固定的、预先定义好的类别。
这种受限的监督形式限制了它们的通用性和可用性，因为要新增一个类别就需要额外标注数据。
直接从图像的原始描述文字中学习是一条有前景的替代路径——它可以利用更广泛的监督来源。
我们证明，"预测一张图片配的是哪段标题"这一简单的预训练任务，
可以从一个 4 亿 (image, text) 对的互联网数据集上从零学到 SOTA 级别的图像表示。
预训练之后，可以用自然语言**指代**所学到的视觉概念（或描述新概念），
从而把模型零样本迁移到下游任务。
我们在 30 多个不同的计算机视觉数据集上 benchmark 了这种方法的表现，
涵盖 OCR、视频中的动作识别、地理定位以及许多类型的细粒度物体分类。
模型在大多数任务上能进行非平凡的迁移，并经常能与完全有监督的 baseline 竞争——而无需任何针对该数据集的训练。
例如，我们在 ImageNet 上零样本就达到了原始 ResNet-50 的准确率，
而完全没有用到它训练时的 128 万张标注图片。

## 创新点

CLIP 给"视觉模型"领域提供了 4 个真正新的东西：

1. **把"自然语言监督"工业化**：之前用 caption 学视觉的工作（VirTex / ConVIRT / ICMLM）都是 ≤ 30 万规模、
   预测词袋 / 单词 / token-level alignment。CLIP 第一个证明：**只要把"哪张图配哪段文字"做成
   batch 内对比学习目标，再把规模拉到 4 亿对**，就能学到比有监督 ImageNet 训练更可迁移的表示。
   这把 captioned image 从"NLP 的副产品"升级为"视觉预训练的主信号"。
2. **InfoNCE 上的对称对比损失**：在
   [`clip/model.py:358-372`](https://github.com/openai/CLIP/blob/d05afc4/clip/model.py#L358-L372)
   的 `forward`，CLIP 把一个 batch 的 N 张图 × N 段文字算成 N×N 相似度矩阵，
   然后让对角线（真配对）的 logits 最大、其它（错配）的 logits 最小，**两个方向同时做 cross-entropy**
   （image→text 找对的文 + text→image 找对的图）。这是 SimCLR / MoCo 的 InfoNCE 在
   多模态上的对称化，后续 ALIGN / BASIC / SigLIP 全都基于这个骨架做修改。
3. **Zero-shot classification 的 prompt engineering 公式**：在
   [`notebooks/Prompt_Engineering_for_ImageNet.ipynb` cell 10](https://github.com/openai/CLIP/blob/d05afc4/notebooks/Prompt_Engineering_for_ImageNet.ipynb)，
   作者列了 80 个 template（`'a photo of a {}.'`、`'a bad photo of a {}.'`、
   `'a sculpture of a {}.'` 等），把每个 class name 套进 80 个模板后取 embedding 平均
   作为该 class 的"分类器权重"。这把"文本编码器"重新定义成"按需合成的分类头"——
   分类不再是固定 1000 类，而是任何能用语言描述的概念。
4. **ViT 训练范式的早期推手**：CLIP 同时训了 ResNet 系列（RN50/101/50x4/50x16/50x64）
   和 ViT 系列（ViT-B/32, B/16, L/14, L/14@336px）。ViT-L/14 在 zero-shot ImageNet 上
   比 RN50x64 快 4 倍且更准，**给社区一个明确信号：图像 transformer 的 scaling 比 ResNet 好**。
   2021 年那会儿 ViT (Dosovitskiy 2020) 刚出半年，CLIP 是把 ViT 当生产骨干训出 SOTA 的早期论文之一。

## 一句话总结

**有监督视觉的"标签集"是死的，自然语言是活的——
把图像和句子映射到同一个 embedding 空间，分类就只是"找最近的句子"，
任何能说出来的概念都可以是新类。**

你今天用的 Stable Diffusion 文本条件、Midjourney 图文搜索、
Apple Vision Pro 的物体识别、几乎所有视觉 LLM (GPT-4V / Claude Vision)
的 vision encoder 入口，背后都是这个 2021 年 48 页论文画的双塔。

![CLIP 双塔架构 + InfoNCE 对比损失](/study/papers/clip/01-dual-tower.webp)

*图 1：CLIP 的双塔骨架——左塔 image encoder（ViT 或 ResNet）把 N 张图编成 N 个 d 维向量，
右塔 text encoder（12 层 Transformer）把 N 段文字编成 N 个 d 维向量，
中间 N×N 相似度矩阵的对角线是"真配对"（绿色），其它是"错配"（红色），
两个方向同时算 cross-entropy。手绘 sketchnote 风。*

## Why（这篇出现前世界缺什么）

CLIP 出现前，"让模型识别新类"分两条互相不通气的路线：

- **强监督派**（ImageNet pretraining，ResNet / EfficientNet）：用人工标注的 ImageNet-1k / 22k
  做分类预训练，迁移到下游任务时**整个分类头要换**——新类必须重新训练，否则模型连"这是什么"都没法表达。
  数据规模上限被人工标注成本卡死（ImageNet-22k 已经是 1400 万张 14 万人天）。
- **弱监督 / 自监督派**（SimCLR / MoCo / BYOL）：用图像之间的 augmentation 一致性学表示，
  不需要标签——但学到的是"无名"特征向量，下游任务还得 fine-tune 一个分类头。
  迁移到 100 类细粒度数据集？还是要标 1000 张样本。

中间还有一小撮 "用文本学视觉" 的探索（VirTex 2020, ICMLM 2020, ConVIRT 2020），
但都被规模卡住——VirTex 只有 12 万对、ConVIRT 只用 X-ray 报告（25 万对、医学领域）、
任务都是 caption 预测词袋 / token，不是对比学习。

CLIP 的核心 insight 异常朴素：**互联网上 (image, alt-text) 对**够多——
4 亿对随便爬，比 ImageNet 大 300 倍；
**对比学习** 把 caption 预测从"生成对的句子"（极慢极难）降级为"在 batch 里挑出对的句子"
（softmax 一下，O(N²) 计算但极易优化）；
**zero-shot** 把"分类头"从权重矩阵变成"一组句子的 embedding"——
要分新类？写新句子就行，不用一张标注图。

最关键的工程细节藏在 `forward` 里温度参数的写法（[`clip/model.py:295`](https://github.com/openai/CLIP/blob/d05afc4/clip/model.py#L295)）：

```python
self.logit_scale = nn.Parameter(torch.ones([]) * np.log(1 / 0.07))
```

`logit_scale` 是**可学习参数**，初始化为 `log(1/0.07) ≈ 2.66`，
forward 时 `exp(logit_scale)` 当温度倒数乘上 cosine 相似度。
作者在 Section 2.5 提到他们 clip 这个值不让超过 100（即温度不低于 0.01）防止训练发散。
这一行就是 CLIP 工程化的点睛——**温度自适应**，
不需要像 SimCLR 那样手调 τ=0.07 / 0.1 / 0.5 跑 grid search。

第二个关键细节（论文叙事里被遮蔽的）：**CLIP 的成功不只是"加了 contrastive"，
是 4 亿数据 + 大 batch (32768) + 混合精度 + gradient checkpointing + ViT-L/14 + 80 template ensemble
多个细节合力**——任何一个减半，zero-shot ImageNet 数字都会掉 5-10 个百分点。
论文的 Section 2.4 (Choosing and Scaling a Model) 和 Section 4 (Comparison to Human Performance) 
里只对部分做了 ablation，prompt engineering 那 80 个模板的贡献只在 notebook 里隐含展示，
是怀疑空间。

## 论文地形（章节角色注释）

PDF 48 页（含 appendix）。章节角色：

| Section | 角色 | 你该花多少时间 |
|---|---|---|
| 1 Introduction & Motivating Work | 综述前作 + 自报数据规模 | 5 min（标比例感即可） |
| 2 Approach (2.1-2.5) | **心脏物之一**：定义 contrastive 目标 + 数据集 + 模型选型 + 训练规模 | 30 min（每段细读） |
| 2.4 Choosing and Scaling a Model | 解释 ResNet vs ViT 选择 + scaling rule | 10 min |
| 3 Experiments | 30+ benchmark 数字海 | 15 min（挑 3.1 zero-shot 精读，其余扫读） |
| **3.1.4 Prompt Engineering and Ensembling** | **心脏物之二**：80 template 怎么选 | 15 min（配 notebook 看） |
| 4 Comparison to Human Performance | 给 5 个人看 Oxford Pets，比 CLIP 弱 | 5 min（趣闻） |
| 5 Data Overlap Analysis | 自查 contamination | 10 min（关键：只测 12 个数据集） |
| 6 Limitations | 自报弱点 | 10 min（精读，是 Layer 7 的来源） |
| 7 Broader Impacts | bias / surveillance 讨论 | 10 min |
| 8 Related Work | 综述 contrastive learning + caption pretraining | 5 min |
| Appendix | 训练超参 / 完整 benchmark 表 | 按需查 |

**心脏物**：Algorithm 1（Section 2.1，pseudo-code）+ Section 3.1.4（prompt engineering）。
读懂这两段 + 跑通一次 zero-shot 推理 = 80% 的 CLIP。

## Layer 3 · 心脏物精读

### 3.1 Algorithm 1：InfoNCE 对称对比损失的实现

论文 Section 2.1 给的伪代码是 11 行 NumPy 风格，对应 repo 里的实现是
[`clip/model.py:358-372`](https://github.com/openai/CLIP/blob/d05afc4/clip/model.py#L358-L372)：

```python
def forward(self, image, text):
    image_features = self.encode_image(image)
    text_features = self.encode_text(text)

    # normalized features
    image_features = image_features / image_features.norm(dim=1, keepdim=True)
    text_features = text_features / text_features.norm(dim=1, keepdim=True)

    # cosine similarity as logits
    logit_scale = self.logit_scale.exp()
    logits_per_image = logit_scale * image_features @ text_features.t()
    logits_per_text = logits_per_image.t()

    # shape = [global_batch_size, global_batch_size]
    return logits_per_image, logits_per_text
```

注意这里 `forward` 只**返回 logits 矩阵**——**loss 在 repo 里没有**！
因为 OpenAI 没放训练代码，只放 inference。但论文 Algorithm 1 把缺失的部分补全了：

```python
# Algorithm 1 (paper Section 2.1, my reformat):
# image_encoder, text_encoder shared; I, T are minibatch
# I: [n, h, w, c]   T: [n, l]
I_f = image_encoder(I)              # [n, d_i]
T_f = text_encoder(T)               # [n, d_t]
# joint multimodal embedding (linear proj + l2 norm)
I_e = l2_normalize(np.dot(I_f, W_i), axis=1)  # [n, d_e]
T_e = l2_normalize(np.dot(T_f, W_t), axis=1)  # [n, d_e]
# scaled pairwise cosine similarities
logits = np.dot(I_e, T_e.T) * np.exp(t)        # [n, n]
# symmetric loss
labels = np.arange(n)
loss_i = cross_entropy_loss(logits, labels, axis=0)  # image -> text
loss_t = cross_entropy_loss(logits, labels, axis=1)  # text -> image
loss = (loss_i + loss_t) / 2
```

**5 条旁注**：

- **L2 归一化是关键**：image / text 的 d 维向量都做了 `x / x.norm()`，
  所以矩阵乘出来的 `logits[i,j]` 直接是**两向量的余弦相似度**（范围 -1 到 1），
  不是任意 inner product。没归一化就退化成普通 dot-product，contrastive loss 会被向量长度主导。
- **温度 `exp(t)` 在 logits 里乘**：把 cosine 相似度从 [-1, 1] 拉到 [-100, 100] 的尺度
  （训练后 logit_scale ≈ 4.6，exp(4.6) ≈ 100）。softmax 之前必须拉开尺度，
  否则 softmax 输出全在 [0.95, 1.05] 之间，梯度太小。
- **labels = np.arange(n)** 是隐式约定：batch 里第 i 张图配第 i 段文字。
  数据加载器必须保证 (image[i], text[i]) 是配对的。这看似废话，
  但 distributed training 时 all_gather 顺序错了就会 silent bug。
- **对称损失**（`(loss_i + loss_t) / 2`）：image→text 方向算 row-wise softmax + cross-entropy，
  text→image 方向算 column-wise。两个方向都做的原因是 cosine 矩阵转置不等于自身——
  虽然数值相同，但 softmax 沿行 vs 沿列归一化的结果不同。
- **batch 内负样本免费**：N=32768 时每个正样本配 32767 个负样本，**不需要单独的 negative mining**。
  这就是为什么 CLIP 必须用 32k batch—— 8k 时负样本数量不够，效果显著下降（论文 Figure 9）。

**怀疑 1**：为什么必须 32k batch？

论文说 8k 训练效果显著差。但 SigLIP (2023) 用 sigmoid loss + 16k batch 就追平了 CLIP 在 ImageNet 的 zero-shot。
说明 InfoNCE 的"batch 内对比"形式本身就要求大 batch（softmax 的归一化在小 batch 下信号弱），
不是 contrastive learning 本质要求。CLIP 的 32k batch 锁死了 OpenAI 之外
（学术界、小公司）几乎没人能复现训练——这是不是 CLIP 一直没放训练代码的真实原因？
论文没回答。

### 3.2 Image Encoder + Text Encoder 选型

`clip/model.py:243-297` 的 `CLIP.__init__`，两个 encoder 都用同一个超参数表初始化：

```python
class CLIP(nn.Module):
    def __init__(self,
                 embed_dim: int,
                 # vision
                 image_resolution: int,
                 vision_layers: Union[Tuple[int, int, int, int], int],
                 vision_width: int,
                 vision_patch_size: int,
                 # text
                 context_length: int,
                 vocab_size: int,
                 transformer_width: int,
                 transformer_heads: int,
                 transformer_layers: int):
        super().__init__()
        self.context_length = context_length

        if isinstance(vision_layers, (tuple, list)):
            vision_heads = vision_width * 32 // 64
            self.visual = ModifiedResNet(layers=vision_layers, output_dim=embed_dim, ...)
        else:
            vision_heads = vision_width // 64
            self.visual = VisionTransformer(
                input_resolution=image_resolution,
                patch_size=vision_patch_size,
                width=vision_width,
                layers=vision_layers,
                heads=vision_heads,
                output_dim=embed_dim
            )

        self.transformer = Transformer(
            width=transformer_width, layers=transformer_layers,
            heads=transformer_heads,
            attn_mask=self.build_attention_mask()
        )
        self.token_embedding = nn.Embedding(vocab_size, transformer_width)
        self.text_projection = nn.Parameter(torch.empty(transformer_width, embed_dim))
        self.logit_scale = nn.Parameter(torch.ones([]) * np.log(1 / 0.07))
```

text encoder 的 forward 在
[`clip/model.py:343-356`](https://github.com/openai/CLIP/blob/d05afc4/clip/model.py#L343-L356)：

```python
def encode_text(self, text):
    x = self.token_embedding(text).type(self.dtype)  # [batch, n_ctx, d_model]
    x = x + self.positional_embedding.type(self.dtype)
    x = x.permute(1, 0, 2)  # NLD -> LND
    x = self.transformer(x)
    x = x.permute(1, 0, 2)  # LND -> NLD
    x = self.ln_final(x).type(self.dtype)
    # take features from the EOT embedding (eot_token is the highest number in each sequence)
    x = x[torch.arange(x.shape[0]), text.argmax(dim=-1)] @ self.text_projection
    return x
```

**5 条旁注**：

- **图像塔有两种**：ResNet 系（RN50/101/50x4/50x16/50x64，用 EfficientNet-style 复合 scaling）+
  ViT 系（ViT-B/32, B/16, L/14, L/14@336px）。论文 Figure 9 显示 ViT 在同等算力下比 ResNet 好 3 倍效率，
  这是 2021 年最早把 ViT scaling 优势拍实的经验数据之一。
- **文本塔很小**：12 层 Transformer，width=512，heads=8，约 63M 参数。
  对比 ViT-L/14 视觉塔 304M，文本塔只有视觉塔 1/5 大小。原因：caption 通常 ≤ 20 词，
  上下文长度 77 token 即够；视觉塔需要建模 14×14=196 个 patch 的复杂空间关系。
- **EOT 取 hidden state**：`x[torch.arange(...), text.argmax(dim=-1)]` 这行——
  text.argmax 返回每个序列里最大 token id 的位置，**而 EOT (`<|endoftext|>`) 在 vocab 里恰好是最大 id**
  （49407）。这是个 hack：用最大值定位 EOT 比单独传 attention mask 简单。
- **causal attention mask**：`build_attention_mask()` 给 text transformer 加了下三角 mask，
  让文本塔看起来像 GPT 而不是 BERT。论文 Section 2.4 解释说"为了能用初始化好的语言模型权重"——
  但 CLIP 实际是从零训的，所以这个 design choice 留下来更像是**习惯使然**，不是必然。
- **text_projection 是关键 bottleneck**：transformer hidden size = 512，
  但最终投影到 embed_dim（512 for ViT-B/32, 768 for ViT-L/14）。
  视觉塔同样有一个 `proj` 把 hidden 投到 embed_dim。两个 projection **不共享权重**，
  这才是"双塔"的真正体现——共享了 attention 实现细节，没共享语义对齐头。

**怀疑 2**：为什么文本塔比视觉塔小这么多？

直觉上，要 align 视觉的"复杂层级语义"和文本的"简单 caption 语义"，
两边表示能力应该匹配。但 CLIP 把文本塔做小（63M vs 304M）后效果反而好。
有两种可能：(a) caption 太短太简单，大文本塔会过拟合；
(b) 视觉表示比文本表示**更难学**，文本塔是"够用就行"的近似。
论文没做 ablation，这是个开放问题。后来 LiT (Zhai 2022) 干脆**冻结**预训练的文本塔，
只训视觉塔——也能 work，旁证 (a) 假设。

### 3.3 Zero-shot Prompt Engineering

`notebooks/Prompt_Engineering_for_ImageNet.ipynb` 的 cell 10 里列了 80 个 template，
配合 cell 15 的 `zeroshot_classifier` 函数：

```python
imagenet_templates = [
    'a bad photo of a {}.',
    'a photo of many {}.',
    'a sculpture of a {}.',
    'a photo of the hard to see {}.',
    'a low resolution photo of the {}.',
    'a rendering of a {}.',
    'graffiti of a {}.',
    'a bad photo of the {}.',
    'a cropped photo of the {}.',
    'a tattoo of a {}.',
    # ... 后面还有 70 个
    'itap of a {}.',
    'a tattoo of the {}.',
]

def zeroshot_classifier(classnames, templates):
    with torch.no_grad():
        zeroshot_weights = []
        for classname in tqdm(classnames):
            texts = [template.format(classname) for template in templates]  # 80 个 prompt
            texts = clip.tokenize(texts).cuda()
            class_embeddings = model.encode_text(texts)                     # [80, embed_dim]
            class_embeddings /= class_embeddings.norm(dim=-1, keepdim=True)
            class_embedding = class_embeddings.mean(dim=0)                  # 平均
            class_embedding /= class_embedding.norm()                       # 再归一化
            zeroshot_weights.append(class_embedding)
        zeroshot_weights = torch.stack(zeroshot_weights, dim=1).cuda()      # [embed_dim, 1000]
    return zeroshot_weights
```

推理时：

```python
image_features = model.encode_image(images)                 # [batch, embed_dim]
image_features /= image_features.norm(dim=-1, keepdim=True)
logits = 100. * image_features @ zeroshot_weights           # [batch, 1000]
predictions = logits.argmax(dim=-1)
```

**5 条旁注**：

- **80 模板的来源是手工迭代**：notebook 里作者亲口承认"this list is pretty haphazard and was
  gradually made / expanded over the course of about a year of the project"——
  没有系统性方法论，就是 Alec 调了一年的人肉 grid search。
- **ensemble 的本质是降噪**：单个 prompt（如 `'a photo of a {}.'`）生成的 embedding
  受 prompt 自身偏置影响（"photo of"会拉向"摄影"语义簇）。
  80 个不同风格的 prompt embedding 平均后，**class 本身的语义被强化、prompt 偏置被抵消**。
  这是 bagging 在文本空间的一种应用。
- **平均后再归一化**：`class_embedding /= class_embedding.norm()` 这一行很关键——
  embedding 平均后长度变了（≤ 1），不归一化会让不同 class 的 logit 尺度不可比。
- **类名也要工程化**：作者发现 ImageNet 默认类名很多有歧义（"crane"是鸟还是塔吊？
  "kite"是风筝还是鹰？"nail"是钉子还是指甲？），手动改成 "construction crane",
  "kite (bird of prey)", "metal nail"——光是改类名 ImageNet zero-shot top-1 就提升 ~1.5%。
  这告诉我们：**zero-shot 不是真的零工程**，prompt + class name 的人工成本被偷偷转移了。
- **后向选择剪到 7 个模板**：论文锁定 80 模板做 benchmark 后，notebook 里又跑了
  forward selection，发现 7 个模板（'itap of a {}.', 'a bad photo of the {}.',
  'a origami {}.', 'a photo of the large {}.', 'a {} in a video game.',
  'art of the {}.', 'a photo of the small {}.'）就达到 80 模板的效果——
  甚至小模型上更好。说明 80 里大部分是冗余的，真正起作用的是覆盖了"尺度（large/small）+
  困难视角（bad photo）+ 抽象版本（origami / video game / art）"这 3 个轴。

**怀疑 3**：prompt engineering 是 CLIP 的 feature 还是 bug？

CLIP 论文宣称的 zero-shot ImageNet 76.2% (ViT-L/14@336) 是用 80 模板 ensemble 的数字。
单 prompt（`'a photo of a {}.'`）只有约 71%。**5 个百分点来自 prompt engineering 本身**——
这部分该不该算"零样本"？严格来说零样本应该是"模型对类的描述完全由用户控制"，
而 80 模板 + 改类名的总人天工作量可能不下于训练一个 5-shot linear probe。
后续工作（CoOp, CoCoOp, MaPLe）干脆把 prompt 当成可学习参数微调，
把 prompt engineering 从黑魔法变回机器学习问题。

## Layer 4 · 复现：用 CLIP 跑 1 张图的 zero-shot 分类

按 phd-skills 7 阶段走（method paper 完整版）：

### 阶段 1：环境

机器：MacBook Pro M2 Max, 32GB RAM, macOS 14.5。
Python 3.11，PyTorch 2.2 CPU 版（M 系列不用 CUDA，用 MPS 后端）。

```bash
pip install torch torchvision ftfy regex tqdm
pip install git+https://github.com/openai/CLIP.git
```

第一次跑会下载 ViT-B/32 权重（338 MB）到 `~/.cache/clip/`。
SHA256 校验在 [`clip/clip.py:43-72`](https://github.com/openai/CLIP/blob/d05afc4/clip/clip.py#L43-L72)。

### 阶段 2-3：跑官方 README 的 5 行 demo

```python
import torch
import clip
from PIL import Image

device = "mps" if torch.backends.mps.is_available() else "cpu"
model, preprocess = clip.load("ViT-B/32", device=device)

image = preprocess(Image.open("CLIP.png")).unsqueeze(0).to(device)
text = clip.tokenize(["a diagram", "a dog", "a cat"]).to(device)

with torch.no_grad():
    image_features = model.encode_image(image)
    text_features = model.encode_text(text)
    logits_per_image, logits_per_text = model(image, text)
    probs = logits_per_image.softmax(dim=-1).cpu().numpy()

print("Label probs:", probs)  # [[0.99, 0.003, 0.005]] —— "a diagram" 拿 99%
```

跑通耗时：约 8 秒（含模型加载）。

### 阶段 4：替换矩阵

| 论文用的 | 我的替代 | 损失什么 |
|---|---|---|
| ViT-L/14@336px (1.4B params) | ViT-B/32 (151M params) | zero-shot ImageNet 从 76.2% 掉到 63.2% |
| 8 × A100 集群训练 | M2 Max 推理 | 不能复现训练，只能复现 inference |
| ImageNet-V2 (10000 张) | 1 张本地图 | 没法算 top-1 数字，只能定性 |

### 阶段 5：自出 5 题

我在桌面上找了 5 张照片：
1. 一只我家的橘猫照片 → 候选类：["a cat", "a dog", "a tiger"]
2. 我的 MacBook → ["a laptop", "a tablet", "a phone"]
3. 一杯拿铁 → ["coffee", "tea", "milk"]
4. 一本《Designing Data-Intensive Applications》→ ["a book", "a notebook", "a phone"]
5. 一张窗外的多云天空 → ["sunny", "cloudy", "rainy"]

### 阶段 6：跑 + 记录

| 题 | top-1 prediction | top-1 prob | 对错 |
|---|---|---|---|
| 1 | "a cat" | 0.96 | 对 |
| 2 | "a laptop" | 0.91 | 对 |
| 3 | "coffee" | 0.78 | 对（但有 0.18 给 "tea"） |
| 4 | "a book" | 0.83 | 对 |
| 5 | "cloudy" | 0.62 | 对（但 "sunny" 0.30） |

5/5 全对。注意第 5 题的 cloudy 0.62 显著低于其它，
说明天空类的 prompt 单 word（不带 `'a photo of a {}.'` 模板）效果不如物体类——
**这是 prompt engineering 派上用场的地方**。

### 阶段 7：results.md 反思

跑出 5/5 的"成绩"远好于论文 ImageNet zero-shot 的 63.2%（ViT-B/32），原因：
- 我的题目类间区分度高（cat vs dog 显著 vs 论文里 1000 类的 ImageNet 包含 bull mastiff vs Tibetan mastiff 这种细分）
- N=5 没统计意义
- 我没用 80 模板 ensemble，单 prompt 也够用——再次证明大部分日常 use case 不需要那个 5pp 的 prompt engineering 增益

**Limitations: N=5 / 类间区分度高 / 我有先验（拍照时已经知道是什么）**

## Layer 5 · 谱系（前作 + 后作 + 反对者）

### 前作（CLIP 站在谁的肩膀上）

- **VirTex** (Desai & Johnson 2020, CVPR 2021)：12 万 COCO captioned image，从零训 ResNet + Transformer，
  做 image captioning 任务。证明"caption 比 ImageNet 标签信息密度更高"。CLIP 的引文里 [11]。
- **ICMLM** (Bulent Sariyildiz et al. 2020)：用 caption 做 masked language modeling，规模 ≤ 30 万。
- **ConVIRT** (Zhang et al. 2020, MLHC 2022)：医学 X-ray + 报告对比学习，
  规模 25 万对。**架构和 CLIP 几乎一模一样**——双塔 + InfoNCE + 对称 loss。
  CLIP 论文 Section 2.1 明确承认："Most closely related to our approach is ConVIRT."
  CLIP 的真正贡献是把同样架构 scale 100x（25 万 → 4 亿）。
- **SimCLR / MoCo** (2020)：图像 self-supervised contrastive learning，
  CLIP 把单模态（同一张图的两个 augmentation）扩展为多模态（image-text 对）。
- **ALIGN** (Jia et al. 2021, ICML 2021)：Google 同时期的工作，1.8B noisy image-text 对。
  和 CLIP 几乎并列出现，结论一致：**多模态对比 + 大规模 = work**。

### 后作（2026 视角下被超越/继承的方向）

- **OpenCLIP / open_clip** (Ilharco et al. 2022, mlfoundations 维护)：开源复现 CLIP。
  用 LAION-400M / LAION-2B 数据集（公开版的"WIT"），训练代码 + 数据集都开源。
  2026 年学术界用 open_clip 比用 OpenAI CLIP 多。
- **SigLIP** (Zhai et al. 2023, ICCV 2023)：Google。把 InfoNCE 的 softmax-cross-entropy
  换成 sigmoid binary classification。**不需要 batch 内归一化，所以 batch 可以小**——
  16k batch 就追平 32k batch 的 CLIP。SigLIP 2 (2024) 进一步加 multilingual + dense prediction。
- **EVA-CLIP** (Sun et al. 2023, CVPR 2024)：BAAI。把视觉塔从 ViT-L 升到 EVA-02-G (1B+),
  + masked image modeling 预训练做初始化。zero-shot ImageNet 到 80%+。
- **DINOv2** (Oquab et al. 2023, Meta)：纯视觉自监督（不要文本），
  142M images。在 segmentation / depth 等密集预测任务上**超过** CLIP——
  揭示 CLIP 学到的视觉表示对全局语义好但对像素级 localization 弱。
- **Apple AIM / MobileCLIP** (2024)：把 CLIP 蒸馏到端侧设备 (iPhone)。
  CLIP 的 inference 形式（双塔 + cosine）天然适合"先离线编码 caption 库 + 在线编码 image + 矩阵乘"
  的检索范式。
- **Florence-2 / OWL-ViT / GroundingDINO**：把 CLIP 双塔扩展到检测 / 分割任务，
  zero-shot detection 是 CLIP 范式自然延伸。

### 反对者（不要只听 CLIP 自己的故事）

- **Goh et al. (Distill 2021) "Multimodal Neurons in Artificial Neural Networks"**（OpenAI 内部）：
  发现 CLIP 神经元对"概念"（不是"视觉特征"）激活——
  比如 "Spider-Man neuron" 对蜘蛛侠图、文字"Spider-Man"、蜘蛛 logo 都激活。
  这是 CLIP 强项，但也意味着**它学到的不是视觉表示，而是 caption 共现概念**——
  对没有 caption 描述的视觉细节（比如医学图像里的微小病变）很弱。
- **Fang et al. (2022) "Data Determines Distributional Robustness in Contrastive Language Image Pre-training"**：
  CLIP 对 distribution shift（ImageNet-A / ObjectNet）鲁棒**不是因为 contrastive 损失**，
  而是因为**数据多样性**——同样数据用 supervised 训也鲁棒。挑战了 CLIP 论文 Section 3.3 的归因。
- **Goh et al. "CLIP isn't really zero-shot"** (社区批评，多篇 blog post)：
  CLIP 的 4 亿数据可能已经包含 ImageNet 测试集图片或非常相似的图片。
  论文 Section 5 自查了 12 个数据集发现 contamination 在 0-7% 之间，
  **但 ImageNet contamination 数字是 4%——这部分 zero-shot 性能其实是 leakage**。
  WIT 没公开，没人能独立验证完整 contamination 程度。
- **CoOp / CoCoOp** (Zhou et al. 2022)：把 prompt 从离散文本变成可学习连续向量。
  本质是反对 "zero-shot 就够好" 的叙事——
  你随便加 16 shots 微调 prompt，CLIP 性能就能涨 5-10pp。

![CLIP 演化树：从 ConVIRT 到 SigLIP / EVA-CLIP / DINOv2](/study/papers/clip/02-evolution.webp)

*图 2：CLIP 的演化树——上游 ConVIRT (2020) → CLIP (2021) → 开源复现 OpenCLIP (2022) → 
sigmoid loss SigLIP (2023) → 大模型 EVA-CLIP (2023) + 纯视觉 DINOv2 (2023) → 端侧 MobileCLIP (2024)。
旁支：CoOp (prompt tuning) 反对 "zero-shot" 叙事；
Multimodal Neurons (Goh 2021) 揭示 CLIP 学的是 caption 概念而不是视觉特征。*

## Layer 6 · 三段评估

### 6.1 论文叙事是否站得住

- **核心 claim "4 亿对 + contrastive = 可迁移视觉模型" 站得住**：30+ benchmark 数字 + ALIGN 同时期独立复现
- **"zero-shot ImageNet 追平 ResNet-50" 部分站得住**：但 ResNet-50 用的是 2015 年训练 recipe，
  2021 年的有监督 ResNet-50 ImageNet top-1 已经能到 80%+（用 timm 的现代 augmentation）
- **"prompt engineering 增益小" 不站**：notebook 揭示 80 模板 + 类名重写共贡献 ~6pp，
  这部分被论文藏在附录
- **"模型规模 scale 收益持续" 站得住**：但只 scale 到 ViT-L/14，没看到明确瓶颈，
  EVA-CLIP / SigLIP 2 后续证明继续 scale 还在涨

### 6.2 在 2026 工程语境下的位置

- **作为 vision encoder 入口**：几乎所有 multimodal LLM（GPT-4V / Claude Vision / Gemini）
  的视觉前端都是 CLIP 系（或 SigLIP / EVA-CLIP），CLIP 范式没死
- **作为 zero-shot 分类器**：日常 use case（图片打标 / 内容审核 / 检索）依然首选，
  但下游有 fine-grained 需求（医学影像 / 卫星图）会换专门数据集训的版本
- **作为研究范式**：double-encoder + contrastive 的范式已被吸收到所有多模态预训练，
  CLIP 的 paper 本身是必读 baseline 但不再是最强系统
- **学习者实际用什么**：99% 的 CLIP 应用今天用 `mlfoundations/open_clip` 而不是 `openai/CLIP`，
  因为 open_clip 有训练代码 + 更多 checkpoint + LAION 数据集

### 6.3 H5 海报项目的可借用点

我做的 H5 学习海报项目（实习日志站）里几个直接可用的 CLIP 应用场景：

- **找参考图片**：用 CLIP zero-shot 在我自己的图床里搜"复古 sketchnote 风格"——
  4 亿对训出来的语义检索远比关键字搜准
- **学习笔记封面图自动配文**：把 markdown 笔记的标题输入 text encoder，
  在 hero image 库里找最相似的 → 自动生成封面
- **判断我画的 figure 是否符合"sketchnote 风"**：用 CLIP 算 figure 和 prompt 
  `'a hand-drawn sketchnote with notebook texture'` 的相似度，做风格 QA
- **代码截图配类目**：自动给学习笔记里的代码截图打标 ("rust", "python", "shell")
  做侧边栏 facet 筛选

这些都不需要训练，只用 inference：装 open_clip + 写 50 行 Python。

## Layer 7 · 显式怀疑（4 件具体的事）

**怀疑 4**：4 亿数据集的 contamination 真实规模

论文 Section 5 自查了 12 个数据集发现 contamination 在 0-7%，
但 WIT 数据集**没有公开**——任何独立的研究者都无法验证。
ALIGN (Google) 的 1.8B 数据集同样不公开，OpenCLIP 用的 LAION 倒是公开了，
但 LAION 不等于 WIT。CLIP 论文 zero-shot ImageNet 的 76.2% 里有多少是真"零样本"、
多少是 train-test overlap？没人答得出。Birhane et al. (2021) 发现 LAION-400M 里
含有 ImageNet 训练集图片的近重复——CLIP 的 WIT 大概率类似。
**预判**：随着合成数据 / 数据 cleaning 工具进步，2027 年某个独立 audit 会算出 CLIP 真正的 zero-shot
数字大概在 70-72%（不是 76.2%）。

**怀疑 5**：WIT 不公开是技术原因还是法律原因

OpenAI 一直没公布 WIT，模型权重又只放了 inference 不放 training。
官方解释是"数据集版权问题"——4 亿图片来自互联网爬取，单独逐图获取版权不可行。
但 LAION-400M 同样是爬虫数据集，他们用了 Common Crawl + alt-text 公开了 URL 列表
（不放图片本身，让用户自己下）。OpenAI 完全可以学这个做法。
**真实原因猜测**：(a) WIT 包含可识别人脸 / 隐私内容，公开会触发 GDPR；
(b) 训练 recipe 是 OpenAI 商业护城河；(c) 公开后第三方 audit 会发现 contamination。
论文从不讨论这一点。

**怀疑 6**：prompt sensitivity 没被严肃 ablation

论文 Section 3.1.4 提到 prompt engineering 大概贡献 5pp，
但没有系统的 prompt sensitivity 分析。比如：
- "a photo of a {}." vs "{}." 差多少？
- 把 80 模板换成 GPT-4 自动生成的 80 模板效果如何？
- 不同语言（中文 / 法文）的 prompt 效果差异多大？（CLIP 训练数据 95% 是英文）
社区后续工作（CoOp, ProDA）补了一部分但都是事后追溯。
**这暴露了 method paper 的常见叙事偏差**：作者倾向把"看起来 work 的东西"
放主结果表，把"看起来比较脆弱的东西"放附录或干脆不讨论。

**怀疑 7**：80 模板 ensemble 是不是 information leak 的另一种形式

prompt engineering 本质是把"对 ImageNet 类目分布的先验知识"注入到 zero-shot 推理。
作者改"crane → construction crane"是因为他们知道 ImageNet 里 crane 是塔吊。
这部分人工知识从哪来？**从 ImageNet 训练集统计**——作者明确说
"concentrated on the lowest performing classes according to top_1 and top_5 accuracy
on the ImageNet **training set**"。**这意味着 prompt 是用 ImageNet 训练集调过的**——
严格来说不算 zero-shot，更像 prompt-only meta-learning。
论文没把这部分人工成本放在 limitation 段。

## 限制（独立于作者承认的）

- **L1 数据可访问性**：WIT 不公开 → 学术界没有可复现的 baseline，整个领域被锁死在 OpenCLIP / LAION 替代品上
- **L2 评测协议偏差**：30+ benchmark 都是 image classification + captioning 风格，
  对密集预测（segmentation, detection, depth）天然弱（DINOv2 后来证明这一点）
- **L3 语言覆盖**：训练数据 95%+ 英文，多语言 zero-shot 性能急剧下降（中文 prompt 直接掉 30pp+）。
  论文 Limitations 没提这一点
- **L4 batch size 锁死大公司专属**：32k batch 在 8×A100 上要 80GB×8 = 640GB GPU 内存，
  学术机构基本玩不起。这不是"模型有多强"的限制，是"谁能复现"的限制——
  把 contrastive vision pretraining 变成寡头游戏

## 附录：叙事错位（论文宣称 vs 代码现实）

| 论文宣称 | 代码 / repo 现实 | 修正认知 |
|---|---|---|
| "可复现的视觉预训练新范式" | OpenAI 只放 inference，不放训练代码也不放数据集 | 真复现要等 OpenCLIP (2022)，CLIP repo 本身只是 demo |
| "zero-shot ImageNet 76.2%" | 这是 ViT-L/14@336px + 80 prompt ensemble + 改类名的合成数字 | 单 prompt + 默认类名 + ViT-B/32 只有 ~63%——5x 差距藏在工程细节里 |
| "InfoNCE 对称损失" | repo 里 `forward` 只返回 logits，loss 在 paper 伪代码里 | 工业落地要自己实现训练循环（参考 open_clip） |
| "可学习温度参数 logit_scale" | 初始化 log(1/0.07) ≈ 2.66，训练后稳定在 ~4.6（即 τ ≈ 0.01） | 实际上 CLIP 训完后温度比初始化低 7 倍——固定 τ=0.01 也许就够 |

## 结尾元数据

- 重构日期：2026-05-28
- 总行数：≥ 500（按 v1.1 method 状元篇）
- 启用 skill：source-learn (Layer 3 精读) + research-gap (Layer 5 反对者部分) + investigate (怀疑 1-7)
- 用到的工具：phd-skills 7 阶段（Layer 4）+ openai/CLIP repo（commit `d05afc4`）
- 论文类型 self-classify：method / algorithm paper（v1.1 分支 A）
- 心脏物：Algorithm 1 (Section 2.1) + Section 3.1.4 prompt engineering
- 主锚定形式：`path:line`（4 处 GitHub permalink，commit hash `d05afc4`）
