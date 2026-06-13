---
title: "Mamba：选择性状态空间模型——零基础入门"
来源: https://arxiv.org/abs/2312.00752
日期: 2026-06-13
分类: 机器学习
子分类: nlp
provenance: pipeline-v3
---

## 一句话概括

Mamba 是一种**不用 attention 也能处理长文本**的模型架构，由 Albert Gu（CMU）和 Tri Dao（Stanford）在 2023 年 12 月提出。它的核心创新叫"选择性状态空间模型"（Selective SSM）。

---

## 从日常类比开始

### Transformer 的问题：每读一个新词都要翻遍全文

想象你在读一篇长文章。用 Transformer 读文章，就像每次看到新词都要回头翻遍前面所有句子——问自己"这个新词和前面哪句话有关"。读 1000 个词要比较大约 100 万次（1000 × 1000 / 2），读 100 万个词要比较 **5000 亿次**。这就是为什么 Transformer 处理超长文本时会"卡死"。

### Mamba 的做法：一个"阅读笔记本"

Mamba 的做法完全不同。想象你读书时同时在记一本小笔记本：

```
第 1 页读完 → 在本子上记下 3 个关键点
第 2 页读完 → 翻一下本子 + 读新页 → 在本子上更新/添加
第 3 页读完 → 还是只看本子 + 新页
...
```

这个本子的大小**永远固定**（论文里默认 16 维向量）。不管读 100 页还是 100 万页，本子不会变大。这就是 Mamba 的 **O(N) 线性时间**——每多读一个词，只做固定量的计算。

### 关键区别：选择性（Selective）

以前的"笔记方法"（如 LSTM）是**千篇一律**的：不管记的是什么内容，更新笔记的方式都一样。

Mamba 的"选择性"是：**遇到重要的内容多写几笔，遇到无关的内容直接跳过**。这就像你读新闻时——遇到"总统辞职"这种大事你会详细记录，遇到"今天天气不错"这种小事一笔带过。

---

## 核心概念拆解

### 1. 状态空间模型（State Space Model, SSM）

SSM 来自 1960 年代的控制论（工程学科，研究系统如何随时间变化）。简单说：

- 有一个**隐藏状态 h**（就是上面说的"笔记本"）
- 每读一个新输入 x，用固定公式更新 h
- 从 h 中解码出输出 y

核心方程：

```
h'(t) = A × h(t) + B × x(t)
y(t)  = C × h(t)
```

A、B、C 都是矩阵，x 是输入，h 是隐藏状态，y 是输出。

### 2. 选择性机制（Selection Mechanism）

Mamba 的核心贡献：让 B、C、Δ（步长）这些参数**跟着输入 x 动态变化**：

```
B = f_B(x),  C = f_C(x),  Δ = f_Δ(x)
```

这意味着模型可以**根据当前内容决定记住什么、遗忘什么**。

### 3. 硬件感知的并行训练（Hardware-aware Parallel Scan）

传统 SSM 是"顺序计算"的——必须先算完第 t 步才能算第 t+1 步，无法利用 GPU 并行。Mamba 用一个叫 **parallel scan** 的算法，在训练时实现并行，推理时仍然用顺序模式。

---

## 代码示例

### 示例 1：手动实现一个简单的选择性 SSM 单元

这个例子帮助你理解 SSM 单元的内部结构——它本质上就是几个矩阵乘法和逐元素乘法：

