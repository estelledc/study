---
title: CLIP 视觉-语言对比预训练
来源: Radford et al., "Learning Transferable Visual Models From Natural Language Supervision", ICML 2021 / arXiv 2103.00020
---

> 一句话：CLIP 用 4 亿张互联网图文对，在图像编码器和文本编码器之间做对比学习；训练完之后不再用分类头，而是把"分类"变成"图片和哪段文字最匹配"，于是同一个模型可以零样本评估任何分类任务。

## 历史定位

把视觉模型放在一条时间线上看：

- 2012 AlexNet——卷积网络在 ImageNet 上击败手工特征
- 2015 ResNet——残差连接，深度从十几层冲到上百层
- 2019-2020 BiT / EfficientNet / ViT——把"在更大数据上做监督预训练"推到极限
- 2020 VirTex / ConVIRT / ICMLM——少量工作开始用 caption 监督视觉
- **2021 CLIP——把对比图文学习推到 4 亿对的规模，并第一次把 zero-shot 做成核心卖点**
- 2022 DALL-E 2 / Stable Diffusion——文本编码器直接复用 CLIP
- 2023 LLaVA / MiniGPT-4——视觉编码器直接复用 CLIP-ViT
- 2024-2025 GPT-4V / Claude / Gemini——视觉部分基本都是 CLIP 风格的双塔/对齐范式

理解 CLIP，等于理解过去五年所有 multimodal 系统的"视觉接入口"是怎么长出来的。

---

## Section 1：动机——为什么从分类标签换成自然语言

CNN 时代主流范式：拿一个固定 label set（比如 ImageNet 1000 类），在上面做监督训练，输出一个 1000 维 logit。这套方案有三个隐藏代价：

1. **类别集合是封闭的。** ImageNet 没有的类，模型完全不会。要新增一类必须重新标注、重新训练。
2. **标签信息密度极低。** "cat" 这个 label 没有告诉模型它和"sofa"、"fluffy"、"orange"的关系。一张图配一段 caption 比一个标签携带的语义多一个数量级。
3. **互联网上的免费数据被浪费。** 网页里图文对天然成双：alt text、caption、标题。只要把这些拿来当监督信号，数据就不再受人工标注瓶颈。

CLIP 的赌注是：用对比目标把图像和文本拉到同一个嵌入空间，类别就变成"任意一段文字"，不再受预定义集合束缚。这其实是把 NLP 里 word2vec / GloVe "分布式语义"的思路，迁移到视觉。

> 怀疑：「自然语言比标签信息密度高」听上去像 slogan。真到训练里 caption 是不是大量噪声？OpenAI 在论文 §2.2 提到他们用了 500K 个高频英文 query 做去重和均衡。这一步的工程量在论文里被一笔带过，但很可能是 CLIP 能 work 的关键。后续 LAION 团队复现时，他们的 CommonCrawl 抓取也专门做了类似的均衡，效果才接近原版。如果这一层假设破了，CLIP 故事就只剩"大数据+大模型"——这不是新东西。

### Definition 1：image-text pair

形式上 `(x_image, x_text)`，其中 `x_image` 是 RGB 图像，`x_text` 是与图像在网页里同时出现的英文文本（alt 属性、figcaption、附近段落、社交媒体 caption 等）。

CLIP 用的数据集叫 **WIT (WebImageText)**——4 亿对，OpenAI 没公开。后续 LAION 社区做了 LAION-400M / LAION-5B 来近似。

### Definition 2：contrastive loss（对比损失）

给一个 batch 大小 N 的 image-text pair 集合 `{(I_1, T_1), ..., (I_N, T_N)}`：

- 把所有图过 image encoder 得到 `I_1...I_N`
- 把所有文本过 text encoder 得到 `T_1...T_N`
- 计算 NxN 相似度矩阵 `S[i][j] = cos(I_i, T_j) / tau`
- 期望：`S[i][i]` 高（对角线），`S[i][j], i!=j` 低（非对角线）

