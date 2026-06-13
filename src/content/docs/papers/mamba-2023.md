---
title: Mamba: Linear-Time Sequence Modeling with Selective State Spaces
来源: https://arxiv.org/abs/2312.00752
日期: 2026-06-13
分类: 机器学习
子分类: ml
provenance: pipeline-v3
---

# Mamba 学习笔记

## 一、为什么需要 Mamba？先从一个生活场景说起

想象你在图书馆看书。

**Transformer（当前主流的 AI 架构）** 的做法是：每次看到新的一页，都回头翻遍之前读过的所有页面，把所有信息重新整理一遍。这样做非常全面，但也极其耗时。如果你读了 1000 页，第 1000 页的处理时间大约是第一页的 1000 倍——因为你要同时考虑"当前页"与"之前每一页"的关系。这就是 Transformer 的**二次方复杂度**问题。

**Mamba 的做法**是：像人一样阅读，逐页推进，但有一个"注意力过滤器"——读到无关内容时快速略过，读到关键内容时深深记住。它不需要回头翻遍所有页面，处理 1000 页和 10 页的时间只差 100 倍（线性增长），而且关键信息不会丢。

这就是 Mamba 的核心思想：**用线性时间做序列建模，同时保持对关键信息的精准捕捉。**

---

## 二、背景知识：State Space Model（SSM）是什么？

在理解 Mamba 之前，需要先了解"状态空间模型"（SSM）这个概念。

SSM 来自控制理论，最初用来描述物理系统如何随时间变化。比如一个弹簧，你给它一个力（输入），它会产生位移（输出），中间的状态（弹簧的拉伸程度）就是"状态"。

翻译成 AI 的语言：

- **输入 x(t)**：当前时刻看到的词
- **隐藏状态 h(t)**：模型"记住"的上下文信息
- **输出 y(t)**：模型对该时刻的理解

SSM 的基本公式很简单：

```
h'(t) = A * h(t) + B * x(t)    -- 更新状态（A 决定如何记忆，B 决定如何吸收新信息）
y(t)  = C * h(t)               -- 输出结果（C 决定如何解读状态）
```

这里的 A、B、C 是模型的"参数"，可以理解为：

- **A（系统矩阵）**：记忆的"保持率"——上次记住的东西，有多少会留到下一时刻
- **B（输入矩阵）**：吸收率——新信息进来时，有多少会被纳入记忆
- **C（输出矩阵）**：解读器——如何从记忆中提取有用的东西来做出判断

**关键问题**：在旧的 SSM 中，A、B、C 是**固定不变**的（叫"线性时间不变性"，LTI）。就像一台永远用同一套规则处理信息的机器——不管看到的是诗歌还是乱码，处理方式是完全一样的。这在处理语言时就有问题：你希望模型对"注意！"这类关键词格外重视，对"的、了、吗"这类常见词快速略过。

**Mamba 的贡献**：让 A、B、C 变成**随输入而变化**的参数。同样的机器，现在能"看人下菜碟"了。

---

## 三、Mamba 的核心创新：选择性机制（Selection Mechanism）

### 3.1 什么是"选择性"？

Mamba 把 SSM 的三个参数（B、C、Δ）变成输入的函数：

```
原来的 SSM（参数固定）:    B, C, Δ 不随输入变化
Mamba 的 SSM（参数可选）:  B, C, Δ 随输入 x(t) 动态变化
```

用代码来理解这个变化：

```python
# 传统 SSM：参数在所有时间步都相同
A = Parameter(shape=(D, N))       # D=通道数, N=状态维度
B = Parameter(shape=(D, N))       # 固定的参数
C = Parameter(shape=(D, N))       # 固定的参数
Delta = Parameter(shape=(D,))     # 固定的参数

# Mamba：参数随输入动态变化
A = Parameter(shape=(D, N))       # A 保持不变（作为基础结构）
B = linear(x)                     # B 根据当前输入 x 动态计算
C = linear(x)                     # C 根据当前输入 x 动态计算
Delta = softplus(linear(x))       # Delta 也随输入动态变化
```

