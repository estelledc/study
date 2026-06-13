---
title: FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness
来源: https://arxiv.org/abs/2205.14135
日期: 2026-06-13
分类: 机器学习
子分类: ml
provenance: pipeline-v3
---

# FlashAttention：快速且省内存的精确注意力计算

## 从一张"图书馆查资料"的图说起

想象你在图书馆做一份研究报告，需要翻阅上百本书来汇总信息。

**传统方法**就像这样：
1. 你把所有书搬到一个大桌子上（从仓库搬到内存）
2. 一页一页翻，把要抄的内容写在笔记本上
3. 翻完一本再翻下一本

如果书很多，桌子会堆满，甚至放不下。这就是 Transformer 中"自注意力"（Self-Attention）的问题：当句子变长，注意力矩阵会变得巨大，GPU 显存很快就爆了。

**FlashAttention 的思路**是换一种工作方式：
- 不要把所有书一次全搬出来
- 而是分批处理：每次只搬一小摞，快速看完、记下来、放回仓库
- 再搬下一摞

核心思想很简单：**减少 GPU 显存（HBM）和芯片内部缓存（SRAM）之间搬数据的次数**。

## GPU 内存的分层结构

要理解 FlashAttention，先搞懂 GPU 内存长什么样。

GPU 内存不是单一的，而是分层的：

| 层级 | 名字 | 大小 | 速度 | 类比 |
|------|------|------|------|------|
| 最内 | 寄存器 | 很少 | 最快 | 你手里的便签纸 |
| 中间 | L1/L2 缓存 + SRAM | 几十 MB | 快 | 你桌子上的文件 |
| 最外 | HBM（高带宽显存） | 24~80 GB | 慢 | 图书馆仓库的书架 |

关键事实：**HBM 到 SRAM 之间的数据传输，速度比在 SRAM 内计算慢很多倍。**

所以，如果你要从 HBM 读 1GB 数据然后只算几行，相当于把一整摞书搬出来只看了一页——太浪费了。

## 标准注意力算法的问题

先看 Transformer 中最核心的"自注意力"操作。它要计算三样东西：

- **Q（Query）**：你正在查什么
- **K（Key）**：每本书的目录索引
- **V（Value）**：每本书的实际内容

标准算法是这样做的：

```python
import torch

def standard_attention(Q, K, V):
    """
    Q, K, V: 形状都是 (batch, heads, seq_len, head_dim)
    例如: (2, 12, 512, 64) 表示 2 个 batch, 12 个注意力头,
         序列长度 512, 每个头 64 维
    """
    # 第一步：计算 Q 和 K 的点积，得到注意力分数
    # 结果形状: (batch, heads, seq_len, seq_len)
    # 当 seq_len = 4096 时，这个矩阵就有 4096 * 4096 = 16,777,216 个元素
    scores = torch.matmul(Q, K.transpose(-2, -1)) / (Q.shape[-1] ** 0.5)

    # 第二步：Softmax 归一化，让每行加起来等于 1
    attention_weights = torch.softmax(scores, dim=-1)

    # 第三步：用注意力权重加权 V，得到输出
    output = torch.matmul(attention_weights, V)

    return output
```

**问题出在第一步产出的 `scores` 矩阵。**

假设序列长度是 4096：
- `scores` 的形状是 `(2, 12, 4096, 4096)`
- 如果用 float16（2 字节/数），这个矩阵占用：2 × 12 × 4096 × 4096 × 2 ≈ **804 MB**

如果序列长度变成 16384：
- 矩阵大小膨胀到 **~26 GB** —— 一张 A100 的 80GB 显存几乎被这一个矩阵占满了。

而且，这个矩阵只是**中间结果**，算完 softmax 之后就不再需要了。但它必须完整地存在 HBM 显存里，因为 GPU 的所有计算单元可能需要同时读取它。

**FlashAttention 的洞察**：我们根本不需要把整个注意力矩阵一次性存在 HBM 里。我们可以分块计算、分块写入 SRAM、算完就丢。

## 核心思想：分块 + 在线 Softmax

### 类比：分批抄笔记

继续用图书馆的比喻：

传统方法：把所有书摊在桌上，抄完全部笔记，再收拾。
FlashAttention：每次只摊 3 本书，抄完笔记，合上放回，再摊下 3 本。

### 技术细节：两趟扫描

FlashAttention 的算法分成两个阶段，每一阶段都分块处理：

