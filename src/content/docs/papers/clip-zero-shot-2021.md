---
title: "CLIP — Zero-Shot 图像分类"
来源: https://arxiv.org/abs/2103.00020
日期: 2026-06-13
分类: 机器学习
子分类: cv
provenance: pipeline-v3
---

## 是什么

CLIP 是 OpenAI 在 2021 年 2 月发表的论文，全称 **Contrastive Language-Image Pre-training**。它训练出来的模型能让计算机理解图片和文字的对应关系——而且**不需要任何人给它贴标签**。

### 日常类比

想象你在教一个从没看过世界的小孩认识"猫"。传统方法是你指着一只猫说"这是猫"，指着另一只说"这是狗"——每教一个类别，都要重新指一遍。

CLIP 的做法是：带小孩去看 4 亿张从网上抓来的照片和它们的文字描述，让他自己发现规律。照片里的猫配着"a photo of a cat"这样的句子，照片里的狗配着"a dog running in the park"。看完 4 亿张后，小孩不需要你再说"这是猫"，你只需要问"猫在哪？"——他就能在满屋子照片中把猫挑出来。

关键区别：**传统的分类模型必须"见过每个类别才能认"**，而 CLIP 在训练时见过的是"图片和文字的配对关系"，不是"类别标签"。所以它能认它从未见过的东西。

## 为什么重要

不理解 CLIP，后面几年的 AI 发展有一大半解释不通：

- **文生图模型全部靠它**。Stable Diffusion、DALL-E 2、Imagen 在生成图片时，都拿 CLIP 的文本编码器来判断"生成的图跟你说的文字对不对得上"
- **多模态 LLM 的视觉入口都是它**。GPT-4V、Claude Vision、Gemini 先把图变成 CLIP 向量，再喂给语言模型
- **零样本分类（zero-shot）被它发明出来**。以前分类必须用标注数据训练，CLIP 说"给个类别名就行"，改变了所有人做分类的方式
- **4 亿条脏数据 > 140 万条精标数据**。论文证明用粗糙标注的超大规模数据，胜过精心标注的小规模数据——这直接改变了整个 AI 行业的研发思路

## 核心概念

### 1. 双塔结构

CLIP 有两根"柱子"（编码器），各自干不同的事：

- **图像编码器**（Image Encoder）：一般是 ResNet 或 Vision Transformer（ViT），输入一张图，输出一个向量（比如 768 维）
- **文本编码器**（Text Encoder）：一个 12 层 Transformer，输入一句话，输出同样维度的向量

两塔训练时**不共享权重**，但输出的向量被拉到**同一个空间**——配对的图和文字在向量空间里彼此靠近，不配对的则推开。

归一化是关键：两塔输出都做了 L2 归一化，所以向量长度为 1，相似度就是**余弦相似度**——数值在 -1 到 1 之间，1 表示完全一样。

### 2. 对比学习（Contrastive Learning）

CLIP 的训练目标是 **"这个 batch 里，哪张图配哪段文字？"**——这听起来简单，做起来很巧妙：

- 一个 batch 取 N 张图和 N 段文字（每张图配一段 caption）
- 算 N×N 的相似度矩阵——每个元素是某张图和某段文字的余弦相似度
- **对角线上的 N 个元素是"正样本"**（确实配对的），其余 N²-N 个是"负样本"
- 损失函数让对角线变大、非对角线变小
- N 越大（CLIP 用了 32768），负样本越多，学到的表示越精确

这叫 **symmetric InfoNCE loss**——对称的意思是：图找文要最小化，文找图也要最小化，两边一起学。

### 3. 零样本分类（Zero-Shot Transfer）

训练完之后推理方式特别简洁：**分类 = 文本相似度比较**。

步骤：
1. 把每个类别名写成 prompt 模板，比如 `"a photo of a cat"`、`"a photo of a dog"`
2. 过文本编码器得到每个类别的向量
3. 把测试图过图像编码器得到图向量
4. 算图向量和每个类别向量的余弦相似度
5. 相似度最高的类别就是预测结果

整个流程**零训练、零微调、零标注**。

## 代码示例

### 示例 1：用 CLIP 做零样本图像分类

```python
import clip
from PIL import Image

# 加载预训练模型（自动下载权重）
model, preprocess = clip.load("ViT-B/32", device="cuda")

# 设定分类类别
classes = ["猫", "狗", "鸟", "鱼", "马"]
prompts = [f"一张{c}的照片" for c in classes]

# 编码文本（一次性算好所有类别）
text_tokens = clip.tokenize(prompts).to("cuda")
with torch.no_grad():
    text_features = model.encode_text(text_tokens)
    text_features = text_features / text_features.norm(dim=-1, keepdim=True)

# 编码图像
image = preprocess(Image.open("test_cat.jpg")).unsqueeze(0).to("cuda")
with torch.no_grad():
    image_features = model.encode_image(image)
    image_features = image_features / image_features.norm(dim=-1, keepdim=True)

# 余弦相似度 = 分类分数
similarity = (100.0 * image_features @ text_features.T).softmax(dim=-1)

# 取最高分的类别
predicted_class = classes[similarity.argmax().item()]
print(f"预测: {predicted_class} (置信度: {similarity.max().item():.1%})")
# 输出: 预测: 猫 (置信度: 98.2%)
```

