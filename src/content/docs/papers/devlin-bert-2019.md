---
title: "BERT — 双向预训练，让 NLP 一夜回到统一"
来源: 'Devlin et al., "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding", NAACL 2019 (arXiv:1810.04805)'
日期: 2026-06-13
分类: NLP
子分类: ml-deep-learning
provenance: pipeline-v3
---

## 是什么

**BERT**（Bidirectional Encoder Representations from Transformers）是 Google 2018 年底发表的论文，提出了一种全新的自然语言处理范式：**先在海量无标注文本上学"读懂句子"的通用能力，再针对具体任务微调**。

日常类比：以前的 NLP 模型像"考前突击的学生"——为每个考试（每个任务）单独刷题，考完就忘。BERT 像是"先读完整个图书馆再参加考试"——用两年的时间"泛读"互联网上的 25 亿字，学的是通用的语言理解能力，之后参加任何考试只需要稍微适应一下题型就行。

关键突破：**双向（bidirectional）**。之前的模型要么只能从左往右读（GPT），要么每个词只看自己（word2vec）。BERT 像一个人读书时**同时看这个词左边和右边的上下文**，真正理解"这个词在这里是什么意思"。

## 为什么重要

不理解 BERT，下面这些事都没法解释：

- 为什么 2018 年底之后几乎所有 NLP 论文都从"从头训练"转向"BERT 微调"
- 为什么 HuggingFace 从一个小型开源项目变成了 AI 基础设施的基石——它做的第一件事就是封装 BERT
- 为什么"预训练 + 微调"成了后来 GPT、T5、RoBERTa、DistilBERT 的共同起点
- 为什么 GLUE 基准在一年内从 76% 跳到 80.5%——BERT 一个人抬高了整个领域的天花板

一句话：BERT 把 NLP 从"每个任务各自为战"变成了"一个通用底座 + 少量适配"。

## 核心概念

### 1. 双向 vs 单向

传统语言模型（如 GPT）是**单向**的：预测第 5 个词时只能看前 4 个词。这模拟的是"写文章"的过程，但**理解文章**时我们天然会看前后文。

BERT 是**双向**的：用一个叫 **masked language model（MLM）** 的技巧，随机遮住句子中 15% 的词，让模型猜被遮的是什么。猜"我__了一只猫"时，模型能看到"我"和"了"、"猫"——这就是双向。

```
原始句子：我 昨天 在 公园 遇到 了 一 只 猫
MLM 输入：我 昨天 在 [MASK] 遇到 了 一 只 猫
模型任务：预测 [MASK] = "公园"
```

### 2. 两个预训练任务

BERT 用了**两个**任务来学语言理解：

| 任务 | 全称 | 做什么 | 类比 |
|------|------|--------|------|
| MLM | Masked Language Model | 随机遮词，让模型猜 | 填空题 |
| NSP | Next Sentence Prediction | 给两句话，判断 B 是不是紧跟在 A 后面 | 阅读理解：这两段话连贯吗？ |

MLM 让模型学词义和语法，NSP 让模型学句子之间的关系（这对问答、推理任务特别有用）。

### 3. 输入格式：[CLS] + [SEP]

BERT 的输入有一套特殊标记：

```
[CLS] 今天 天气 很好 [SEP] 适合 出去 散步
```

- `[CLS]`：放在句首，它的最终隐藏状态被用作**整句话的摘要向量**，用于分类任务
- `[SEP]`：分隔符，用来分开两句话

如果是单句任务：`[CLS] 今天 天气 很好 [SEP]`
如果是句子对任务：`[CLS] 北京 是 中国 的首都 [SEP] 上海 是 什么 城市 [SEP]`

### 4. 位置编码 + Token 类型编码

BERT 需要知道每个词的"位置"和"属于哪句话"：

```
位置编码：[0][1][2][3][4][5][6][7][8][9]
类型编码：[A][A][A][A][A][B][B][B][B][B]
```

- **位置编码**：告诉模型"今天"在第 1 位、"天气"在第 2 位
- **Token 类型编码**：告诉模型前 5 个词属于第一句（类型 A）、后 5 个属于第二句（类型 B）

### 5. 微调（Fine-tuning）

预训练完成后，BERT 就是一个"语言理解底座"。针对不同任务，只需：

1. 在 `[CLS]` 后面接一个**新的输出层**（全连接层）
2. 用任务数据从头训练这个输出层 + 微调 BERT 的所有参数

不需要改网络结构，不需要重新预训练。

## 代码示例

### 示例 1：用 HuggingFace Transformers 跑一个 BERT 分类

这是最实用的入门代码——加载预训练的 BERT，用它做一个情感分类：

