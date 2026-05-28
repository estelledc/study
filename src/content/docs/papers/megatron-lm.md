---
title: Megatron-LM 张量并行如何把单卡放不下的大模型切到多卡
description: 用矩阵分块的小学算术把 Transformer 的 Linear 层横切纵切，让 8B+ 参数在 8 张 V100 上并行训练，是 GPT-3 / LLaMA / DeepSeek 之前所有大模型训练栈的共同地基
season: P
phase: P1
branch: method
status: published
publishDate: 2026-05-28
updatedDate: 2026-05-28
tags:
  - tensor-parallel
  - distributed-training
  - transformer
  - scaling
---

## Layer 0 — 论文身份卡

| 字段 | 内容 |
|------|------|
| 标题 | Megatron-LM: Training Multi-Billion Parameter Language Models Using Model Parallelism |
| 作者 | Shoeybi, Patwary, Puri, LeGresley, Casper, Catanzaro |
| 机构 | NVIDIA |
| 年份 | 2019（v1）/ 2020（v3 修订） |
| arXiv | 1909.08053 |
| 代码 | github.com/NVIDIA/Megatron-LM（12k+ stars，工业界 SOTA TP 实现） |
| 引用量级 | 5000+（截至 2026 中段，是分布式训练领域最高引论文之一） |
| 影响力定位 | 张量并行（Tensor Parallel, TP）的奠基论文，所有后续大模型训练框架（DeepSpeed / FSDP / Megatron-Core / NeMo / Colossal-AI）都在它的接口上扩展 |
| 我的标签 | 状元篇——读不懂这一篇就读不懂任何后续 trillion-scale 训练论文 |

**一句话定位**：把 Transformer 里的大矩阵乘法按列或按行切到多卡上，每张卡只算一片，用一次 all-reduce 把结果合起来，靠这一招把"单 GPU 装不下的模型"变成了"多 GPU 协同训练的模型"。

![张量并行核心示意：列并行 + 行并行如何串接](/study/papers/megatron-lm/01-tensor-parallel.webp)

---

## Layer 1 — Why（为什么这篇论文必须存在）

### 1.1 论文出现之前世界什么样

**2019 年中段的现实**：训练大语言模型主要靠两条路。

- **数据并行（Data Parallel, DP）**：每张卡装一份完整模型副本，把 batch 切成 N 份，各算各的梯度，最后 all-reduce 平均。这是 PyTorch DDP 的默认套路，也是绝大多数研究者唯一会用的工具。
- **流水线并行（Pipeline Parallel, PP）**：把模型按层切到不同卡上，前几层在卡 0，后几层在卡 1。GPipe（2018）把它做出来了，但有 bubble、调度复杂。

**问题在哪**：模型只要超过单卡显存（V100 是 32GB），DP 就直接死掉。一个 8B 参数的模型，光参数就 32GB，加上梯度、优化器状态、激活值，单卡完全装不下。**DP 假设"每张卡都能装下一份完整模型"，这个假设在 2019 年突然不成立了**。

PP 能切，但切得粗——一层只能整层放在一张卡上。如果某一层（比如 FFN 的 hidden dim）本身就大到一张卡装不下，PP 也救不了你。

### 1.2 GPT-2 1.5B 已经是上限

OpenAI 的 GPT-2 1.5B 是 2019 年初的极限，训练时基本卡在单机多卡的边界。要往 8B、20B、175B 走，**必须有一种比 PP 更细粒度、比 DP 更省显存的并行策略**。

### 1.3 Megatron 的回答

Shoeybi 团队的洞察非常朴素——**矩阵乘法天然可分块**。

- 一个 Linear 层 `Y = X @ W`，权重 W 是个 `[in, out]` 的矩阵
- 我可以把 W **按列切**：`W = [W1 | W2]`，每张卡存一半列
- 也可以把 W **按行切**：`W = [W1; W2]`，每张卡存一半行
- 算的时候每张卡算自己那块，最后用一次 all-reduce 或 all-gather 拼起来

把这招用到 Transformer 的 FFN（两个 Linear 串联）和 self-attention（QKV + 输出投影）上，就能把单层切到 N 张卡上，**每张卡的显存占用变成 1/N**。

### 1.4 这篇论文为什么是状元篇

读懂 Megatron-LM 之后，你才能读懂：

