---
title: FILIP — 把 CLIP 的图文对齐细化到 token 级
来源: Yao et al., "FILIP — Fine-grained Interactive Language-Image Pre-Training", ICLR 2022 (arXiv:2111.07783)
日期: 2026-05-31
分类: 多模态 / 计算机视觉
难度: 中级
---

## 是什么

FILIP 是华为诺亚方舟实验室 2021 年底提出的图文预训练模型。一句话：**把 [[clip]] 的"整图对整文"换成"每块图对每个词"**。

日常类比：CLIP 像两个人各看完一本书后只交换"读后感总结"——粒度太粗。FILIP 让两个人**逐句逐图对照**，每块图找最像的词，每个词找最像的块，再把所有局部相似度平均，作为这本书和这张图的最终匹配分。

技术上，CLIP 把图压成 1 个向量、文压成 1 个向量，算余弦相似度；FILIP 保留 ViT 的 N 个 patch token 和文本侧的 M 个 word token，对每个 patch 取它和 M 个 word 中最大的相似度，再对 N 个 patch 平均，作为图→文方向的分数。文→图方向同理。最后两个方向取平均做 InfoNCE。

这个机制在文本检索领域有名字叫 **late interaction**——[[colbert-2020]] 2020 年在文本搜索里就已经验证过它打败单向量 pooling。FILIP 把同一招搬到了多模态。

## 为什么重要

不理解 FILIP，下面这些事都没法解释：

- 为什么 CLIP 在 ImageNet zero-shot 上很猛，但在"猫在沙发左边"这种细粒度描述上很笨——单向量丢了局部对应
- 为什么 2022 年之后 X-CLIP / FLAVA / BLIP 一系列工作都在补"fine-grained alignment"这条线
- 为什么向量数据库圈（[[milvus]]、ColBERT 系）和多模态圈最后会合流——都在解决同一个问题：单向量 vs 多向量
- 为什么"训练显存涨 2 倍"在 multimodal scaling 里值得付——粒度补回来后下游收益巨大
- 为什么只看全局相似度排行榜，会系统性低估"能指着图说话"这类能力

## 核心要点

FILIP 训练流程拆成 **三步**：

1. **双塔编码不做 pooling**：图过 ViT 得到 N 个 patch token（224×224 输入、patch size 14 → 16×16 = 256 个 patch），文过 12 层 Transformer 得到 M 个 word token。每个 token 单独 L2 归一化。CLIP 在这一步会把所有 token 平均或取 [CLS] 压成 1 个向量，FILIP **不压**。

2. **token 级最大相似度**：对每个图像 patch，计算它和 M 个 word token 的余弦相似度，取最大值（语义上：这块图最像哪个词）；对 N 个 patch 取平均，作为图→文方向分数。文→图方向对称做一遍。

3. **对称 InfoNCE**：把图→文和文→图两个分数当 logits，正样本是 batch 里真实配对的图文，做对比学习。loss 形式和 CLIP 一样，但底层相似度是 token 级聚合出来的。

整套机制叫 **cross-modal late interaction**。写成伪代码大概长这样：

```python
# img_tokens: [B, N, D]  (每张图 N 个 patch token)
# txt_tokens: [B, M, D]  (每段文 M 个 word token)
# 都已 L2 归一化
sim = img_tokens @ txt_tokens.transpose(-1, -2)  # [B, B, N, M]
img2txt = sim.max(dim=-1).values.mean(dim=-1)    # [B, B] 每个 patch 取最像 word，再平均
txt2img = sim.max(dim=-2).values.mean(dim=-1)    # [B, B] 每个 word 取最像 patch，再平均
loss = (infonce(img2txt) + infonce(txt2img)) / 2
```

CLIP 同位置只有 `sim = img_global @ txt_global.T`，1 个数代表整对。FILIP 的 `max+mean` 这两步是核心增量。

注意：伪代码里的 `[B, B, N, M]` 是教学展开；真实实现会做 patch dropping、混合精度，并避免把整 batch 的四维矩阵一次性物化到显存。

## 实践案例

### 案例 1：token 级对齐能"指着说"

输入一张"小狗在草地上叼飞盘"的图，FILIP 训完后可以做这件事：

1. 取出 caption 里"飞盘"这个 word token 的向量
2. 计算它和 256 个 image patch token 的余弦相似度
3. 看 argmax 落在哪一块——画面里往往**真的是飞盘那一块**

CLIP 因为只输出 1 个全局向量，做不到这种 patch-level 解释。这种"可定位"的特性后来被 [[sam]]、open-vocabulary 检测工作大量复用。

### 案例 2：同尺寸更少数据下的实测收益

CLIP text encoder 有 76 token 限制，把长描述压成 1 个向量时损失大；FILIP 是 token 级对齐，长描述里**只要有少数关键词命中图**就能贡献分数。

论文报告：FILIP-ViT-L/14 在 ImageNet zero-shot top-1 达到 **77.1%**（对照 CLIP-ViT-L/14 约 **75.5%**）。训练数据是 FILIP300M + 公开集合计约 **340M** 对，少于 CLIP 的 400M。Flickr30K / MSCOCO 检索表上 FILIP 也全面强于同代双塔基线；ablation 里单加 late interaction，在 MSCOCO 上 I2T R@1 约 **+5.5**、T2I 约 **+3.8**（相对 vanilla CLIP ViT-B/32 子集实验），不要把这个数字直接当成「Flickr30K vs CLIP-L +5」。

### 案例 3：和 ColBERT 的呼应（工程选型）

