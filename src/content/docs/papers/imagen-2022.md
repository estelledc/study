---
title: Imagen — 文生图真正的引擎是语言模型
来源: Saharia et al., "Photorealistic Text-to-Image Diffusion Models with Deep Language Understanding", NeurIPS 2022 (Google Research)
日期: 2026-05-31
分类: 深度学习
难度: 中级
---

## 是什么

Imagen 是 Google 2022 年发布的**文生图**（text-to-image）系统：你输入一句话"一只穿宇航服的柯基在月球上跳舞"，它生成一张 1024×1024 的照片级图像。

日常类比：像一个**翻译团队**——先有一个特别会读中文的人（语言模型）把句子读懂，再交给一个画师（扩散模型）按理解去画。Imagen 论文最反直觉的发现就是：**画师再换更厉害的，也不如让读句子的人变得更厉害**。

它和同期的 DALL-E 2（OpenAI 2022 年 4 月）走的是不同路线，但用同一时间证明：扩散模型 + 大语言模型 = 当时最强的文生图。

## 为什么重要

不读 Imagen，下面这些事都解释不了：

- 为什么后续主流 T2I（Stable Diffusion 3 / Flux / DeepFloyd IF）改用 T5 类语言模型做文本编码器——而 SD 1.x/2.x 仍走 CLIP
- 为什么"扩散网络做大"比不上"文本编码器做大"——这反直觉，但 Imagen 用消融实验证明了
- 为什么高 cfg 不"烧屏"——CFG 本身来自 GLIDE；Imagen 贡献的是 **dynamic thresholding**，让 cfg=7~10 仍可用
- 为什么 1024 分辨率不是一次画出来的——级联超分是当时的标准答案

## 核心要点

Imagen 的架构可以拆成 **三段**：

1. **冻结的 T5-XXL 文本编码器**：把句子编成一组向量。**T5 完全没见过图像**——它是在 C4（纯文本网页）上训练的语言模型。Imagen 直接拿来不动它。

2. **基础扩散模型**：U-Net，64×64 分辨率，输入 = 噪声 + T5 文本嵌入（cross-attention 注入），输出去噪后的低分辨率图。

3. **两段级联超分**：64→256，256→1024，每段一个独立的 U-Net 扩散模型，把上一段的输出当条件继续画细节。

三段加起来：**句子 → 64×64 → 256×256 → 1024×1024**。

## 实践案例

### 案例 1：T5 vs CLIP 的反直觉对比

Imagen 做了一个关键消融：换不同的文本编码器，扩散网络保持不变。结果：

```
文本编码器          FID（越低越好）   人评对齐度
T5-Small (60M)        ~13              一般
T5-Base  (220M)       ~10              好
T5-Large (770M)        ~8              更好
T5-XXL   (4.6B)       7.27             最好
CLIP ViT-L (~400M)     ~9              不如同等参数 T5
```

**逐部分解释**：

- 同等参数下 T5 > CLIP——尽管 CLIP 是图文对训练，**应该**更懂"图"
- T5 越大越好，没有饱和——文本理解还没到顶
- 同时论文也试了"扩散网络做大"，提升远不如"文本编码器做大"

结论一句话：**文本理解才是瓶颈**。

### 案例 2：classifier-free guidance 和 dynamic thresholding

扩散模型生成时常用 classifier-free guidance（CFG）：每一步同时做"有 prompt"和"无 prompt"两次预测，把差值放大 cfg 倍。cfg 越大越贴 prompt，但代价是**像素过饱和、烧屏**。

```
cfg=1     图像和 prompt 弱相关
cfg=3     一般效果
cfg=7     贴近 prompt，但容易出现亮斑/色块溢出
cfg=10+   彻底烧屏（像素超出 [-1,1] 范围）
```

Imagen 提出 **dynamic thresholding**：每一步预测出 x0（去噪到原图的猜测）后，统计 x0 的某个高分位（比如 99.5%）s，把 x0 整体压到 [-s, s] 再除以 s。**只在烧屏时才压，正常情况不动**。这一招让 cfg 可以拉到 7~10 也不爆。

### 案例 3：级联 vs 端到端

为什么不一次画 1024×1024？训练成本：1024² 的 U-Net attention 复杂度爆炸。Imagen 选**级联**：

- 64×64 基础模型：U-Net 大，注意细节
- 256×256 超分：U-Net 中等，主要"补细节"
- 1024×1024 超分：U-Net 小，只放大像素，不创造内容

每段独立训练、独立推理。代价：**误差累积**——基础阶段画错了，后两段救不回来。

## 踩过的坑

1. **冻结 vs 微调文本编码器**：试过解冻 T5 联合训，结果反而变差——可能是图文对噪声拉低了 T5 的语言能力。**冻结**反而最好。