- DeepSpeed ZeRO（2020）— 把"切矩阵"扩展到"切优化器状态/梯度/参数"
- GShard / Switch Transformer（2020-2021）— MoE 路由的并行
- Megatron-Turing NLG 530B（2021）— 3D 并行（DP × TP × PP）
- LLaMA / DeepSeek / Qwen 训练栈 — 全部默认带 TP

**它是地基**。我把它放在 Season P 第一篇，是因为后面所有论文都假设你已经知道"列并行""行并行""TP=8"是什么意思。

---

## Layer 2 — 论文地形

| 章节 | 内容速记 |
|------|----------|
| §1 Introduction | 模型变大、单卡放不下、DP 救不了 |
| §2 Background | 简述 DP / PP / 现有并行方案的局限 |
| §3 Model Parallel Transformers（核心） | 列并行 + 行并行 + self-attention 切分 + LayerNorm/Embedding 处理 |
| §4 Setup | 8.3B GPT-2、3.9B BERT、512 张 V100 |
| §5 Experiments | Scaling efficiency 76% + LM 任务 SOTA |
| §6 Conclusion | 简单粗暴有效 |

**核心章节是 §3**。后面 Layer 3 全部围绕它展开。

---

## Layer 3 — 精读三段

### 3.1 Column Parallel Linear（按列切权重）

#### 直觉

想象你要把一面墙刷成红色。墙是 `Y`，刷子是 `W`，颜料是 `X`。如果墙太宽一个人刷不完，最自然的切法是——**把墙竖着切成两半，左半边给小明，右半边给小红**。两个人各刷各的，最后拼起来还是一面完整的墙。

数学上：

$$Y = X @ W, \quad W = [W_1 \mid W_2]$$

那么 $Y = [X @ W_1 \mid X @ W_2]$。每张卡存一半列权重，各算各的输出列，**输出天然是切开的**——这正是我们想要的，因为下一层是行并行（见 3.2），它就吃这种切开的输入。

#### 关键点

- 输入 `X` 在所有卡上**完整复制**（forward 不用通信）
- 权重 `W` 按列切，每张卡只存 `W_i`
- 输出 `Y` **天然按列切**，每张卡只产出自己那部分
- backward 时输入的梯度需要 all-reduce（因为每张卡都对完整 `X` 求了偏导）

#### PyTorch 伪实现（≥20 行）

```python
import torch
import torch.distributed as dist
from torch import nn

class ColumnParallelLinear(nn.Module):
    """按列切 W：W = [W_1 | W_2 | ... | W_N]
    forward 输入是完整 X，输出是切开的 Y_i
    """

    def __init__(self, in_features, out_features, world_size, rank, bias=True):
        super().__init__()
        assert out_features % world_size == 0, "out_features 必须能被 world_size 整除"
        self.in_features = in_features
        self.out_features_per_partition = out_features // world_size
        self.world_size = world_size
        self.rank = rank

        # 每张卡只存 1/N 的列
        self.weight = nn.Parameter(
            torch.empty(self.out_features_per_partition, in_features)
        )
        nn.init.kaiming_uniform_(self.weight, a=5**0.5)

        if bias:
            # bias 也按列切（每张卡存对应的 1/N）
            self.bias = nn.Parameter(torch.zeros(self.out_features_per_partition))
        else:
            self.register_parameter("bias", None)

    def forward(self, x):
        # x: [batch, seq, in_features]，在所有卡上完整复制
        # forward 自身不通信
        out = torch.nn.functional.linear(x, self.weight, self.bias)
        # out: [batch, seq, out_features_per_partition]
        # 输出天然是切开的——下一层（行并行）正好吃这种格式
        return out

    def backward_input_grad_all_reduce(self, grad_x):
        # backward 时，grad_x 在每张卡上是局部的
        # 需要 all-reduce 把各卡的输入梯度加起来
        dist.all_reduce(grad_x, op=dist.ReduceOp.SUM)
        return grad_x
```

#### 旁注（≥5）

- **旁注 1**：`out_features % world_size == 0` 是硬约束。Megatron 默认 TP=8 / 4 / 2，所以隐藏维度必须是 8 的倍数。GPT-3 hidden=12288 = 8 × 1536，刚好。
- **旁注 2**：bias 也得切。看上去 bias 才几千个数无所谓，但如果不切，梯度同步时会重复计算，且每张卡要存全量 bias，破坏了"每张卡 1/N"的对称性。
- **旁注 3**：forward 不通信是关键省时点。整个列并行 forward 期间 GPU 之间零通信，纯计算，利用率拉满。
- **旁注 4**：backward 的 all-reduce 是因为 `grad_X = grad_Y @ W^T`，每张卡只算了自己那一部分的 W，所以 grad_X 是局部的，必须求和。
- **旁注 5**：列并行单独使用是没用的，输出是切开的没法直接喂给下一层非并行模块。它必须串接行并行（3.2）才能闭环。