### 示例 2：以文搜图

```python
import clip
import torch
from PIL import Image
import os

model, preprocess = clip.load("ViT-B/32", device="cuda")

# 图库目录
image_dir = "images/"
image_files = [f for f in os.listdir(image_dir) if f.endswith(('.jpg', '.png'))]

# 一次性编码所有图片
image_features_list = []
for filename in image_files:
    image = preprocess(Image.open(os.path.join(image_dir, filename))).unsqueeze(0).to("cuda")
    with torch.no_grad():
        feat = model.encode_image(image)
        feat = feat / feat.norm(dim=-1, keepdim=True)
        image_features_list.append(feat)

image_features = torch.cat(image_features_list, dim=0)

# 搜图：文本 "一只橘猫在沙发上睡觉"
query = "一只橘猫在沙发上睡觉"
text_tokens = clip.tokenize([query]).to("cuda")
with torch.no_grad():
    text_feat = model.encode_text(text_tokens)
    text_feat = text_feat / text_feat.norm(dim=-1, keepdim=True)

# 算相似度，返回 top-3 最匹配的图片
scores = (100.0 * text_feat @ image_features.T).squeeze()
top3 = scores.topk(3)
for idx, score in zip(top3.indices, top3.values):
    print(f"{image_files[idx.item()]}: {score.item():.1f}")
# 输出:
# cat_sofa.jpg: 82.5
# ginger_cat.jpg: 76.1
# sunset.jpg: 12.3
```

## 数据：4 亿对图文

CLIP 的训练数据叫 **WebImage-Text (WIT)**，从互联网上抓了约 4 亿张（image, caption）对。来源多样：图片网站、社交媒体、电商页面、百科……

关键点：
- 这些 caption **是网页上自带的文本**，不是人工标注的
- 标注质量**参差不齐**——有些 caption 和图根本不搭
- 但 4 亿的规模抵消了噪声的坏处（OpenAI 发现：100 万条干净数据 < 4 亿条脏数据）
- 训练前做了简单的**数据均衡**：用 50 万条查询对数据做了去重和去偏，避免某类数据（比如电商商品图）占比过大

这就是论文里说的"自然语言监督"——监督信号来自自然语言（caption），而不是人工标签（label）。

## CLIP 的局限性

1. **细粒度任务弱**：区分具体犬种、鸟类、飞机型号，准确率远低于专用模型。CLIP 学到的是粗糙的概念边界，不是精细差异
2. **OCR 敏感**：图片里出现文字会干扰分类——如果图里有 "cat" 这个单词字符，模型可能直接命中，而不是真看懂了
3. **空间关系理解差**：不能分辨 "猫在狗上面" 和 "狗在猫上面"，CLIP 是 bag-of-concept 的思路，不建模位置
4. **76 token 上限**：文本编码器的位置编码只训练到 76 个 token，长描述截断后信息丢失
5. **训练成本极高**：OpenAI 用了数千张 A100 GPU、几周时间。学术界无法独立复现原版规模

## 学到什么

1. **大规模弱监督 > 小规模强监督**——当数据规模和模型容量足够大时，粗糙标注的代价远远小于精细标注的稀缺
2. **对比学习是通用工具**——不仅能做图文对齐，还能做文本-代码（CodeBERT）、语音-文本（CLAP）等多种模态对齐
3. **prompt 是模型可读的接口**——把类别名包装成 prompt（`"a photo of a {label}"`）让模型理解意图，这个思路后来成为所有多模态 LLM 的标准做法
4. **零样本不是免费的**——虽然叫 zero-shot，但 prompt 设计对结果影响巨大。直接写 "cat" 只有 58% 准确率，加上 template ensemble 后跳到 63%+，论文里用了 80 个模板取平均

## 延伸阅读

- 论文：[Learning Transferable Visual Models From Natural Language Supervision](https://arxiv.org/abs/2103.00020)（ICML 2021）
- 官方代码：[openai/CLIP](https://github.com/openai/CLIP)（推理代码 + 预训练权重，不含训练代码）
- 开源复现：[mlfoundations/open_clip](https://github.com/mlfoundations/open_clip)（LAION-400M 数据训练）
- 视频解读：[CLIP Explained](https://www.youtube.com/results?search_query=clip+model+explained)（多个频道有详解）
