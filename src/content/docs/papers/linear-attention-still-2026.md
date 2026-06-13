---
title: Linear Attention, Still: Why Mamba-style Models Plateau
来源: https://arxiv.org/abs/2605.30621
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

# Linear Attention, Still: Why Mamba-style Models Plateau

## 一、一句话总结

这篇论文说：Mamba 这类状态空间模型（SSM）之所以在长序列上性能不如 Transformer，根本原因是它们的"记忆窗口"太短——它们只能记住最近的几百个 token，而线性注意力（Linear Attention）通过一个更简单的数学 trick 就能做到无限记忆窗口，而且速度一样快。

## 二、日常类比：餐厅服务员 vs 餐厅经理

想象你要点一道复杂的菜，厨师需要参考之前的订单记录。

**Transformer（带 Attention）**：像一个记忆力超群的经理，他能同时记住你过去所有订单的每一个细节。每次你下单，他都会把历史订单全部翻一遍，找出相似的模式来帮你决策。好处是精准，坏处是如果订单多了（比如几千条），翻完所有记录要花很久。

**Mamba / SSM**：像一个有经验的服务员，他只用一本小笔记本。每来一个新订单，他就把笔记本上的内容更新一下——旧的淡出，新的写入。本子容量有限，所以他只能记住最近的几十条。好处是快，坏处是太早的订单全忘了。

**Linear Attention**：像另一个经理，他也记所有订单，但他不逐条翻阅，而是用一个"摘要本"——把所有订单的关键特征累加在一起。每次查的时候只看摘要本，速度极快，而且理论上摘要本可以无限大，不会遗忘。

论文的核心发现就是：服务员（Mamba）之所以跑不赢经理（Transformer），不是因为服务员笨，而是因为本子的容量限制。而那个用摘要本的经理（Linear Attention），既快又不忘。

## 三、核心概念拆解

### 3.1 标准 Attention（Scaled Dot-Product Attention）

这是 Transformer 的核心。它的计算方式是：

```python
def standard_attention(Q, K, V):
    """
    Q, K, V 都是形状为 [batch, seq_len, d_model] 的张量
    
    标准 Attention 的计算公式：
    Attention(Q, K, V) = softmax(Q @ K^T / sqrt(d)) @ V
    
    其中 @ 表示矩阵乘法，^T 表示转置
    """
    d = Q.shape[-1]  # 隐藏层维度
    
    # 第一步：计算 Q 和 K 的点积 —— 衡量每个位置对其他位置的"关注程度"
    scores = Q @ K.transpose(-2, -1) / (d ** 0.5)
    
    # 第二步：Softmax 归一化 —— 把分数变成概率分布（加起来等于 1）
    attention_weights = softmax(scores, dim=-1)
    
    # 第三步：用权重加权求和 V —— 综合所有位置的信息
    output = attention_weights @ V
    
    return output
```

**复杂度问题**：Q 和 K 相乘得到的是 `[batch, seq_len, seq_len]` 的矩阵。如果序列长度是 10000，这个矩阵就有 1 亿个元素。这就是为什么 Transformer 处理长序列很慢——**时间复杂度是 O(n^2)**。

### 3.2 线性注意力（Linear Attention）

线性注意力的关键洞察：**交换 Softmax 和矩阵乘法的顺序**。

```python
def linear_attention(Q, K, V):
    """
    线性 Attention 的计算方式：
    
    标准 Attention:  softmax(QK^T) @ V
    线性 Attention:  (softmax(QK^T) @ V) 
                   ≈  (QK^T @ V)  去掉 softmax 或用核函数近似
    
    利用结合律：(QK^T) @ V = Q @ (K^T @ V)
    先算 K^T @ V，再把结果和 Q 相乘
    """
    # 第一步：先算 K^T @ V —— 这是一个 [d, d] 的小矩阵
    KV = K.transpose(-2, -1) @ V  # [batch, d, d]
    
    # 第二步：再用 Q 乘以这个聚合结果
    output = Q @ KV  # [batch, seq_len, d]
    
    return output
```

**复杂度优势**：K^T @ V 的结果只和维度 d 有关，和序列长度 n 无关。所以总复杂度是 **O(n)**，线性增长。

### 3.3 状态空间模型（SSM）/ Mamba

Mamba 是 SSM 的高效实现。它的核心思想是用一个"状态向量"来压缩历史信息：

