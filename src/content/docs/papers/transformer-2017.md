---
title: Attention Is All You Need — 用 self-attention 重写序列建模
来源: 'Vaswani et al., "Attention Is All You Need", NeurIPS 2017'
日期: 2026-07-09
分类: NLP
难度: 中级
---

## 是什么

Attention Is All You Need 是 2017 年提出 **Transformer** 的论文：它把机器翻译里原本靠 RNN 一步步传话的主干，换成了让所有词同时互相查看的 self-attention。

日常类比：以前的 RNN 像排队传纸条，第一位同学的话要经过很多人才能到最后一位；Transformer 像把全班聊天记录贴到白板上，每个人都能直接指向自己最该参考的句子。

这篇论文的关键不是发明 attention 本身，而是说：既然 attention 已经能帮 decoder 回看输入，那干脆把循环结构也拿掉，只用 attention、前馈网络、残差和归一化搭完整模型。

它最早验证在机器翻译上，但真正的影响是后来的 BERT、GPT、T5、ViT 都沿着这套骨架扩展，让 self-attention 成为现代大模型训练的默认积木。

读这篇时先抓三个词：

- **attention**：决定每个位置该看哪些位置。
- **parallelizable**：训练时不再被时间步串住。
- **path length**：任意远的两个词可以用很短路径交换信息。

论文里的 base model 不是今天的大模型：6 层 encoder、6 层 decoder、8 个 head、512 维隐藏表示，目标是先证明“去掉循环结构也能翻译得更好、更快”。

## 为什么重要

不理解这篇论文，下面这些事都很难解释：

- 为什么大语言模型能在训练时并行看整段文本，而不是像 RNN 那样按时间步慢慢扫。
- 为什么 attention 后来变成架构核心，而不是只作为 seq2seq 旁边的辅助模块。
- 为什么长距离依赖突然变容易：任意两个 token 在一层 self-attention 里就能直接通信。
- 为什么后续系统优化都围绕 attention 展开：KV cache、FlashAttention、长上下文，本质都在处理它的收益和成本。

## 核心要点

1. **Self-attention 让每个位置看所有位置**。类比：写作文时不是只记住上一句话，而是把全文摊开，给每句话标注“我和它有多相关”。模型里就是 query 和 key 打分，再用 value 汇总信息。

2. **Multi-head attention 让模型从多个角度看关系**。类比：同一篇译文让语法老师、语义老师、事实检查员一起看。每个 head 学一套投影，最后拼接起来，避免一个视角把所有关系揉成一团。

3. **位置编码补上顺序信息**。attention 本身不天然知道谁在前谁在后，像把词倒进一袋子里。论文把正弦、余弦位置向量加到词向量上，让模型同时看到“这个词是什么”和“它坐在哪里”。

## 实践案例

### 案例 1：scaled dot-product attention 的三步

```python
import numpy as np

scores = query @ keys.T
weights = softmax(scores / np.sqrt(keys.shape[-1]))
output = weights @ values
```

逐部分解释：

- `query @ keys.T` 是“当前词”给所有候选词打相关度分。
- `/ sqrt(d)` 是论文加的缩放，防止维度一大 softmax 过早变得极端。
- `weights @ values` 是按注意力权重把别的词的信息混进当前词表示。

### 案例 2：decoder 为什么要 mask

```python
scores = query @ keys.T
scores[future_positions] = -float("inf")
weights = softmax(scores)
next_token_state = weights @ values
```

逐部分解释：

- 训练生成模型时，第 3 个位置不能偷看第 4 个词，否则考试时就没有未来答案可看。
- 把未来位置设成 `-inf` 后，softmax 会给它们接近 0 的权重。
- 这就是 causal mask，保证 decoder 仍然按“只看过去”的规则生成。

### 案例 3：位置编码不是可有可无

```python
token = embed("狗")
position = sinusoidal_position(pos=3, dim=512)
model_input = token + position
```

逐部分解释：

- `embed("狗")` 只表达词义，不表达它在句子第几位。
- `sinusoidal_position` 给每个位置生成固定的座位号。
- 两者相加后，模型看到的是“第 3 位的狗”，才能区分“猫追狗”和“狗追猫”。