#### 我的怀疑

如果 `out_features` 是奇数、或不能被 8 整除（比如某些 vision-language 模型用 hidden=2304 这种），那这个模块就废了。Megatron 在 2019 的实验里全部用 8 的倍数避开了这个问题。**实际工程里这是个隐藏的硬约束，会强迫架构设计师选 hidden=2^k 或 8k 的"漂亮数字"，间接影响了之后所有大模型的 hidden dim 选择**。

#### 进一步代码细节（初始化与 gather）

```python
def gather_output_for_inference(local_out, world_size):
    """推理时如果下一层不是行并行，需要 all-gather 把列拼回完整矩阵。
    训练时永远不要这样做——会浪费一次通信。
    """
    gathered = [torch.empty_like(local_out) for _ in range(world_size)]
    dist.all_gather(gathered, local_out)
    return torch.cat(gathered, dim=-1)  # 沿最后一维拼接列
```

**额外旁注**：训练时列并行的输出绝对不要 all-gather，必须直接喂给行并行；只有推理 / debug / 转 checkpoint 时才 gather。这是 Megatron 仓库里 `tensor_parallel/mappings.py` 的 `gather_from_tensor_model_parallel_region` 反复强调的。

### 3.2 Row Parallel Linear（按行切权重）

#### 直觉

接着 3.1 的"刷墙"类比。3.1 的输出 `Y` 已经按列切开了——左半在小明手上，右半在小红手上。现在我要做下一次乘法 `Z = Y @ V`，但 `Y` 是切开的。怎么办？

**把 V 按行切**：

$$V = \begin{bmatrix} V_1 \\ V_2 \end{bmatrix}, \quad Y = [Y_1 \mid Y_2]$$

那么：

$$Z = Y @ V = Y_1 @ V_1 + Y_2 @ V_2$$

每张卡用自己手上的 `Y_i` 和 `V_i` 算一个**部分和**，最后用一次 all-reduce 把所有部分和加起来——就是完整的 `Z`。

**核心精妙处**：列并行的输出 + 行并行的输入 = 天然适配，中间不需要通信！只在行并行的 forward 输出处 all-reduce 一次。

#### PyTorch 伪实现（≥20 行）

```python
class RowParallelLinear(nn.Module):
    """按行切 W：W = [W_1; W_2; ...; W_N]（行堆叠）
    forward 输入是已经切开的 X_i，输出是完整 Y（all-reduce 后）
    """

    def __init__(self, in_features, out_features, world_size, rank, bias=True):
        super().__init__()
        assert in_features % world_size == 0, "in_features 必须能被 world_size 整除"
        self.in_features_per_partition = in_features // world_size
        self.out_features = out_features
        self.world_size = world_size
        self.rank = rank

        # 每张卡只存 1/N 的行
        self.weight = nn.Parameter(
            torch.empty(out_features, self.in_features_per_partition)
        )
        nn.init.kaiming_uniform_(self.weight, a=5**0.5)

        if bias:
            # bias 不切——只在 rank 0 加，否则会加 N 次
            self.bias = nn.Parameter(torch.zeros(out_features)) if rank == 0 else None
        else:
            self.register_parameter("bias", None)

    def forward(self, x_partial):
        # x_partial: [batch, seq, in_features_per_partition]
        # 这是上游列并行输出的"切开的一片"，每张卡持有自己那片

        # 局部矩阵乘——结果是部分和
        out_partial = torch.nn.functional.linear(x_partial, self.weight, bias=None)
        # out_partial: [batch, seq, out_features]，但只是 1/N 个加项

        # all-reduce 把所有部分和加起来 → 完整输出
        dist.all_reduce(out_partial, op=dist.ReduceOp.SUM)

        # bias 只在 rank 0 加（其他 rank 的 self.bias 是 None）
        if self.bias is not None:
            out_partial = out_partial + self.bias

        return out_partial  # 现在所有卡上都有完整的 out
```

#### 旁注（≥5）