**第一趟（前向扫描）**：
- 把 Q 分块，把 K 和 V 也分块
- 每次从 SRAM 里取出一个 Q 块和一个 K 块，计算小块注意力分数
- 应用 Softmax，得到小块权重
- 用这些权重更新输出

**关键创新：在线 Softmax**

普通 Softmax 需要两遍数据：
1. 第一遍：算出所有分数的最大值和指数和（用于归一化）
2. 第二遍：用第一遍的结果计算最终的 Softmax 值

FlashAttention 发现：Softmax 可以**一行一行增量计算**。不需要先看过所有行。

```python
def online_softmax(scores, max_score, sum_exp):
    """
    在线 Softmax：不需要把所有分数都存下来。
    每来一个新分数，就增量更新 max 和 sum，立即计算部分结果。
    max_score: 目前已看到的最大分数
    sum_exp: 目前所有 exp(x - max) 的总和
    """
    # 新分数到来时，先更新全局最大
    new_max = max(max_score, scores)

    # 重新加权旧结果（因为 max 变了）
    reweight = max_score - new_max

    # 更新指数和
    new_sum = sum_exp * torch.exp(reweight) + torch.exp(scores - new_max)

    return new_max, new_sum
```

**第一趟结束后**，每个输出块都包含了"看到过的所有 K 块"的贡献。

**第二趟（反向扫描，用于梯度计算）**：
- 同样分块处理，计算 Q、K、V 的梯度
- 也用在线方法，减少中间结果存储

## 为什么更快？IO 复杂度分析

这是这篇论文最精妙的部分。

作者从理论分析了：标准注意力算法需要多少次 HBM 读写？

假设：
- 序列长度为 n
- SRAM 容量为 M
- 输入大小为 N（Q、K、V 的总数据量）

标准算法至少需要从 HBM 读写 O(n²) 次数据（因为要存 n×n 的注意力矩阵）。

而 FlashAttention 的 HBM 访问次数是：

```
O(n²d / M)   （其中 d 是每个头维度）
```

当 n 很大时，标准算法是 O(n²)，而 FlashAttention 是 O(n²/M)，**省了 M 倍的 HBM 访问**。

M 通常是几十 MB（GPU 的 SRAM），所以实际加速倍数非常可观。

更有趣的是：论文证明了 FlashAttention **在理论上已经是最优的**——对于给定 SRAM 大小，不可能再做更少的 HBM 访问了。

## 代码示例：从零实现一个简化版

下面是一个教学目的的简化实现，帮助理解核心逻辑：

```python
import torch
import torch.nn.functional as F


def flash_attention_simple(Q, K, V, BLOCK_SIZE=256):
    """
    简化版 FlashAttention 核心逻辑（仅前向传播）。

    参数:
        Q, K, V: 形状 (batch, heads, seq_len, head_dim)
        BLOCK_SIZE: 分块大小，即每次处理多少行

    返回:
        output: 形状同 Q
    """
    batch, heads, seq_len, head_dim = Q.shape
    device = Q.device
    output = torch.zeros_like(Q)

    # 初始化：每行的 max_score 为负无穷，sum_exp 为 0
    # 在 SRAM 中维护，不存到 HBM
    row_max = torch.zeros(batch, heads, seq_len, device=device)
    row_sum = torch.zeros(batch, heads, seq_len, device=device)
    row_val = torch.zeros(batch, heads, seq_len, head_dim, device=device)

    # 将 K 和 V 按块切分（沿着 seq_len 维度）
    num_blocks_k = (seq_len + BLOCK_SIZE - 1) // BLOCK_SIZE

    for j in range(num_blocks_k):
        # 从 HBM 中取出一个 K 块和 V 块，放入 SRAM
        # 这步就是"减少 HBM 读写"的关键：只搬需要的部分
        k_start = j * BLOCK_SIZE
        k_end = min(k_start + BLOCK_SIZE, seq_len)
        K_block = K[:, :, k_start:k_end, :]  # (batch, heads, block_len, head_dim)
        V_block = V[:, :, k_start:k_end, :]

        num_blocks_q = (seq_len + BLOCK_SIZE - 1) // BLOCK_SIZE

        for i in range(num_blocks_q):
            # 从 HBM 中取出一个 Q 块
            q_start = i * BLOCK_SIZE
            q_end = min(q_start + BLOCK_SIZE, seq_len)
            Q_block = Q[:, :, q_start:q_end, :]  # (batch, heads, block_len, head_dim)

            # 在 SRAM 中计算 Q_block 和 K_block 的点积
            # 形状: (batch, heads, block_len_q, block_len_k)
            scores = torch.matmul(Q_block, K_block.transpose(-2, -1))

            # 缩放（和标准注意力一样）
            scores = scores / (head_dim ** 0.5)

            # 在线 Softmax 更新
            # 1. 找出当前块的 max
            block_max = torch.max(scores, dim=-1, keepdim=True).values  # (batch, heads, block_len_q, 1)
            # 2. 更新全局 max
            new_max = torch.maximum(row_max[:, :, q_start:q_end], block_max)
            # 3. 重新加权旧值
            reweight = torch.exp(row_max[:, :, q_start:q_end] - new_max)
            row_val[:, :, q_start:q_end] *= reweight
            row_sum[:, :, q_start:q_end] *= reweight
            # 4. 计算当前块的 exp
            exp_scores = torch.exp(scores - new_max)  # (batch, heads, block_len_q, block_len_k)
            # 5. 更新 sum 和 val
            row_sum[:, :, q_start:q_end] += exp_scores.sum(dim=-1)
            row_val[:, :, q_start:q_end] += torch.matmul(exp_scores, V_block)
            # 6. 更新 max
            row_max[:, :, q_start:q_end] = new_max

    # 最终归一化
    output = row_val / row_sum.unsqueeze(-1)
    return output
```