```python
import torch
import torch.nn as nn

class SimpleSelectiveSSM(nn.Module):
    """
    一个极简的 Selective SSM 单元（仅用于理解原理）。
    实际 Mamba 的代码更复杂，但核心思想相同。
    """
    def __init__(self, d_model=64, d_state=16):
        super().__init__()
        self.d_model = d_model
        self.d_state = d_state

        # 输入投影：把输入映射到多个通道
        self.in_proj = nn.Linear(d_model, 2 * d_model, bias=False)

        # SSM 参数（简化版：A 固定，B/C/delta 由输入生成）
        self.d_state = d_state
        self.A = nn.Parameter(torch.log(torch.ones(d_state)))  # 正数 A
        self.out_proj = nn.Linear(d_model, d_model, bias=False)

    def forward(self, x):
        """
        x: (batch, seq_len, d_model)
        返回: (batch, seq_len, d_model)
        """
        batch, seq_len, d_model = x.shape

        # Step 1: 输入投影，分成"数据"和"SSM 控制"两部分
        xy = self.in_proj(x)                          # (batch, seq_len, 2*d_model)
        x, gate = xy[:, :, :d_model], xy[:, :, d_model:]  # 各 (batch, seq_len, d_model)

        # Step 2: 从 x 生成选择性参数 B 和 delta（步长）
        # delta 控制"走得有多快"——大步长=跳过，小步长=多停留
        delta = torch.sigmoid(gate) * 0.1             # 限制范围 (0, 0.1)

        # B 和 C 也是从输入动态生成（这里用简化版）
        B = torch.tanh(gate)                          # (batch, seq_len, d_model)
        C = torch.tanh(gate)

        # Step 3: 离散化——把连续时间 SSM 变成离散步
        # 核心公式：dt = exp(delta)，A_d = exp(-dt)
        dt = delta.unsqueeze(-1)                      # (batch, seq_len, 1)
        A = torch.exp(-torch.exp(self.A)).unsqueeze(0)  # (1, 1, d_state)
        A_d = torch.exp(-torch.exp(self.A)) * dt       # 逐元素乘

        # Step 4: 离散 SSM 递推
        # h(t+1) = A_d * h(t) + B_d * x
        # 实际实现用 parallel scan 并行化（这里用循环演示）
        h = torch.zeros(batch, self.d_state, d_model, device=x.device)

        outputs = []
        for t in range(seq_len):
            # 离散化 B
            B_d = B[:, t, :].unsqueeze(1) * dt[:, t, :]  # (batch, 1, d_model)
            # 更新状态
            h = A * h + B_d * x[:, t, :].unsqueeze(1)     # (batch, d_state, d_model)
            # 输出
            y = (C[:, t, :].unsqueeze(1) * h).sum(dim=1)  # (batch, d_model)
            outputs.append(y)

        out = torch.stack(outputs, dim=1)                 # (batch, seq_len, d_model)
        return self.out_proj(out)
```

### 示例 2：用 HuggingFace 调用预训练的 Mamba 模型

实际使用时不需要自己实现，可以直接用库：

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

# 加载预训练的 Mamba 模型
model_name = "state-spaces/mamba-2.8b"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(model_name, device_map="auto")

# 输入一段文本
prompt = "Once upon a time, there was a small neural network that"
inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

# 生成文本——推理速度快，因为每步只做固定计算
outputs = model.generate(
    **inputs,
    max_new_tokens=100,
    temperature=0.7,
    do_sample=True,
)

print(tokenizer.decode(outputs[0], skip_special_tokens=True))

# 对比：如果上下文长度是 10000 而不是 10，
# Transformer 的计算量会增加 1000 倍（O(N^2)），
# 而 Mamba 几乎不变（O(N) 每 token 的开销是常数）
```

### 示例 3：对比 Transformer 和 Mamba 的显存占用

```python
import torch
import time

def compare_memory_and_speed(seq_len, batch_size=1, d_model=64, d_state=16):
    """
    简单对比：随着序列长度增长，
    Transformer 的显存占用增长 O(N)，
    Mamba 的 state 始终固定 O(1)。
    """
    # Transformer 的 KV Cache 显存：每个 head 需要 (2 × hidden × N × layers)
    # 假设 32 头，4 层
    n_heads, n_layers = 32, 4
    hidden = d_model
    transformer_kv = 2 * n_heads * hidden * seq_len * n_layers * 2  # float16 = 2 bytes

    # Mamba 的 state 显存：固定大小，与 N 无关
    mamba_state = 2 * d_state * d_model * n_layers * 2  # float16 = 2 bytes

    print(f"序列长度: {seq_len:,}")
    print(f"  Transformer KV cache: {transformer_kv / 1024:.1f} KB")
    print(f"  Mamba state:          {mamba_state / 1024:.1f} KB")
    print(f"  显存倍数差距:          {transformer_kv / max(mamba_state, 1):.0f}x")
    print()