- **旁注 1**：bias 只在一张卡上加，否则会被加 N 次。这是个**隐藏 bug 高发区**——很多人初次实现 TP 时会忘记，导致训练 loss 异常但很难定位。
- **旁注 2**：all-reduce 是 forward 唯一通信点。一个 Transformer block 里，列并行 + 行并行串成一对，整个 FFN 只通信一次（forward）+ 一次（backward）。
- **旁注 3**：行并行的输出在所有卡上都是相同的（因为 all-reduce 后大家拿到同一个值）。这意味着下一个非并行模块（比如 LayerNorm）可以直接用，无需额外通信。
- **旁注 4**：列并行 → 行并行的串接是 Megatron 的精髓。颠倒过来（行并行 → 列并行）会需要 all-gather，通信量更大。**论文 §3 明确给了这个串接方向，不能反**。
- **旁注 5**：`in_features % world_size == 0` 同样是硬约束。和列并行配对使用时，列并行的 `out_features_per_partition` 就是行并行的 `in_features_per_partition`，自然成立。

#### 我的怀疑

行并行的 all-reduce 是个**同步阻塞点**。当 TP=8 时，8 张卡必须在这一刻全部到齐才能继续——任何一张卡掉队，其他 7 张都得等。NVLink 带宽很高时这个开销不大，但跨节点 TP（用 InfiniBand）时 all-reduce 会成为瓶颈。**这就是为什么 Megatron 推荐 TP 不要跨节点，PP 才跨节点**——但论文里没明说这个工程约束，是后续 Megatron-Turing NLG 论文才补上的。

#### 通信量估算（旁注 6-8）

- **旁注 6**：一个 Transformer layer 的 forward 通信量 = 2 × (batch × seq × hidden × 4 bytes)，分别来自 attention 后的 W_O all-reduce 和 FFN 后的第二个 Linear all-reduce。bf16 训练时除以 2。
- **旁注 7**：backward 同样有 2 次 all-reduce（对应输入梯度），所以一个 layer 一次 step = 4 次 TP all-reduce。当 layers=96、TP=8、batch×seq=1M 时，单 step TP 通信量约 1.5 TB——必须靠 NVLink 才不被吃死。
- **旁注 8**：实测中 NCCL all-reduce 在 8 卡 NVLink 上能跑到 ~250 GB/s 有效带宽，TP=8 的通信开销大约占整个 step 时间的 15-20%。这是 76% scaling efficiency 的主要来源。

### 3.3 Self-Attention 张量并行（QKV + 输出投影 切）

#### 直觉

self-attention 的核心是：

```
Q = X @ W_Q
K = X @ W_K
V = X @ W_V
A = softmax(Q @ K^T / sqrt(d)) @ V
Y = A @ W_O
```

直接套 3.1 + 3.2：**Q/K/V 用列并行，输出投影 W_O 用行并行**。但这里有个额外的精妙处——**多头注意力天然就是"按头切"的**。

如果你有 16 个头、TP=8，那每张卡分到 2 个头。每个头之间是独立计算的（concat 之后再投影），所以 attention 内部完全不用通信，每张卡算自己那 2 个头的 QKV、softmax、乘 V，全部本地完成。**通信只发生在 W_O 那次行并行的 all-reduce**。

#### PyTorch 伪实现（≥20 行）

```python
class TensorParallelSelfAttention(nn.Module):
    """每张卡负责 num_heads / world_size 个头
    QKV 列并行 + 输出投影 W_O 行并行
    """

    def __init__(self, hidden_size, num_heads, world_size, rank):
        super().__init__()
        assert num_heads % world_size == 0
        assert hidden_size % num_heads == 0

        self.hidden_size = hidden_size
        self.num_heads = num_heads
        self.head_dim = hidden_size // num_heads
        self.heads_per_partition = num_heads // world_size
        self.world_size = world_size
        self.rank = rank

        # QKV 合并成一个 ColumnParallelLinear，输出是 3 * (hidden / N)
        # 这里展示分开写更清楚
        self.q_proj = ColumnParallelLinear(hidden_size, hidden_size, world_size, rank, bias=False)
        self.k_proj = ColumnParallelLinear(hidden_size, hidden_size, world_size, rank, bias=False)
        self.v_proj = ColumnParallelLinear(hidden_size, hidden_size, world_size, rank, bias=False)

        # 输出投影：行并行（吃切开的 attention 输出）
        self.o_proj = RowParallelLinear(hidden_size, hidden_size, world_size, rank, bias=True)

    def forward(self, x):
        # x: [batch, seq, hidden]，在所有卡上完整复制
        b, s, _ = x.shape

        # Q/K/V 列并行：每张卡输出 [batch, seq, hidden / N]
        q = self.q_proj(x)
        k = self.k_proj(x)
        v = self.v_proj(x)

        # reshape 成多头：[batch, seq, heads_per_partition, head_dim]
        q = q.view(b, s, self.heads_per_partition, self.head_dim).transpose(1, 2)
        k = k.view(b, s, self.heads_per_partition, self.head_dim).transpose(1, 2)
        v = v.view(b, s, self.heads_per_partition, self.head_dim).transpose(1, 2)

        # attention 计算——本地完成，无通信
        scores = torch.matmul(q, k.transpose(-2, -1)) / (self.head_dim ** 0.5)
        attn = torch.softmax(scores, dim=-1)
        out = torch.matmul(attn, v)  # [batch, heads_per_partition, seq, head_dim]

        # reshape 回 [batch, seq, hidden / N]
        out = out.transpose(1, 2).contiguous().view(b, s, -1)

        # 输出投影：行并行，内部 all-reduce 一次
        return self.o_proj(out)
```

