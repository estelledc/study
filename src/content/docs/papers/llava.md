---
title: LLaVA — 开源多模态对话模型
来源: 'Liu et al., "Visual Instruction Tuning", NeurIPS 2023'
日期: 2026-05-29
子分类: 多模态 / NLP
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

LLaVA（**Large Language and Vision Assistant**）是 2023 年威斯康辛大学 + 微软推出的**第一个开源的"看图说话"对话模型**。

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

它不是只会"念出图里有什么"，它能**理解图、回答问题、给建议**——这是 2023 年开源世界第一次做到。

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

### 案例 3：LLaVA 30 行 PyTorch 复现核心

```python
import torch.nn as nn
from transformers import CLIPVisionModel, AutoModelForCausalLM

class MinimalLLaVA(nn.Module):
    def __init__(self):
        super().__init__()
        self.vision = CLIPVisionModel.from_pretrained("openai/clip-vit-large-patch14")
        for p in self.vision.parameters():
            p.requires_grad = False  # 冻住眼睛

        self.llm = AutoModelForCausalLM.from_pretrained("lmsys/vicuna-7b-v1.5")
        self.projector = nn.Linear(1024, 4096)  # 小桥

    def forward(self, images, input_ids):
        with torch.no_grad():
            visual_feat = self.vision(images).last_hidden_state[:, 1:, :]
        visual_tok = self.projector(visual_feat)
        text_emb = self.llm.get_input_embeddings()(input_ids)
        inputs = torch.cat([visual_tok, text_emb], dim=1)
        return self.llm(inputs_embeds=inputs)
```

这就是 LLaVA 的全部。简单到出奇——**让数据和规模说话**。

## 踩过的坑

1. **GPT-4 没真的看图**：它只读 caption + bbox 编对话。caption 写得不好的图，编出的对话会偏离真实内容。LLaVA 在 caption 不全的图上表现差，源头在这。

2. **冻住的 CLIP 限制视觉表征**：自然图（COCO 风格）效果好；医疗影像、卫星图、CAD 图 LLaVA 几乎零样本失败。LLaVA-1.6 之后开始解冻部分 vision 层。

3. **高分辨率成本指数爆炸**：CLIP token 数 = (W/14)²。224 → 256 token，336 → 576，672 会到 2304。LLM 输入长度爆炸——LLaVA-NeXT 用"切片 + 动态分辨率"才勉强缓解。

4. **会编**：LLaVA 继承了 LLM 的幻觉——会说"图里有一只猫"，但其实没有。POPE benchmark 专测这个，LLaVA-1.5 拿 85.9，比早期好但远没解决。

## 历史小故事（可跳过）

- **2021-02**：[[clip]] 发布，证明 "图像编码器 + 文本编码器对比学习" 能学到视觉-语言共享语义。但 CLIP 只能算相似度，不会对话。
- **2022-12**：ChatGPT 出圈，证明 instruction tuning 是 LLM "从模型变助手"的范式级钥匙。
- **2023-04**：LLaVA 1.0 论文发布。同一个月 KAUST 的 MiniGPT-4 也放了出来，但 LLaVA 关键差异是**公开了 158K GPT-4 合成数据**和**完整训练 recipe**。
- **2023-09**：GPT-4V 开放，但闭源、贵、不透明。
- **2023-10**：LLaVA-1.5 升级——MLP projector + 学术 VQA 数据 + 336 分辨率。在 11 个 benchmark 上反超 InstructBLIP / Qwen-VL。
- **2024-01**：LLaVA-NeXT (1.6) 加动态分辨率（最高 ~672²）+ 更强 OCR + 多语言。
- **2024-2025**：Qwen2-VL / InternVL2 / Phi-3-Vision 把 LLaVA 思路推到 SOTA，几乎所有开源多模态 LLM 都能在 LLaVA 那张架构图里找到对应。

## 学到什么

1. **多模态 LLM 不需要重新发明轮子**——[[clip]] 当眼睛 + [[llama]] 当嘴 + 中间小 projector，是事实模板。
2. **数据合成是 2023 年新关键技能**——"用强模型 distill 出高质量数据"和"写 model code"同等重要。LLaVA 用 GPT-4 编 158K 多模态数据，是这套 recipe 的代表作。
3. **两阶段训练**——先训桥（feature alignment），再 fine-tune 整体（visual instruction tuning）。所有后续多模态 LLM 都沿用这个套路。
4. **简单优于复杂**——BLIP-2 用复杂的 Q-Former，LLaVA 用线性层，结果 LLaVA 更好。前提是数据足够多。