```python
def ssm_step(x_t, state, params):
    """
    SSM 的单步递推：
    
    state_{t} = A @ state_{t-1} + B @ x_t    （状态更新）
    y_t       = C @ state_t                     （输出）
    
    其中 A, B, C 是模型参数（可以是随时间变化的）
    x_t 是当前输入，y_t 是当前输出
    """
    A, B, C = params
    
    # 状态按指数衰减：旧信息逐渐"遗忘"
    new_state = A @ state + B @ x_t
    
    # 输出只依赖当前状态
    output = C @ new_state
    
    return output, new_state


def mamba_forward(sequence, params):
    """
    Mamba 对整个序列的前向传播：
    
    依次递推，每一步只依赖前一步的状态
    """
    state = zeros(params.A.shape[0])  # 初始状态为零
    outputs = []
    
    for x_t in sequence:  # 逐个 token 处理
        output, state = ssm_step(x_t, state, params)
        outputs.append(output)
    
    return stack(outputs)
```

**关键限制**：SSM 的状态向量维度是固定的（比如 64 或 128），这意味着它能存储的信息总量是有上限的。早期的信息会被指数级衰减掉。论文把这个称为 **"记忆瓶颈"**。

## 四、论文的三大核心发现

### 发现一：Mamba 的记忆窗口只有约 1K-2K tokens

论文通过实验测量了不同模型能"有效记住"多远的位置。结果是：

- Transformer（Attention）：理论上可以记住任意远的位置
- Mamba / SSM：有效记忆窗口大约 1000-2000 个 token
- 超过这个距离后，模型表现几乎退化到"完全不知道前面有什么"

这就像服务员的小笔记本只能写一页，翻到第二页第一页的内容就看不见了。

### 发现二：Linear Attention 在长序列上持续超越 Mamba

论文在多个基准测试中对比了 Linear Attention 和 Mamba：

- 短序列（< 512 tokens）：两者差距不大
- 中等序列（1K-4K tokens）：Linear Attention 开始领先
- 长序列（8K+ tokens）：Linear Attention 显著优于 Mamba

### 发现三：Linear Attention 的改进方向很清晰

论文指出，如果把 Linear Attention 中的核函数（kernel function）设计得更好，性能还能继续提升。具体来说：

1. 用更好的核函数替代简单的 exp 衰减
2. 加入位置编码的感知
3. 多层堆叠时的信息保留策略

## 五、为什么这个发现重要？

### 对模型设计的启示

```python
# 传统思路：在 SSM 上下功夫
# 假设：SSM 不够好是因为实现不够精妙
# 于是不断修改 A, B, C 参数的计算方式

# 论文揭示的思路：SSM 不够好是因为理论上限低
# 假设：SSM 的记忆瓶颈是根本性的
# 于是转向 Linear Attention —— 它有更高的理论上限
```

### 对实际工程的启示

如果你在做长文本处理（比如代码生成、法律文档分析、医学报告），Linear Attention 可能是比 Mamba 更好的选择。原因很简单：

- 你的文本可能长达数万 token
- Mamba 只能记住最近的一两千个
- Linear Attention 可以记住全部，而且速度一样快

## 六、代码对比：三种方法的完整实现