**类比理解**：

- **传统 SSM**：就像一个固定焦距的镜头，所有场景都用同一个放大倍率
- **Mamba**：就像一个智能镜头——看到重要东西自动放大（Δ 变大，吸收更多），看到无关东西自动缩小（Δ 变小，快速略过）

### 3.2 为什么选择性能能解决 Transformer 的瓶颈？

选择机制有两个直接效果：

1. **内容感知（Content-aware）**：模型不是机械地处理每个词，而是"知道"哪些词重要
2. **无限记忆**：重要信息可以被记住 indefinitely（只要 Δ 足够小），不像 KV Cache 有内存上限

这就是为什么 Mamba 在"选择性复制"（Selective Copying）和"诱导头"（Induction Heads）这两个关键任务上表现远超旧模型：

```
选择性复制任务：
输入：[START] 红色词1  无关词  红色词2  无关词...  [COPY 红色词]
要求：模型只复制红色标记的词，忽略无关词
Transformer：能做到（因为有注意力机制，可以任意关注）
旧 SSM：做不到（因为参数固定，无法区分哪些词重要）
Mamba：能做到（因为 Δ 可以选择性地记住红色词，忽略其他）
```

---

## 四、Mamba 的架构

Mamba 的整个模型**只用了一种核心块**，没有注意力机制，也没有传统的 MLP。每一层就是一个"SSM 块"，结构如下：

```
输入 x
  │
  ▼
LayerNorm
  │
  ├──► 门控分支（Gated）──► 逐元素相乘 ──► 输出 y
  │        │
  │    ┌───┴───┐
  │    │ 线性层  │──► SSM（选择性状态空间）──► SiLU 激活
  │    └────────┘
  │
  ▼
残差连接：y = x + Gated(SSM(x))
```

每一层的输入被分成两条路径：一条通过 SSM 处理，一条通过线性层 + SiLU 激活，然后两者逐元素相乘（门控机制）。这和 Transformer 的注意力 + MLP 结构不同，Mamba 把两者合而为一了。

---

## 五、硬件感知算法（Hardware-Aware Algorithm）

让参数随输入变化后，传统的并行卷积计算就不适用了（因为卷积要求参数固定）。Mamba 必须用**循环计算**（recurrence），但循环 inherently 是串行的——一步接一步，无法并行。

Mamba 团队提出了一个巧妙的方法：**选择性扫描（Selective Scan）**。

核心思想是：GPU 的速度瓶颈不在于计算（FLOPs），而在于内存搬运（把数据从慢速 HBM 搬到快速 SRAM）。所以他们的策略是：

1. 把参数直接从慢速内存加载到快速内存
2. 在快速内存中完成离散化和循环计算
3. 只把最终结果写回慢速内存

这样避免了反复搬运中间状态，效率远高于朴素循环。

---

## 六、代码示例

### 示例 1：用 PyTorch 理解 Mamba 的离散化过程

```python
import torch
import torch.nn.functional as F

def discretize(A, B, Delta):
    """
    将连续时间参数转换为离散时间参数。
    这是 SSM 的核心步骤：把"连续"的系统变成"离散"的，
    才能用在神经网络中处理有限长度的序列。
    使用零阶保持（ZOH）方法。
    """
    # Delta: 离散化步长，形状 (D,)
    # A: 系统矩阵的对角线，形状 (D,)
    # B: 输入矩阵，形状 (D, N)
    dA = torch.exp(Delta * A)          # 离散化的 A：exp(Delta * A)
    dB = (Delta * A).inverse() * (torch.exp(Delta * A) - 1) * Delta * B  # 离散化的 B
    return dA, dB

# 假设 D=4（通道数），N=8（状态维度）
D, N = 4, 8
A = torch.randn(D, requires_grad=True)  # 系统矩阵对角线（可学习）
B = torch.randn(D, N, requires_grad=True)  # 输入矩阵
Delta = torch.rand(D)  # 离散化步长

dA, dB = discretize(A, B, Delta)
print(f"dA 形状: {dA.shape}")  # (4,)
print(f"dB 形状: {dB.shape}")  # (4, 8)
```