## 关联

- [[clip]] —— LLaVA 的眼睛。理解 LLaVA 必先理解 CLIP 把图像-文本对齐到共享空间
- [[llama]] —— LLaVA 的嘴和脑。LLaVA 用的是 LLaMA 的 instruction-tuned 版本 Vicuna
- [[transformer]] —— CLIP-ViT 和 LLaMA 都基于 transformer；理解 patch token + attention 才能读懂 projector 为什么是 per-token 线性映射

## 适用

**适合**
- 在本地部署开源多模态 LLM（图文理解、VQA、OCR 辅助）
- 学习多模态对齐架构（结构简单、代码开放，是很好的入门实现）

**不适合**
- 生产级高精度多模态任务（优先看 GPT-4V、Qwen2-VL 等后续工作）

## 延伸阅读

- [LLaVA 项目主页](https://llava-vl.github.io/) — 含代码、demo、模型下载
- [[clip]] — 图文对齐的核心前置知识
- [[attention]] — patch token 如何流经注意力层的基础

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[align-2021]] —— ALIGN — 用 18 亿条脏图文对训练，证明数据规模能压住噪声
- [[attention]] —— Attention Is All You Need
- [[chat-univi-2023]] —— Chat-UniVi — 动态视觉 token 统一图像与视频对话
- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[filip-2021]] —— FILIP — 把 CLIP 的图文对齐细化到 token 级
- [[grounded-videollm-2024]] —— Grounded-VideoLLM — 双流编码 + 时间 token，把「何时发生」写进 Video LLM
- [[hour-llava-2025]] —— Hour-LLaVA — 记忆增强，让 LLaVA 读懂一小时视频
- [[internvideo]] —— InternVideo — 上海 AI Lab 视频基础模型套件
- [[internvl-2023]] —— InternVL — 6B 视觉基座 + QLLaMA 对齐开源多模态
- [[llama]] —— LLaMA — Meta 开源大语言模型
- [[llama-vid-2023]] —— LLaMA-VID — 每帧两枚 token，把小时级视频塞进 LLM
- [[llava-next]] —— LLaVA-NeXT — 图像/视频/交织统一多模态主线仓库
- [[llava-onevision-2024]] —— LLaVA-OneVision — 单图、多图、视频一个模型全搞定
- [[llava-video-2024]] —— LLaVA-Video — LLaVA-NeXT 视频主线，合成数据 + SlowFast 采帧
- [[longva-2024]] —— LongVA — 把语言模型的长上下文能力「搬」到视频上
- [[lvbench-2024]] —— LVBench — 平均 68 分钟、六维能力的长视频极限考
- [[minicpm-v-2024]] —— MiniCPM-V — 手机能跑的 GPT-4V 级多模态模型
- [[mplug-owl-2023]] —— mPLUG-Owl — 模块化拼装多模态大模型
- [[mvbench-2023]] —— MVBench — 二十道题拆穿视频大模型真懂还是装懂
- [[nvila-2024]] —— NVILA — 先放大分辨率再压缩 token 的高效 VLM
- [[pillow]] —— Pillow — Python 图像处理库与 PIL 现代继任者
- [[qwen2-vl-2024]] —— Qwen2-VL — 动态分辨率 + M-RoPE，工业级视频理解的里程碑
- [[sharegpt4video-2024]] —— ShareGPT4Video — 用 GPT-4V 级密集字幕，喂饱视频理解与生成
- [[st-llm-2024]] —— ST-LLM — 把所有时空 token 交给 LLM，让它自己学时序
- [[timemarker-2024]] —— TimeMarker — 时间分隔符 + 任意长度采帧的视频定位大模型
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[video-chatgpt-2023]] —— Video-ChatGPT — 让大语言模型看懂视频并聊起来
- [[video-llava-2024]] —— Video-LLaVA — 投影之前先对齐，图像和视频共用一个 LLM
- [[videochat-2023]] —— VideoChat — 把视频、指令微调、多轮对话第一次放进同一个系统
- [[videollama2]] —— VideoLLaMA2 — 阿里达摩院音视频 Video-LLM 可运行实现
- [[videollama2-2024]] —— VideoLLaMA 2 — 时空卷积连接器 + 音视频联合理解
- [[vsi-bench-2024]] —— VSI-Bench — 用室内漫游视频考视频大模型的空间智商
- [[vtimellm-2023]] —— VTimeLLM — 让 Video LLM 学会标出事件起止时间