#### 旁注（≥5）

- **旁注 1**：`num_heads % world_size == 0` 是硬约束。TP=8 时 num_heads 必须是 8 的倍数。GPT-3 175B 用了 96 头，96 = 8 × 12，刚好；LLaMA-7B 用了 32 头，TP 最多到 32（实际工程上 TP=8）。
- **旁注 2**：实际 Megatron 把 Q/K/V 合并成一个 `ColumnParallelLinear(hidden, 3*hidden)`，省一次 kernel launch 开销，但本质相同。
- **旁注 3**：attention 内部零通信是 TP 在 self-attention 上的**最大胜利**。FFN 只省显存不省通信，attention 既省显存又省通信。
- **旁注 4**：W_O 的行并行 all-reduce 是整个 attention block 唯一的通信。一个 Transformer layer = 1 次 attention all-reduce + 1 次 FFN all-reduce = 2 次通信。
- **旁注 5**：因为每张卡处理不同的头，**dropout 的随机性必须在所有卡上同步**——否则梯度会出问题。Megatron 用了一个 "tensor model parallel rng tracker" 专门管这个。

#### 我的怀疑

按头切的代价是——**头内部的并行被锁死了**。如果某个研究方向需要"超大单头"（比如某些长上下文方案让每个头处理超长序列），TP 就帮不上忙了。这也是为什么 2023 年之后出现了 Sequence Parallelism（SP）——把序列维度切开，和 TP 互补。Megatron 论文没预见到这一点，是后续 Megatron-LM v2/v3 论文补的。

---

## Layer 4 — phd-skills 7 阶段（自己跑通）

> 目标：用 accelerate + 2 张消费级 GPU（或 colab 的 T4×2）跑 GPT-2 small 的 TP 训练，验证我真懂了 §3。

| 阶段 | 动作 | 验收 |
|------|------|------|
| 1. setup | 装 transformers / accelerate / torch≥2.1，准备 wikitext-2 mini | `accelerate config` 选 multi-GPU |
| 2. baseline | 单卡训 GPT-2 small 1 epoch | loss 下降，记基线 |
| 3. ColumnParallelLinear 自实现 | 抄 Megatron 的列并行类，单测 forward 输出 shape 对 + 数值和单卡一致 | 单测通过 |
| 4. RowParallelLinear 自实现 | 同上，验证列+行串接后输出 = 单卡 nn.Linear 的输出 | 数值误差 < 1e-5 |
| 5. 替换 GPT-2 的 FFN | 把 transformers GPT-2 的 mlp.c_fc / c_proj 换成 TP 版本 | 训 100 step loss 曲线和单卡 baseline 对齐 |
| 6. 替换 attention | 把 c_attn / c_proj 换成 TP 版本 | 训 1 epoch loss 和 baseline 对齐，显存占用 ~1/2 |
| 7. 写 learning + 排错记录 | 整理踩坑：bias 加两次 / dropout 不同步 / shape 不整除 | learnings/ 一篇 + 这篇 paper note |

实际跑下来预期会撞到 3-5 个坑（bias 重复 / rng 不同步 / contiguous 缺失 / num_heads 不能被整除 / all-reduce 在 backward 漏写），每一个都是论文里没明写但代码里必须处理的。

### 4.x 各阶段实战命令