## 踩过的坑

1. **把 attention 当成人类注意力**：它只是矩阵打分和加权求和，权重高不等于模型真的给出了可解释理由。
2. **忘记 `/ sqrt(d_k)`**：点积维度越大分数越容易爆，softmax 饱和后梯度会变小，所以论文必须缩放。
3. **以为去掉 RNN 后顺序还在**：self-attention 对排列本身不敏感，没有位置编码就很难区分相同词的不同顺序。
4. **只看并行收益不看平方成本**：每个 token 看所有 token，序列长度翻倍时 attention 矩阵面积会变成四倍。

## 适用 vs 不适用

**适用**：

- 机器翻译、摘要、问答、代码生成等需要长距离依赖的序列任务。
- 大规模预训练，因为训练阶段一层里的所有位置可以并行计算。
- 需要统一骨架的任务，encoder-only、decoder-only、encoder-decoder 都能从 Transformer 变形出来。
- 图像 patch、语音片段、多模态 token 等能被整理成序列的输入。

**不适用**：

- 极长序列且算力紧张的场景，原始 self-attention 的 O(n²) 成本会很快压垮显存。
- 数据很少的小任务，Transformer 的归纳偏置弱，可能不如 CNN/RNN 省样本。
- 极低延迟或小设备部署，参数量、激活值和 KV cache 都会变成现实瓶颈。
- 只需要局部模式的简单信号处理任务，用更小的卷积或线性模型可能更划算。

## 历史小故事（可跳过）

- **2014 年**：Seq2Seq 用 encoder-decoder 把翻译接成端到端神经网络，但信息要压进一个固定向量。
- **2015 年**：Bahdanau attention 让 decoder 每一步都能回看输入序列，解决固定向量瓶颈的一大部分。
- **2017 年**：Vaswani 等人把 RNN 和卷积都拿掉，只用 attention 搭出 Transformer，在 WMT 翻译任务上刷新结果。
- **2018 年**：BERT 走 encoder-only，GPT 走 decoder-only，Transformer 从翻译架构变成通用预训练骨架。
- **2020 年以后**：模型规模、数据规模和算力一起放大，Transformer 成为大模型训练范式的中心。

## 学到什么

- 架构创新常常来自“删掉旧零件”：这篇论文删掉循环结构，让 attention 从辅助模块升成主干。
- 可并行性和表达能力同样重要，Transformer 赢的不只是指标，还有 GPU 友好的训练路径。
- self-attention 的优势是全局通信，代价是 O(n²) 成本；后续长上下文研究都在围绕这笔账做优化。
- 论文里的残差连接、LayerNorm、warmup 学习率、label smoothing 都不是装饰，而是让模型真正训稳的工程配方。

## 延伸阅读

- 论文入口：[Attention Is All You Need](https://arxiv.org/abs/1706.03762)（原文，机器翻译实验和结构细节都在里面）
- 图解文章：[The Illustrated Transformer](https://jalammar.github.io/illustrated-transformer/)（适合第一次把 Q/K/V 和多头注意力看明白）
- 实现讲解：[The Annotated Transformer](https://nlp.seas.harvard.edu/annotated-transformer/)（用代码复现论文结构）
- [[seq2seq-2014]] —— Transformer 继承的 encoder-decoder 问题框架。
- [[flash-attention]] —— 后来专门优化 attention 显存读写的系统论文。

## 关联

- [[attention]] —— 同一篇论文的早期笔记，更偏历史定位和影响面。
- [[transformer]] —— 从架构角度解释每个词一次看完整句话。
- [[seq2seq-2014]] —— Transformer 保留 encoder-decoder 范式，但替换内部序列处理方式。
- [[bert]] —— encoder-only Transformer 的代表，把双向理解任务推到预训练时代。
- [[gpt-3]] —— decoder-only Transformer 放大后的 few-shot 代表。
- [[flash-attention]] —— 不改 attention 公式，只优化它在 GPU 上的数据搬运。
- [[layernorm-2016]] —— Transformer 每个子层都依赖 LayerNorm 稳定训练。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
