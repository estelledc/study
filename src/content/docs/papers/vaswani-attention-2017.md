---
title: "Attention Is All You Need — 零基础学习笔记"
来源: https://arxiv.org/abs/1706.03762
日期: 2026-06-13
分类: 机器学习
子分类: ml-deep-learning
provenance: pipeline-v3
---

# Attention Is All You Need — 零基础学习笔记

## 一句话总结

这篇论文提出了 Transformer 架构，用"注意力机制"完全取代了传统的循环神经网络（RNN），成为后来 GPT、BERT 等大模型的基础。

---

## 1. 背景：Transformer 之前的世界

### 1.1 一个日常类比：翻译任务中的"接力赛" vs "同声传译"

想象你在做一个翻译任务，把英文句子翻译成中文。

**RNN 的方式（旧方法）** 就像接力赛：
- 第一个单词进来，模型记住它
- 第二个单词进来，模型结合第一个的记忆来处理
- 依次类推……一个字一个字地读过去
- 问题：如果句子很长，读到句尾时已经忘了句首的内容（这叫"长距离依赖"问题）
- 问题：必须一字一字来，没法同时处理多个词，训练很慢

**Transformer 的方式（新方法）** 就像同声传译：
- 一眼扫完整句话，每个词都和句子里的其他词"建立联系"
- 不需要按顺序来，可以一次性处理所有词
- 训练速度大幅提升

### 1.2 论文核心发现

作者发现：如果只用注意力机制（attention），完全不用循环（RNN）和卷积（CNN），就能做出比之前所有模型都更好的翻译器。

---

## 2. 核心概念拆解

### 2.1 编码器-解码器（Encoder-Decoder）架构

```
输入句子: "The cat sat on the mat"
         ↓
    ┌──────────┐
    │  Encoder  │  → 把输入变成"理解后的表示"
    └──────────┘
         ↓
    ┌──────────┐
    │  Decoder  │  → 逐词生成翻译 "猫坐在垫子上"
    └──────────┘
```

- **Encoder**：读入整个输入句子，把它压缩成一组"理解后的表示"
- **Decoder**：从这些表示中，一个字一个字地生成输出翻译

### 2.2 注意力机制（Attention）—— 最核心的想法

**日常类比**：读句子时，你读到"猫"这个词，脑海里会自动联想到"坐"和"垫子"。这就是注意力——处理一个词的时候，同时关注句子里相关的其他词。

**数学表达**：

Attention(Q, K, V) = softmax(Q · K^T / √d_k) · V

拆解一下：
- **Q (Query)**：你"查询"的内容——"我想找和'猫'相关的词"
- **K (Key)**：每个词"被查询"的特征——"垫子"的特征
- **V (Value)**：每个词"实际提供"的信息
- **Q · K^T**：算一下查询和每个键的匹配程度（相似度）
- **softmax**：把相似度变成"权重"——越相关的词权重越高
- **加权 V**：按权重把每个词的信息加起来

### 2.3 缩放点积注意力（Scaled Dot-Product Attention）

点积太大会让 softmax 梯度消失（梯度变得极小，模型学不动），所以除以 √d_k 来缩放。

### 2.4 多头注意力（Multi-Head Attention）

**日常类比**：就像你有 8 个不同的"注意力透镜"，每个透镜关注句子中不同类型的关系：
- 透镜 1 关注"主语-谓语"关系
- 透镜 2 关注"修饰-被修饰"关系
- 透镜 3 关注"代词-指代对象"关系
- ……

最后把这 8 个透镜的观察结果合并起来，得到更全面的理解。

论文中 h = 8 个头，每个头的维度 d_k = d_v = 64。

### 2.5 位置编码（Positional Encoding）

RNN 天然知道词的顺序（因为按顺序读），但 Transformer 同时读所有词，不知道顺序。

**解决办法**：给每个词的位置"编号"，用正弦函数（sin/cos）编码：

PE(pos, 2i) = sin(pos / 10000^(2i/d_model))
PE(pos, 2i+1) = cos(pos / 10000^(2i/d_model))

这样模型能"感受到"词与词之间的相对距离。

### 2.6 前馈神经网络（Feed-Forward Network）

每个位置单独做一个全连接的网络：

FFN(x) = max(0, x · W1 + b1) · W2 + b2

输入维度 512 → 隐藏层 2048 → 输出 512。

### 2.7 残差连接 + Layer Normalization

每个子层后面都加一个"快捷方式"：LayerNorm(x + Sublayer(x))，帮助训练更深的网络。

---

## 3. 代码示例

### 3.1 缩放点积注意力实现（PyTorch）

```python
import torch
import torch.nn as nn
import math

def scaled_dot_product_attention(query, key, value, mask=None):
    """
    缩放点积注意力核心实现

    参数:
        query: 形状 [batch, heads, seq_len, d_k]
        key:   形状 [batch, heads, seq_len, d_k]
        value: 形状 [batch, heads, seq_len, d_v]
        mask:  可选的掩码张量，用于隐藏某些位置

    返回:
        output: 形状 [batch, heads, seq_len, d_v]
        attention_weights: 形状 [batch, heads, seq_len, seq_len]
    """
    d_k = query.size(-1)

    # Step 1: 计算 Q 和 K 的点积，得到注意力分数
    # [batch, heads, seq_q, d_k] x [batch, heads, d_k, seq_k]
    #          -> [batch, heads, seq_q, seq_k]
    scores = torch.matmul(query, key.transpose(-2, -1))

    # Step 2: 缩放 —— 除以 sqrt(d_k) 防止梯度消失
    scores = scores / math.sqrt(d_k)

    # Step 3: 如果提供了掩码（比如 Decoder 中要遮蔽未来位置）
    if mask is not None:
        scores = scores.masked_fill(mask == 0, -1e9)

    # Step 4: softmax 把分数变成权重（和为 1）
    attention_weights = torch.softmax(scores, dim=-1)

    # Step 5: 用权重加权 Value
    output = torch.matmul(attention_weights, value)

    return output, attention_weights
```

