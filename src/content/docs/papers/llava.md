---
title: LLaVA Visual Instruction Tuning
来源: Liu et al., "Visual Instruction Tuning", NeurIPS 2023 / arXiv 2304.08485
description: 用一个小小的投影矩阵把 CLIP 视觉特征接到 LLaMA 的 token 空间，再用纯文本的 GPT-4 凭 caption + bbox 想象出 158K 条多模态指令数据，两阶段训练，做出第一个开源的视觉指令助手。
sidebar:
  label: LLaVA (NeurIPS 2023)
  order: 39
---

> 一句话：LLaVA 把 instruction tuning 这套大语言模型的训练范式搬到多模态——用 CLIP-ViT 当眼睛，LLaMA / Vicuna 当嘴和脑，中间塞一个可训练的投影层 W，再用纯文本的 GPT-4 自蒸馏出 158K 条 (image, instruction, response) 三元组当训练数据。两阶段、最简路径、第一个开源视觉对话助手。

## 历史定位

把视觉-语言这条线放到时间线上看：

- 2021-02 **CLIP**：图像编码器 + 文本编码器对比学习。它教会大家"图像和文本可以共享语义空间"，但 CLIP 本身不能"对话"——它只能算 image-text 相似度。
- 2022-01 **BLIP**：Q-Former 之类的"视觉到语言桥"开始出现，能做 captioning 和 VQA，但仍不是 open-ended 对话。
- 2022-04 **Flamingo (DeepMind)**：把视觉特征插到冻住的 LLM 中间层，能 few-shot，但闭源 + 训练数据闭源 + 模型 80B 不可复现。
- 2022-12 **ChatGPT** 出圈，证明 instruction tuning 对 LLM 是范式级提升。
- 2023-03 **GPT-4** 论文 hint 视觉能力，但产品 GPT-4V 要到 2023-09 才开放，且闭源。
- 2023-04 **MiniGPT-4 (KAUST)** 和 **LLaVA (Wisconsin + MSR)** 在同一个月放出预印本，几乎同时给出开源方案。MiniGPT-4 用 BLIP-2 的 Q-Former + Vicuna；LLaVA 用最简单的 linear projector + Vicuna。LLaVA 关键差异：**用 GPT-4 合成了 158K 多模态 instruction 数据**，并把训练范式公开化为"visual instruction tuning"。
- 2023-10 **LLaVA-1.5**：把 linear projector 换成 2-layer MLP，加入学术 VQA 数据（GQA / OKVQA / TextVQA / VizWiz），输入分辨率提到 336²。许多 benchmark 上反超 InstructBLIP。
- 2024-01 **LLaVA-NeXT (1.6)**：动态分辨率（最高 ~672²）、更强 OCR、更多语言。这是 method 分支 A 这条线在 2024 的延续。
- 2024-2025 商业模型（GPT-4V / Claude 3 视觉 / Gemini）和开源（Qwen-VL / Yi-VL / InternVL / Phi-3-Vision）各自演化，但底层结构都能在 LLaVA 这张图里找到对应——**vision encoder + projector + LLM** 是事实模板。

LLaVA 不是性能最强的模型，但它定义了**多模态 LLM 的最小可复现架构**。后面所有人都在它的骨架上加肉。

## 原文摘要翻译

人类通过视觉和语言这样的多个通道与世界交互，每个通道在表达和传达某些概念上都有独特优势。
人工智能的一个核心愿望，是开发一个能遵循多模态视觉与语言指令、与人类意图对齐、在真实场景中完成各种任务的通用助手。
为了这个目标，社区见证了开发语言增强的视觉模型的兴起——它们在分类、检测、分割、字幕等开放视觉理解任务以及视觉生成与编辑上有强大的能力。
然而这些工作中的语言常常被当作"仅描述图像内容"的载体，把语言模型限制在"图像被动描述者"的角色，让它无法对人类指令做交互式响应。

本文呈现了**视觉指令微调** (visual instruction tuning) 的首次尝试：用纯语言的 GPT-4 来生成多模态语言-图像指令跟随数据。
通过在该生成数据上做 instruction tuning，我们提出了 **LLaVA: Large Language and Vision Assistant**——
一个端到端训练的大型多模态模型，连接视觉编码器与 LLM，用于通用的视觉与语言理解。

为了便于未来对视觉指令跟随的研究，我们构建了两个评估 benchmark：
**LLaVA-Bench (COCO)** 和 **LLaVA-Bench (In-the-Wild)**。
实验显示 LLaVA 在多模态指令跟随上展示了印象深刻的能力，
有时甚至能在未见图像 / 指令上展现出与 GPT-4 类似的行为（在合成的多模态指令数据集上达到相对 GPT-4 85.1% 的得分）。
当与 ScienceQA 协同微调时，LLaVA + GPT-4 的协同方法达到了新的 SOTA 准确率 92.53%。
我们公开了 GPT-4 生成的视觉指令微调数据、模型和代码。

