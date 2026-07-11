---
title: SAM — Segment Anything
来源: 'Kirillov et al., "Segment Anything", Meta 2023'
日期: 2026-05-29
分类: 计算机视觉
难度: 中级
---

## 是什么

SAM（Segment Anything Model）是 Meta 2023 年发布的**图像分割界的 GPT-3**。给它一张图，再给一个**提示**——可以是一个点、一个框、或者一句话——它就能把那个物体的轮廓精确抠出来。

日常类比：以前每种物体（猫、狗、车、椅子）都要训一个专门的分割模型，像不同工种的师傅。SAM 是一个**通用分割师**：你指哪它抠哪，不管是猫脸、椅子腿、还是货架上某瓶饮料。

举个例子，你给 SAM 一张室内照，再用鼠标点一下沙发——它输出沙发的精确像素轮廓；再点一下抱枕——它输出抱枕的轮廓。**同一个模型，无需重训，类别自由。**

## 为什么重要

不理解 SAM，下面这些事都没法解释：

- 为什么 2024 年开始，几乎每个图像标注工具都有「点一下自动抠图」按钮
- 为什么 Photoshop / Figma / Adobe 一键去背越来越准——背后大概率是 SAM 或它的后代
- 为什么 SAM 出现后，「针对某个类别训练分割模型」这种博士论文话题突然不香了
- 为什么医学影像、卫星图、工业缺陷检测这些以前要单独训模型的领域，现在都先试试 SAM

四个关键贡献：

1. **1.1 亿掩码的训练数据 SA-1B**——之前最大的分割数据集只有 30 万张图的标注，SAM 直接放大 300 倍。
2. **Zero-shot 跨域**：训练时只看自然图，但在医学影像、卫星图上也能用（虽然医学领域后来又出了专用的 MedSAM）。
3. **SAM 2（2024-08）**：扩展到视频，能追踪一个物体跨多帧。
4. **启发组合范式**：GroundingDINO 把文本变成框，再喂给 SAM 抠图——「开放词汇检测+分割」的标准做法。

## 核心要点

SAM 由**三个组件**组成，可以理解成「读图 → 读提示 → 出 mask」的三段流水线：

1. **图像编码器（Image Encoder）**：用一个大号的 [[vit]]（ViT-H 版本，约 6 亿参数）把图像压成 64×64 的特征图。这一步**相对重**——常见 GPU 上大约几百毫秒量级（公开对比里 ViT-H 编码常被引用为 ~450ms，视硬件而定）。但跑一次就够了，编码结果可以缓存复用。

2. **Prompt 编码器（Prompt Encoder）**：把用户给的提示编码成模型能懂的向量。
   - 点：用傅里叶位置编码（连续坐标编码法）
   - 框：拆成左上、右下两个角点
   - 文本（论文承诺过但官方代码未放，社区常用 GroundingDINO 补齐）

3. **Mask 解码器（Mask Decoder）**：把图像特征 + 提示特征喂进去，输出 mask。这一步**极轻**——约 50 毫秒。所以你可以在浏览器里实时拖动鼠标，每动一次重新解码，体验丝滑。

关键设计：**重一次、轻多次**。图像编码贵但缓存了，提示解码便宜但可以重复跑。这就是为什么 SAM 能在浏览器里实时交互。

## 实践案例

### 案例 1：单点提示（最小可跟做）

你给 SAM 一张猫的照片，在猫眼上点一下。意图模糊时，SAM 默认输出**三个候选 mask**（部件 / 子部件 / 整体）+ IoU 分。

```python
# 伪代码：官方 segment_anything 推理姿势
from segment_anything import sam_model_registry, SamPredictor
sam = sam_model_registry["vit_h"](checkpoint="sam_vit_h.pth")
predictor = SamPredictor(sam)
predictor.set_image(image)  # 只跑一次重编码，结果缓存
masks, scores, _ = predictor.predict(
    point_coords=[[x, y]], point_labels=[1], multimask_output=True
)
# masks[i] = 第 i 个候选；scores[i] = 对应 IoU 质量分，挑最高或给人看
```

**逐部分解释**：`set_image` 做贵的图像编码；`predict` 只跑轻量解码；`multimask_output=True` 就是「输出多个让用户选」。

### 案例 2：框提示

你给 SAM 一张街景，再画一个框框住某辆车。SAM 输出框内主物体的精确轮廓。

```python
masks, scores, _ = predictor.predict(
    box=[x0, y0, x1, y1], multimask_output=False
)
```

这一步把「检测出框」和「分割成 mask」衔接成「检测器出框 → SAM 抠图」两段式——2024 年后很多视觉流水线都这么接。

### 案例 3：Auto-mask 全图分割

不给提示，让 SAM 自己分割整张图：在图上撒 32×32 网格（1024 个点），每个点当单点提示，再用 IoU 阈值 + 重叠度过滤重复 mask。

这个流程也是 SA-1B 数据集约 99% 标注的来源——**模型造数据，再训模型**的自举循环。

## 踩过的坑

1. **不会做类别识别**：SAM 输出的 mask 没有标签，它只知道「这块像素属于一个物体」，不知道是猫还是狗。想要类别，得另接 CLIP 或其他分类器。

2. **OOD 表现一般**：训练数据是自然图像，遇到医学影像、文档截图、图表这些**分布外**的图，效果会掉。后来出了 MedSAM（医学微调版）补这个洞。

3. **ViT-H 主干太重**：6 亿参数 + 1024×1024 输入，普通笔记本跑不动。后来 Mobile SAM（2023）把它蒸馏成 5 MB 小模型，速度快 51 倍，质量只掉 3%。

