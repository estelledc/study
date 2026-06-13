---
title: "GPT-2 — 语言模型是无监督的多任务学习者"
来源: 'Radford et al., "Language Models are Unsupervised Multitask Learners", 2019'
日期: 2026-06-13
分类: NLP
子分类: ml-deep-learning
provenance: pipeline-v3
---

## 是什么

GPT-2 是 OpenAI 在 2019 年 2 月发布的语言模型，论文标题叫 "Language Models are Unsupervised Multitask Learners"。

日常类比：

> 想象一个每天读互联网、读了 800 亿个词的大厨。他没有上过任何烹饪学校，也没人教他具体怎么做某道菜。但你把一份意大利面食谱塞给他，他就知道怎么做了；你把一篇摘要要求塞给他，他就知道怎么缩写文章。**他什么都不需要专门学——因为他"读得够多"。**

这就是 GPT-2 的核心思想：

> **语言模型本身就是一台通用学习机器。你不需要给每个任务单独训练模型——只要用同一个预训练好的模型，在输入前面加一小段"任务说明"，它就能做很多不同的事。**

## 为什么重要

不理解 GPT-2，下面这些事都没法解释：

- 为什么 ChatGPT 的"祖宗"是 GPT-2——它的底层架构（decoder-only Transformer + causal LM）直接延续到今天
- 为什么"预训练 + 无监督微调（unsupervised fine-tuning）"成了 LLM 的标准套路：训一个大底座，遇到新任务时只喂带标签的例子，不改或少改权重
- 为什么 OpenAI 一开始只发布了 1.17 亿参数的小版本，隔了四个月才放出 15 亿参数的完整版——他们发现模型越大，"涌现"出的能力越多（包括文本摘要、翻译、对话），大到一定程度时产生了他们没预料到的能力
- 为什么 ChatGPT / Claude / Gemini 这一代对话系统都能工作——它们的底层都是 GPT-2 开创的那条路线（预训练 → 指令微调 RLHF）

## 核心概念

### 1. 预训练：只做一个任务——猜下一个词

GPT-2 的基础训练叫做 **Causal Language Modeling（因果语言建模）**，也叫 auto-regressive LM。

过程极其简单：

```
原句：  我  爱  吃  鱼

训练时遮住最后一个词：  我  爱  吃  [预测]
模型预测 P(鱼 | 我, 爱, 吃)
```

模型每次只能看左边已经出现过的词（因果注意力），预测右边下一个词是什么。就这样连续预测整个互联网规模的文本，一次预测一个词。

关键细节：

- **数据**：Common Crawl（约 40GB 的清洗后网页文本），约 800 亿个 token
- **架构**：48 层 Transformer decoder（对比 GPT-1 只有 12 层），1600 维隐藏层，36 个注意力头
- **参数量**：15 亿（1.5B），比 GPT-1 大了约 10 倍

日常类比：这就好像让机器每天做"看前几个字猜下一个字"的练习，练了 800 亿次。它不需要理解语法、不需要学知识——只是反复做这一件事。但神奇的是，练到一定程度后，它自然掌握了语法、常识、翻译甚至推理。

### 2. 无监督多任务学习：同一个模型，做很多事

GPT-2 论文最核心的发现：**你不需要为每个任务重新训练一个模型。**

做法叫 **unsupervised fine-tuning**：

```
任务 1 — 文本摘要（无监督，不给摘要标签）
输入：  一篇长文章
模型任务：  生成这篇文章的缩写版本
方法：  模型自己觉得"这样缩写得通顺就行"

任务 2 — 翻译（无监督，不对齐双语）
输入：  一段英文
模型任务：  生成法文版本
方法：  模型根据预训练时学到的双语知识自己翻译

任务 3 — 问答
输入：  "谁是美国第一任总统？"
模型任务：  "乔治·华盛顿"
方法：  预训练时读过足够多历史，直接补全
```

论文里测试了 17 个下游任务，涵盖分类、摘要、问答、翻译等，**只用同一个 1.5B 参数的模型，不加任何监督信号（除了少量带标签的例子甚至完全不用标签）**，就在很多任务上达到了接近有监督 SOTA 的效果。

