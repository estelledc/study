---
title: "Attention Is All You Need — 零基础学习笔记"
来源: https://arxiv.org/abs/1706.03762
日期: 2026-06-13
分类: 机器学习
子分类: nlp
provenance: pipeline-v3
---

# Attention Is All You Need — 零基础学习笔记

## 一句话总结

这篇论文提出了一种叫 **Transformer** 的新架构，它完全靠"注意力"（Attention）来处理语言任务，不再需要过去主流的循环神经网络（RNN）。这个架构后来成为了 GPT、BERT 等大语言模型的基石。

---

## 1. 从日常类比开始

想象一下翻译的场景：你要把一句英文翻译成中文。

**过去的做法（RNN/LSTM）：**
像一个逐字阅读的翻译员。他先读第一个单词，记住它，再读第二个，再记住……直到读完整句话，才开始翻译。问题是：如果句子很长，他可能早就忘了开头的词了。而且他一次只能读一个词，速度很慢，没法"同时看多行"。

**Attention 的做法：**
像一群翻译员围坐在一张桌子旁，每个人手里都有一张纸，上面写着整句话。当某个人要翻译"苹果"这个词时，他可以**同时看到整句话**，然后决定："嗯，'苹果'在这里应该翻译成 'apple'，因为它后面跟着'red'，所以是水果而不是公司。" 每个人都能同时关注整句话的任何位置。

**Attention 的核心思想就一句话：**
在处理每个词的时候，让模型自己决定"我应该多关注哪些词"。

---

## 2. 核心概念

### 2.1 编码器（Encoder）与解码器（Decoder）

Transformer 采用了经典的"编码器-解码器"结构：

- **编码器**：读入整句话，理解它的意思，输出一组"理解后的表示"
- **解码器**：一边看着编码器的理解结果，一边逐个生成翻译后的句子

可以用下表概括它们各自的内部结构：

| 组件 | 包含的子层 |
|------|-----------|
| 编码器 | 多头自注意力 → 前馈神经网络 |
| 解码器 | 多头自注意力 → 编码器-解码器注意力 → 前馈神经网络 |

### 2.2 注意力机制（Attention）—— 最重要的概念

注意力机制的计算可以用一个公式概括：

```
Attention(Q, K, V) = softmax(Q @ K^T / sqrt(d_k)) @ V
```

用日常语言解释：

- **Q（Query，查询）**：你想查什么？比如你想翻译"苹果"，Q 就是"苹果"的表示
- **K（Key，键）**：所有词的"索引"。就像图书馆里每本书的标签
- **V（Value，值）**：所有词的实际内容。就像图书馆里每本书的内容
- **步骤**：
  1. 拿 Q 和所有 K 做匹配，算出每个词和"苹果"的相关程度
  2. 用 softmax 把相关程度变成权重（加起来等于 1）
  3. 用这些权重对所有的 V 做加权求和，得到最终结果

### 2.3 缩放点积注意力（Scaled Dot-Product Attention）

为什么要"缩放"？当向量的维度很大时，点积的结果会非常大，导致 softmax 函数的梯度变得极小，模型学不动。除以 sqrt(d_k) 就是为了把点积的结果"拉回"到一个合理的范围。

### 2.4 多头注意力（Multi-Head Attention）

为什么叫"多头"？想象你有 8 个翻译员，每个人用不同的"视角"来看待同一个词：

- 头 1 可能关注语法关系（主谓宾）
- 头 2 可能关注语义关系（近义词、反义词）
- 头 3 可能关注距离关系（靠近的词）
- ...以此类推

最后把这 8 个视角的结果拼接起来，就得到了更丰富的表示。

### 2.5 位置编码（Positional Encoding）

因为 Transformer 没有 RNN 那样的顺序处理机制，所有词是同时被处理的。为了让模型知道词的顺序，作者在每个词的嵌入向量上加了一个"位置编码"——用不同频率的正弦和余弦函数来表示每个位置。这样每个位置都有独一无二的编码。

公式：

```
PE(pos, 2i)   = sin(pos / 10000^(2i/d_model))
PE(pos, 2i+1) = cos(pos / 10000^(2i/d_model))
```

---

## 3. 代码示例

### 3.1 实现缩放点积注意力

下面是 PyTorch 中一个最简版的 Attention 实现：

