---
title: VideoPrism — 冻结一个模型就能搞定所有视频理解任务
来源: 'Zhao et al., "VideoPrism: A Foundational Visual Encoder for Video Understanding", ICML 2024'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 高级
provenance: manual-read
---

## 是什么

VideoPrism 是 Google 2024 年推出的**通用视频编码器**——用一个冻结的模型，不改权重，直接插上不同的下游任务头，就能刷 33 个视频 benchmark 里的 31 个 SOTA。

日常类比：普通视频模型像工具专柜，每把锁配一把钥匙（训一个模型解一个任务）。VideoPrism 是一把万能钥匙——你插进任意锁孔（换个轻量任务头），它都能打开，而且打得比大多数专用钥匙更好。

技术上，它的核心是**两阶段预训练**：第一阶段用视频-文字对做对比学习（学语义，像 CLIP 那样）；第二阶段用 582M 条带噪声文本的视频做改进版 MAE（学运动，像 VideoMAE 那样）——两件事分阶段做，各司其职。

## 为什么重要

不理解 VideoPrism，下面这些事说不清：

- 为什么说「文字描述主要揭示外观，自监督才能学运动」——这是 VideoPrism 两阶段分工的理论依据，也是之后所有视频基础模型都绕不开的命题
- 为什么 InternVideo / UMT 在某些 benchmark 好而在另一些差，而 VideoPrism 能在 31/33 上赢——「外观任务 vs 运动任务」的双头优化是 VideoPrism 的核心创新点
- 为什么「冻结 encoder + 轻量任务头」这条路能走通——VideoPrism 的 31/33 SOTA 是这条路线的最强实证
- 为什么 VideoChat / Video-LLaMA 一类模型在冻结 encoder 后还能学到新能力——VideoPrism 证明 encoder 本身若足够强，接个 Q-Former 或 MLP 就够了

## 核心要点

1. **两阶段的分工逻辑**：Stage 1 用 36M 高质量 caption 做对比学习，让 encoder 理解「这段视频说的是什么」（语义/外观）；Stage 2 用 582M 带噪声文本的视频做 Masked Video Modeling，但学的目标是 Stage 1 的 embedding（global-local distillation），让它不忘 Stage 1 学到的语义，同时补上运动感知。两阶段分别解决两个能力，是 VideoPrism 的核心架构贡献。

2. **Token Shuffling 防止解码捷径**：MAE 训练时，decoder 可能通过观察"哪些位置没被 mask"来抄答案——VideoPrism 在 encoder 输出后随机打乱 token 顺序，decoder 必须真正理解每个 token 的内容，而不能靠位置关系取巧。这一个小 trick 在 SSv2（运动理解任务）上带来显著提升。

3. **预训练数据的异构策略**：36M 高质量 + 582M 噪声，而不是追求全部高质量。关键洞见：对纯视觉模态，噪声文本（ASR 字幕 / 自动生成）已经够用，因为 Stage 2 主要靠自监督，不靠文字；强制要求全部高质量 caption 会把数据量压低 10 倍以上，得不偿失。

## 实践案例

### 案例 1：加载冻结 VideoPrism 做下游视频分类

```python
import torch
from transformers import AutoModel, AutoProcessor

# 官方 checkpoint: https://github.com/google-deepmind/videoprism
# HuggingFace 非官方镜像示例
processor = AutoProcessor.from_pretrained("google/videoprism-base")
model = AutoModel.from_pretrained("google/videoprism-base")
model.eval()  # 冻结：不训练 encoder

# 采 8 帧，送进 ViT-B 编码器（factorized space-time）
frames = sample_8_frames("kinetics_clip.mp4")  # shape: [8, 3, 224, 224]
inputs = processor(videos=[frames], return_tensors="pt")

with torch.no_grad():
    features = model(**inputs).last_hidden_state  # [1, T*H*W, D]

# 接上轻量分类头（只训这一层）
classifier = nn.Linear(768, num_classes)
logits = classifier(features.mean(dim=1))
```

### 案例 2：Global-local distillation 的两个损失