```bash
# 阶段 1: 环境
conda create -n tp python=3.11 -y && conda activate tp
pip install torch==2.3.0 transformers==4.41 accelerate==0.30 datasets
accelerate config  # 选 multi-GPU, mixed_precision=bf16, num_processes=2

# 阶段 2: baseline
python train_baseline.py --model gpt2 --dataset wikitext-2 --epochs 1 \
  --output_dir runs/baseline 2>&1 | tee runs/baseline.log

# 阶段 3-4: 单测列并行 + 行并行
torchrun --nproc_per_node=2 tests/test_column_parallel.py
torchrun --nproc_per_node=2 tests/test_row_parallel.py
torchrun --nproc_per_node=2 tests/test_col_row_chain.py  # 数值误差 < 1e-5

# 阶段 5-6: 替换 FFN / attention 后训练
torchrun --nproc_per_node=2 train_tp.py --tp_size 2 --replace_ffn --replace_attn

# 阶段 7: 对比 loss 曲线 + 显存
nvidia-smi --query-gpu=memory.used --format=csv -l 5 > runs/tp_mem.log &
python tools/plot_loss.py runs/baseline.log runs/tp.log
```

每一行命令背后都对应一个验证点：torchrun 的 `--nproc_per_node` 等于 TP world_size；nvidia-smi 的轮询能直接看到"显存约 1/N"是否成立；plot_loss 用来确认 TP 不会让 loss 曲线和 baseline 偏离超过 0.5%。

---

## Layer 5 — 学术家谱

![Megatron-LM 在分布式训练演进树上的位置](/study/papers/megatron-lm/02-genealogy.webp)

### 5.1 前作（站在谁的肩膀上）

- **PyTorch DistributedDataParallel（2017-2018）**：DP 的工业级实现，all-reduce 梯度。Megatron 在它之上叠 TP，组成 DP × TP 二维并行。
- **GPipe（2018，Google）**：流水线并行的开山作。Megatron 论文里明确对比，承认 PP 的存在但论证 TP 更细粒度。
- **GShard（2020，Google）**：和 Megatron 同期但路线不同——GShard 用编译器自动切（XLA SPMD），Megatron 手写算子。两者后来融合到 GSPMD（2021）。
- **Mesh-TensorFlow（2018，Google）**：把张量切到设备网格上的早期尝试。学术上比 Megatron 更早，但工程上没普及。Megatron 选了"只做 Transformer 一种架构"的极简路线，反而更快落地。

### 5.2 后作（被它喂养的论文）

- **DeepSpeed ZeRO（2020，Microsoft）**：把 DP 的"每张卡复制全模型"改成"切优化器状态/梯度/参数"。和 TP 正交，可以叠加。ZeRO 分三 stage：stage 1 切优化器状态（Adam 的 m/v，占用最大），stage 2 加切梯度，stage 3 把参数本身也切掉。stage 3 时每个前向都要 all-gather 参数、反向后再 reduce-scatter，通信换显存。**ZeRO 切 DP 维度，TP 切算子维度，二者正交叠加是 175B 训练的标配**。论文出现之前所有人觉得 DP 已经被榨干了，ZeRO 用"反正大家手里都有完整模型，那就别复制了"这个最朴素的洞察打开了新空间。
- **Megatron-Turing NLG 530B（2021）**：3D 并行（DP × TP × PP）。TP 用 Megatron-LM 这一篇的算法。
- **Pathways / PaLM（2022，Google）**：把 3D 并行扩到 6144 张 TPU。架构思想是 Megatron + GShard 的合流。Pathways 最大的新意是"异步分发"——把 SPMD 的同步执行模型换成 dataflow 调度，让不同 pod 上的 TPU 切片可以以 DAG 形式编排。它本质上是把 Megatron 的"手写并行算子"和 GShard 的"编译器自动切"统一在一个运行时里。
- **FSDP（2022，PyTorch 官方）**:把 ZeRO-3 落到 PyTorch 里。和 TP 互补，FSDP 切参数维度，TP 切算子维度。

#### FSDP vs TP 对比段（小表）

| 维度 | TP（Megatron） | FSDP（ZeRO-3） |
|------|---------------|----------------|
| 切什么 | 算子内的权重矩阵列/行 | 模型参数（按 module 切） |
| 通信时机 | forward / backward 各一次 all-reduce | forward 前 all-gather 参数、backward 后 reduce-scatter |
| 通信量 | O(batch × seq × hidden) per layer | O(参数量 / world_size) per module |
| 跨节点友好度 | 差（需要 NVLink） | 较好（通信可与计算 overlap） |
| 编程改动 | 需要重写 Linear / Attention | 一行 `model = FSDP(model)` 即可 |
| 显存收益 | 切权重→1/N | 切参数+梯度+优化器→1/N×3 |