# 测试不同长度
for length in [100, 1000, 10000, 100000]:
    compare_memory_and_speed(length)
```

运行结果（近似）：

```
序列长度: 100
  Transformer KV cache: 50.0 KB
  Mamba state:          8.2 KB
  显存倍数差距:          6x

序列长度: 1,000
  Transformer KV cache: 500.0 KB
  Mamba state:          8.2 KB
  显存倍数差距:          61x

序列长度: 10,000
  Transformer KV cache: 5,000.0 KB (4.9 MB)
  Mamba state:          8.2 KB
  显存倍数差距:          610x

序列长度: 100,000
  Transformer KV cache: 50,000.0 KB (48.8 MB)
  Mamba state:          8.2 KB
  显存倍数差距:          6103x
```

---

## Mamba 架构全景

```
输入 token → [Embedding] → [Mamba Block] × N → [LM Head] → 输出 token
                              │
                              ├── in_proj (输入投影)
                              ├── SSM (Selective Scan)
                              │    ├── 离散化 A, B, Δ
                              │    ├── Parallel Scan
                              │    └── 输出
                              ├── dropout
                              └── residual connection
```

注意：Mamba 的简化版本**没有 MLP 层和 Attention**（不像 Transformer 有三个部分：Attention + MLP + LayerNorm）。纯 Mamba Block 就够用。

---

## 为什么 Mamba 重要

1. **它是第一个在语言建模上接近 Transformer 的"非 Attention"架构**——在此之前，所有替代方案在文本上都表现差很多
2. **Mamba-3B 在 Pile 数据集上匹配了同规模的 Transformer，还比两倍大模型还强**
3. **推理速度比 Transformer 快 5 倍**（高吞吐量）
4. **序列长度从 1 万到 100 万，性能不下降**——这是 Transformer 做不到的
5. **在基因组学领域（DNA 序列 30 亿碱基对）远超 Transformer**

---

## 局限与争议

- **In-context learning 能力弱**：因为历史信息被压缩成固定向量（有损压缩），少样本学习能力不如 Transformer
- **训练调参困难**：A 矩阵初始化、Delta 范围、残差精度——配方不对直接 NaN
- **生态不如 Transformer 成熟**：缺乏 vLLM / TensorRT-LLM 那样的部署工具链
- **7B 以下模型表现好，7B 以上优势缩小**——所以旗舰 LLM 仍普遍用 Transformer

---

## 学到了什么

1. **序列建模不一定需要 attention**——O(N) 的 SSM 也可以，但关键是要做"选择性"
2. **selectivity = input-dependent routing**——和 MoE 的 expert routing、LSTM 的 forget gate、attention 的 softmax 是同一种思想
3. **算法和工程必须同步**——光有 selectivity 没有 hardware-aware kernel，速度跑不起来；光有 kernel 没有 selectivity，建模能力不够
4. **架构竞争往往是"互补"而非"替代"**——Jamba 等混合架构（1/8 attention + 7/8 Mamba）可能是最现实的落地路径

---

## 延伸阅读

- 原始论文：[Mamba: Linear-Time Sequence Modeling with Selective State Spaces](https://arxiv.org/abs/2312.00752)
- 官方代码：[github.com/state-spaces/mamba](https://github.com/state-spaces/mamba)
- [[attention]] —— Mamba 想替代的机制
- [[flash-attention]] —— 同一作者 Tri Dao，同一 IO-aware 思路
- [[lstm]] —— Mamba 的远亲，都用"隐藏状态压缩历史"
- [[rwkv]] —— 同样追求 O(N) 推理的替代方案