## Section 1: 动机——为什么需要 visual instruction tuning

回到 2023 年初：NLP 那边 instruction tuning（FLAN / T0 / InstructGPT）已经被证明是 LLM "从模型变助手"的关键一步。**ChatGPT 的爆发本质上是 instruction tuning + RLHF 让 GPT-3 学会接受人类指令。**

但视觉这边没有等价的范式。已有的视觉-语言模型大致分两类：

1. **图像-文本对齐**（CLIP / ALIGN）：学到了视觉-语言共享空间，但模型输出是"相似度分数"，不能对话。
2. **任务特定 fine-tune**（VQA / Captioning）：每个任务训一个模型，输出格式固定（一个词、一句话），不能 open-ended。

LLaVA 想做的是把 NLP 的 instruction tuning 思想完整搬过来。NLP 的 recipe 是：

```
预训练 LLM → 用 instruction-following 数据 fine-tune → 模型学会"接受任意自然语言指令并响应"
```

视觉版本应该是：

```
预训练 vision encoder + 预训练 LLM → 用 (image, instruction, response) 三元组 fine-tune
→ 模型学会"接受图像 + 任意自然语言指令并响应"
```

听起来直接，但卡在第二步：**没有 instruction-following 的多模态数据集**。COCO 只有 caption（不是指令），VQAv2 只有 5-词答案（不是对话），visual genome 只有结构化标注。手工标 100K 条多模态对话不现实。

LLaVA 的第一性创新就是这一步的解法：**用纯文本 GPT-4 当"看不见图但被告知图里有什么"的注释员**。GPT-4 不需要看图，它需要的输入是 caption + bounding box——这两个东西 COCO 都有。然后 GPT-4 编出 (Q, A) 对。这是 LLaVA 的工程聪明所在。

> 怀疑：为什么 GPT-4 编出来的"假对话"真的能教会模型多模态对齐？我的理解是——caption + bbox 已经把图像的语义骨架编码到文本里了，GPT-4 只是在这个骨架上做"文本世界的扩写"。最后 LLaVA 训练时，模型看到的是真图（CLIP 编码）+ GPT-4 编的文本响应，模型其实在学的是"CLIP 特征如何映射到自然语言响应分布"。GPT-4 的角色其实是"高质量响应分布生成器"，不是"图像理解器"。这套逻辑在 caption + bbox 涵盖语义的范围内成立，对超出 COCO 类别的图像（医疗、卫星、抽象艺术）理论上会差——后面 LLaVA-Med 等衍生确实印证了这点。

## Section 2: 三个核心 Definition

### Definition 1: visual instruction following

模型接受一对 (image $X_v$, instruction $X_q$)，输出文本响应 $X_a$：

$$X_a = f_\theta(X_v, X_q)$$

关键差异点和单模态 instruction following 比：

- 单模态：$X_q$ 完整描述任务（"翻译下面这句话"）。
- 多模态：$X_q$ 只是任务的一部分（"这张图里发生了什么"），剩下的语义在 $X_v$ 里。模型必须真的"看图"才能正确响应。

> 怀疑：visual instruction following 和 VQA 的边界其实模糊。VQA 也是 (image, question) → answer。差异是 instruction following 的输出可以是任意长文本（不止一个词）、任意任务（描述、推理、对比、分析），而 VQA 的输出格式被数据集限定。从训练角度看，它们的损失函数完全一样——cross entropy on text tokens。区别在数据分布。

### Definition 2: visual instruction tuning data

形式：$\{(X_v, X_q, X_a)\}_{i=1}^N$，其中 $X_a$ 是高质量响应。

LLaVA 做的事是：用 COCO 的 (image, caption, bbox) 三元组，转成 (image, instruction, response) 三元组——其中 image 不变，instruction 和 response 是 GPT-4 生成的。

数据规模：158K 样本（论文 §3 表 1）。其中 conversation 58K + detailed description 23K + complex reasoning 77K。

### Definition 3: LLaVA architecture

三个组件：

1. **Vision encoder** $g(\cdot)$：把图像 $X_v$ 编码成视觉特征 $Z_v = g(X_v)$。LLaVA 用 CLIP-ViT-L/14（224 px 在 v1，336 px 在 v1.5）。
2. **Projector** $W$：把视觉特征投到 LLM 的 token 空间，$H_v = W \cdot Z_v$。这是 LLaVA 全篇的"小但关键"的部分。
3. **LLM** $f_\phi$：接受 $[H_v; H_q]$（视觉 token 和文本 token concat 起来）作为前缀，自回归生成响应。LLaVA 用 LLaMA / Vicuna 7B 或 13B。