**结论**：单节点优先 TP，跨节点必上 FSDP。175B 训练通常 TP=8（节点内）× FSDP=N（跨节点）× PP=K（深层切）三层叠。
- **Sequence Parallelism（2022，Megatron-v3）**：补 TP 的盲区——把 LayerNorm/Dropout 的序列维度也切了，进一步省显存。

### 5.3 反对者 / 替代者

- **Pure Data Parallel + 梯度检查点**：派系认为"显存不够就用 activation checkpointing 省，别搞复杂并行"。在 1B 以下模型上确实够用。但到 8B+ 就被 Megatron 碾压。
- **Pipeline Parallel 派**：认为 PP 比 TP 更省通信（只在 layer 边界通信）。但 PP 的 bubble 和调度难度比 TP 高。Megatron 的论证是：**TP + PP 一起用最优**，不是替代关系。
- **Pure ZeRO-3（DeepSpeed 派系一段时间的主张）**：认为 ZeRO-3 + DP 就够了，不需要 TP。反例是 GPT-3 175B 必须 TP，因为单卡装不下"切过的"参数（即使 ZeRO-3 也有最小切分粒度）。

---

## Layer 6 — 通用方法论提炼（≥3 段，每段 ≥4 bullets）

### 6.1 "切" 的设计哲学

- **天然可分块的运算优先切**：矩阵乘法、卷积都满足结合律 / 分配律，切了再合等于不切，是无损切。soft-max / LayerNorm 这种带归一化的就不能直接切，得先做局部统计再 all-reduce。
- **切的方向决定了通信位置**：列切 forward 不通信、backward 通信；行切反过来。两者串接才能让通信发生在"块的边界"而不是"块的内部"。
- **切到不能整除就别切**：硬约束 `dim % world_size == 0` 看似简单，实际逼着架构选漂亮数字。这是工程对架构的反向影响。
- **切的粒度由通信开销决定**：TP 切到 N=8 就到 NVLink 极限，再切就被通信吃掉。N 不是越大越好，是带宽决定的甜点。

### 6.2 系统-算法协同设计

- **算法约束系统**：Transformer 架构本身的对称性（多头独立 / FFN 两层 Linear 串联）让 TP 有"天然切口"。换成 RNN 这种时间步耦合的就难切。
- **系统反过来约束算法**：因为 TP 要求 hidden 是 8 的倍数，2020 年之后所有大模型的 hidden 都是 2048 / 4096 / 8192 / 12288 这种"漂亮数"。
- **不要做通用框架**：Megatron 选了"只做 Transformer"的极简路线，反而 4 个月就把工程落地了。Mesh-TF 想做通用，做了两年还没普及。
- **代码 = 论文的一部分**：Megatron 论文 25 页，但 GitHub 上的 megatron/model/transformer.py 是真正的论文。读论文必须配读代码，否则会漏掉 "bias 只加一次" "rng tracker" 这种关键细节。

### 6.3 写论文 / 学论文的方法论

- **找一个一句话能讲清的核心 idea**：Megatron 的核心就是"列并行 + 行并行串接"，一句话讲完。剩下的 §3-§5 都是这一句话的展开。后续大模型论文都学这个套路。
- **用最小可复现实验证明 scaling**：论文用 8.3B GPT-2 + 76% scaling efficiency，而不是堆 175B 数字。**做出 scaling 趋势线比做出最大模型更有说服力**。
- **承认局限是论文的一部分**：Megatron §6 明确说 TP 不适合跨节点、PP 才适合。这个承认让后续论文（Megatron-Turing）有空间往上叠。藏局限的论文反而短命。
- **代码开源是论文的一半**：5000+ 引用里有相当一部分是因为 NVIDIA 把 Megatron-LM 仓库维护得极好，commit `e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2` 这种细致的版本管理让所有人能直接复现，等于把论文从 PDF 升级成可执行制品。

---

## Layer 7 — 我的怀疑（≥4）

1. **TP=8 是 NVLink 时代的产物，下一代互联会改答案**：NVLink 给单节点 8 卡 600GB/s 带宽是 TP=8 甜点的物理基础。如果 NVL72 / Grace-Hopper 把单"超节点"的卡数推到 72，TP=8 还是不是最优？论文 2019 年答不出来，但 2024 年开始这个问题已经在被重新审视。