```python
import torch
import torch.nn as nn
import torch.nn.functional as F


class StandardAttention(nn.Module):
    """标准 Transformer Attention —— O(n^2) 复杂度"""
    
    def __init__(self, d_model, num_heads=8):
        super().__init__()
        self.num_heads = num_heads
        self.d_k = d_model // num_heads
        self.W_q = nn.Linear(d_model, d_model)
        self.W_k = nn.Linear(d_model, d_model)
        self.W_v = nn.Linear(d_model, d_model)
        self.W_o = nn.Linear(d_model, d_model)
    
    def forward(self, x):
        batch_size, seq_len, _ = x.shape
        
        Q = self.W_q(x).view(batch_size, seq_len, self.num_heads, self.d_k)
        K = self.W_k(x).view(batch_size, seq_len, self.num_heads, self.d_k)
        V = self.W_v(x).view(batch_size, seq_len, self.num_heads, self.d_k)
        
        Q = Q.transpose(1, 2)  # [batch, heads, seq, d_k]
        K = K.transpose(1, 2)
        V = V.transpose(1, 2)
        
        # 计算注意力分数 —— O(n^2)
        scores = torch.matmul(Q, K.transpose(-2, -1)) / (self.d_k ** 0.5)
        attn = F.softmax(scores, dim=-1)
        
        # 加权求和
        output = torch.matmul(attn, V)
        output = output.transpose(1, 2).reshape(batch_size, seq_len, -1)
        
        return self.W_o(output)


class LinearAttention(nn.Module):
    """线性 Attention —— O(n) 复杂度，理论上无限记忆"""
    
    def __init__(self, d_model, num_heads=8):
        super().__init__()
        self.num_heads = num_heads
        self.d_k = d_model // num_heads
        self.W_q = nn.Linear(d_model, d_model)
        self.W_k = nn.Linear(d_model, d_model)
        self.W_v = nn.Linear(d_model, d_model)
        self.W_o = nn.Linear(d_model, d_model)
        # 小的 epsilon 防止除零
        self.eps = 1e-6
    
    def forward(self, x):
        batch_size, seq_len, _ = x.shape
        
        Q = F.relu(self.W_q(x))  # ReLU 作为正核函数
        K = F.relu(self.W_k(x))
        V = self.W_v(x)
        
        Q = Q.view(batch_size, seq_len, self.num_heads, self.d_k)
        K = K.view(batch_size, seq_len, self.num_heads, self.d_k)
        V = V.view(batch_size, seq_len, self.num_heads, self.d_k)
        
        Q = Q.transpose(1, 2)
        K = K.transpose(1, 2)
        V = V.transpose(1, 2)
        
        # 关键优化：先算 K^T @ V，再和 Q 相乘
        # K^T @ V 的结果是 [batch, heads, d_k, d_k] —— 和序列长度无关！
        KV = torch.matmul(K.transpose(-2, -1), V)
        output = torch.matmul(Q, KV)
        
        # 归一化
        denominator = Q.sum(dim=-1, keepdim=True).clamp(min=self.eps)
        output = output / denominator
        
        output = output.transpose(1, 2).reshape(batch_size, seq_len, -1)
        return self.W_o(output)


class BasicSSM(nn.Module):
    """简化版 SSM（Mamba 的核心组件）—— 有记忆瓶颈"""
    
    def __init__(self, d_model, state_dim=64):
        super().__init__()
        self.d_model = d_model
        self.state_dim = state_dim
        
        # SSM 的参数
        self.A = nn.Parameter(torch.randn(state_dim, state_dim) * 0.1)
        self.B = nn.Linear(d_model, state_dim)
        self.C = nn.Linear(state_dim, d_model)
        self.output_gate = nn.Linear(d_model, d_model)
    
    def forward(self, x):
        """
        x: [batch, seq_len, d_model]
        
        对每个时间步递推：
        state_t = A @ state_{t-1} + B @ x_t
        y_t     = C @ state_t * sigmoid(gate_t)
        """
        batch_size, seq_len, _ = x.shape
        state = torch.zeros(batch_size, self.state_dim, device=x.device)
        outputs = []
        
        for t in range(seq_len):
            x_t = x[:, t, :]  # [batch, d_model]
            
            # 状态更新 —— 注意 A 的特征值通常小于 1，
            # 导致旧信息指数衰减
            state = torch.matmul(state, self.A.t()) + self.B(x_t)
            
            # 输出
            output = self.C(state) * torch.sigmoid(self.output_gate(x_t))
            outputs.append(output)
        
        return torch.stack(outputs, dim=1)
```

## 七、关键数学直觉

### 为什么 SSM 会遗忘？

SSM 的状态更新公式是：

```
state_t = A @ state_{t-1} + B @ x_t
```

如果 A 的特征值都小于 1（这是稳定性的要求），那么：

```
state_t = A^n @ state_0 + A^{n-1}B @ x_1 + ... + A @ x_{n-1} + B @ x_n
```

A 的幂次越高，贡献越小。也就是说，**第 1 步的信息在 100 步之后只剩原来的 A^100**。如果 A = 0.99，那么 100 步后只剩 37%，1000 步后只剩 0.004%。

### 为什么 Linear Attention 不会遗忘？

Linear Attention 的聚合形式是：

```
output = Q @ (sum_i K_i^T @ V_i)
```

这个 sum 是**累加的**，不会衰减。第 1 步的信息和第 10000 步的信息以同等权重被包含在内。只要核函数设计得当，理论上没有任何信息会被"冲掉"。

## 八、学习小结

这篇论文的价值不在于提出了一个新模型，而在于**用系统性的实验澄清了一个长期存在的混淆**：

| 模型类型 | 记忆能力 | 计算复杂度 | 长序列表现 |
|---------|---------|-----------|----------|
| Transformer (Attention) | 无限 | O(n^2) | 好但慢 |
| Mamba (SSM) | 约 1K tokens | O(n) | 中等 |
| Linear Attention | 无限 | O(n) | 好且快 |

对零基础学习者的建议：

1. 先理解标准 Attention 的 O(n^2) 瓶颈在哪里
2. 再理解 Linear Attention 如何通过矩阵结合律打破这个瓶颈
3. 最后理解 SSM 的记忆瓶颈是结构性的，不是工程问题

这篇论文告诉我们：有时候模型跑不动不是因为不够聪明，而是因为"笔记本太小"。换一种记录方式，比不断改良记录方式更有效。
