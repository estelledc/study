---
title: "Gated DeltaNet-2: Decoupling Erase and Write in Linear Attention"
来源: https://arxiv.org/abs/2605.22791
日期: 2026-06-13
分类_原始: 深度学习
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

# Gated DeltaNet-2 学习笔记

## 一句话总结

Gated DeltaNet-2 把"删除旧记忆"和"写入新记忆"两个动作分开控制，用两通道门（erase gate + write gate）替代了之前模型里绑在一起的单个门控标量，在长上下文检索任务上效果显著提升。

## 日常类比：办公室的便签本

想象你在办公室用一本便签本管理项目。每一行代表一个"项目-负责人"的关联。

**普通 Transformer（Self-Attention）：** 你有一面墙，墙上贴满了几千张便签，每次看到新信息都会回顾所有旧便签。好处是永远不会遗忘，缺点是墙太小，贴满了就看不完。

**线性注意力（Linear Attention）：** 你改用一个固定大小的笔记本，每看到新信息就把它"压缩"写进去。但笔记本的容量有限，旧信息会和新信息挤在一起，最后你分不清谁是谁。

**DeltaNet 系列（Delta Rule）：** 在写新信息之前，你先查看笔记本中"对应这个项目"的那一行，把它读出来，然后减去旧值再写入新值。这就像你知道要去更新哪个项目，先翻到那一页，擦掉旧的负责人再填新的。

**KDA（Kimi Delta Attention）：** 让笔记本里每一"列"有自己的自动衰减率——某些列的墨水会更快褪色。这很好，但"擦多少"和"写多少"还是同一个旋钮控制的。

**Gated DeltaNet-2 的问题意识：** 擦除和写入是两件不同的事。我想擦掉项目 A 的旧负责人（擦除），但只写入项目 B 的新负责人（写入）。把这两个动作绑在一个标量上是人为的限制。Gated DeltaNet-2 给了你两个独立的旋钮：一个控制"擦除哪些通道"，一个控制"写入哪些通道"。

## 核心概念

### 1. 线性注意力的状态更新

线性注意力用固定大小的矩阵状态 $S_t \in \mathbb{R}^{d_k \times d_v}$ 替代了 Transformer 的 $O(L)$ 注意力矩阵。每个 token 时刻 $t$，状态更新为：

$$S_t = D_t S_{t-1} + k_t z_t^\top$$

其中 $D_t = \text{Diag}(\alpha_t)$ 是通道级衰减矩阵，$k_t$ 是 key，$z_t$ 是门控后的 value。

### 2. Gated Delta Rule-2（核心公式）

$$S_t = (I - k_t e_t^\top) D_t S_{t-1} + k_t z_t^\top$$

其中：
- $e_t = b_t \odot k_t$——**擦除门控后的 key**，$b_t \in [0,1]^{d_k}$ 是逐通道的擦除门
- $z_t = w_t \odot v_t$——**写入门控后的 value**，$w_t \in [0,1]^{d_v}$ 是逐通道的写入门

关键在于：$e_t$ 和 $z_t$ 使用**独立的通道级门控**，不再共享同一个标量 $\beta_t$。

### 3. 门控来源

两个门控来自独立的全连接层：

$$b_t = \sigma(W_b x_t), \quad w_t = \sigma(W_w x_t)$$

衰减门控 $\alpha_t$ 使用 log-space 参数化：

$$g_t = -\exp(a) \odot \text{softplus}(W_f x_t + \delta), \quad \alpha_t = \exp(g_t)$$

### 4. 三种模型的统一关系

Gated DeltaRule-2 是一个**统一框架**：

| 当...时 | 退化为 |
|---------|--------|
| $b_t = w_t = \beta_t \cdot \mathbf{1}$ | KDA |
| $b_t = w_t = \beta_t \cdot \mathbf{1}$ 且 $\alpha_t = \alpha_t \cdot \mathbf{1}$ | Gated DeltaNet |
| 两个门各自独立学习 | Gated DeltaNet-2 |

这说明 KDA 和 Gated DeltaNet 只是 Gated DeltaNet-2 在"门控绑死"时的特例。

### 5. 快速权重视角

Gated Delta Rule-2 可以看作在线最小化以下目标函数：

$$S_t = \arg\min_S \|S - \bar{S}_t\|_F^2 - 2\langle S^\top k_t, z_t - \bar{S}_t^\top e_t \rangle$$

