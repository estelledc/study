---
title: LLaVA — 开源多模态对话模型
来源: 'Liu et al., "Visual Instruction Tuning", NeurIPS 2023'
日期: 2026-05-29
分类: 多模态 / NLP
难度: 中级
---

## 是什么

LLaVA（**Large Language and Vision Assistant**）是 2023 年威斯康辛大学 + 微软推出的**开源视觉指令微调代表作**——用纯文本 GPT-4 编多模态对话数据，再把眼睛接到语言模型上。

日常类比：[[llama]] 是个只能听不能看的助手——你说什么它接什么；LLaVA 给它装了一双眼睛（[[clip]] 视觉编码器），从此它能"边看图边和你聊"。

你给 LLaVA 一张图 + 一句话：

```
[picture of a man holding a small dog beside a motorcycle]
User: 这张图发生了什么？
```

LLaVA 输出：

```
Assistant: 一名男子站在路边停的摩托车旁，手里抱着一只小狗。
看起来他可能正要骑车，但带着小狗这样做不太安全，建议把
狗放进专用宠物箱里再上路。
```

它不是只会"念出图里有什么"，它能**理解图、回答问题、给建议**——并把完整数据与训练 recipe 公开，让后来者能复现。

## 为什么重要

不知道 LLaVA，下面这些事都没法解释：

- 为什么 2023 年下半年突然冒出一堆"开源多模态模型"——LLaVA-NeXT、Qwen-VL、InternVL、Yi-VL 都长得很像，**它们的骨架都是 LLaVA 定下来的**
- 为什么 GPT-4V 闭源的同时，开源圈不到一年就追上来了——LLaVA 给了一份**任何人 8 张 A100 一天能复现**的方案
- 为什么 "用 GPT 生成训练数据训 GPT 替代品" 这种做法 2023 年突然遍地都是——LLaVA 用纯文本 GPT-4 编出 158K 多模态对话数据，是这套范式的代表作
- 为什么所有现代多模态 LLM 都长成 "视觉编码器 + 投影层 + 语言模型" 这个模板——这就是 LLaVA 的架构图

LLaVA 不是性能最强的模型，但它**定义了开源多模态 LLM 的最简模板**。后面所有人都在它的骨架上加肉。

## 核心要点

LLaVA 由 **三块** 拼成，每块各管一件事：

1. **眼睛**：[[clip]] 的视觉编码器（CLIP-ViT-L/14）。把一张 224×224 的图切成 16×16=256 个小块，每块编成一个 1024 维的向量。这一步把"图像"变成"视觉 token 序列"。这块**全程冻住，不训**——因为 CLIP 已经把图像和文字对齐过了。

2. **小桥**：投影层 W（projector）。CLIP 输出的 1024 维 ≠ [[llama]] 的 4096 维 token 空间，需要一个矩阵把维度变换过去。一开始是单层线性，后来 LLaVA-1.5 升级成两层 MLP。这块**很小（~4M 参数），但全程都训**——因为它是连接视觉和语言的关键桥。

3. **嘴和脑**：[[llama]] / Vicuna 大语言模型。接收 "视觉 token + 文字 token" 拼起来的输入，自回归生成响应。这块**只在第二阶段训**。

类比："眼睛已经能看了（CLIP 训过），脑子已经会说话了（LLaMA 训过），缺的是把眼睛接到脑子里的那条神经——这就是 projector W 干的事"。

LLaVA 的训练分 **两阶段**：

- **第 1 阶段：教小桥对齐**。冻住 CLIP 和 LLaMA，只训 projector W。给它看 595K 张图配 caption，让它学会"把视觉特征翻译到 LLM 词嵌入空间"。
- **第 2 阶段：教整体对话**。CLIP 仍冻住，训 projector + LLaMA。喂 158K 条 (image, instruction, response) 数据，教模型按指令应答。

## 实践案例

### 案例 1：158K 训练数据是怎么"无中生有"的

LLaVA 最关键的工程聪明：**用纯文本 GPT-4 编出多模态训练数据**。

听起来矛盾——GPT-4 文字版根本看不到图，怎么生成多模态数据？答案：

- COCO 数据集里每张图本身就有人类标的 **caption**（5 句描述）+ **bounding box**（每个物体的位置 + 类别名）
- 把这些**纯文本信息**喂给 GPT-4，让它"假装看见图"，编出 user-assistant 对话
- 训练时模型看到的是**真图**（CLIP 编码）+ GPT-4 编的**响应**

举例：

```
喂给 GPT-4 的纯文本：
  caption: "A man holding a small dog stands beside a parked motorcycle."
  boxes:
    person:     [0.31, 0.22, 0.55, 0.78]
    dog:        [0.42, 0.51, 0.50, 0.71]
    motorcycle: [0.18, 0.43, 0.78, 0.92]

GPT-4 编出：
  User: 图里有什么？
  Assistant: 一个男人站在停着的摩托车旁，手里抱着一只小狗。
  User: 摩托车在哪个位置？
  Assistant: 摩托车在画面下半部分，是除男人以外最近的物体。
```

158K 条这样的样本，COCO 8 万张图，每张平均出 2 条。

### 案例 2：完整推理流程