```python
import torch
import torch.nn as nn
import math

class ScaledDotProductAttention(nn.Module):
    """缩放点积注意力机制"""

    def __init__(self, d_k: int):
        super().__init__()
        self.d_k = d_k  # key 的维度

    def forward(self, Q: torch.Tensor, K: torch.Tensor, V: torch.Tensor, mask=None):
        """
        Q: (batch_size, num_queries, d_k)
        K: (batch_size, num_keys,   d_k)
        V: (batch_size, num_keys,   d_v)
        """
        # 步骤 1: 计算 Q 和 K 的点积
        # scores 的形状: (batch_size, num_queries, num_keys)
        scores = torch.matmul(Q, K.transpose(-2, -1))

        # 步骤 2: 缩放 —— 除以 sqrt(d_k)
        scores = scores / math.sqrt(self.d_k)

        # 步骤 3: 可选的 mask —— 把不允许关注的位置设为负无穷
        if mask is not None:
            scores = scores.masked_fill(mask == 0, -1e9)

        # 步骤 4: softmax 得到注意力权重
        attention_weights = nn.functional.softmax(scores, dim=-1)

        # 步骤 5: 用权重对 V 做加权求和
        output = torch.matmul(attention_weights, V)

        return output, attention_weights
```

**逐行解释：**

- 第 12 行 `torch.matmul(Q, K.transpose(-2, -1))`：对每个查询向量 Q 和所有键向量 K 做内积，得到 Q 和 K 的相似度分数
- 第 15 行除以 `sqrt(d_k)`：这就是"缩放"的步骤，防止分数过大
- 第 18-19 行 mask：在解码器中使用，防止模型看到未来（后面的）词
- 第 22 行 softmax：把分数变成概率分布（所有值 >= 0，加起来 = 1）
- 第 25 行：按概率加权求和 V，得到最终的注意力输出

### 3.2 实现多头注意力

```python
class MultiHeadAttention(nn.Module):
    """多头注意力机制"""

    def __init__(self, d_model: int = 512, num_heads: int = 8, d_k: int = 64):
        super().__init__()
        assert d_model == num_heads * d_k, "d_model 必须是 head 数 × 每个 head 的维度"

        self.d_model = d_model
        self.num_heads = num_heads
        self.d_k = d_k

        # 四个线性变换层：分别对 Q、K、V 做投影，以及最后拼接后的投影
        self.W_Q = nn.Linear(d_model, d_model)
        self.W_K = nn.Linear(d_model, d_model)
        self.W_V = nn.Linear(d_model, d_model)
        self.W_O = nn.Linear(d_model, d_model)

        self.attention = ScaledDotProductAttention(d_k)

    def forward(self, Q, K, V, mask=None):
        """
        输入 Q, K, V 的形状: (batch_size, seq_len, d_model)
        """
        batch_size = Q.size(0)

        # 步骤 1: 对每个 head 做线性投影
        Q = self.W_Q(Q)  # (batch, seq_len, d_model)
        K = self.W_K(K)
        V = self.W_V(V)

        # 步骤 2: 将 d_model 拆分成 num_heads 个 head
        # 形状变为: (batch, num_heads, seq_len, d_k)
        Q = Q.view(batch_size, -1, self.num_heads, self.d_k).transpose(1, 2)
        K = K.view(batch_size, -1, self.num_heads, self.d_k).transpose(1, 2)
        V = V.view(batch_size, -1, self.num_heads, self.d_k).transpose(1, 2)

        # 步骤 3: 对每个 head 做缩放点积注意力
        # attn_output: (batch, num_heads, seq_len, d_k)
        # attn_weights: (batch, num_heads, seq_len, seq_len)
        attn_output, attn_weights = self.attention(Q, K, V, mask)

        # 步骤 4: 把多个 head 的结果拼接起来
        # 先 transpose 回去: (batch, seq_len, num_heads, d_k)
        attn_output = attn_output.transpose(1, 2).contiguous()
        # 再 view 成 (batch, seq_len, d_model)
        attn_output = attn_output.view(batch_size, -1, self.d_model)

        # 步骤 5: 最后一次线性变换
        output = self.W_O(attn_output)

        return output, attn_weights
```

**关键理解点：**

- 第 26-28 行：`view` 和 `transpose` 是把一个大的向量"拆成"多个 head。比如 d_model=512，head=8，d_k=64。512 = 8 × 64，所以可以把 512 维的向量看成 8 个 64 维的小向量
- 第 40-42 行：把 8 个 head 的结果"拼回去"，恢复成 512 维
- 第 45 行：最后的线性层学习如何组合多个 head 的信息

### 3.3 位置编码的实现

```python
class PositionalEncoding(nn.Module):
    """位置编码 —— 用正弦/余弦函数注入位置信息"""

    def __init__(self, d_model: int = 512, max_len: int = 5000):
        super().__init__()
        # 创建一个零张量，形状为 (max_len, d_model)
        pe = torch.zeros(max_len, d_model)

        # 生成位置向量: [0, 1, 2, ..., max_len-1]
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)

        # 生成不同的频率: 2i / d_model
        div_term = torch.exp(
            torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model)
        )

        # 对偶数位置用 sin，奇数位置用 cos
        pe[:, 0::2] = torch.sin(position * div_term)  # 偶数索引
        pe[:, 1::2] = torch.cos(position * div_term)  # 奇数索引

        # 加一维，方便 batch 处理: (max_len, 1, d_model)
        pe = pe.unsqueeze(0)

        # 注册为 buffer（不是模型参数，不需要梯度更新）
        self.register_buffer('pe', pe)

    def forward(self, x):
        """
        x: (batch_size, seq_len, d_model) —— 词嵌入向量
        返回: 加上位置编码后的向量，形状不变
        """
        x = x + self.pe[:, :x.size(1), :]
        return x
```