具体损失（symmetric InfoNCE，详见 Section 3.2）。直觉上：每张图要和「自己的 caption」比「同 batch 其他 N-1 个 caption」更相似；反过来每段文字也要和「自己的图」比其他图更相似。

### Definition 3：zero-shot transfer

预训练完成后，给一个新分类任务：

1. 把每个类别名套进一个 prompt template（比如 `"a photo of a {label}"`）
2. 文本编码器把所有 prompt 编成 N 个文本向量 `T_1...T_N`
3. 待分类图片过图像编码器得到 `I`
4. 预测 = `argmax_i cos(I, T_i)`

整套流程不需要看任何下游训练样本，所以叫 zero-shot。它把"分类"变成了"在 N 个候选 caption 里选一个"。

---

## Section 2：数据——WIT (WebImageText)

论文 §2.2。三个关键设计：

1. **规模：4 亿图文对。** 量级和 GPT-2 训练数据 (WebText) 同一档，比 ImageNet (1.4M) 大 280 倍。
2. **覆盖广度：500,000 个 search query。** 每个 query 最多 20K 对，避免某个 query 主导分布。这步是关键的"均衡器"，让模型不至于全是猫狗。
3. **隐私和版权：** OpenAI 没公开数据集，理由是版权和隐私顾虑。这后来成为 CLIP 复现的最大障碍——LAION 团队不得不从 Common Crawl 重新爬。

> 怀疑：「500K query，每个最多 20K 对」很像在做隐式的类别均衡，效果上接近"长尾监督"。如果是这样，CLIP 的成功有多少来自"对比学习"，多少来自"工程师手工设计的均衡分布"？这问题论文没给答案。OpenCLIP 的消融显示：在 LAION-400M 上训练 ViT-B/32，ImageNet zero-shot 大约 62-63%；OpenAI 原版 CLIP 同规模约 63-64%。差距不大，说明数据均衡确实能近似复现，但仍有 1-2 点结构性 gap。

数据清洗流程论文写得很简短（一段话），但实际工程量极大。这是"开源 + 复现"路上最容易翻车的环节。

---

## Section 3.1：模型架构

CLIP 是经典的"双塔"结构（也叫 dual-encoder）：图像编码器和文本编码器共享一个嵌入空间，但本身互相不交互。

### Image encoder

CLIP 训练了两族：

| 系列 | 变体 | 参数量级 |
|------|------|----------|
| ResNet | RN50, RN101, RN50x4, RN50x16, RN50x64 | 25M – 420M |
| ViT | ViT-B/32, ViT-B/16, ViT-L/14, ViT-L/14@336 | 86M – 304M |

ResNet 系列在原版 ResNet 基础上做了几处改动：

- 用 **BlurPool** 替代 strided conv（抗混叠）
- **Anti-aliased AvgPool** 在 stem 处
- **attention pooling** 替代最终的 average pooling

ViT 直接用 ViT 论文里的结构（patch 16×16 或 14×14，加 CLS token），最后 CLS token 经过 LayerNorm + linear projection 投到共享嵌入空间。

最终最强模型是 **ViT-L/14**（224×224 训练，再用 336×336 fine-tune 一遍叫 ViT-L/14@336）——这就是 LLaVA、Stable Diffusion 用的那一版。

代码参考（链接示意，40-char hex commit hash 锚定历史版本）：

