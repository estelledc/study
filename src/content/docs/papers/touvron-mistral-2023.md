---
title: Mistral 7B — 零基础学习笔记
来源: https://arxiv.org/abs/2310.06825
日期: 2026-06-13
分类: 其他
子分类: ml-deep-learning
provenance: pipeline-v3
---

# Mistral 7B — 零基础学习笔记

## 一、它是什么？

Mistral 7B 是 2023 年 10 月由法国公司 Mistral AI 发布的一个 **70 亿参数** 的语言模型。
70 亿参数有多大？简单类比：

> 假设你在背一本书，"参数"就是你在背的过程中大脑形成的所有记忆连接。
> Llama 2 13B 有 130 亿参数，Mistral 7B 只有 70 亿——不到它的一半，
> 但在几乎所有测试中都 **打败了 Llama 2 13B**，甚至在推理、数学和代码上超过了 Llama 1 34B（340 亿参数）。

关键数字：

| 项目 | 数值 |
|------|------|
| 参数规模 | 7B（70 亿） |
| 上下文窗口 | 32K tokens |
| 词汇表大小 | 32,768 |
| 注意力头数 | 32 |
| 每头 kv 对数 | 8（GQA 分组） |
| 层数 | 32 |
| 隐藏层维度 | 4,096 |
| 中间层维度（MLP） | 14,336 |
| 开源协议 | Apache 2.0 |

> 32K 上下文意味着模型一次可以"读"大约 24,000 个英文单词或 16,000 个中文字——约等于一本 80 页的小说。

---

## 二、核心概念（用日常类比理解）

### 2.1 注意力机制：读书会上的"划重点"

想象你在读一本厚厚的小说。普通读者从头到尾逐页看；
而"注意力机制"就像你边读边用荧光笔划重点——
读到最后一段时，你的注意力会"回头"看前面的关键情节，
而不是只看最近几页。这就是 Transformer 的核心：**让模型同时关注序列中所有位置的信息**。

### 2.2 Grouped-Query Attention（GQA）——"分组抄笔记"

**问题**：传统 Transformer 中，每个注意力头（query）都需要自己的 key 和 value 矩阵。
模型越来越大时，推理阶段需要反复读取这些 key-value 矩阵，内存带宽成了瓶颈。

**类比**：一个班级做笔记。

- **MHA（Multi-Head Attention，多头注意力）**：每个学生都单独抄一遍整份讲义。准确但浪费——32 个学生抄 32 份，讲义要读 32 次。
- **MQA（Multi-Qury Attention，多查询注意力）**：全班共用一份讲义。省了，但 accuracy 下降太多。
- **GQA（Grouped-Query Attention，分组查询注意力）**：**把 32 个学生分成 8 组，每组共用一份讲义**。8 组 = 8 份讲义。既大幅减少内存读取（从 32 次降到 8 次），又保留了足够多的独立"视角"来维持精度。

Mistral 7B 用了 **8 组 GQA**，推理速度显著提升，精度几乎不损失。

### 2.3 Sliding Window Attention（SWA）——"只翻最近一页的书"

**问题**：标准注意力需要看整个序列（32K tokens），计算量是序列长度的**平方**。
序列越长，越慢。

**类比**：你读一本超长的书，每翻一页都需要回头重读前面所有页——这不可能完成。
SWA 的做法是：**每页只看前后一个固定窗口（比如 4096 tokens）的内容**，超出窗口的信息在训练时就被"遗忘"了。

这就像你看电影时，注意力集中在当前场景和前后关联，不会记住 2 小时前的每一个镜头。

**为什么可行？**

- 短距离依赖（相邻句子的语义关系）最重要，用 SWA 处理
- 长距离依赖（整篇文章的大纲）通过 **特殊标记 [BLOCK_START]** 来捕捉
- 两种注意力交替出现在不同层，各司其职

---

## 三、RoPE 旋转位置编码

Transformer 本身不知道 token 的顺序。RoPE（Rotary Positional Embedding）的巧妙之处在于：

> 把每个 token 的向量看作二维平面上的一个**箭头**，位置编码就是把箭头**旋转**一个角度。
> 两个 token 之间的相对位置 = 两个箭头的角度差。
> 角度差在做点积（attention）时自动体现出来，所以**模型天然就能感知"这个词在哪个词后面多少位"**。

---

## 四、代码示例

### 4.1 用 Hugging Face 加载 Mistral 7B 并进行推理

```python
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch

# 1. 加载模型和分词器（首次运行会自动下载约 14GB 的权重文件）
model_name = "mistralai/Mistral-7B-v0.1"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype=torch.float16,   # 用半精度节省显存
    device_map="auto"            # 自动分配到 GPU
)

# 2. 准备输入
prompt = "What is the capital of France?"
inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

# 3. 生成回答
outputs = model.generate(
    **inputs,
    max_new_tokens=50,
    temperature=0.7,
    do_sample=True
)

# 4. 解码并打印结果
answer = tokenizer.decode(outputs[0], skip_special_tokens=True)
print(answer)
# 输出类似：What is the capital of France? The capital of France is Paris.
```