### 示例 2：模拟 Mamba 的选择性扫描

```python
def selective_scan(dA, dB, C, x):
    """
    用循环方式实现选择性 SSM 的扫描。
    x: 输入序列，形状 (batch, length, D)
    dA: 离散化的系统矩阵，形状 (batch, length, D, N)
    dB: 离散化的输入矩阵，形状 (batch, length, D, N)
    C: 输出矩阵，形状 (batch, length, D, N)
    """
    batch, length, D, N = dA.shape
    h = torch.zeros(batch, D, N, device=x.device)  # 初始状态为 0

    outputs = []
    for t in range(length):
        # 状态更新：h'(t) = A_bar * h(t) + B_bar * x(t)
        h = dA[:, t] * h + dB[:, t] * x[:, t, :, None]
        # 输出：y(t) = C * h(t)
        y = (C[:, t] * h).sum(dim=-1)
        outputs.append(y)

    return torch.stack(outputs, dim=1)  # 形状 (batch, length, D)


# 模拟使用
batch, length, D, N = 2, 10, 4, 8
x = torch.randn(batch, length, D)
C = torch.randn(batch, length, D, N)
dA = torch.randn(batch, length, D, N).abs() + 1e-3
dB = torch.randn(batch, length, D, N)

y = selective_scan(dA, dB, C, x)
print(f"输出形状: {y.shape}")  # (2, 10, 4)
```

### 示例 3：理解 Mamba 的选择性机制

```python
def selective_delta(x, parameter):
    """
    Mamba 的选择性 Delta：根据输入动态决定"吸收多少新信息"。
    当输入是重要关键词时，Delta 变大 → 模型更重视新信息
    当输入是无关词时，Delta 变小 → 模型忽略新信息，保持旧状态
    """
    # softplus 保证 Delta 始终为正数
    return F.softplus(parameter + torch.relu(x))

# 演示
delta_param = torch.tensor(0.5)

# 场景 1：重要关键词（比如 "注意！"）
important_input = torch.tensor(2.0)
delta_important = selective_delta(important_input, delta_param)
print(f"重要词的 Delta: {delta_important:.4f}")  # 较大 → 吸收更多新信息

# 场景 2：无关词（比如 "的"）
unimportant_input = torch.tensor(-1.5)
delta_unimportant = selective_delta(unimportant_input, delta_param)
print(f"无关词的 Delta: {delta_unimportant:.4f}")  # 较小 → 忽略新信息
```

---

## 七、Mamba 的主要优势总结

| 特性 | Transformer | Mamba |
|------|------------|-------|
| 序列长度扩展 | 二次方 O(L²) | 线性 O(L) |
| 推理速度 | 慢（需要 KV Cache） | 快（5x 吞吐量） |
| 长上下文记忆 | 受限于 KV Cache 大小 | 无限（选择性记住关键信息） |
| 参数数量 | 注意力 + MLP | 仅 SSM |
| 推理时内存 | 随序列长度增长 | 恒定 |

---

## 八、值得思考的问题

1. **选择性与泛化**：Mamba 的选择性机制看起来简单（就是让参数随输入变化），但为什么旧 SSM 没有做？答案在于：一旦参数随输入变化，就失去了"卷积并行化"的能力，需要设计新的算法（Selective Scan）来维持效率。

2. **Mamba 不是万能的**：在极度稀疏、需要全局精确匹配的任务上，注意力机制的"全连接"特性仍有不可替代的优势。Mamba 更像是"大多数时候够用且高效"的替代方案。

3. **为什么 A 矩阵不随输入变化？**：A 矩阵定义了系统的基本动力学结构（记忆的保持率），作者认为这是一个"先验"结构，不需要随输入变化。变化的部分（B、C、Δ）则负责"在具体场景中如何运用这个结构"。

---

*注：本笔记基于 arXiv:2312.00752 论文撰写，面向零基础学习者，核心概念从日常类比出发。代码示例为教学用途的简化版本，非论文原文实现。*