- OpenAI 官方 CLIP 实现：[openai/CLIP `clip/model.py`](https://github.com/openai/CLIP/blob/d50d76daa670286dd6cacf3bcd80b5e4823fc8e1/clip/model.py)
- OpenCLIP 复现版：[mlfoundations/open_clip `src/open_clip/model.py`](https://github.com/mlfoundations/open_clip/blob/73fa7f03a33da53653f61841eb6d69aef161e521/src/open_clip/model.py)
- HuggingFace transformers 集成版：[huggingface/transformers `modeling_clip.py`](https://github.com/huggingface/transformers/blob/0a4b08c44b2ec0d4a8b04d6db52dc3c40e6f8a73/src/transformers/models/clip/modeling_clip.py)

### Text encoder

12 层 transformer，宽度 512，8 个 attention head，63M 参数。注意：

- **不共享权重**——和 GPT-2 同款结构但完全独立训练
- **causal mask**（保留自回归 mask，虽然这里不做生成）
- 用 **end-of-sequence token (EOS)** 的最后一层激活作为整段文本的表示
- 投影到共享嵌入空间（D = 512 或 768，取决于 image encoder 大小）
- 最大序列长度 76 token（比 BERT 短）

### 共享嵌入空间

两个 encoder 输出都做 L2 归一化，然后相似度直接用点积（等价于余弦相似度）。

### Figure 1：对比预训练流程

![CLIP contrastive pretraining](/papers/clip/01-contrastive-pretraining.webp)

图里展示的是 N=4 时的最小例子。实际训练 N=32768。

---

## Section 3.2：训练目标 / Algorithm 1

### Algorithm 1：CLIP symmetric InfoNCE

```
# 伪代码 — 简化自论文 Figure 3
# I[N, H, W, C]   一个 batch 的图像
# T[N, L]         对应 caption 的 token id
# W_i, W_t        最终 projection（投到共享空间）
# tau             learnable temperature scalar，初始化为 ln(1/0.07)

I_f = image_encoder(I)              # [N, d_i]
T_f = text_encoder(T)               # [N, d_t]

# 投影到共享空间并归一化
I_e = l2_normalize(I_f @ W_i)       # [N, d]
T_e = l2_normalize(T_f @ W_t)       # [N, d]

# 缩放点积相似度矩阵
logits = (I_e @ T_e.T) * exp(tau)   # [N, N]

# 对称交叉熵
labels = arange(N)                  # 对角线就是正样本下标
loss_i = cross_entropy(logits, labels, axis=0)   # 文本到图像
loss_t = cross_entropy(logits, labels, axis=1)   # 图像到文本
loss = (loss_i + loss_t) / 2
```

几个细节非常关键，但论文用一两句话带过：

1. **temperature τ 是可学习的，但 clamp 到 ≤ 100。** 不 clamp 会数值爆炸。τ 训练完一般稳定在 0.01 附近（也就是 logits scale ≈ 100）。
2. **batch size 32768，必须跨 GPU all-gather。** 单 GPU 装不下这么多 pair；需要 distributed all-gather 把所有 rank 的 embedding 拼到一起，再算 logits。
3. **混合精度 (fp16) + gradient checkpointing。** 否则装不进 V100 32G。
4. **AdamW，lr 5e-4，cosine schedule，weight decay 0.2。** 模型规模大但 wd 用得不重。

> 怀疑：CLIP 用 batch 32768 不是 batch size choice，是 **InfoNCE 本质决定的**。InfoNCE 的负样本就是同 batch 其他 N-1 个，N 越大估计越准。MoCo 用 queue 来绕开这个限制，但 CLIP 没这么做——为什么？可能因为图文对比里"负样本质量"比"负样本数量"更重要，queue 里旧的负样本会引入分布漂移。但这个权衡论文没拆开讲。

### 计算成本

最大模型 RN50x64：592 V100 GPU × 18 天。
ViT-L/14：256 V100 GPU × 12 天。
按 2026 年 A100 价格估算约 $200K-$400K 一次训练。

学术界几乎没法独立复现 OpenAI 原版规模——这是 CLIP 一个被反复诟病的限制（详见 Section 7）。

---

## Section 4：实验

CLIP 实验铺得极广，论文有 30+ 数据集 zero-shot 结果。挑重点：

### 4.1 ImageNet zero-shot

| 模型 | ImageNet top-1 | 备注 |
|------|----------------|------|
| ResNet-50（监督） | 76.2% | 1.4M 标注样本 |
| BiT-L（监督） | 87.5% | 300M 标注 |
| CLIP RN50（zero-shot） | 59.6% | 0 ImageNet 样本 |
| CLIP ViT-B/32（zero-shot） | 63.2% | 0 |
| CLIP ViT-B/16（zero-shot） | 68.6% | 0 |
| **CLIP ViT-L/14（zero-shot）** | **75.5%** | **0** |
| CLIP ViT-L/14@336（zero-shot） | 76.2% | 0 |

ViT-L/14 zero-shot 76.2% 几乎追上了 ResNet-50 的全监督水平。这是 CLIP 的 headline 数字。

### 4.2 跨 30+ 数据集 robust

CLIP 在以下数据集上 zero-shot 强势（部分超过 ResNet-50 fully supervised）：

- StanfordCars (77.3%)
- Food101 (88.8%)
- OxfordFlowers (78.7%)
- SUN397 (63.2%)
- Country211 (32.2%)

但在以下任务上 **明显弱**：

- EuroSAT (49.4%) — 卫星图像
- KITTI Distance (34.0%) — 车距离估计
- CLEVRCounts (24.9%) — 计数

模式：自然图像 / 抽象概念强；专业领域 / 细粒度结构 / 数值推理弱。

### 4.3 distribution shift robustness

最有说服力的实验：在 ImageNet variants（ImageNet-V2 / Sketch / R / A）上，CLIP zero-shot 的准确率下降幅度比同 ImageNet 准确率的监督模型小得多。

| 评估集 | ResNet-101 (sup) | CLIP ViT-L/14 (zs) |
|--------|------------------|--------------------|
| ImageNet | 76.2 | 76.2 |
| ImageNet-V2 | 64.3 | 70.1 |
| ImageNet-Sketch | 25.2 | 60.2 |
| ObjectNet | 32.6 | 70.7 |
| ImageNet-A | 7.5 | 77.2 |
| ImageNet-R | 37.7 | 88.9 |

差距巨大。这条结果让 CLIP 在 robustness / distribution shift 文献里反复被引用，被解读为「自然语言监督带来更鲁棒的视觉特征」。

> 怀疑：这套 robustness 数据是不是有 selection bias？ImageNet-A / R / Sketch 在 OpenAI 准备 WIT 时已经是已知的 hard set。如果 WIT 抓的网页里包含大量 sketch / abstract style 图片（合理推测，因为互联网本来就这样），那 CLIP 自然在 Sketch 上不下降。这不是「鲁棒」，是「训练分布更宽」。Hendrycks 等人后续工作 (Taori et al. 2020) 提出 effective robustness 度量，CLIP 在那个度量下确实优于纯 ImageNet 监督，但优势没论文里这么夸张。

### Figure 2：zero-shot 流程

![Zero-shot classification](/papers/clip/02-zero-shot.webp)

图里左侧是 prompt 构造（class name → template → text encoder），右侧是测试图片过 image encoder 之后做 cosine 相似度 + argmax。这条路径是 CLIP 真正颠覆性的部分——分类不再需要训练。

### 4.4 linear probe 和 fine-tune

如果允许用下游任务的少量样本：

- **Linear probe**（只学一层线性分类头）：CLIP ViT-L/14 在 12 个数据集平均 81.6%，比 BiT-L 平均 80.7% 高
- **Full fine-tune**：CLIP 进一步涨 1-3 个点，但容易过拟合小数据集

linear probe 是 CLIP 评估视觉表征质量的标准范式——后续 DINO / MAE / iBOT 都沿用这个评测。

---

## Section 5：Prompt engineering

论文 §3.1.4 是一个被低估的章节。CLIP 的 zero-shot 数字背后藏着大量 prompt 工程。

### 5.1 朴素 prompt vs ensemble

最朴素：直接拿 class name 当 caption。

```
text = "cat"   →  text encoder
```

ImageNet 上这样做 zero-shot 只有 ~58%。

加上模板：

```
text = "a photo of a cat"   →  text encoder
```

ImageNet 上跳到 ~63%。**+5 点纯靠加 6 个单词**。

更进一步——80 个 template 做 ensemble：

```
templates = [
    "a photo of a {}",
    "a low resolution photo of a {}",
    "a satellite photo of a {}",
    "a sketch of a {}",
    "a tattoo of a {}",
    ... (再 75 个)
]
```

把每个 template 填上 class name，过 text encoder，**得到 80 个文本向量然后取平均**，再做 cosine 相似度。ImageNet 上再 +3.5 点。

### 5.2 class name 修复

CLIP 论文还提到一个有趣的 trick：很多 ImageNet class name 在 WIT 里出现频率极低，或者意思被多义性污染。

例子：

- `crane` (鹤 / 起重机) → 改成 `"a photo of a crane bird"`
- `boxer` (拳击手 / 拳师犬) → 改成 `"a photo of a boxer dog"`
- `mouse` → 改成 `"a photo of a mouse animal"` 或 `"a computer mouse"`

这些手工修复又能再涨 1-2 个点。

> 怀疑：80 templates 是怎么定下来的？论文给了一个 ImageNet 上验证集 grid search 的描述。但这意味着这 80 个 template 在 ImageNet 上做了"隐式微调"——所谓 zero-shot，其实在 prompt 设计层面有 ImageNet 的影子。这一点论文没否认但也没强调。后续工作 (CoOp, Zhou et al. 2022) 提出"learnable prompt"，承认了 prompt 不是 free lunch。

### 5.3 prompt 工程的现代视角

2026 年回头看 CLIP prompt engineering：

- 它本质和 LLM prompt engineering 是同一件事——只是发生在更小的输入空间
- CLIP text encoder 只有 76 token，模板自由度有限
- 现代 CLIP 变体（SigLIP, EVA-CLIP）大多保留了 prompt template 这一层
- LLaVA 等 multimodal 模型用 LLM 替代 CLIP text encoder 之后，prompt 的角色就转移到 LLM 内部了

prompt template 这一招本身是 CLIP 留给 multimodal 的一项遗产。

---

## Section 6：后续 + 衍生工作（CLIP 的下游影响）

CLIP 是过去五年最被复用的视觉模型，没有之一。挑几个最重要的下游：

### 6.1 文生图：DALL-E 2 / Stable Diffusion

- **DALL-E 2 (2022)**：用 CLIP text encoder 把文字编码成 embedding，然后扩散模型把 embedding 反推回图像（"unCLIP"）
- **Stable Diffusion (2022)**：直接拿 CLIP-ViT-L/14（后来 SD2 换成 OpenCLIP-ViT-H/14）做文本条件
- 直觉：CLIP 学到了图文对齐的语义空间，扩散模型只需要在这个空间里做 conditional sampling

如果没有 CLIP 的对齐空间，文生图至少要再延后两年。

### 6.2 多模态 LLM：LLaVA / MiniGPT-4

- **LLaVA (2023)**：CLIP-ViT-L/14 提取视觉特征 → 一层线性 projection 投到 LLM token 空间 → 接 Vicuna / LLaMA
- 整个适配层只有 ~10M 参数，可以在 8 张 A100 上一天训完
- 现代 multimodal 模型（Llava-NeXT, InternVL, Qwen-VL）基本都沿用「CLIP-style 视觉编码器 + projection + LLM」三段结构

CLIP 把视觉变成「LLM 可以读的 token」，让多模态从"独立训练"变成"插件式接入"。

### 6.3 分割与检测：SAM / GLIP / OWL-ViT

- **OWL-ViT**：把 CLIP 改造成 open-vocabulary 检测器
- **GLIP**：grounding + CLIP 风格对齐做检测
- **SAM**（Segment Anything）：虽然 SAM 本身不是 CLIP，但 SAM2 后续的 text-based prompting 仍然依赖 CLIP-like 文本特征

### 6.4 自监督视觉的对照：DINO / MAE

- **DINO** / **DINOv2**：纯视觉自监督，不用文本，但学到的特征质量在很多 linear probe 任务上接近 CLIP
- **MAE**：masked autoencoder，重建任务而非对比任务
- 启示：CLIP 的核心收益可能不全来自"语言"，而来自"在大规模数据上做 contrastive"。MAE / DINO 用纯视觉也能逼近。但 zero-shot 这一项无法替代——只有 CLIP 把语言留在了模型里。

### 6.5 中文 / 多语言变体

- **Chinese-CLIP**（达摩院）
- **mCLIP / AltCLIP**（多语言）
- 中文 NLP 圈一度大量复用 OpenCLIP 框架训自己的模型

### 6.6 Scaling 后续：SigLIP / EVA-CLIP

- **SigLIP (2023)**：用 sigmoid loss 替代 softmax，去掉 batch 全局归一化的依赖，可以无痛 scale
- **EVA-CLIP**：把 CLIP image encoder 用 MIM 预训练，然后再 CLIP-style 对齐，效果更强
- **InternVL**（2024-2025）：把视觉编码器 scale 到 6B，对齐到更大 LLM

CLIP 范式被持续推到更大规模，但对比学习 + 双塔的核心结构没变。

---

## Section 7：限制（论文 §7 + 后续工作发现的）

CLIP 不是没有缺点。论文自己有专门一章列限制，五年下来又被发现更多。

### 7.1 计算成本

- ViT-L/14 训练一次 ~$200K-$400K
- 学术界基本没法复现 OpenAI 原版规模
- LAION + Stability + LMU 联合搞 OpenCLIP，背后还是商业资源

### 7.2 数据不公开

- WIT 4 亿对永远不会公开（OpenAI 已表态）
- 复现需要从 Common Crawl 重新爬，质量、去重、隐私处理全靠社区
- 这对开源生态是长期障碍

### 7.3 偏见

- 互联网图文数据带文化偏见——CLIP 论文 §7 自己花了大量篇幅做 bias 评估
- "doctor" 关联男性照片显著高于女性，"criminal" 关联深肤色显著高于浅肤色
- 这些偏见会通过下游 (DALL-E 2 / Stable Diffusion) 放大
- 没有简单的"训练后修复"——只能从数据源头下手

### 7.4 细粒度任务弱

- 难以区分 "Boeing 737" vs "Boeing 747"
- 难以做 fine-grained bird species
- 论文 §3.1.5 就承认这一点：CLIP 在 fine-grained 上落后专门训练的模型 10-20 个点

### 7.5 数值 / 推理弱

- 数图片里物体数量（"3 只猫" vs "5 只猫"）严重出错
- 空间关系（"猫在狗的左边" vs "右边"）也几乎不行
- CLIP 学到的是"bag of concepts"，不是"compositional structure"
- 这条限制在 LLaVA 等下游模型里被继承下来（早期 LLaVA 数物体能力差）

### 7.6 长文本能力差

- text encoder 只支持 76 token
- 长 caption / 段落理解力很弱
- 后来 Long-CLIP / CLIP-LSTM 等工作专门攻这一点，但仍然不及 LLM

### 7.7 zero-shot 只是"软"zero-shot

- prompt template 在 ImageNet 上 grid search 调出来——这等于在测试集上漏了一点信息
- 严格 zero-shot 评估应该不允许 prompt tuning
- 这条争议在 CLIP 之后的 OOD detection 文献里仍未完全解决

> 怀疑：上面 7 条限制里，「成本」和「数据不公开」是社会问题，「偏见」是方法论问题，「细粒度 / 推理 / 长文本」是模型容量问题。但有一条被忽视的限制：**CLIP 学到的图文对齐是"统计共现"，不是"语义理解"。** 这意味着图里有"猫"+图里写着"cat"会让 CLIP 觉得对，即使 caption 是 "a photo without any cat"。Goh et al. (2021) 在 OpenAI 内部发的 "Multimodal Neurons" 论文明确指出 CLIP neurons 会对"图里有 cat 字符的图片"高激活——也就是说 CLIP 学到的是一个被 OCR 污染的视觉空间。这个问题至今没被根除。

---

## 学到什么

把 CLIP 拆到最朴素的几条：

1. **大规模 + 弱监督 > 小规模 + 强监督。** 4 亿条嘈杂 caption 比 1.4M 条精标 ImageNet 更有用，前提是模型容量够。
2. **对比目标是把任意两个空间拉到一起的通用工具。** 视觉-文本可以，文本-代码可以（CodeBERT），文本-语音可以（CLAP）。CLIP 把"对比 + 双塔"打成了一个范式。
3. **"评估方式"本身可以被发明。** Zero-shot transfer 不是预先存在的评测，是 CLIP 论文同时定义了任务和方法。所以 CLIP 既"赢"了又"定义"了赢的标准——这是论文影响力放大的关键。
4. **prompt 是模型可读的接口。** 自然语言变成了视觉模型的"可调控旋钮"。这条直接铺垫了 LLaVA 等后续工作把 LLM 接到视觉上。
5. **数据工程被严重低估。** 论文用一段话讲清的"500K query 均衡"很可能是 CLIP 真正的护城河。

### 关联

- [[resnet]]——CLIP image encoder 之一就是 ResNet，理解 ResNet 架构是基础
- [[vit]]——CLIP 最强模型 ViT-L/14 的本体；多模态时代视觉编码器的事实标准
- [[mamba]]——CLIP text encoder 是 transformer，但替代品 Mamba 在长 caption 任务里被用来扩 context
- [[flash-attention]]——CLIP 的 transformer attention 在 OpenCLIP / EVA-CLIP 里都已经换成 FlashAttention，省一半显存
- [[chinchilla]]——CLIP 的训练规模选择没遵循 Chinchilla scaling law（Chinchilla 在 CLIP 之后），后续 OpenCLIP 训练时考虑过 token-to-param 比例
- [[stable-diffusion]]——直接复用 CLIP-ViT-L/14 的文本编码器
- [[llava]]——直接复用 CLIP-ViT-L/14 的图像编码器
- [[dino]]——纯视觉自监督的对照组，不用文本但学到类似强度的特征

### 实操建议

如果要在 2026 年用 CLIP 做实际项目：

- **不要从头训。** 用 OpenCLIP 已发布的 checkpoint。OpenAI 原版 ViT-L/14 仍然是社区基线。
- **prompt template 要 ensemble。** 80 个 template 平均效果显著好于单一 prompt。
- **细粒度任务用 SigLIP 或 EVA-CLIP。** 它们在 fine-grained 上比原版 CLIP 强 5-10 点。
- **想要高质量 zero-shot detection。** 用 OWL-ViT 或 GroundingDINO，不要直接拿 CLIP 做 detection。
- **想做中文。** Chinese-CLIP 或 AltCLIP，不要硬翻译英文 prompt。
- **想做 multimodal LLM。** LLaVA-NeXT / Qwen-VL 都已经是 production-ready，不用从 CLIP 自己拼。

### 一句话收尾

CLIP 之所以是"状元"，不是因为它数字最高（在 ImageNet 监督榜上它至今没赢过），而是因为它**重新定义了"用视觉模型"这件事的形态**——从"训分类头"变成了"写 prompt"。这一步迈出去，多模态时代才正式开始。

---

## 附录 A：和前置工作的关系（VirTex / ConVIRT / ICMLM）

CLIP 不是凭空出现的。同时期有三篇直接前置工作，理解它们能让 CLIP 的"贡献"显得更准确：

### A.1 VirTex (2020)

- 任务：用 image captioning 做视觉预训练，下游迁移到 detection / classification
- 模型：ResNet + transformer decoder
- 数据：COCO Captions（118K 图，每图 5 caption）
- 结论：在小数据上有效，但没法 scale 到 web 规模
- 和 CLIP 区别：VirTex 用 generative 目标（预测 caption），CLIP 用 contrastive 目标。Generative 目标对每对样本要求"对齐 + 流畅"两件事，对比目标只要"对齐"，更容易 scale。

### A.2 ConVIRT (2020)

- 任务：医学影像和报告对比学习
- 模型：ResNet image encoder + BERT text encoder
- 数据：MIMIC-CXR（200K 胸片 + 报告）
- 结论：对比学习在医学领域 work，迁移到下游分类有效
- 和 CLIP 区别：ConVIRT 是 CLIP 的"小规模医学版"。CLIP 论文 §1 直接把 ConVIRT 列为思路来源——CLIP 的核心创新不是"对比 image-text"，而是"把这套方法 scale 到 4 亿对"。

### A.3 ICMLM (2020)

- 任务：image-conditioned masked language modeling
- 思路：BERT 风格 mask 一些 caption token，让模型用图像信息预测
- 和 CLIP 区别：ICMLM 是 fusion-style（图像和文本在同一个网络里 cross-attend），CLIP 是 dual-tower（独立编码再对齐）。Fusion 表达力强但推理时必须图文同时输入；dual-tower 推理时图和文可以分开缓存——这是 CLIP 能做大规模检索的前提。

> 怀疑：CLIP 论文常被说"开创性"，但从 method 角度看它就是 ConVIRT scale up + 加 prompt engineering。真正的 novelty 是 (a) 4 亿对的数据工程 (b) zero-shot transfer 这套评测范式。这两件事在论文里被打包卖，被解读成"一个新方法"。学习论文时不应该只看 method 部分——CLIP 真正颠覆性的部分是它对"评估"的重新定义。

---

## 附录 B：常见误解澄清

### B.1 "CLIP 是图文检索模型"

部分对，部分错。CLIP 训练目标是图文匹配，确实能做检索（图搜文 / 文搜图）。但它真正影响最大的是 **作为视觉特征提取器** ——下游 LLaVA / Stable Diffusion 用 CLIP 不是为了检索，而是为了拿它的 image encoder。

### B.2 "CLIP zero-shot 等于无监督"

错。CLIP 在 4 亿对图文上训练过，每对都是"弱监督"信号。所谓 zero-shot 只是说"下游任务不需要训练样本"，不是"模型从没被监督过"。严格说 CLIP 的范式叫 **transferable supervised learning**，不是 unsupervised learning。

### B.3 "CLIP 比 ResNet 强"

视任务而定。在 ImageNet 全监督榜单上，最强 CNN（如 BiT-L 87.5%、EfficientNet-V2 88%+）至今高过 CLIP。CLIP 的优势在 **zero-shot + robustness**，不在 single-task ceiling。

### B.4 "用 OpenCLIP 等于用 CLIP"

不完全对。OpenCLIP 在 LAION 数据上训，OpenAI 原版在 WIT 数据上训。两者数据分布不同，下游表现不完全一致——某些任务 OpenCLIP 强（更新数据），某些任务 OpenAI 版本强（数据 curation 更细）。生产时应该都试一下。

> 怀疑：「OpenCLIP 完美复现 CLIP」这个说法被社区不断流传，但 LAION 团队自己在论文里明确指出有 1-2 点 gap。这种 narrative 在开源社区里有一种系统性偏差——为了证明"开源能复现专有"，gap 容易被淡化。学习论文时要警惕这种 community bias。

---

## 附录 C：和后续状元篇的关联

本系列已写到 round 91。前面状元篇里和 CLIP 直接相关的：

- **ResNet (S1)**：CLIP image encoder 选项之一，是过去十年视觉网络的奠基；ResNet-50x64 在 CLIP 论文里是最大模型
- **ViT (S2)**：CLIP 最强 image encoder ViT-L/14 的本体；ViT 的 CLS token + LayerNorm 直接被 CLIP 复用
- **CLIP (S3, 本篇)**：把视觉和语言用对比学习对齐
- 之后：DINO (纯视觉自监督对照)、Stable Diffusion (CLIP 文本编码器下游)、LLaVA (CLIP 视觉编码器下游)

这条线索可以这样总结：**深度 (ResNet) → 序列化 (ViT) → 对齐语言 (CLIP) → 多模态生成与理解 (SD / LLaVA)**。CLIP 是这条线索的关键节点——往前是"如何编码图像"，往后是"如何让图像和语言协同"。