完整流程：

```
X_v --g--> Z_v --W--> H_v ---\
                              concat --> f_phi --> X_a
X_q --tokenize--> H_q --------/
```

参数量分配（13B 配置）：

| 组件 | 参数量 | 训练状态 |
|------|--------|----------|
| CLIP-ViT-L/14 | ~304 M | 全程冻结 |
| Projector W (linear) | ~4 M | 两阶段都训 |
| LLaMA / Vicuna 13B | ~13 B | 仅 stage 2 训 |

**绝大部分参数在 LLM**，projector 只是个小桥。这是 LLaVA 工程美学的核心——**不要重新发明视觉理解，用现成的；不要重新发明语言生成，用现成的；只训那座连接它们的小桥**。

## Section 3: 数据构建——158K 指令的炼成

这一节是 LLaVA 的核心创新。流程：

### 3.1 输入：COCO 三件套

每张 COCO 图片有：

- **captions**：人类标的 5 句简短描述。
- **bounding boxes**：每个物体的位置 [x1, y1, x2, y2]（归一化到 [0, 1]）+ 类别名。

这两样东西**纯文本**就能表示。GPT-4 不需要真的看图，它读 caption + 读 bbox 列表就足够。

举个具体样本（来自论文 §3 图 2，paraphrase）：

```
captions:
  "A man holding a small dog stands beside a parked motorcycle."
  "A guy with his pet next to a motorbike on a city street."

boxes:
  person:    [0.31, 0.22, 0.55, 0.78]
  dog:       [0.42, 0.51, 0.50, 0.71]
  motorcycle: [0.18, 0.43, 0.78, 0.92]
```

### 3.2 GPT-4 prompt 设计

LLaVA 给 GPT-4 三种 prompt（每种各一套 few-shot 例子，3-5 个手写示例）：

#### 3.2.1 Conversation prompt

> 你是一个能看见图像的 AI 助手。给定一张图（描述如下：caption + boxes），生成一段 user 和 assistant 之间的多轮对话。问题应该多样化（视觉内容、计数、相对位置、动作识别等），答案应该详细但不夸大图里没有的内容。

GPT-4 输出大约这样：

```
User: What is in this image?
Assistant: A man wearing casual clothing standing next to a motorcycle.
He is holding a small dog in his arms.

User: Where is the motorcycle?
Assistant: The motorcycle is on the street, parked. It takes up the lower
half of the image, indicating it's the closest object after the man.

User: Is the dog small?
Assistant: Yes — the dog's bounding box is much smaller than the man's,
suggesting it's a small breed, possibly held in his arms.
```

3-5 轮对话，58K 总样本。

#### 3.2.2 Detailed description prompt

> 给定图像（caption + boxes），生成一段长描述（80-150 词），覆盖物体、动作、空间关系、可能的场景背景。

输出 1 轮：(Q="Describe this image in detail.", A=长段描述)。23K 样本。

#### 3.2.3 Complex reasoning prompt

> 给定图像，提一个需要多步推理的问题（不能只看一眼就回答），并给出推理链 + 最终答案。

例：
```
Q: What might happen next in this scene?
A: The man might mount the motorcycle while still holding the dog. However,
   it would be safer to place the dog in a basket or carrier — riding with
   a small dog in arms is risky for both rider and pet.
```

77K 样本。

### 3.3 总规模 + 一些工程细节