第一项保持新状态接近衰减后的旧状态，第二项执行一个"关联编辑"——用门控后的写入目标 $z_t$ 减去从状态中沿门控擦除方向 $e_t$ 读取的内容。

### 6. 分块并行训练（Chunkwise Training）

为了在训练时利用 GPU 并行计算，Gated DeltaNet-2 使用分块策略：将序列切成长度为 $C$ 的 chunk，chunk 内用密集矩阵乘法，chunk 间保持递推。核心公式（第 23-24 行）保持与 KDA 相同的形式，唯一的区别是辅助矩阵 $Y$ 和 $U$ 的构造方式融入了通道级门控。

### 7. 门控感知反向传播（Gate-Aware Backward）

在反向传播中，之前的标量门控可以"提到点积外面"简化计算。但 Gated DeltaNet-2 的擦除和写入是**不同通道的对角矩阵**，门控因子必须留在累加位置：

$$\mathrm{d}A \mathrel{+}= \mathrm{d}U Z^\top, \quad Z = W \odot V$$
$$\mathrm{d}A \mathrel{+}= \mathrm{d}Y \bar{E}^\top, \quad \bar{E} = \gamma \odot (B \odot K)$$

这保证了梯度能正确传播到独立的门控参数。

## 代码示例

### 示例 1：Gated Delta Rule-2 的前向传播

```python
import torch
import torch.nn as nn
import torch.nn.functional as F


class GatedDeltaNet2Head(nn.Module):
    """
    单个 attention head 的 Gated DeltaNet-2 实现。

    参数:
        d_model: 模型维度
        d_head: 每个 head 的维度 (d_k = d_v = d_head)
        n_heads: head 数量

    前向传播中每个 token t 递推一次:
        S_t = (I - k_t e_t^T) D_t S_{t-1} + k_t z_t^T
        e_t = b_t * k_t   # 擦除门控
        z_t = w_t * v_t   # 写入门控
    """

    def __init__(self, d_model: int, d_head: int = 64, n_heads: int = 8):
        super().__init__()
        self.d_head = d_head
        self.n_heads = n_heads
        self.dim = d_model // n_heads

        # Query, Key, Value 投影
        self.q_proj = nn.Linear(self.dim, self.dim)
        self.k_proj = nn.Linear(self.dim, self.dim)
        self.v_proj = nn.Linear(self.dim, self.dim)

        # 擦除门 b_t 和 写入门 w_t 的独立投影
        self.b_proj = nn.Linear(self.dim, self.dim)  # erase gate
        self.w_proj = nn.Linear(self.dim, self.dim)  # write gate

        # 衰减门: 从 log-space 参数化得到 alpha_t
        self.decay_a = nn.Parameter(torch.zeros(self.dim))
        self.f_proj = nn.Linear(self.dim, self.dim)
        self.decay_bias = nn.Parameter(torch.zeros(self.dim))

        # 输出投影
        self.o_proj = nn.Linear(self.dim, self.dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        x: (batch, seq_len, d_model)
        返回: (batch, seq_len, d_model)
        """
        batch, seq_len, _ = x.shape
        h = self.n_heads
        d = self.dim

        # 切分 head
        x = x.reshape(batch, seq_len, h, d).transpose(1, 2)
        # x: (batch, n_heads, seq_len, d)

        # 投影 q, k, v
        q = self.q_proj(x)
        k = self.k_proj(x)
        v = self.v_proj(x)

        # L2 归一化 q, k 保证数值稳定
        q = F.normalize(q, p=2, dim=-1)
        k = F.normalize(k, p=2, dim=-1)

        # 生成两个独立门控
        b = torch.sigmoid(self.b_proj(x))   # (B, H, T, d)
        w = torch.sigmoid(self.w_proj(x))   # (B, H, T, d)

        # 生成衰减系数 alpha_t
        log_decay = -torch.exp(self.decay_a) * F.softplus(
            self.f_proj(x) + self.decay_bias
        )
        alpha = torch.exp(log_decay)  # (B, H, T, d)

        # ---- 递推: 每个 token 依次更新状态 ----
        outputs = []
        S = torch.zeros(batch, h, d, d, device=x.device)

        for t in range(seq_len):
            k_t = k[:, :, t]     # (B, H, d)
            v_t = v[:, :, t]     # (B, H, d)
            q_t = q[:, :, t]     # (B, H, d)
            b_t = b[:, :, t]     # (B, H, d)
            w_t = w[:, :, t]     # (B, H, d)
            alpha_t = alpha[:, :, t]  # (B, H, d)

            # Step 1: 衰减
            S = alpha_t.unsqueeze(-1) * S

            # Step 2: 擦除门控 key
            e_t = b_t * k_t       # (B, H, d)

            # Step 3: 写入门控 value
            z_t = w_t * v_t       # (B, H, d)

            # Step 4: Gated Delta Rule-2
            # S_t = (I - k_t e_t^T) S_t + k_t z_t^T
            # 展开: S_t = S_t - k_t e_t^T S_t + k_t z_t^T
            outer_read = e_t.unsqueeze(1) @ S  # (B, H, d, d)
            S = S - k_t.unsqueeze(1).unsqueeze(2) * outer_read
            S = S + k_t.unsqueeze(1).unsqueeze(2) * z_t.unsqueeze(2)

            # Step 5: 读取输出
            o_t = S.transpose(-2, -1) @ q_t    # (B, H, d)
            outputs.append(o_t)

        # 合并 head，恢复维度
        out = torch.stack(outputs, dim=2)       # (B, H, T, d)
        out = out.transpose(1, 2)               # (B, T, H, d)
        out = out.reshape(batch, seq_len, -1)   # (B, T, d_model)
        out = self.o_proj(out)
        return out
```