```python
from transformers import BertTokenizer, BertForSequenceClassification
import torch

# 1. 加载预训练的 BERT 模型和分词器
tokenizer = BertTokenizer.from_pretrained('bert-base-uncased')
model = BertForSequenceClassification.from_pretrained(
    'bert-base-uncased',
    num_labels=2  # 二分类：正面 / 负面
)

# 2. 把文本转成模型能吃的格式
text = "I love this product! It works perfectly."
inputs = tokenizer(
    text,
    return_tensors='pt',       # 返回 PyTorch tensor
    padding='max_length',      # 补齐到最大长度
    max_length=128,            # BERT 最长 512
    truncation=True            # 超长就截断
)

# 3. 前向传播——拿到 logits
with torch.no_grad():
    outputs = model(**inputs)

# 4. 取出预测结果
predictions = torch.nn.functional.softmax(outputs.logits, dim=-1)
print(predictions)
# tensor([[0.02, 0.98]])  →  98% 概率是正面
```

**这行代码背后发生了什么**：
- `bert-base-uncased` 是一个 12 层 Transformer encoder，110M 参数
- 输入经过 12 层双向 self-attention，每个词都同时"看到"全文
- `[CLS]` 位置的最终隐藏状态（768 维）被送进一个全连接层，输出 2 维 logits

### 示例 2：手动构造 MLM 输入，理解 BERT 的预训练过程

这段代码演示 BERT 预训练时 MLM 是怎么工作的：

```python
from transformers import BertTokenizer
import torch
import random

tokenizer = BertTokenizer.from_pretrained('bert-base-uncased')

# 原始句子
sentence = "the quick brown fox jumps over the lazy dog"

# 分词
tokens = tokenizer.encode(sentence, add_special_tokens=True)
# [CLS] = 101, [SEP] = 102
# tokens ≈ [101, 1996, 3899, 3357, 2093, 3904, 2004, 1996, 5595, 2462, 102]

# 模拟 MLM：随机遮掉 15% 的词（简化版，实际只遮非特殊 token）
mask_indices = [i for i in range(1, len(tokens) - 1)]  # 排除 [CLS] 和 [SEP]
num_to_mask = max(1, len(mask_indices) // 6)             # 约 15%
masked = random.sample(mask_indices, num_to_mask)

# 构建 MLM 输入：80% 替换为 [MASK], 10% 随机词, 10% 不变
input_ids = tokens.copy()
masked_positions = []
for idx in masked:
    original_token = tokens[idx]
    masked_positions.append((idx, original_token))
    r = random.random()
    if r < 0.8:
        input_ids[idx] = tokenizer.vocab['[MASK]']    # 80% 遮掉
    elif r < 0.9:
        input_ids[idx] = random.choice(list(tokenizer.vocab.values()))  # 10% 随机替换
    # else: 10% 保持不变——让模型学会"有时候词不该被替换"

# 打印对比
print("原始:", tokenizer.decode(tokens))
print("输入:", tokenizer.decode(input_ids))
print("需要预测的位置:", [(i, tokenizer.decode([pos])) for i, pos in masked_positions])

# 输出示例：
# 原始: the quick brown fox jumps over the lazy dog
# 输入: the [MASK] brown fox jumps over [MASK] lazy dog
# 需要预测的位置: [(2, 'quick'), (7, 'the')]
```

**关键点**：
- 80/10/10 规则是 BERT 的精心设计：大部分时候遮掉（学预测），小部分随机替换（增强鲁棒性），还有小部分不遮（让模型知道有时不该换）
- 实际训练中，`[MASK]` 标记只在**预训练阶段**出现，微调时不会用到——这是 BERT 的一个"训练-推断不一致"的小瑕疵

### 示例 3：BERT 做句子对分类（如自然语言推理 NLI）

BERT 处理两句话时，利用 NSP 学到的能力判断它们的关系：

```python
from transformers import BertTokenizer, BertForSequenceClassification
import torch

tokenizer = BertTokenizer.from_pretrained('bert-base-uncased')
# bert-base-uncased 的预训练权重包含 3 类 NLI 微调（SNLI / MultiNLI）
model = BertForSequenceClassification.from_pretrained(
    'snli-bert',  # 已在 SNLI 数据集上微调过的版本
    num_labels=3  # entailment / neutral / contradiction
)

premise = "A soccer game with multiple males playing."
hypothesis = "Some men are playing a sport."

inputs = tokenizer(
    premise,
    hypothesis,
    return_tensors='pt',
    padding='max_length',
    max_length=128,
    truncation=True
)

# 注意：传入两个参数，tokenizer 自动加 [SEP] 分隔
with torch.no_grad():
    outputs = model(**inputs)

result = torch.argmax(outputs.logits).item()
labels = ['entailment', 'neutral', 'contradiction']
print(f"预测: {labels[result]}")
# 输出: 预测: entailment（前提蕴含假设）
```

**这里的关键**：输入里自动包含了 `[SEP]` 分隔符和类型编码（第一句全是 A，第二句全是 B），模型根据 `[CLS]` 的最终隐藏状态输出三分类结果。

## 模型架构速览

```
                    ┌─────────────────────────────┐
                    │    Transformer Encoder       │
                    │    (12 层, 768 维隐藏层)     │
                    │                              │
  [CLS] 词1 词2 ... ──→ Self-Attention × 12 层 ──→ [CLS] 向量 (768维)
         词N                                │
                    └──────────────────────────┼──┘
                                               ▼
                                        全连接层 + Softmax
                                               ▼
                                          任务输出
```

