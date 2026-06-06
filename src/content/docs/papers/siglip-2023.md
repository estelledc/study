---
title: SigLIP — 用 Sigmoid 损失训练图文对齐
来源: 'Zhai et al. "Sigmoid Loss for Language Image Pre-Training". arXiv 2023'
日期: 2026-06-06
分类: 机器学习
子分类: 多模态 LLM
难度: 中级
---

## 是什么

SigLIP（Sigmoid Loss for Language-Image Pre-training）是 Google 2023 年提出的 **CLIP 改进版**：把对比学习里的 **softmax 全局归一化** 换成 **逐对 sigmoid 损失**，训练更稳、**小 batch 也有效**，还能把 batch 扩到极端做消融。

日常类比：CLIP 像全班一次考试排名（softmax：你的分数取决于全班）；SigLIP 像每对图文单独判「配不配」（sigmoid：只看这一对，不问全班）。排名考试噪声大时，配对判断更稳。

## 为什么重要

不懂 SigLIP，下面这些事说不清：

- 为什么 2024 大量 MLLM（MiniCPM-V、PaliGemma 等）默认 SigLIP 视觉塔
- 为什么 [[clip]] 的 softmax contrastive 在小 batch / 多机异构时难训
- 为什么 [[milvus-2021]] 里存的向量很多来自 SigLIP/CLIP 系 encoder
- 为什么「换损失函数」能解锁更大 batch 和更好小 batch 性能

## 核心要点

1. **Sigmoid 逐对损失**：每张图-文对独立打 logits，用 sigmoid BCE，不需要一个 batch 内全员参与 softmax 归一化。

2. **解耦 batch 与损失**：softmax 的梯度依赖全局 batch；sigmoid 只依赖当前对——多机训练、小 batch 更友好。

3. **Locked-image Tuning（LiT）组合**：冻结图像塔只训文本侧时，SigLIP 在 4×TPU 上两天达到 84.5% ImageNet 零样本——工程性价比极高。

## 实践案例

### 案例 1：CLIP vs SigLIP 损失（概念）

```python
# CLIP: batch 内 N 个图文对，softmax over N×N 相似度矩阵
loss_clip = cross_entropy(sim_matrix, labels)

# SigLIP: 每个 (image_i, text_j) 独立二分类，正样本 i==j
loss_siglip = sum(sigmoid_bce(sim[i,j], label=(i==j)) for all i,j)
```

### 案例 2：接入 MLLM 视觉塔

```python
from transformers import SiglipVisionModel
vision = SiglipVisionModel.from_pretrained("google/siglip-so400m-patch14-384")
# 输出 patch embedding → 投影到 LLM 词嵌入维度
# MiniCPM-V / PaliGemma 等默认此路线
```

### 案例 3：向量检索管线

```text
图像 → SigLIP encoder → 向量 → Milvus 检索
文本 → SigLIP text tower → 同一空间向量 → 跨模态搜图
（见 [[milvus-2021]]）
```

微调 SigLIP 时，图像增强（random crop/color jitter）要与 pretrain 一致；MLLM 下游常冻结 vision tower，只训 projector，此时 encoder 预处理必须和 checkpoint 对齐。

ImageNet 零样本 84.5% 是 LiT 设定下的数字；全量双塔联合训数字不同。读论文表格要看训练配方列，不要横向比错设定。

与 [[clip]] 向量混检索时，metric 和归一化必须统一；否则跨模型 ANN 结果无意义。Milvus collection 应按 encoder 版本隔离。

## 踩过的坑

1. **checkpoint 混用 CLIP 头**：SigLIP 权重必须用 SigLIP processor，换 CLIP 预处理归一化会掉点。

2. **盲目追求百万 batch**：论文显示 32k 后收益递减——算力要花在刀刃上。

3. **忽略图像分辨率**：`patch14-384` vs `patch16-224` 特征粒度不同，下游 MLLM 要匹配。

4. **以为完全替代 CLIP 生态**：很多老工具链仍默认 OpenAI CLIP——迁移要测召回。

## 适用 vs 不适用场景

**适用**：
- 训练/微调图文对齐 encoder
- MLLM 视觉塔选型（2024 主流）
- 资源受限小 batch 多机预训练

**不适用**：
- 纯文本 LLM（无视觉塔）
- 已有 CLIP 大规模定制且不愿重训
- 需要 CLIP 原版论文特定 benchmark 复现


## 进阶话题（可跳过）

这一节把前文和工业落地再绑紧一点，方便你读完就能动手选型或读论文。

1. **batch 消融启示**：论文试到 1M batch 收益递减；工程默认 32k 是务实起点。
2. **LiT 配方**：锁图像塔训文本塔适合算力紧张团队；两天 84.5% 是强基线。
3. **下游 MLLM**：vision tower 冻结时，SigLIP 特征质量决定 OCR/细粒度感知上限。
4. **向量检索**：同一 SigLIP checkpoint 应对齐 [[milvus-2021]] 的 metric 与维度配置。
## 历史小故事（可跳过）

- **2021**：[[clip]] 奠定图文对比学习范式。
- **2023.03**：SigLIP 提出 sigmoid 损失 + 极端 batch 消融。
- **2024**：成为开源 MLLM 默认视觉 encoder 之一。
- **今天**：big_vision 仓库持续发布 So400m 等 checkpoint。

## 学到什么

1. **对比学习的损失形式决定训练动力学**
2. **sigmoid 解耦全局 batch，利于 scale 与异构训练**
3. **视觉 encoder 选型影响整条 MLLM 链路**
4. **与 [[clip]] 并列读，才懂 2024 MLLM 视觉底座变迁**

## 延伸阅读

- 论文：[arXiv 2303.15343](https://arxiv.org/abs/2303.15343)
- 代码：[google-research/big_vision](https://github.com/google-research/big_vision)
- [[clip]] —— 原版 softmax 对比学习
- [[milvus-2021]] —— 向量落库与检索
- [[qwen2-vl-2024]] —— 工业 MLLM 视觉侧对照

## 关联

- [[clip]] —— SigLIP 的直接前作
- [[milvus-2021]] —— embedding 存储检索层
- [[qwen2-vl-2024]] —— 另一路视觉-语言融合（动态分辨率）
- [[mme-benchmark-2023]] —— 换 encoder 后必重跑的基础榜
- [[gemini-1.5-2024]] —— 闭源多模态强基线


- 入门路径：先读「是什么」+「核心要点」，跑通一个最小案例后再翻「进阶话题」。
- 复习抓手：把「为什么重要」四条用自己的话复述一遍，能讲给同事即算掌握。
- 与仓库其他笔记：用文内 [[wikilink]] 跳到已写条目，别孤立读单篇。

- big_vision 配置即文档，改 batch 先改 config。
- So400m 是 2024 MLLM 常用视觉塔规模。
- 与 OpenCLIP 生态对比迁移成本。
- 零样本检索要 L2 归一化后做 IP/COSINE。
- 微调学习率对 sigmoid 损失仍敏感，别盲目放大。


## 读者练习（可跳过）

用 10 分钟做一个小练习，巩固上文：

1. 用自己的话向朋友解释「这篇解决什么问题」。
2. 从「实践案例」挑一个命令或代码块在本地或纸上走一遍。
3. 列出两个你会踩的坑，并写下规避句。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[milvus-2021]] —— Milvus — 为向量检索而生的数据库
- [[mme-benchmark-2023]] —— MME Benchmark — 开源 MLLM 评测的事实起点