### 示例 2：分块并行训练（Chunkwise）

```python
import torch
import torch.nn.functional as F


def chunked_gated_deltanet2(
    Q: torch.Tensor,   # (B, H, T, d)
    K: torch.Tensor,   # (B, H, T, d)
    V: torch.Tensor,   # (B, H, T, d)
    B: torch.Tensor,   # (B, H, T, d)  erase gate
    W: torch.Tensor,   # (B, H, T, d)  write gate
    Alpha: torch.Tensor,  # (B, H, T, d) decay
    chunk_size: int = 64,
):
    """
    分块版本的 Gated DeltaNet-2，用于训练时的并行计算。

    核心思想：
    - 将序列切为 chunk_size 大小的块
    - chunk 内部用矩阵乘法并行计算
    - chunk 之间保持递推关系

    每个 chunk 内执行:
        1. 累积衰减 gamma_r = product(alpha_1..r)
        2. 归一化: k_bar = gamma^{-1} * k, e_bar = gamma * (b * k)
        3. Z = W * V (写入门控)
        4. T = tril(E_bar @ K_bar^T, -1)  (下三角矩阵)
        5. A = (I + T)^{-1}  (前代求解)
        6. Y = A @ E_bar, U = A @ Z  (辅助矩阵)
        7. 输出: O = Q_gamma @ S_prev + A_qk @ (U - Y @ S_prev)
    """
    B, H, T, D = Q.shape
    n_chunks = (T + chunk_size - 1) // chunk_size
    all_outputs = []
    S = torch.zeros(B, H, D, D, device=Q.device)

    for c in range(n_chunks):
        start = c * chunk_size
        end = min(start + chunk_size, T)
        C = end - start  # 当前 chunk 实际大小

        q_c = Q[:, :, start:end]     # (B, H, C, D)
        k_c = K[:, :, start:end]
        v_c = V[:, :, start:end]
        b_c = B[:, :, start:end]
        w_c = W[:, :, start:end]
        a_c = Alpha[:, :, start:end]

        # 累积衰减 gamma: gamma_r = prod(alpha_1..r)
        log_gamma = torch.cumsum(torch.log(a_c + 1e-8), dim=2)  # (B, H, C, D)
        gamma = torch.exp(log_gamma)  # (B, H, C, D)
        gamma_prev = F.pad(gamma[:, :, :-1], (0, 0, 0, 0, 1, 0), value=1.0)

        # 归一化 key 和 erase key
        k_bar = k_c / gamma_prev     # gamma^{-1} * k
        e_c = b_c * k_c
        e_bar = gamma * e_c          # gamma * (b * k)

        # 写入门控后的 value
        Z = w_c * v_c  # (B, H, C, D)

        # 构造下三角矩阵 T = tril(e_bar @ k_bar^T, -1)
        # T[r, s] = e_bar[r] @ k_bar[s]  for r > s
        ek_prod = e_c.unsqueeze(2) * k_c.unsqueeze(1)  # (B, H, C, C, D)
        ek_prod = ek_prod.sum(dim=-1)  # (B, H, C, C)
        T = torch.tril(ek_prod, diagonal=-1)  # 严格下三角

        # A = (I + T)^{-1} 通过前代求解
        I = torch.eye(C, device=Q.device)
        A_mat = I + T  # (B, H, C, C)
        # 对每个 batch 和 head 做前代求解
        A_inv = torch.linalg.solve(A_mat, torch.eye(C, device=Q.device))
        # A_inv 实际上是 (I+T)^{-1}

        # 辅助矩阵
        E_bar_mat = e_bar  # (B, H, C, D)
        Y = A_inv @ E_bar_mat.permute(0, 1, 3, 2)  # (B, H, D, D) -> 转置后求解
        U = A_inv @ Z.permute(0, 1, 3, 2)          # (B, H, D, D)

        # 重新构造 Y, U 用于矩阵乘法
        Y_mat = Y.permute(0, 1, 3, 2)  # (B, H, D, D)
        U_mat = U.permute(0, 1, 3, 2)  # (B, H, D, D)

        # 归一化的 query
        q_gamma = q_c * gamma  # (B, H, C, D)

        # 计算 QK 注意力掩码部分
        qk_raw = torch.einsum('bhcd,bhse->bhces', q_c, k_c / gamma_prev)
        mask = torch.tril(torch.ones(C, C, device=Q.device)).unsqueeze(0).unsqueeze(0)
        qk = qk_raw * mask.unsqueeze(-1) * gamma.unsqueeze(2)
        A_qk = qk @ V[:, :, start:end].permute(0, 1, 3, 2)  # (B, H, C, D)

        # 输出 = Q_gamma @ S + A_qk_term
        output = q_gamma @ S + qk_raw @ (U_mat - Y_mat @ S).permute(0, 1, 3, 2)

        # 更新状态
        k_tail = k_c / gamma_prev
        S = gamma[:, :, -1].unsqueeze(-1) * S + k_tail.transpose(-2, -1) @ (U_mat - Y_mat @ S)

        all_outputs.append(output)

    out = torch.cat(all_outputs, dim=2)
    return out
```