FILIP 论文直接 cite [[colbert-2020]]：late interaction 2020 年已在文本检索验证过比单向量 dense retrieval 更准。FILIP 等于把同一观察迁移到 image-text。

工程含义：**单向量 vs 多向量 token** 不是某个模态独有的——存储/检索效率 vs 表达精度。生产上常两段式：

1. 离线仍可为每张图存 1 个全局向量（或平均 pooling），先做 ANN 粗排拿到 Top-K
2. 对候选再算 patch↔word 的 max+mean 重排
3. 只有精排阶段付多向量代价，避免一图 256 向量把全库索引和带宽撑爆

这和 ColBERT 在文本侧的「预计算文档 token、查询时 late interaction」是同一类折中。

## 踩过的坑

1. **训练显存涨约 2 倍**：N×M 相似度矩阵每对都要算（256×40 ≈ 10K 个相似度）；CLIP 只算 1×1。FILIP 用 patch dropping（训练时随机丢一半 patch）+ 混合精度顶住。
2. **推理向量库设计变复杂**：CLIP 一图一向量，丢进 [[milvus]] 标准 ANN 即可。FILIP 一图 256 个向量，要么存全部（存储×256）要么粗排+token 重排。生产上很多人最终 fallback 到 CLIP。
3. **不是 CLIP 的纯替代**：ImageNet 涨约 1.6 点、检索更强，但在亿级图库吞吐上常输给单向量。FILIP 适合"少量图+精确匹配"，CLIP 适合"海量图+粗匹配"。
4. **对 ALIGN/CoCa 不能直接比**：ALIGN 用了约 18 亿对 scale，CoCa 加了 caption generation 头。FILIP 数据量约是 ALIGN 的 1/5，贡献是**机制**而非绝对 SOTA。
5. **patch 数量敏感**：224×224 / patch=14 → 256 token 是论文标配；提到 384 时 token 数翻约 3 倍，相似度矩阵开销爆炸。

## 适用 vs 不适用场景

**适用**：
- 细粒度图文检索——长 caption / 复杂场景描述
- 需要 patch 级解释性的视觉系统——open-vocabulary 检测、grounding
- 中等规模图库（百万级以下）的精排
- 想了解 late interaction 在多模态里如何落地

**不适用**：
- 极大规模生产图库（亿级以上）→ 用 CLIP / SigLIP 单向量
- 极小算力训练 → 显存压力翻倍
- 单向量 ANN 索引场景（如 [[milvus]] 默认配置）→ FILIP 多向量适配复杂
- 极简部署（边缘端）→ token 级 inference 内存吃不消
- 只要"图文大概像不像"的粗召回 → 全局向量已经够用，不必上 token 级

## 历史小故事（可跳过）

- **2020-04**：[[colbert-2020]] 在文本检索提出 late interaction，把"查询每个 token 找文档最像 token"做成主流
- **2021-02**：[[clip]] 与 ALIGN 同期发布，定下"双塔 + 全局对比"的多模态范式
- **2021-11**：FILIP arXiv 首发（arXiv:2111.07783），把 ColBERT 思路搬到图文
- **2022**：ICLR 接收；同年 X-CLIP / FLAVA / BLIP 各自补 fine-grained，思路上与 FILIP 同源
- **2023+**：SigLIP 等回到单向量效率线；fine-grained 风头被"接 LLM"抢走，但垂类（医学、电商）仍常用 token 对齐

## 学到什么

1. **粒度是可以选择的设计变量**——压成 1 个向量是一种选择，保留 token 是另一种，没有哪种绝对对
2. **跨领域迁移成熟范式**——ColBERT（2020 文本）→ FILIP（2021 图文）是研究常见路径
3. **fine-grained 不免费**——训练显存、推理索引、生产部署都要付代价
4. **机制 vs 规模**——FILIP 数据量小于 ALIGN，但靠机制在同尺寸上超 CLIP
5. **解释性是副产品**——max 操作天然给出"哪块图对哪个词"，被后续 grounding 工作复用
6. **评测榜单会偏向某种粒度**——CLIP 在分类上强，FILIP 在细粒度检索/定位上更有优势；下游选什么榜会反过来塑造方法

一句话：CLIP 用全局向量对比；FILIP 用 patch↔word 的 max+mean 做 late interaction。同尺寸、约 340M 对数据下 ImageNet zero-shot 到 77.1%；代价是显存与多向量索引。

## 延伸阅读

- 论文 PDF：[Yao et al. 2021](https://arxiv.org/abs/2111.07783)（17 页，前 8 页讲方法和数据）
- ColBERT 对照阅读：[[colbert-2020]] —— late interaction 的文本侧原版思路
- 复现参考：开源没有官方代码，[OpenCLIP](https://github.com/mlfoundations/open_clip) 有社区贡献的 FILIP 分支
- 视频解读：搜索 "FILIP ICLR 2022 explained"
- 后续工作链：X-CLIP / FLAVA / BLIP / GLIP — 都在 fine-grained 这条线上推进
- 对照基线：[[clip]] —— 全局向量双塔，读 FILIP 前先建立对照坐标系

## 关联

- [[clip]] —— FILIP 的直接对照对象，全局对齐 vs token 对齐
- [[colbert-2020]] —— late interaction 的文本侧原版，FILIP 思路源头
- [[vit]] —— FILIP 图像编码器底座
- [[attention]] —— Transformer 基础
- [[milvus]] —— 向量数据库，FILIP 多向量索引的工程挑战在这层
- [[sam]] —— patch 级对齐能力被这类 grounding 工作复用
- [[llava]] —— 后续多模态主流转向"接 LLM"，视觉编码器仍多用 CLIP-style 双塔

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

