---
title: "Attention Sinks 与 StreamingLLM：让大模型无限流式推理"
来源: https://arxiv.org/abs/2309.17453
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

# Attention Sinks 与 StreamingLLM：让大模型无限流式推理

## 1. 一个日常类比：餐厅的"注意力天花板"

想象你去一家餐厅，服务员要记住你整个点的菜。如果点了 1000 道菜，服务员得记住 1000 个菜的详情——他的大脑（内存）会放不下。

一个自然的想法是：只记住最近点的 20 道菜。这就是所谓的"窗口注意力"（Window Attention）。但问题是：当你忘了最早点的几道菜时，餐厅的整套点菜系统就崩溃了。

为什么？因为这些最早点的菜，就像一个"注意力水坑"（Attention Sink）——即使它们不好吃，所有后面的菜都会把"注意力"（关注度）流过去，因为它们是整个菜单的开头。

这篇文章就是发现了这个"水坑"，然后学会利用它，让餐厅能无限点菜，内存永远够用。

## 2. 背景知识：LLM 是怎么"说话"的

大语言模型（LLM）每次生成一个新词时，都要回头看之前说过的所有词。它用一种叫 **Transformer 的 Attention 机制** 来做这件事。

简单来说，每生成一个词，模型会先把它之前所有的词转成 **KV 对**（Key-Value pairs），缓存起来。每次需要生成新词时，就用这些 KV 去跟新词做"注意力匹配"。

```python
# 伪代码：传统 LLM 的注意力机制（每次都要看全部历史）
for token in input_sequence:
    key, value = model.encode(token)
    kv_cache.append((key, value))  # 缓存所有历史

# 生成新词时，注意力分数 = 对所有历史 KV 做 softmax
def attention(query, kv_cache):
    scores = []
    for k, v in kv_cache:
        score = query @ k.T  # 计算每个历史词的匹配度
        scores.append(score)
    # softmax 让所有分数加起来 = 1
    weights = softmax(scores)
    return sum(w * v for w, v in zip(weights, kv_cache))
```

问题就在这里：**kv_cache 会随着对话越来越长，内存爆炸。**

## 3. 核心问题：窗口注意力为什么不工作？

一个直观的想法：既然内存有限，那我只保留最近的 N 个词的 KV，旧的扔掉，不就行了？

实验发现：**不行。** 一旦你扔掉了最开始的几个词，模型的表现直接崩溃。 perplexity（困惑度，衡量模型有多"困惑"的指标）从 5 暴增到 5000+。

作者发现，即使你把最初的词替换成毫无意义的换行符 `\n`，只要保留它们的位置，模型表现就恢复正常。这说明——**模型不关心这些词是什么意思，它关心的是它们的位置。**

## 4. 核心概念：Attention Sink（注意力水坑）

### 4.1 什么是 Attention Sink？

作者发现一个有趣的现象：在 LLM 的注意力机制中，**大部分层的绝大多数注意力头，都会分配大量注意力分数给序列开头的几个词**，即使这些词跟当前要生成的词完全没有语义关系。

他们把这些开头的词称为 **Attention Sink（注意力水坑）**。

为什么会出现水坑？因为 **Softmax 函数有一个硬性约束**：它要求所有注意力分数加起来等于 1。

```
    softmax(x)[i] = e^x[i] / Σ_j(e^x[j])
```

即使当前词不需要关注之前的任何词，softmax 也要求它"必须把注意力分配给某个地方"。于是模型就把那些"多余的注意力"灌到开头那几个词上。

这就像你有一杯水（注意力 = 1），即使你口渴但不想喝，你也得把水倒进水槽里，而不能让它凭空消失。开头的词就是这个水槽。

### 4.2 为什么是"开头"的词？

因为 LLM 是自回归的——每个词只能看到它之前的词。开头的那些词，被几乎所有后面的词都能看到，所以它们最容易成为"被灌注意力"的目标。

```
Token: <s> I  like  to  eat  pizza  .
Layer 5 注意力分布: [0.65, 0.02, 0.02, 0.02, 0.02, 0.02, 0.25]
                    ^^^^ 这些开头词吸收了绝大部分"多余注意力"
```

## 5. StreamingLLM 的解决方案：滚动 KV Cache + 保留水坑

StreamingLLM 的核心思路非常简单，但非常有效：

1. **保留开头的 4 个词**的 KV（作为 Attention Sink）
2. **滚动缓存最近的 N 个词**的 KV
3. 注意力计算时，同时用这两部分 KV

这样内存永远固定（4 + N），模型表现也稳定。

```python
# 核心数据结构：两个部分的 KV Cache
class StreamingKVCache:
    def __init__(self, sink_size=4, window_size=2048):
        self.sink_kvs = []          # 固定的：开头 4 个词的 KV
        self.window_kvs = []        # 滚动的：最近 window_size 个词的 KV
        self.sink_size = sink_size
        self.window_size = window_size

    def add(self, key, value):
        """添加新 token 的 KV"""
        if len(self.sink_kvs) < self.sink_size:
            self.sink_kvs.append((key, value))  # 先攒够 sink
        else:
            self.window_kvs.append((key, value))
            if len(self.window_kvs) > self.window_size:
                self.window_kvs.pop(0)          # 满了就踢掉最老的

    def get_all_kvs(self):
        """注意力计算时，返回 sink + window"""
        return self.sink_kvs + self.window_kvs
```