- **158K 样本**总计。
- COCO train2014（83K 图像）每张图平均生成 ~2 个样本（不同类型混合）。
- GPT-4 API call 在 2023-04 时大约花了 几千美金（论文未公开精确数字，但根据 token 数估计）。
- 核心数据集后来发布在 Hugging Face：[liuhaotian/LLaVA-Instruct-150K](https://huggingface.co/datasets/liuhaotian/LLaVA-Instruct-150K)。

> 怀疑：LLaVA 用 GPT-4 生成训练数据，本质是 distillation 的现代版——把闭源大模型的知识 distill 到开源小模型。但这有合规问题：OpenAI 的 ToS 禁止用其输出训练竞品模型。LLaVA 走在灰色地带：他们训的是多模态模型（不是 NLP 竞品），且发表在学术会议而非商业产品。这套"学术研究 + 灰色 distillation"在 2023-2024 是开源界的事实做法（Vicuna 也是 ChatGPT distill）。但 2025 之后 OpenAI 开始更严的 token-level 检测——这条路越走越窄。

```
Algorithm 1: GPT-4 visual instruction data generation

input: COCO image with (captions, boxes)
output: K instruction-response pairs

for each image:
    text_repr = format_text(captions, boxes)  # 拼成 GPT-4 能读的纯文本
    for type in [conversation, detailed, reasoning]:
        prompt = system_prompt[type] + few_shot[type] + text_repr
        response = call_gpt4(prompt)  # 这里是 OpenAI API
        pairs = parse(response)        # 解析 GPT-4 的输出
        save((image_path, pairs))
```

## Section 4: 模型架构——projector W 是全篇主角

LLaVA 的架构图（[图 1 见下](#figure-1-architecture)）只有 3 个组件，但每个组件的选择都是经过权衡的。

### 4.1 Vision encoder：CLIP-ViT-L/14

为什么不用 ResNet？

- ResNet 输出是空间特征图（如 7×7×2048），需要 pooling 才能给 LLM 用，丢信息。
- CLIP-ViT-L/14 在 224×224 下输出 256 个 patch token（16×16 grid，每个 1024 维），自然对应 transformer 的 sequence。

为什么不用 DINOv2 或 MAE？

- 2023-04 时 DINOv2 刚出，还没成为默认。
- CLIP 的优势是"图像-文本已经对齐"——它的 visual feature 已经接近文本语义空间，projector 的工作量更小。

为什么 freeze？

- 工程考量：CLIP-ViT-L/14 304M 参数，加上 LLaMA 13B 一起训，单卡内存爆。
- 实验上：论文 §5.4 ablation 显示 freeze CLIP 不显著掉点，且训练快很多。

> 怀疑：freeze CLIP 是工程妥协，但实质上限制了视觉表征空间。GPT-4V / Gemini 这种闭源模型大概率是 fine-tune 整个 vision encoder 的（看效果差距）。LLaVA 的 freeze 设计在 2024 后开始过时——LLaVA-1.6 / Yi-VL 都开始解冻部分 vision layer。

### 4.2 Projector W：从 linear 到 MLP

LLaVA-1（v1, 2023-04 论文版本）：

$$H_v = W \cdot Z_v$$

W 是一个简单的线性层。CLIP 输出 1024 维，LLaMA hidden 4096 维，所以 W 是 (1024, 4096) 矩阵，参数量 ~4M。

LLaVA-1.5（2023-10 升级）改成 2-layer MLP：

$$H_v = W_2 \cdot \mathrm{GELU}(W_1 \cdot Z_v)$$

参数量 ~20M（仍然很小）。论文 §6 ablation 显示 MLP projector 比 linear 提 ScienceQA 1.5 个点，VQA 类任务普遍提 1-3 点。

> 怀疑：projector W 是 LLaVA 全篇的"信息瓶颈"。CLIP 输出 256 token × 1024 维 = 262K 数；LLaMA 接受这 256 token × 4096 维 = 1M 数。但 projector 是 per-token 独立映射（不混合 token），它本质是个"维度变换"而不是"信息重组"。是不是把 projector 做更复杂（cross-attention / Q-Former 那种）会更好？BLIP-2 和后来的 Qwen-VL 都尝试了 Q-Former 路线，但 LLaVA-1.5 实证 simple MLP 已经够用。这背后的直觉可能是：**CLIP 已经做了视觉-语义对齐，projector 不需要再做语义工作，只需要做坐标变换**。

### 4.3 LLM：LLaMA / Vicuna

为什么是 Vicuna 而不是裸 LLaMA？

- LLaMA 是预训练 base 模型，没经过 instruction tuning，对话能力差。
- Vicuna 是 LLaMA + ShareGPT 数据 instruction tune 后的版本，对话能力强。
- 用 Vicuna 当起点，LLaVA 只需要"教会它看图"，不需要再教"对话"。

7B vs 13B 选择？

- 7B：8 卡 A100 训 ~24 小时。
- 13B：8 卡 A100 训 ~48 小时。
- 13B 在大多数 benchmark 上比 7B 高 2-5 点，但对资源有限的复现者，7B 更友好。

## Section 5: 训练——两阶段配方

LLaVA 的训练拆成两阶段（论文 §4），逻辑清晰：

### Stage 1: feature alignment pre-training

**只训 projector W**，CLIP 和 LLM 都冻住。

数据：CC-595K——从 CC3M 过滤出的 595K 图像-caption 对（短 caption，1-2 句话）。

任务：给定图像，让 LLM 预测对应的 caption（CE loss on text tokens）。

目的：让 W 学会"把 CLIP 视觉 token 映射到 LLM 词嵌入空间的合适位置"。这个阶段不教模型对话，只教对齐。

训练超参：1 epoch，batch 128，lr 2e-3，cosine schedule。

> 怀疑：Stage 1 用 CC-595K 而不是更大的 LAION-400M 是工程考量（数据清洗成本）。如果用更大数据，projector 是否会学得更好？我猜会，但回报递减——projector 只是个 linear / MLP，参数量小，几百 K 样本已经过拟合点附近。

### Stage 2: end-to-end fine-tune

**训 projector W + LLM**，CLIP 仍冻住。

数据：158K visual instruction data（Section 3 生成的）+ 少量 ScienceQA（如果做 ScienceQA 实验）。

任务：标准的 instruction following——给定 (image, instruction)，让模型输出 response（CE loss on response tokens only，不算 instruction 的 loss）。

训练超参：3 epoch，batch 32，lr 2e-5（LLM）/ 2e-3（projector）。

为什么 projector lr 更大？projector 是 fresh 的，需要快速学习；LLM 已经预训练好，需要细调避免遗忘。

> 怀疑：3 epoch 是不是太少？NLP 的 InstructGPT / Vicuna 也是 3-5 epoch。多模态因为视觉信号比文本"密集"（一张图等价几百 token），更多 epoch 可能没必要。但反过来，158K 样本在 3 epoch 下只见过 470K 次，对 13B 模型这个比例其实偏小——LLaVA-1.5 把数据扩到 1.2M 之后效果好很多，印证了数据规模才是瓶颈。

## Figure 1: Architecture {#figure-1-architecture}

![LLaVA architecture: vision encoder + projector + LLM](/papers/llava/01-architecture.webp)

> 图 1：LLaVA 三件套——CLIP-ViT-L/14（蓝，冻结）做视觉编码，Projector W（橙，两阶段都训）做投影，LLaMA / Vicuna（紫，仅 stage 2 训）做语言生成。视觉 token 和文本 token concat 后作为 LLM 的前缀，自回归生成响应。

## Section 6: 实验结果

### 6.1 LLaVA-Bench (COCO)

LLaVA 自己造的 benchmark：从 COCO 抽 30 张图，每张配 3 类问题（conversation / detailed / reasoning），让 GPT-4（text-only，看 caption）当裁判，比较 LLaVA 输出和 GPT-4 输出的相对得分。

结果（论文 §5 表 4）：

| 模型 | conversation | detailed | reasoning | overall |
|------|--------------|----------|-----------|---------|
| BLIP-2 | 28.0 | 28.5 | 53.8 | 36.7 |
| OpenFlamingo-9B | 27.5 | 29.2 | 47.5 | 34.7 |
| MiniGPT-4 | 53.1 | 56.5 | 73.0 | 60.9 |
| LLaVA-7B | **80.1** | **74.7** | **94.7** | **83.1** |
| LLaVA-13B | **84.1** | **75.3** | **96.5** | **85.1** |

LLaVA 在三个维度都大幅领先同期开源模型。这里要注意：**裁判是 GPT-4**，所以分数偏向"GPT-4 喜欢的风格"——LLaVA 的训练数据本来就是 GPT-4 生成的，输出风格自然更贴近 GPT-4。这是个公开的 confound。

### 6.2 ScienceQA

ScienceQA 是中学科学题（多选），含图像。LLaVA-13B + ScienceQA fine-tune 得到 90.92%，LLaVA-13B + GPT-4 协同（LLaVA 给候选，GPT-4 选最优）得到 92.53%——当时的 SOTA。

> 怀疑：ScienceQA 是多选，本质上是分类任务，LLaVA 的"对话能力"在这里不重要。这个 benchmark 更像是测 multimodal QA，跟 visual instruction following 的对话性其实关系不大。LLaVA 在 ScienceQA 拿 SOTA 主要是因为 LLM 的常识 + projector 把视觉接进来，而不是因为它"会对话"。

### 6.3 LLaVA-Bench (In-the-Wild)

24 张图，不限 COCO 类别（含画作、表情包、迷因、历史照片）。这个 benchmark 更接近真实使用场景。

LLaVA-13B 拿到 76.6（相对 GPT-4）。比 COCO 那个低（85.1），符合预期——训练数据是 COCO，迁移到非 COCO 图像有 gap。

### 6.4 LLaVA-1.5 升级后的 benchmark 表现

LLaVA-1.5（2023-10）在 11 个 benchmark 上和 InstructBLIP / Qwen-VL 对比（论文 v2 表 1）：

| Benchmark | InstructBLIP-13B | Qwen-VL-Chat | LLaVA-1.5-13B |
|-----------|------------------|--------------|---------------|
| VQAv2 | – | 78.2 | **80.0** |
| GQA | 49.5 | 57.5 | **63.3** |
| ScienceQA-IMG | – | 68.2 | **71.6** |
| TextVQA | 50.7 | **61.5** | 61.3 |
| POPE | 78.9 | – | **85.9** |
| MM-Vet | 25.6 | – | **35.4** |

绝大多数 benchmark LLaVA-1.5 反超。关键升级：MLP projector + 学术 VQA 数据加入 + 输入分辨率 336 + 训练数据 1.2M。

## Figure 2: Data Pipeline {#figure-2-data}

![Visual instruction data: GPT-4 self-distillation from COCO](/papers/llava/02-data-pipeline.webp)

> 图 2：158K instruction 数据是怎么炼成的——COCO 的 caption + bbox 喂给纯文本 GPT-4（GPT-4 看不到原图），让它分别按 conversation / detailed description / complex reasoning 三种 prompt 生成响应。三类样本数：58K + 23K + 77K = 158K。

## Section 7: LLaVA-1.5 的具体改进

LLaVA-1.5（论文 v2 / arXiv 2310.03744 是单独的"Improved Baselines"短文）改了 4 件事：

1. **MLP projector 替代 linear**：W₁(1024→4096) + GELU + W₂(4096→4096)。在 ScienceQA 提 1.5 点，VQA 类提 1-3 点。
2. **学术任务数据加入**：除 158K 指令数据，加入 OKVQA (9K) / TextVQA (35K) / GQA (72K) / VizWiz (20K) / OCRVQA (165K) 等。整个 stage 2 数据量 ~660K。
3. **Region-level / Multi-image 任务**：加入 RefCOCO（指代分割）、Visual Genome 等，让模型能处理 grounding。
4. **输入分辨率提升**：CLIP-ViT-L/14 从 224 升到 336（CLIP 提供两个版本）。token 数从 256 升到 576，输入更精细。

总训练成本：8×A100，~13B 模型约 1.5 天。在学术界是可复现的预算——这是 LLaVA 系列影响力大的关键之一。

> 怀疑：LLaVA-1.5 的 660K 数据混合里，学术 VQA 占大头（~500K），instruction 数据只占 158K。这意味着模型主要学的是"VQA 风格"而不是"对话风格"。但 benchmark 衡量的也是 VQA 类——这变成了"训什么测什么"的循环。LLaVA-1.5 在 LLaVA-Bench (In-the-Wild) 这种开放对话上的提升其实没那么大（76→78）。

## Section 8: 后续 + 衍生工作

LLaVA 像生命树的主干，后面分出很多枝：

### 8.1 同期开源竞争

- **MiniGPT-4** (2023-04, KAUST)：BLIP-2 Q-Former + Vicuna。比 LLaVA 数据少（5K 高质量样本），但效果接近。
- **mPLUG-Owl** (2023-04, 阿里 DAMO)：Visual abstractor + LLaMA。
- **InstructBLIP** (2023-05, Salesforce)：BLIP-2 升级版，加 instruction-aware Q-Former。

### 8.2 LLaVA 自己的演进

- **LLaVA-1.5** (2023-10)：上面 Section 7 说过。
- **LLaVA-NeXT / LLaVA-1.6** (2024-01)：动态分辨率（最高 ~672²，能更好处理高清图和 OCR）、多语言、video 支持。
- **LLaVA-OneVision** (2024-08)：image / multi-image / video 统一。
- **LLaVA-CoT** (2024-11)：思维链推理。

### 8.3 领域适配 / 衍生

- **LLaVA-Med** (2023-06)：医疗影像（PathVQA、SLAKE 等 benchmark）。证明 LLaVA 框架可以迁移到专业领域，但需要领域数据 fine-tune。
- **Video-LLaVA** (2023-11)：视频帧 + 时序融合。
- **LLaVA-3D** (2024)：3D 场景理解。

### 8.4 商业 / 工业级模型

- **GPT-4V** (2023-09)：闭源，但 OpenAI 公开的 system card 提到的方案大方向相似（vision encoder + LLM + projector）。
- **Claude 3 Opus / Sonnet 视觉** (2024-03)：Anthropic 没披露架构，但行为一致。
- **Gemini Pro Vision** (2023-12)：Google 自研，原生多模态训练（不是事后 retrofit）。
- **Qwen-VL / Qwen2-VL** (阿里, 2023-08+)：开源商业级，明确借鉴 LLaVA 数据合成思路。
- **Yi-VL** (零一万物, 2024-01)：类 LLaVA 架构，强调中英双语。
- **InternVL** (上海 AI Lab, 2024)：把 vision encoder 也 scale 到 6B+，实验证明大 vision encoder 配大 LLM 是必要的。
- **Phi-3-Vision** (微软, 2024-05)：小模型版本，4B 参数能跑端侧。

到 2025 年，几乎所有开源多模态 LLM 都能在 LLaVA 这张架构图里找到对应。LLaVA 的影响不是"做了最强的模型"，而是"把多模态 LLM 的最简模板钉死了"——后面所有人都在加肉，但骨架是 LLaVA 定的。

## Section 9: 代码与工程参考

LLaVA 的开源代码值得读，结构清晰，是学习多模态 LLM 实现的最佳起点。

### 9.1 模型主体

仓库 [haotian-liu/LLaVA](https://github.com/haotian-liu/LLaVA)，commit `c121f0432da27facab705978f83c4ada465e46f1`（链接示意，~2024 中期版本）：

- 架构定义：[`llava/model/llava_arch.py`](https://github.com/haotian-liu/LLaVA/blob/c121f0432da27facab705978f83c4ada465e46f1/llava/model/llava_arch.py)
  这里实现 `LlavaMetaModel.initialize_vision_modules`，加载 CLIP，初始化 projector。`prepare_inputs_labels_for_multimodal` 是关键函数：把 image token 和 text token 拼成 LLM 的 input。
- 训练入口：[`llava/train/train.py`](https://github.com/haotian-liu/LLaVA/blob/c121f0432da27facab705978f83c4ada465e46f1/llava/train/train.py)
  Stage 1 / Stage 2 通过 `--tune_mm_mlp_adapter` / `--freeze_backbone` 等 flag 切换。
- 数据 pipeline：[`llava/train/llava_trainer.py`](https://github.com/haotian-liu/LLaVA/blob/c121f0432da27facab705978f83c4ada465e46f1/llava/train/llava_trainer.py)

### 9.2 Hugging Face 集成

`transformers` 在 4.36+ 内置 LLaVA 支持，commit `a7f09b4f8f2fa6b1e3b4b5c5d2c1d8e9f0a1b2c3`（链接示意）：

- 模型实现：[`src/transformers/models/llava/modeling_llava.py`](https://github.com/huggingface/transformers/blob/a7f09b4f8f2fa6b1e3b4b5c5d2c1d8e9f0a1b2c3/src/transformers/models/llava/modeling_llava.py)
  `LlavaForConditionalGeneration` 是入口，`_merge_input_ids_with_image_features` 实现 token 合并。
- Processor：[`src/transformers/models/llava/processing_llava.py`](https://github.com/huggingface/transformers/blob/a7f09b4f8f2fa6b1e3b4b5c5d2c1d8e9f0a1b2c3/src/transformers/models/llava/processing_llava.py)
  把图像 + 文本预处理成模型输入。

### 9.3 PyTorch 简化复现

如果只想理解核心逻辑，可以写一个 100 行左右的 minimal LLaVA：

```python
import torch
import torch.nn as nn
from transformers import CLIPVisionModel, AutoModelForCausalLM, AutoTokenizer

class MinimalLLaVA(nn.Module):
    def __init__(self, vision_model="openai/clip-vit-large-patch14-336",
                 llm_model="lmsys/vicuna-7b-v1.5"):
        super().__init__()
        # 1. Vision encoder (frozen)
        self.vision_encoder = CLIPVisionModel.from_pretrained(vision_model)
        for p in self.vision_encoder.parameters():
            p.requires_grad = False

        # 2. LLM
        self.llm = AutoModelForCausalLM.from_pretrained(llm_model)
        self.tokenizer = AutoTokenizer.from_pretrained(llm_model)

        # 3. Projector W (2-layer MLP, LLaVA-1.5 style)
        vision_dim = self.vision_encoder.config.hidden_size  # 1024
        llm_dim = self.llm.config.hidden_size  # 4096
        self.projector = nn.Sequential(
            nn.Linear(vision_dim, llm_dim),
            nn.GELU(),
            nn.Linear(llm_dim, llm_dim),
        )

    def forward(self, images, input_ids, labels=None):
        # 1. Encode image -> (B, 256, 1024) for ViT-L/14 @ 224
        with torch.no_grad():
            visual_features = self.vision_encoder(images).last_hidden_state[:, 1:, :]
            # 去掉 CLS token，剩 256 patch token

        # 2. Project to LLM space -> (B, 256, 4096)
        visual_tokens = self.projector(visual_features)

        # 3. Get text embeddings -> (B, T, 4096)
        text_embeds = self.llm.get_input_embeddings()(input_ids)

        # 4. Concat: [visual; text]
        inputs_embeds = torch.cat([visual_tokens, text_embeds], dim=1)

        # 5. Forward through LLM
        outputs = self.llm(inputs_embeds=inputs_embeds, labels=labels)
        return outputs
```

这 ~30 行就是 LLaVA 的全部。没有奇技淫巧，没有复杂的 cross-attention，就是简单的 concat。这是 LLaVA 设计哲学的体现——**最简路径，让数据和规模说话**。

## Section 10: 局限性

LLaVA 不完美，论文 §6.3 自己列了一些，加上后续工作发现的：

1. **GPT-4 生成数据的偏见**：GPT-4 没真的看图，它看的是 caption + bbox。caption 写得不好的图，GPT-4 编出的对话可能偏离图像本身。这导致 LLaVA 在"caption 不完整"或"caption 错误"的图上表现差。
2. **Vision encoder freeze 的限制**：CLIP-ViT 的视觉表征空间是固定的，对 OOD 图像（医疗、卫星、古文字、艺术作品）覆盖不好。LLaVA 在这些领域的表现远不如自然图像。
3. **Projector 是信息瓶颈**：linear / MLP 是 per-token 独立映射，没有 cross-token 交互。复杂场景的全局推理（"图里所有红色物体的总数"）需要 LLM 在 token 间做注意力——但 LLM 不一定擅长在 visual token 上做这件事。
4. **高分辨率成本指数**：CLIP-ViT 的 token 数 = (W/14)²。224 → 336 token 数从 256 → 576；336 → 1024 会是 5184。LLM 输入长度爆炸，训练成本指数增长。LLaVA-NeXT 用动态分辨率 / 切片缓解，但本质问题没解决。
5. **Hallucination**：LLaVA 继承了 LLM 的 hallucination 问题——会编造图里没有的物体（"图里有一只猫"，但其实没有）。POPE benchmark 衡量这个，LLaVA-1.5 在 POPE 上达到 85.9，比早期模型好但远没解决。
6. **多图 / 视频不擅长**：原始 LLaVA 只支持单图。多图、视频、3D 场景需要后续扩展（LLaVA-NeXT、Video-LLaVA、LLaVA-3D）。
7. **OCR 弱**：低分辨率（224 / 336）下文字密集图（文档、表格、图表）OCR 几乎无法工作。LLaVA-1.6 的 672² 才开始能用。
8. **训练数据偏自然图**：COCO 是日常场景，LLaVA 对工业图（电路图、CAD、医疗影像）几乎是零样本失败。

## Section 11: 学到什么——零基础角度

如果你像我一样在视觉-语言模型这条线刚起步，LLaVA 给的核心 takeaway：

1. **多模态 LLM 不需要重新发明轮子**。Vision encoder 用 CLIP（或后来的 SigLIP / DINOv2），LLM 用 LLaMA / Vicuna / Qwen，中间一个小 projector 接起来——这是事实模板。
2. **数据合成是关键技能**。LLaVA 用 GPT-4 合成 158K 训练数据，Vicuna 用 ChatGPT 合成对话，Phi 系列用 GPT-4 合成教科书数据——2023 之后，"如何用强模型 distill 出高质量数据"成了和"如何写 model code"同等重要的能力。
3. **两阶段训练是事实标准**。Stage 1 训桥（projector），Stage 2 fine-tune 整体。这套 recipe 几乎所有 multimodal LLM 都在用。
4. **简单优于复杂**。BLIP-2 用 Q-Former（带可学习 query 的 transformer），LLaVA 用 linear，结果 LLaVA 更好——前提是数据足够多。当你不确定该用什么架构时，先试简单的，跑得动了再加复杂度。
5. **裁判偏向训练分布**。LLaVA 用 GPT-4 当裁判，且训练数据也是 GPT-4 生成——这套循环在数字上很好看，但要警惕"自己评自己"的偏差。

## 关联阅读

- [[clip]] CLIP：LLaVA 的眼睛。理解 LLaVA 必先理解 CLIP 把图像-文本对齐到共享空间。
- [[vit]] Vision Transformer：CLIP-ViT-L/14 的骨干。理解 patch token、ViT 的 sequence 结构有助于理解 projector 为什么是 per-token 线性映射。
- [[resnet]] ResNet：LLaVA 没用，但作为对比——为什么 ResNet 不适合接 LLM（输出不是 sequence）。
- [[sam]] SAM：另一个用 ViT 当 encoder 的工作（segmentation 方向）。LLaVA + SAM 融合是 2024 的热点（grounding LLaVA）。
- [[dino]] DINO / DINOv2：自监督视觉表征。LLaVA-1.6 之后开始尝试用 DINOv2 替代 CLIP-ViT，看视觉理解是否更强。
- [[mae]] MAE：另一种视觉 SSL。和 CLIP 互补——CLIP 学语义，MAE 学纹理。多模态 LLM 是否该用 MAE 还是 CLIP，2024 仍有争论。

## 一句话回顾

LLaVA = CLIP-ViT（眼睛，冻结）+ 一个小 projector W（小桥，重点训）+ LLaMA / Vicuna（嘴和脑，stage 2 训）+ 用 GPT-4 凭 caption + bbox 编出来的 158K 多模态指令数据。两阶段训练，最简路径，第一个开源视觉对话助手，定义了之后所有多模态 LLM 的事实模板。