## 实验结果亮点

### 长上下文检索（RULER 任务）

| 模型 | 4K Multi-Key | 8K Multi-Key |
|------|-------------|-------------|
| Mamba-2 | 14.4% | -- |
| KDA | 26.2% | -- |
| Gated DeltaNet | 60.6% | 32.0% |
| **Gated DeltaNet-2** | **31.8%** (4K) | **39.2%** (8K, MK-NIAH) |

Multi-Key Needle-in-a-Haystack（MK-NIAH）是最能体现代价分离价值的任务——状态需要在有限空间中同时记住多个独立的"键-值"关联。Gated DeltaNet-2 在这个设置下全面领先。

### 语言模型性能

在 1.3B 参数、100B FineWeb-Edu tokens 的训练设置下，Gated DeltaNet-2 在语言模型困惑度和常识推理基准上均优于 Mamba-2、Gated DeltaNet、KDA 和 Mamba-3 的变体。

## 关键洞见

1. **擦除和写入本质不同**：擦除发生在 key 轴（决定读哪些通道），写入发生在 value 轴（决定写哪些通道）。把它们绑在一起没有理论依据。

2. **通道级门控优于标量门控**：标量门控假设所有通道需要相同的"擦/写比例"，这与实际的数据分布不符。

3. **不牺牲并行训练**：通过分块 WY 算法和通道级衰减吸收，Gated DeltaNet-2 保持了高效的 GPU 并行训练能力。

4. **向后兼容**：KDA 和 Gated DeltaNet 都是它的特例——当门控退化为标量时，公式自动简化回旧模型。

## 遗留问题与思考

- 擦除门 $b_t$ 取值为 $[0,1]$，但论文提到可以扩展到 $[0,2]$（负特征值变体）。这个扩展对性能的影响有多大？
- 在推理时，递推的 $O(T)$ 循环仍然是瓶颈。是否有办法进一步将递推向量化或并行化？
- 门控的稀疏性值得研究——如果大部分通道的 $b_t$ 和 $w_t$ 接近 0 或 1，是否可以用低秩近似来压缩模型？