**位置编码的直观理解：**

- 每个位置 pos 都有一个唯一的编码向量，长度为 d_model=512
- 第 0 维用极慢的频率（接近 cos(0)），第 510 维用极快的频率
- 这样相邻的位置在编码空间中也非常接近，模型容易学习这种关系
- 因为用的是正弦函数，理论上可以处理比训练时更长的句子

---

## 4. Transformer 的完整流程

整个模型的训练过程可以概括为以下步骤：

```
输入句子: "I love machine learning"
        │
        ▼
┌─────────────────────┐
│  词嵌入 (Embedding)  │  把每个词变成一个 512 维向量
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│  位置编码 (Positional │  加上位置信息，让模型知道顺序
│       Encoding)      │
└─────────────────────┘
        │
        ▼
┌──────────────────────────────────────┐
│           编码器堆栈 (6 层)            │
│  ┌────────────────────────────────┐  │
│  │  多头自注意力 → 残差连接 → LayerNorm │  │
│  │  前馈网络     → 残差连接 → LayerNorm │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────┐
│           解码器堆栈 (6 层)            │
│  ┌────────────────────────────────┐  │
│  │  带 mask 的多头自注意力          │  │  只能看到已生成的词
│  │  编码器-解码器注意力            │  │  从编码器获取信息
│  │  前馈网络                       │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
        │
        ▼
┌─────────────────────┐
│  线性变换 + Softmax  │  输出下一个词的概率分布
└─────────────────────┘
        │
        ▼
输出: "我爱机器学习"
```

---

## 5. 为什么 Transformer 比 RNN 好？

论文从三个维度做了对比分析：

| 维度 | RNN | 卷积 | 自注意力 |
|------|-----|------|---------|
| 每层计算复杂度 | O(n · d²) | O(k · n · d²) | O(n² · d) |
| 最少串行操作数 | O(n) | O(1) | **O(1)** |
| 最长路径长度 | O(n) | O(logₖ(n)) | **O(1)** |

- **O(1) 串行操作**：意味着可以完全并行化，充分利用 GPU
- **O(1) 最长路径**：任何两个词之间只需要经过一层注意力，RNN 需要经过 O(n) 层，所以自注意力更容易学习长距离依赖

实验结果：Transformer 在英德翻译上达到 28.4 BLEU，英法翻译上达到 41.8 BLEU，都是当时的最先进结果，而且训练时间远少于之前的模型。

---

## 6. 训练细节

论文还分享了一些有趣的训练技巧：

### 学习率调度

使用了一个特殊的学习率公式：

```
lr_rate = d_model^(-0.5) × min(step_num^(-0.5), step_num × warmup_steps^(-1.5))
```

简单来说：前 4000 步线性增加学习率（warmup），之后按步数的平方根倒数递减。

### 正则化手段

1. **残差 Dropout**：每个子层输出加 0.1 概率的 dropout，防止过拟合
2. **标签平滑（Label Smoothing, ε=0.1）**：让模型不要过于自信，提高泛化能力

### 其他超参数

| 参数 | 基线模型 | 大模型 |
|------|---------|-------|
| 层数 N | 6 | 6 |
| 模型维度 d_model | 512 | 1024 |
| 前馈维度 d_ff | 2048 | 4096 |
| 头数 h | 8 | 16 |
| Dropout | 0.1 | 0.3 |
| 训练步数 | 100K (12h) | 300K (3.5天) |

---

## 7. 这篇论文的意义

- **开创了 Transformer 时代**：之后的 BERT、GPT、T5 等所有大语言模型都基于 Transformer
- **证明了 Attention 可以取代 RNN**：这是一个范式转移
- **可并行训练**：大幅缩短了训练时间
- **代码开源**：作者将代码发布在 tensor2tensor 仓库，任何人都可以使用

---

## 8. 思考题

1. 如果让你给一个句子做位置编码，不用正弦函数，你会怎么设计？
2. 为什么解码器的自注意力需要 mask，而编码器的不需要？
3. 多头注意力的 head 数越多越好吗？论文中的实验结果说了什么？

---

*本文基于 Vaswani et al. (2017) "Attention Is All You Need" 撰写，原文发表于 NeurIPS 2017。*