```python
# 伪代码：Stage 2 的训练目标
# teacher = Stage 1 的冻结 encoder；student = 正在训练的 encoder

# 用未 mask 的 token 预测整个视频的全局语义
global_embed_student = student_encoder(visible_tokens).mean(dim=1)
global_embed_teacher = teacher_encoder(full_video).mean(dim=1)
L_global = mse_loss(global_embed_student, global_embed_teacher)

# 预测每个 token 位置的语义（被 shuffle 后，decoder 不能抄位置）
shuffled = shuffle_tokens(student_encoder(visible_tokens))
token_preds = decoder(shuffled)  # 解码被 mask 的位置
L_token = mse_loss(token_preds, teacher_encoder(full_video))

# 总 loss = token-wise MAE + 全局蒸馏
L = L_token + lambda_global * L_global
```

### 案例 3：VideoGLUE benchmark 结果对比

```
VideoPrism-B vs 之前最好的 Base 规模模型 (UMT-B):
  K400 分类:     84.2 vs 77.1  (+7.1)
  SSv2 分类:     63.6 vs 54.5  (+9.1) ← 运动理解大幅提升
  Charades mAP:  40.4 vs 39.9  (+0.5)
  AVA STAL mAP:  30.6 vs 21.5  (+9.1) ← 时空定位大幅提升

SSv2 是「判断物体运动方向/方式」的 benchmark（如「往左推」vs「往右推」），
之前 CLIP-based 模型很差（41.0），VideoPrism 靠 Stage 2 补上了运动感知。
```

## 踩过的坑

1. **Stage 2 会遗忘 Stage 1 的语义（Catastrophic Forgetting）**：直接用 MAE 继续训 Stage 1 的 encoder，会让 K400 这类外观任务分数下降。Global distillation loss（让 student 蒸 teacher 全局 embedding）是专门解决这个问题的，去掉这个 loss 性能显著下降。

2. **标准 MAE 在视频上有解码捷径**：不加 Token Shuffling 时，decoder 可以把可见 token 位置排列里推断出被 mask 的内容（空间邻域关系），不需要真正理解语义——加了 shuffle 才关上这扇捷径门。

3. **36M 高质量 caption 是内部数据集（Anonymous Corpus #1）**：VideoPrism 论文不开放这批数据，社区复现只能用 WTS-70M 等公开低质量数据。这使得学术界很难完全复现其最强变体 VideoPrism-g 的效果。

4. **冻结 encoder 在 fine-grained 时序任务上仍有天花板**：SSv2 上 63.6（不是 SOTA fine-tune 水平的 80+）——冻结 encoder 无法适应任务特定的时序模式，说明「万能钥匙」在部分锁上还是不如专用钥匙。

## 适用 vs 不适用场景

**适用**：
- 视频理解的 backbone 选型：需要一个冻结 encoder 接不同任务头的场景
- 科学视频（显微镜 / 生态 / 神经科学）理解——VideoPrism 是目前罕见在科学视频 benchmark 上有系统评测的模型
- 与 CLIP 对比时理解「为什么专门的视频预训练必要」

**不适用**：
- 需要端到端微调——VideoPrism 的公开权重为冻结设计，官方没有 full fine-tune recipe
- 极度 motion-sensitive 的任务（如帧级别光流预测）——MAE 仍然不如专门的运动估计模型
- 资源受限场景——VideoPrism-g 是 ViT-giant（1B 参数），推理成本高

## 历史小故事（可跳过）

- **2022**：VideoMAE（Wang 等）证明 Masked Autoencoding 对视频运动理解有效，但外观任务上输给 CLIP
- **2022**：InternVideo（上海 AI Lab）尝试把对比学习和 MAE 结合，但两个任务互相干扰的问题没有完全解决
- **2024-02**：VideoPrism 论文上传 arXiv，核心贡献：两阶段分工 + global-local distillation + token shuffling
- **2024**：ICML 录用；Google DeepMind 开放模型权重；33 个 benchmark 31 SOTA 的结果迅速成为视频编码器领域的新基准线

## 学到什么