### 3. GPT-2 的三个版本与"涌现"现象

GPT-2 发布了四种规模，从 117M 到 1.5B：

| 版本 | 参数量 | 层数 | 隐藏维 | 注意力头 |
|------|--------|------|--------|----------|
| GPT-2 small | 117M | 12 | 768 | 12 |
| GPT-2 medium | 350M | 24 | 1024 | 16 |
| GPT-2 large | 774M | 36 | 1280 | 20 |
| GPT-2 (1.5B) | 1.5B | 48 | 1600 | 36 |

论文观察到一个关键现象：

> 当模型规模超过一定阈值（约 774M → 1.5B），模型会出现**之前没有的能力**——比如高质量的文本摘要和翻译。这些能力不是显式训练的，而是"涌现"出来的。

日常类比：就像一个人练功夫，从 1+1=2 到 10+10=20 是渐进的，但到了某个临界点（比如突然会解微积分了），能力不是线性增长，而是"啪"一下冒出来的。

这就是为什么 OpenAI 最初不敢发布 1.5B 版本——他们发现大模型能生成看起来非常真实但完全虚假的内容（hallucination），担心被滥用。

## 技术细节

### Causal Attention（因果注意力）

GPT-2 只用 Transformer 的 **decoder 部分**，而且用了 causal masked attention：

```
Token 位置：     我    爱    吃    鱼

[我] 可以看到：   [我]
[爱] 可以看到：   我   爱
[吃] 可以看到：   我   爱   吃
[鱼] 可以看到：   我   爱   吃   鱼
```

每个位置只能看到**自己及左侧**的 token，不能看到右侧。这就是"因果"的含义——保证预测下一个词时不会作弊。

实现上用一个上三角的 mask 矩阵实现：

```python
mask = torch.tril(torch.ones(seq_len, seq_len))
# 0 1 1 1
# 0 0 1 1
# 0 0 0 1
# 0 0 0 0
```

### Layer Normalization 顺序变化

GPT-2 做了一个重要改动：**把 LayerNorm 从 transformer block 前面移到了后面（Pre-LN 架构）**。

```
原始 Transformer (Vaswani 2017)：
输入 → [Attention] → [Add & Norm] → [FFN] → [Add & Norm] → 输出

GPT-2 Pre-LN：
输入 → [Norm] → [Attention] → [Add] → [Norm] → [FFN] → [Add] → 输出
```

为什么要改？因为深层网络中，梯度会经过很多次 attention 和 FFN，原始顺序在训练大模型时容易梯度爆炸。Pre-LN 先做归一化再经过子层，梯度路径更平滑。这一改动后来被 BERT-2（RoBERTa）、GPT-3、LLaMA 等几乎所有后续模型继承。

## 代码示例

### 示例 1：从零理解 GPT-2 的前向推理

```python
import torch
import torch.nn as nn

class SimpleGPT2Block(nn.Module):
    """一个极简的 GPT-2 block——只有一个多头自注意力 + 前馈层"""

    def __init__(self, hidden_size, num_heads, intermediate_size):
        super().__init__()
        # GPT-2 的 Pre-LN：先做 LayerNorm
        self.ln_1 = nn.LayerNorm(hidden_size)
        self.ln_2 = nn.LayerNorm(hidden_size)

        # 多头自注意力
        self.attn = nn.MultiheadAttention(
            embed_dim=hidden_size,
            num_heads=num_heads,
            batch_first=True,
        )
        # 前馈网络（GPT-2 用的是 GLU 变体，这里用简单 FFN 简化）
        self.mlp = nn.Sequential(
            nn.Linear(hidden_size, intermediate_size),
            nn.GELU(),
            nn.Linear(intermediate_size, hidden_size),
        )

    def forward(self, x, attention_mask=None):
        # Pre-LN：先归一化再进注意力
        residual = x
        x = self.ln_1(x)
        # causal mask 保证每个位置只看左边（此处简化为不传 mask）
        attn_out, _ = self.attn(x, x, x, attn_mask=attention_mask)
        x = residual + attn_out  # residual connection

        # Pre-LN：先归一化再进 FFN
        residual = x
        x = self.ln_2(x)
        x = residual + self.mlp(x)
        return x


# 使用示例
batch_size = 2
seq_len = 10
hidden_size = 768
num_heads = 12
intermediate_size = 3072  # GPT-2 中是 4 * hidden_size

model = SimpleGPT2Block(hidden_size, num_heads, intermediate_size)

# 输入：batch 条文本，每条 10 个 token，embedding 维度 768
x = torch.randn(batch_size, seq_len, hidden_size)
output = model(x)

print(f"输入形状: {x.shape}")
print(f"输出形状: {output.shape}")
# 输入形状: torch.Size([2, 10, 768])
# 输出形状: torch.Size([2, 10, 768])
# 维度不变——每个位置输入一个向量，输出一个同等维度的向量
```