2. **DrawBench 不是自动评测**：Imagen 提出的 DrawBench 200 个 prompt（覆盖颜色、计数、空间关系、罕见词），但**只能人评**——没有 ground truth。复现成本高。

3. **闭源**：Imagen 没放权重、没放数据。社区用论文思想造了开源版 DeepFloyd IF（2023），但效果不如 Imagen。

4. **慢**：T5-XXL 4.6B 参数 + 三段 U-Net，单图推理几十秒。后来 Stable Diffusion 用 latent diffusion（在压缩潜空间扩散）才把速度拉到秒级。

## 适用 vs 不适用场景

**适用**：

- 想理解"为什么大语言模型对多模态那么重要"
- 工程化扩散模型时，参考 cascade + dynamic threshold 这两个技巧
- 想知道 2022 年文生图主流路线（除了 DALL-E 2 / Stable Diffusion）

**不适用**：

- 想跑代码：Imagen 没开源 → 用 Stable Diffusion 或 DeepFloyd IF
- 想最新 SOTA：2026 年看 SD3 / Flux / DALL-E 3
- 想低延迟生成：Imagen 慢，选 latent diffusion 路线

## 历史小故事（可跳过）

- **2020**：Ho et al. 提出 DDPM，扩散模型奠基
- **2021 年底**：OpenAI GLIDE 第一次把 classifier-free guidance 用到文生图
- **2022 年 4 月**：DALL-E 2 发布，走 CLIP unCLIP 路线（先生成 CLIP 嵌入再解码）
- **2022 年 5 月**：Imagen 论文上 arXiv，主张"文本编码器更重要"，和 DALL-E 2 撞期但路线相反
- **2022 年 8 月**：Stable Diffusion 开源（latent diffusion）改写游戏规则
- **2023**：DeepFloyd IF 开源 Imagen 风格

Imagen 没赢市场（闭源），但**赢了思想**——后来 SD3 / Flux 等主流路线改用 T5 类语言模型做文本编码器（SD 1/2 一代仍多用 CLIP）。

## 与 DALL-E 2 的路线对比（重点）

两篇论文相差不到一个月，但思路完全相反：

| 维度 | DALL-E 2 (OpenAI 2022-04) | Imagen (Google 2022-05) |
|------|---------------------------|-------------------------|
| 文本编码器 | CLIP（图文对训练） | T5（纯文本训练） |
| 中间表示 | CLIP image embedding | 直接文本嵌入 |
| 关键模块 | prior（文本嵌入 → 图像嵌入） | 无 prior，文本直驱扩散 |
| 分辨率 | 64 → 256 → 1024 级联 | 64 → 256 → 1024 级联 |
| FID（COCO） | 10.39 | 7.27 |
| 主张 | 联合图文训练的嵌入更好 | 大语言模型的纯文本理解就够 |

后来事实证明 Imagen 的路线在新一代里占了上风：Stable Diffusion 3、Flux 等改用 T5 类编码器；但中间一代（SD 1.x/2.x）仍以 CLIP 为主，并非一夜之间全换。

## 学到什么

1. **文本理解是文生图瓶颈**——这个洞见改写了整条赛道的设计原则
2. **冻结大模型 + 训练小模型**比联合训更稳——Imagen 冻结 T5、只训扩散
3. **dynamic threshold** 是工程小技巧但效果惊人——别小看几行代码的修复
4. **级联**让大模型可训：把一个难任务切成几个容易的任务串起来
5. **闭源也可以引领潮流**——Imagen 没放代码，但思想被后来所有人继承

## 延伸阅读

- 论文 PDF：[Imagen NeurIPS 2022](https://arxiv.org/abs/2205.11487)（约 50 页含附录，正文 10 页够）
- 项目主页：[imagen.research.google](https://imagen.research.google/)（有大量样图，无代码）
- 开源复现：[DeepFloyd IF](https://github.com/deep-floyd/IF)（2023 社区版）
- [[ddpm]] —— 扩散模型基础
- [[stable-diffusion]] —— 同期但走 latent diffusion 路线

## 关联

- [[ddpm]] —— Imagen 的扩散数学基础
- [[stable-diffusion]] —— 同期对手，潜空间路线
- [[clip]] —— Imagen 用消融证明"CLIP 不如 T5"
- [[attention]] —— U-Net 里靠 cross-attention 注入文本嵌入

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dreamfusion-2022]] —— DreamFusion — 用 2D 扩散模型当老师，把 NeRF 教成 3D
- [[parti-2022]] —— Parti — 把文生图当作翻译，用自回归 Transformer 一像素接一像素地写
