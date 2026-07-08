---
title: LoMo — 把同一句话换成图片也要看懂
来源: 'Han et al., "LoMo: Local Modality Substitution for Deeper Vision-Language Fusion", arXiv 2026'
日期: 2026-05-28
分类: machine-learning
难度: 初级
---

## 是什么

LoMo（Local Modality Substitution）是一种训练视觉语言模型的小改法：把一句文字中的一小段渲染成图片，再塞回原来的位置，让模型学会"同一个意思，换个载体也要懂"。

日常类比：老师把题目的一半写在黑板上，另一半打印成纸条贴在中间。学生不能只会读黑板字，也不能只会看纸条，必须把两边拼起来才能答题。

在视觉语言模型里，文字通常负责"提问"，图片通常负责"证据"。LoMo 想打破这个习惯：文字也可以变成图片，图片也可以承载文字含义。

论文把这个现象叫 carrier sensitivity：意思没变，只是从文字 token 换成渲染图片，模型准确率就明显下降。

## 为什么重要

不理解 LoMo，下面这些事很难解释：

- 为什么一个 VLM 能看图答题，却可能看不稳"截图里的题目文字"
- 为什么训练数据里"文字当指令、图片当场景"这个习惯会悄悄塑造模型偏见
- 为什么简单多喂一些图片不一定够，关键是让模型在同一个样本里对齐文字和图片
- 为什么 OCR、文档理解、数学题截图这类任务，最怕模型只把文字和图片当两条分开的路

## 核心要点

1. **问题是载体敏感，不是意思变了**。类比：同一句通知，发在群消息里能懂，贴成公告就看漏，说明人对载体有依赖。论文发现 VLM 也会这样，文本问题渲染成图片后，很多模型性能掉得很明显。

2. **方法是局部替换，不是整题截图**。类比：练拼图时只拿走中间一块，逼你看左右边界。LoMo 选中间一段文字，把它渲染成图片，形成"文字前缀 + 图片片段 + 文字后缀"。

3. **收益来自隐式对齐监督**。类比：同一张菜单既有印刷字也有手写改价，你必须把它们当同一份菜单理解。LoMo 不改模型结构，只改训练样本，让标准 SFT 目标顺便要求模型跨载体对齐。

## 实践案例

### 案例 1：把一道纯文字题改成 LoMo 样本

```text
原始输入：
"If x=2, what is x+3?"

LoMo 输入：
"If " + [图片: "x=2"] + ", what is x+3?"

答案：
"5"
```

**逐部分解释**：

- 原始监督目标不变，答案仍然是 `5`
- 中间的 `x=2` 变成图片，模型必须从视觉通道读出这段信息
- 前后文字保留，让图片片段必须和上下文一起融合

### 案例 2：为什么不要总是整题截图

```text
整题截图：
[图片: "If x=2, what is x+3?"]

局部替换：
"If " + [图片: "x=2"] + ", what is x+3?"
```

**逐部分解释**：

- 整题截图容易变成 OCR 训练：模型只要读完整图片文字
- 局部替换更像跨模态拼接：文字和图片缺一不可
- 论文消融里，整题渲染平均只带来较小收益，局部中段替换更有效

### 案例 3：给训练数据做一个极简 LoMo 改写

```js
function lomoRewrite(text, imageOfMiddle) {
  const parts = splitIntoThirds(text)
  return [parts.left, imageOfMiddle(parts.middle), parts.right]
}
```

**逐部分解释**：

- `splitIntoThirds` 对应论文里的结构感知 span 定位
- `imageOfMiddle` 对应文字渲染，数学公式会走 LaTeX 渲染
- 返回数组表示一个交错输入：文字、图片、文字

## 踩过的坑

1. **把 LoMo 当 OCR 数据增强**：原因是它不是只教模型读图中文字，而是让同一语义在文字载体和视觉载体之间对齐。

2. **以为全量渲染最强**：原因是整题都变成图时，模型少了跨载体边界，反而更像单通道读取。