### 5.1 位置编码的处理：在 cache 内的相对位置

一个关键细节：StreamingLLM 使用** cache 内部的相对位置**，而不是原始文本中的绝对位置。

比如原始文本中第 1000 个词被加入 cache 时，它在 cache 里的位置可能是 7——因为它前面的词很多已经被踢出了 window。但模型只需要知道"它是 cache 里的第 7 个"，而不需要知道"它是全文的第 1000 个"。

```python
# 位置编码的处理方式
def apply_rope_position_transform(keys, cache_positions):
    """
    对 cache 中的 keys 应用旋转位置编码。
    cache_positions 是 [0, 1, 2, 3, 4, 5, ...] 这样的连续位置，
    而不是原文本中的 [0, 1, 2, 3, 600, 601, ...]
    """
    for i, pos in enumerate(cache_positions):
        keys[i] = rotate(keys[i], pos)  # 旋转角度由 cache 内位置决定
    return keys
```

### 5.2 为什么是 4 个词？

实验发现：**4 个初始词就够了。**

| 保留初始词数 | Llama-2-13B 的 Perplexity |
|---|---|
| 0（纯窗口） | 5158（崩溃） |
| 1 | 11.88 |
| 2 | 10.51 |
| 4 | 5.40 |
| 8 | 5.38（收益递减） |

4 个词之后，增加数量几乎没有效果。

## 6. 进阶：预训练时加入专用的 Sink Token

论文还提出了一个更优雅的方案：**在预训练阶段，在每个训练样本的最前面加一个特殊的"Sink Token"**。

这个特殊的 token 在训练过程中学会专门吸收那些"多余注意力"。结果就是：

- 模型**只需要这一个 token** 就能稳定流式推理
- 不需要保留任何"初始词"
- 普通任务的性能完全不受影响

```python
# 预训练时的处理方式
def preprocess_for_training(text):
    """在每个训练样本前加一个特殊的 sink token"""
    return "<sink>" + text
    # 模型学会：<sink> token = 专门吸收多余注意力的"水槽"
```

有了这个 Sink Token，推理时的 cache 就只有一个固定 token + 滚动窗口，更加简洁。

## 7. 效果对比

### 7.1 长文本建模（400 万字）

StreamingLLM 让 Llama-2、MPT、Falcon、Pythia 等模型都能稳定处理超过 400 万 token 的文本：

```
模型           | 方法              | 4M token 的 Perplexity
--------------|-------------------|----------------------
Llama-2-13B   | Dense Attention   | OOM（内存溢出）
Llama-2-13B   | Window Attention  | 崩溃（>5000）
Llama-2-13B   | StreamingLLM      | 稳定 ≈5.5
Llama-2-70B   | StreamingLLM      | 稳定 ≈3.2
```

### 7.2 多轮对话

在多轮 ARC 问答任务中：

```
模型              | 方法              | Arc-C 准确率
-----------------|-------------------|-------------
Llama-2-70B-Chat  | Dense (one-shot)  | 78.50%
Llama-2-70B-Chat  | Window Attention  | 0.32%（随机）
Llama-2-70B-Chat  | StreamingLLM      | 80.20%
```

StreamingLLM 的准确率甚至超过了 off-line 的 one-shot 方法。

### 7.3 速度

StreamingLLM 比滑动窗口 + 重新计算的 baseline 快 **22.2 倍**，而且推理速度恒定，不随输入长度增加而变慢。

## 8. 核心贡献总结

1. **发现 Attention Sink 现象**：开头词的"多余注意力"不是 bug，而是 softmax 的必然结果
2. **提出 StreamingLLM**：保留 4 个初始词 + 滚动缓存，无需微调即可流式推理
3. **支持无限长度**：实验验证到 400 万 token 以上仍稳定
4. **Sink Token 预训练**：在预训练时加入专用 sink token，进一步简化推理
5. **通用性**：适用于所有使用 RoPE 或 ALiBi 位置编码的模型

## 9. 个人思考：从第一性原理理解

回到最基础的问题：为什么 Attention Sink 会出现？

从第一性原理推导：

1. **Softmax 是归一化的** → 所有注意力分数之和必须等于 1
2. **模型不需要在所有位置都有强注意力** → 但它仍然需要分配注意力值
3. **分配给谁？最"全局可见"的词最合适** → 开头词被所有后续词覆盖
4. **开头词成为"水槽"** → 多余注意力自然流向它们

这个推导不依赖于任何特定模型，它来自于 softmax 的数学性质和自回归建模的结构特性。这也是为什么 Llama、MPT、Falcon 等不同架构的模型都出现了相同的现象。

理解了这一点，StreamingLLM 的解决方案就变得非常自然：**既然开头词注定要被分配注意力，那就永远保留它们。** 这就像治水——不是堵住水流，而是修一个水槽。

## 10. 延伸阅读

- 原始论文：https://arxiv.org/abs/2309.17453
- 代码仓库：https://github.com/mit-han-lab/streaming-llm
- 相关方向：FlashAttention、LongChat（RoPE 外推）、ALiBi（位置偏置）