```
图片 → CLIP-ViT → 256 个 1024 维视觉特征
                       ↓
                  projector W
                       ↓
                256 个 4096 维视觉 token ─┐
                                         concat → LLaMA → 文字响应
"描述这张图" → tokenize → 文字 token ─────┘
```

整个 forward 一次，模型把视觉信息当作 LLM 输入的"前缀"，剩下的事全交给 LLM 自回归生成。**没有跨模态 attention 的奇技淫巧，就是 concat。**

### 案例 3：最小 PyTorch 骨架

```python
class MinimalLLaVA(nn.Module):
    def __init__(self):
        self.vision = CLIPVisionModel.from_pretrained("openai/clip-vit-large-patch14")
        for p in self.vision.parameters():
            p.requires_grad = False  # 冻住眼睛
        self.llm = AutoModelForCausalLM.from_pretrained("lmsys/vicuna-7b-v1.5")
        self.projector = nn.Linear(1024, 4096)  # 小桥

    def forward(self, images, input_ids):
        visual_feat = self.vision(images).last_hidden_state[:, 1:, :]
        visual_tok = self.projector(visual_feat)
        text_emb = self.llm.get_input_embeddings()(input_ids)
        return self.llm(inputs_embeds=torch.cat([visual_tok, text_emb], dim=1))
```

冻 CLIP → 线性投影 → concat → LLM，就是 LLaVA 的全部骨架。

## 踩过的坑

1. **GPT-4 没真的看图**：它只读 caption + bbox 编对话。caption 写得不好的图，编出的对话会偏离真实内容。LLaVA 在 caption 不全的图上表现差，源头在这。

2. **冻住的 CLIP 限制视觉表征**：自然图（COCO 风格）效果好；医疗影像、卫星图、CAD 图 LLaVA 几乎零样本失败。LLaVA-1.6 之后开始解冻部分 vision 层。

3. **高分辨率成本指数爆炸**：CLIP token 数 = (W/14)²。224 → 256 token，336 → 576，672 会到 2304。LLM 输入长度爆炸——LLaVA-NeXT 用"切片 + 动态分辨率"才勉强缓解。

4. **会编**：LLaVA 继承了 LLM 的幻觉——会说"图里有一只猫"，但其实没有。POPE benchmark 专测这个，LLaVA-1.5 约 85.9，比早期好但远没解决。

## 适用 vs 不适用场景

**适用**：

- 自然图上的多轮视觉对话、通用 VQA、教学演示「视觉编码器 + 投影 + LLM」模板
- 有 1–8 张 A100 级 GPU、想复现开源多模态指令微调 recipe（约一天量级）
- 需要公开权重/数据、可本地部署的轻量多模态助手原型（7B 级 Vicuna 骨干）

**不适用**：

- 医疗影像、卫星、CAD 等域外视觉——冻住的 CLIP 几乎零样本失败
- 强 OCR、超高分辨率文档理解——224/336 默认分辨率不够，需 LLaVA-NeXT 或专用 OCR 模型
- 幻觉敏感的生产问答——POPE 仍远未到可无人值守上线
- 只要「图文检索/相似度」——直接用 [[clip]]，不必上整套对话 LLM

## 历史小故事（可跳过）

- **2021-02**：[[clip]] 发布，图像-文本对齐能学到共享语义，但不会对话。
- **2022-12**：ChatGPT 出圈，instruction tuning 成为「模型变助手」钥匙。
- **2023-04**：LLaVA 1.0 发布；同月 MiniGPT-4 也出现，LLaVA 差异是公开 158K 数据与完整 recipe。
- **2023-10**：LLaVA-1.5——MLP projector + 学术 VQA + 336 分辨率，多 benchmark 反超 InstructBLIP。
- **2024-01**：LLaVA-NeXT 加动态分辨率与更强 OCR；此后 Qwen2-VL / InternVL2 等沿同一骨架冲 SOTA。

## 学到什么

1. **多模态 LLM 不需要重新发明轮子**——[[clip]] 当眼睛 + [[llama]] 当嘴 + 小 projector，是事实模板。
2. **数据合成是关键技能**——用强模型 distill 高质量数据，和写 model code 同等重要。
3. **两阶段训练**——先训桥（feature alignment），再 visual instruction tuning；后续多模态 LLM 多沿用。
4. **简单优于复杂**——BLIP-2 的 Q-Former 更复杂，LLaVA 用线性层却更好，前提是数据够。

## 延伸阅读

- 论文：[Visual Instruction Tuning (arXiv:2304.08485)](https://arxiv.org/abs/2304.08485)
- 项目页：[llava-vl.github.io](https://llava-vl.github.io/)
- 代码：[haotian-liu/LLaVA](https://github.com/haotian-liu/LLaVA)
- [[clip]] —— 视觉编码器从哪来
- [[llama]] —— 语言模型骨干与 Vicuna 指令微调

## 关联

- [[clip]] —— LLaVA 的眼睛；理解图像-文本对齐才能懂冻住视觉塔
- [[llama]] —— LLaVA 的嘴和脑；实际用的是 Vicuna
- [[transformer]] —— CLIP-ViT 与 LLaMA 都基于它；projector 是 per-token 线性映射
- [[attention]] —— 视觉 token 与文字 token 在 LLM 里一起做自注意力
- [[gpt-3]] —— 指令跟随与规模化 LLM 能力的上游背景

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