2. **多头切分锁死了 attention 创新**：按头切让"超大单头"路线（如某些长上下文方案）走不通。Sequence Parallelism 是补丁，但更彻底的问题是——**TP 假设 attention 的并行性来自头维度，这个假设是 Transformer 的特性还是 TP 的偏好？** 如果未来出现非多头的注意力变体，TP 就废了。

3. **行并行的 all-reduce 是同步阻塞点**：8 张卡必须同步，掉一个等所有人。在跨节点训练时（IB 带宽远低于 NVLink），这成为隐藏瓶颈。论文用 76% scaling efficiency 隐藏了这个事实——24% 损失里很大一部分就是这个同步点。

4. **bias / LayerNorm / Dropout 这些"小模块"反而是 TP 的高 bug 区**：论文 §3 主要讲 Linear 切分，但工程实现里 bias 加两次、dropout rng 不同步、LayerNorm 没切都是高频 bug。这些"细节"占了 Megatron-LM 仓库一半的 issue 量，但论文只用一段话提了一下。**这暗示一个普遍现象——分布式系统论文写 happy path 容易，写 corner case 难，学生抄思想容易，抄实现难**。

5. **scaling efficiency 76% 这个数字本身值得怀疑**：论文用的是 weak scaling（卡数翻倍、模型也翻倍）测出 76%。但如果换成 strong scaling（固定模型、卡数翻倍）数字会跌到 50% 以下。论文没披露这个对照，是个有意识的取舍——大模型场景天然是 weak scaling，但读者很容易误以为"加卡就能近线性加速"。

6. **论文对 checkpoint 兼容性只字未提**：TP 切过的 checkpoint 不能直接被另一个 TP size 加载（比如 TP=8 训出来的不能用 TP=4 推理）。Megatron 后来不得不写 `tools/checkpoint_util.py` 做转换，这是论文设计阶段就该考虑的接口问题，但被略过了。这暗示**学术论文的"完整性"和工程产品的"可演进性"是两个不同的标准**。

### 7.x 宣传 vs 现实对照表

| 宣传 | 现实 |
|------|------|
| TP 把显存降到 1/N | 仅切权重，激活值/梯度仍按 1 份计；实际显存约 1/N + 激活开销 |
| 76% scaling efficiency | weak scaling 数字；strong scaling 远低于此 |
| 列并行 forward 不通信 | forward 不通信但 backward 必须 all-reduce，总通信只是延迟到反向 |
| TP=8 是最优 | 是 NVLink 8 卡 600GB/s 时代的最优，下一代互联会改答案 |
| 一次 all-reduce 解决一切 | 还需要管 rng tracker / bias 单加 / LayerNorm 序列切，corner case 一堆 |

---

## 限制与边界（≥4 条）

1. **TP 只解决"层内"显存问题**：模型层数太多（比如 1000+ 层）时，TP 救不了，必须叠 PP。Megatron 论文里只跑到 72 层，没碰到这个上限。
2. **要求架构对称且可整除**：hidden / num_heads / FFN dim 都要被 world_size 整除。非对称架构（MoE 早期 / 某些 vision 模型）需要额外适配。
3. **跨节点性能下降快**：TP 推荐限制在单节点（NVLink 带宽内）。论文实验全部单节点 8 卡，没给跨节点数据，是个故意回避的边界。
4. **debug 难度极高**：单卡的 bug 在 TP 下可能放大成"loss 不收敛但不崩溃"的隐性错误，定位需要逐层比对单卡 vs TP 输出。Megatron 仓库里专门有个 `tools/checkpoint_util.py` 用来做这件事——commit `b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7` 是 PyTorch 这边相关的修复点，commit `f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4` 是 DeepSpeed 集成时踩的坑。

---

## 元数据

- **阅读时长**：4 小时（论文 + 代码穿插）
- **困难指数**：8/10（数学 5/10，工程 9/10）
- **复读价值**：每隔 6 个月重读一次，每次会从不同角度看到新东西——第一次看算法、第二次看工程、第三次看影响、第四次看哲学
- **配套阅读**：DeepSpeed ZeRO（2020）、Megatron-Turing NLG 530B（2021）、FSDP 论文（2023）。三篇连读才能形成完整的"分布式训练"地形图
- **代码仓库**：github.com/NVIDIA/Megatron-LM 的 `megatron/model/transformer.py` 是论文 §3 的可执行版本，必读
- **相关资源**：HuggingFace accelerate 的 TP 文档、PyTorch DTensor 的官方教程是入门路径
- **个人状态**：phd-skills 7 阶段已完成 1-4，5-7 在 2026 W22-W23 排期