### 示例 2：文本生成——GPT-2 的自回归过程

```python
def generate_text(model, tokenizer, prompt="自然语言处理", max_new_tokens=20, temperature=0.7):
    """
    用 GPT-2 风格的自回归生成续写文本。
    核心逻辑：每次只生成一个 token，把新生成的拼上去，再问一次"下一个词是什么"。
    """
    # 1. 把 prompt 编码成 token IDs
    tokens = tokenizer.encode(prompt)
    generated = list(tokens)  # 用列表存生成结果

    for _ in range(max_new_tokens):
        # 2. 把当前所有 token 输入模型
        input_ids = torch.tensor([generated])
        with torch.no_grad():
            logits = model(input_ids)  # shape: (1, seq_len, vocab_size)

        # 3. 取最后一个位置的 logits（预测下一个词）
        last_token_logits = logits[0, -1, :]

        # 4. 温度采样（temperature < 1 更确定，> 1 更多样）
        scaled_logits = last_token_logits / temperature
        probs = torch.softmax(scaled_logits, dim=-1)
        next_token = torch.multinomial(probs, num_samples=1).item()

        # 5. 追加到已生成序列
        generated.append(next_token)

        # 6. 检查是否生成了结束符
        if next_token == tokenizer.eos_token_id:
            break

    return tokenizer.decode(generated)


# 假设 tokenizer 和 model 已经加载
# result = generate_text(model, tokenizer, "人工智能是", max_new_tokens=30)
# print(result)
# 可能输出：人工智能是一门研究如何使机器能够模拟人类智能的学科...
```

### 示例 3：多任务学习的 prompt 格式

```
# 在 GPT-2 论文中，不同任务用不同 prompt 格式输入同一个模型：

# --- 任务 1：文本摘要 ---
# Prompt:
summary: This is a very long article about climate change and its impact on global economics...

# Model 输出（生成的摘要）：
Climate change is affecting global economic systems.

# --- 任务 2：翻译 ---
# Prompt:
Translate English to French:
The weather is nice today.

# Model 输出：
Le temps est beau aujourd'hui.

# --- 任务 3：问答 ---
# Prompt:
Q: Who wrote Romeo and Juliet?
A:

# Model 输出：
William Shakespeare

# --- 关键点：---
# 模型权重完全不变，唯一的区别是 prompt 的格式。
# 模型在预训练阶段"见过"大量类似格式的数据，
# 所以看到"summary:"就知道要做摘要，看到"Translate"就知道要翻译。
```

## GPT-2 的影响

GPT-2 直接催生了三条发展路线：

1. **更大的无监督模型**：GPT-3（175B）、GPT-4 系列，参数规模持续扩大，few-shot 能力持续涌现
2. **指令微调路线**：InstructGPT → ChatGPT，在 GPT-2/GPT-3 的基础上做 human-feedback 微调（RLHF），诞生了真正的对话系统
3. **开源生态**：因为 OpenAI 没有发布 1.5B 版本的全部权重，催生了 GPT-Neo、GPT-J、LLaMA 等开源替代——"你不能发布？那我们自己搞"

## 一句话总结

> **GPT-2 证明了：一个模型只要被足够多地训练去做一件事（预测下一个词），它就会自然学会做很多事。**