- **BERT-base**：12 层，12 个 attention head，隐藏层 768 维，110M 参数
- **BERT-large**：24 层，16 个 attention head，隐藏层 1024 维，340M 参数

## 踩过的坑

1. **[MASK] 标记的"训练-推断不一致"**：预训练时大量使用 `[MASK]`，但微调时从不出现。这意味着模型在微调时没见过"完整的、没有掩码的句子"。RoBERTa 后来直接删掉了 NSP 并用动态 masking 修复了这个问题。

2. **NSP 其实没那么有用**：后续研究发现 NSP 对性能贡献很小。RoBERTa 的消融实验显示去掉 NSP 反而更好——因为 MLM 已经足够让模型学句子间关系。

3. **动态 masking vs 静态 masking**：原论文每次迭代用同一套 mask（静态），后来发现每次迭代随机换一套 mask（动态），模型见过更多组合，效果更好。

4. **BERT 不擅长生成**：BERT 是 encoder-only，只能"理解"不能"生成"。GPT 是 decoder-only，擅长生成但不擅长理解。后来 T5 / BART 用 encoder-decoder 架构试图兼得两者。

5. **长文本限制**：BERT 的 self-attention 复杂度是 O(n²)，最长只能处理 512 个 token。超过就要截断或分段。Longformer、Sparse Transformer 等后续工作解决了这个问题。

6. **微调时学习率要很小**：预训练好的 BERT 参数很敏感，微调时学习率要是预训练时的 1/10 到 1/100（常用 2e-5 到 5e-5）。太大直接破坏预训练学到的知识。

7. **batch size 影响大**：BERT 微调建议 batch size 16-32。太小训练不稳定，太大泛化变差（类似 GAN 的 batch 效应）。

## 适用 vs 不适用场景

**适用**：
- 句子/句子对分类（情感分析、NLI、垃圾邮件检测）
- 命名实体识别（NER）
- 问答系统（SQuAD 就是 BERT 的微调任务）
- 文本相似度匹配

**不适用**：
- 文本生成（用 GPT / T5 / BART）
- 超长文档（>512 token，用 Longformer / BigBird）
- 实时性要求极高的场景（BERT-large 推理慢，考虑 DistilBERT / TinyBERT）
- 内存受限的边缘设备（考虑 MobileBERT / DistilBERT）

## 历史小故事

- **2017 年 6 月**：Transformer 论文（Attention Is All You Need）发表，提出 self-attention 架构
- **2018 年 6 月**：GPT（OpenAI）发布，证明单向语言模型也能在 NLP 任务上表现出色
- **2018 年 10 月**：BERT 上 arxiv（1810.04805），提出双向预训练，GLUE 刷到 80.5% SOTA
- **2019 年 2 月**：BERT 被收录到 HuggingFace library，开源生态爆发
- **2019 年 5 月**：BERT 论文被 NAACL 2019 接收
- **2019 年**：RoBERTa（Facebook）证明 BERT 的训练方式还能进一步优化
- **2020 年后**：BERT 逐渐被更大规模的模型取代，但"预训练 + 微调"范式成为行业标准

## 学到什么

1. **双向是语言理解的本质**——我们读句子时天然看前后文，单向语言模型从一开始就偏离了这个本质
2. **预训练 + 微调的范式革命**——先学通用语言知识，再适配具体任务，这条路线统治了之后五年的 NLP
3. **简单的设计往往最有力**——BERT 的核心创新就两个：MLM 和 NSP。没有复杂的架构改动，但效果碾压一切
4. **开源生态的杠杆效应**——BERT 本身是 Google 内部项目，但 HuggingFace 的开源封装让它变成了基础设施，改变了整个 AI 行业
5. **没有完美的设计**——[MASK] 标记的训练-推断不一致、NSP 的鸡肋、512 token 上限，都是 BERT 的硬伤，但没人因为这些否定它的价值

## 延伸阅读

- 论文原文：[arXiv:1810.04805](https://arxiv.org/abs/1810.04805)
- HuggingFace Transformers 文档：[huggingface.co/transformers](https://huggingface.co/transformers)（BERT 的 easiest entry point）
- RoBERTa：[Renewing BERT, arXiv:1907.11692](https://arxiv.org/abs/1907.11692)（BERT 的改进版，去掉 NSP + 动态 masking + 更大 batch）
- DistilBERT：[DistilBERT, arXiv:1910.01108](https://arxiv.org/abs/1910.01108)（BERT 的轻量版，速度快 60%，损失仅 4.7%）
- [[attention]] —— BERT 的核心组件 self-attention 的源头

## 关联

- [[attention]] —— BERT 的 encoder 就是多层 self-attention
- [[transformer]] —— BERT 的完整架构，Transformer encoder-only 版本
- [[gpt-2018]] —— 同年发布的单向语言模型，和 BERT 形成"双向 vs 单向"的对照
- [[roberta-2019]] —— BERT 的直接后继，证明训练策略比架构更重要

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[roberta-2019]] —— RoBERTa 是对 BERT 训练方式的系统性改进
- [[transformer]] —— BERT 建立在 Transformer encoder 之上
- [[attention]] —— BERT 的 self-attention 来自 Attention Is All You Need