### 3.2 多头注意力完整实现（PyTorch）

```python
class MultiHeadAttention(nn.Module):
    """
    多头注意力机制

    把 d_model=512 的嵌入空间投影到 h=8 个"头"，
    每个头的维度 d_k = d_v = 512 / 8 = 64。
    最后把所有头的输出拼接起来再投影回 512 维。
    """

    def __init__(self, d_model=512, num_heads=8):
        super().__init__()
        assert d_model % num_heads == 0, "d_model 必须能被 head 数整除"

        self.d_model = d_model
        self.num_heads = num_heads
        self.d_k = d_model // num_heads  # 每个头的维度 = 64

        # 四个全连接层：分别投影 Q、K、V 和最终输出
        self.W_q = nn.Linear(d_model, d_model)
        self.W_k = nn.Linear(d_model, d_model)
        self.W_v = nn.Linear(d_model, d_model)
        self.W_o = nn.Linear(d_model, d_model)

    def forward(self, q, k, v, mask=None):
        batch_size = q.size(0)

        # Step 1: 用线性层投影 Q、K、V
        q = self.W_q(q)  # [batch, seq_len, d_model]
        k = self.W_k(k)
        v = self.W_v(v)

        # Step 2: 分成多头 —— 把 [batch, seq, d_model]
        #          变成 [batch, num_heads, seq, d_k]
        q = q.view(batch_size, -1, self.num_heads, self.d_k).transpose(1, 2)
        k = k.view(batch_size, -1, self.num_heads, self.d_k).transpose(1, 2)
        v = v.view(batch_size, -1, self.num_heads, self.d_k).transpose(1, 2)

        # Step 3: 对每个头做缩放点积注意力
        attn_output, attn_weights = scaled_dot_product_attention(q, k, v, mask)

        # Step 4: 把多头拼接回去
        # [batch, num_heads, seq, d_k] -> [batch, seq, d_model]
        attn_output = attn_output.transpose(1, 2).contiguous().view(
            batch_size, -1, self.d_model
        )

        # Step 5: 再做一次线性投影
        output = self.W_o(attn_output)

        return output, attn_weights
```

---

## 4. Transformer 完整架构

```
输入嵌入 + 位置编码
      │
      ▼
┌─────────────────────────┐
│    Encoder (×6 层)       │
│  ┌───────────────────┐  │
│  │ Multi-Head Attention│ │  ← 自注意力：词和句中所有词建立联系
│  │    + Add & Norm     │ │
│  ├───────────────────┤  │
│  │  Feed-Forward Net  │ │  ← 逐位置的全连接网络
│  │    + Add & Norm     │ │
│  └───────────────────┘  │
└─────────────────────────┘
      │
      ▼
┌─────────────────────────┐
│   Decoder (×6 层)        │
│  ┌───────────────────┐  │
│  │ Masked Multi-Head  │ │  ← 屏蔽未来信息的自注意力
│  │    Attention       │ │
│  │    + Add & Norm     │ │
│  ├───────────────────┤  │
│  │ Multi-Head Attention│ │  ← Encoder-Decoder 注意力
│  │    + Add & Norm     │ │     (decoder 关注 encoder 输出)
│  ├───────────────────┤  │
│  │  Feed-Forward Net  │ │
│  │    + Add & Norm     │ │
│  └───────────────────┘  │
└─────────────────────────┘
      │
      ▼
   Linear → Softmax → 输出下一个词的概率
```

---

## 5. 训练关键细节

### 5.1 优化器：带学习率 warmup 的 Adam

学习率公式：

```
lr = d_model^(-0.5) × min(step_num^(-0.5), step_num × warmup_steps^(-1.5))
```

- 前 4000 步：学习率线性上升（warmup）
- 之后：学习率按步数的平方根倒数下降

### 5.2 实验结果

| 模型 | EN→DE BLEU | EN→FR BLEU | 训练成本 |
|------|-----------|-----------|---------|
| 之前的最佳模型 | ~26.3 | ~41.1 | 很高 |
| Transformer Big | **28.4** | **41.8** | 仅为前者的 1/8 |

### 5.3 泛化能力

Transformer 不仅在翻译上强，还被成功应用到了**英语成分句法分析**任务上，说明它学到的不只是翻译技巧，而是通用的语言理解能力。

---

## 6. 这篇论文为什么重要

1. **速度**：因为不用循环，可以大规模并行训练，训练时间从几天/几周缩短到几小时
2. **质量**：在翻译任务上刷新了 SOTA，而且是用单模型（不是 ensemble）
3. **简洁**：架构干净，只有 attention 和全连接，比 RNN/CNN 简单得多
4. **可扩展**：奠定了 GPT 系列、BERT 等所有现代大模型的基础
5. **可解释**：注意力权重可视化能看出模型在学习语法关系（代词消解、长距离依赖等）

---

## 7. 思考题

这篇文章的标题是"Attention Is All You Need"。作者为什么敢这么断言？结合上面学到的内容，试着想想：注意力机制到底"替代"了什么？它又"继承"了什么？

---

## 参考资料

1. Vaswani et al. (2017). Attention Is All You Need. NeurIPS 2017.
2. arXiv: https://arxiv.org/abs/1706.03762
3. 代码参考: https://github.com/tensorflow/tensor2tensor