再看一个实际使用示例，展示 FlashAttention 在真实项目中的用法：

```python
# 实际项目中，你不需要自己实现 FlashAttention
# 直接调用 flash-attn 库即可：

# pip install flash-attn
import flash_attn

# 生成 Q, K, V（和标准注意力一样）
batch_size = 2
seq_len = 1024
head_dim = 64
num_heads = 12

Q = torch.randn(batch_size, num_heads, seq_len, head_dim, device='cuda')
K = torch.randn(batch_size, num_heads, seq_len, head_dim, device='cuda')
V = torch.randn(batch_size, num_heads, seq_len, head_dim, device='cuda')

# 一行代码替代上面的标准 attention 代码
# flash-attn 内部自动做了分块、在线 softmax、梯度反传
output = flash_attn.flash_attn_func(Q, K, V, dropout_p=0.0, softmax_scale=None, causal=False)

# output 形状: (2, 12, 1024, 64)，和标准注意力完全一样
# 但速度更快，显存占用更低

# 如果是因果注意力（GPT 风格的自回归生成），加个参数就行：
output_causal = flash_attn.flash_attn_func(Q, K, V, causal=True)
```

## Block-Sparse FlashAttention

论文还做了一个扩展：**块稀疏注意力**。

某些场景下，不是所有 token 都需要和所有其他 token 交互。比如：
- 一个 token 可能只关心它附近的几个 token（局部注意力）
- 或者只关心某些"关键"token（比如文档标题）

FlashAttention 把这些"关心的关系"用稀疏矩阵表示，同样用分块 + SRAM 的策略来算。结果是：**比已有的任何近似注意力方法都快**。

## 论文的实验结果

| 模型 | 序列长度 | 加速比 |
|------|---------|--------|
| BERT-large | 512 | 1.15×（相比 MLPerf 1.1 训练速度记录） |
| GPT-2 | 1024 | 3× |
| Long-Range Arena | 1024-4096 | 2.4× |
| Path-X | 16384 | 首次达到优于随机的准确率（61.4%） |
| Path-256 | 65536 | 首次达到 63.1% 准确率 |

最惊人的是最后两个：Path-X 和 Path-256 是超长跑基准测试，分别需要处理 16K 和 64K 长度的序列。**在此之前，没有任何 Transformer 能在这些任务上跑出好结果。**

## 总结：三个关键收获

1. **IO 感知设计**：不要只关注"算了多少 FLOP"，更要关注"从内存里搬了多少数据"。在 GPU 上，后者往往是瓶颈。

2. **分块 + 在线算法**：把大矩阵拆小块在 SRAM 里算，用增量方式计算 Softmax，避免保存整个中间矩阵。

3. **理论最优**：FlashAttention 的 HBM 访问次数在理论上是下界，意味着这个方向已经做到了极致。

## 延伸思考

- FlashAttention 的论文发表于 2022 年 5 月，到 2023 年已经有了 FlashAttention-2（Tri Dao 单独一作），进一步提升了并行度和工作效率。
- 2024 年又出了 FlashAttention-3，针对 Hopper 架构的 HBMv3 内存做了专门优化。
- 这篇论文的启示是：很多时候，**算法改进比单纯增加计算量更有效**。少搬数据，就是最大的加速。