**关键点**：

- `torch_dtype=torch.float16`：半精度让 7B 模型大约只需 14GB 显存就能跑（vs float32 需要 ~56GB）
- `max_new_tokens`：控制模型生成的 token 数量
- `temperature`：控制随机性，0.7 介于"稳定"和"有创意"之间

### 4.2 手动理解 GQA vs MHA 的差异

```python
import torch

# 模拟参数规模对比（实际模型更大，这里用简化数字说明原理）

# ── MHA（多头注意力）──
num_heads = 32
num_kv_heads = 32          # 每个头都有独立的 kv
head_dim = 128

# kv_cache 大小：bs * seq_len * num_kv_heads * head_dim * 2 (k+v)
mha_kv_size = 1 * 1024 * 32 * 128 * 2  # ~16MB per 1024 tokens
print(f"MHA KV cache: {mha_kv_size / 1024 / 1024:.2f} MB")

# ── GQA（分组查询注意力，Mistral 7B 的配置：8 组）──
num_kv_heads_gqa = 8       # 32 个头分成 8 组，每组共用 4 个头
gqa_kv_size = 1 * 1024 * 8 * 128 * 2   # ~2MB per 1024 tokens
print(f"GQA KV cache: {gqa_kv_size / 1024 / 1024:.2f} MB")

# ── 节省了多少？──
print(f"KV cache 节省: {100 * (1 - gqa_kv_size / mha_kv_size):.0f}%")
# 输出: KV cache 节省: 75%
```

**输出解读**：

```
MHA KV cache: 16.00 MB
GQA KV cache: 2.00 MB
KV cache 节省: 75%
```

Mistral 7B 的 32 个头被分成 8 组——每组 4 个头**共享同一个 kv 对**。
KV cache 从 16MB 降到 2MB，推理速度大幅提升。

### 4.3 SWA 滑动窗口概念演示

```python
# 模拟滑动窗口注意力的工作方式
context_length = 16384       # 总上下文 16K
window_size = 4096           # 滑动窗口大小 4K

def sliding_window_attention(query, key, value, position):
    """
    简化演示：只计算当前 token 在窗口内的注意力

    参数:
        query:     当前 token 的查询向量
        key/value: 序列中所有 token 的键/值向量
        position:  当前 token 在序列中的位置
    """
    # 窗口的起始和结束位置
    start = max(0, position - window_size)
    end = min(len(key), position + 1)

    # 只计算窗口内的注意力权重
    window_keys = key[start:end]
    window_values = value[start:end]

    # 计算当前 token 与窗口内所有 token 的注意力分数
    scores = torch.matmul(query, window_keys.T) / (query.shape[-1] ** 0.5)
    attention_weights = torch.softmax(scores, dim=-1)

    # 加权求和得到输出
    output = torch.matmul(attention_weights, window_values)
    return output

# 概念演示：窗口覆盖了多少比例
coverage_ratio = window_size / context_length * 100
print(f"滑动窗口覆盖: {coverage_ratio:.1f}% 的上下文")
print(f"窗口大小: {window_size} tokens | 总上下文: {context_length} tokens")
```

---

## 五、为什么 Mistral 7B 很重要？

**从"第一性原理"思考**：

1. **性价比的转折点**：在此之前，要达到 Llama 2 13B 的质量需要 13B+ 参数。
   Mistral 7B 证明：**更好的架构设计（GQA + SWA）比堆参数更有效率**。

2. **开源的意义**：Apache 2.0 协议意味着任何公司和个人都可以自由使用、修改、商用。
   这直接催生了 Llama.cpp、Ollama、LM Studio 等工具——让普通人在自己的笔记本上跑大模型成为可能。

3. **"小模型"路线的开端**：Mistral 7B 的成功证明，70 亿参数就可以达到"可用且优秀"的水平。
   后续的 Mistral 7B Instruct、Mixtral 8x7B（MoE 架构）都是在这个基础上发展起来的。

---

## 六、术语速查

| 术语 | 全称 | 一句话解释 |
|------|------|-----------|
| GQA | Grouped-Query Attention | 把注意力头分组，每组共享 kv 缓存，加速推理 |
| SWA | Sliding Window Attention | 每次只看局部窗口，降低长序列计算复杂度 |
| RoPE | Rotary Positional Embedding | 用旋转角度编码 token 的相对位置 |
| KV Cache | Key-Value Cache | 推理时缓存已计算的 kv，避免重复计算 |
| Token | — | 模型处理的"文字碎片"，英文约 4 个字母一个 token |
| Instruct | — | 经过人类反馈微调的指令跟随版本 |

---

## 七、思考题（留给自己）

1. GQA 把 32 个头分成 8 组，那分成 16 组或 4 组会怎样？精度和速度的 trade-off 在哪里？
2. SWA 会"遗忘"窗口外的信息，那 [BLOCK_START] 标记是怎么让模型获取全局信息的？
3. 如果参数从 7B 减到 2B，哪些核心能力会最先丢失？