4. **「Foundation model」名号被夸大了**：SAM 只解决「class-agnostic mask proposal」一件事——不做实例 ID 关联、不做时序追踪、不做 affordance。把它叫「分割界 GPT」是营销修辞，真正的视觉 foundation 需要 SAM + CLIP + DINO + 追踪器组合。

## 适用 vs 不适用场景

**适用**：

- 单图交互式分割（用户拖点拖框）
- 标注工具的 auto-segment 功能
- 视频分割（用 SAM 2 而非原版 SAM）
- 已有检测器，想加一层 mask 输出（box → mask 流水线）

**不适用**：

- 已知类别集 + 高精度要求 → 用 Mask2Former / OneFormer 等专用模型
- 嵌入式 / 浏览器端 → 用 Mobile SAM 或 Efficient SAM
- 医学影像 / 卫星图 / 工业缺陷 → 先试 MedSAM 等专用微调版
- 需要类别标签 → SAM 本身做不到，得组合 CLIP 或 GroundingDINO

## 历史小故事（可跳过）

图像分割的演进可以分成五个阶段：

- **2014 FCN（Fully Convolutional Network）**：把分类网络改造成「每像素一个类别」的全卷积版，分割从此进入深度学习时代。
- **2017 Mask R-CNN**：在 Faster R-CNN 检测框架上加一个 mask 分支，开启「实例分割」黄金时代。
- **2018-2022 backbone 演进**：DeepLab 系列（空洞卷积）、Mask2Former（统一全景/实例/语义）、各种 transformer 改造。每个新主干能多榨 1-2 个百分点。
- **2023-04 SAM（Meta）**：第一次把分割从「一任务一模型」变成「一模型多任务 + 提示驱动」。1.1 亿 mask 数据集 + ViT-H 主干 + 三模态提示编码，开启 promptable segmentation 时代。
- **2024-08 SAM 2**：Meta 把 SAM 扩展到视频，加 memory module 让 mask 跨帧传播。在交互式视频分割上比逐帧跑 SAM 快 6 倍。

整个故事的关键拐点是 SAM——它把「分类器思维」（先定类别再分割）换成了「提示思维」（先要分割对象，类别另说）。

## 学到什么

1. **「重一次 + 轻多次」是通用的工程范式**——把贵的计算 amortize 到一次性的预处理，把廉价的交互做成实时。这套思路可以迁移到任何「服务器跑大模型 + 客户端跑小模型」的产品。

2. **「过度生成 + 多重过滤」是数据自举的标准做法**——SAM 的 auto-mask-generator 在网格上产 1000+ 候选 mask，再用 IoU + 稳定性 + NMS 过滤。同样的策略可以套到 agent 系统的「并发生成方案 → 评分 → 选优」。

3. **「输出多个 + 排序分」让模型表达不确定性**——SAM 输出 3 个 mask + IoU 分让用户选，比强行输出 1 个鲁棒得多。任何模糊任务都该考虑这个范式。

4. **数据规模是 foundation model 的真正护城河**——SA-1B 1.1 亿 mask 比之前 300 倍。架构创新可以模仿，但「Meta 一年的标注预算」别人复制不来。

5. **「提示思维」打破任务边界**——分类器思维让每个新类别都需要重训；提示思维让任意可指点的对象都成"分割对象"，这把"任务"从离散标签变成连续提示空间。后续 GPT-4V / Florence / GroundingDINO 都走这条路。

6. **任务从"类别预测"重定义为"对象分离"**——SAM 故意不输出类别，因为分类是后置任务；这个看似减法的设计，反而让 SAM 能跨医学影像 / 卫星图 / 显微镜等 zero-shot。

7. **数据飞轮分三阶段**：人工标 → 半自动 → 全自动，每一阶段都用上一阶段产物训出更好的标注模型——这套阶梯式 bootstrap 在大数据集构建里几乎是默认范式。

## 延伸阅读

- [Segment Anything 论文 PDF](https://arxiv.org/abs/2304.02643)（28 页，主表 Table 6 看 zero-shot 结果）
- [官方仓库](https://github.com/facebookresearch/segment-anything)（Apache-2.0；推理代码完整，训练代码至今未放）
- [在线 demo](https://segment-anything.com/)（浏览器里拖点试效果，跑的是 ONNX 版）
- [SAM 2 项目](https://github.com/facebookresearch/sam2)（视频版，2024-08）
- [Mobile SAM 论文](https://arxiv.org/abs/2306.14289)（蒸馏到 5 MB 的实战）

## 关联

- [[vit]] —— SAM 的图像编码器主干就是 ViT-H
- [[clip]] —— SAM 不做分类，常和 CLIP 组合补类别识别能力
- [[dino-self-supervised]] —— 视觉自监督预训练；SAM 编码器初始化用了 MAE 类思路
- [[mask-rcnn]] —— SAM 之前的实例分割王者；SAM 在 box→mask 任务上把它超了 3-5 个 AP
- [[grounding-dino]] —— 文本→框检测器；和 SAM 组合做开放词汇分割

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[autonomous-driving-waymo-2021]] —— Waymo Open Dataset — 自动驾驶感知的共同训练场
- [[dino]] —— DINO — 让视觉模型自己认出物体轮廓
- [[filip-2021]] —— FILIP — 把 CLIP 的图文对齐细化到 token 级
- [[mae]] —— MAE — Masked Autoencoders
- [[vit]] —— ViT — Vision Transformer
- [[sam2]] —— SAM 2 — 图像和视频都能抠轮廓的通用分割模型