1. **「文字学语义，自监督学运动」是视频预训练的核心 insight**：这不是 VideoPrism 原创的，但 VideoPrism 第一次把它干净地拆成两个阶段，各自最优化，而不是混在一起互相妥协
2. **Token Shuffling 的价值超过了它的复杂度**：一行随机打乱代码，让 SSv2 提了好几个点——评估自己的模型时，先想想有没有「不自知的捷径」
3. **高质量数据稀缺时，大量噪声数据 + 纯视觉自监督是最优解**：582M > 36M 的质量价值，对纯视觉模态成立；对语言模态则相反
4. **「冻结 encoder 下游灵活」和「端到端微调任务最优」永远是两条路**：VideoPrism 选了前者，并把它做到极致——这不是技术问题，是设计哲学选择

## 延伸阅读

- 论文 PDF：[arXiv 2402.13217](https://arxiv.org/abs/2402.13217)（ICML 2024）
- 官方代码：[google-deepmind/videoprism](https://github.com/google-deepmind/videoprism)
- 前置工作：[VideoMAE v2](https://arxiv.org/abs/2303.16727)（VideoPrism Stage 2 的直接前身）
- [[vid-llm-survey-2023]] —— 把「冻结 encoder + 接 LLM」定为 Embedder×LLM 范式的综述
- [[blip2-2023]] —— 同样两阶段训练 + 冻结大模型的范式参考

## 关联

- [[blip2-2023]] —— 两阶段预训练 + 下游冻结的范式先驱（图像侧）；VideoPrism 是视频侧的平行演化
- [[clip]] —— Stage 1 的对比学习直接继承 CLIP 范式；VideoPrism 证明这不够，还需要 Stage 2
- [[mae]] —— Masked Autoencoding 思想来源；VideoPrism 加了 distillation + token shuffling 两项改进
- [[vid-llm-survey-2023]] —— 本文是 Embedder×LLM 范式里「高质量冻结 encoder」路线的代表
- [[videochat-2023]] —— VideoChat 用 ViT-G + Q-Former 连接 LLM，VideoPrism-g 可作为更强的替换 backbone
- [[internvideo]] —— 上海 AI Lab 的视频基础模型路线，与 VideoPrism 并列对比的主要竞品
- [[video-llava-2024]] —— Embedder×LLM 路线；VideoPrism-g 可作更强冻结 backbone
- [[qwen2-vl-2024]] —— 解冻 ViT 的工业路线对照
- [[long-video-retrieval-2023]] —— 长视频下游：检索 vs 冻结 encoder 特征
- [[tempcompass-2024]] —— 时序探针；验证 encoder 质量是否等于时序理解
- [[video-llama-2023]] —— 对话式系统可嫁接 VideoPrism encoder
- [[video-understanding]] —— 专题枢纽

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[blip2-2023]] —— BLIP-2 — 用 188M 小桥接器把冻结的视觉模型和大语言模型拼起来
- [[chat-univi-2023]] —— Chat-UniVi — 动态视觉 token 统一图像与视频对话
- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[internvideo]] —— InternVideo — 上海 AI Lab 视频基础模型套件
- [[internvideo2-2024]] —— InternVideo2 — 三阶段渐进训练，把视频基础模型扩到 6B
- [[internvideo2-5-2025]] —— InternVideo2.5 — 长富上下文 + HiCo 层次压缩
- [[long-video-retrieval-2023]] —— R-VLM — 长视频不靠均匀采帧，靠可学习检索选片段
- [[longva-2024]] —— LongVA — 把语言模型的长上下文能力「搬」到视频上
- [[mae]] —— MAE — Masked Autoencoders
- [[qwen2-vl-2024]] —— Qwen2-VL — 动态分辨率 + M-RoPE，工业级视频理解的里程碑
- [[tempcompass-2024]] —— TempCompass — 专门拆穿 Video LLM 有没有真懂时间
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[video-llama-2023]] —— Video-LLaMA — 把音频和视频同时塞进大语言模型
- [[video-llava-2024]] —— Video-LLaVA — 投影之前先对齐，图像和视频共用一个 LLM
- [[videochat-2023]] —— VideoChat — 把视频、指令微调、多轮对话第一次放进同一个系统
- [[videollama2]] —— VideoLLaMA2 — 阿里达摩院音视频 Video-LLM 可运行实现

