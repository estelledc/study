---
title: Transformer — 让每个词一次看完整句话
来源: 'Vaswani et al., "Attention Is All You Need", NeurIPS 2017'
日期: 2026-07-09
分类: 机器学习
难度: 中级
---

## 是什么

Transformer 是一种处理序列的神经网络架构。日常类比：以前的 RNN 像一个人按顺序读书，必须先读第 1 页再读第 2 页；Transformer 像把整页摊在桌上，让每个词都能同时指向它最该看的其他词。

它的核心不是“记住上一步”，而是“直接比较所有位置之间的关系”。一句话里每个词都会问：我现在最该参考谁？

最小代码感受一下：

```python
scores = query @ keys.T
weights = softmax(scores / sqrt(d))
output = weights @ values
```

这三行就是 scaled dot-product attention：先打分，再归一化，再加权汇总信息。

## 为什么重要

- 不理解 Transformer，就很难解释为什么 GPT、BERT、Llama 这些大模型都长得像同一套骨架。
- 不理解 Transformer，就会误以为“大模型厉害”只来自参数多，而忽略了它能并行训练这个工程前提。
- 不理解 Transformer，就看不懂 attention、KV cache、FlashAttention、长上下文这些后续概念。
- 不理解 Transformer，就无法判断 RNN、CNN、状态空间模型和大模型架构之间到底在比什么。

## 核心要点

1. **Self-attention 让每个位置看全局**。类比开会：每个人发言前先听所有人一遍，再按相关度决定谁的话最重要。模型里就是每个 token 对所有 token 打分。

2. **Multi-head attention 让模型用多种视角看关系**。类比一篇作文让语文老师、逻辑老师、事实核查员同时看。一个 head 可能看主谓关系，另一个 head 可能看指代关系。

3. **位置编码补上顺序感**。attention 本身只看一堆 token，不天然知道“猫追狗”和“狗追猫”的区别。位置编码就是给每个词贴上座位号，让模型知道谁在前谁在后。

## 实践案例

### 案例 1：一句话里的每个词互相打分

假设句子是“猫 追 狗”。

```python
tokens = ["猫", "追", "狗"]
scores_for_cat = [0.1, 0.7, 0.2]
new_cat = 0.1 * value("猫") + 0.7 * value("追") + 0.2 * value("狗")
```

逐部分解释：

- `scores_for_cat` 表示“猫”这个位置对三个词的关注度。
- 权重最高的是“追”，说明“猫”要理解自己在句子里的角色，最该参考动作。
- 每个词都做同样的事，整句话就完成了一轮关系更新。

### 案例 2：多头注意力像多位审稿人

```python
head_1 = attention(q1, k1, v1)  # 看语法关系
head_2 = attention(q2, k2, v2)  # 看语义关系
head_3 = attention(q3, k3, v3)  # 看远距离指代
merged = concat([head_1, head_2, head_3])
```

逐部分解释：

- 单个 head 的容量有限，只能学一种比较稳定的观察角度。
- 多个 head 并行运行，相当于从几种不同投影里看同一句话。
- `concat` 把这些视角拼起来，再交给后面的前馈网络加工。

### 案例 3：位置编码让模型知道顺序

```python
word_embedding = embed("狗")
position_embedding = position(3)
input_vector = word_embedding + position_embedding
```

逐部分解释：

- `word_embedding` 告诉模型“狗”这个词大概是什么意思。
- `position_embedding` 告诉模型它在第几个位置。
- 两者相加后，模型看到的是“第 3 个位置上的狗”，而不是一只没有座位号的狗。

## 踩过的坑

1. **把 attention 当成人类注意力**：它只是矩阵打分和加权求和，不代表模型真的“理解”自己在看什么。

2. **忘记除以 `sqrt(d)`**：维度越大，点积分数越容易变得很极端，softmax 会过早饱和，梯度就难学。

3. **以为 Transformer 天然懂顺序**：纯 attention 对顺序不敏感，必须显式加入位置编码或相对位置机制。

4. **忽略 `O(n^2)` 成本**：每个 token 都看所有 token，长度翻倍时 attention 矩阵面积会变成四倍。

## 适用 vs 不适用

适用：

- 机器翻译、摘要、问答、代码生成这类需要长距离依赖的序列任务。
- 大规模预训练，因为每一层可以并行处理整段文本，GPU 吃得饱。
- 图像 patch、音频片段、多模态 token 等能被切成序列的输入。
- 需要统一骨架的任务，encoder-only、decoder-only、encoder-decoder 都能从它变形出来。

不适用：

- 极长序列且算力紧张的场景，原始 attention 的平方复杂度很快变贵。
- 数据很少的小任务，Transformer 的弱归纳偏置可能不如 CNN/RNN 省样本。
- 极低延迟或极小设备，参数量、显存和 KV cache 都会成为现实负担。
- 只需要局部模式的简单信号处理任务，用更小的模型可能更稳。

## 历史小故事（可跳过）

- **2014 年**：seq2seq + attention 让翻译模型在解码时能回看输入句子，但 RNN 仍是主体。
- **2017 年**：Vaswani 等人发表 Attention Is All You Need，直接去掉 RNN，用 attention 搭出完整翻译架构。
- **2018 年**：BERT 和 GPT 把 Transformer 拆成 encoder-only 与 decoder-only 两条路线，预训练时代开始成形。
- **2020 年后**：GPT-3、ViT、CLIP、T5 等模型证明 Transformer 不只适合翻译，而是通用序列骨架。

## 学到什么

- Transformer 的关键转向是：不再沿时间一步步传信息，而是让所有位置直接互相通信。
- 架构能不能被硬件高效执行，常常和数学表达能力一样重要。
- 大模型不是凭空出现的，它建立在 attention、残差、归一化、位置编码这些工程积木上。
- 后来的 FlashAttention、KV cache、长上下文优化，本质都在处理 Transformer 成功后暴露出的成本问题。
- 读懂 Transformer 后，再看推理加速和模型压缩，会更容易分清“省算力”和“改能力”的区别。

## 延伸阅读

- 论文 PDF：[Attention Is All You Need](https://arxiv.org/abs/1706.03762)
- 图解文章：[The Illustrated Transformer](https://jalammar.github.io/illustrated-transformer/)
- 实现练习：[nanoGPT](https://github.com/karpathy/nanoGPT)
- [[bert]] —— encoder-only Transformer 的代表，用遮盖词预测做预训练。
- [[gpt-3]] —— decoder-only Transformer 的代表，展示规模化语言模型能力。
- [[flash-attention]] —— 不改 attention 数学，只优化显存读写方式。

## 关联

- [[attention]] —— Transformer 的直接论文笔记，讲原始架构细节。
- [[bert]] —— 把 Transformer encoder 用在双向语言理解。
- [[gpt-3]] —— 把 Transformer decoder 放大到 few-shot 时代。
- [[vit]] —— 把图像切成 patch 后交给 Transformer。
- [[clip]] —— 用两个 Transformer/编码器学习图文对齐。
- [[flash-attention]] —— 解决 attention 显存带宽瓶颈。
- [[mamba]] —— 用状态空间路线挑战 Transformer 的长序列成本。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