3. **忽略中间位置的重要性**：原因是中间图片有左右文字夹住，模型必须真正融合上下文；前缀或后缀替换约束更弱。

4. **只看标准评测平均分**：原因是 LoMo 在 rendered evaluation 上提升更大，这才直接测出"同一句话换成图片"的鲁棒性。

## 适用 vs 不适用场景

**适用**：

- 训练 VLM 时希望提升文字截图、文档、OCR、数学题图片的稳健性
- 已有 SFT 流水线，但不想改模型结构或增加推理开销
- 数据里有大量纯文字指令，可以抽一部分改写成文字-图片-文字交错样本
- 想研究 text-as-token 和 text-as-pixels 在模型内部是否真正靠近

**不适用**：

- 模型完全没有视觉输入通道，无法接收渲染图片
- 任务需要新增知识，LoMo 只改变载体，不凭空补知识
- 主要瓶颈是视觉识别能力太弱，而不是文字和图片融合不足
- 需要证明大模型规模下的结论，论文只验证了 8B 到 9B 级别的两个骨干

## 历史小故事（可跳过）

- **2021 年前后**：CLIP 一类模型让图文表征进入同一个空间，但后续研究发现图和文仍可能隔着几何距离。
- **2023 年**：LLaVA 把视觉编码器和大语言模型接起来，视觉指令微调成为开源 VLM 的主路之一。
- **2024 年**：MIR 等指标开始量化 VLM 内部文字 token 和视觉 token 的融合程度。
- **2025 年**：更多研究把文字当像素处理，用截图或渲染文字压缩上下文、做文档理解。
- **2026 年**：LoMo 把重点从"用图片替代文字"转向"同一样本里让文字和图片互相替代"。

## 学到什么

- VLM 的"会看图"不等于"文字和图片载体完全等价"，载体本身会影响模型表现。
- LoMo 的核心不是新网络，而是新样本格式：把 text-only 样本改成 text-image-text 样本。
- 论文最强证据来自两条线：13 个多模态基准平均提升，以及 rendered evaluation 下更大的提升。
- 局部中段替换、感知扰动、适度改写比例一起工作，说明训练信号的形状比"多放图片"更关键。

## 延伸阅读

- 论文 PDF：[LoMo: Local Modality Substitution for Deeper Vision-Language Fusion](https://arxiv.org/pdf/2605.30265v1.pdf)
- 相关论文：[Mind the Gap: Understanding the Modality Gap in Multi-modal Contrastive Representation Learning](https://arxiv.org/abs/2203.02053)
- 相关论文：[Deciphering Cross-Modal Alignment in Large Vision-Language Models with Modality Integration Rate](https://arxiv.org/abs/2410.07167)
- 相关论文：[Pix2Struct: Screenshot Parsing as Pretraining for Visual Language Understanding](https://arxiv.org/abs/2210.03347)
- [[clip]] —— 图文共享表征空间的经典起点，LoMo 讨论的 modality gap 和它一脉相承
- [[llava]] —— LoMo 实验使用的 VLM 训练路线，理解它能看懂 LoMo 改的是哪一层

## 关联

- [[clip]] —— 先把图文拉到同一空间，LoMo 继续追问同一语义能否跨载体稳定
- [[align-2021]] —— 大规模图文对齐路线的代表，LoMo 则从 SFT 数据格式侧补对齐
- [[blip2-2023]] —— 通过桥接模块连接视觉和语言，LoMo 选择不改结构只改数据
- [[llava]] —— 视觉指令微调的基础路线，LoMo 可以看成对 SFT 样本的局部重写
- [[pix2struct]] —— 把截图文字当视觉输入处理，LoMo 借鉴 text-as-pixels 但强调交错融合
- [[modality-gap]] —— LoMo 要缩小的核心现象：同义图文表征在空间里仍然分开
- [[mir-vlm]] —— 论文用 MIR 观察视觉 token 和文本 token 的分布距离是否变小

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
